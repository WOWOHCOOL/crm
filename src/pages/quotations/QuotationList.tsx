import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Table, Button, Space, Input, message, Popconfirm, Card } from 'antd';
import { PlusOutlined, SearchOutlined, DeleteOutlined, EyeOutlined } from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../supabase';
import type { Quotation } from '../../types';

export default function QuotationList() {
  const [search, setSearch] = useState('');
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const { data: quotations, isLoading } = useQuery({
    queryKey: ['quotations', search],
    queryFn: async () => {
      let query = supabase.from('quotations').select('*').order('created_at', { ascending: false });
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
      message.success('报价单已删除');
    },
    onError: (error: Error) => message.error(error.message),
  });

  const columns = [
    {
      title: '报价单号', dataIndex: 'quotation_no', key: 'quotation_no', width: 200,
    },
    {
      title: '客户公司', dataIndex: 'customer_company', key: 'customer_company', width: 180,
      render: (v: string | null) => v || '-',
    },
    {
      title: '日期', dataIndex: 'created_at', key: 'created_at', width: 120,
      render: (v: string) => new Date(v).toLocaleDateString('zh-CN'),
    },
    {
      title: '状态', dataIndex: 'status', key: 'status', width: 100,
      render: (v: string) => v === 'draft' ? '草稿' : '已发送',
    },
    {
      title: '操作', key: 'actions', width: 180,
      render: (_: unknown, record: Quotation) => (
        <Space>
          <Button size="small" icon={<EyeOutlined />}
            onClick={() => navigate(`/quotations/${record.id}`)}>
            查看
          </Button>
          <Popconfirm title="确定删除此报价单？" onConfirm={() => deleteMutation.mutate(record.id)}>
            <Button size="small" danger icon={<DeleteOutlined />}>删除</Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <div>
      <Card>
        <Space style={{ marginBottom: 16, width: '100%', justifyContent: 'space-between' }}>
          <Input
            placeholder="搜索报价单号 / 客户公司"
            prefix={<SearchOutlined />}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            allowClear
            style={{ width: 300 }}
          />
          <Button type="primary" icon={<PlusOutlined />}
            onClick={() => navigate('/quotations/new')}>
            新建报价单
          </Button>
        </Space>
        <Table
          dataSource={quotations}
          columns={columns}
          rowKey="id"
          loading={isLoading}
          pagination={{ pageSize: 20, showSizeChanger: true, showTotal: (t) => `共 ${t} 条` }}
          scroll={{ x: 800 }}
        />
      </Card>
    </div>
  );
}
