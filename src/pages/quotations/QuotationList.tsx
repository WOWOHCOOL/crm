import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Table, Button, Space, Input, message, Popconfirm, Card, Segmented, Tag } from 'antd';
import { PlusOutlined, SearchOutlined, DeleteOutlined, EditOutlined, DownloadOutlined } from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../supabase';
import type { Quotation, QuotationItem } from '../../types';
import { exportExcel, exportPDF } from '../../utils/quotationExport';

export default function QuotationList() {
  const [search, setSearch] = useState('');
  const [tab, setTab] = useState<'quotation' | 'pi'>('quotation');
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const { data: quotations, isLoading } = useQuery({
    queryKey: ['quotations', tab, search],
    queryFn: async () => {
      let query = supabase.from('quotations').select('*').eq('type', tab).order('created_at', { ascending: false });
      if (search) {
        query = query.or(`quotation_no.ilike.%${search}%,customer_company.ilike.%${search}%`);
      }
      const { data } = await query;
      return (data ?? []) as Quotation[];
    },
    staleTime: 0,
    refetchOnMount: true,
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('quotations').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['quotations'] });
      message.success('已删除');
    },
    onError: (error: Error) => message.error(error.message),
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
      exportExcel(record, items, tab, 'USD');
      message.success('Excel 已导出');
    } else {
      exportPDF(record, items, tab, 'USD');
    }
  };

  const title = tab === 'quotation' ? '报价单' : 'PI';
  const noPrefix = tab === 'quotation' ? 'QUO' : 'PI';

  const columns = [
    { title: `${title}编号`, dataIndex: 'quotation_no', key: 'quotation_no', width: 200 },
    { title: '客户公司', dataIndex: 'customer_company', key: 'customer_company', width: 180, render: (v: string | null) => v || '-' },
    { title: '日期', dataIndex: 'created_at', key: 'created_at', width: 120, render: (v: string) => new Date(v).toLocaleDateString('zh-CN') },
    { title: '状态', dataIndex: 'status', key: 'status', width: 80, render: (v: string) => <Tag>{v === 'draft' ? '草稿' : '已发送'}</Tag> },
    {
      title: '操作', key: 'actions', width: 240,
      render: (_: unknown, record: Quotation) => (
        <Space>
          <Button size="small" icon={<EditOutlined />} onClick={() => navigate(`/quotations/edit/${record.id}`)}>
            编辑
          </Button>
          <Button size="small" onClick={() => handleExport(record, 'excel')}>
            Excel
          </Button>
          <Button size="small" onClick={() => handleExport(record, 'pdf')}>
            PDF
          </Button>
          <Popconfirm title="确定删除？" onConfirm={() => deleteMutation.mutate(record.id)}>
            <Button size="small" danger icon={<DeleteOutlined />}>删除</Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <div>
      <Card>
        <Space style={{ marginBottom: 16, width: '100%', justifyContent: 'space-between' }} wrap>
          <Space>
            <Segmented
              value={tab}
              onChange={(v) => setTab(v as 'quotation' | 'pi')}
              options={[
                { label: `报价单 (QUO)`, value: 'quotation' },
                { label: `PI管理 (PI)`, value: 'pi' },
              ]}
            />
            <Input
              placeholder={`搜索${title}编号 / 客户公司`}
              prefix={<SearchOutlined />}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              allowClear
              style={{ width: 260 }}
            />
          </Space>
          <Button type="primary" icon={<PlusOutlined />}
            onClick={() => navigate(`/quotations/new?type=${tab}`)}>
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
