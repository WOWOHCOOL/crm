import { useState, useMemo, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  Button, Space, Input, Modal, Form, InputNumber, Switch,
  message, Card, Row, Col, Tag, Image, Upload, Descriptions, Select,
  Pagination, Tooltip,
} from 'antd';
import { PlusOutlined, SearchOutlined, InboxOutlined, EyeOutlined, UploadOutlined, AppstoreOutlined, UnorderedListOutlined } from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../supabase';
import type { Product, Supplier } from '../../types';
import { useAuth } from '../../auth/AuthContext';
import { useResponsive } from '../../hooks/useResponsive';
import { tokens } from '../../styles/theme';
import ProductCard from '../../components/ProductCard';
import ResponsiveTable from '../../components/ResponsiveTable';
import { TableSkeleton } from '../../components/Skeletons';
import { logOperation } from '../../utils/log';
import * as XLSX from 'xlsx';

const PAGE_SIZE = 20;
const VIEW_KEY = 'product_view_mode';

export default function ProductList() {
  const { isOwner, isAdmin } = useAuth();
  const canEdit = isOwner || isAdmin;
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [viewMode, setViewMode] = useState<'grid' | 'list'>(() =>
    (localStorage.getItem(VIEW_KEY) as 'grid' | 'list') || 'grid'
  );
  const [form] = Form.useForm();
  const [importModalOpen, setImportModalOpen] = useState(false);
  const [importData, setImportData] = useState<Record<string, unknown>[]>([]);
  const [importLoading, setImportLoading] = useState(false);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { isMobile } = useResponsive();

  // Sync preview with form image_url value
  const watchImageUrl = Form.useWatch('image_url', form);
  useEffect(() => {
    if (watchImageUrl) setImagePreview(watchImageUrl);
    else if (!watchImageUrl && !form.getFieldValue('image_url')) setImagePreview(null);
  }, [watchImageUrl]);

  // ── Modal state via URL params ──
  const [searchParams, setSearchParams] = useSearchParams();
  const editId = searchParams.get('edit') || undefined;
  const isAdding = searchParams.get('add') === '1';
  const detailId = searchParams.get('detail') || undefined;
  const modalOpen = !!editId || isAdding;
  const detailOpen = !!detailId;

  const { data: products, isLoading } = useQuery({
    queryKey: ['products', search],
    queryFn: async () => {
      let query = supabase.from('products').select('*, suppliers(name)').order('official_model');
      if (search) {
        query = query.or(`official_model.ilike.%${search}%,supplier_model.ilike.%${search}%,supplier_name.ilike.%${search}%,product_name.ilike.%${search}%`);
      }
      const { data } = await query;
      return (data ?? []) as (Product & { suppliers: Pick<Supplier, 'name'> | null })[];
    },
  });

  const { data: suppliersList } = useQuery({
    queryKey: ['suppliers-for-products'],
    queryFn: async () => {
      const { data } = await supabase.from('suppliers').select('id, name').order('name');
      return (data ?? []) as { id: string; name: string }[];
    },
  });

  const editing = useMemo(() => {
    if (!editId || !products) return null;
    return products.find(p => p.id === editId) ?? null;
  }, [editId, products]);

  const detailProduct = useMemo(() => {
    if (!detailId || !products) return null;
    return products.find(p => p.id === detailId) ?? null;
  }, [detailId, products]);

  useEffect(() => { if (editing) form.setFieldsValue(editing); }, [editing]);
  useEffect(() => { if (editing?.image_url) setImagePreview(editing.image_url); else setImagePreview(null); }, [editing]);

  // Restore draft
  useEffect(() => {
    if (editId) return;
    const draft = sessionStorage.getItem('product_form_draft');
    if (!draft) return;
    try { const d = JSON.parse(draft); if (d.formValues) form.setFieldsValue(d.formValues); if (d.imagePreview) setImagePreview(d.imagePreview); sessionStorage.removeItem('product_form_draft'); } catch { /* */ }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Save draft
  const isEditMode = !!editId;
  useEffect(() => {
    if (isEditMode) return;
    const save = () => sessionStorage.setItem('product_form_draft', JSON.stringify({ formValues: form.getFieldsValue(), imagePreview }));
    document.addEventListener('visibilitychange', save);
    window.addEventListener('beforeunload', save);
    return () => { document.removeEventListener('visibilitychange', save); window.removeEventListener('beforeunload', save); };
  }, [form, imagePreview, isEditMode]);

  const setModalParam = (params: Record<string, string | null>) => {
    const next = new URLSearchParams(searchParams);
    Object.entries(params).forEach(([k, v]) => { if (v === null) next.delete(k); else next.set(k, v); });
    setSearchParams(next, { replace: true });
  };

  const openEdit = (record: Product) => { form.setFieldsValue(record); setModalParam({ edit: record.id, add: null, detail: null }); };
  const openAdd = () => { form.resetFields(); setModalParam({ add: '1', edit: null, detail: null }); };
  const closeModal = () => { sessionStorage.removeItem('product_form_draft'); form.resetFields(); setImagePreview(null); setModalParam({ add: null, edit: null, detail: null }); };
  const showDetail = (record: Product) => { setModalParam({ detail: record.id, add: null, edit: null }); };
  const closeDetail = () => { setModalParam({ detail: null, add: null, edit: null }); };

  const handleImageUpload = async (file: File): Promise<boolean> => {
    const isImage = file.type.startsWith('image/');
    if (!isImage) { message.error('仅支持图片文件'); return false; }
    const isLt5M = file.size / 1024 / 1024 < 5;
    if (!isLt5M) { message.error('图片不能超过 5MB'); return false; }

    if (supabase) {
      const ext = file.name.split('.').pop();
      const fileName = `product_${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;
      const { data: uploadData, error } = await supabase.storage.from('product-images').upload(fileName, file, { contentType: file.type });
      if (!error && uploadData) {
        const { data: { publicUrl } } = supabase.storage.from('product-images').getPublicUrl(fileName);
        form.setFieldValue('image_url', publicUrl); setImagePreview(publicUrl);
        return false;
      }
    }
    const reader = new FileReader();
    reader.onload = (e) => { const dataUrl = e.target?.result as string; form.setFieldValue('image_url', dataUrl); setImagePreview(dataUrl); };
    reader.readAsDataURL(file);
    return false;
  };

  const saveMutation = useMutation({
    mutationFn: async (values: Partial<Product>) => {
      if (editId) {
        const { error } = await supabase.from('products').update(values).eq('id', editId);
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
      closeModal();
      message.success(editId ? '商品已更新' : '商品已添加');
      logOperation('product', editId ? 'update' : 'create', editId, values.official_model);
    },
    onError: (error: Error) => message.error(error.message),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { data } = await supabase.from('products').select('official_model').eq('id', id).single();
      const { error } = await supabase.from('products').delete().eq('id', id);
      if (error) throw error;
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

  const { data: purchaseHistory } = useQuery({
    queryKey: ['product-purchases', detailProduct?.id],
    queryFn: async () => {
      if (!detailProduct) return [];
      const { data } = await supabase.from('purchase_items').select('*, purchase_orders!inner(order_no, order_date, suppliers(name))').eq('product_id', detailProduct.id).order('created_at', { ascending: false });
      return data ?? [];
    },
    enabled: !!detailProduct,
  });

  const handleImportFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: 'array' });
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json(sheet) as Record<string, unknown>[];
        if (rows.length === 0) { message.warning('Excel 文件为空'); return; }
        setImportData(rows);
        message.success(`已解析 ${rows.length} 行数据`);
      } catch { message.error('文件解析失败'); }
    };
    reader.readAsArrayBuffer(file);
    return false;
  };

  const handleImportSubmit = async () => {
    if (importData.length === 0) { message.warning('没有可导入的数据'); return; }
    setImportLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { message.error('未登录'); setImportLoading(false); return; }
    let success = 0, fail = 0;
    for (const row of importData) {
      const officialModel = String(row['官网型号'] || row['official_model'] || '').trim();
      if (!officialModel) { fail++; continue; }
      const { error } = await supabase.from('products').insert([{
        product_name: String(row['品名'] || row['product_name'] || '') || null,
        official_model: officialModel,
        supplier_model: String(row['供应商型号'] || row['supplier_model'] || '') || null,
        supplier_name: String(row['供应商名称'] || row['supplier_name'] || '') || null,
        supply_price: Number(row['供货价'] || row['supply_price']) || null,
        suggested_price: Number(row['建议报价'] || row['suggested_price']) || null,
        tax_included: row['含税'] === '是' || row['含税'] === true || row['tax_included'] === true,
        image_url: String(row['产品图片'] || row['image_url'] || '') || null,
        user_id: user.id,
      }]);
      if (error) fail++; else success++;
    }
    setImportLoading(false);
    queryClient.invalidateQueries({ queryKey: ['products'] });
    message.success(`导入完成：成功 ${success} 条${fail ? `，失败 ${fail} 条` : ''}`);
    if (fail === 0) { setImportModalOpen(false); setImportData([]); }
  };

  const downloadTemplate = () => {
    const ws = XLSX.utils.aoa_to_sheet([
      ['品名', '官网型号', '供应商型号', '供应商名称', '供货价', '建议报价', '含税', '产品图片'],
      ['Model-X100', 'SN-2024-A001', '示例供应商', '120', '180', '是', 'https://example.com/image.jpg'],
    ]);
    ws['!cols'] = [{ wch: 16 }, { wch: 18 }, { wch: 16 }, { wch: 10 }, { wch: 10 }, { wch: 8 }, { wch: 36 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, '商品导入模板');
    XLSX.writeFile(wb, '商品导入模板.xlsx');
  };

  const columns = [
    { title: '图片', dataIndex: 'image_url', key: 'image_url', width: 60, render: (url: string | null) => url ? <Image src={url} style={{ width: 36, height: 36, objectFit: 'cover', borderRadius: 4 }} preview={false} /> : <div style={{ width: 36, height: 36, background: '#f5f5f5', borderRadius: 4 }} /> },
    { title: '品名', dataIndex: 'product_name', key: 'product_name', width: 140, render: (v: string | null) => v || '-' },
    { title: '官网型号', dataIndex: 'official_model', key: 'official_model', width: 150, render: (v: string, r: Product) => <a onClick={() => navigate(`/products/${r.id}`)}>{v}</a> },
    { title: '供应商', key: 'supplier', width: 130, render: (_: unknown, r: Product & { suppliers: { name: string } | null }) => r.suppliers?.name || r.supplier_name || '-' },
    ...(canEdit ? [{ title: '供货价', dataIndex: 'supply_price', key: 'supply_price', width: 100, render: (v: number | null) => v ? `¥${Number(v).toFixed(2)}` : '-' }] : []),
    { title: '建议报价', dataIndex: 'suggested_price', key: 'suggested_price', width: 100, render: (v: number | null) => v ? `¥${Number(v).toFixed(2)}` : '-' },
    { title: '含税', dataIndex: 'tax_included', key: 'tax_included', width: 60, render: (v: boolean) => <Tag color={v ? 'blue' : 'default'}>{v ? '含税' : '不含'}</Tag> },
    ...(canEdit ? [{ title: '操作', key: 'actions', width: 170, render: (_: unknown, record: Product) => (
      <Space>
        <Button size="small" icon={<EyeOutlined />} onClick={() => showDetail(record)}>详情</Button>
        <Button size="small" onClick={() => openEdit(record)}>编辑</Button>
        <Button size="small" danger onClick={() => deleteMutation.mutate(record.id)}>删除</Button>
      </Space>
    ) }] : []),
  ];

  const importColumns = [
    { title: '品名', dataIndex: '品名', key: 'product_name', ellipsis: true },
    { title: '官网型号', dataIndex: '官网型号', key: 'official_model', ellipsis: true },
    { title: '供应商型号', dataIndex: '供应商型号', key: 'supplier_model', ellipsis: true },
    { title: '供应商名称', dataIndex: '供应商名称', key: 'supplier_name', ellipsis: true },
    { title: '供货价', dataIndex: '供货价', key: 'supply_price', width: 100 },
    { title: '建议报价', dataIndex: '建议报价', key: 'suggested_price', width: 100 },
    { title: '含税', dataIndex: '含税', key: 'tax_included', width: 60 },
  ];

  const total = products?.length ?? 0;
  const paged = (products ?? []).slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const toggleView = (mode: 'grid' | 'list') => { setViewMode(mode); localStorage.setItem(VIEW_KEY, mode); };

  return (
    <div>
      <Card>
        <Space style={{ marginBottom: tokens.spacingLG, width: '100%', justifyContent: 'space-between' }} wrap>
          <Input
            placeholder="搜索型号 / 品名 / 供应商"
            prefix={<SearchOutlined />}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            allowClear
            style={{ maxWidth: 280, width: '100%' }}
          />
          {canEdit && <Space>
            <Button type="primary" icon={<PlusOutlined />} onClick={openAdd}>添加商品</Button>
            <Button icon={<InboxOutlined />} onClick={() => setImportModalOpen(true)}>导入 Excel</Button>
            <Button type="link" size="small" onClick={downloadTemplate}>下载模板</Button>
          </Space>}
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
          <TableSkeleton rows={isMobile ? 4 : 4} cols={4} />
        ) : viewMode === 'grid' ? (
          <>
            <Row gutter={[tokens.spacingLG, tokens.spacingLG]}>
              {paged.map((p: Product & { suppliers: { name: string } | null }) => (
                <Col xs={24} sm={12} lg={8} xl={6} key={p.id}>
                  <ProductCard
                    product={p}
                    onClick={() => navigate(`/products/${p.id}`)}
                    onEdit={canEdit ? () => openEdit(p) : undefined}
                    onDelete={canEdit ? () => deleteMutation.mutate(p.id) : undefined}
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
            dataSource={products} columns={columns} rowKey="id" loading={isLoading}
            pagination={{ pageSize: PAGE_SIZE, showSizeChanger: true, showTotal: (t) => `共 ${t} 条` }}
            scroll={{ x: 800 }}
          />
        )}
      </Card>

      {/* Edit / Add Modal */}
      <Modal title={editing ? '编辑商品' : '添加商品'} open={modalOpen} onCancel={closeModal} onOk={() => form.submit()} confirmLoading={saveMutation.isPending} width={600} destroyOnClose>
        <Form form={form} layout="vertical" onFinish={(values) => saveMutation.mutate(values)}>
          <Row gutter={16}>
            <Col xs={24} sm={12}><Form.Item name="product_name" label="品名"><Input /></Form.Item></Col>
            <Col xs={24} sm={12}><Form.Item name="official_model" label="官网型号" rules={[{ required: true, message: '请输入官网型号' }]}><Input /></Form.Item></Col>
            <Col xs={24} sm={12}><Form.Item name="supplier_model" label="供应商型号"><Input /></Form.Item></Col>
            <Col xs={24} sm={12}><Form.Item name="supplier_name" label="供应商">
              <Select allowClear showSearch placeholder="选择供应商" optionFilterProp="label"
                onSelect={(val: string) => { const s = suppliersList?.find(x => x.name === val); form.setFieldValue('supplier_id', s?.id || null); }}
                onClear={() => form.setFieldValue('supplier_id', null)}
                options={(suppliersList ?? []).map(s => ({ label: s.name, value: s.name }))} />
            </Form.Item></Col>
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
            <Col xs={24}><Form.Item name="package_includes" label="包装内容"><Input /></Form.Item></Col>
          </Row>
        </Form>
      </Modal>

      {/* Import Modal */}
      <Modal title="批量导入商品" open={importModalOpen} onCancel={() => { setImportModalOpen(false); setImportData([]); }} onOk={handleImportSubmit} confirmLoading={importLoading} okText="确认导入" width={800} destroyOnClose>
        {importData.length === 0 ? (
          <Upload.Dragger accept=".xlsx,.xls" showUploadList={false} beforeUpload={(file) => { handleImportFile(file); return false; }}>
            <p style={{ fontSize: 48, margin: 0 }}><InboxOutlined /></p>
            <p style={{ fontSize: 16, marginTop: 8 }}>点击或拖拽 Excel 文件到此区域</p>
            <p style={{ color: '#999', marginTop: 4 }}>支持 .xlsx / .xls 格式</p>
            <div style={{ textAlign: 'left', background: '#fafafa', padding: '12px 16px', borderRadius: 6, marginTop: 12, fontSize: 13, color: '#666' }}>
              <p style={{ fontWeight: 600, marginBottom: 4 }}>导入要求：</p>
              <p>• 第一行为表头，列名支持中文或英文</p>
              <p>• 必填列：<strong>官网型号</strong> (或 official_model)</p>
            </div>
          </Upload.Dragger>
        ) : (
          <div>
            <p style={{ marginBottom: 12, color: '#666' }}>共解析 <strong>{importData.length}</strong> 行</p>
            <ResponsiveTable dataSource={importData.map((row, i) => ({ ...row, _key: i }))} columns={importColumns} rowKey="_key" size="small" pagination={false} scroll={{ x: 600, y: 400 }} />
          </div>
        )}
      </Modal>

      {/* Detail Modal (keep for backward compatibility) */}
      <Modal title={detailProduct ? detailProduct.official_model : '产品详情'} open={detailOpen} onCancel={closeDetail} footer={null} width={700} destroyOnClose>
        {detailProduct && (
          <>
            <Descriptions bordered column={2} size="small" style={{ marginBottom: 16 }}>
              <Descriptions.Item label="品名" span={2}>{detailProduct.product_name || '-'}</Descriptions.Item>
              <Descriptions.Item label="官网型号">{detailProduct.official_model}</Descriptions.Item>
              <Descriptions.Item label="供应商型号">{detailProduct.supplier_model || '-'}</Descriptions.Item>
              <Descriptions.Item label="供应商名称">{detailProduct.supplier_name || '-'}</Descriptions.Item>
              <Descriptions.Item label="供货价">{detailProduct.supply_price ? `¥${Number(detailProduct.supply_price).toFixed(2)}` : '-'}</Descriptions.Item>
              <Descriptions.Item label="建议报价">{detailProduct.suggested_price ? `¥${Number(detailProduct.suggested_price).toFixed(2)}` : '-'}</Descriptions.Item>
              <Descriptions.Item label="含税"><Tag color={detailProduct.tax_included ? 'blue' : 'default'}>{detailProduct.tax_included ? '含税' : '不含'}</Tag></Descriptions.Item>
              <Descriptions.Item label="图片">{detailProduct.image_url ? <Image src={detailProduct.image_url} style={{ maxWidth: 120, maxHeight: 80, objectFit: 'contain' }} /> : '-'}</Descriptions.Item>
              <Descriptions.Item label="颜色">{detailProduct.color || '-'}</Descriptions.Item>
              <Descriptions.Item label="材质">{detailProduct.material || '-'}</Descriptions.Item>
              <Descriptions.Item label="重量">{detailProduct.weight || '-'}</Descriptions.Item>
              <Descriptions.Item label="尺寸">{detailProduct.size || '-'}</Descriptions.Item>
              <Descriptions.Item label="规格参数" span={2}>{detailProduct.specifications || '-'}</Descriptions.Item>
              <Descriptions.Item label="包装内容" span={2}>{detailProduct.package_includes || '-'}</Descriptions.Item>
            </Descriptions>
            <div style={{ fontWeight: 600, marginBottom: 8, fontSize: 14 }}>采购记录</div>
            {purchaseHistory && purchaseHistory.length > 0 ? (
              <ResponsiveTable dataSource={purchaseHistory as Record<string, unknown>[]} rowKey="id" size="small" pagination={false}
                columns={[
                  { title: '采购单号', key: 'order_no', width: 160, render: (_: unknown, r: Record<string, unknown>) => (r.purchase_orders as Record<string, unknown> | null)?.order_no as string || '-' },
                  { title: '日期', key: 'order_date', width: 100, render: (_: unknown, r: Record<string, unknown>) => (r.purchase_orders as Record<string, unknown> | null)?.order_date as string || '-' },
                  { title: '数量', dataIndex: 'quantity', key: 'quantity', width: 60 },
                  { title: '单价', dataIndex: 'unit_price', key: 'unit_price', width: 80, render: (v: number) => `¥${Number(v).toFixed(2)}` },
                ]}
                scroll={{ x: 600 }} />
            ) : <div style={{ color: '#999', padding: 12 }}>暂无采购记录</div>}
          </>
        )}
      </Modal>
    </div>
  );
}
