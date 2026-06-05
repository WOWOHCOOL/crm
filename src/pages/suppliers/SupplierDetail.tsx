import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Card, Descriptions, Table, Button, Space, Spin, Tag, message, Row, Col, Modal, Form, Input } from 'antd';
import { ArrowLeftOutlined, EditOutlined, ShopOutlined, ShoppingCartOutlined, DollarOutlined } from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../supabase';
import type { Supplier } from '../../types';
import { useAuth } from '../../auth/AuthContext';
import { useResponsive } from '../../hooks/useResponsive';
import { tokens } from '../../styles/theme';
import PageContainer from '../../components/PageContainer';
import StatCard from '../../components/StatCard';
import ResponsiveTable from '../../components/ResponsiveTable';
import EmptyState from '../../components/EmptyState';
import { DetailSkeleton } from '../../components/Skeletons';
import dayjs from 'dayjs';

export default function SupplierDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { isOwner, isAdmin } = useAuth();
  const { isMobile } = useResponsive();
  const canEdit = isOwner || isAdmin;
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [form] = Form.useForm();

  // ── Queries ──
  const { data: supplier, isLoading } = useQuery({
    queryKey: ['supplier', id],
    queryFn: async () => {
      const { data } = await supabase.from('suppliers').select('*').eq('id', id).single();
      return data as Supplier;
    },
    enabled: !!id,
  });

  const { data: products } = useQuery({
    queryKey: ['supplier-products', id],
    queryFn: async () => {
      const { data } = await supabase.from('products').select('*').eq('supplier_id', id);
      return data ?? [];
    },
    enabled: !!id,
  });

  const { data: purchases } = useQuery({
    queryKey: ['supplier-purchases', id],
    queryFn: async () => {
      const { data } = await supabase
        .from('purchase_orders')
        .select('order_no, order_date, total_amount, status, created_at')
        .eq('supplier_id', id)
        .order('created_at', { ascending: false });
      return data ?? [];
    },
    enabled: !!id,
  });

  // ── Save mutation ──
  const saveMutation = useMutation({
    mutationFn: async (values: Partial<Supplier>) => {
      if (!id) throw new Error('Missing supplier id');
      const { error } = await supabase.from('suppliers').update(values).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['supplier', id] });
      queryClient.invalidateQueries({ queryKey: ['suppliers'] });
      setEditModalOpen(false);
      message.success('供应商已更新');
    },
    onError: (error: Error) => message.error(error.message),
  });

  const openEdit = () => {
    if (supplier) {
      form.setFieldsValue(supplier);
      setEditModalOpen(true);
    }
  };

  // ── Derived ──
  if (isLoading) return <DetailSkeleton />;

  const purchaseTotal = (purchases ?? []).reduce((s: number, p: Record<string, unknown>) => s + Number(p.total_amount || 0), 0);

  return (
    <PageContainer
      breadcrumb={[{ label: '供应商管理' }, { label: supplier?.name || '供应商详情' }]}
    >
      <div style={{ maxWidth: 1200, margin: '0 auto' }}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: tokens.spacingLG, flexWrap: 'wrap', gap: 8 }}>
          <Button icon={<ArrowLeftOutlined />} onClick={() => navigate('/suppliers')}>返回</Button>
          {canEdit && (
            <Button icon={<EditOutlined />} onClick={openEdit}>编辑供应商</Button>
          )}
        </div>

        {/* Info card */}
        <Card styles={{ body: { padding: isMobile ? tokens.spacingLG : tokens.spacingXL } }}
          style={{ marginBottom: 20, borderRadius: tokens.radiusXL, border: `1px solid ${tokens.colorBorder}` }}>
          <Row gutter={[24, 16]} align="middle">
            <Col xs={24} md={6}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                <div style={{ width: 56, height: 56, borderRadius: tokens.radiusXXL, background: 'linear-gradient(135deg, #ff9c6e, #ff7a45)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24, color: '#fff', fontWeight: 700, flexShrink: 0 }}>
                  <ShopOutlined />
                </div>
                <div>
                  <div style={{ fontSize: 18, fontWeight: 700 }}>{supplier?.name}</div>
                  <div style={{ fontSize: tokens.fontSizeMD, color: tokens.colorTextSecondary }}>{supplier?.contact_person || '无联系人'}</div>
                </div>
              </div>
            </Col>
            <Col xs={12} md={3}><div style={{ fontSize: tokens.fontSizeSM, color: tokens.colorTextTertiary }}>电话</div><div style={{ fontWeight: 600 }}>{supplier?.phone || '-'}</div></Col>
            <Col xs={12} md={3}><div style={{ fontSize: tokens.fontSizeSM, color: tokens.colorTextTertiary }}>邮箱</div><div style={{ fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{supplier?.email || '-'}</div></Col>
            <Col xs={12} md={3}><div style={{ fontSize: tokens.fontSizeSM, color: tokens.colorTextTertiary }}>付款条件</div><div style={{ fontWeight: 600 }}>{supplier?.payment_terms || '-'}</div></Col>
            <Col xs={12} md={3}><div style={{ fontSize: tokens.fontSizeSM, color: tokens.colorTextTertiary }}>税号</div><div style={{ fontWeight: 600 }}>{supplier?.tax_id || '-'}</div></Col>
          </Row>

          {/* Stats */}
          <Row gutter={[12, 12]} style={{ marginTop: tokens.spacingLG, paddingTop: tokens.spacingLG, borderTop: `1px solid ${tokens.colorBorder}` }}>
            <Col xs={12} sm={4}><StatCard icon={<ShopOutlined />} label="供应产品" value={(products ?? []).length} color={tokens.colorPrimary} /></Col>
            <Col xs={12} sm={4}><StatCard icon={<ShoppingCartOutlined />} label="采购次数" value={(purchases ?? []).length} color={tokens.colorWarning} /></Col>
            <Col xs={12} sm={4}><StatCard icon={<DollarOutlined />} label="采购总额" value={`¥${purchaseTotal.toLocaleString()}`} color={tokens.colorSuccess} /></Col>
          </Row>
        </Card>

        {/* Bank & Address info */}
        <Row gutter={[16, 16]} style={{ marginBottom: 20 }}>
          <Col xs={24} lg={12}>
            <Card title="公司信息" styles={{ body: { padding: isMobile ? tokens.spacingMD : tokens.spacingXL } }}
              style={{ borderRadius: tokens.radiusXL }}>
              <Descriptions column={1} size="small" colon={false}
                labelStyle={{ color: tokens.colorTextTertiary, fontSize: tokens.fontSizeSM }}
                contentStyle={{ color: tokens.colorText, fontWeight: 500 }}>
                <Descriptions.Item label="地址">{supplier?.address || '-'}</Descriptions.Item>
                <Descriptions.Item label="纳税识别号">{supplier?.tax_id || '-'}</Descriptions.Item>
                <Descriptions.Item label="付款条件">{supplier?.payment_terms || '-'}</Descriptions.Item>
              </Descriptions>
            </Card>
          </Col>
          <Col xs={24} lg={12}>
            <Card title="银行信息" styles={{ body: { padding: isMobile ? tokens.spacingMD : tokens.spacingXL } }}
              style={{ borderRadius: tokens.radiusXL }}>
              <Descriptions column={1} size="small" colon={false}
                labelStyle={{ color: tokens.colorTextTertiary, fontSize: tokens.fontSizeSM }}
                contentStyle={{ color: tokens.colorText, fontWeight: 500 }}>
                <Descriptions.Item label="开户名">{supplier?.bank_account_name || '-'}</Descriptions.Item>
                <Descriptions.Item label="账号">{supplier?.bank_account_number || '-'}</Descriptions.Item>
                <Descriptions.Item label="开户行">{supplier?.bank_name || '-'}</Descriptions.Item>
                <Descriptions.Item label="其他">{supplier?.bank_info || '-'}</Descriptions.Item>
              </Descriptions>
            </Card>
          </Col>
        </Row>

        {/* Notes */}
        {supplier?.notes && (
          <Card
            title="备注"
            styles={{ body: { padding: isMobile ? tokens.spacingMD : tokens.spacingXL } }}
            style={{ marginBottom: 20, borderRadius: tokens.radiusXL }}
          >
            <div style={{ color: tokens.colorTextSecondary, whiteSpace: 'pre-wrap' }}>{supplier.notes}</div>
          </Card>
        )}

        {/* Products */}
        <Card
          title={<span style={{ fontSize: tokens.fontSizeLG, fontWeight: 600 }}>供应产品 ({(products ?? []).length})</span>}
          styles={{ body: { padding: isMobile ? tokens.spacingMD : tokens.spacingXL } }}
          style={{ marginBottom: 20, borderRadius: tokens.radiusXL }}
        >
          {(products ?? []).length === 0 ? (
            <EmptyState icon={<ShopOutlined />} title="暂无关联产品" />
          ) : (
            <ResponsiveTable
              dataSource={products as Record<string, unknown>[]}
              rowKey="id" size="small" pagination={{ pageSize: 10 }}
              scroll={{ x: 'max-content' }}
              columns={[
                { title: '型号', dataIndex: 'official_model', key: 'official_model' },
                { title: '供货价', dataIndex: 'supply_price', key: 'supply_price', render: (v: number | null) => v ? `¥${Number(v).toFixed(2)}` : '-' },
                { title: '建议报价', dataIndex: 'suggested_price', key: 'suggested_price', render: (v: number | null) => v ? `¥${Number(v).toFixed(2)}` : '-' },
              ]}
            />
          )}
        </Card>

        {/* Purchase history */}
        <Card
          title={<span style={{ fontSize: tokens.fontSizeLG, fontWeight: 600 }}>采购记录 ({(purchases ?? []).length})</span>}
          styles={{ body: { padding: isMobile ? tokens.spacingMD : tokens.spacingXL } }}
          style={{ borderRadius: tokens.radiusXL, marginBottom: isMobile ? 72 : 0 }}
        >
          {(purchases ?? []).length === 0 ? (
            <EmptyState icon={<ShoppingCartOutlined />} title="暂无采购记录" />
          ) : (
            <ResponsiveTable
              dataSource={purchases as Record<string, unknown>[]}
              rowKey="order_no" size="small" pagination={{ pageSize: 10 }}
              scroll={{ x: 'max-content' }}
              columns={[
                { title: '采购单号', dataIndex: 'order_no', key: 'order_no', width: 200 },
                { title: '日期', dataIndex: 'order_date', key: 'order_date', width: 120 },
                { title: '金额', dataIndex: 'total_amount', key: 'total_amount', width: 120, render: (v: number | null) => v ? `¥${Number(v).toFixed(2)}` : '-' },
                { title: '状态', dataIndex: 'status', key: 'status', width: 80, render: (v: string) => {
                  const map: Record<string, { label: string; color: string }> = {
                    draft: { label: '草稿', color: 'default' },
                    ordered: { label: '已下单', color: 'blue' },
                    partial: { label: '部分到货', color: 'orange' },
                    received: { label: '已收货', color: 'green' },
                    cancelled: { label: '已取消', color: 'red' },
                  };
                  const item = map[v] || { label: v, color: 'default' };
                  return <Tag color={item.color}>{item.label}</Tag>;
                } },
              ]}
            />
          )}
        </Card>
      </div>

      {/* Edit modal */}
      <Modal
        title="编辑供应商"
        open={editModalOpen}
        onCancel={() => setEditModalOpen(false)}
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
    </PageContainer>
  );
}
