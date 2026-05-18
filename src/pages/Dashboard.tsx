import { useNavigate } from 'react-router-dom';
import { Card, Col, Row, Table, Spin, Tag, Progress, Typography, Space } from 'antd';
import {
  DollarOutlined,
  ArrowUpOutlined,
  ArrowDownOutlined,
  TeamOutlined,
  ShoppingOutlined,
  BellOutlined,
  WarningOutlined,
  FileTextOutlined,
  CustomerServiceOutlined,
  ShoppingCartOutlined,
} from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '../supabase';
import { useAuth } from '../auth/AuthContext';
import dayjs from 'dayjs';

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
    { title: '日期', dataIndex: 'date', key: 'date', width: 90, render: (v: string) => <span style={{ color: '#64748b', fontSize: 13 }}>{v}</span> },
    {
      title: '类型', dataIndex: 'type', key: 'type', width: 55,
      render: (v: string) => (
        <Tag color={v === 'income' ? 'green' : 'red'} style={{ borderRadius: 6 }}>
          {v === 'income' ? '收入' : '支出'}
        </Tag>
      ),
    },
    {
      title: '金额', dataIndex: 'amount', key: 'amount', width: 100,
      render: (v: number) => <span style={{ fontWeight: 600, fontSize: 14 }}>¥{v.toFixed(2)}</span>,
    },
    {
      title: '科目', key: 'account', width: 80,
      render: (_: unknown, r: Record<string, unknown>) => (
        <span style={{ color: '#64748b' }}>{(r.accounts as Record<string, string> | null)?.name ?? '-'}</span>
      ),
    },
  ];

  const statCards = [
    { icon: <ArrowUpOutlined />, color: '#22c55e', bg: '#f0fdf4', title: '本月收入', value: stats?.totalIncome ?? 0, prefix: '¥', link: '/finance' },
    { icon: <ArrowDownOutlined />, color: '#ef4444', bg: '#fef2f2', title: '本月支出', value: stats?.totalExpense ?? 0, prefix: '¥', link: '/finance' },
    { icon: <DollarOutlined />, color: '#ff6b00', bg: '#fff7ed', title: '本月结余', value: stats?.balance ?? 0, prefix: '¥', link: '/reports' },
    { icon: <TeamOutlined />, color: '#8b5cf6', bg: '#f5f3ff', title: '客户总数', value: stats?.customerCount ?? 0, suffix: '户', link: '/customers' },
    { icon: <ShoppingOutlined />, color: '#06b6d4', bg: '#ecfeff', title: '商品总数', value: stats?.productCount ?? 0, suffix: '个', link: '/products' },
    { icon: <ShoppingCartOutlined />, color: '#f59e0b', bg: '#fffbeb', title: '进行中订单', value: stats?.pendingOrders ?? 0, suffix: '单', link: '/orders' },
  ];

  const quickActions = [
    { icon: <FileTextOutlined />, label: '新建报价单', color: '#ff6b00', bg: '#fff7ed', link: '/quotations/new?type=quotation' },
    { icon: <FileTextOutlined />, label: '新建PI', color: '#8b5cf6', bg: '#f5f3ff', link: '/quotations/new?type=pi' },
    { icon: <CustomerServiceOutlined />, label: '添加客户', color: '#22c55e', bg: '#f0fdf4', link: '/customers' },
    { icon: <BellOutlined />, label: '新建任务', color: '#f59e0b', bg: '#fffbeb', link: '/tasks' },
  ];

  return (
    <div>
      {/* Welcome */}
      <div className="dashboard-welcome">
        <span>👋 欢迎回来</span>
        <span className="dashboard-welcome-date">{dayjs().format('YYYY年M月D日 dddd')}</span>
      </div>

      {/* Stats Cards */}
      {canViewFinance && (
        <Row gutter={[12, 12]}>
          {statCards.map((card, i) => (
            <Col xs={12} sm={8} lg={4} key={i}>
              <div className="crm-stat-card" onClick={() => navigate(card.link)}>
                <div className="crm-stat-card-inner">
                  <div>
                    <div className="crm-stat-label">{card.title}</div>
                    <div className="crm-stat-value" style={{ color: card.color }}>
                      {isLoading ? '—' : `${card.prefix || ''}${(card.value ?? 0).toLocaleString()}${card.suffix || ''}`}
                    </div>
                  </div>
                  <div className="crm-stat-icon" style={{ background: card.bg, color: card.color }}>
                    {card.icon}
                  </div>
                </div>
              </div>
            </Col>
          ))}
        </Row>
      )}

      {/* Middle Section */}
      <Row gutter={12} style={{ marginTop: 20 }}>
        <Col xs={24} lg={8}>
          <div className="crm-card">
            <div className="crm-card-header">
              <span className="crm-card-title"><BellOutlined style={{ color: '#f59e0b', marginRight: 8 }} />待办任务</span>
              <a onClick={() => navigate('/tasks')} style={{ fontSize: 13, color: '#ff6b00', cursor: 'pointer' }}>查看全部 →</a>
            </div>
            <div className="crm-card-body">
              {tasksData ? (
                <>
                  <div className="crm-task-stat">
                    <span><WarningOutlined style={{ color: '#ef4444', marginRight: 6 }} />已逾期</span>
                    <Tag color="red" style={{ minWidth: 28, textAlign: 'center' }}>{tasksData.overdue}</Tag>
                  </div>
                  <div className="crm-task-stat">
                    <span><BellOutlined style={{ color: '#f59e0b', marginRight: 6 }} />今日截止</span>
                    <Tag color="orange" style={{ minWidth: 28, textAlign: 'center' }}>{tasksData.today}</Tag>
                  </div>
                  <div className="crm-task-stat">
                    <span><BellOutlined style={{ color: '#06b6d4', marginRight: 6 }} />近3日到期</span>
                    <Tag color="cyan" style={{ minWidth: 28, textAlign: 'center' }}>{tasksData.upcoming}</Tag>
                  </div>
                  <Progress
                    percent={totalPending > 0 ? Math.round((tasksData.today / totalPending) * 100) : 0}
                    size="small"
                    strokeColor="#ff6b00"
                    format={() => `${tasksData.today}/${totalPending} 今日`}
                    style={{ marginTop: 12 }}
                  />
                </>
              ) : (
                <div style={{ textAlign: 'center', padding: 20 }}><Spin /></div>
              )}
            </div>
          </div>
        </Col>

        <Col xs={24} lg={16}>
          <div className="crm-card">
            <div className="crm-card-header">
              <span className="crm-card-title"><DollarOutlined style={{ color: '#ff6b00', marginRight: 8 }} />快捷操作</span>
            </div>
            <div className="crm-card-body">
              <Row gutter={[12, 12]}>
                {quickActions.map((action, i) => (
                  <Col xs={12} sm={6} key={i}>
                    <div className="crm-quick-action" onClick={() => navigate(action.link)}>
                      <div className="crm-quick-action-icon" style={{ background: action.bg, color: action.color }}>
                        {action.icon}
                      </div>
                      <div className="crm-quick-action-label">{action.label}</div>
                    </div>
                  </Col>
                ))}
              </Row>
            </div>
          </div>
        </Col>
      </Row>

      {/* Recent Transactions */}
      {canViewFinance && (
        <div className="crm-card" style={{ marginTop: 20 }}>
          <div className="crm-card-header">
            <span className="crm-card-title"><DollarOutlined style={{ color: '#22c55e', marginRight: 8 }} />最近流水</span>
            <a onClick={() => navigate('/finance')} style={{ fontSize: 13, color: '#ff6b00', cursor: 'pointer' }}>查看全部 →</a>
          </div>
          <div className="crm-card-body">
            {txLoading ? (
              <div style={{ textAlign: 'center', padding: 20 }}><Spin /></div>
            ) : (
              <Table
                dataSource={recentTransactions ?? []}
                columns={txColumns}
                rowKey="id"
                pagination={false}
                size="small"
                scroll={{ x: 350 }}
              />
            )}
          </div>
        </div>
      )}
    </div>
  );
}
