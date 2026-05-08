import { useNavigate } from 'react-router-dom';
import { Card, Col, Row, Statistic, Table, Spin, Tag, Space } from 'antd';
import {
  DollarOutlined,
  ArrowUpOutlined,
  ArrowDownOutlined,
  TeamOutlined,
  ShoppingOutlined,
  BellOutlined,
  WarningOutlined,
  CheckCircleOutlined,
} from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '../supabase';
import dayjs from 'dayjs';

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

  // Task reminders
  const { data: tasksData } = useQuery({
    queryKey: ['dashboard-tasks'],
    queryFn: async () => {
      const today = dayjs().format('YYYY-MM-DD');
      const { data } = await supabase
        .from('tasks')
        .select('id, title, due_date, priority, status')
        .in('status', ['pending'])
        .order('due_date', { ascending: true });
      if (!data) return { overdue: [], today: [], upcoming: [] };
      const overdue = data.filter(t => t.due_date && t.due_date < today);
      const todayTasks = data.filter(t => t.due_date === today);
      const upcoming = data.filter(t => t.due_date && t.due_date > today && dayjs(t.due_date).diff(dayjs(), 'day') <= 3);
      return { overdue, today: todayTasks, upcoming };
    },
  });

  const priorityColors: Record<string, string> = { low: 'default', normal: 'blue', high: 'orange', urgent: 'red' };
  const priorityLabels: Record<string, string> = { low: '低', normal: '中', high: '高', urgent: '紧急' };

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

      <Row gutter={12} style={{ marginTop: 16 }}>
        <Col xs={24} lg={8}>
          <Card size="small" title={<><BellOutlined /> 待办任务</>}
            extra={<a onClick={() => navigate('/tasks')}>查看全部</a>}
            hoverable onClick={() => navigate('/tasks')}>
            <Space direction="vertical" style={{ width: '100%' }} size={4}>
              {tasksData ? <>
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0' }}>
                  <span><WarningOutlined style={{ color: '#ff4d4f' }} /> 已逾期</span>
                  <Tag color="red">{tasksData.overdue.length}</Tag>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0' }}>
                  <span><BellOutlined style={{ color: '#faad14' }} /> 今日截止</span>
                  <Tag color="orange">{tasksData.today.length}</Tag>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0' }}>
                  <span><BellOutlined style={{ color: '#1677ff' }} /> 近3日到期</span>
                  <Tag color="blue">{tasksData.upcoming.length}</Tag>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', borderTop: '1px solid #f0f0f0', marginTop: 4 }}>
                  <span><CheckCircleOutlined style={{ color: '#52c41a' }} /> 待处理总计</span>
                  <Tag>{tasksData.overdue.length + tasksData.today.length + tasksData.upcoming.length}</Tag>
                </div>
              </> : <Spin />}
            </Space>
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
