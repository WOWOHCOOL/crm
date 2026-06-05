import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Card, Descriptions, Button, Space, Tag, Row, Col, Image, Modal, Form, Input, InputNumber, Switch, Select, Upload, message } from 'antd';
import { ArrowLeftOutlined, EditOutlined, UploadOutlined } from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../supabase';
import type { Product, Supplier } from '../../types';
import { useAuth } from '../../auth/AuthContext';
import { useResponsive } from '../../hooks/useResponsive';
import { tokens } from '../../styles/theme';
import PageContainer from '../../components/PageContainer';
import StatCard from '../../components/StatCard';
import ResponsiveTable from '../../components/ResponsiveTable';
import EmptyState from '../../components/EmptyState';
import { DetailSkeleton } from '../../components/Skeletons';

export default function ProductDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { isOwner, isAdmin } = useAuth();
  const { isMobile } = useResponsive();
  const canEdit = isOwner || isAdmin;
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [form] = Form.useForm();
  const [imagePreview, setImagePreview] = useState<string | null>(null);

  // ── Queries ──
  const { data: product, isLoading } = useQuery({
    queryKey: ['product', id],
    queryFn: async () => {
      const { data } = await supabase.from('products').select('*, suppliers(name)').eq('id', id).single();
      return data as Product & { suppliers: Pick<Supplier, 'name'> | null };
    },
    enabled: !!id,
  });

  const { data: suppliersList } = useQuery({
    queryKey: ['suppliers-for-products'],
    queryFn: async () => {
      const { data } = await supabase.from('suppliers').select('id, name').order('name');
      return (data ?? []) as { id: string; name: string }[];
    },
  });

  const { data: purchaseHistory } = useQuery({
    queryKey: ['product-purchases', id],
    queryFn: async () => {
      const { data } = await supabase
        .from('purchase_items')
        .select('*, purchase_orders!inner(order_no, order_date, suppliers(name))')
        .eq('product_id', id)
        .order('created_at', { ascending: false });
      return data ?? [];
    },
    enabled: !!id,
  });

  // ── Save mutation ──
  const saveMutation = useMutation({
    mutationFn: async (values: Partial<Product>) => {
      if (!id) throw new Error('Missing product id');
      const { error } = await supabase.from('products').update(values).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['product', id] });
      queryClient.invalidateQueries({ queryKey: ['products'] });
      setEditModalOpen(false);
      message.success('商品已更新');
    },
    onError: (error: Error) => message.error(error.message),
  });

  const handleImageUpload = async (file: File): Promise<boolean> => {
    const isImage = file.type.startsWith('image/');
    if (!isImage) { message.error('仅支持图片文件'); return false; }
    const isLt5M = file.size / 1024 / 1024 < 5;
    if (!isLt5M) { message.error('图片不能超过 5MB'); return false; }

    if (supabase) {
      const ext = file.name.split('.').pop();
      const fileName = `product_${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;
      const { data: uploadData, error } = await supabase.storage
        .from('product-images')
        .upload(fileName, file, { contentType: file.type });

      if (!error && uploadData) {
        const { data: { publicUrl } } = supabase.storage.from('product-images').getPublicUrl(fileName);
        form.setFieldValue('image_url', publicUrl);
        setImagePreview(publicUrl);
        return false;
      }
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      const dataUrl = e.target?.result as string;
      form.setFieldValue('image_url', dataUrl);
      setImagePreview(dataUrl);
    };
    reader.readAsDataURL(file);
    return false;
  };

  const openEdit = () => {
    if (product) {
      form.setFieldsValue(product);
      setImagePreview(product.image_url || null);
      setEditModalOpen(true);
    }
  };

  // ── Derived ──
  if (isLoading) return <DetailSkeleton />;

  const supplierName = product?.suppliers?.name || product?.supplier_name || '-';

  return (
    <PageContainer breadcrumb={[{ label: '商品管理' }, { label: product?.official_model || '商品详情' }]}>
      <div style={{ maxWidth: 1200, margin: '0 auto' }}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: tokens.spacingLG, flexWrap: 'wrap', gap: 8 }}>
          <Button icon={<ArrowLeftOutlined />} onClick={() => navigate('/products')}>返回</Button>
          {canEdit && <Button icon={<EditOutlined />} onClick={openEdit}>编辑商品</Button>}
        </div>

        {/* Info card */}
        <Card styles={{ body: { padding: isMobile ? tokens.spacingLG : tokens.spacingXL } }}
          style={{ marginBottom: 20, borderRadius: tokens.radiusXL, border: `1px solid ${tokens.colorBorder}` }}>
          <Row gutter={[24, 16]} align="middle">
            <Col xs={24} md={3}>
              {product?.image_url ? (
                <Image src={product.image_url} width={isMobile ? '100%' : 120} height={isMobile ? 200 : 120}
                  style={{ objectFit: 'cover', borderRadius: tokens.radiusLG }} fallback="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' width='80' height='80'><rect fill='%23f5f5f5' width='80' height='80'/><text x='50%25' y='50%25' dominant-baseline='middle' text-anchor='middle' fill='%23ccc' font-size='32'>📷</text></svg>" />
              ) : (
                <div style={{ width: 120, height: 120, borderRadius: tokens.radiusLG, background: '#f5f5f5', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 48, opacity: 0.15 }}>📷</div>
              )}
            </Col>
            <Col xs={24} md={5}>
              <div style={{ fontSize: 20, fontWeight: 700 }}>{product?.official_model}</div>
              {product?.product_name && <div style={{ fontSize: tokens.fontSizeLG, color: tokens.colorTextSecondary }}>{product.product_name}</div>}
              <div style={{ marginTop: 4 }}><Tag color={product?.tax_included ? 'blue' : 'default'}>{product?.tax_included ? '含税' : '不含税'}</Tag></div>
            </Col>
            <Col xs={12} md={4}><div style={{ fontSize: tokens.fontSizeSM, color: tokens.colorTextTertiary }}>供应商</div><div style={{ fontWeight: 600 }}>{supplierName}</div></Col>
            <Col xs={12} md={4}><div style={{ fontSize: tokens.fontSizeSM, color: tokens.colorTextTertiary }}>供货价</div><div style={{ fontWeight: 600, fontSize: tokens.fontSizeXL }}>{product?.supply_price ? `¥${Number(product.supply_price).toFixed(2)}` : '-'}</div></Col>
            <Col xs={12} md={4}><div style={{ fontSize: tokens.fontSizeSM, color: tokens.colorTextTertiary }}>建议报价</div><div style={{ fontWeight: 600, fontSize: tokens.fontSizeXL, color: tokens.colorPrimary }}>{product?.suggested_price ? `¥${Number(product.suggested_price).toFixed(2)}` : '-'}</div></Col>
            <Col xs={12} md={4}><StatCard label="采购次数" value={(purchaseHistory ?? []).length} color={tokens.colorWarning} icon={<span>📦</span>} /></Col>
          </Row>
        </Card>

        {/* Specs + Supplier info */}
        <Row gutter={[16, 16]} style={{ marginBottom: 20 }}>
          <Col xs={24} lg={12}>
            <Card title="产品参数" styles={{ body: { padding: isMobile ? tokens.spacingMD : tokens.spacingXL } }} style={{ borderRadius: tokens.radiusXL }}>
              <Descriptions column={1} size="small" colon={false}
                labelStyle={{ color: tokens.colorTextTertiary, fontSize: tokens.fontSizeSM }}
                contentStyle={{ color: tokens.colorText, fontWeight: 500 }}>
                <Descriptions.Item label="颜色">{product?.color || '-'}</Descriptions.Item>
                <Descriptions.Item label="材质">{product?.material || '-'}</Descriptions.Item>
                <Descriptions.Item label="重量">{product?.weight || '-'}</Descriptions.Item>
                <Descriptions.Item label="尺寸">{product?.size || '-'}</Descriptions.Item>
                <Descriptions.Item label="规格参数">{product?.specifications || '-'}</Descriptions.Item>
                <Descriptions.Item label="包装内容">{product?.package_includes || '-'}</Descriptions.Item>
              </Descriptions>
            </Card>
          </Col>
          <Col xs={24} lg={12}>
            <Card title="供应商信息" styles={{ body: { padding: isMobile ? tokens.spacingMD : tokens.spacingXL } }} style={{ borderRadius: tokens.radiusXL }}>
              <Descriptions column={1} size="small" colon={false}
                labelStyle={{ color: tokens.colorTextTertiary, fontSize: tokens.fontSizeSM }}
                contentStyle={{ color: tokens.colorText, fontWeight: 500 }}>
                <Descriptions.Item label="供应商名称">{supplierName}</Descriptions.Item>
                <Descriptions.Item label="供应商型号">{product?.supplier_model || '-'}</Descriptions.Item>
              </Descriptions>
            </Card>
          </Col>
        </Row>

        {/* Purchase history */}
        <Card
          title={<span style={{ fontSize: tokens.fontSizeLG, fontWeight: 600 }}>采购记录 ({(purchaseHistory ?? []).length})</span>}
          styles={{ body: { padding: isMobile ? tokens.spacingMD : tokens.spacingXL } }}
          style={{ borderRadius: tokens.radiusXL, marginBottom: isMobile ? 72 : 0 }}
        >
          {(purchaseHistory ?? []).length === 0 ? (
            <EmptyState title="暂无采购记录" />
          ) : (
            <ResponsiveTable
              dataSource={purchaseHistory as Record<string, unknown>[]}
              rowKey="id" size="small" pagination={{ pageSize: 10 }}
              scroll={{ x: 'max-content' }}
              columns={[
                { title: '采购单号', key: 'order_no', width: 160, render: (_: unknown, r: Record<string, unknown>) => (r.purchase_orders as Record<string, unknown> | null)?.order_no as string || '-' },
                { title: '日期', key: 'order_date', width: 100, render: (_: unknown, r: Record<string, unknown>) => (r.purchase_orders as Record<string, unknown> | null)?.order_date as string || '-' },
                { title: '数量', dataIndex: 'quantity', key: 'quantity', width: 60 },
                { title: '单价', dataIndex: 'unit_price', key: 'unit_price', width: 100, render: (v: number) => `¥${Number(v).toFixed(2)}` },
              ]}
            />
          )}
        </Card>
      </div>

      {/* Edit modal */}
      <Modal
        title="编辑商品"
        open={editModalOpen}
        onCancel={() => setEditModalOpen(false)}
        onOk={() => form.submit()}
        confirmLoading={saveMutation.isPending}
        width={600}
        destroyOnClose
      >
        <Form form={form} layout="vertical" onFinish={(values) => saveMutation.mutate(values)}>
          <Row gutter={16}>
            <Col xs={24} sm={12}><Form.Item name="product_name" label="品名"><Input /></Form.Item></Col>
            <Col xs={24} sm={12}><Form.Item name="official_model" label="官网型号" rules={[{ required: true }]}><Input /></Form.Item></Col>
            <Col xs={24} sm={12}><Form.Item name="supplier_model" label="供应商型号"><Input /></Form.Item></Col>
            <Col xs={24} sm={12}>
              <Form.Item name="supplier_name" label="供应商">
                <Select allowClear showSearch placeholder="选择供应商" optionFilterProp="label"
                  onSelect={(val: string) => {
                    const s = suppliersList?.find(x => x.name === val);
                    form.setFieldValue('supplier_id', s?.id || null);
                  }}
                  onClear={() => form.setFieldValue('supplier_id', null)}
                  options={(suppliersList ?? []).map(s => ({ label: s.name, value: s.name }))} />
              </Form.Item>
            </Col>
            <Col xs={24} sm={12}><Form.Item name="supply_price" label="供货价"><InputNumber min={0} precision={2} style={{ width: '100%' }} prefix="¥" /></Form.Item></Col>
            <Col xs={24} sm={12}><Form.Item name="suggested_price" label="建议报价"><InputNumber min={0} precision={2} style={{ width: '100%' }} prefix="¥" /></Form.Item></Col>
            <Col xs={24} sm={12}><Form.Item name="tax_included" label="含税" valuePropName="checked"><Switch checkedChildren="含税" unCheckedChildren="不含" /></Form.Item></Col>
            <Col xs={24}><Form.Item name="image_url" label="产品图片">
              <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end' }}>
                <Upload accept="image/*" showUploadList={false} beforeUpload={handleImageUpload}><Button icon={<UploadOutlined />}>上传</Button></Upload>
                <Input placeholder="或输入图片链接" style={{ flex: 1 }} />
                {imagePreview && <Image src={imagePreview} width={48} height={48} style={{ objectFit: 'cover', borderRadius: 6 }} preview={{ mask: '预览' }} />}
              </div>
            </Form.Item></Col>
          </Row>
          <div style={{ fontWeight: 600, margin: '8px 0', fontSize: 14 }}>产品参数</div>
          <Row gutter={16}>
            <Col xs={24} sm={12}><Form.Item name="color" label="颜色"><Input /></Form.Item></Col>
            <Col xs={24} sm={12}><Form.Item name="material" label="材质"><Input /></Form.Item></Col>
            <Col xs={24} sm={12}><Form.Item name="weight" label="重量"><Input /></Form.Item></Col>
            <Col xs={24} sm={12}><Form.Item name="size" label="尺寸"><Input /></Form.Item></Col>
            <Col xs={24}><Form.Item name="specifications" label="规格参数"><Input.TextArea rows={2} /></Form.Item></Col>
            <Col xs={24}><Form.Item name="package_includes" label="包装内容"><Input placeholder="如：主机×1、数据线×1" /></Form.Item></Col>
          </Row>
        </Form>
      </Modal>
    </PageContainer>
  );
}
