import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Table, Button, Space, Input, Modal, Form, message, Popconfirm, Card, Row, Col,
} from 'antd';
import { PlusOutlined, SearchOutlined } from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../supabase';
import type { Customer } from '../../types';
import { logOperation } from '../../utils/log';
import { withMobileLabels } from '../../utils/columns';

export default function CustomerList() {
  const [search, setSearch] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Customer | null>(null);
  const [form] = Form.useForm();
  const queryClient = useQueryClient();
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

  const saveMutation = useMutation({
    mutationFn: async (values: Partial<Customer>) => {
      if (editing) {
        const { error } = await supabase.from('customers').update(values).eq('id', editing.id);
        if (error) throw error;
      } else {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) throw new Error('未登录');
        const { error } = await supabase.from('customers').insert([{ ...values, user_id: user.id }]);
        if (error) throw error;
      }
    },
    onSuccess: (_data, values) => {
      queryClient.invalidateQueries({ queryKey: ['customers'] });
      queryClient.invalidateQueries({ queryKey: ['customers-select'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] });
      setModalOpen(false);
      setEditing(null);
      form.resetFields();
      const isUpdate = !!editing;
      message.success(isUpdate ? '客户已更新' : '客户已添加');
      logOperation('customer', isUpdate ? 'update' : 'create', editing?.id, values.name);
    },
    onError: (error: Error) => message.error(error.message),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { data } = await supabase.from('customers').select('name').eq('id', id).single();
      const { error } = await supabase.from('customers').delete().eq('id', id);
      if (error) throw error;
      return data as { name: string } | null;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['customers'] });
      queryClient.invalidateQueries({ queryKey: ['customers-select'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] });
      message.success('客户已删除');
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

const columns: any[] = [
    { title: '姓名', dataIndex: 'name', key: 'name', width: 100, fixed: 'left' as const, onCell: () => ({ 'data-label': '姓名' }) },
    { title: '公司', dataIndex: 'company', key: 'company', width: 150, onCell: () => ({ 'data-label': '公司' }) },
    { title: '电话', dataIndex: 'phone', key: 'phone', width: 130, onCell: () => ({ 'data-label': '电话' }) },
    { title: '邮箱', dataIndex: 'email', key: 'email', width: 180, responsive: ['md'] as const },
    { title: 'WhatsApp', dataIndex: 'whatsapp', key: 'whatsapp', width: 140, responsive: ['md'] as const },
    { title: '国家', dataIndex: 'country', key: 'country', width: 80, responsive: ['md'] as const },
    { title: '来源', dataIndex: 'source', key: 'source', width: 100, responsive: ['md'] as const },
    {
      title: '操作',
      key: 'actions',
      width: 220,
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
        <Space style={{ marginBottom: 16, width: '100%', justifyContent: 'space-between' }}>
          <Space>
            <Input
              placeholder="搜索姓名/公司/电话/邮箱"
              prefix={<SearchOutlined />}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              allowClear
              style={{ maxWidth: 320, width: '100%' }}
            />
          </Space>
          <Button type="primary" icon={<PlusOutlined />} onClick={openAdd}>添加客户</Button>
        </Space>
        <Table
          dataSource={customers}
          columns={withMobileLabels(columns)}
          rowKey="id"
          loading={isLoading}
          pagination={{ pageSize: 20, showSizeChanger: true, showTotal: (t) => `共 ${t} 条` }}
          scroll={{ x: 1000 }}
        />
      </Card>
      <button className="crm-fab" onClick={openAdd} aria-label="添加客户">+</button>

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
                <Input placeholder="主邮箱" />
              </Form.Item>
            </Col>
            <Col xs={24} sm={12}>
              <Form.Item name="email2" label="邮箱2">
                <Input placeholder="备用邮箱" />
              </Form.Item>
            </Col>
            <Col xs={24} sm={12}>
              <Form.Item name="email3" label="邮箱3">
                <Input placeholder="其他邮箱" />
              </Form.Item>
            </Col>
            <Col xs={24} sm={12}>
              <Form.Item name="whatsapp" label="WhatsApp">
                <Input placeholder="+86 138xxxx" />
              </Form.Item>
            </Col>
            <Col xs={24} sm={12}>
              <Form.Item name="linkedin" label="LinkedIn">
                <Input placeholder="LinkedIn 链接" />
              </Form.Item>
            </Col>
            <Col xs={24} sm={12}>
              <Form.Item name="website" label="官网">
                <Input placeholder="https://" />
              </Form.Item>
            </Col>
            <Col xs={24} sm={12}>
              <Form.Item name="country" label="国家">
                <Input placeholder="如：中国、美国" />
              </Form.Item>
            </Col>
            <Col xs={24} sm={12}>
              <Form.Item name="source" label="来源">
                <Input placeholder="如：官网、展会、转介绍" />
              </Form.Item>
            </Col>
            <Col xs={24}>
              <Form.Item name="address" label="地址">
                <Input />
              </Form.Item>
            </Col>
            <Col xs={24}>
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
