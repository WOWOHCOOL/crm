import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Table, Button, Space, Input, Modal, Form, Select, message, Popconfirm, Card, Row, Col,
} from 'antd';
import { PlusOutlined, SearchOutlined } from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '../../supabase';
import { useApiMutation } from '../../hooks/useApiMutation';
import type { Customer } from '../../types';
import { logOperation } from '../../utils/log';

export default function CustomerList() {
  const [search, setSearch] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Customer | null>(null);
  const [form] = Form.useForm();
  const navigate = useNavigate();

  const { data: customers, isLoading } = useQuery({
    queryKey: ['customers', search],
    queryFn: async () => {
      let query = supabase.from('customers').select('*').order('created_at', { ascending: false });
      if (search) {
        query = query.or(`name.ilike.%${search}%,company.ilike.%${search}%,phone.ilike.%${search}%,email.ilike.%${search}%,country.ilike.%${search}%,source.ilike.%${search}%`);
      }
      const { data } = await query;
      return (data ?? []) as Customer[];
    },
    staleTime: 0,
    refetchOnMount: true,
  });

  const saveMutation = useApiMutation({
    mutationFn: async (values: Partial<Customer>) => {
      if (editing) {
        const { error } = await supabase.from('customers').update(values).eq('id', editing.id);
        if (error) throw error;
      } else {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) throw new Error('未登录');
        const { error } = await supabase.from('customers').insert([values]);
        if (error) throw error;
      }
    },
    invalidateKeys: [['customers'], ['customers-select'], ['dashboard-stats']],
    onSuccess: (_data, values) => {
      setModalOpen(false);
      setEditing(null);
      form.resetFields();
      logOperation('customer', editing ? 'update' : 'create', editing?.id, (values as Record<string, unknown>).name as string);
    },
  });

  const deleteMutation = useApiMutation({
    mutationFn: async (id: string) => {
      const { data } = await supabase.from('customers').select('name').eq('id', id).single();
      const { error } = await supabase.from('customers').delete().eq('id', id);
      if (error) throw error;
      return data as { name: string } | null;
    },
    successMsg: '客户已删除',
    invalidateKeys: [['customers'], ['customers-select'], ['dashboard-stats']],
    onSuccess: (data) => {
      logOperation('customer', 'delete', undefined, data?.name || '');
    },
  });

  const openEdit = (record: Customer) => {
    setEditing(record);
    form.setFieldsValue(record);
    setModalOpen(true);
  };

  const openAdd = () => {
    setEditing(null);
    form.resetFields();
    setModalOpen(true);
  };

  const columns = [
    { title: '姓名', dataIndex: 'name', key: 'name', width: 100, fixed: 'left' as const, onCell: () => ({ 'data-label': '姓名' } as React.TdHTMLAttributes<unknown>) },
    { title: '公司', dataIndex: 'company', key: 'company', width: 150, onCell: () => ({ 'data-label': '公司' } as React.TdHTMLAttributes<unknown>) },
    { title: '电话', dataIndex: 'phone', key: 'phone', width: 130, onCell: () => ({ 'data-label': '电话' } as React.TdHTMLAttributes<unknown>) },
    { title: '邮箱1', dataIndex: 'email', key: 'email', width: 160, onCell: () => ({ 'data-label': '邮箱1' } as React.TdHTMLAttributes<unknown>) },
    { title: '邮箱2', dataIndex: 'email2', key: 'email2', width: 160, onCell: () => ({ 'data-label': '邮箱2' } as React.TdHTMLAttributes<unknown>), render: (v: string | null) => v || '-' },
    { title: '邮箱3', dataIndex: 'email3', key: 'email3', width: 160, onCell: () => ({ 'data-label': '邮箱3' } as React.TdHTMLAttributes<unknown>), render: (v: string | null) => v || '-' },
    { title: 'WhatsApp', dataIndex: 'whatsapp', key: 'whatsapp', width: 140, onCell: () => ({ 'data-label': 'WhatsApp' } as React.TdHTMLAttributes<unknown>) },
    { title: '国家', dataIndex: 'country', key: 'country', width: 80, onCell: () => ({ 'data-label': '国家' } as React.TdHTMLAttributes<unknown>) },
    { title: '来源', dataIndex: 'source', key: 'source', width: 100, onCell: () => ({ 'data-label': '来源' } as React.TdHTMLAttributes<unknown>) },
    {
      title: '操作', key: 'actions', width: 220,
      render: (_: unknown, record: Customer) => (
        <Space>
          <Button size="small" onClick={() => openEdit(record)}>编辑</Button>
          <Button size="small" onClick={() => navigate(`/customers/${record.id}`)}>详情</Button>
          <Popconfirm title="确定删除此客户？" onConfirm={() => deleteMutation.mutate(record.id)}>
            <Button size="small" danger>删除</Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <div>
      <Card>
        <Space style={{ marginBottom: 16, width: '100%', justifyContent: 'space-between' }} wrap>
          <Input
            placeholder="搜索姓名/公司/电话/邮箱"
            prefix={<SearchOutlined />}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            allowClear
            style={{ maxWidth: 280, width: '100%' }}
          />
          <Button type="primary" icon={<PlusOutlined />} onClick={openAdd}>添加客户</Button>
        </Space>
        <Table
          dataSource={customers}
          columns={columns}
          rowKey="id"
          loading={isLoading}
          pagination={{ pageSize: 20, showSizeChanger: true, showTotal: (t) => `共 ${t} 条` }}
          scroll={{ x: 1000 }}
        />
      </Card>

      <Modal
        title={editing ? '编辑客户' : '添加客户'}
        open={modalOpen}
        onCancel={() => { setModalOpen(false); setEditing(null); }}
        onOk={() => form.submit()}
        confirmLoading={saveMutation.isPending}
        width={720}
        destroyOnClose
      >
        <Form form={form} layout="vertical" onFinish={(values) => saveMutation.mutate(values)}>
          <Row gutter={16}>
            <Col xs={24} sm={12}>
              <Form.Item name="name" label="姓名" rules={[{ required: true, message: '请输入姓名' }]}>
                <Input />
              </Form.Item>
            </Col>
            <Col xs={24} sm={12}>
              <Form.Item name="company" label="公司">
                <Input />
              </Form.Item>
            </Col>
            <Col xs={24} sm={12}>
              <Form.Item name="phone" label="电话">
                <Input />
              </Form.Item>
            </Col>
            <Col xs={24} sm={12}>
              <Form.Item name="email" label="邮箱1">
                <Input placeholder="main@example.com" />
              </Form.Item>
            </Col>
            <Col xs={24} sm={12}>
              <Form.Item name="email2" label="邮箱2">
                <Input placeholder="backup@example.com" />
              </Form.Item>
            </Col>
            <Col xs={24} sm={12}>
              <Form.Item name="email3" label="邮箱3">
                <Input placeholder="other@example.com" />
              </Form.Item>
            </Col>
            <Col xs={24} sm={12}>
              <Form.Item name="country" label="国家">
                <Input />
              </Form.Item>
            </Col>
            <Col xs={24} sm={12}>
              <Form.Item name="source" label="来源">
                <Select allowClear placeholder="选择来源" options={[
                  { label: '表单询盘', value: '表单询盘' },
                  { label: 'WhatsApp', value: 'WhatsApp' },
                  { label: '阿里国际站', value: '阿里国际站' },
                  { label: '展会', value: '展会' },
                  { label: 'Google Ads', value: 'Google Ads' },
                  { label: 'LinkedIn', value: 'LinkedIn' },
                  { label: 'Facebook', value: 'Facebook' },
                  { label: '朋友介绍', value: '朋友介绍' },
                  { label: '老客户推荐', value: '老客户推荐' },
                  { label: '其他', value: '其他' },
                ]} />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item name="notes" label="备注">
            <Input.TextArea rows={3} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
