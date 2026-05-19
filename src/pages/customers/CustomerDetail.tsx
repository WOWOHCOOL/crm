import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Card, Descriptions, Table, Button, Space, Spin, Tag, Modal, Form, Input, InputNumber, Select, Image, message, Row, Col, Tabs, Statistic } from 'antd';
import { ArrowLeftOutlined, PlusOutlined, SendOutlined, ShoppingCartOutlined, DollarOutlined, BellOutlined, FileTextOutlined, CheckCircleOutlined } from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../supabase';
import type { Order, Quotation, Task, OrderStatus } from '../../types';
import { useAuth } from '../../auth/AuthContext';
import dayjs from 'dayjs';

const orderTypeLabels: Record<string, string> = { normal: '正常订单', repeat: '返单', sample: '样品' };
const orderTypeColors: Record<string, string> = { normal: 'blue', repeat: 'green', sample: 'orange' };
const statusLabels: Record<OrderStatus, string> = { pending: '待确认', confirmed: '已确认', in_production: '生产中', shipped: '已发货', completed: '已完成' };
const statusColors: Record<OrderStatus, string> = { pending: 'orange', confirmed: 'geekblue', in_production: 'purple', shipped: 'cyan', completed: 'green' };
const statusFlow: OrderStatus[] = ['pending', 'confirmed', 'in_production', 'shipped', 'completed'];
const nextStatus: Record<OrderStatus, OrderStatus | null> = { pending: 'confirmed', confirmed: 'in_production', in_production: 'shipped', shipped: 'completed', completed: null };
const statusActionLabels: Record<OrderStatus, string> = { pending: '确认订单', confirmed: '开始生产', in_production: '标记发货', shipped: '标记完成', completed: '已完成' };

const SvgIcon = ({ type, size = 18 }: { type: string; size?: number }) => {
  const icons: Record<string, string> = {
    shopping: '<path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/><path d="M16 10a4 4 0 0 1-8 0"/>',
    dollar: '<line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>',
    bell: '<path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/>',
    file: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/>',
    check: '<polyline points="20 6 9 17 4 12"/>',
  };
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" dangerouslySetInnerHTML={{ __html: icons[type] || '' }} />;
};

