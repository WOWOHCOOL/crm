import { useNavigate } from 'react-router-dom';
import { Card, Col, Row, Statistic, Table, Spin } from 'antd';
import {
  DollarOutlined,
  ArrowUpOutlined,
  ArrowDownOutlined,
  TeamOutlined,
  ShoppingOutlined,
} from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '../supabase';

export default function Dashboard() {
  const navigate = useNavigate();

  const { data: stats, isLoading } = useQuery({
    queryKey: ['dashboard-stats'],
    queryFn: async () => {
      const now = new Date();
      const firstDay = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
      const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split('T')[0];

      const [
        { data: income },
        { data: expense },
        { count: customerCount },
        { count: productCount },
      ] = await Promise.all([
        supabase.from('transactions').select('amount').eq('type', 'income').gte('date', firstDay).lte('date', lastDay),
        supabase.from('transactions').select('amount').eq('type', 'expense').gte('date', firstDay).lte('date', lastDay),
        supabase.from('customers').select('*', { count: 'exact', head: true }),
        supabase.from('products').select('*', { count: 'exact', head: true }),
      ]);

      const totalIncome = income?.reduce((sum, t) => sum + Number(t.amount), 0) ?? 0;
      const totalExpense = expense?.reduce((sum, t) => sum + Number(t.amount), 0) ?? 0;

      return {
        totalIncome,
        totalExpense,
        balance: totalIncome - totalExpense,
        customerCount: customerCount ?? 0,
        productCount: productCount ?? 0,
      };
    },
  });

  const { data: recentTransactions, isLoading: txLoading } = useQuery({
    queryKey: ['recent-transactions'],
    queryFn: async () => {
      const { data } = await supabase
        .from('transactions')
        .select('*, customers(name), accounts(name)')
        .order('date', { ascending: false })
        .limit(10);
      return data ?? [];
    },
  });

  const columns = [
    { title: '日期', dataIndex: 'date', key: 'date', width: 100 },
    { title: '类型', dataIndex: 'type', key: 'type', width: 60, render: (v: string) => v === 'income' ? '收入' : '支出' },
    { title: '金额', dataIndex: 'amount', key: 'amount', width: 100, render: (v: number) => `¥${v.toFixed(2)}` },
    { title: '客户', key: 'customer', width: 80, render: (_: unknown, r: Record<string, unknown>) => (r.customers as Record<string, string> | null)?.name ?? '-' },
    { title: '科目', key: 'account', width: 80, render: (_: unknown, r: Record<string, unknown>) => (r.accounts as Record<string, string> | null)?.name ?? '-' },
    { title: '描述', dataIndex: 'description', key: 'description', ellipsis: true },
  ];

  return (
    <div>
      <Row gutter={[12, 12]}>
        <Col xs={12} sm={12} lg={5}>
          <Card hoverable onClick={() => navigate('/finance')} size="small">
            <Statistic title="本月收入" value={stats?.totalIncome ?? 0} precision={2}
              prefix={<ArrowUpOutlined style={{ color: '#52c41a', fontSize: 14 }} />}
              suffix="元" loading={isLoading} valueStyle={{ fontSize: 20 }} />
          </Card>
        </Col>
        <Col xs={12} sm={12} lg={5}>
          <Card hoverable onClick={() => navigate('/finance')} size="small">
            <Statistic title="本月支出" value={stats?.totalExpense ?? 0} precision={2}
              prefix={<ArrowDownOutlined style={{ color: '#ff4d4f', fontSize: 14 }} />}
              suffix="元" loading={isLoading} valueStyle={{ fontSize: 20 }} />
          </Card>
        </Col>
        <Col xs={12} sm={12} lg={5}>
          <Card hoverable onClick={() => navigate('/reports')} size="small">
            <Statistic title="本月结余" value={stats?.balance ?? 0} precision={2}
              prefix={<DollarOutlined style={{ fontSize: 14 }} />}
              suffix="元" loading={isLoading} valueStyle={{ fontSize: 20 }} />
          </Card>
        </Col>
        <Col xs={12} sm={12} lg={4}>
          <Card hoverable onClick={() => navigate('/customers')} size="small">
            <Statistic title="客户" value={stats?.customerCount ?? 0}
              prefix={<TeamOutlined style={{ fontSize: 14 }} />}
              loading={isLoading} valueStyle={{ fontSize: 20 }} />
          </Card>
        </Col>
        <Col xs={12} sm={12} lg={5}>
          <Card hoverable onClick={() => navigate('/products')} size="small">
            <Statistic title="商品" value={stats?.productCount ?? 0}
              prefix={<ShoppingOutlined style={{ fontSize: 14 }} />}
              loading={isLoading} valueStyle={{ fontSize: 20 }} />
          </Card>
        </Col>
      </Row>

      <Card title="最近流水" style={{ marginTop: 16 }}
        extra={<a onClick={() => navigate('/finance')}>查看全部</a>}>
        {txLoading ? <Spin /> : (
          <Table dataSource={recentTransactions ?? []} columns={columns} rowKey="id"
            pagination={false} size="small" scroll={{ x: 600 }} />
        )}
      </Card>
    </div>
  );
}
