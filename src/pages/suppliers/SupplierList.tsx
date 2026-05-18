import { useState } from 'react';
import {
  Table, Button, Space, Input, Modal, Form, message,
  Popconfirm, Card, Tag, Descriptions, Spin,
} from 'antd';
import { PlusOutlined, SearchOutlined, TeamOutlined } from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../supabase';
import type { Supplier } from '../../types';
import { logOperation } from '../../utils/log';
import { useAuth } from '../../auth/AuthContext';
import { withMobileLabels } from '../../utils/columns';

export default function SupplierList() {
  const { isOwner, isAdmin, orgInfo } = useAuth();
  const canEdit = isOwner || isAdmin;
  const [search, setSearch] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Supplier | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailSupplier, setDetailSupplier] = useState<Supplier | null>(null);
  const [form] = Form.useForm();
  const queryClient = useQueryClient();

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
    staleTime: 0,
    refetchOnMount: true,
  });

  // Get purchase stats per supplier
  const { data: purchaseStats } = useQuery({
    queryKey: ['purchase-stats'],
    queryFn: async () => {
      const { data } = await supabase
        .from('purchase_orders')
        .select('supplier_id, total_amount');
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

  // Get product count per supplier
  const { data: productCounts } = useQuery({
    queryKey: ['product-counts-by-supplier'],
    queryFn: async () => {
      const { data } = await supabase
        .from('products')
        .select('supplier_id')
        .not('supplier_id', 'is', null);
      const counts: Record<string, number> = {};
      (data ?? []).forEach((p: { supplier_id: string }) => {
        counts[p.supplier_id] = (counts[p.supplier_id] || 0) + 1;
      });
      return counts;
    },
  });

  const { data: supplierProducts } = useQuery({
    queryKey: ['supplier-products', detailSupplier?.id],
    queryFn: async () => {
      if (!detailSupplier) return [];
      const { data } = await supabase
        .from('products')
        .select('*')
        .eq('supplier_id', detailSupplier.id);
      return data ?? [];
    },
    enabled: !!detailSupplier,
  });

  const { data: supplierPurchases } = useQuery({
    queryKey: ['supplier-purchases', detailSupplier?.id],
    queryFn: async () => {
      if (!detailSupplier) return [];
      const { data } = await supabase
        .from('purchase_orders')
        .select('order_no, order_date, total_amount, status, created_at')
        .eq('supplier_id', detailSupplier.id)
        .order('created_at', { ascending: false });
      return data ?? [];
    },
    enabled: !!detailSupplier,
  });

  const saveMutation = useMutation({
    mutationFn: async (values: Partial<Supplier>) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('未登录');
      if (editing) {
        const { error } = await supabase.from('suppliers').update(values).eq('id', editing.id);
        if (error) throw error;
      } else {
        if (!orgInfo?.org_id) throw new Error('未找到组织信息');
        const { error } = await supabase.from('suppliers').insert([{ ...values, org_id: orgInfo.org_id, user_id: user.id }]);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['suppliers'] });
      setModalOpen(false);
      setEditing(null);
      form.resetFields();
      message.success(editing ? '供应商已更新' : '供应商已添加');
      logOperation('supplier', editing ? 'update' : 'create');
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

  const openEdit = (record: Supplier) => {
    setEditing(record);
    form.setFieldsValue(record);
    setModalOpen(true);
  };

  const showDetail = (record: Supplier) => {
    setDetailSupplier(record);
    setDetailOpen(true);
  };

  const columns = [
    { title: '供应商名称', dataIndex: 'name', key: 'name', render: (v: string, r: Supplier) => <a onClick={() => showDetail(r)}>{v}</a> },
    { title: '联系人', dataIndex: 'contact_person', key: 'contact_person', width: 100 },
    { title: '电话', dataIndex: 'phone', key: 'phone', width: 120 },
    { title: '产品数', key: 'productCount', width: 70, render: (_: unknown, r: Supplier) => (
      <a onClick={() => showDetail(r)} style={{ fontWeight: 500 }}>{productCounts?.[r.id] || 0}</a>
    ) },
    { title: '采购次数', key: 'purchaseCount', width: 80, render: (_: unknown, r: Supplier) => purchaseStats?.[r.id]?.count || 0 },
    { title: '采购金额', key: 'purchaseAmount', width: 120, render: (_: unknown, r: Supplier) => {
      const amt = purchaseStats?.[r.id]?.amount || 0;
      return amt ? `¥${Number(amt).toFixed(2)}` : '-';
    } },
    ...(canEdit ? [{
      title: '操作', key: 'actions', width: 140,
      render: (_: unknown, record: Supplier) => (
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
      <Card title="供应商资料">
        <Space style={{ marginBottom: 16, width: '100%', justifyContent: 'space-between' }}>
          <Input
            placeholder="搜索供应商名称/联系人"
            prefix={<SearchOutlined />}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            allowClear
            style={{ width: 280 }}
          />
          {canEdit && <Button type="primary" icon={<PlusOutlined />}
            onClick={() => { setEditing(null); form.resetFields(); setModalOpen(true); }}>
            添加供应商
          </Button>}
        </Space>
        <Table
          dataSource={suppliers}
          columns={withMobileLabels(columns)}
          rowKey="id"
          loading={isLoading}
          pagination={{ pageSize: 20, showSizeChanger: true, showTotal: (t) => `共 ${t} 条` }}
          scroll={{ x: 600 }}
        />
      </Card>

      <Modal
        title={editing ? '编辑供应商' : '添加供应商'}
        open={modalOpen}
        onCancel={() => { setModalOpen(false); setEditing(null); }}
        onOk={() => form.submit()}
        confirmLoading={saveMutation.isPending}
        width={600}
        destroyOnClose
      >
        <Form form={form} layout="vertical" onFinish={(values) => saveMutation.mutate(values)}>
          <Form.Item name="name" label="供应商名称" rules={[{ required: true, message: '请输入供应商名称' }]}>
            <Input />
          </Form.Item>
          <Space style={{ width: '100%' }} size={16}>
            <Form.Item name="contact_person" label="联系人" style={{ flex: 1 }}>
              <Input />
            </Form.Item>
            <Form.Item name="phone" label="电话" style={{ flex: 1 }}>
              <Input />
            </Form.Item>
          </Space>
          <Space style={{ width: '100%' }} size={16}>
            <Form.Item name="email" label="邮箱" style={{ flex: 1 }}>
              <Input />
            </Form.Item>
            <Form.Item name="payment_terms" label="付款条件" style={{ flex: 1 }}>
              <Input placeholder="如 T/T 30%" />
            </Form.Item>
          </Space>
          <Form.Item name="address" label="地址">
            <Input />
          </Form.Item>
          <Form.Item name="tax_id" label="纳税识别号">
            <Input placeholder="统一社会信用代码" />
          </Form.Item>
          <Space style={{ width: '100%' }} size={16}>
            <Form.Item name="bank_account_name" label="开户名" style={{ flex: 1 }}>
              <Input placeholder="公司全称" />
            </Form.Item>
            <Form.Item name="bank_account_number" label="账号" style={{ flex: 1 }}>
              <Input placeholder="银行账号" />
            </Form.Item>
          </Space>
          <Form.Item name="bank_name" label="开户行">
            <Input placeholder="如：中国银行深圳分行" />
          </Form.Item>
          <Form.Item name="bank_info" label="其他银行信息">
            <Input.TextArea rows={2} placeholder="其他银行备注（选填）" />
          </Form.Item>
          <Form.Item name="notes" label="备注">
            <Input.TextArea rows={2} />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title={detailSupplier ? detailSupplier.name : ''}
        open={detailOpen}
        onCancel={() => { setDetailOpen(false); setDetailSupplier(null); }}
        footer={null}
        width={700}
      >
        {detailSupplier && (
          <>
            <Descriptions bordered column={2} size="small" style={{ marginBottom: 16 }}>
              <Descriptions.Item label="联系人">{detailSupplier.contact_person || '-'}</Descriptions.Item>
              <Descriptions.Item label="电话">{detailSupplier.phone || '-'}</Descriptions.Item>
              <Descriptions.Item label="邮箱">{detailSupplier.email || '-'}</Descriptions.Item>
              <Descriptions.Item label="付款条件">{detailSupplier.payment_terms || '-'}</Descriptions.Item>
              <Descriptions.Item label="地址" span={2}>{detailSupplier.address || '-'}</Descriptions.Item>
              <Descriptions.Item label="纳税识别号">{detailSupplier.tax_id || '-'}</Descriptions.Item>
              <Descriptions.Item label="开户名">{detailSupplier.bank_account_name || '-'}</Descriptions.Item>
              <Descriptions.Item label="账号">{detailSupplier.bank_account_number || '-'}</Descriptions.Item>
              <Descriptions.Item label="开户行">{detailSupplier.bank_name || '-'}</Descriptions.Item>
              <Descriptions.Item label="其他银行信息" span={2}>{detailSupplier.bank_info || '-'}</Descriptions.Item>
              <Descriptions.Item label="备注" span={2}>{detailSupplier.notes || '-'}</Descriptions.Item>
            </Descriptions>

            <div style={{ fontWeight: 600, marginBottom: 8, fontSize: 15 }}>
              <TeamOutlined style={{ marginRight: 6 }} />
              供应的产品 ({supplierProducts?.length || 0})
            </div>
            {supplierProducts && supplierProducts.length > 0 ? (
              <Table dataSource={supplierProducts as Record<string, unknown>[]}
                rowKey="id" size="small" pagination={false}
                columns={[
                  { title: '型号', dataIndex: 'official_model', key: 'official_model' },
                  { title: '供货价', dataIndex: 'supply_price', key: 'supply_price', render: (v: number | null) => v ? `¥${Number(v).toFixed(2)}` : '-' },
                  { title: '建议报价', dataIndex: 'suggested_price', key: 'suggested_price', render: (v: number | null) => v ? `¥${Number(v).toFixed(2)}` : '-' },
                ]} />
            ) : (
              <div style={{ color: '#999', padding: 12 }}>暂无关联产品</div>
            )}

            <div style={{ background: '#f5f5f5', padding: '8px 12px', borderRadius: 6, margin: '16px 0 8px', display: 'flex', gap: 32 }}>
              <span>采购次数：<strong>{supplierPurchases?.length || 0}</strong> 次</span>
              <span>累计金额：<strong>¥{Number(supplierPurchases?.reduce((s: number, p: Record<string, unknown>) => s + Number(p.total_amount || 0), 0) || 0).toFixed(2)}</strong></span>
            </div>

            <div style={{ fontWeight: 600, marginBottom: 8, fontSize: 15 }}>
              📋 采购记录
            </div>
            {supplierPurchases && supplierPurchases.length > 0 ? (
              <Table dataSource={supplierPurchases as Record<string, unknown>[]}
                rowKey="order_no" size="small" pagination={false}
                columns={[
                  { title: '采购单号', dataIndex: 'order_no', key: 'order_no', width: 180 },
                  { title: '日期', dataIndex: 'order_date', key: 'order_date', width: 100 },
                  { title: '金额', dataIndex: 'total_amount', key: 'total_amount', width: 100, render: (v: number | null) => v ? `¥${Number(v).toFixed(2)}` : '-' },
                ]} />
            ) : (
              <div style={{ color: '#999', padding: 12 }}>暂无采购记录</div>
            )}
          </>
        )}
      </Modal>
    </div>
  );
}
