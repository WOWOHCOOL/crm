import { useState } from 'react';
import {
  Table, Button, Space, Input, Modal, Form, InputNumber, Switch,
  message, Popconfirm, Card, Row, Col, Tag, Image, Upload, Descriptions, Select,
} from 'antd';
import { PlusOutlined, SearchOutlined, InboxOutlined, EyeOutlined } from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../supabase';
import type { Product, Supplier } from '../../types';
import { logOperation } from '../../utils/log';
import { useAuth } from '../../auth/AuthContext';
import * as XLSX from 'xlsx';
import { withMobileLabels } from '../../utils/columns';

export default function ProductList() {
  const { isOwner, isAdmin } = useAuth();
  const canEdit = isOwner || isAdmin;
  const [search, setSearch] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Product | null>(null);
  const [form] = Form.useForm();
  const [importModalOpen, setImportModalOpen] = useState(false);
  const [importData, setImportData] = useState<Record<string, unknown>[]>([]);
  const [importLoading, setImportLoading] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailProduct, setDetailProduct] = useState<Product | null>(null);
  const queryClient = useQueryClient();

  const { data: products, isLoading } = useQuery({
    queryKey: ['products', search],
    queryFn: async () => {
      let query = supabase.from('products').select('*, suppliers(name)').order('official_model');
      if (search) {
        query = query.or(`official_model.ilike.%${search}%,supplier_model.ilike.%${search}%,supplier_name.ilike.%${search}%`);
      }
      const { data } = await query;
      return (data ?? []) as (Product & { suppliers: Pick<Supplier, 'name'> | null })[];
    },
    staleTime: 0,
    refetchOnMount: true,
  });

  const { data: suppliersList } = useQuery({
    queryKey: ['suppliers-for-products'],
    queryFn: async () => {
      const { data } = await supabase.from('suppliers').select('id, name').order('name');
      return (data ?? []) as { id: string; name: string }[];
    },
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

  const { data: purchaseHistory } = useQuery({
    queryKey: ['product-purchases', detailProduct?.id],
    queryFn: async () => {
      if (!detailProduct) return [];
      const { data } = await supabase
        .from('purchase_items')
        .select('*, purchase_orders!inner(order_no, order_date, suppliers(name))')
        .eq('product_id', detailProduct.id)
        .order('created_at', { ascending: false });
      return data ?? [];
    },
    enabled: !!detailProduct,
  });

  const showDetail = (record: Product) => {
    setDetailProduct(record);
    setDetailOpen(true);
  };

  const handleImportFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: 'array' });
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json(sheet) as Record<string, unknown>[];
        if (rows.length === 0) {
          message.warning('Excel 文件为空');
          return;
        }
        setImportData(rows);
        message.success(`已解析 ${rows.length} 行数据`);
      } catch {
        message.error('文件解析失败，请检查格式');
      }
    };
    reader.readAsArrayBuffer(file);
    return false;
  };

  const handleImportSubmit = async () => {
    if (importData.length === 0) {
      message.warning('没有可导入的数据');
      return;
    }
    setImportLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { message.error('未登录'); setImportLoading(false); return; }

    let success = 0;
    let fail = 0;
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
      if (error) fail++;
      else success++;
    }

    setImportLoading(false);
    queryClient.invalidateQueries({ queryKey: ['products'] });
    queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] });
    message.success(`导入完成：成功 ${success} 条${fail ? `，失败 ${fail} 条` : ''}`);
    if (fail === 0) {
      setImportModalOpen(false);
      setImportData([]);
    }
    logOperation('product', 'import', undefined, `批量导入 ${success} 条`);
  };

  const downloadTemplate = () => {
    const ws = XLSX.utils.aoa_to_sheet([
      ['品名', '官网型号', '供应商型号', '供应商名称', '供货价', '建议报价', '含税', '产品图片'],
      ['Model-X100', 'SN-2024-A001', '示例供应商', '120', '180', '是', 'https://example.com/image.jpg'],
      ['Model-Y200', 'SN-2024-B002', '', '85', '130', '否', ''],
    ]);
    ws['!cols'] = [{ wch: 16 }, { wch: 18 }, { wch: 16 }, { wch: 10 }, { wch: 10 }, { wch: 8 }, { wch: 36 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, '商品导入模板');
    XLSX.writeFile(wb, '商品导入模板.xlsx');
  };

  const importColumns = [
    { title: '品名', dataIndex: '品名', key: 'product_name', ellipsis: true },
    { title: '官网型号', dataIndex: '官网型号', key: 'official_model', ellipsis: true },
    { title: '供应商型号', dataIndex: '供应商型号', key: 'supplier_model', ellipsis: true },
    { title: '供应商名称', dataIndex: '供应商名称', key: 'supplier_name', ellipsis: true },
    { title: '供货价', dataIndex: '供货价', key: 'supply_price', width: 100 },
    { title: '建议报价', dataIndex: '建议报价', key: 'suggested_price', width: 100 },
    { title: '含税', dataIndex: '含税', key: 'tax_included', width: 60 },
  ];

  const columns = [
    {
      title: '图片', dataIndex: 'image_url', key: 'image_url', width: 60,
      render: (url: string | null) => url
        ? <Image src={url} style={{ width: 36, height: 36, objectFit: 'cover', borderRadius: 4 }} preview={false} />
        : <div style={{ width: 36, height: 36, background: '#f5f5f5', borderRadius: 4 }} />,
    },
    { title: '品名', dataIndex: 'product_name', key: 'product_name', width: 160, render: (v: string | null) => v || '-' },
    { title: '官网型号', dataIndex: 'official_model', key: 'official_model', width: 160 },
    { title: '供应商型号', dataIndex: 'supplier_model', key: 'supplier_model', width: 150 },
    {
      title: '供应商', key: 'supplier', width: 150,
      render: (_: unknown, record: Product & { suppliers: { name: string } | null }) =>
        record.suppliers?.name || record.supplier_name || '-',
    },
    ...(canEdit ? [{ title: '供货价', dataIndex: 'supply_price', key: 'supply_price', width: 120, render: (v: number | null) => v ? `¥${Number(v).toFixed(2)}` : '-' }] : []),
    { title: '建议报价', dataIndex: 'suggested_price', key: 'suggested_price', width: 120, render: (v: number | null) => v ? `¥${Number(v).toFixed(2)}` : '-' },
    {
      title: '含税', dataIndex: 'tax_included', key: 'tax_included', width: 80,
      render: (v: boolean) => <Tag color={v ? 'blue' : 'default'}>{v ? '含税' : '不含'}</Tag>,
    },
    ...(canEdit ? [{
      title: '操作', key: 'actions', width: 190,
      render: (_: unknown, record: Product) => (
        <Space>
          <Button size="small" icon={<EyeOutlined />} onClick={() => showDetail(record)}>详情</Button>
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
          {canEdit && <Space>
            <Button type="primary" icon={<PlusOutlined />}
              onClick={() => { setEditing(null); form.resetFields(); setModalOpen(true); }}>
              添加商品
            </Button>
            <Button icon={<InboxOutlined />} onClick={() => setImportModalOpen(true)}>
              导入 Excel
            </Button>
            <Button type="link" size="small" onClick={downloadTemplate}>下载模板</Button>
          </Space>}
        </Space>
        <Table
          dataSource={products}
          columns={withMobileLabels(columns)}
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
              <Form.Item name="product_name" label="品名">
                <Input placeholder="产品名称" />
              </Form.Item>
            </Col>
            <Col xs={24} sm={12}>
              <Form.Item name="official_model" label="官网型号" rules={[{ required: true, message: '请输入官网型号' }]}>
                <Input />
              </Form.Item>
            </Col>
            <Col xs={24} sm={12}>
              <Form.Item name="supplier_model" label="供应商型号">
                <Input />
              </Form.Item>
            </Col>
            <Col xs={24} sm={12}>
              <Form.Item name="supplier_name" label="供应商">
                <Select
                  allowClear
                  showSearch
                  placeholder="从供应商资料选择"
                  optionFilterProp="label"
                  onSelect={(val: string) => {
                    const supplier = suppliersList?.find(s => s.name === val);
                    form.setFieldValue('supplier_id', supplier?.id || null);
                  }}
                  onClear={() => form.setFieldValue('supplier_id', null)}
                  options={(suppliersList ?? []).map(s => ({ label: s.name, value: s.name }))}
                />
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
          <div style={{ fontWeight: 600, marginBottom: 8, marginTop: 8, fontSize: 14 }}>产品参数</div>
          <Row gutter={16}>
            <Col xs={24} sm={12}>
              <Form.Item name="color" label="颜色">
                <Input placeholder="如：黑色、白色" />
              </Form.Item>
            </Col>
            <Col xs={24} sm={12}>
              <Form.Item name="material" label="材质">
                <Input placeholder="如：ABS塑料、金属" />
              </Form.Item>
            </Col>
            <Col xs={24} sm={12}>
              <Form.Item name="weight" label="重量">
                <Input placeholder="如：200g" />
              </Form.Item>
            </Col>
            <Col xs={24} sm={12}>
              <Form.Item name="size" label="尺寸">
                <Input placeholder="如：15×10×5cm" />
              </Form.Item>
            </Col>
            <Col xs={24}>
              <Form.Item name="specifications" label="规格参数">
                <Input.TextArea rows={2} placeholder="技术规格参数" />
              </Form.Item>
            </Col>
            <Col xs={24}>
              <Form.Item name="package_includes" label="包装内容">
                <Input placeholder="如：主机×1、数据线×1、说明书×1" />
              </Form.Item>
            </Col>
          </Row>
        </Form>
      </Modal>

      <Modal
        title="批量导入商品"
        open={importModalOpen}
        onCancel={() => { setImportModalOpen(false); setImportData([]); }}
        onOk={handleImportSubmit}
        confirmLoading={importLoading}
        okText="确认导入"
        width={800}
        destroyOnClose
      >
        {importData.length === 0 ? (
          <Upload.Dragger
            accept=".xlsx,.xls"
            showUploadList={false}
            beforeUpload={(file) => {
              handleImportFile(file);
              return false;
            }}
          >
            <p style={{ fontSize: 48, margin: 0 }}><InboxOutlined /></p>
            <p style={{ fontSize: 16, marginTop: 8 }}>点击或拖拽 Excel 文件到此区域</p>
            <p style={{ color: '#999', marginTop: 4 }}>支持 .xlsx / .xls 格式</p>
            <div style={{ textAlign: 'left', background: '#fafafa', padding: '12px 16px', borderRadius: 6, marginTop: 12, fontSize: 13, color: '#666' }}>
              <p style={{ fontWeight: 600, marginBottom: 4 }}>导入要求：</p>
              <p>• 第一行为表头，列名支持中文或英文</p>
              <p>• 必填列：<strong>官网型号</strong> (或 official_model)</p>
              <p>• 可选列：供应商型号、供应商名称、供货价、建议报价、含税（是/否）、产品图片</p>
            </div>
          </Upload.Dragger>
        ) : (
          <div>
            <p style={{ marginBottom: 12, color: '#666' }}>
              共解析 <strong>{importData.length}</strong> 行，确认无误后点击"确认导入"
            </p>
            <Table
              dataSource={importData.map((row, i) => ({ ...row, _key: i }))}
              columns={importColumns}
              rowKey="_key"
              size="small"
              pagination={false}
              scroll={{ x: 600, y: 400 }}
            />
          </div>
        )}
      </Modal>

      <Modal
        title={detailProduct ? detailProduct.official_model : '产品详情'}
        open={detailOpen}
        onCancel={() => { setDetailOpen(false); setDetailProduct(null); }}
        footer={null}
        width={700}
        destroyOnClose
      >
        {detailProduct && (
          <>
            <Descriptions bordered column={2} size="small" style={{ marginBottom: 16 }}>
              <Descriptions.Item label="品名" span={2}>{detailProduct.product_name || '-'}</Descriptions.Item>
              <Descriptions.Item label="官网型号">{detailProduct.official_model}</Descriptions.Item>
              <Descriptions.Item label="供应商型号">{detailProduct.supplier_model || '-'}</Descriptions.Item>
              <Descriptions.Item label="供应商名称">{detailProduct.supplier_name || '-'}</Descriptions.Item>
              <Descriptions.Item label="供货价">
                {detailProduct.supply_price ? `¥${Number(detailProduct.supply_price).toFixed(2)}` : '-'}
              </Descriptions.Item>
              <Descriptions.Item label="建议报价">
                {detailProduct.suggested_price ? `¥${Number(detailProduct.suggested_price).toFixed(2)}` : '-'}
              </Descriptions.Item>
              <Descriptions.Item label="含税">
                <Tag color={detailProduct.tax_included ? 'blue' : 'default'}>{detailProduct.tax_included ? '含税' : '不含'}</Tag>
              </Descriptions.Item>
              <Descriptions.Item label="图片">
                {detailProduct.image_url
                  ? <Image src={detailProduct.image_url} style={{ maxWidth: 120, maxHeight: 80, objectFit: 'contain' }} />
                  : '-'}
              </Descriptions.Item>
              <Descriptions.Item label="颜色">{detailProduct.color || '-'}</Descriptions.Item>
              <Descriptions.Item label="材质">{detailProduct.material || '-'}</Descriptions.Item>
              <Descriptions.Item label="重量">{detailProduct.weight || '-'}</Descriptions.Item>
              <Descriptions.Item label="尺寸">{detailProduct.size || '-'}</Descriptions.Item>
              <Descriptions.Item label="规格参数" span={2}>{detailProduct.specifications || '-'}</Descriptions.Item>
              <Descriptions.Item label="包装内容" span={2}>{detailProduct.package_includes || '-'}</Descriptions.Item>
            </Descriptions>

            <div style={{ fontWeight: 600, marginBottom: 8, fontSize: 14 }}>采购记录</div>
            {purchaseHistory && purchaseHistory.length > 0 ? (
              <Table dataSource={purchaseHistory as Record<string, unknown>[]}
                rowKey="id" size="small" pagination={false}
                columns={[
                  {
                    title: '采购单号', key: 'order_no', width: 160,
                    render: (_: unknown, r: Record<string, unknown>) =>
                      (r.purchase_orders as Record<string, unknown> | null)?.order_no as string || '-',
                  },
                  {
                    title: '日期', key: 'order_date', width: 100,
                    render: (_: unknown, r: Record<string, unknown>) =>
                      (r.purchase_orders as Record<string, unknown> | null)?.order_date as string || '-',
                  },
                  {
                    title: '供应商', key: 'supplier', width: 120,
                    render: (_: unknown, r: Record<string, unknown>) => {
                      const po = r.purchase_orders as Record<string, unknown> | null;
                      const s = po?.suppliers as Record<string, unknown> | null;
                      return s?.name as string || '-';
                    },
                  },
                  { title: '数量', dataIndex: 'quantity', key: 'quantity', width: 60 },
                  { title: '单价', dataIndex: 'unit_price', key: 'unit_price', width: 80, render: (v: number) => `¥${Number(v).toFixed(2)}` },
                ]}
                scroll={{ x: 600 }}
              />
            ) : (
              <div style={{ color: '#999', padding: 12 }}>暂无采购记录</div>
            )}
          </>
        )}
      </Modal>
    </div>
  );
}
