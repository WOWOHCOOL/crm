import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Table, Button, Space, Input, message, Popconfirm, Card, Tag } from 'antd';
import { PlusOutlined, SearchOutlined, DeleteOutlined } from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '../../supabase';
import { useApiMutation } from '../../hooks/useApiMutation';
import type { Quotation, QuotationItem } from '../../types';
import { logOperation } from '../../utils/log';
import { exportExcel, exportPDF } from '../../utils/quotationExport';

export default function QuotationList({ listType }: { listType: 'quotation' | 'pi' }) {
  const [search, setSearch] = useState('');
  const navigate = useNavigate();

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

  const deleteMutation = useApiMutation({
    mutationFn: async (id: string) => {
      const { data: q } = await supabase.from('quotations').select('quotation_no,type').eq('id', id).single();
      const { error } = await supabase.from('quotations').delete().eq('id', id);
      if (error) throw error;
      return q as { quotation_no: string; type: string } | null;
    },
    successMsg: '已删除',
    invalidateKeys: [['quotations']],
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
    { title: '状态', dataIndex: 'status', key: 'status', width: 80, render: (v: string) => <Tag>{v === 'draft' ? '草稿' : '已发送'}</Tag>, onCell: () => ({ 'data-label': '状态' } as React.TdHTMLAttributes<unknown>) },
    {
      title: '操作', key: 'actions', width: 200,
      render: (_: unknown, record: Quotation) => (
        <Space size="small">
          <Button size="small" onClick={() => navigate(`/quotations/edit/${record.id}`)}>编辑</Button>
          {listType === 'quotation' && (
            <Button size="small" onClick={() => handleExport(record, 'excel')}>Excel</Button>
          )}
          <Button size="small" onClick={() => handleExport(record, 'pdf')}>PDF</Button>
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
