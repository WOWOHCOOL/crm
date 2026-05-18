import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Card, Descriptions, Table, Button, Space, Spin, Tag, Modal, Form, Input, InputNumber, Select, message, Row, Col, Tabs, Tooltip } from 'antd';
import { ArrowLeftOutlined, PlusOutlined, FileTextOutlined, SendOutlined, CheckCircleOutlined } from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../supabase';
import type { Order, Quotation, Task, OrderStatus } from '../../types';
import { useAuth } from '../../auth/AuthContext';
import dayjs from 'dayjs';
import { withMobileLabels } from '../../utils/columns';

const orderTypeLabels: Record<string, string> = {
  normal: '正常订单',
  repeat: '返单',
  sample: '样品',
};

const orderTypeColors: Record<string, string> = {
  normal: 'blue',
  repeat: 'green',
  sample: 'orange',
};

const statusLabels: Record<OrderStatus, string> = {
  pending: '待确认',
  confirmed: '已确认',
  in_production: '生产中',
  shipped: '已发货',
  completed: '已完成',
};

const statusColors: Record<OrderStatus, string> = {
  pending: 'orange',
  confirmed: 'geekblue',
  in_production: 'purple',
  shipped: 'cyan',
  completed: 'green',
};

const statusFlow: OrderStatus[] = ['pending', 'confirmed', 'in_production', 'shipped', 'completed'];

const nextStatus: Record<OrderStatus, OrderStatus | null> = {
  pending: 'confirmed',
  confirmed: 'in_production',
  in_production: 'shipped',
  shipped: 'completed',
  completed: null,
};

const statusActionLabels: Record<OrderStatus, string> = {
  pending: '确认订单',
  confirmed: '开始生产',
  in_production: '标记发货',
  shipped: '标记完成',
  completed: '已完成',
};

