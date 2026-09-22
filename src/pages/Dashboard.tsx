import { useNavigate } from 'react-router-dom';
import { Card, Col, Row, Spin, Tag, Space, Typography, Progress, Alert } from 'antd';
import ResponsiveTable from '../components/ResponsiveTable';
import {
  WalletOutlined,
  RiseOutlined,
  FallOutlined,
  TeamOutlined,
  ShoppingOutlined,
  CarryOutOutlined,
  ClockCircleOutlined,
  CalendarOutlined,
  WarningOutlined,
  ProfileOutlined,
  ReconciliationOutlined,
  ShoppingCartOutlined,
  UserAddOutlined,
  ThunderboltOutlined,
} from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '../supabase';
import { useAuth } from '../auth/AuthContext';
import type { Permission } from '../types';
import { lazyPrefetch } from '../utils/lazyRoutes';
import { formatDate, formatMoney } from '../utils/format';
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
  const { hasPerm, isOwner, isAdmin, permissions } = useAuth();
  // 财务数据的可见性走统一的 hasPerm（原先只认 isOwner||isAdmin，
  // 忽略了 permissions 数组，配了 finance 权限的成员反而看不到财务卡片）
  const canViewFinance = hasPerm('finance');
  // Warm up the finance page chunk while the user reads the dashboard
  lazyPrefetch('/finance');

  const { data: stats } = useQuery({
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
        supabase.from('transactions').select('amount,currency').eq('type', 'income').gte('date', firstDay).lte('date', lastDay),
        supabase.from('transactions').select('amount,currency').eq('type', 'expense').gte('date', firstDay).lte('date', lastDay),
        supabase.from('customers').select('*', { count: 'exact', head: true }),
        supabase.from('products').select('*', { count: 'exact', head: true }),
        supabase.from('orders').select('status'),
      ]);

      // Per-currency buckets: USD and RMB are never summed together
      const sumBy = (rows: { amount: number; currency: string }[] | null, cur: 'USD' | 'RMB') =>
        (rows ?? []).filter((t) => (t.currency || 'RMB') === cur).reduce((sum, t) => sum + Number(t.amount), 0);
      const incomeUsd = sumBy(income, 'USD');
      const incomeRmb = sumBy(income, 'RMB');
      const expenseUsd = sumBy(expense, 'USD');
      const expenseRmb = sumBy(expense, 'RMB');
      const pendingOrders = orderData?.filter(o => o.status !== 'completed' && o.status !== 'cancelled').length ?? 0;

      return {
        incomeUsd, incomeRmb, expenseUsd, expenseRmb,
        balanceUsd: incomeUsd - expenseUsd,
        balanceRmb: incomeRmb - expenseRmb,
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
    // 原先无 render，日期会显示成 2026-09-22T08:59:49.500Z
    { title: '日期', dataIndex: 'date', key: 'date', width: 90, render: (v: string) => formatDate(v) },
    { title: '类型', dataIndex: 'type', key: 'type', width: 55,
      render: (v: string) => <Tag color={v === 'income' ? 'green' : 'red'} style={{ borderRadius: 8 }}>{v === 'income' ? '收入' : '支出'}</Tag> },
    { title: '金额', key: 'amount', width: 110, render: (_: unknown, r: Record<string, unknown>) => {
      const currency = (r.currency as string) || 'RMB';
      const sym = currency === 'USD' ? '$' : '¥';
      const color = currency === 'USD' ? '#1677ff' : undefined;
      return <span style={{ fontWeight: 500, color }}>{formatMoney(r.amount as number, sym)}</span>;
    } },
    { title: '科目', key: 'account', width: 80, render: (_: unknown, r: Record<string, unknown>) => (r.accounts as Record<string, string> | null)?.name ?? '-' },
  ];

  // Dual-currency display: single line when only one currency has values,
  // two lines when both exist (matches customer card convention)
  const moneyLines = (rmb: number, usd: number) => {
    const hasRmb = rmb !== 0;
    const hasUsd = usd !== 0;
    if (hasRmb && hasUsd) return [`¥${rmb.toLocaleString('zh-CN')}`, `$${usd.toLocaleString('en-US')}`];
    if (hasUsd) return [`$${usd.toLocaleString('en-US')}`];
    return [`¥${rmb.toLocaleString('zh-CN')}`];
  };

  // 每张卡片标注所需权限，统一按 hasPerm 过滤 —— 与侧边栏菜单同一套判定。
  // 原先只区分「财务 / 非财务」两套硬编码列表，与菜单权限不一致。
  const statCards = [
    { perm: 'finance', icon: <RiseOutlined />, color: '#52c41a', bg: '#f6ffed', title: '本月收入', lines: moneyLines(stats?.incomeRmb ?? 0, stats?.incomeUsd ?? 0), link: '/finance' },
    { perm: 'finance', icon: <FallOutlined />, color: '#ff4d4f', bg: '#fff2f0', title: '本月支出', lines: moneyLines(stats?.expenseRmb ?? 0, stats?.expenseUsd ?? 0), link: '/finance' },
    // 结余原本链到 /reports；没有报表权限时退回 /finance，避免点进 403
    { perm: 'finance', icon: <WalletOutlined />, color: '#1677ff', bg: '#f0f5ff', title: '本月结余', lines: moneyLines(stats?.balanceRmb ?? 0, stats?.balanceUsd ?? 0), link: hasPerm('reports') ? '/reports' : '/finance' },
    { perm: 'customers', icon: <TeamOutlined />, color: '#722ed1', bg: '#f9f0ff', title: '客户总数', lines: [`${stats?.customerCount ?? 0} 人`], link: '/customers' },
    { perm: 'products', icon: <ShoppingOutlined />, color: '#13c2c2', bg: '#e6fffb', title: '商品总数', lines: [`${stats?.productCount ?? 0} 个`], link: '/products' },
    { perm: 'customers', icon: <ShoppingCartOutlined />, color: '#fa8c16', bg: '#fff7e6', title: '进行中订单', lines: [`${stats?.pendingOrders ?? 0} 单`], link: '/orders' },
  ].filter(c => hasPerm(c.perm as Permission));

  // 每个动作使用不同图标，避免此前「新建报价单」与「新建PI」共用 FileTextOutlined
  // 快捷操作是入口按钮，必须与对应模块权限一致，否则会点进无权限页面
  const quickActions = [
    { perm: 'quotations', icon: <ProfileOutlined />, label: '新建报价单', color: '#1677ff', bg: '#f0f5ff', link: '/quotations/new?type=quotation' },
    { perm: 'quotations', icon: <ReconciliationOutlined />, label: '新建PI', color: '#722ed1', bg: '#f9f0ff', link: '/quotations/new?type=pi' },
    { perm: 'customers', icon: <UserAddOutlined />, label: '添加客户', color: '#52c41a', bg: '#f6ffed', link: '/customers' },
    { perm: 'tasks', icon: <CarryOutOutlined />, label: '新建任务', color: '#fa8c16', bg: '#fff7e6', link: '/tasks' },
  ].filter(a => hasPerm(a.perm as Permission));

  // 完全没有被分配任何模块权限（新加入成员的默认状态：member_permissions 为空，
  // 加入流程不会授予任何默认权限）→ 直接说明原因，而不是给一个近乎空白的页面。
  // 主账号/管理员不在 member_permissions 里，故要排除。
  const hasNoModule = !isOwner && !isAdmin && permissions.length === 0;

  return (
    <div>
      <Typography.Title level={4} style={{ marginBottom: 16, fontWeight: 600 }}>
        欢迎回来
        <span style={{ fontSize: 14, fontWeight: 400, color: '#999', marginLeft: 12 }}>
          {dayjs().format('YYYY年M月D日 dddd')}
        </span>
      </Typography.Title>

      {hasNoModule && (
        <Alert
          type="info"
          showIcon
          style={{ marginBottom: 16, borderRadius: 10 }}
          message="你还没有被分配任何模块权限"
          description="当前账号只能看到仪表盘。请联系主账号在「团队管理 → 成员 → 配置权限」中为你开通需要的模块。"
        />
      )}

      <Row gutter={[12, 12]}>
        {statCards.map((card, i) => (
          <Col xs={12} sm={8} lg={4} key={i}>
            <Card hoverable size="small" style={cardStyle} onClick={() => navigate(card.link)}
              styles={{ body: { padding: '14px 16px' } }}>
              <Space align="start" style={{ width: '100%', justifyContent: 'space-between' }}>
                <div>
                  <div style={{ fontSize: 12, color: '#999', marginBottom: 4 }}>{card.title}</div>
                  <div style={{ minHeight: 40, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                    {card.lines.map((line, li) => (
                      <div key={li} style={{ fontSize: 16, fontWeight: 600, lineHeight: li === 0 ? 1.3 : 1.5, color: li === 1 ? '#1677ff' : undefined }}>
                        {line}
                      </div>
                    ))}
                  </div>
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

      {/* Middle Row: Tasks + Quick Actions —— 两块都可能被权限过滤空，整体也要收起 */}
      {(hasPerm('tasks') || quickActions.length > 0) && (
      <Row gutter={12} style={{ marginTop: 16 }}>
        {/* 待办任务卡片同样受 tasks 权限约束（原先无条件显示，无权限者点「查看全部」会进 403） */}
        {hasPerm('tasks') && (
        <Col xs={24} lg={8}>
          <Card size="small" style={cardStyle}
            styles={{ body: { padding: '16px' } }}
            title={<Space><CarryOutOutlined style={{ color: '#fa8c16' }} /><span style={{ fontSize: 14, fontWeight: 500 }}>待办任务</span></Space>}
            extra={<a onClick={() => navigate('/tasks')} style={{ fontSize: 12 }}>查看全部</a>}>
            {tasksData ? (
              <Space direction="vertical" style={{ width: '100%' }} size={8}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span><WarningOutlined style={{ color: '#ff4d4f', marginRight: 6 }} />已逾期</span>
                  <Tag color="red" style={{ borderRadius: 6, minWidth: 28, textAlign: 'center' }}>{tasksData.overdue}</Tag>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span><ClockCircleOutlined style={{ color: '#faad14', marginRight: 6 }} />今日截止</span>
                  <Tag color="orange" style={{ borderRadius: 6, minWidth: 28, textAlign: 'center' }}>{tasksData.today}</Tag>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span><CalendarOutlined style={{ color: '#1677ff', marginRight: 6 }} />近3日到期</span>
                  <Tag color="blue" style={{ borderRadius: 6, minWidth: 28, textAlign: 'center' }}>{tasksData.upcoming}</Tag>
                </div>
                <Progress percent={totalPending > 0 ? Math.round((tasksData.today / totalPending) * 100) : 0}
                  size="small" strokeColor="#1677ff" format={() => `${tasksData.today}/${totalPending} 今日`} />
              </Space>
            ) : <Spin />}
          </Card>
        </Col>
        )}

        {quickActions.length > 0 && (
        <Col xs={24} lg={hasPerm('tasks') ? 16 : 24}>
          <Card size="small" style={cardStyle}
            styles={{ body: { padding: '16px' } }}
            title={<Space><ThunderboltOutlined style={{ color: '#1677ff' }} /><span style={{ fontSize: 14, fontWeight: 500 }}>快捷操作</span></Space>}>
            <Row gutter={[12, 12]}>
              {quickActions.map((action, i) => (
                <Col xs={12} sm={6} key={i}>
                  <Card hoverable size="small" style={{ ...cardStyle, textAlign: 'center' }}
                    styles={{ body: { padding: '16px 8px' } }}
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
        )}
      </Row>
      )}

      {canViewFinance && (
        <Card title={<Space><WalletOutlined style={{ color: '#52c41a' }} />最近流水</Space>}
          style={{ ...cardStyle, marginTop: 16 }}
          styles={{ body: { padding: '12px 16px' } }}
          extra={<a onClick={() => navigate('/finance')} style={{ fontSize: 12 }}>查看全部</a>}>
          {txLoading ? <Spin /> : (
            <ResponsiveTable dataSource={recentTransactions ?? []} columns={txColumns} rowKey="id"
              pagination={false} size="small" />
          )}
        </Card>
      )}
    </div>
  );
}
