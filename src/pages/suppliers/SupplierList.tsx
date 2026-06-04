import { useState, useMemo, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  Button, Space, Input, Modal, Form, message,
  Popconfirm, Card, Row, Col, Pagination, Tooltip,
} from 'antd';
import { PlusOutlined, SearchOutlined, AppstoreOutlined, UnorderedListOutlined } from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../supabase';
import type { Supplier } from '../../types';
import { useAuth } from '../../auth/AuthContext';
import { useResponsive } from '../../hooks/useResponsive';
import { tokens } from '../../styles/theme';
import SupplierCard from '../../components/SupplierCard';
import ResponsiveTable from '../../components/ResponsiveTable';
import { TableSkeleton } from '../../components/Skeletons';
import { logOperation } from '../../utils/log';

const PAGE_SIZE = 20;
const VIEW_KEY = 'supplier_view_mode';

export default function SupplierList() {
  const { isOwner, isAdmin, orgInfo } = useAuth();
  const canEdit = isOwner || isAdmin;
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [viewMode, setViewMode] = useState<'grid' | 'list'>(() => {
    return (localStorage.getItem(VIEW_KEY) as 'grid' | 'list') || 'grid';
  });
  const [form] = Form.useForm();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { isMobile } = useResponsive();
  const [searchParams, setSearchParams] = useSearchParams();
  const editId = searchParams.get('edit') || undefined;
  const isAdding = searchParams.get('add') === '1';
  const modalOpen = !!editId || isAdding;

  // Restore draft
  useEffect(() => {
    if (editId) return;
    const draft = sessionStorage.getItem('supplier_form_draft');
    if (!draft) return;
    try {
      const data = JSON.parse(draft);
      if (data.formValues) form.setFieldsValue(data.formValues);
      sessionStorage.removeItem('supplier_form_draft');
    } catch { /* ignore */ }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Save draft
  const isEditMode = !!editId;
  useEffect(() => {
    if (isEditMode) return;
    const save = () => {
      sessionStorage.setItem('supplier_form_draft', JSON.stringify({ formValues: form.getFieldsValue() }));
    };
    document.addEventListener('visibilitychange', save);
    window.addEventListener('beforeunload', save);
    return () => {
      document.removeEventListener('visibilitychange', save);
      window.removeEventListener('beforeunload', save);
    };
  }, [form, isEditMode]);

  const { data: suppliers, isLoading } = useQuery({
    queryKey: ['suppliers', search],
    queryFn: async () => {
      let query = supabase.from('suppliers').select('*').order('name');
      if (search) {
        query = query.or(`name.ilike.%${search}%,contact_person.ilike.%${search}%,phone.ilike.%${search}%`);
      }
      const { data } = await query;
      return (data ?? []) as Supplier[];
    },
  });

  const { data: purchaseStats } = useQuery({
    queryKey: ['purchase-stats'],
    queryFn: async () => {
      const { data } = await supabase.from('purchase_orders').select('supplier_id, total_amount');
      const counts: Record<string, { count: number; amount: number }> = {};
      (data ?? []).forEach((p: { supplier_id: string | null; total_amount: number | null }) => {
        if (!p.supplier_id) return;
        if (!counts[p.supplier_id]) counts[p.supplier_id] = { count: 0, amount: 0 };
        counts[p.supplier_id].count++;
        counts[p.supplier_id].amount += Number(p.total_amount || 0);
      });
      return counts;
    },
  });

  const { data: productCounts } = useQuery({
    queryKey: ['product-counts-by-supplier'],
    queryFn: async () => {
      const { data } = await supabase.from('products').select('supplier_id').not('supplier_id', 'is', null);
      const counts: Record<string, number> = {};
      (data ?? []).forEach((p: { supplier_id: string }) => {
        counts[p.supplier_id] = (counts[p.supplier_id] || 0) + 1;
      });
      return counts;
    },
  });

  const editing = useMemo(() => {
    if (!editId || !suppliers) return null;
    return suppliers.find(s => s.id === editId) ?? null;
  }, [editId, suppliers]);

  useEffect(() => {
    if (editing) form.setFieldsValue(editing);
  }, [editing]); // eslint-disable-line react-hooks/exhaustive-deps

  const setModalParam = (params: Record<string, string | null>) => {
    const next = new URLSearchParams(searchParams);
    Object.entries(params).forEach(([k, v]) => {
      if (v === null) next.delete(k); else next.set(k, v);
    });
    setSearchParams(next, { replace: true });
  };

  const openEdit = (record: Supplier) => {
    form.setFieldsValue(record);
    setModalParam({ edit: record.id, add: null });
  };

  const openAdd = () => {
    form.resetFields();
    setModalParam({ add: '1', edit: null });
  };

  const closeModal = () => {
    sessionStorage.removeItem('supplier_form_draft');
    form.resetFields();
    setModalParam({ add: null, edit: null });
  };

  const saveMutation = useMutation({
    mutationFn: async (values: Partial<Supplier>) => {
      if (editId) {
        const { error } = await supabase.from('suppliers').update(values).eq('id', editId);
        if (error) throw error;
      } else {
        if (!orgInfo?.org_id) throw new Error('未找到组织信息');
        const { data: { user } } = await supabase.auth.getUser();
        const { error } = await supabase.from('suppliers').insert([{ ...values, org_id: orgInfo.org_id, user_id: user?.id }]);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['suppliers'] });
      closeModal();
      message.success(editId ? '供应商已更新' : '供应商已添加');
      logOperation('supplier', editId ? 'update' : 'create');
    },
    onError: (error: Error) => message.error(error.message),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('suppliers').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['suppliers'] });
      message.success('供应商已删除');
      logOperation('supplier', 'delete');
    },
    onError: (error: Error) => message.error(error.message),
  });

  const columns = [
    { title: '供应商名称', dataIndex: 'name', key: 'name', render: (v: string, r: Supplier) => <a onClick={() => navigate(`/suppliers/${r.id}`)}>{v}</a> },
    { title: '联系人', dataIndex: 'contact_person', key: 'contact_person', width: 100 },
    { title: '电话', dataIndex: 'phone', key: 'phone', width: 130 },
    { title: '产品数', key: 'productCount', width: 70, render: (_: unknown, r: Supplier) => productCounts?.[r.id] || 0 },
    { title: '采购次数', key: 'purchaseCount', width: 80, render: (_: unknown, r: Supplier) => purchaseStats?.[r.id]?.count || 0 },
    { title: '采购金额', key: 'purchaseAmount', width: 110, render: (_: unknown, r: Supplier) => {
      const amt = purchaseStats?.[r.id]?.amount || 0;
      return amt ? `¥${Number(amt).toFixed(2)}` : '-';
    } },
    ...(canEdit ? [{
      title: '操作', key: 'actions', width: 120,
      render: (_: unknown, record: Supplier) => (
        <Space>
          <Button size="small" onClick={() => openEdit(record)}>编辑</Button>
          <Popconfirm title="删除后无法恢复，确定删除此供应商？" onConfirm={() => deleteMutation.mutate(record.id)} okText="确认删除" cancelText="取消"><Button size="small" danger>删除</Button></Popconfirm>
        </Space>
      ),
    }] : []),
  ];

  const total = suppliers?.length ?? 0;
  const paged = (suppliers ?? []).slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const toggleView = (mode: 'grid' | 'list') => {
    setViewMode(mode);
    localStorage.setItem(VIEW_KEY, mode);
  };

  return (
    <div>
      <Card>
        <Space style={{ marginBottom: tokens.spacingLG, width: '100%', justifyContent: 'space-between' }} wrap>
          <Input
            placeholder="搜索供应商名称/联系人"
            prefix={<SearchOutlined />}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            allowClear
            style={{ maxWidth: 280, width: '100%' }}
          />
          {canEdit && <Button type="primary" icon={<PlusOutlined />} onClick={openAdd}>添加供应商</Button>}
        </Space>

        {/* View toggle + count */}
        <div style={{ marginBottom: tokens.spacingMD, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: tokens.fontSizeSM, color: tokens.colorTextTertiary }}>共 {total} 条</span>
          <Tooltip title={viewMode === 'grid' ? '列表视图' : '卡片视图'}>
            <Button size="small" type="text"
              icon={viewMode === 'grid' ? <UnorderedListOutlined /> : <AppstoreOutlined />}
              onClick={() => toggleView(viewMode === 'grid' ? 'list' : 'grid')} />
          </Tooltip>
        </div>

        {isLoading ? (
          <TableSkeleton rows={isMobile ? 4 : 3} cols={3} />
        ) : viewMode === 'grid' ? (
          <>
            <Row gutter={[tokens.spacingLG, tokens.spacingLG]}>
              {paged.map((s: Supplier) => (
                <Col xs={24} sm={12} lg={8} xl={6} key={s.id}>
                  <SupplierCard
                    supplier={s}
                    productCount={productCounts?.[s.id] || 0}
                    purchaseCount={purchaseStats?.[s.id]?.count || 0}
                    purchaseAmount={purchaseStats?.[s.id]?.amount || 0}
                    onClick={() => navigate(`/suppliers/${s.id}`)}
                    onEdit={canEdit ? () => openEdit(s) : undefined}
                    onDelete={canEdit ? () => deleteMutation.mutate(s.id) : undefined}
                  />
                </Col>
              ))}
            </Row>
            {total > PAGE_SIZE && (
              <div style={{ textAlign: 'center', marginTop: tokens.spacingXL }}>
                <Pagination current={page} total={total} pageSize={PAGE_SIZE} onChange={setPage} showSizeChanger={false} showTotal={(t) => `共 ${t} 条`} />
              </div>
            )}
          </>
        ) : (
          <ResponsiveTable
            dataSource={suppliers}
            columns={columns}
            rowKey="id"
            loading={isLoading}
            pagination={{ pageSize: PAGE_SIZE, showSizeChanger: true, showTotal: (t) => `共 ${t} 条` }}
            scroll={{ x: 600 }}
          />
        )}
      </Card>

      {/* Add/Edit modal */}
      <Modal
        title={editing ? '编辑供应商' : '添加供应商'}
        open={modalOpen}
        onCancel={closeModal}
        onOk={() => form.submit()}
        confirmLoading={saveMutation.isPending}
        width={600}
        destroyOnClose
      >
        <Form form={form} layout="vertical" onFinish={(values) => saveMutation.mutate(values)}>
          <Form.Item name="name" label="供应商名称" rules={[{ required: true, message: '请输入供应商名称' }]}>
            <Input />
          </Form.Item>
          <Row gutter={16}>
            <Col xs={24} sm={12}><Form.Item name="contact_person" label="联系人"><Input /></Form.Item></Col>
            <Col xs={24} sm={12}><Form.Item name="phone" label="电话"><Input /></Form.Item></Col>
            <Col xs={24} sm={12}><Form.Item name="email" label="邮箱"><Input /></Form.Item></Col>
            <Col xs={24} sm={12}><Form.Item name="payment_terms" label="付款条件"><Input placeholder="如 T/T 30%" /></Form.Item></Col>
          </Row>
          <Form.Item name="address" label="地址"><Input /></Form.Item>
          <Form.Item name="tax_id" label="纳税识别号"><Input placeholder="统一社会信用代码" /></Form.Item>
          <Row gutter={16}>
            <Col xs={24} sm={12}><Form.Item name="bank_account_name" label="开户名"><Input placeholder="公司全称" /></Form.Item></Col>
            <Col xs={24} sm={12}><Form.Item name="bank_account_number" label="账号"><Input placeholder="银行账号" /></Form.Item></Col>
          </Row>
          <Form.Item name="bank_name" label="开户行"><Input placeholder="如：中国银行深圳分行" /></Form.Item>
          <Form.Item name="bank_info" label="其他银行信息"><Input.TextArea rows={2} /></Form.Item>
          <Form.Item name="notes" label="备注"><Input.TextArea rows={2} /></Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
