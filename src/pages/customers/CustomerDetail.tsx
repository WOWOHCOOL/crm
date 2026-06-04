import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Card, Descriptions, Table, Button, Space, Spin, Tag, Modal, Form, Input, InputNumber, Select, Image, message, Row, Col, Collapse } from 'antd';
import { ArrowLeftOutlined, PlusOutlined, SendOutlined, ShoppingCartOutlined, DollarOutlined, BellOutlined, FileTextOutlined, CheckCircleOutlined, TeamOutlined, OrderedListOutlined, SwapOutlined, PieChartOutlined, DownOutlined, UpOutlined } from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../supabase';
import type { Order, Quotation, Task, FollowUp, OrderStatus } from '../../types';
import { useAuth } from '../../auth/AuthContext';
import { useResponsive } from '../../hooks/useResponsive';
import { tokens, customerStatusMap } from '../../styles/theme';
import PageContainer from '../../components/PageContainer';
import StatCard from '../../components/StatCard';
import FollowUpChat from '../../components/FollowUpChat';
import SectionNav from '../../components/SectionNav';
import { DetailSkeleton } from '../../components/Skeletons';
import EmptyState from '../../components/EmptyState';
import dayjs from 'dayjs';

const orderTypeLabels: Record<string, string> = { normal: '正常订单', repeat: '返单', sample: '样品' };
const orderTypeColors: Record<string, string> = { normal: 'blue', repeat: 'green', sample: 'orange' };
const orderStatusLabels: Record<OrderStatus, string> = { pending: '待确认', confirmed: '已确认', in_production: '生产中', shipped: '已发货', completed: '已完成' };
const orderStatusColors: Record<OrderStatus, string> = { pending: 'orange', confirmed: 'geekblue', in_production: 'purple', shipped: 'cyan', completed: 'green' };
const nextStatus: Record<OrderStatus, OrderStatus | null> = { pending: 'confirmed', confirmed: 'in_production', in_production: 'shipped', shipped: 'completed', completed: null };
const statusActionLabels: Record<OrderStatus, string> = { pending: '确认订单', confirmed: '开始生产', in_production: '标记发货', shipped: '标记完成', completed: '已完成' };

