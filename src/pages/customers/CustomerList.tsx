import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Table, Button, Space, Input, Modal, Form, Select, Upload, Image, message,
  Popconfirm, Card, Row, Col,
} from 'antd';
import { PlusOutlined, SearchOutlined, UploadOutlined } from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '../../supabase';
import { useApiMutation } from '../../hooks/useApiMutation';
import type { Customer } from '../../types';
import { logOperation } from '../../utils/log';

export default function CustomerList() {
  const [search, setSearch] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Customer | null>(null);
  const [cardPreview, setCardPreview] = useState<string | null>(null);
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
      const { business_card, ...rest } = values;
      const payload = { ...rest, business_card: business_card || null };
      if (editing) {
        const { error } = await supabase.from('customers').update(payload).eq('id', editing.id);
        if (error) throw error;
      } else {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) throw new Error('未登录');
        const { error } = await supabase.from('customers').insert([payload]);
        if (error) throw error;
      }
    },
    invalidateKeys: [['customers'], ['customers-select'], ['dashboard-stats']],
    onSuccess: (_data, values) => {
      setModalOpen(false);
      setEditing(null);
      setCardPreview(null);
      form.resetFields();
      logOperation('customer', editing ? 'update' : 'create', editing?.id, (values as Record<string, unknown>).name as string);
    },
  });

  const deleteMutation = useApiMutation({
    mutationFn: async (id: string) => {
      const { data } = await supabase.from('customers').select('name, business_card').eq('id', id).single();
      if (data?.business_card) {
        const path = data.business_card.split('/').pop();
        if (path) await supabase.storage.from('business-cards').remove([path]).catch(() => {});
      }
      const { error } = await supabase.from('customers').delete().eq('id', id);
      if (error) throw error;
      return data as { name: string } | null;
    },
    successMsg: '客户已删除',
    invalidateKeys: [['customers'], ['customers-select'], ['dashboard-stats']],
    onSuccess: (data) => { logOperation('customer', 'delete', undefined, data?.name || ''); },
  });

  const openEdit = (record: Customer) => {
    setEditing(record);
    setCardPreview(record.business_card || null);
    form.setFieldsValue(record);
    setModalOpen(true);
  };

  const openAdd = () => {
    setEditing(null);
    setCardPreview(null);
    form.resetFields();
    setModalOpen(true);
  };

  const handleUpload = async (file: File): Promise<boolean> => {
    const isImage = file.type.startsWith('image/');
    if (!isImage) { message.error('仅支持图片文件'); return false; }
    const isLt5M = file.size / 1024 / 1024 < 5;
    if (!isLt5M) { message.error('图片不能超过 5MB'); return false; }

    // Try Supabase Storage first
    if (supabase) {
      const ext = file.name.split('.').pop();
      const fileName = `${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;
      const { data: uploadData, error } = await supabase.storage
        .from('business-cards')
        .upload(fileName, file, { contentType: file.type });

      if (!error && uploadData) {
        const { data: { publicUrl } } = supabase.storage.from('business-cards').getPublicUrl(fileName);
        form.setFieldValue('business_card', publicUrl);
        setCardPreview(publicUrl);
        return false;
      }
      console.warn('Supabase Storage 上传失败，使用 base64 回退:', error?.message);
    }

    // Fallback: read as data URL
    const reader = new FileReader();
    reader.onload = (e) => {
      const dataUrl = e.target?.result as string;
      form.setFieldValue('business_card', dataUrl);
      setCardPreview(dataUrl);
    };
    reader.readAsDataURL(file);
    return false;
  };

  const columns = [
    { title: '姓名', dataIndex: 'name', key: 'name', width: 100, fixed: 'left' as const, onCell: () => ({ 'data-label': '姓名' } as React.TdHTMLAttributes<unknown>) },
    { title: '名片', key: 'card', width: 60, onCell: () => ({ 'data-label': '名片' } as React.TdHTMLAttributes<unknown>),
      render: (_: unknown, r: Customer) => r.business_card
        ? <Image src={r.business_card} width={36} height={36} style={{ borderRadius: 4, objectFit: 'cover', cursor: 'pointer' }} preview={{ mask: null }} />
        : '-' },
    { title: '公司', dataIndex: 'company', key: 'company', width: 150, onCell: () => ({ 'data-label': '公司' } as React.TdHTMLAttributes<unknown>) },
    { title: '电话', dataIndex: 'phone', key: 'phone', width: 130, onCell: () => ({ 'data-label': '电话' } as React.TdHTMLAttributes<unknown>) },
    { title: '邮箱1', dataIndex: 'email', key: 'email', width: 160, onCell: () => ({ 'data-label': '邮箱1' } as React.TdHTMLAttributes<unknown>) },
    { title: '邮箱2', dataIndex: 'email2', key: 'email2', width: 160, onCell: () => ({ 'data-label': '邮箱2' } as React.TdHTMLAttributes<unknown>), render: (v: string | null) => v || '-' },
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
        onCancel={() => { setModalOpen(false); setEditing(null); setCardPreview(null); }}
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
              <Form.Item name="country" label="国家">
                <Input />
              </Form.Item>
            </Col>
            <Col xs={24} sm={12}>
              <Form.Item name="source" label="来源">
                <Select allowClear placeholder="选择来源" options={[
                  { label: '表单询盘', value: '表单询盘' },
                  { label: 'WhatsApp', value: 'WhatsApp' },
                  { label: '展会', value: '展会' },
                  { label: 'LinkedIn', value: 'LinkedIn' },
                  { label: '老客户推荐', value: '老客户推荐' },
                  { label: '其他', value: '其他' },
                ]} />
              </Form.Item>
            </Col>
            <Col xs={24}>
              <Form.Item name="business_card" label="名片">
                <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                  <Upload
                    accept="image/*"
                    showUploadList={false}
                    beforeUpload={handleUpload}
                  >
                    <Button icon={<UploadOutlined />}>上传名片图片</Button>
                  </Upload>
                  {cardPreview && (
                    <div style={{ position: 'relative' }}>
                      <Image src={cardPreview} width={100} style={{ borderRadius: 6, border: '1px solid #f0f0f0' }} preview={{ mask: '点击预览' }} />
                      <Button size="small" danger type="text" style={{ position: 'absolute', top: -6, right: -6, minWidth: 20, height: 20, borderRadius: 10, fontSize: 11, background: '#fff', boxShadow: '0 2px 4px rgba(0,0,0,0.1)' }}
                        onClick={() => { form.setFieldValue('business_card', null); setCardPreview(null); }}>✕</Button>
                    </div>
                  )}
                </div>
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
