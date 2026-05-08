import { useNavigate } from 'react-router-dom';
import { Card, Col, Row, Statistic, Table, Spin, Tag, Space, Typography, Progress } from 'antd';
import {
  DollarOutlined,
  ArrowUpOutlined,
  ArrowDownOutlined,
  TeamOutlined,
  ShoppingOutlined,
  BellOutlined,
  WarningOutlined,
  CheckCircleOutlined,
  FileTextOutlined,
  ShoppingCartOutlined,
  CustomerServiceOutlined,
} from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '../supabase';
import { useAuth } from '../auth/AuthContext';
import dayjs from 'dayjs';

const cardStyle = {
  borderRadius: 10,
  border: 'none',
  boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
  transition: 'all 0.3s',
  cursor: 'pointer',
};

export default function Dashboard() {
  const navigate = useNavigate();
  const { isOwner, isAdmin } = useAuth();
  const canViewFinance = isOwner || isAdmin;

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
        { data: orderData },
      ] = await Promise.all([
        supabase.from('transactions').select('amount').eq('type', 'income').gte('date', firstDay).lte('date', lastDay),
        supabase.from('transactions').select('amount').eq('type', 'expense').gte('date', firstDay).lte('date', lastDay),
        supabase.from('customers').select('*', { count: 'exact', head: true }),
        supabase.from('products').select('*', { count: 'exact', head: true }),
        supabase.from('orders').select('status'),
      ]);

      const totalIncome = income?.reduce((sum, t) => sum + Number(t.amount), 0) ?? 0;
      const totalExpense = expense?.reduce((sum, t) => sum + Number(t.amount), 0) ?? 0;
      const pendingOrders = orderData?.filter(o => o.status !== 'completed' && o.status !== 'cancelled').length ?? 0;

      return {
        totalIncome, totalExpense, balance: totalIncome - totalExpense,
        customerCount: customerCount ?? 0, productCount: productCount ?? 0,
        pendingOrders,
      };
    },
  });

  const { data: tasksData } = useQuery({
    queryKey: ['dashboard-tasks'],
    queryFn: async () => {
      const today = dayjs().format('YYYY-MM-DD');
      const { data } = await supabase
        .from('tasks')
        .select('id, title, due_date, priority, status')
        .in('status', ['pending'])
        .order('due_date', { ascending: true });
      if (!data) return { overdue: 0, today: 0, upcoming: 0 };
      const overdue = data.filter(t => t.due_date && t.due_date < today).length;
      const todayTasks = data.filter(t => t.due_date === today).length;
      const upcoming = data.filter(t => t.due_date && t.due_date > today && dayjs(t.due_date).diff(dayjs(), 'day') <= 3).length;
      return { overdue, today: todayTasks, upcoming };
    },
  });

  const totalPending = (tasksData?.overdue || 0) + (tasksData?.today || 0) + (tasksData?.upcoming || 0);

  const { data: recentTransactions, isLoading: txLoading } = useQuery({
    queryKey: ['recent-transactions'],
    queryFn: async () => {
      const { data } = await supabase
        .from('transactions')
        .select('*, customers(name), accounts(name)')
        .order('date', { ascending: false })
        .limit(8);
      return data ?? [];
    },
  });

  const txColumns = [
    { title: '日期', dataIndex: 'date', key: 'date', width: 90 },
    { title: '类型', dataIndex: 'type', key: 'type', width: 55,
      render: (v: string) => <Tag color={v === 'income' ? 'green' : 'red'} style={{ borderRadius: 8 }}>{v === 'income' ? '收入' : '支出'}</Tag> },
    { title: '金额', dataIndex: 'amount', key: 'amount', width: 100, render: (v: number) => <span style={{ fontWeight: 500 }}>¥{v.toFixed(2)}</span> },
    { title: '科目', key: 'account', width: 80, render: (_: unknown, r: Record<string, unknown>) => (r.accounts as Record<string, string> | null)?.name ?? '-' },
  ];

  const statCards = [
    { icon: <ArrowUpOutlined />, color: '#52c41a', bg: '#f6ffed', title: '本月收入', value: stats?.totalIncome ?? 0, suffix: '元', link: '/finance' },
    { icon: <ArrowDownOutlined />, color: '#ff4d4f', bg: '#fff2f0', title: '本月支出', value: stats?.totalExpense ?? 0, suffix: '元', link: '/finance' },
    { icon: <DollarOutlined />, color: '#1677ff', bg: '#f0f5ff', title: '本月结余', value: stats?.balance ?? 0, suffix: '元', link: '/reports' },
    { icon: <TeamOutlined />, color: '#722ed1', bg: '#f9f0ff', title: '客户总数', value: stats?.customerCount ?? 0, suffix: '人', link: '/customers' },
    { icon: <ShoppingOutlined />, color: '#13c2c2', bg: '#e6fffb', title: '商品总数', value: stats?.productCount ?? 0, suffix: '个', link: '/products' },
    { icon: <ShoppingCartOutlined />, color: '#fa8c16', bg: '#fff7e6', title: '进行中订单', value: stats?.pendingOrders ?? 0, suffix: '单', link: '/orders' },
  ];

  const quickActions = [
    { icon: <FileTextOutlined />, label: '新建报价单', color: '#1677ff', bg: '#f0f5ff', link: '/quotations/new?type=quotation' },
    { icon: <FileTextOutlined />, label: '新建PI', color: '#722ed1', bg: '#f9f0ff', link: '/quotations/new?type=pi' },
    { icon: <CustomerServiceOutlined />, label: '添加客户', color: '#52c41a', bg: '#f6ffed', link: '/customers' },
    { icon: <BellOutlined />, label: '新建任务', color: '#fa8c16', bg: '#fff7e6', link: '/tasks' },
  ];

  return (
    <div>
      <Typography.Title level={4} style={{ marginBottom: 16, fontWeight: 600 }}>
        欢迎回来
        <span style={{ fontSize: 14, fontWeight: 400, color: '#999', marginLeft: 12 }}>
          {dayjs().format('YYYY年M月D日 dddd')}
        </span>
      </Typography.Title>

      {canViewFinance && (
        <Row gutter={[12, 12]}>
          {statCards.map((card, i) => (
            <Col xs={12} sm={8} lg={4} key={i}>
              <Card hoverable size="small" style={cardStyle} onClick={() => navigate(card.link)}
                bodyStyle={{ padding: '14px 16px' }}>
                <Space align="start" style={{ width: '100%', justifyContent: 'space-between' }}>
                  <div>
                    <div style={{ fontSize: 12, color: '#999', marginBottom: 4 }}>{card.title}</div>
                    <Statistic value={card.value} precision={card.title.includes('率') ? 1 : 0}
                      suffix={card.suffix} valueStyle={{ fontSize: 18, fontWeight: 600 }}
                      loading={isLoading} />
                  </div>
                  <div style={{
                    width: 36, height: 36, borderRadius: 8, display: 'flex',
                    alignItems: 'center', justifyContent: 'center',
                    background: card.bg, color: card.color, fontSize: 18,
                  }}>
                    {card.icon}
                  </div>
                </Space>
              </Card>
            </Col>
          ))}
        </Row>
      )}

      {/* Middle Row: Tasks + Quick Actions */}
      <Row gutter={12} style={{ marginTop: 16 }}>
        <Col xs={24} lg={8}>
          <Card size="small" style={cardStyle}
            bodyStyle={{ padding: '16px' }}
            title={<Space><BellOutlined style={{ color: '#fa8c16' }} /><span style={{ fontSize: 14, fontWeight: 500 }}>待办任务</span></Space>}
            extra={<a onClick={() => navigate('/tasks')} style={{ fontSize: 12 }}>查看全部</a>}>
            {tasksData ? (
              <Space direction="vertical" style={{ width: '100%' }} size={8}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span><WarningOutlined style={{ color: '#ff4d4f', marginRight: 6 }} />已逾期</span>
                  <Tag color="red" style={{ borderRadius: 6, minWidth: 28, textAlign: 'center' }}>{tasksData.overdue}</Tag>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span><BellOutlined style={{ color: '#faad14', marginRight: 6 }} />今日截止</span>
                  <Tag color="orange" style={{ borderRadius: 6, minWidth: 28, textAlign: 'center' }}>{tasksData.today}</Tag>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span><BellOutlined style={{ color: '#1677ff', marginRight: 6 }} />近3日到期</span>
                  <Tag color="blue" style={{ borderRadius: 6, minWidth: 28, textAlign: 'center' }}>{tasksData.upcoming}</Tag>
                </div>
                <Progress percent={totalPending > 0 ? Math.round((tasksData.today / totalPending) * 100) : 0}
                  size="small" strokeColor="#1677ff" format={() => `${tasksData.today}/${totalPending} 今日`} />
              </Space>
            ) : <Spin />}
          </Card>
        </Col>

        <Col xs={24} lg={16}>
          <Card size="small" style={cardStyle}
            bodyStyle={{ padding: '16px' }}
            title={<Space><DollarOutlined style={{ color: '#1677ff' }} /><span style={{ fontSize: 14, fontWeight: 500 }}>快捷操作</span></Space>}>
            <Row gutter={[12, 12]}>
              {quickActions.map((action, i) => (
                <Col xs={12} sm={6} key={i}>
                  <Card hoverable size="small" style={{ ...cardStyle, textAlign: 'center' }}
                    bodyStyle={{ padding: '16px 8px' }}
                    onClick={() => navigate(action.link)}>
                    <div style={{
                      width: 40, height: 40, borderRadius: 10, display: 'inline-flex',
                      alignItems: 'center', justifyContent: 'center',
                      background: action.bg, color: action.color, fontSize: 20, marginBottom: 8,
                    }}>
                      {action.icon}
                    </div>
                    <div style={{ fontSize: 13, color: '#333' }}>{action.label}</div>
                  </Card>
                </Col>
              ))}
            </Row>
          </Card>
        </Col>
      </Row>

      {canViewFinance && (
        <Card title={<Space><DollarOutlined style={{ color: '#52c41a' }} />最近流水</Space>}
          style={{ ...cardStyle, marginTop: 16 }}
          bodyStyle={{ padding: '12px 16px' }}
          extra={<a onClick={() => navigate('/finance')} style={{ fontSize: 12 }}>查看全部</a>}>
          {txLoading ? <Spin /> : (
            <Table dataSource={recentTransactions ?? []} columns={txColumns} rowKey="id"
              pagination={false} size="small" scroll={{ x: 400 }} />
          )}
        </Card>
      )}
    </div>
  );
}