export default function CustomerDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [orderModal, setOrderModal] = useState(false);
  const [orderForm] = Form.useForm();
  const { isOwner, isAdmin } = useAuth();
  const canManage = isOwner || isAdmin;
  const [shippingModalOpen, setShippingModalOpen] = useState(false);
  const [shippingOrder, setShippingOrder] = useState<Order | null>(null);
  const [shippingForm] = Form.useForm();

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

  const createOrder = useMutation({
    mutationFn: async (values: Record<string, unknown>) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('未登录');
      const { error } = await supabase.from('orders').insert([{
        customer_id: id, pi_number: values.pi_number, order_type: values.order_type || 'normal',
        status: values.status || 'pending', total_amount: values.total_amount ? Number(values.total_amount) : null,
        notes: values.notes,
        date: values.date ? dayjs(values.date as string).format('YYYY-MM-DD') : dayjs().format('YYYY-MM-DD'),
        user_id: user.id,
      }]);
      if (error) throw error;
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['customer-orders'] }); setOrderModal(false); orderForm.resetFields(); message.success('订单已创建'); },
    onError: (error: Error) => message.error(error.message),
  });

  const updateStatus = useMutation({
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

  if (isLoading) return <div style={{ display: 'flex', justifyContent: 'center', padding: 80 }}><Spin size="large" /></div>;

  const totalIncome = (transactions ?? []).filter((t: any) => t.type === 'income').reduce((s: number, t: any) => s + Number(t.amount), 0);
  const totalExpense = (transactions ?? []).filter((t: any) => t.type === 'expense').reduce((s: number, t: any) => s + Number(t.amount), 0);
  const pendingTasks = (tasks ?? []).filter((t: Task) => t.status === 'pending');
  const pendingOrders = (orders ?? []).filter((o: Order) => (o.status as string) !== 'completed');

  // Build activity timeline
  const activities: { date: string; text: string; type: string }[] = [];
  (orders ?? []).slice(0, 5).forEach((o: Order) => activities.push({ date: o.date, text: `订单 ${o.pi_number || ''} ${statusLabels[o.status] || o.status}`, type: 'order' }));
  (quotations ?? []).slice(0, 5).forEach((q: Quotation) => activities.push({ date: q.created_at, text: `报价 ${q.quotation_no}`, type: 'quo' }));
  (transactions ?? []).slice(0, 5).forEach((t: any) => activities.push({ date: t.date, text: `${t.type === 'income' ? '收入' : '支出'} ¥${Number(t.amount).toFixed(2)}`, type: t.type }));
  activities.sort((a, b) => b.date.localeCompare(a.date));

  const txColumns = [
    { title: '日期', dataIndex: 'date', key: 'date', width: 120, onCell: () => ({ 'data-label': '日期' } as any) },
    { title: '类型', dataIndex: 'type', key: 'type', width: 70, onCell: () => ({ 'data-label': '类型' } as any), render: (v: string) => <Tag color={v === 'income' ? 'green' : 'red'}>{v === 'income' ? '收入' : '支出'}</Tag> },
    { title: '金额', dataIndex: 'amount', key: 'amount', width: 110, onCell: () => ({ 'data-label': '金额' } as any), render: (v: number) => <span style={{ fontWeight: 600 }}>¥{v.toFixed(2)}</span> },
    { title: '科目', key: 'account', onCell: () => ({ 'data-label': '科目' } as any), render: (_: any, r: any) => (r.accounts as any)?.name ?? '-' },
  ];

  return (
    <div style={{ maxWidth: 1200, margin: '0 auto' }}>
      {/* ── Header ── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 8 }}>
        <Button icon={<ArrowLeftOutlined />} onClick={() => navigate('/customers')}>返回客户列表</Button>
        <Button type="primary" onClick={() => navigate(`/quotations/new?customer_id=${id}`)} icon={<FileTextOutlined />}>新建报价</Button>
      </div>

      {/* ── Customer Info Card ── */}
      <Card styles={{ body: { padding: '24px' } }} style={{ marginBottom: 20, borderRadius: 12, border: '1px solid #f0f0f0' }}>
        <Row gutter={[24, 16]} align="middle">
          <Col xs={24} md={8}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
              <div style={{ width: 56, height: 56, borderRadius: 14, background: 'linear-gradient(135deg,#d4a843,#b8922e)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24, color: '#fff', fontWeight: 700, flexShrink: 0 }}>
                {customer?.name?.charAt(0) || '?'}
              </div>
              <div>
                <div style={{ fontSize: 18, fontWeight: 700 }}>{customer?.name}</div>
                <div style={{ fontSize: 13, color: '#64748b' }}>{customer?.company || '-'}</div>
              </div>
            </div>
          </Col>
          <Col xs={12} md={4}><div style={{ fontSize: 12, color: '#94a3b8' }}>国家</div><div style={{ fontWeight: 600 }}>{customer?.country || '-'}</div></Col>
          <Col xs={12} md={4}><div style={{ fontSize: 12, color: '#94a3b8' }}>来源</div><div style={{ fontWeight: 600 }}>{customer?.source || '-'}</div></Col>
          <Col xs={12} md={4}><div style={{ fontSize: 12, color: '#94a3b8' }}>电话</div><div style={{ fontWeight: 600 }}>{customer?.phone || '-'}</div></Col>
          <Col xs={12} md={4}><div style={{ fontSize: 12, color: '#94a3b8' }}>邮箱</div><div style={{ fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis' }}>{customer?.email || '-'}</div></Col>
          {customer?.business_card && (
            <Col xs={24} style={{ marginTop: 8 }}>
              <div style={{ fontSize: 12, color: '#94a3b8', marginBottom: 6 }}>名片</div>
              <Image src={customer.business_card} width={160} style={{ borderRadius: 6, border: '1px solid #f0f0f0' }} />
            </Col>
          )}
        </Row>
        <Row gutter={[16, 8]} style={{ marginTop: 16, paddingTop: 16, borderTop: '1px solid #f5f5f5' }}>
          <Col xs={12} sm={6} lg={3} style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 20, fontWeight: 700, color: '#1677ff' }}>{(orders ?? []).length}</div>
            <div style={{ fontSize: 11, color: '#94a3b8' }}>总订单</div>
          </Col>
          <Col xs={12} sm={6} lg={3} style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 20, fontWeight: 700, color: '#52c41a' }}>¥{(totalIncome).toLocaleString()}</div>
            <div style={{ fontSize: 11, color: '#94a3b8' }}>总收入</div>
          </Col>
          <Col xs={12} sm={6} lg={3} style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 20, fontWeight: 700, color: '#fa8c16' }}>{pendingOrders.length}</div>
            <div style={{ fontSize: 11, color: '#94a3b8' }}>进行中订单</div>
          </Col>
          <Col xs={12} sm={6} lg={3} style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 20, fontWeight: 700, color: '#ff4d4f' }}>{pendingTasks.length}</div>
            <div style={{ fontSize: 11, color: '#94a3b8' }}>待办事项</div>
          </Col>
          <Col xs={12} sm={6} lg={3} style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 20, fontWeight: 700, color: '#722ed1' }}>{(quotations ?? []).length}</div>
            <div style={{ fontSize: 11, color: '#94a3b8' }}>报价/PI</div>
          </Col>
        </Row>
      </Card>

      {/* ── Tab Content ── */}
      <Card styles={{ body: { padding: 0 } }} style={{ borderRadius: 12, border: '1px solid #f0f0f0' }}>
        <Tabs defaultActiveKey="overview" style={{ padding: '0 4px' }} items={[
          // ═══ OVERVIEW ═══
          { key: 'overview', label: `总览`, children: (
            <div style={{ padding: '12px 20px 20px' }}>
              <Row gutter={[16, 16]}>
                <Col xs={24} lg={14}>
                  <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 12, color: '#1e293b' }}>最近动态</div>
                  {activities.slice(0, 10).length === 0 ? (
                    <div style={{ color: '#94a3b8', padding: 20, textAlign: 'center' }}>暂无动态</div>
                  ) : (
                    <div style={{ position: 'relative' }}>
                      {activities.slice(0, 10).map((a, i) => (
                        <div key={i} style={{ display: 'flex', gap: 12, paddingBottom: i < Math.min(activities.length, 10) - 1 ? 16 : 0, position: 'relative' }}>
                          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: 20 }}>
                            <div style={{ width: 8, height: 8, borderRadius: '50%', background: a.type === 'order' ? '#1677ff' : a.type === 'quo' ? '#722ed1' : a.type === 'income' ? '#52c41a' : '#ff4d4f', flexShrink: 0 }} />
                            {i < Math.min(activities.length, 10) - 1 && <div style={{ width: 1, flex: 1, background: '#f0f0f0', marginTop: 4 }} />}
                          </div>
                          <div style={{ flex: 1, paddingBottom: 0 }}>
                            <div style={{ fontSize: 13, color: '#334155' }}>{a.text}</div>
                            <div style={{ fontSize: 11, color: '#94a3b8' }}>{a.date}</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </Col>
                <Col xs={24} lg={10}>
                  <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 12, color: '#1e293b' }}>待办任务</div>
                  {pendingTasks.length === 0 ? (
                    <div style={{ color: '#94a3b8', padding: 20, textAlign: 'center' }}>暂无待办任务</div>
                  ) : (
                    pendingTasks.slice(0, 5).map((t: Task) => (
                      <div key={t.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid #f5f5f5', fontSize: 13 }}>
                        <span style={{ color: '#334155' }}>{t.title}</span>
                        <Tag color={t.priority === 'urgent' ? 'red' : t.priority === 'high' ? 'orange' : t.priority === 'normal' ? 'blue' : 'default'} style={{ flexShrink: 0 }}>
                          {t.priority === 'urgent' ? '紧急' : t.priority === 'high' ? '高' : t.priority === 'normal' ? '中' : '低'}
                        </Tag>
                      </div>
                    ))
                  )}
                  <div style={{ marginTop: 16, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <Button size="small" icon={<ShoppingCartOutlined />} onClick={() => setOrderModal(true)}>新建订单</Button>
                    <Button size="small" icon={<FileTextOutlined />} onClick={() => navigate(`/quotations/new?customer_id=${id}`)}>新建报价</Button>
                    <Button size="small" icon={<BellOutlined />} onClick={() => navigate('/tasks')}>新建任务</Button>
                  </div>
                </Col>
              </Row>
            </div>
          )},

          // ═══ ORDERS ═══
          { key: 'orders', label: `订单 (${(orders ?? []).length})`, children: (
            <div style={{ padding: '12px 20px 20px' }}>
              <div style={{ textAlign: 'right', marginBottom: 12 }}>
                <Button type="primary" size="small" icon={<PlusOutlined />} onClick={() => setOrderModal(true)}>新建订单</Button>
              </div>
              {(orders ?? []).length === 0 ? (
                <div style={{ color: '#94a3b8', textAlign: 'center', padding: 40 }}>暂无订单</div>
              ) : (
                (orders ?? []).map((order) => {
                  const curStatus = (order as Order).status || 'pending';
                  const next = nextStatus[curStatus];
                  return (
                  <Card key={order.id} size="small" style={{ marginBottom: 10, borderRadius: 8 }}
                    title={<Space wrap style={{ gap: 4 }}>
                      <Tag color={orderTypeColors[order.order_type]}>{orderTypeLabels[order.order_type]}</Tag>
                      <Tag color={statusColors[curStatus]}>{statusLabels[curStatus]}</Tag>
                      <span style={{ fontSize: 12 }}>PI: {order.pi_number || '-'}</span>
                      <span style={{ fontSize: 12 }}>{order.date}</span>
                      {order.total_amount && <span style={{ fontWeight: 600, fontSize: 13 }}>¥{Number(order.total_amount).toFixed(2)}</span>}
                    </Space>}
                    extra={canManage && next ? <Button size="small" type="primary" onClick={() => updateStatus.mutate({ orderId: order.id, status: next })}>{statusActionLabels[curStatus]}</Button> : undefined}>
                    {order.order_items && order.order_items.length > 0 ? (
                      <Table dataSource={order.order_items as any[]} rowKey="id" pagination={false} size="small"
                        columns={[
                          { title: '型号', dataIndex: 'model', key: 'model' },
                          { title: '数量', dataIndex: 'quantity', key: 'quantity' },
                          { title: '单价', dataIndex: 'unit_price', key: 'unit_price', render: (v: number) => `¥${Number(v).toFixed(2)}` },
                          { title: '小计', key: 'subtotal', render: (_: any, r: any) => `¥${(Number(r.quantity) * Number(r.unit_price)).toFixed(2)}` },
                        ]} />
                    ) : <div style={{ color: '#94a3b8', fontSize: 12, padding: 8 }}>暂无明细</div>}

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
                    {order.notes && <div style={{ marginTop: 6, color: '#64748b', fontSize: 12 }}>备注：{order.notes}</div>}
                  </Card>
                );})
              )}
            </div>
          )},

          // ═══ QUOTATIONS ═══
          { key: 'quotations', label: `报价单 (${(quotations ?? []).filter((q: Quotation) => q.type === 'quotation').length})`, children: (
            <div style={{ padding: '12px 20px 20px' }}>
              <Table dataSource={(quotations ?? []).filter((q: Quotation) => q.type === 'quotation')}
                rowKey="id" size="small" pagination={false}
                columns={[
                  { title: '编号', dataIndex: 'quotation_no', key: 'quotation_no' },
                  { title: '日期', dataIndex: 'created_at', key: 'created_at', render: (v: string) => new Date(v).toLocaleDateString('zh-CN') },
                  { title: '有效期', dataIndex: 'valid_days', key: 'valid_days', render: (v: number) => `${v}天` },
                  { title: '状态', dataIndex: 'status', key: 'status', render: (v: string) => v === 'draft' ? <Tag color="default">草稿</Tag> : <Tag color="green">已发送</Tag> },
                ]}
                locale={{ emptyText: '暂无报价单' }} />
            </div>
          )},

          // ═══ PI ═══
          { key: 'pi', label: `PI (${(quotations ?? []).filter((q: Quotation) => q.type === 'pi').length})`, children: (
            <div style={{ padding: '12px 20px 20px' }}>
              <Table dataSource={(quotations ?? []).filter((q: Quotation) => q.type === 'pi')}
                rowKey="id" size="small" pagination={false}
                columns={[
                  { title: '编号', dataIndex: 'quotation_no', key: 'quotation_no' },
                  { title: '日期', dataIndex: 'created_at', key: 'created_at', render: (v: string) => new Date(v).toLocaleDateString('zh-CN') },
                  { title: '状态', dataIndex: 'status', key: 'status', render: (v: string) => <Tag>{v === 'draft' ? '草稿' : '已发送'}</Tag> },
                ]}
                locale={{ emptyText: '暂无PI' }} />
            </div>
          )},

          // ═══ FINANCE ═══
          { key: 'finance', label: `收支 (¥${totalIncome.toFixed(0)} / ¥${totalExpense.toFixed(0)})`, children: (
            <div style={{ padding: '12px 20px 20px' }}>
              <Row gutter={16} style={{ marginBottom: 16 }}>
                <Col xs={12}><Card size="small"><Statistic title="总收入" value={totalIncome} precision={2} prefix="¥" valueStyle={{ color: '#52c41a' }} /></Card></Col>
                <Col xs={12}><Card size="small"><Statistic title="总支出" value={totalExpense} precision={2} prefix="¥" valueStyle={{ color: '#ff4d4f' }} /></Card></Col>
              </Row>
              <Table dataSource={transactions ?? []} columns={txColumns} rowKey="id" pagination={{ pageSize: 10 }} size="small" locale={{ emptyText: '暂无收支记录' }} />
            </div>
          )},

          // ═══ TASKS ═══
          { key: 'tasks', label: `任务 (${pendingTasks.length})`, children: (
            <div style={{ padding: '12px 20px 20px' }}>
              <Table dataSource={tasks ?? []} rowKey="id" size="small" pagination={false}
                columns={[
                  { title: '状态', dataIndex: 'status', key: 'status', width: 70, render: (v: string) => <Tag color={v === 'pending' ? 'orange' : v === 'completed' ? 'green' : 'default'}>{v === 'pending' ? '待处理' : v === 'completed' ? '已完成' : '已取消'}</Tag> },
                  { title: '标题', dataIndex: 'title', key: 'title', width: 180 },
                  { title: '优先级', dataIndex: 'priority', key: 'priority', width: 60, render: (v: string) => <Tag color={v === 'urgent' ? 'red' : v === 'high' ? 'orange' : v === 'normal' ? 'blue' : 'default'}>{v === 'urgent' ? '紧急' : v === 'high' ? '高' : v === 'normal' ? '中' : '低'}</Tag> },
                  { title: '截止', dataIndex: 'due_date', key: 'due_date', width: 100, render: (v: string | null) => v ? dayjs(v).format('MM-DD') : '-' },
                ]}
                locale={{ emptyText: '暂无跟进任务' }} />
            </div>
          )},
        ]} />
      </Card>

      <Modal title="新建订单" open={orderModal} onCancel={() => setOrderModal(false)} onOk={() => orderForm.submit()} confirmLoading={createOrder.isPending} destroyOnClose>
        <Form form={orderForm} layout="vertical" onFinish={(values) => createOrder.mutate(values)}>
          <Row gutter={16}>
            <Col span={12}><Form.Item name="pi_number" label="PI 编号"><Input /></Form.Item></Col>
            <Col span={12}><Form.Item name="order_type" label="订单类型" initialValue="normal"><Select options={[{ label: '正常订单', value: 'normal' }, { label: '返单', value: 'repeat' }, { label: '样品', value: 'sample' }]} /></Form.Item></Col>
            <Col span={12}><Form.Item name="status" label="初始状态" initialValue="pending"><Select options={[{ label: '待确认', value: 'pending' }, { label: '已确认', value: 'confirmed' }]} /></Form.Item></Col>
            <Col span={12}><Form.Item name="total_amount" label="金额"><InputNumber min={0} precision={2} style={{ width: '100%' }} prefix="¥" /></Form.Item></Col>
            <Col span={12}><Form.Item name="date" label="日期" initialValue={dayjs()}><Input type="date" /></Form.Item></Col>
            <Col span={24}><Form.Item name="notes" label="备注"><Input.TextArea rows={2} /></Form.Item></Col>
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
    </div>
  );
}
