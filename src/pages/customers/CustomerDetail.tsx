import { useParams, useNavigate } from 'react-router-dom';
import { Card, Descriptions, Table, Button, Space, Spin } from 'antd';
import { ArrowLeftOutlined } from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '../../supabase';

export default function CustomerDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const { data: customer, isLoading } = useQuery({
    queryKey: ['customer', id],
    queryFn: async () => {
      const { data } = await supabase.from('customers').select('*').eq('id', id).single();
      return data;
    },
    enabled: !!id,
  });

  const { data: transactions } = useQuery({
    queryKey: ['customer-transactions', id],
    queryFn: async () => {
      const { data } = await supabase
        .from('transactions')
        .select('*, accounts(name)')
        .eq('customer_id', id)
        .order('date', { ascending: false });
      return data ?? [];
    },
    enabled: !!id,
  });

  if (isLoading) return <Spin />;

  const txColumns = [
    { title: '日期', dataIndex: 'date', key: 'date', width: 120 },
    { title: '类型', dataIndex: 'type', key: 'type', width: 80, render: (v: string) => v === 'income' ? '收入' : '支出' },
    { title: '金额', dataIndex: 'amount', key: 'amount', width: 120, render: (v: number) => `¥${v.toFixed(2)}` },
    { title: '科目', key: 'account', width: 100, render: (_: unknown, r: Record<string, unknown>) => (r.accounts as Record<string, string> | null)?.name ?? '-' },
    { title: '描述', dataIndex: 'description', key: 'description' },
  ];

  const totalIncome = (transactions ?? [])
    .filter((t: Record<string, unknown>) => t.type === 'income')
    .reduce((s: number, t: Record<string, unknown>) => s + Number(t.amount), 0);

  const totalExpense = (transactions ?? [])
    .filter((t: Record<string, unknown>) => t.type === 'expense')
    .reduce((s: number, t: Record<string, unknown>) => s + Number(t.amount), 0);

  return (
    <div>
      <Space style={{ marginBottom: 16 }}>
        <Button icon={<ArrowLeftOutlined />} onClick={() => navigate('/customers')}>返回</Button>
      </Space>

      <Card title="客户信息" style={{ marginBottom: 24 }}>
        <Descriptions bordered column={{ xs: 1, sm: 2 }}>
          <Descriptions.Item label="姓名">{customer?.name}</Descriptions.Item>
          <Descriptions.Item label="公司">{customer?.company ?? '-'}</Descriptions.Item>
          <Descriptions.Item label="电话">{customer?.phone ?? '-'}</Descriptions.Item>
          <Descriptions.Item label="邮箱">{customer?.email ?? '-'}</Descriptions.Item>
          <Descriptions.Item label="社交方式">{customer?.social_media ?? '-'}</Descriptions.Item>
          <Descriptions.Item label="国家">{customer?.country ?? '-'}</Descriptions.Item>
          <Descriptions.Item label="来源">{customer?.source ?? '-'}</Descriptions.Item>
          <Descriptions.Item label="地址" span={2}>{customer?.address ?? '-'}</Descriptions.Item>
          <Descriptions.Item label="备注" span={2}>{customer?.notes ?? '-'}</Descriptions.Item>
        </Descriptions>
      </Card>

      <Card title={`交易记录（收入 ¥${totalIncome.toFixed(2)} / 支出 ¥${totalExpense.toFixed(2)}）`}>
        <Table
          dataSource={transactions ?? []}
          columns={txColumns}
          rowKey="id"
          pagination={{ pageSize: 20 }}
          size="small"
        />
      </Card>
    </div>
  );
}