export default function CustomerDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [orderModal, setOrderModal] = useState(false);
  const [orderForm] = Form.useForm();

  const { data: customer, isLoading } = useQuery({
    queryKey: ['customer', id],
    queryFn: async () => {
      const { data } = await supabase.from('customers').select('*').eq('id', id).single();
      return data;
    },
    enabled: !!id,
  });

  const { data: orders } = useQuery({
    queryKey: ['customer-orders', id],
    queryFn: async () => {
      const { data } = await supabase
        .from('orders')
        .select('*, order_items(*, products(*))')
        .eq('customer_id', id)
        .order('date', { ascending: false });
      return (data ?? []) as Order[];
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

  const { isOwner, isAdmin } = useAuth();
  const canManage = isOwner || isAdmin;
  const [shippingModalOpen, setShippingModalOpen] = useState(false);
  const [shippingOrder, setShippingOrder] = useState<Order | null>(null);
  const [shippingForm] = Form.useForm();

  const createOrder = useMutation({
    mutationFn: async (values: Record<string, unknown>) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('未登录');
      const { error } = await supabase.from('orders').insert([{
        customer_id: id,
        pi_number: values.pi_number,
        order_type: values.order_type || 'normal',
        status: values.status || 'pending',
        total_amount: values.total_amount ? Number(values.total_amount) : null,
        notes: values.notes,
        date: values.date ? dayjs(values.date as string).format('YYYY-MM-DD') : dayjs().format('YYYY-MM-DD'),
        user_id: user.id,
      }]);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['customer-orders'] });
      setOrderModal(false);
      orderForm.resetFields();
      message.success('订单已创建');
    },
    onError: (error: Error) => message.error(error.message),
  });

  const updateStatus = useMutation({
    mutationFn: async ({ orderId, status }: { orderId: string; status: OrderStatus }) => {
      const { error } = await supabase.from('orders').update({ status }).eq('id', orderId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['customer-orders'] });
      message.success('订单状态已更新');
    },
    onError: (error: Error) => message.error(error.message),
  });

  const updateShipping = useMutation({
    mutationFn: async ({ orderId, values }: { orderId: string; values: Record<string, unknown> }) => {
      const { error } = await supabase.from('orders').update({
        tracking_company: values.tracking_company || null,
        tracking_number: values.tracking_number || null,
        container_number: values.container_number || null,
        etd: values.etd ? dayjs(values.etd as string).format('YYYY-MM-DD') : null,
        eta: values.eta ? dayjs(values.eta as string).format('YYYY-MM-DD') : null,
        shipped_date: values.shipped_date ? dayjs(values.shipped_date as string).format('YYYY-MM-DD') : null,
        shipping_notes: values.shipping_notes || null,
      }).eq('id', orderId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['customer-orders'] });
      setShippingModalOpen(false);
      setShippingOrder(null);
      shippingForm.resetFields();
      message.success('出运信息已更新');
    },
    onError: (error: Error) => message.error(error.message),
  });

  if (isLoading) return <Spin />;

  const txColumns = [
    { title: '日期', dataIndex: 'date', key: 'date', width: 120 },
    { title: '类型', dataIndex: 'type', key: 'type', width: 80, render: (v: string) => <Tag color={v === 'income' ? 'green' : 'red'}>{v === 'income' ? '收入' : '支出'}</Tag> },
    { title: '金额', dataIndex: 'amount', key: 'amount', width: 120, render: (v: number) => `¥${v.toFixed(2)}` },
    { title: '科目', key: 'account', render: (_: unknown, r: Record<string, unknown>) => (r.accounts as Record<string, string> | null)?.name ?? '-' },
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
        <Descriptions bordered column={{ xs: 1, sm: 2, lg: 3 }}>
          <Descriptions.Item label="姓名">{customer?.name}</Descriptions.Item>
          <Descriptions.Item label="公司">{customer?.company ?? '-'}</Descriptions.Item>
          <Descriptions.Item label="国家">{customer?.country ?? '-'}</Descriptions.Item>
          <Descriptions.Item label="电话">{customer?.phone ?? '-'}</Descriptions.Item>
          <Descriptions.Item label="邮箱1">{customer?.email ?? '-'}</Descriptions.Item>
          <Descriptions.Item label="邮箱2">{customer?.email2 ?? '-'}</Descriptions.Item>
          <Descriptions.Item label="邮箱3">{customer?.email3 ?? '-'}</Descriptions.Item>
          <Descriptions.Item label="WhatsApp">{customer?.whatsapp ?? '-'}</Descriptions.Item>
          <Descriptions.Item label="LinkedIn">{customer?.linkedin ?? '-'}</Descriptions.Item>
          <Descriptions.Item label="官网">{customer?.website ? <a href={customer.website} target="_blank" rel="noreferrer">{customer.website}</a> : '-'}</Descriptions.Item>
          <Descriptions.Item label="来源">{customer?.source ?? '-'}</Descriptions.Item>
          <Descriptions.Item label="地址" span={2}>{customer?.address ?? '-'}</Descriptions.Item>
          <Descriptions.Item label="备注" span={3}>{customer?.notes ?? '-'}</Descriptions.Item>
        </Descriptions>
      </Card>

      <Card style={{ marginBottom: 24 }}
        extra={<Button type="primary" size="small" icon={<PlusOutlined />} onClick={() => setOrderModal(true)}>新建订单</Button>}>
        <Tabs defaultActiveKey="orders" items={[
          {
            key: 'orders',
            label: `订单 (${(orders ?? []).length})`,
            children: (orders ?? []).length === 0 ? (
              <div style={{ color: '#999', textAlign: 'center', padding: 24 }}>暂无订单</div>
            ) : (
              (orders ?? []).map((order) => {
                const curStatus = (order as Order).status || 'pending';
                const next = nextStatus[curStatus];
                return (
                <Card key={order.id} size="small" style={{ marginBottom: 12 }}
                  title={
                    <Space wrap>
                      <Tag color={orderTypeColors[order.order_type]}>{orderTypeLabels[order.order_type]}</Tag>
                      <Tag color={statusColors[curStatus]}>{statusLabels[curStatus]}</Tag>
                      <span>PI: {order.pi_number || '-'}</span>
                      <span>{order.date}</span>
                      {order.total_amount && <span style={{ fontWeight: 600 }}>¥{Number(order.total_amount).toFixed(2)}</span>}
                    </Space>
                  }
                  extra={
                    <Space>
                      {canManage && next && (
                        <Button size="small" type="primary"
                          onClick={() => updateStatus.mutate({ orderId: order.id, status: next })}>
                          {statusActionLabels[curStatus]}
                        </Button>
                      )}
                      {canManage && (curStatus === 'in_production' || curStatus === 'shipped') && (
                        <Button size="small" icon={<SendOutlined />}
                          onClick={() => {
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
                          }}>
                          出运信息
                        </Button>
                      )}
                    </Space>
                  }>
                  {order.order_items && order.order_items.length > 0 ? (
                    <Table dataSource={(order.order_items ?? []) as unknown as readonly Record<string, unknown>[]}
                      rowKey="id" pagination={false} size="small"
                      columns={[
                        { title: '型号', dataIndex: 'model', key: 'model' },
                        { title: '数量', dataIndex: 'quantity', key: 'quantity' },
                        { title: '单价', dataIndex: 'unit_price', key: 'unit_price', render: (v: number) => `¥${Number(v).toFixed(2)}` },
                        { title: '小计', key: 'subtotal', render: (_: unknown, r: Record<string, unknown>) => `¥${(Number(r.quantity) * Number(r.unit_price)).toFixed(2)}` },
                      ]} />
                  ) : <div style={{ color: '#999', fontSize: 12 }}>暂无明细</div>}

                  {/* 出运跟踪信息 */}
                  {(order as Order).tracking_company && (
                    <div style={{ marginTop: 8, padding: '6px 10px', background: '#f0f5ff', borderRadius: 4, fontSize: 13 }}>
                      <Space wrap>
                        {(order as Order).tracking_company && <span>承运: {(order as Order).tracking_company}</span>}
                        {(order as Order).tracking_number && <span>单号: {(order as Order).tracking_number}</span>}
                        {(order as Order).container_number && <span>箱号: {(order as Order).container_number}</span>}
                        {(order as Order).etd && <span>ETD: {(order as Order).etd}</span>}
                        {(order as Order).eta && <span>ETA: {(order as Order).eta}</span>}
                        {(order as Order).shipped_date && <span>发货日: {(order as Order).shipped_date}</span>}
                      </Space>
                      {(order as Order).shipping_notes && (
                        <div style={{ color: '#666', marginTop: 4 }}>备注: {(order as Order).shipping_notes}</div>
                      )}
                    </div>
                  )}

                  {order.notes && <div style={{ marginTop: 8, color: '#666', fontSize: 13 }}>备注：{order.notes}</div>}
                </Card>
              );})
            ),
          },
          {
            key: 'quotations',
            label: `报价单 (${(quotations ?? []).filter(q => q.type === 'quotation').length})`,
            children: (
              <Table dataSource={(quotations ?? []).filter(q => q.type === 'quotation')}
                rowKey="id" size="small" pagination={false}
                columns={[
                  { title: '编号', dataIndex: 'quotation_no', key: 'quotation_no' },
                  { title: '日期', dataIndex: 'created_at', key: 'created_at', render: (v: string) => new Date(v).toLocaleDateString('zh-CN') },
                  { title: '有效期', dataIndex: 'valid_days', key: 'valid_days', render: (v: number) => `${v}天` },
                ]}
                locale={{ emptyText: '暂无报价单' }} />
            ),
          },
          {
            key: 'pi',
            label: `PI (${(quotations ?? []).filter(q => q.type === 'pi').length})`,
            children: (
              <Table dataSource={(quotations ?? []).filter(q => q.type === 'pi')}
                rowKey="id" size="small" pagination={false}
                columns={[
                  { title: '编号', dataIndex: 'quotation_no', key: 'quotation_no' },
                  { title: '日期', dataIndex: 'created_at', key: 'created_at', render: (v: string) => new Date(v).toLocaleDateString('zh-CN') },
                  { title: '客户', dataIndex: 'customer_company', key: 'customer_company', render: (v: string | null) => v || '-' },
                ]}
                locale={{ emptyText: '暂无PI' }} />
            ),
          },
          {
            key: 'finance',
            label: `收支 (收入 ¥${totalIncome.toFixed(0)} / 支出 ¥${totalExpense.toFixed(0)})`,
            children: <Table dataSource={transactions ?? []} columns={txColumns} rowKey="id" pagination={{ pageSize: 10 }} size="small" />,
          },
          {
            key: 'tasks',
            label: `跟进任务 (${(tasks ?? []).filter(t => t.status === 'pending').length})`,
            children: (
              <Table dataSource={tasks ?? []}
                rowKey="id" size="small" pagination={false}
                columns={[
                  {
                    title: '状态', dataIndex: 'status', key: 'status', width: 70,
                    render: (v: string) => {
                      const colors: Record<string, string> = { pending: 'orange', completed: 'green', cancelled: 'default' };
                      const labels: Record<string, string> = { pending: '待处理', completed: '已完成', cancelled: '已取消' };
                      return <Tag color={colors[v]}>{labels[v]}</Tag>;
                    },
                  },
                  { title: '标题', dataIndex: 'title', key: 'title', width: 180 },
                  {
                    title: '优先级', dataIndex: 'priority', key: 'priority', width: 70,
                    render: (v: string) => {
                      const colors: Record<string, string> = { low: 'default', normal: 'blue', high: 'orange', urgent: 'red' };
                      const labels: Record<string, string> = { low: '低', normal: '中', high: '高', urgent: '紧急' };
                      return <Tag color={colors[v]}>{labels[v]}</Tag>;
                    },
                  },
                  {
                    title: '截止日期', dataIndex: 'due_date', key: 'due_date', width: 110,
                    render: (v: string | null) => v ? dayjs(v).format('YYYY-MM-DD') : '-',
                  },
                ]}
                locale={{ emptyText: '暂无跟进任务' }} />
            ),
          },
        ]} />
      </Card>

      <Modal
        title="新建订单"
        open={orderModal}
        onCancel={() => setOrderModal(false)}
        onOk={() => orderForm.submit()}
        confirmLoading={createOrder.isPending}
        destroyOnClose
      >
        <Form form={orderForm} layout="vertical" onFinish={(values) => createOrder.mutate(values)}>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="pi_number" label="PI 编号">
                <Input />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="order_type" label="订单类型" initialValue="normal">
                <Select options={[
                  { label: '正常订单', value: 'normal' },
                  { label: '返单', value: 'repeat' },
                  { label: '样品', value: 'sample' },
                ]} />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="status" label="初始状态" initialValue="pending">
                <Select options={[
                  { label: '待确认', value: 'pending' },
                  { label: '已确认', value: 'confirmed' },
                ]} />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="total_amount" label="订单金额">
                <InputNumber min={0} precision={2} style={{ width: '100%' }} prefix="¥" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="date" label="日期" initialValue={dayjs()}>
                <Input type="date" />
              </Form.Item>
            </Col>
            <Col span={24}>
              <Form.Item name="notes" label="备注">
                <Input.TextArea rows={2} />
              </Form.Item>
            </Col>
          </Row>
        </Form>
      </Modal>

      <Modal
        title="出运跟踪信息"
        open={shippingModalOpen}
        onCancel={() => { setShippingModalOpen(false); setShippingOrder(null); }}
        onOk={() => shippingForm.submit()}
        confirmLoading={updateShipping.isPending}
        destroyOnClose
        width={600}
      >
        <Form form={shippingForm} layout="vertical" onFinish={(values) => {
          if (!shippingOrder) return;
          updateShipping.mutate({ orderId: shippingOrder.id, values });
        }}>
          <Row gutter={16}>
            <Col xs={24} sm={12}>
              <Form.Item name="tracking_company" label="承运公司（船公司/快递）">
                <Input placeholder="如：COSCO、DHL" />
              </Form.Item>
            </Col>
            <Col xs={24} sm={12}>
              <Form.Item name="tracking_number" label="运单号/提单号">
                <Input placeholder="提单号或快递单号" />
              </Form.Item>
            </Col>
            <Col xs={24} sm={12}>
              <Form.Item name="container_number" label="集装箱号">
                <Input placeholder="如有" />
              </Form.Item>
            </Col>
            <Col xs={24} sm={12}>
              <Form.Item name="shipped_date" label="实际发货日期">
                <Input type="date" />
              </Form.Item>
            </Col>
            <Col xs={24} sm={12}>
              <Form.Item name="etd" label="预计发货 (ETD)">
                <Input type="date" />
              </Form.Item>
            </Col>
            <Col xs={24} sm={12}>
              <Form.Item name="eta" label="预计到达 (ETA)">
                <Input type="date" />
              </Form.Item>
            </Col>
            <Col xs={24}>
              <Form.Item name="shipping_notes" label="出货备注">
                <Input.TextArea rows={2} placeholder="其他出货相关信息" />
              </Form.Item>
            </Col>
          </Row>
        </Form>
      </Modal>
    </div>
  );
}
