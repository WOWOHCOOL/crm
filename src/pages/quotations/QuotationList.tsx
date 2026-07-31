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

  // PI status change (manual accounting — no auto transaction)
  const handlePiStatusChange = async (id: string, newStatus: string) => {
    const { data: pi, error: updateErr } = await supabase
      .from('quotations')
      .update({ status: newStatus })
      .eq('id', id)
      .select('quotation_no')
      .single();
    if (updateErr) { message.error(updateErr.message); return; }

    queryClient.invalidateQueries({ queryKey: ['quotations'] });
    queryClient.invalidateQueries({ queryKey: ['pi-linked-txns'] });
    message.success(newStatus === 'sent' ? 'PI 已标记为已发送' : 'PI 已撤回草稿');
    logOperation('pi', 'status_change', id, `${pi.quotation_no} → ${newStatus}`);
  };

  const piStatusMutation = useMutation({
    mutationFn: ({ id, newStatus }: { id: string; newStatus: string }) =>
      handlePiStatusChange(id, newStatus),
  });

  const deleteMutation = useApiMutation({
    mutationFn: async (id: string) => {
      const { data: q } = await supabase.from('quotations').select('quotation_no,type').eq('id', id).single();
      const { error } = await supabase.from('quotations').delete().eq('id', id);
      if (error) throw error;
      return q as { quotation_no: string; type: string } | null;
    },
    successMsg: '已删除',
    invalidateKeys: [['quotations'], ['pi-linked-txns']],
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
      title: '财务', key: 'finance', width: 80,
      render: (_: unknown, r: Quotation) => {
        const tx = linkedTxns?.[r.id];
        if (tx) {
          return (
            <Tag color="green" style={{ borderRadius: 6, cursor: 'pointer' }}
              onClick={() => navigate(`/finance?edit=${tx.id}`)}>
              <DollarOutlined /> 已记账
            </Tag>
          );
        }
        if (r.status === 'sent') {
          const desc = `PI ${r.quotation_no}${r.customer_company ? ` - ${r.customer_company}` : ''}`;
          const params = new URLSearchParams({
            add: '1',
            ref_type: 'pi',
            ref_id: r.id,
            amount: '0',
            amount_usd: '0',
            type: 'income',
            description: desc,
          });
          return (
            <Button size="small" type="primary" ghost icon={<DollarOutlined />}
              onClick={() => navigate(`/finance?${params.toString()}`)}>
              记账
            </Button>
          );
        }
        return null;
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
          {listType === 'pi' && (
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
            <Popconfirm title="确定将 PI 撤回草稿状态？"
              onConfirm={() => piStatusMutation.mutate({ id: record.id, newStatus: 'draft' })}>
              <Button size="small">撤回草稿</Button>
            </Popconfirm>
          )}
          <Popconfirm title="删除后无法恢复，确定删除此报价单？" onConfirm={() => deleteMutation.mutate(record.id)} okText="确认删除" cancelText="取消">
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
