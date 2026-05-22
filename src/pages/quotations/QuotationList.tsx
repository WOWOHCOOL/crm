import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Table, Button, Space, Input, message, Popconfirm, Card, Tag, Select,
} from 'antd';
import { PlusOutlined, SearchOutlined, DeleteOutlined, DollarOutlined } from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../supabase';
import { useApiMutation } from '../../hooks/useApiMutation';
import type { Quotation, QuotationItem } from '../../types';
import { logOperation } from '../../utils/log';
import { exportExcel, exportPDF } from '../../utils/quotationExport';

export default function QuotationList({ listType }: { listType: 'quotation' | 'pi' }) {
  const [search, setSearch] = useState('');
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const { data: quotations, isLoading } = useQuery({
    queryKey: ['quotations', listType, search],
    queryFn: async () => {
      let query = supabase.from('quotations').select('*').eq('type', listType).order('created_at', { ascending: false });
      if (search) {
        query = query.or(`quotation_no.ilike.%${search}%,customer_company.ilike.%${search}%`);
      }
      const { data } = await query;
      return (data ?? []) as Quotation[];
    },
    staleTime: 0,
    refetchOnMount: true,
  });

  // Fetch linked transactions for PI finance status
  const piIds = listType === 'pi' && quotations ? quotations.map(q => q.id) : [];
  const { data: linkedTxns } = useQuery({
    queryKey: ['pi-linked-txns', piIds],
    queryFn: async () => {
      const { data } = await supabase
        .from('transactions')
        .select('id, ref_id, amount')
        .eq('ref_type', 'pi')
        .in('ref_id', piIds);
      const map: Record<string, { id: string; ref_id: string | null; amount: number }> = {};
      (data ?? []).forEach((t: { id: string; ref_id: string | null; amount: number }) => { if (t.ref_id) map[t.ref_id] = t; });
      return map;
    },
    enabled: piIds.length > 0,
  });

  // PI status change + auto-create income transaction
  const handlePiStatusChange = async (id: string, newStatus: string) => {
    const { data: pi, error: updateErr } = await supabase
      .from('quotations')
      .update({ status: newStatus })
      .eq('id', id)
      .select('*, quotation_items(*)')
      .single();
    if (updateErr) { message.error(updateErr.message); return; }

    if (newStatus === 'sent') {
      // Check if transaction already exists
      const { data: existing } = await supabase
        .from('transactions')
        .select('id')
        .eq('ref_type', 'pi')
        .eq('ref_id', id)
        .maybeSingle();

      if (!existing) {
        // Find "商品销售收入" account, fallback to first income account
        const { data: accounts } = await supabase
          .from('accounts')
          .select('id')
          .eq('name', '商品销售收入')
          .limit(1);
        let accountId = accounts?.[0]?.id || null;
        if (!accountId) {
          const { data: fallback } = await supabase
            .from('accounts')
            .select('id')
            .eq('type', 'income')
            .order('created_at')
            .limit(1);
          accountId = fallback?.[0]?.id || null;
        }

        const { data: { user } } = await supabase.auth.getUser();
        // Calculate total from items
        const items = (pi.quotation_items ?? []) as QuotationItem[];
        const totalAmount = items.reduce((s, i) => s + (i.unit_price_rmb || 0) * i.quantity, 0);

        const { error: txErr } = await supabase.from('transactions').insert([{
          type: 'income',
          amount: totalAmount,
          description: `PI ${pi.quotation_no} - ${pi.customer_company || ''}`,
          date: new Date().toISOString().split('T')[0],
          customer_id: pi.customer_id,
          account_id: accountId,
          ref_type: 'pi',
          ref_id: id,
          user_id: user?.id,
        }]);
        if (txErr) console.error('Failed to create transaction:', txErr);
      }
    }

    if (newStatus === 'draft') {
      await supabase
        .from('transactions')
        .delete()
        .eq('ref_type', 'pi')
        .eq('ref_id', id);
    }

    queryClient.invalidateQueries({ queryKey: ['quotations'] });
    queryClient.invalidateQueries({ queryKey: ['pi-linked-txns'] });
    queryClient.invalidateQueries({ queryKey: ['transactions'] });
    queryClient.invalidateQueries({ queryKey: ['recent-transactions'] });
    queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] });
    message.success(newStatus === 'sent' ? 'PI 已发送，收入流水已生成' : 'PI 已撤回');
    logOperation('pi', 'status_change', id, `${pi.quotation_no} → ${newStatus}`);
  };

  const piStatusMutation = useMutation({
    mutationFn: ({ id, newStatus }: { id: string; newStatus: string }) =>
      handlePiStatusChange(id, newStatus),
  });

  const deleteMutation = useApiMutation({
    mutationFn: async (id: string) => {
      const { data: q } = await supabase.from('quotations').select('quotation_no,type').eq('id', id).single();
      // Also clean up linked transaction
      await supabase.from('transactions').delete().eq('ref_type', 'pi').eq('ref_id', id);
      const { error } = await supabase.from('quotations').delete().eq('id', id);
      if (error) throw error;
      return q as { quotation_no: string; type: string } | null;
    },
    successMsg: '已删除',
    invalidateKeys: [['quotations'], ['pi-linked-txns'], ['transactions'], ['recent-transactions'], ['dashboard-stats']],
    onSuccess: (data) => {
      logOperation(data?.type === 'pi' ? 'pi' : 'quotation', 'delete', undefined, data?.quotation_no || '');
    },
  });

  const handleExport = async (record: Quotation, format: 'excel' | 'pdf') => {
    const { data } = await supabase
      .from('quotation_items')
      .select('*')
      .eq('quotation_id', record.id)
      .order('created_at');
    const items = (data ?? []) as QuotationItem[];
    if (items.length === 0 && format === 'excel') {
      message.warning('没有可导出的产品');
      return;
    }
    if (format === 'excel') {
      exportExcel(record, items, 'USD');
      message.success('Excel 已导出');
    } else {
      exportPDF(record, items, listType, 'USD');
    }
  };

  const title = listType === 'quotation' ? '报价单' : 'PI';

  const columns = [
    { title: `${title}编号`, dataIndex: 'quotation_no', key: 'quotation_no', width: 200, onCell: () => ({ 'data-label': '编号' } as React.TdHTMLAttributes<unknown>) },
    { title: '客户公司', dataIndex: 'customer_company', key: 'customer_company', width: 180, render: (v: string | null) => v || '-', onCell: () => ({ 'data-label': '客户' } as React.TdHTMLAttributes<unknown>) },
    { title: '日期', dataIndex: 'created_at', key: 'created_at', width: 120, render: (v: string) => new Date(v).toLocaleDateString('zh-CN'), onCell: () => ({ 'data-label': '日期' } as React.TdHTMLAttributes<unknown>) },
    { title: '状态', dataIndex: 'status', key: 'status', width: 80, render: (v: string) => <Tag color={v === 'sent' ? 'green' : 'default'}>{v === 'draft' ? '草稿' : '已发送'}</Tag>, onCell: () => ({ 'data-label': '状态' } as React.TdHTMLAttributes<unknown>) },
    ...(listType === 'pi' ? [{
      title: '财务', key: 'finance', width: 60,
      render: (_: unknown, r: Quotation) => {
        const tx = linkedTxns?.[r.id];
        return tx ? (
          <Tag color="green" style={{ borderRadius: 6 }}><DollarOutlined /> 已记账</Tag>
        ) : r.status === 'sent' ? (
          <Tag color="orange" style={{ borderRadius: 6 }}><DollarOutlined /> 待记账</Tag>
        ) : null;
      },
    }] : []),
    {
      title: '操作', key: 'actions', width: 280,
      render: (_: unknown, record: Quotation) => (
        <Space size="small" wrap>
          <Button size="small" onClick={() => navigate(`/quotations/edit/${record.id}`)}>编辑</Button>
          {listType === 'quotation' && (
            <Button size="small" onClick={() => handleExport(record, 'excel')}>Excel</Button>
          )}
          <Button size="small" onClick={() => handleExport(record, 'pdf')}>PDF</Button>
          {listType === 'pi' && record.status === 'draft' && (
            <Button size="small" type="primary"
              loading={piStatusMutation.isPending}
              onClick={() => piStatusMutation.mutate({ id: record.id, newStatus: 'sent' })}>
              标记已发送
            </Button>
          )}
          {listType === 'pi' && record.status === 'sent' && (
            <Popconfirm title="撤回后将删除关联收入流水，确定吗？"
              onConfirm={() => piStatusMutation.mutate({ id: record.id, newStatus: 'draft' })}>
              <Button size="small">撤回草稿</Button>
            </Popconfirm>
          )}
          <Popconfirm title="确定删除？" onConfirm={() => deleteMutation.mutate(record.id)}>
            <Button size="small" danger><DeleteOutlined />删除</Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <div>
      <Card>
        <Space style={{ marginBottom: 16, width: '100%', justifyContent: 'space-between' }} wrap>
          <Input
            placeholder={`搜索${title}编号 / 客户公司`}
            prefix={<SearchOutlined />}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            allowClear
            style={{ maxWidth: 300, width: '100%' }}
          />
          <Button type="primary" icon={<PlusOutlined />}
            onClick={() => navigate(`/quotations/new?type=${listType}`)}>
            新建{title}
          </Button>
        </Space>
        <Table
          dataSource={quotations}
          columns={columns}
          rowKey="id"
          loading={isLoading}
          pagination={{ pageSize: 20, showSizeChanger: true, showTotal: (t) => `共 ${t} 条` }}
          scroll={{ x: 900 }}
        />
      </Card>
    </div>
  );
}
