import { useState, useMemo, useEffect } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import {
  Card, Form, Input, InputNumber, Button, Table, message, Space,
  Select, Row, Col, Divider, Modal, Tag, Segmented, Typography, Image,
} from 'antd';
import { PlusOutlined, DeleteOutlined, SearchOutlined, DownloadOutlined, ArrowLeftOutlined } from '@ant-design/icons';
import { useMutation, useQuery } from '@tanstack/react-query';
import { supabase } from '../../supabase';
import type { Product, QuotationItem, Quotation, Customer } from '../../types';
import { logOperation } from '../../utils/log';
import { exportExcel, exportPDF } from '../../utils/quotationExport';

function r2(v: number): number {
  return Math.round(v * 100) / 100;
}

async function generateNo(type: 'QUO' | 'PI'): Promise<string> {
  const now = new Date();
  const prefix = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
  const pattern = `${type}-${prefix}-DY`;
  const { data } = await supabase
    .from('quotations')
    .select('quotation_no')
    .like('quotation_no', `${pattern}%`)
    .order('quotation_no', { ascending: false })
    .limit(1);
  let seq = 1;
  if (data && data.length > 0) {
    const last = parseInt(data[0].quotation_no.slice(-2), 10);
    if (!isNaN(last)) seq = last + 1;
  }
  return `${type}-${prefix}-DY${String(seq).padStart(2, '0')}`;
}

