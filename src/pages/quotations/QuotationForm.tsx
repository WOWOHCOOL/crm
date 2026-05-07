import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Card, Form, Input, InputNumber, Button, Table, message, Space,
  Select, Row, Col, Divider, Modal, Tag, Segmented, Typography,
} from 'antd';
import { PlusOutlined, DeleteOutlined, ShoppingOutlined, SearchOutlined, DownloadOutlined } from '@ant-design/icons';
import { useMutation, useQuery } from '@tanstack/react-query';
import { supabase } from '../../supabase';
import type { Product, QuotationItem } from '../../types';

function generateQuotationNo(): string {
  const now = new Date();
  const d = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
  const rand = String(Math.floor(Math.random() * 9000) + 1000);
  return `QTE-${d}-${rand}`;
}

/** Round to 2 decimal places */
function r2(v: number): number {
  return Math.round(v * 100) / 100;
}

export default function QuotationForm() {
  const navigate = useNavigate();
  const [form] = Form.useForm();
  const [currency, setCurrency] = useState<'RMB' | 'USD'>('RMB');
  const [items, setItems] = useState<Array<QuotationItem & { _key: number }>>([]);
  const [productModal, setProductModal] = useState(false);
  const [productSearch, setProductSearch] = useState('');
  const [selectedProductIds, setSelectedProductIds] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const [savedId, setSavedId] = useState<string | null>(null);

  const exchangeRate = Form.useWatch('exchange_rate', form) ?? 7.25;

  const { data: products } = useQuery({
    queryKey: ['products-select'],
    queryFn: async () => {
      const { data } = await supabase.from('products').select('*').order('official_model');
      return (data ?? []) as Product[];
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
      const rmb = r2(sp * 1.2);
      const usd = r2(rmb / exchangeRate);
      newItems.push({
        id: '',
        quotation_id: '',
        product_id: pid,
        official_model: product.official_model,
        supplier_model: product.supplier_model,
        quantity: 1,
        unit_price_rmb: rmb,
        unit_price_usd: usd,
        supply_price: sp,
        created_at: '',
        _key: nextKey++,
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

  const removeItem = (key: number) => {
    setItems(items.filter(i => i._key !== key));
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

  const updateItemQty = (key: number, qty: number) => {
    setItems(items.map(i => i._key === key ? { ...i, quantity: qty } : i));
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

      const quotationNo = values.quotation_no || generateQuotationNo();
      const qData = {
        quotation_no: quotationNo,
        customer_company: values.customer_company || null,
        customer_contact: values.customer_contact || null,
        customer_website: values.customer_website || null,
        customer_address: values.customer_address || null,
        customer_phone: values.customer_phone || null,
        exchange_rate: values.exchange_rate || 7.25,
        valid_days: values.valid_days || 15,
        payment_terms: values.payment_terms || 'T/T 30% deposit, 70% before shipment',
        delivery_time: values.delivery_time || '15-20 working days after deposit confirmation',
        notes: values.notes || null,
        bank_beneficiary: values.bank_beneficiary || 'Dong Yi Technology Co., Limited',
        bank_name: values.bank_name || 'Bank of China, Shenzhen Branch',
        bank_address: values.bank_address || null,
        bank_account: values.bank_account || null,
        bank_swift: values.bank_swift || 'BKCHCNBJ45A',
        status: 'draft',
        user_id: user.id,
      };

      const { data: q, error: qErr } = await supabase.from('quotations').insert([qData]).select().single();
      if (qErr) throw qErr;

      const itemRows = items.map(i => ({
        quotation_id: q.id,
        product_id: i.product_id,
        official_model: i.official_model,
        supplier_model: i.supplier_model,
        quantity: i.quantity,
        unit_price_rmb: i.unit_price_rmb,
        unit_price_usd: i.unit_price_usd,
        supply_price: i.supply_price,
      }));
      const { error: iErr } = await supabase.from('quotation_items').insert(itemRows);
      if (iErr) throw iErr;

      message.success('报价单已保存');
      setSavedId(q.id);
    } catch (err: unknown) {
      message.error((err as Error).message || '保存失败');
    } finally {
      setSaving(false);
    }
  };

  const itemColumns = [
    { title: '#', key: 'idx', width: 40, render: (_: unknown, __: unknown, i: number) => i + 1 },
    { title: '产品型号', dataIndex: 'official_model', key: 'official_model', width: 180 },
    { title: '供应商型号', dataIndex: 'supplier_model', key: 'supplier_model', width: 150, render: (v: string | null) => v || '-' },
    { title: '供货价 (¥)', dataIndex: 'supply_price', key: 'supply_price', width: 100, render: (v: number | null) => v ? `¥${Number(v).toFixed(2)}` : '-' },
    {
      title: '数量', dataIndex: 'quantity', key: 'quantity', width: 80,
      render: (v: number, _: unknown, i: number) => (
        <InputNumber min={1} value={v} onChange={(val) => updateItemQty(items[i]._key, val ?? 1)}
          style={{ width: 70 }} size="small" />
      ),
    },
    {
      title: currency === 'RMB' ? '单价 (¥)' : '单价 ($)',
      key: 'price',
      width: 150,
      render: (_: unknown, _r: unknown, i: number) => {
        const item = items[i];
        const field = currency === 'RMB' ? 'unit_price_rmb' : 'unit_price_usd';
        return (
          <InputNumber
            min={0}
            step={0.01}
            precision={2}
            value={item[field]}
            onChange={(val) => updateItemPrice(item._key, field, val ?? 0)}
            prefix={currency === 'RMB' ? '¥' : '$'}
            style={{ width: 140 }}
            size="small"
          />
        );
      },
    },
    {
      title: currency === 'RMB' ? '合计 (¥)' : '合计 ($)',
      key: 'total',
      width: 140,
      render: (_: unknown, __: unknown, i: number) => {
        const item = items[i];
        const total = currency === 'RMB'
          ? item.unit_price_rmb * item.quantity
          : item.unit_price_usd * item.quantity;
        return `${currency === 'RMB' ? '¥' : '$'}${total.toFixed(2)}`;
      },
    },
    {
      title: '操作', key: 'actions', width: 60,
      render: (_: unknown, __: unknown, i: number) => (
        <Button size="small" danger icon={<DeleteOutlined />} onClick={() => removeItem(items[i]._key)} />
      ),
    },
  ];

  return (
    <div>
      <Card title={
        <Space>
          <span style={{ fontSize: 18, fontWeight: 600 }}>新建报价单</span>
          <Tag>{form.getFieldValue('quotation_no') || generateQuotationNo()}</Tag>
        </Space>
      } extra={
        <Space>
          <Button onClick={() => navigate('/quotations')}>返回</Button>
          <Button type="primary" loading={saving} onClick={handleSave}>保存</Button>
          <Button type="primary" icon={<DownloadOutlined />} disabled={!savedId}
            onClick={() => window.open(`/#/quotations/${savedId}/print`, '_blank')}>
            导出报价单
          </Button>
        </Space>
      }>
        <Form form={form} layout="vertical" size="middle"
          initialValues={{
            exchange_rate: 7.25,
            valid_days: 15,
            quotation_no: generateQuotationNo(),
            bank_beneficiary: 'Dong Yi Technology Co., Limited',
            bank_name: 'Bank of China, Shenzhen Branch',
            bank_swift: 'BKCHCNBJ45A',
            payment_terms: 'T/T 30% deposit, 70% before shipment',
            delivery_time: '15-20 working days after deposit confirmation',
          }}
        >
          {/* Section 1: Customer Info */}
          <Typography.Title level={5}>客户信息</Typography.Title>
          <Row gutter={16}>
            <Col xs={24} sm={12}>
              <Form.Item name="customer_company" label="客户公司名称">
                <Input placeholder="e.g. ABC Trading Co., Ltd." />
              </Form.Item>
            </Col>
            <Col xs={24} sm={12}>
              <Form.Item name="customer_contact" label="联系人">
                <Input placeholder="Contact person" />
              </Form.Item>
            </Col>
            <Col xs={24} sm={12}>
              <Form.Item name="customer_website" label="客户网址">
                <Input placeholder="e.g. www.abc-trading.com" />
              </Form.Item>
            </Col>
            <Col xs={24} sm={12}>
              <Form.Item name="customer_phone" label="客户电话">
                <Input placeholder="Phone number" />
              </Form.Item>
            </Col>
            <Col xs={24}>
              <Form.Item name="customer_address" label="客户地址">
                <Input.TextArea rows={2} placeholder="Full address" />
              </Form.Item>
            </Col>
          </Row>

          <Divider />

          {/* Section 2: Products */}
          <Space style={{ width: '100%', justifyContent: 'space-between', marginBottom: 12 }}>
            <Typography.Title level={5} style={{ margin: 0 }}>产品明细</Typography.Title>
            <Space>
              <Segmented
                value={currency}
                onChange={(v) => setCurrency(v as 'RMB' | 'USD')}
                options={[
                  { label: '人民币 ¥', value: 'RMB' },
                  { label: '美元 $', value: 'USD' },
                ]}
              />
              <Button icon={<PlusOutlined />} onClick={() => setProductModal(true)}>
                选择产品
              </Button>
            </Space>
          </Space>

          <Table
            dataSource={items}
            columns={itemColumns}
            rowKey="_key"
            pagination={false}
            size="small"
            locale={{ emptyText: '请点击"选择产品"添加报价项目' }}
            summary={() => items.length > 0 ? (
              <Table.Summary.Row>
                <Table.Summary.Cell index={0} colSpan={5} align="right">
                  <strong>总计：</strong>
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
            * 默认价格 = 供货价 × 1.2。切换 RMB/USD 切换编辑币种，另一方自动换算（汇率：{Number(exchangeRate).toFixed(4)}）
          </div>

          <Divider />

          {/* Section 3: Quotation Settings */}
          <Typography.Title level={5}>报价设置</Typography.Title>
          <Row gutter={16}>
            <Col xs={24} sm={8}>
              <Form.Item name="exchange_rate" label="汇率 (USD/CNY)">
                <InputNumber min={1} max={20} step={0.01} precision={4} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col xs={24} sm={8}>
              <Form.Item name="valid_days" label="有效期（天）">
                <InputNumber min={1} max={90} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col xs={24} sm={8}>
              <Form.Item name="quotation_no" label="报价单号">
                <Input />
              </Form.Item>
            </Col>
            <Col xs={24} sm={12}>
              <Form.Item name="payment_terms" label="付款条款">
                <Input placeholder="e.g. T/T 30% deposit..." />
              </Form.Item>
            </Col>
            <Col xs={24} sm={12}>
              <Form.Item name="delivery_time" label="交货时间">
                <Input placeholder="e.g. 15-20 working days..." />
              </Form.Item>
            </Col>
            <Col xs={24}>
              <Form.Item name="notes" label="备注">
                <Input.TextArea rows={2} placeholder="Additional notes..." />
              </Form.Item>
            </Col>
          </Row>

          <Divider />

          {/* Section 4: Bank Info */}
          <Typography.Title level={5}>银行信息</Typography.Title>
          <Row gutter={16}>
            <Col xs={24} sm={12}>
              <Form.Item name="bank_beneficiary" label="收款人">
                <Input />
              </Form.Item>
            </Col>
            <Col xs={24} sm={12}>
              <Form.Item name="bank_name" label="银行名称">
                <Input />
              </Form.Item>
            </Col>
            <Col xs={24} sm={12}>
              <Form.Item name="bank_account" label="银行账号">
                <Input />
              </Form.Item>
            </Col>
            <Col xs={24} sm={12}>
              <Form.Item name="bank_swift" label="SWIFT Code">
                <Input placeholder="e.g. BKCHCNBJ45A" />
              </Form.Item>
            </Col>
            <Col xs={24}>
              <Form.Item name="bank_address" label="银行地址">
                <Input placeholder="Bank address" />
              </Form.Item>
            </Col>
          </Row>
        </Form>
      </Card>

      {/* Product Selection Modal */}
      <Modal
        title="选择产品"
        open={productModal}
        onOk={addProducts}
        onCancel={() => { setProductModal(false); setSelectedProductIds(new Set()); setProductSearch(''); }}
        okText="添加选中产品"
        width={700}
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
            { title: '型号', dataIndex: 'official_model', key: 'official_model' },
            { title: '供应商型号', dataIndex: 'supplier_model', key: 'supplier_model', render: (v: string | null) => v || '-' },
            { title: '供货价', dataIndex: 'supply_price', key: 'supply_price', render: (v: number | null) => v ? `¥${v.toFixed(2)}` : '-' },
          ]}
          rowKey="id"
          size="small"
          pagination={{ pageSize: 10 }}
          rowSelection={{
            type: 'checkbox',
            selectedRowKeys: Array.from(selectedProductIds),
            onChange: (keys) => setSelectedProductIds(new Set(keys as string[])),
          }}
        />
      </Modal>
    </div>
  );
}
