import { useState, useMemo, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  Table, Button, Space, Input, Modal, Form, Select, Upload, Image, message,
  Popconfirm, Card, Row, Col, Tag, Radio, Pagination, Skeleton, Tooltip,
} from 'antd';
import { PlusOutlined, SearchOutlined, UploadOutlined, AppstoreOutlined, UnorderedListOutlined } from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '../../supabase';
import { useApiMutation } from '../../hooks/useApiMutation';
import { useResponsive } from '../../hooks/useResponsive';
import type { Customer } from '../../types';
import { tokens, customerStatusMap } from '../../styles/theme';
import CustomerCard from '../../components/CustomerCard';
import ResponsiveTable from '../../components/ResponsiveTable';
import { TableSkeleton } from '../../components/Skeletons';
import { logOperation } from '../../utils/log';

const PAGE_SIZE = 20;
const VIEW_KEY = 'customer_view_mode';

export default function CustomerList() {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [cardPreview, setCardPreview] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [viewMode, setViewMode] = useState<'grid' | 'list'>(() => {
    return (localStorage.getItem(VIEW_KEY) as 'grid' | 'list') || 'grid';
  });
  const [form] = Form.useForm();
  const navigate = useNavigate();
  const { isMobile } = useResponsive();
  const [searchParams, setSearchParams] = useSearchParams();
  const editId = searchParams.get('edit') || undefined;
  const isAdding = searchParams.get('add') === '1';
  const modalOpen = !!editId || isAdding;

  // Restore draft from sessionStorage on mount (add mode only)
  useEffect(() => {
    if (editId) return;
    const draft = sessionStorage.getItem('customer_form_draft');
    if (!draft) return;
    try {
      const data = JSON.parse(draft);
      if (data.formValues) form.setFieldsValue(data.formValues);
      if (data.cardPreview) setCardPreview(data.cardPreview);
      sessionStorage.removeItem('customer_form_draft');
    } catch { /* ignore */ }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Save draft on visibility change and before unload (add mode only)
  const isEditMode = !!editId;
  useEffect(() => {
    if (isEditMode) return;
    const save = () => {
      sessionStorage.setItem('customer_form_draft', JSON.stringify({
        formValues: form.getFieldsValue(),
        cardPreview,
      }));
    };
    document.addEventListener('visibilitychange', save);
    window.addEventListener('beforeunload', save);
    return () => {
      document.removeEventListener('visibilitychange', save);
      window.removeEventListener('beforeunload', save);
    };
  }, [form, cardPreview, isEditMode]);

  const { data: customers, isLoading } = useQuery({
    queryKey: ['customers', search, statusFilter],
    queryFn: async () => {
      let query = supabase.from('customers').select('*').order('created_at', { ascending: false });
      if (search) {
        query = query.or(`name.ilike.%${search}%,company.ilike.%${search}%,phone.ilike.%${search}%,email.ilike.%${search}%,country.ilike.%${search}%,source.ilike.%${search}%`);
      }
      if (statusFilter !== 'all') {
        query = query.eq('status', statusFilter);
      }
      const { data } = await query;
      return (data ?? []) as Customer[];
    },
  });

  const editing = useMemo(() => {
    if (!editId || !customers) return null;
    return customers.find(c => c.id === editId) ?? null;
  }, [editId, customers]);

  useEffect(() => {
    if (editing) {
      setCardPreview(editing.business_card || null);
      form.setFieldsValue(editing);
    }
  }, [editing]); // eslint-disable-line react-hooks/exhaustive-deps

  const setModalParam = (params: Record<string, string | null>) => {
    const next = new URLSearchParams(searchParams);
    Object.entries(params).forEach(([k, v]) => {
      if (v === null) next.delete(k); else next.set(k, v);
    });
    setSearchParams(next, { replace: true });
  };

  const openEdit = (record: Customer) => {
    form.setFieldsValue(record);
    setCardPreview(record.business_card || null);
    setModalParam({ edit: record.id, add: null });
  };

  const openAdd = () => {
    form.resetFields();
    setCardPreview(null);
    setModalParam({ add: '1', edit: null });
  };

  const closeModal = () => {
    sessionStorage.removeItem('customer_form_draft');
    form.resetFields();
    setCardPreview(null);
    setModalParam({ add: null, edit: null });
  };

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
      sessionStorage.removeItem('customer_form_draft');
      closeModal();
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

  const handleUpload = async (file: File): Promise<boolean> => {
    const isImage = file.type.startsWith('image/');
    if (!isImage) { message.error('仅支持图片文件'); return false; }
    const isLt5M = file.size / 1024 / 1024 < 5;
    if (!isLt5M) { message.error('图片不能超过 5MB'); return false; }

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
    { title: '姓名', dataIndex: 'name', key: 'name', width: 100, fixed: 'left' as const },
    { title: '名片', key: 'card', width: 60,
      render: (_: unknown, r: Customer) => r.business_card
        ? <Image src={r.business_card} width={36} height={36} style={{ borderRadius: 4, objectFit: 'cover', cursor: 'pointer' }} preview={{ mask: null }} />
        : '-' },
    { title: '公司', dataIndex: 'company', key: 'company', width: 150 },
    { title: '国家', dataIndex: 'country', key: 'country', width: 80 },
    { title: '来源', dataIndex: 'source', key: 'source', width: 100 },
    { title: '状态', dataIndex: 'status', key: 'status', width: 80,
      render: (v: string) => {
        const item = customerStatusMap[v] || customerStatusMap.new;
        return <Tag color={item.color}>{item.label}</Tag>;
      },
    },
    { title: '操作', key: 'actions', width: 220,
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

  const total = customers?.length ?? 0;
  const pagedCustomers = (customers ?? []).slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const toggleView = (mode: 'grid' | 'list') => {
    setViewMode(mode);
    localStorage.setItem(VIEW_KEY, mode);
  };

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
        <Radio.Group
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          optionType="button"
          buttonStyle="solid"
          size="small"
          style={{ marginBottom: 16 }}
        >
          <Radio.Button value="all">全部</Radio.Button>
          <Radio.Button value="new">新线索</Radio.Button>
          <Radio.Button value="following">跟进中</Radio.Button>
          <Radio.Button value="dealt">已成交</Radio.Button>
          <Radio.Button value="closed">已关闭</Radio.Button>
        </Radio.Group>
        {/* View toggle + result count */}
        <div style={{ marginBottom: tokens.spacingMD, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: tokens.fontSizeSM, color: tokens.colorTextTertiary }}>共 {total} 条</span>
          <Tooltip title={viewMode === 'grid' ? '列表视图' : '卡片视图'}>
            <Button
              size="small"
              type="text"
              icon={viewMode === 'grid' ? <UnorderedListOutlined /> : <AppstoreOutlined />}
              onClick={() => toggleView(viewMode === 'grid' ? 'list' : 'grid')}
            />
          </Tooltip>
        </div>

        {isLoading ? (
          <TableSkeleton rows={isMobile ? 6 : 4} cols={4} />
        ) : viewMode === 'grid' ? (
          <>
            <Row gutter={[tokens.spacingLG, tokens.spacingLG]}>
              {pagedCustomers.map((c: Customer) => (
                <Col xs={24} sm={12} lg={8} xl={6} key={c.id}>
                  <CustomerCard
                    customer={c}
                    onClick={() => navigate(`/customers/${c.id}`)}
                    onEdit={() => openEdit(c)}
                    onDelete={() => deleteMutation.mutate(c.id)}
                  />
                </Col>
              ))}
            </Row>
            {total > PAGE_SIZE && (
              <div style={{ textAlign: 'center', marginTop: tokens.spacingXL }}>
                <Pagination
                  current={page}
                  total={total}
                  pageSize={PAGE_SIZE}
                  onChange={setPage}
                  showSizeChanger={false}
                  showTotal={(t) => `共 ${t} 条`}
                />
              </div>
            )}
          </>
        ) : (
          <ResponsiveTable
            dataSource={customers}
            columns={columns}
            rowKey="id"
            loading={isLoading}
            pagination={{ pageSize: PAGE_SIZE, showSizeChanger: true, showTotal: (t) => `共 ${t} 条` }}
            scroll={{ x: 800 }}
          />
        )}
      </Card>

      <Modal
        title={editing ? '编辑客户' : '添加客户'}
        open={modalOpen}
        onCancel={closeModal}
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
                  { label: 'WhatsApp', value: 'WhatsApp' },
                  { label: '邮件询盘', value: '邮件询盘' },
                  { label: '展会', value: '展会' },
                  { label: 'LinkedIn', value: 'LinkedIn' },
                  { label: '老客户推荐', value: '老客户推荐' },
                  { label: '其他', value: '其他' },
                ]} />
              </Form.Item>
            </Col>
            <Col xs={24} sm={12}>
              <Form.Item name="status" label="状态" initialValue="new">
                <Select options={[
                  { label: '新线索', value: 'new' },
                  { label: '跟进中', value: 'following' },
                  { label: '已成交', value: 'dealt' },
                  { label: '已关闭', value: 'closed' },
                ]} />
              </Form.Item>
            </Col>
            <Col xs={24}>
              <Form.Item name="inquiry_content" label="询盘内容">
                <Input.TextArea rows={3} placeholder="首次WhatsApp或邮件询盘的原始内容" />
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
