import { useNavigate } from 'react-router-dom';
import { Card, Col, Row, Statistic, Table, Spin } from 'antd';
import {
  DollarOutlined,
  ArrowUpOutlined,
  ArrowDownOutlined,
  TeamOutlined,
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

      const [{ data: income }, { data: expense }, { count: customerCount }] = await Promise.all([
        supabase.from('transactions').select('amount').eq('type', 'income').gte('date', firstDay).lte('date', lastDay),
        supabase.from('transactions').select('amount').eq('type', 'expense').gte('date', firstDay).lte('date', lastDay),
        supabase.from('customers').select('*', { count: 'exact', head: true }),
      ]);

      const totalIncome = income?.reduce((sum, t) => sum + Number(t.amount), 0) ?? 0;
      const totalExpense = expense?.reduce((sum, t) => sum + Number(t.amount), 0) ?? 0;

      return { totalIncome, totalExpense, balance: totalIncome - totalExpense, customerCount: customerCount ?? 0 };
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
    { title: '日期', dataIndex: 'date', key: 'date', width: 120 },
    { title: '类型', dataIndex: 'type', key: 'type', width: 80, render: (v: string) => v === 'income' ? '收入' : '支出' },
    { title: '金额', dataIndex: 'amount', key: 'amount', width: 120, render: (v: number) => `¥${v.toFixed(2)}` },
    { title: '客户', key: 'customer', width: 100, render: (_: unknown, r: Record<string, unknown>) => (r.customers as Record<string, string> | null)?.name ?? '-' },
    { title: '科目', key: 'account', width: 100, render: (_: unknown, r: Record<string, unknown>) => (r.accounts as Record<string, string> | null)?.name ?? '-' },
    { title: '描述', dataIndex: 'description', key: 'description' },
  ];

  return (
    <div>
      <Row gutter={[16, 16]}>
        <Col xs={24} sm={12} lg={6}>
          <Card hoverable onClick={() => navigate('/finance')}>
            <Statistic
              title="本月收入"
              value={stats?.totalIncome ?? 0}
              precision={2}
              prefix={<ArrowUpOutlined style={{ color: '#52c41a' }} />}
              suffix="元"
              loading={isLoading}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card hoverable onClick={() => navigate('/finance')}>
            <Statistic
              title="本月支出"
              value={stats?.totalExpense ?? 0}
              precision={2}
              prefix={<ArrowDownOutlined style={{ color: '#ff4d4f' }} />}
              suffix="元"
              loading={isLoading}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card hoverable onClick={() => navigate('/reports')}>
            <Statistic
              title="本月结余"
              value={stats?.balance ?? 0}
              precision={2}
              prefix={<DollarOutlined />}
              suffix="元"
              loading={isLoading}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card hoverable onClick={() => navigate('/customers')}>
            <Statistic
              title="客户总数"
              value={stats?.customerCount ?? 0}
              prefix={<TeamOutlined />}
              loading={isLoading}
            />
          </Card>
        </Col>
      </Row>

      <Card
        title="最近流水"
        style={{ marginTop: 24 }}
        extra={<a onClick={() => navigate('/finance')}>查看全部</a>}
      >
        {txLoading ? (
          <Spin />
        ) : (
          <Table
            dataSource={recentTransactions ?? []}
            columns={columns}
            rowKey="id"
            pagination={false}
            size="small"
          />
        )}
      </Card>
    </div>
  );
}
