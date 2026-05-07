import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Card, Descriptions, Table, Button, Space, Spin, Tag, Modal, Form, Input, InputNumber, Select, message, Row, Col, Tabs } from 'antd';
import { ArrowLeftOutlined, PlusOutlined, FileTextOutlined } from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../supabase';
import type { Order, Quotation } from '../../types';
import dayjs from 'dayjs';

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

  const createOrder = useMutation({
    mutationFn: async (values: Record<string, unknown>) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('未登录');
      const { error } = await supabase.from('orders').insert([{
        customer_id: id,
        pi_number: values.pi_number,
        order_type: values.order_type || 'normal',
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
          <Descriptions.Item label="邮箱">{customer?.email ?? '-'}</Descriptions.Item>
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
              (orders ?? []).map((order) => (
                <Card key={order.id} size="small" style={{ marginBottom: 12 }}
                  title={
                    <Space>
                      <Tag color={orderTypeColors[order.order_type]}>{orderTypeLabels[order.order_type]}</Tag>
                      <span>PI: {order.pi_number || '-'}</span>
                      <span>{order.date}</span>
                      {order.total_amount && <span style={{ fontWeight: 600 }}>¥{Number(order.total_amount).toFixed(2)}</span>}
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
                  {order.notes && <div style={{ marginTop: 8, color: '#666', fontSize: 13 }}>备注：{order.notes}</div>}
                </Card>
              ))
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
    </div>
  );
}
