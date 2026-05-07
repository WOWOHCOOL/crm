import { useState } from 'react';
import {
  Table, Button, Space, Input, Modal, Form, InputNumber, Switch,
  message, Popconfirm, Card, Row, Col, Tag, Image,
} from 'antd';
import { PlusOutlined, SearchOutlined } from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../supabase';
import type { Product } from '../../types';
import { logOperation } from '../../utils/log';
import { useAuth } from '../../auth/AuthContext';

export default function ProductList() {
  const { isOwner, isAdmin } = useAuth();
  const canEdit = isOwner || isAdmin;
  const [search, setSearch] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Product | null>(null);
  const [form] = Form.useForm();
  const queryClient = useQueryClient();

  const { data: products, isLoading } = useQuery({
    queryKey: ['products', search],
    queryFn: async () => {
      let query = supabase.from('products').select('*').order('official_model');
      if (search) {
        query = query.or(`official_model.ilike.%${search}%,supplier_model.ilike.%${search}%,supplier_name.ilike.%${search}%`);
      }
      const { data } = await query;
      return (data ?? []) as Product[];
    },
    staleTime: 0,
    refetchOnMount: true,
  });

  const saveMutation = useMutation({
    mutationFn: async (values: Partial<Product>) => {
      if (editing) {
        const { error } = await supabase.from('products').update(values).eq('id', editing.id);
        if (error) throw error;
      } else {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) throw new Error('未登录');
        const { error } = await supabase.from('products').insert([{ ...values, user_id: user.id }]);
        if (error) throw error;
      }
    },
    onSuccess: (_data, values) => {
      queryClient.invalidateQueries({ queryKey: ['products'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] });
      setModalOpen(false);
      setEditing(null);
      form.resetFields();
      const isUpdate = !!editing;
      message.success(isUpdate ? '商品已更新' : '商品已添加');
      logOperation('product', isUpdate ? 'update' : 'create', editing?.id, values.official_model);
    },
    onError: (error: Error) => message.error(error.message),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { data } = await supabase.from('products').select('official_model').eq('id', id).single();
      const { data: delData, error } = await supabase.from('products').delete().eq('id', id).select();
      if (error) throw error;
      if (!delData || delData.length === 0) throw new Error('无权删除此商品（可能由其他成员创建）');
      return data as { official_model: string } | null;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['products'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] });
      message.success('商品已删除');
      logOperation('product', 'delete', undefined, data?.official_model || '');
    },
    onError: (error: Error) => message.error(error.message),
  });

  const openEdit = (record: Product) => {
    setEditing(record);
    form.setFieldsValue(record);
    setModalOpen(true);
  };

  const columns = [
    {
      title: '图片', dataIndex: 'image_url', key: 'image_url', width: 60,
      render: (url: string | null) => url
        ? <Image src={url} style={{ width: 36, height: 36, objectFit: 'cover', borderRadius: 4 }} preview={false} />
        : <div style={{ width: 36, height: 36, background: '#f5f5f5', borderRadius: 4 }} />,
    },
    { title: '官网型号', dataIndex: 'official_model', key: 'official_model', width: 180 },
    { title: '供应商型号', dataIndex: 'supplier_model', key: 'supplier_model', width: 180 },
    { title: '供应商名称', dataIndex: 'supplier_name', key: 'supplier_name', width: 150 },
    ...(canEdit ? [{ title: '供货价', dataIndex: 'supply_price', key: 'supply_price', width: 120, render: (v: number | null) => v ? `¥${Number(v).toFixed(2)}` : '-' }] : []),
    { title: '建议报价', dataIndex: 'suggested_price', key: 'suggested_price', width: 120, render: (v: number | null) => v ? `¥${Number(v).toFixed(2)}` : '-' },
    {
      title: '含税', dataIndex: 'tax_included', key: 'tax_included', width: 80,
      render: (v: boolean) => <Tag color={v ? 'blue' : 'default'}>{v ? '含税' : '不含'}</Tag>,
    },
    ...(canEdit ? [{
      title: '操作', key: 'actions', width: 150,
      render: (_: unknown, record: Product) => (
        <Space>
          <Button size="small" onClick={() => openEdit(record)}>编辑</Button>
          <Popconfirm title="确定删除？" onConfirm={() => deleteMutation.mutate(record.id)}>
            <Button size="small" danger>删除</Button>
          </Popconfirm>
        </Space>
      ),
    }] : []),
  ];

  return (
    <div>
      <Card>
        <Space style={{ marginBottom: 16, width: '100%', justifyContent: 'space-between' }}>
          <Input
            placeholder="搜索型号 / 供应商"
            prefix={<SearchOutlined />}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            allowClear
            style={{ width: 280 }}
          />
          {canEdit && <Button type="primary" icon={<PlusOutlined />}
            onClick={() => { setEditing(null); form.resetFields(); setModalOpen(true); }}>
            添加商品
          </Button>}
        </Space>
        <Table
          dataSource={products}
          columns={columns}
          rowKey="id"
          loading={isLoading}
          pagination={{ pageSize: 20, showSizeChanger: true, showTotal: (t) => `共 ${t} 条` }}
          scroll={{ x: 800 }}
        />
      </Card>

      <Modal
        title={editing ? '编辑商品' : '添加商品'}
        open={modalOpen}
        onCancel={() => { setModalOpen(false); setEditing(null); }}
        onOk={() => form.submit()}
        confirmLoading={saveMutation.isPending}
        width={600}
        destroyOnClose
      >
        <Form form={form} layout="vertical" onFinish={(values) => saveMutation.mutate(values)}>
          <Row gutter={16}>
            <Col xs={24} sm={12}>
              <Form.Item name="official_model" label="官网产品型号" rules={[{ required: true, message: '请输入官网型号' }]}>
                <Input />
              </Form.Item>
            </Col>
            <Col xs={24} sm={12}>
              <Form.Item name="supplier_model" label="供应商型号">
                <Input />
              </Form.Item>
            </Col>
            <Col xs={24} sm={12}>
              <Form.Item name="supplier_name" label="供应商名称">
                <Input />
              </Form.Item>
            </Col>
            <Col xs={24} sm={12}>
              <Form.Item name="supply_price" label="供货价 (Supply Price)">
                <InputNumber min={0} precision={2} style={{ width: '100%' }} prefix="¥" />
              </Form.Item>
            </Col>
            <Col xs={24} sm={12}>
              <Form.Item name="suggested_price" label="建议报价 (Suggested Price)">
                <InputNumber min={0} precision={2} style={{ width: '100%' }} prefix="¥" />
              </Form.Item>
            </Col>
            <Col xs={24} sm={12}>
              <Form.Item name="tax_included" label="是否含税" valuePropName="checked" initialValue={false}>
                <Switch checkedChildren="含税" unCheckedChildren="不含" />
              </Form.Item>
            </Col>
            <Col xs={24}>
              <Form.Item name="image_url" label="产品图片链接">
                <Input placeholder="https://example.com/product.jpg" />
              </Form.Item>
            </Col>
          </Row>
        </Form>
      </Modal>
    </div>
  );
}