export default function CustomerDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [orderModal, setOrderModal] = useState(false);
  const [orderForm] = Form.useForm();
  const { isOwner, isAdmin } = useAuth();
  const { isMobile } = useResponsive();
  const canManage = isOwner || isAdmin;
  const [shippingModalOpen, setShippingModalOpen] = useState(false);
  const [shippingOrder, setShippingOrder] = useState<Order | null>(null);
  const [shippingForm] = Form.useForm();
  const [collapsedSections, setCollapsedSections] = useState<Record<string, boolean>>({});
  const [showScrollTop, setShowScrollTop] = useState(false);

  // Track scroll for sticky actions
  useState(() => {
    const handler = () => setShowScrollTop(window.scrollY > 300);
    window.addEventListener('scroll', handler, { passive: true });
    return () => window.removeEventListener('scroll', handler);
  });

  // ── Queries ──
  const { data: customer, isLoading } = useQuery({
    queryKey: ['customer', id],
    queryFn: async () => { const { data } = await supabase.from('customers').select('*').eq('id', id).single(); return data; },
    enabled: !!id,
  });

  const { data: orders } = useQuery({
    queryKey: ['customer-orders', id],
    queryFn: async () => {
      const { data } = await supabase.from('orders').select('*, order_items(*, products(*))').eq('customer_id', id).order('date', { ascending: false });
      return (data ?? []) as Order[];
    },
    enabled: !!id,
  });

  const { data: transactions } = useQuery({
    queryKey: ['customer-transactions', id],
    queryFn: async () => {
      const { data } = await supabase.from('transactions').select('*, accounts(name)').eq('customer_id', id).order('date', { ascending: false });
      return data ?? [];
    },
    enabled: !!id,
  });

  const { data: quotations } = useQuery({
    queryKey: ['customer-quotations', id],
    queryFn: async () => {
      const { data } = await supabase.from('quotations').select('*').eq('customer_id', id).order('created_at', { ascending: false });
      return (data ?? []) as Quotation[];
    },
    enabled: !!id,
  });

  const { data: tasks } = useQuery({
    queryKey: ['customer-tasks', id],
    queryFn: async () => {
      const { data } = await supabase.from('tasks').select('*').eq('customer_id', id).order('due_date', { ascending: true });
      return (data ?? []) as Task[];
    },
    enabled: !!id,
  });

  const { data: followUps } = useQuery({
    queryKey: ['customer-followups', id],
    queryFn: async () => {
      const { data } = await supabase.from('follow_ups').select('*').eq('customer_id', id).order('follow_up_date', { ascending: false });
      return (data ?? []) as FollowUp[];
    },
    enabled: !!id,
  });

  // ── Mutations ──
  const createOrder = useMutation({
    mutationFn: async (values: Record<string, unknown>) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('未登录');
      const { error } = await supabase.from('orders').insert([{
        customer_id: id, pi_number: values.pi_number, order_type: values.order_type || 'normal',
        status: values.status || 'pending', total_amount: values.total_amount ? Number(values.total_amount) : null,
        notes: values.notes, date: values.date ? dayjs(values.date as string).format('YYYY-MM-DD') : dayjs().format('YYYY-MM-DD'),
        user_id: user.id,
      }]);
      if (error) throw error;
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['customer-orders'] }); setOrderModal(false); orderForm.resetFields(); message.success('订单已创建'); },
    onError: (error: Error) => message.error(error.message),
  });

  const updateOrderStatus = useMutation({
    mutationFn: async ({ orderId, status }: { orderId: string; status: OrderStatus }) => {
      const { error } = await supabase.from('orders').update({ status }).eq('id', orderId);
      if (error) throw error;
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['customer-orders'] }); message.success('订单状态已更新'); },
    onError: (error: Error) => message.error(error.message),
  });

  const updateShipping = useMutation({
    mutationFn: async ({ orderId, values }: { orderId: string; values: Record<string, unknown> }) => {
      const { error } = await supabase.from('orders').update({
        tracking_company: values.tracking_company || null, tracking_number: values.tracking_number || null,
        container_number: values.container_number || null,
        etd: values.etd ? dayjs(values.etd as string).format('YYYY-MM-DD') : null,
        eta: values.eta ? dayjs(values.eta as string).format('YYYY-MM-DD') : null,
        shipped_date: values.shipped_date ? dayjs(values.shipped_date as string).format('YYYY-MM-DD') : null,
        shipping_notes: values.shipping_notes || null,
      }).eq('id', orderId);
      if (error) throw error;
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['customer-orders'] }); setShippingModalOpen(false); setShippingOrder(null); shippingForm.resetFields(); message.success('出运信息已更新'); },
    onError: (error: Error) => message.error(error.message),
  });

  // ── Derived data ──
  if (isLoading) return <DetailSkeleton />;

  const totalIncome = (transactions ?? []).filter((t: any) => t.type === 'income').reduce((s: number, t: any) => s + Number(t.amount), 0);
  const totalExpense = (transactions ?? []).filter((t: any) => t.type === 'expense').reduce((s: number, t: any) => s + Number(t.amount), 0);
  const pendingTasks = (tasks ?? []).filter((t: Task) => t.status === 'pending');
  const pendingOrders = (orders ?? []).filter((o: Order) => (o.status as string) !== 'completed');
  const statusInfo = customerStatusMap[customer?.status] || customerStatusMap.new;

  // Build activity timeline
  const activities: { date: string; text: string; type: string }[] = [];
  (followUps ?? []).forEach((f: FollowUp) => activities.push({ date: f.follow_up_date, text: f.content.slice(0, 80), type: 'followup' }));
  (orders ?? []).slice(0, 3).forEach((o: Order) => activities.push({ date: o.date, text: `订单 ${o.pi_number || ''} ${orderStatusLabels[o.status] || o.status}`, type: 'order' }));
  (quotations ?? []).slice(0, 3).forEach((q: Quotation) => activities.push({ date: q.created_at, text: `报价 ${q.quotation_no}`, type: 'quo' }));
  (transactions ?? []).slice(0, 3).forEach((t: any) => activities.push({ date: t.date, text: `${t.type === 'income' ? '收入' : '支出'} ¥${Number(t.amount).toFixed(2)}`, type: t.type }));
  activities.sort((a, b) => b.date.localeCompare(a.date));

  const txColumns = [
    { title: '日期', dataIndex: 'date', key: 'date', width: 120 },
    { title: '类型', dataIndex: 'type', key: 'type', width: 70, render: (v: string) => <Tag color={v === 'income' ? 'green' : 'red'}>{v === 'income' ? '收入' : '支出'}</Tag> },
    { title: '金额', dataIndex: 'amount', key: 'amount', width: 110, render: (v: number) => <span style={{ fontWeight: 600 }}>¥{v.toFixed(2)}</span> },
    { title: '科目', key: 'account', render: (_: any, r: any) => (r.accounts as any)?.name ?? '-' },
  ];

  const sections = [
    { key: 'overview', label: '动态', count: activities.length },
    { key: 'followups', label: '跟进', count: (followUps ?? []).length },
    { key: 'orders', label: '订单', count: (orders ?? []).length },
    { key: 'quotations-pi', label: '报价/PI', count: (quotations ?? []).length },
    { key: 'finance', label: '收支' },
    { key: 'tasks', label: '任务', count: pendingTasks.length },
  ];

  const toggleCollapse = (key: string) => {
    setCollapsedSections(prev => ({ ...prev, [key]: !prev[key] }));
  };

  return (
    <PageContainer
      breadcrumb={[
        { label: '客户管理' },
        { label: customer?.name || '客户详情' },
      ]}
      loading={false}
    >
      <div style={{ maxWidth: 1200, margin: '0 auto' }}>
        {/* ── Header actions ── */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: tokens.spacingLG, flexWrap: 'wrap', gap: 8 }}>
          <Button icon={<ArrowLeftOutlined />} onClick={() => navigate('/customers')}>返回</Button>
          <Space wrap>
            <Button onClick={() => navigate(`/quotations/new?customer_id=${id}`)} icon={<FileTextOutlined />}>新建报价</Button>
          </Space>
        </div>

        {/* ── Customer Info Card ── */}
        <Card styles={{ body: { padding: isMobile ? tokens.spacingLG : tokens.spacingXL } }} style={{ marginBottom: 20, borderRadius: tokens.radiusXL, border: `1px solid ${tokens.colorBorder}` }}>
          <Row gutter={[24, 16]} align="middle">
            <Col xs={24} md={8}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                <div style={{ width: 56, height: 56, borderRadius: tokens.radiusXXL, background: 'linear-gradient(135deg,#d4a843,#b8922e)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24, color: '#fff', fontWeight: 700, flexShrink: 0 }}>
                  {customer?.name?.charAt(0) || '?'}
                </div>
                <div>
                  <div style={{ fontSize: 18, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    {customer?.name}
                    <Tag color={statusInfo.color}>{statusInfo.label}</Tag>
                  </div>
                  <div style={{ fontSize: tokens.fontSizeMD, color: tokens.colorTextSecondary }}>{customer?.company || '-'}</div>
                </div>
              </div>
            </Col>
            <Col xs={12} md={4}><div style={{ fontSize: tokens.fontSizeSM, color: tokens.colorTextTertiary }}>国家</div><div style={{ fontWeight: 600 }}>{customer?.country || '-'}</div></Col>
            <Col xs={12} md={4}><div style={{ fontSize: tokens.fontSizeSM, color: tokens.colorTextTertiary }}>来源</div><div style={{ fontWeight: 600 }}>{customer?.source || '-'}</div></Col>
            <Col xs={12} md={4}><div style={{ fontSize: tokens.fontSizeSM, color: tokens.colorTextTertiary }}>电话</div><div style={{ fontWeight: 600 }}>{customer?.phone || '-'}</div></Col>
            <Col xs={12} md={4}><div style={{ fontSize: tokens.fontSizeSM, color: tokens.colorTextTertiary }}>邮箱</div><div style={{ fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis' }}>{customer?.email || '-'}</div></Col>
            {customer?.business_card && (
              <Col xs={24} style={{ marginTop: 8 }}>
                <div style={{ fontSize: tokens.fontSizeSM, color: tokens.colorTextTertiary, marginBottom: 6 }}>名片</div>
                <Image src={customer.business_card} width={isMobile ? '100%' : 160} style={{ borderRadius: 6, border: '1px solid #f0f0f0' }} />
              </Col>
            )}
          </Row>

          {/* Stats bar */}
          <Row gutter={[12, 12]} style={{ marginTop: tokens.spacingLG, paddingTop: tokens.spacingLG, borderTop: `1px solid ${tokens.colorBorder}` }}>
            <Col xs={12} sm={4}><StatCard icon={<ShoppingCartOutlined />} label="总订单" value={(orders ?? []).length} color={tokens.colorPrimary} onClick={() => document.getElementById('orders')?.scrollIntoView({ behavior: 'smooth' })} /></Col>
            <Col xs={12} sm={4}><StatCard icon={<DollarOutlined />} label="总收入" value={`¥${totalIncome.toLocaleString()}`} color={tokens.colorSuccess} /></Col>
            <Col xs={12} sm={4}><StatCard icon={<OrderedListOutlined />} label="进行中" value={pendingOrders.length} color={tokens.colorWarning} /></Col>
            <Col xs={12} sm={4}><StatCard icon={<BellOutlined />} label="待办" value={pendingTasks.length} color={tokens.colorError} /></Col>
            <Col xs={12} sm={4}><StatCard icon={<FileTextOutlined />} label="报价/PI" value={(quotations ?? []).length} color={tokens.colorPurple} /></Col>
            <Col xs={12} sm={4}><StatCard icon={<TeamOutlined />} label="跟进" value={(followUps ?? []).length} color={tokens.colorCyan} onClick={() => document.getElementById('followups')?.scrollIntoView({ behavior: 'smooth' })} /></Col>
          </Row>
        </Card>

        {/* ── Sticky section nav ── */}
        <SectionNav sections={sections} stickyTop={isMobile ? 56 : 64} />

        {/* ═══ OVERVIEW: Activity Timeline ═══ */}
        <section id="overview" style={{ scrollMarginTop: 80 }}>
          <Card
            title={<span style={{ fontSize: tokens.fontSizeLG, fontWeight: 600 }}>最近动态</span>}
            styles={{ body: { padding: isMobile ? tokens.spacingMD : tokens.spacingXL } }}
            style={{ marginBottom: 20, borderRadius: tokens.radiusXL }}
          >
            {activities.slice(0, 12).length === 0 ? (
              <EmptyState title="暂无动态" description="创建订单或添加跟进记录后，动态会显示在这里" />
            ) : (
              <div style={{ position: 'relative' }}>
                {activities.slice(0, 12).map((a, i) => (
                  <div key={i} style={{ display: 'flex', gap: 12, paddingBottom: i < Math.min(activities.length, 12) - 1 ? 16 : 0, position: 'relative' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: 20 }}>
                      <div style={{ width: 8, height: 8, borderRadius: '50%', background: a.type === 'order' ? tokens.colorPrimary : a.type === 'quo' ? tokens.colorPurple : a.type === 'income' ? tokens.colorSuccess : a.type === 'expense' ? tokens.colorError : tokens.colorCyan, flexShrink: 0 }} />
                      {i < Math.min(activities.length, 12) - 1 && <div style={{ width: 1, flex: 1, background: tokens.colorBorder, marginTop: 4 }} />}
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: tokens.fontSizeMD, color: tokens.colorText }}>{a.text}</div>
                      <div style={{ fontSize: tokens.fontSizeXS, color: tokens.colorTextTertiary }}>{a.date}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </section>

        {/* ═══ FOLLOW-UPS ═══ */}
        <section id="followups" style={{ scrollMarginTop: 80 }}>
          <Card
            title={<span style={{ fontSize: tokens.fontSizeLG, fontWeight: 600 }}>跟进记录</span>}
            styles={{ body: { padding: isMobile ? tokens.spacingMD : tokens.spacingXL } }}
            style={{ marginBottom: 20, borderRadius: tokens.radiusXL }}
          >
            <FollowUpChat
              customerId={id!}
              followUps={followUps ?? []}
              inquiryContent={customer?.inquiry_content}
            />
          </Card>
        </section>

        {/* ═══ ORDERS ═══ */}
        <section id="orders" style={{ scrollMarginTop: 80 }}>
          <Card
            title={<span style={{ fontSize: tokens.fontSizeLG, fontWeight: 600 }}>订单 ({orders?.length ?? 0})</span>}
            extra={
              <Space>
                {collapsedSections['orders'] ? <UpOutlined /> : <DownOutlined />}
                <Button type="primary" size="small" icon={<PlusOutlined />} onClick={() => setOrderModal(true)}>新建订单</Button>
              </Space>
            }
            styles={{ body: { padding: collapsedSections['orders'] ? 0 : (isMobile ? tokens.spacingMD : tokens.spacingXL) } }}
            style={{ marginBottom: 20, borderRadius: tokens.radiusXL }}
          >
            {collapsedSections['orders'] ? null : (orders ?? []).length === 0 ? (
              <EmptyState icon={<ShoppingCartOutlined />} title="暂无订单" action={{ label: '新建订单', onClick: () => setOrderModal(true) }} />
            ) : (
              (orders ?? []).map((order) => {
                const curStatus = (order as Order).status || 'pending';
                const next = nextStatus[curStatus];
                return (
                  <Card key={order.id} size="small" style={{ marginBottom: 10, borderRadius: 8 }}
                    title={<Space wrap style={{ gap: 4 }}>
                      <Tag color={orderTypeColors[order.order_type]}>{orderTypeLabels[order.order_type]}</Tag>
                      <Tag color={orderStatusColors[curStatus]}>{orderStatusLabels[curStatus]}</Tag>
                      <span style={{ fontSize: 12 }}>PI: {order.pi_number || '-'}</span>
                      <span style={{ fontSize: 12 }}>{order.date}</span>
                      {order.total_amount && <span style={{ fontWeight: 600, fontSize: 13 }}>¥{Number(order.total_amount).toFixed(2)}</span>}
                    </Space>}
                    extra={canManage && next ? <Button size="small" type="primary" onClick={() => updateOrderStatus.mutate({ orderId: order.id, status: next })}>{statusActionLabels[curStatus]}</Button> : undefined}>
                    {order.order_items && order.order_items.length > 0 ? (
                      <Table dataSource={order.order_items as any[]} rowKey="id" pagination={false} size="small"
                        columns={[
                          { title: '型号', dataIndex: 'model', key: 'model' },
                          { title: '数量', dataIndex: 'quantity', key: 'quantity' },
                          { title: '单价', dataIndex: 'unit_price', key: 'unit_price', render: (v: number) => `¥${Number(v).toFixed(2)}` },
                          { title: '小计', key: 'subtotal', render: (_: any, r: any) => `¥${(Number(r.quantity) * Number(r.unit_price)).toFixed(2)}` },
                        ]} />
                    ) : <div style={{ color: tokens.colorTextTertiary, fontSize: 12, padding: 8 }}>暂无明细</div>}

                    <div style={{ marginTop: 8, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      {canManage && (curStatus === 'in_production' || curStatus === 'shipped') && (
                        <Button size="small" icon={<SendOutlined />} onClick={() => {
                          setShippingOrder(order as Order);
                          shippingForm.setFieldsValue({
                            tracking_company: (order as Order).tracking_company,
                            tracking_number: (order as Order).tracking_number,
                            container_number: (order as Order).container_number,
                            etd: (order as Order).etd ? dayjs((order as Order).etd) : null,
                            eta: (order as Order).eta ? dayjs((order as Order).eta) : null,
                            shipped_date: (order as Order).shipped_date ? dayjs((order as Order).shipped_date) : null,
                            shipping_notes: (order as Order).shipping_notes,
                          });
                          setShippingModalOpen(true);
                        }}>出运信息</Button>
                      )}
                    </div>

                    {(order as Order).tracking_company && (
                      <div style={{ marginTop: 8, padding: '6px 10px', background: '#f0f5ff', borderRadius: 6, fontSize: 12 }}>
                        <Space wrap size={[12, 4]}>
                          {(order as Order).tracking_company && <span>承运: <strong>{(order as Order).tracking_company}</strong></span>}
                          {(order as Order).tracking_number && <span>单号: <strong>{(order as Order).tracking_number}</strong></span>}
                          {(order as Order).container_number && <span>箱号: <strong>{(order as Order).container_number}</strong></span>}
                          {(order as Order).etd && <span>ETD: {(order as Order).etd}</span>}
                          {(order as Order).eta && <span>ETA: {(order as Order).eta}</span>}
                        </Space>
                      </div>
                    )}
                    {order.notes && <div style={{ marginTop: 6, color: tokens.colorTextSecondary, fontSize: 12 }}>备注：{order.notes}</div>}
                  </Card>
                );
              })
            )}
          </Card>
        </section>

        {/* ═══ QUOTATIONS & PI ═══ */}
        <section id="quotations-pi" style={{ scrollMarginTop: 80 }}>
          <Card
            title={<span style={{ fontSize: tokens.fontSizeLG, fontWeight: 600 }}>报价单 & PI ({quotations?.length ?? 0})</span>}
            styles={{ body: { padding: collapsedSections['quotations-pi'] ? 0 : (isMobile ? tokens.spacingMD : tokens.spacingXL) } }}
            style={{ marginBottom: 20, borderRadius: tokens.radiusXL }}
          >
            {collapsedSections['quotations-pi'] ? null : (
              <Row gutter={[16, 16]}>
                <Col xs={24} lg={12}>
                  <div style={{ fontSize: tokens.fontSizeLG, fontWeight: 600, marginBottom: tokens.spacingMD, color: tokens.colorTextSecondary }}>报价单</div>
                  <Table dataSource={(quotations ?? []).filter((q: Quotation) => q.type === 'quotation')}
                    rowKey="id" size="small" pagination={false}
                    columns={[
                      { title: '编号', dataIndex: 'quotation_no', key: 'quotation_no' },
                      { title: '日期', dataIndex: 'created_at', key: 'created_at', render: (v: string) => new Date(v).toLocaleDateString('zh-CN') },
                      { title: '有效期', dataIndex: 'valid_days', key: 'valid_days', render: (v: number) => `${v}天` },
                      { title: '状态', dataIndex: 'status', key: 'status', render: (v: string) => v === 'draft' ? <Tag>草稿</Tag> : <Tag color="green">已发送</Tag> },
                    ]}
                    locale={{ emptyText: '暂无报价单' }} />
                </Col>
                <Col xs={24} lg={12}>
                  <div style={{ fontSize: tokens.fontSizeLG, fontWeight: 600, marginBottom: tokens.spacingMD, color: tokens.colorTextSecondary }}>PI</div>
                  <Table dataSource={(quotations ?? []).filter((q: Quotation) => q.type === 'pi')}
                    rowKey="id" size="small" pagination={false}
                    columns={[
                      { title: '编号', dataIndex: 'quotation_no', key: 'quotation_no' },
                      { title: '日期', dataIndex: 'created_at', key: 'created_at', render: (v: string) => new Date(v).toLocaleDateString('zh-CN') },
                      { title: '状态', dataIndex: 'status', key: 'status', render: (v: string) => <Tag>{v === 'draft' ? '草稿' : '已发送'}</Tag> },
                    ]}
                    locale={{ emptyText: '暂无PI' }} />
                </Col>
              </Row>
            )}
          </Card>
        </section>

        {/* ═══ FINANCE ═══ */}
        <section id="finance" style={{ scrollMarginTop: 80 }}>
          <Card
            title={<span style={{ fontSize: tokens.fontSizeLG, fontWeight: 600 }}>收支记录</span>}
            styles={{ body: { padding: collapsedSections['finance'] ? 0 : (isMobile ? tokens.spacingMD : tokens.spacingXL) } }}
            style={{ marginBottom: 20, borderRadius: tokens.radiusXL }}
          >
            {collapsedSections['finance'] ? null : (
              <>
                <Row gutter={16} style={{ marginBottom: tokens.spacingLG }}>
                  <Col xs={12}><Card size="small"><StatCard icon={<DollarOutlined />} label="总收入" value={`¥${totalIncome.toFixed(2)}`} color={tokens.colorSuccess} /></Card></Col>
                  <Col xs={12}><Card size="small"><StatCard icon={<DollarOutlined />} label="总支出" value={`¥${totalExpense.toFixed(2)}`} color={tokens.colorError} /></Card></Col>
                </Row>
                <Table dataSource={transactions ?? []} columns={txColumns} rowKey="id" pagination={{ pageSize: 10 }} size="small" locale={{ emptyText: '暂无收支记录' }} />
              </>
            )}
          </Card>
        </section>

        {/* ═══ TASKS ═══ */}
        <section id="tasks" style={{ scrollMarginTop: 80, marginBottom: isMobile ? 72 : 0 }}>
          <Card
            title={<span style={{ fontSize: tokens.fontSizeLG, fontWeight: 600 }}>待办任务 ({pendingTasks.length})</span>}
            styles={{ body: { padding: collapsedSections['tasks'] ? 0 : (isMobile ? tokens.spacingMD : tokens.spacingXL) } }}
            style={{ borderRadius: tokens.radiusXL }}
          >
            {collapsedSections['tasks'] ? null : (
              <Table dataSource={tasks ?? []} rowKey="id" size="small" pagination={false}
                columns={[
                  { title: '状态', dataIndex: 'status', key: 'status', width: 70, render: (v: string) => <Tag color={v === 'pending' ? 'orange' : v === 'completed' ? 'green' : 'default'}>{v === 'pending' ? '待处理' : v === 'completed' ? '已完成' : '已取消'}</Tag> },
                  { title: '标题', dataIndex: 'title', key: 'title', width: 180 },
                  { title: '优先级', dataIndex: 'priority', key: 'priority', width: 60, render: (v: string) => <Tag color={v === 'urgent' ? 'red' : v === 'high' ? 'orange' : v === 'normal' ? 'blue' : 'default'}>{v === 'urgent' ? '紧急' : v === 'high' ? '高' : v === 'normal' ? '中' : '低'}</Tag> },
                  { title: '截止', dataIndex: 'due_date', key: 'due_date', width: 100, render: (v: string | null) => v ? dayjs(v).format('MM-DD') : '-' },
                ]}
                locale={{ emptyText: '暂无跟进任务' }} />
            )}
          </Card>
        </section>

        {/* ── Sticky quick actions (appears on scroll) ── */}
        {showScrollTop && (
          <div style={{
            position: 'fixed',
            bottom: isMobile ? 64 : tokens.spacingXL,
            right: tokens.spacingXL,
            zIndex: 50,
            display: 'flex',
            flexDirection: 'column',
            gap: 8,
          }}>
            <Button shape="circle" type="primary" icon={<PlusOutlined />} size="large"
              onClick={() => document.getElementById('followups')?.scrollIntoView({ behavior: 'smooth' })}
              title="添加跟进" />
          </div>
        )}
      </div>

      {/* ── Modals ── */}
      <Modal title="新建订单" open={orderModal} onCancel={() => setOrderModal(false)} onOk={() => orderForm.submit()} confirmLoading={createOrder.isPending} destroyOnClose>
        <Form form={orderForm} layout="vertical" onFinish={(values) => createOrder.mutate(values)}>
          <Row gutter={16}>
            <Col xs={24} sm={12}><Form.Item name="pi_number" label="PI 编号"><Input /></Form.Item></Col>
            <Col xs={24} sm={12}><Form.Item name="order_type" label="订单类型" initialValue="normal"><Select options={[{ label: '正常订单', value: 'normal' }, { label: '返单', value: 'repeat' }, { label: '样品', value: 'sample' }]} /></Form.Item></Col>
            <Col xs={24} sm={12}><Form.Item name="status" label="初始状态" initialValue="pending"><Select options={[{ label: '待确认', value: 'pending' }, { label: '已确认', value: 'confirmed' }]} /></Form.Item></Col>
            <Col xs={24} sm={12}><Form.Item name="total_amount" label="金额"><InputNumber min={0} precision={2} style={{ width: '100%' }} prefix="¥" /></Form.Item></Col>
            <Col xs={24} sm={12}><Form.Item name="date" label="日期" initialValue={dayjs()}><Input type="date" /></Form.Item></Col>
            <Col xs={24}><Form.Item name="notes" label="备注"><Input.TextArea rows={2} /></Form.Item></Col>
          </Row>
        </Form>
      </Modal>

      <Modal title="出运跟踪信息" open={shippingModalOpen} onCancel={() => { setShippingModalOpen(false); setShippingOrder(null); }} onOk={() => shippingForm.submit()} confirmLoading={updateShipping.isPending} destroyOnClose width={600}>
        <Form form={shippingForm} layout="vertical" onFinish={(values) => { if (!shippingOrder) return; updateShipping.mutate({ orderId: shippingOrder.id, values }); }}>
          <Row gutter={16}>
            <Col xs={24} sm={12}><Form.Item name="tracking_company" label="承运公司"><Input placeholder="如：COSCO、DHL" /></Form.Item></Col>
            <Col xs={24} sm={12}><Form.Item name="tracking_number" label="运单号"><Input /></Form.Item></Col>
            <Col xs={24} sm={12}><Form.Item name="container_number" label="集装箱号"><Input /></Form.Item></Col>
            <Col xs={24} sm={12}><Form.Item name="shipped_date" label="发货日期"><Input type="date" /></Form.Item></Col>
            <Col xs={24} sm={12}><Form.Item name="etd" label="预计发货 ETD"><Input type="date" /></Form.Item></Col>
            <Col xs={24} sm={12}><Form.Item name="eta" label="预计到达 ETA"><Input type="date" /></Form.Item></Col>
            <Col xs={24}><Form.Item name="shipping_notes" label="备注"><Input.TextArea rows={2} /></Form.Item></Col>
          </Row>
        </Form>
      </Modal>
    </PageContainer>
  );
}