export default function QuotationForm() {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const isEdit = !!id;
  const defaultType = (searchParams.get('type') || 'quotation') as 'quotation' | 'pi';

  const [form] = Form.useForm();
  const [docType, setDocType] = useState<'quotation' | 'pi'>(defaultType);
  const [currency, setCurrency] = useState<'RMB' | 'USD'>('RMB');
  const [items, setItems] = useState<Array<QuotationItem & { _key: number; _image_url?: string | null }>>([]);
  const [productModal, setProductModal] = useState(false);
  const [productSearch, setProductSearch] = useState('');
  const [selectedProductIds, setSelectedProductIds] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);

  const exchangeRate = Form.useWatch('exchange_rate', form) ?? 7.25;

  // Load existing quotation for editing
  const { data: existing } = useQuery({
    queryKey: ['quotation-edit', id],
    queryFn: async () => {
      const { data: q } = await supabase.from('quotations').select('*').eq('id', id).single();
      if (!q) throw new Error('Not found');
      const { data: qItems } = await supabase
        .from('quotation_items')
        .select('*, products(image_url)')
        .eq('quotation_id', id)
        .order('created_at');
      return { ...q, quotation_items: qItems ?? [] } as Quotation;
    },
    enabled: isEdit,
  });

  useEffect(() => {
    if (existing) {
      setDocType(existing.type);
      form.setFieldsValue({
        ...existing,
        exchange_rate: existing.exchange_rate,
      });
      const qItems = (existing.quotation_items ?? []).map((item, i) => ({
        ...item,
        _key: i + 1,
        _image_url: (item as unknown as Record<string, unknown>).products
          ? ((item as unknown as Record<string, unknown>).products as Record<string, unknown> | null)?.image_url as string | null ?? null
          : null,
      }));
      setItems(qItems);
    }
  }, [existing, form]);

  // Auto-fill PI default payment terms when type changes
  useEffect(() => {
    if (!isEdit && docType === 'pi') {
      const current = form.getFieldValue('payment_terms');
      if (!current) {
        form.setFieldsValue({
          payment_terms: '1. Payment Terms: 50% T/T advance as deposit, 50% balance before shipment. Samples need full payments.\n2. All banking charges outside Hong Kong are on the buyer\'s account.\n3. Delivery Terms: Within 35 days after payment is confirmed.\n4. Requests for revision or cancellation of acknowledged orders will not be accepted.',
        });
      }
    }
  }, [docType, isEdit, form]);

  // Generate quotation number
  useEffect(() => {
    if (!isEdit) {
      generateNo(docType === 'quotation' ? 'QUO' : 'PI').then(no => {
        form.setFieldsValue({ quotation_no: no });
      });
    }
  }, [docType, isEdit, form]);

  const { data: products } = useQuery({
    queryKey: ['products-select'],
    queryFn: async () => {
      const { data } = await supabase.from('products').select('*').order('official_model');
      return (data ?? []) as (Product & { image_url?: string | null })[];
    },
  });

  const { data: customers } = useQuery({
    queryKey: ['customers-select-all'],
    queryFn: async () => {
      const { data } = await supabase.from('customers').select('id,name,company,phone,website,address').order('name');
      return (data ?? []) as Pick<Customer, 'id' | 'name' | 'company' | 'phone' | 'website' | 'address'>[];
    },
  });

  const filteredProducts = useMemo(() => {
    if (!products) return [];
    return products.filter((p) =>
      !productSearch || p.official_model.toLowerCase().includes(productSearch.toLowerCase()) ||
      p.supplier_model?.toLowerCase().includes(productSearch.toLowerCase())
    );
  }, [products, productSearch]);

  const addProducts = () => {
    const newItems = [...items];
    let nextKey = newItems.length > 0 ? Math.max(...newItems.map(i => i._key)) + 1 : 1;
    let added = 0;
    for (const pid of selectedProductIds) {
      const product = products?.find(p => p.id === pid);
      if (!product) continue;
      if (newItems.some(i => i.product_id === pid)) continue;
      const sp = product.supply_price ?? 0;
      const suggested = (product as unknown as Record<string, unknown>).suggested_price as number | null;
      const rmb = r2(suggested || sp * 1.2);
      const usd = r2(rmb / exchangeRate);
      newItems.push({
        id: '',
        quotation_id: '',
        product_id: pid,
        official_model: product.official_model,
        supplier_model: product.supplier_model,
        quantity: 1,
        moq: 1,
        unit_price_rmb: rmb,
        unit_price_usd: usd,
        supply_price: sp,
        description: '',
        remarks: '',
        created_at: '',
        _key: nextKey++,
        _image_url: product.image_url || null,
      });
      added++;
    }
    if (added > 0) {
      setItems(newItems);
      message.success(`已添加 ${added} 个产品`);
    }
    setProductModal(false);
    setSelectedProductIds(new Set());
    setProductSearch('');
  };

  const removeItem = (key: number) => setItems(items.filter(i => i._key !== key));

  const updateItemField = (key: number, field: string, value: unknown) => {
    setItems(items.map(i => i._key === key ? { ...i, [field]: value } : i));
  };

  const updateItemPrice = (key: number, field: 'unit_price_rmb' | 'unit_price_usd', value: number) => {
    setItems(items.map(i => {
      if (i._key !== key) return i;
      if (field === 'unit_price_rmb') {
        return { ...i, unit_price_rmb: value, unit_price_usd: r2(value / exchangeRate) };
      }
      return { ...i, unit_price_usd: value, unit_price_rmb: r2(value * exchangeRate) };
    }));
  };

  const totalRMB = useMemo(() => items.reduce((s, i) => s + i.unit_price_rmb * i.quantity, 0), [items]);
  const totalUSD = useMemo(() => items.reduce((s, i) => s + i.unit_price_usd * i.quantity, 0), [items]);

  const handleSave = async () => {
    const values = await form.validateFields();
    if (items.length === 0) {
      message.error('请至少添加一个产品');
      return;
    }
    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('未登录');

      const baseData = {
        type: docType,
        quotation_no: values.quotation_no,
        customer_company: values.customer_company || null,
        customer_contact: values.customer_contact || null,
        customer_website: null,
        customer_address: values.customer_address || null,
        customer_phone: values.customer_phone || null,
        exchange_rate: values.exchange_rate || 7.25,
        valid_days: values.valid_days || 15,
        payment_terms: values.payment_terms || 'T/T 30% deposit, 70% before shipment',
        delivery_time_global: values.delivery_time_global || '',
        delivery_time: values.delivery_time_global || '',
        notes: values.notes || null,
        bank_beneficiary: values.bank_beneficiary || 'Dong Yi Technology Co., Limited',
        bank_name: values.bank_name || '',
        bank_address: values.bank_address || null,
        bank_account: values.bank_account || null,
        bank_swift: values.bank_swift || '',
        status: 'draft',
        user_id: user.id,
      };

      let qId: string;

      if (isEdit && id) {
        const { error: upErr } = await supabase.from('quotations').update(baseData).eq('id', id);
        if (upErr) throw upErr;

        // Delete old items and re-insert
        await supabase.from('quotation_items').delete().eq('quotation_id', id);

        const itemRows = items.map(i => ({
          quotation_id: id,
          product_id: i.product_id,
          official_model: i.official_model,
          supplier_model: null,
          quantity: i.quantity,
          moq: i.moq || 1,
          unit_price_rmb: i.unit_price_rmb,
          unit_price_usd: i.unit_price_usd,
          supply_price: null,
          description: i.description || null,
          remarks: i.remarks || null,
        }));
        const { error: iErr } = await supabase.from('quotation_items').insert(itemRows);
        if (iErr) throw iErr;
        qId = id;
      } else {
        const { data: q, error: qErr } = await supabase.from('quotations').insert([baseData]).select().single();
        if (qErr) throw qErr;
        qId = q.id;

        const itemRows = items.map(i => ({
          quotation_id: q.id,
          product_id: i.product_id,
          official_model: i.official_model,
          supplier_model: null,
          quantity: i.quantity,
          moq: i.moq || 1,
          unit_price_rmb: i.unit_price_rmb,
          unit_price_usd: i.unit_price_usd,
          supply_price: null,
          description: i.description || null,
          remarks: i.remarks || null,
        }));
        const { error: iErr } = await supabase.from('quotation_items').insert(itemRows);
        if (iErr) throw iErr;
      }

      const qty = items.reduce((s, i) => s + i.quantity, 0);
      message.success(isEdit ? '已更新' : '已保存');
      logOperation(docType === 'quotation' ? 'quotation' : 'pi', isEdit ? 'update' : 'create', qId, `${values.quotation_no} (${items.length} items)`);
      navigate(`/quotations/${docType === 'quotation' ? 'quo' : 'pi'}`);
    } catch (err: unknown) {
      message.error((err as Error).message || '保存失败');
    } finally {
      setSaving(false);
    }
  };

  const getExportData = () => {
    const values = form.getFieldsValue();
    const quotationData: Quotation = {
      id: id || '',
      type: docType,
      quotation_no: values.quotation_no || '',
      customer_id: values.customer_id || null,
      customer_company: values.customer_company || null,
      customer_contact: values.customer_contact || null,
      customer_website: null,
	        customer_address: values.customer_address || null,
      customer_phone: values.customer_phone || null,
      trade_terms: values.trade_terms || '',
      exchange_rate: values.exchange_rate || 7.25,
      valid_days: values.valid_days || 15,
      payment_terms: values.payment_terms || '',
      delivery_time: '',
      delivery_time_global: values.delivery_time_global || '',
      notes: values.notes || null,
      bank_beneficiary: values.bank_beneficiary || '',
      bank_name: values.bank_name || '',
      bank_address: values.bank_address || null,
      bank_account: values.bank_account || null,
      bank_swift: values.bank_swift || '',
      bank_code: values.bank_code || null,
      deposit_rate: values.deposit_rate || 50,
      status: 'draft',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      user_id: '',
      org_id: null,
      quotation_items: items as QuotationItem[],
    };
    const qItems = items as QuotationItem[];
    return { quotationData, qItems };
  };

  const handleExportExcel = () => {
    const { quotationData, qItems } = getExportData();
    exportExcel(quotationData, qItems, currency);
    message.success('Excel 已导出');
  };

  const handleExportPDF = () => {
    const { quotationData, qItems } = getExportData();
    exportPDF(quotationData, qItems, docType, currency);
  };

  const isQuo = docType === 'quotation';

  const itemColumns = [
    { title: '#', key: 'idx', width: 40, render: (_: unknown, __: unknown, i: number) => i + 1 },
    ...(isQuo ? [{
      title: '图片', key: 'image', width: 60,
      render: (_: unknown, __: unknown, i: number) => {
        const url = items[i]._image_url;
        return url ? <Image src={url} style={{ width: 40, height: 40, objectFit: 'cover', borderRadius: 4 }} preview={false} /> : <div style={{ width: 40, height: 40, background: '#f5f5f5', borderRadius: 4 }} />;
      },
    }] : []),
    {
      title: '产品型号', dataIndex: 'official_model', key: 'official_model', width: 160,
      render: (v: string, _: unknown, i: number) => (
        <Input size="small" value={v} onChange={(e) => updateItemField(items[i]._key, 'official_model', e.target.value)} style={{ width: 150 }} />
      ),
    },
    ...(isQuo ? [{
      title: '产品详情', key: 'description', width: 180,
      render: (_: unknown, __: unknown, i: number) => (
        <Input.TextArea size="small" rows={2} value={items[i].description || ''}
          onChange={(e) => updateItemField(items[i]._key, 'description', e.target.value)}
          placeholder="Specifications, features..." style={{ width: 170, fontSize: 12 }} />
      ),
    }] : []),
    ...(isQuo ? [{
      title: 'MOQ', key: 'moq', width: 60,
      render: (_: unknown, __: unknown, i: number) => (
        <InputNumber min={1} value={items[i].moq || 1} onChange={(v) => updateItemField(items[i]._key, 'moq', v ?? 1)} size="small" style={{ width: 55 }} />
      ),
    }] : [{
      title: 'Qty', key: 'qty', width: 60,
      render: (_: unknown, __: unknown, i: number) => (
        <InputNumber min={1} value={items[i].quantity} onChange={(v) => updateItemField(items[i]._key, 'quantity', v ?? 1)} size="small" style={{ width: 55 }} />
      ),
    }]),
    { title: 'Price', key: 'price', width: 130,
      render: (_: unknown, __: unknown, i: number) => {
        const item = items[i];
        const field = currency === 'RMB' ? 'unit_price_rmb' : 'unit_price_usd';
        return (
          <InputNumber min={0} step={0.01} precision={2} value={item[field]}
            onChange={(val) => updateItemPrice(item._key, field, val ?? 0)}
            prefix={currency === 'RMB' ? '¥' : '$'} size="small" style={{ width: 120 }} />
        );
      },
    },
    ...(isQuo ? [] : [{
      title: 'Total', key: 'total', width: 110,
      render: (_: unknown, __: unknown, i: number) => {
        const item = items[i];
        const total = currency === 'RMB' ? item.unit_price_rmb * item.quantity : item.unit_price_usd * item.quantity;
        return <span style={{ fontWeight: 500 }}>{currency === 'RMB' ? '¥' : '$'}{total.toFixed(2)}</span>;
      },
    }]),
    ...(isQuo ? [{
      title: '备注', key: 'remarks', width: 140,
      render: (_: unknown, __: unknown, i: number) => (
        <Input size="small" value={items[i].remarks || ''}
          onChange={(e) => updateItemField(items[i]._key, 'remarks', e.target.value)}
          placeholder="Optional note" style={{ width: 130, fontSize: 12 }} />
      ),
    }] : []),
    { title: '', key: 'actions', width: 50,
      render: (_: unknown, __: unknown, i: number) => (
        <Button size="small" danger icon={<DeleteOutlined />} onClick={() => removeItem(items[i]._key)} />
      ),
    },
  ];

  return (
    <div>
      <Card title={
        <Space>
          <Button icon={<ArrowLeftOutlined />} onClick={() => navigate(`/quotations/${docType === 'quotation' ? 'quo' : 'pi'}`)} type="text" />
          <span style={{ fontSize: 18, fontWeight: 600 }}>
            {isEdit ? '编辑' : '新建'} {isQuo ? '报价单' : 'PI'}
          </span>
          <Tag>{form.getFieldValue('quotation_no') || '生成中...'}</Tag>
          <Tag color={isQuo ? 'blue' : 'green'}>{isQuo ? 'QUOTATION' : 'INVOICE'}</Tag>
        </Space>
      } extra={
        <Space>
          {!isEdit && (
            <Segmented
              value={docType}
              onChange={(v) => setDocType(v as 'quotation' | 'pi')}
              options={[
                { label: '报价单', value: 'quotation' },
                { label: 'PI', value: 'pi' },
              ]}
            />
          )}
          {isQuo && <Button onClick={handleExportExcel} icon={<DownloadOutlined />}>Excel</Button>}
          <Button onClick={handleExportPDF} icon={<DownloadOutlined />}>PDF</Button>
          <Button type="primary" loading={saving} onClick={handleSave}>保存</Button>
        </Space>
      }>
        <Form form={form} layout="vertical" size="middle"
          initialValues={{
            exchange_rate: 7.25,
            valid_days: 15,
            deposit_rate: 50,
            bank_beneficiary: 'Dong Yi Technology Co., Limited',
            bank_name: 'Bank of China, Shenzhen Branch',
            bank_swift: 'BKCHCNBJ45A',
            delivery_time_global: '15-20 working days after deposit confirmation',
          }}
        >
          <Row gutter={16}>
            <Col xs={24}>
              <Form.Item name="customer_id" hidden />
              <Form.Item label="Link to Customer / 关联客户">
                <Select
                  showSearch
                  allowClear
                  placeholder="Search & select existing customer..."
                  filterOption={(input, option) => (option?.label ?? '').toLowerCase().includes(input.toLowerCase())}
                  onChange={(val) => {
                    if (!val) return;
                    const c = customers?.find(x => x.id === val);
                    if (c) {
                      form.setFieldsValue({
                        customer_id: c.id,
                        customer_company: c.company || c.name,
                        customer_contact: c.name,
                        customer_phone: c.phone || '',
                        customer_address: c.address || '',
                      });
                    }
                  }}
                  options={(customers ?? []).map(c => ({
                    label: `${c.company || c.name}${c.phone ? ` (${c.phone})` : ''}`,
                    value: c.id,
                  }))}
                />
              </Form.Item>
            </Col>
            <Col xs={24} sm={12}>
              <Form.Item name="customer_company" label="Customer Company / 客户公司">
                <Input placeholder="e.g. ABC Trading Co., Ltd." />
              </Form.Item>
            </Col>
            <Col xs={24} sm={12}>
              <Form.Item name="customer_contact" label="Contact Person / 联系人">
                <Input placeholder="Contact name" />
              </Form.Item>
            </Col>
            <Col xs={24} sm={12}>
              <Form.Item name="customer_phone" label="Phone / 电话">
                <Input placeholder="Phone number" />
              </Form.Item>
            </Col>
            <Col xs={24}>
              <Form.Item name="customer_address" label="Address / 地址">
                <Input.TextArea rows={2} placeholder="Full address" />
              </Form.Item>
            </Col>
          </Row>

          <Divider />

          <Space style={{ width: '100%', justifyContent: 'space-between', marginBottom: 12 }}>
            <Typography.Title level={5} style={{ margin: 0 }}>Products / 产品明细</Typography.Title>
            <Space>
              <Segmented
                value={currency}
                onChange={(v) => setCurrency(v as 'RMB' | 'USD')}
                options={[
                  { label: 'RMB ¥', value: 'RMB' },
                  { label: 'USD $', value: 'USD' },
                ]}
              />
              <Button icon={<PlusOutlined />} onClick={() => setProductModal(true)}>
                {isQuo ? '从商品库选择' : '选择产品'}
              </Button>
            </Space>
          </Space>

          <Table
            dataSource={items}
            columns={itemColumns}
            rowKey="_key"
            pagination={false}
            size="small"
            locale={{ emptyText: `请点击"从商品库选择"添加产品` }}
            summary={() => !isQuo && items.length > 0 ? (
              <Table.Summary.Row>
                <Table.Summary.Cell index={0} align="right" colSpan={5}>
                  <strong>Total / 合计：</strong>
                </Table.Summary.Cell>
                <Table.Summary.Cell index={1}>
                  <strong>{currency === 'RMB' ? `¥${totalRMB.toFixed(2)}` : `$${totalUSD.toFixed(2)}`}</strong>
                </Table.Summary.Cell>
                <Table.Summary.Cell index={2}>
                  <Tag>{currency === 'RMB' ? `≈ $${totalUSD.toFixed(2)}` : `≈ ¥${totalRMB.toFixed(2)}`}</Tag>
                </Table.Summary.Cell>
                <Table.Summary.Cell index={3} />
              </Table.Summary.Row>
            ) : null}
          />

          <div style={{ marginTop: 8, fontSize: 12, color: '#999' }}>
            * 默认价格取商品建议报价。汇率：{Number(exchangeRate).toFixed(4)}
            {isQuo ? ' | 图片和详情仅报价单显示，PI不含图片和详情' : ''}
          </div>

          <Divider />

          <Typography.Title level={5}>Settings / 设置与条款</Typography.Title>
          <Row gutter={16}>
            <Col xs={24} sm={6}>
              <Form.Item name="exchange_rate" label="Exchange Rate / 汇率">
                <InputNumber min={1} max={20} step={0.01} precision={4} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col xs={24} sm={6}>
              <Form.Item name="valid_days" label="Validity / 有效期（天）">
                <InputNumber min={1} max={90} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col xs={24} sm={6}>
              <Form.Item name="quotation_no" label="Document No. / 编号">
                <Input />
              </Form.Item>
            </Col>
            <Col xs={24} sm={6}>
              <Form.Item name="delivery_time_global" label="Delivery / 交货时间">
                <Input placeholder="e.g. 15-20 working days" />
              </Form.Item>
            </Col>
            <Col xs={24} sm={6}>
              <Form.Item name="trade_terms" label="Trade Terms / 贸易方式">
                <Input placeholder="e.g. FOB Shenzhen, EXW, CIF" />
              </Form.Item>
            </Col>
            {!isQuo && (
              <Col xs={24} sm={6}>
                <Form.Item name="deposit_rate" label="Deposit % / 首付比例">
                  <InputNumber min={0} max={100} step={5} style={{ width: '100%' }} />
                </Form.Item>
              </Col>
            )}
            <Col xs={24} sm={12}>
              <Form.Item name="payment_terms" label="Payment Terms / 付款条款">
                <Input.TextArea rows={isQuo ? 2 : 4}
                  placeholder={isQuo ? "e.g. T/T 30% deposit..." : "1. 50% T/T advance as deposit...\n2. All banking charges..."}
                />
              </Form.Item>
            </Col>
            <Col xs={24}>
              <Form.Item name="notes" label="Notes / 备注">
                <Input.TextArea rows={2} placeholder="Additional notes / terms" />
              </Form.Item>
            </Col>
          </Row>

          <Divider />

          {!isQuo && (
            <>
              <Typography.Title level={5}>Bank Information / 银行信息</Typography.Title>
              <Row gutter={16}>
                <Col xs={24} sm={12}>
                  <Form.Item name="bank_beneficiary" label="Company Name / 收款人">
                    <Input />
                  </Form.Item>
                </Col>
                <Col xs={24} sm={12}>
                  <Form.Item name="bank_name" label="Bank Name / 银行名称">
                    <Input />
                  </Form.Item>
                </Col>
                <Col xs={24} sm={12}>
                  <Form.Item name="bank_account" label="Account No. / 银行账号">
                    <Input />
                  </Form.Item>
                </Col>
                <Col xs={24} sm={12}>
                  <Form.Item name="bank_swift" label="SWIFT Code">
                    <Input placeholder="e.g. BKCHCNBJ45A" />
                  </Form.Item>
                </Col>
                <Col xs={24} sm={12}>
                  <Form.Item name="bank_address" label="Bank Address / 银行地址">
                    <Input />
                  </Form.Item>
                </Col>
                <Col xs={24} sm={12}>
                  <Form.Item name="bank_code" label="Bank Code / 银行代码">
                    <Input placeholder="e.g. 123456" />
                  </Form.Item>
                </Col>
              </Row>
            </>
          )}
        </Form>
      </Card>

      <Modal
        title={isQuo ? '选择产品（从商品库）' : '选择产品'}
        open={productModal}
        onOk={addProducts}
        onCancel={() => { setProductModal(false); setSelectedProductIds(new Set()); setProductSearch(''); }}
        okText={`添加选中 (${selectedProductIds.size})`}
        width={750}
      >
        <Input
          placeholder="搜索产品型号..."
          prefix={<SearchOutlined />}
          value={productSearch}
          onChange={(e) => setProductSearch(e.target.value)}
          allowClear
          style={{ marginBottom: 12 }}
        />
        <Table
          dataSource={filteredProducts}
          columns={[
            ...(isQuo ? [{
              title: '图片', dataIndex: 'image_url', key: 'image_url', width: 50,
              render: (url: string | null) => url
                ? <Image src={url} style={{ width: 32, height: 32, objectFit: 'cover', borderRadius: 4 }} preview={false} />
                : <div style={{ width: 32, height: 32, background: '#f0f0f0', borderRadius: 4 }} />,
            }] : []),
            { title: '型号', dataIndex: 'official_model', key: 'official_model', width: 180 },
            { title: '详情', dataIndex: 'description', key: 'description', ellipsis: true },
            { title: '供货价', dataIndex: 'supply_price', key: 'supply_price', width: 90, render: (v: number | null) => v ? `¥${v.toFixed(2)}` : '-' },
            { title: '建议报价', dataIndex: 'suggested_price', key: 'suggested_price', width: 90, render: (v: number | null) => v ? `¥${v.toFixed(2)}` : '-' },
          ]}
          rowKey="id"
          size="small"
          pagination={{ pageSize: 10 }}
          rowSelection={{
            type: 'checkbox',
            selectedRowKeys: Array.from(selectedProductIds),
            onChange: (keys) => setSelectedProductIds(new Set(keys as string[]) as Set<string>),
          }}
        />
      </Modal>
    </div>
  );
}
