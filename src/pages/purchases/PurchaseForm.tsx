import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Card, Form, Select, Input, InputNumber, Button, Space, Table,
  message, Row, Col, Popconfirm, DatePicker, Typography, Modal,
} from 'antd';
import { PlusOutlined, DeleteOutlined, ArrowLeftOutlined, SearchOutlined } from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../supabase';
import { useAuth } from '../../auth/AuthContext';
import type { Product, PurchaseOrder, PurchaseItem, Supplier } from '../../types';
import { logOperation } from '../../utils/log';
import { exportPurchasePDF } from '../../utils/purchaseExport';
import dayjs from 'dayjs';

export default function PurchaseForm() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { orgInfo } = useAuth();
  const isEdit = !!id;
  const [form] = Form.useForm();
  const [items, setItems] = useState<{
    key: string;
    product_id: string | null;
    model: string;
    product_name: string;
    color: string;
    description: string;
    remarks: string;
    quantity: number;
    unit_price: number;
  }[]>([]);
  const [saving, setSaving] = useState(false);
  const today = dayjs().format('YYYYMMDD');

  // Auto-generate order number for new orders
  const { data: todayCount } = useQuery({
    queryKey: ['purchase-order-count', today],
    queryFn: async () => {
      const { count } = await supabase
        .from('purchase_orders')
        .select('*', { count: 'exact', head: true })
        .like('order_no', `CG-${today}-%`);
      return (count ?? 0) + 1;
    },
    enabled: !isEdit,
  });

  // Auto-fill order number when count is loaded
  useEffect(() => {
    if (!isEdit && todayCount && !form.getFieldValue('order_no')) {
      form.setFieldValue('order_no', `CG-${today}-DY-${todayCount}`);
    }
  }, [isEdit, todayCount]); // eslint-disable-line react-hooks/exhaustive-deps

  const { data: suppliers } = useQuery({
    queryKey: ['suppliers-select'],
    queryFn: async () => {
      const { data } = await supabase.from('suppliers').select('id, name').order('name');
      return data ?? [];
    },
  });

  const { data: supplierData } = useQuery({
    queryKey: ['supplier-detail', form.getFieldValue('supplier_id')],
    queryFn: async () => {
      const sid = form.getFieldValue('supplier_id');
      if (!sid) return null;
      const { data } = await supabase.from('suppliers').select('*').eq('id', sid).single();
      return data as Supplier | null;
    },
    enabled: isEdit,
  });

  const { data: products } = useQuery({
    queryKey: ['products-select'],
    queryFn: async () => {
      const { data } = await supabase.from('products').select('id, official_model, supplier_model').order('official_model');
      return (data ?? []) as Pick<Product, 'id' | 'official_model' | 'supplier_model'>[];
    },
  });

  // Fetch full product details for auto-fill when a product is selected
  const fetchProductDetail = async (productId: string) => {
    // Try with new columns first (v16+), fallback to basic
    const { data } = await supabase.from('products').select('supply_price, color, material, weight, size, specifications, package_includes').eq('id', productId).maybeSingle();
    if (data) return data as Pick<Product, 'supply_price' | 'color' | 'material' | 'weight' | 'size' | 'specifications' | 'package_includes'>;
    return null;
  };

  const { data: existingOrder } = useQuery({
    queryKey: ['purchase-order', id],
    queryFn: async () => {
      const { data } = await supabase
        .from('purchase_orders')
        .select('*, purchase_items(*)')
        .eq('id', id)
        .single();
      return data as (PurchaseOrder & { purchase_items: Record<string, unknown>[] }) | null;
    },
    enabled: isEdit,
  });

  // Load existing data into form
  useState(() => {
    if (existingOrder) {
      form.setFieldsValue({
        supplier_id: existingOrder.supplier_id,
        order_no: existingOrder.order_no,
        order_date: existingOrder.order_date ? dayjs(existingOrder.order_date) : dayjs(),
        payment_terms: existingOrder.payment_terms,
      });
      setItems((existingOrder.purchase_items ?? []).map((item) => ({
        key: item.id as string,
        product_id: item.product_id as string | null,
        model: (item.model as string) || '',
        product_name: (item.product_name as string) || '',
        color: (item.color as string) || '',
        description: (item.description as string) || '',
        remarks: (item.remarks as string) || '',
        quantity: item.quantity as number,
        unit_price: item.unit_price as number,
      })));
    }
  });

  const addItem = () => {
    setItems([...items, {
      key: Date.now().toString(),
      product_id: null,
      model: '',
      product_name: '',
      color: '',
      description: '',
      remarks: '',
      quantity: 1,
      unit_price: 0,
    }]);
  };

  const addItemWithProduct = (productId: string) => {
    const product = products?.find(p => p.id === productId);
    const newItem = {
      key: Date.now().toString() + Math.random(),
      product_id: productId,
      model: product?.supplier_model || '',
      product_name: product?.official_model || '',
      color: '',
      description: '',
      remarks: '',
      quantity: 1,
      unit_price: 0,
    };
    setItems(prev => [...prev, newItem]);
    // Fetch full details for color, specs, price
    fetchProductDetail(productId).then((detail) => {
      if (!detail) return;
      setItems(prev => prev.map(item => {
        if (item.key !== newItem.key) return item;
        const specs: string[] = [];
        if (detail.specifications) specs.push(detail.specifications);
        if (detail.material) specs.push(`材质: ${detail.material}`);
        if (detail.weight) specs.push(`重量: ${detail.weight}`);
        if (detail.size) specs.push(`尺寸: ${detail.size}`);
        if (detail.package_includes) specs.push(`包装: ${detail.package_includes}`);
        return {
          ...item,
          unit_price: detail.supply_price || 0,
          color: detail.color || '',
          description: specs.join('；'),
        };
      }));
    });
  };

  const removeItem = (key: string) => {
    setItems(items.filter(i => i.key !== key));
  };

  const updateItem = (key: string, field: string, value: unknown) => {
    setItems(items.map(i => {
      if (i.key !== key) return i;
      const updated = { ...i, [field]: value };
      // Auto-fill all fields when product is selected
      if (field === 'product_id' && value) {
        const product = products?.find(p => p.id === value);
        if (product) {
          updated.model = product.supplier_model || '';
          updated.product_name = product.official_model || '';
          // Fetch full details for price, color, specs
          fetchProductDetail(value as string).then((detail) => {
            if (!detail) return;
            setItems(prev => prev.map(item => {
              if (item.key !== key) return item;
              const specs: string[] = [];
              if (detail.specifications) specs.push(detail.specifications);
              if (detail.material) specs.push(`材质: ${detail.material}`);
              if (detail.weight) specs.push(`重量: ${detail.weight}`);
              if (detail.size) specs.push(`尺寸: ${detail.size}`);
              if (detail.package_includes) specs.push(`包装: ${detail.package_includes}`);
              return {
                ...item,
                unit_price: detail.supply_price || 0,
                color: detail.color || '',
                description: specs.join('；'),
              };
            }));
          });
        }
      }
      return updated;
    }));
  };

  const totalAmount = items.reduce((s, i) => s + i.quantity * i.unit_price, 0);

  const handleSubmit = async () => {
    const values = await form.validateFields();
    if (items.length === 0) {
      message.warning('请至少添加一个商品');
      return;
    }
    setSaving(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { message.error('未登录'); setSaving(false); return; }
    if (!orgInfo?.org_id) { message.error('未找到组织信息'); setSaving(false); return; }

    const orderData: Record<string, unknown> = {
      org_id: orgInfo.org_id,
      supplier_id: values.supplier_id || null,
      order_no: values.order_no || `CG-${today}-DY-${todayCount || 1}`,
      order_date: values.order_date ? dayjs(values.order_date).format('YYYY-MM-DD') : dayjs().format('YYYY-MM-DD'),
      total_amount: totalAmount,
      status: 'draft',
      payment_terms: values.payment_terms || null,
      user_id: user.id,
    };

    try {
      if (isEdit && id) {
        // Update existing
        const { error: orderError } = await supabase.from('purchase_orders').update(orderData).eq('id', id);
        if (orderError) throw orderError;

        // Delete old items and re-insert
        await supabase.from('purchase_items').delete().eq('purchase_order_id', id);
        for (const item of items) {
          const { error } = await supabase.from('purchase_items').insert([{
            purchase_order_id: id,
            product_id: item.product_id || null,
            model: item.model || null,
            product_name: item.product_name || null,
            color: item.color || null,
            description: item.description || null,
            remarks: item.remarks || null,
            quantity: item.quantity,
            unit_price: item.unit_price,
            user_id: user.id,
          }]);
          if (error) throw error;
        }
      } else {
        // Create new
        const { data: newOrder, error: orderError } = await supabase
          .from('purchase_orders').insert([orderData]).select().single();
        if (orderError) throw orderError;

        for (const item of items) {
          const { error } = await supabase.from('purchase_items').insert([{
            purchase_order_id: newOrder.id,
            product_id: item.product_id || null,
            model: item.model || null,
            product_name: item.product_name || null,
            color: item.color || null,
            description: item.description || null,
            remarks: item.remarks || null,
            quantity: item.quantity,
            unit_price: item.unit_price,
            user_id: user.id,
          }]);
          if (error) throw error;
        }
      }

      queryClient.invalidateQueries({ queryKey: ['purchase-orders'] });
      message.success(isEdit ? '采购单已更新' : '采购单已创建');
      logOperation('purchase_order', isEdit ? 'update' : 'create', undefined, `采购单 ${orderData.order_no}`);
      navigate('/purchases');
    } catch (err: unknown) {
      message.error((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const [selectingIndex, setSelectingIndex] = useState<number | null>(null);

  const itemColumns = [
    {
      title: '', key: 'select', width: 32,
      render: (_: unknown, __: unknown, index: number) => (
        <Button type="text" size="small" icon={<SearchOutlined />}
          onClick={() => setSelectingIndex(index)} />
      ),
    },
    {
      title: '型号', dataIndex: 'model', key: 'model', width: 120,
      render: (v: string, _: unknown, index: number) => (
        <Input size="small" value={v} onChange={(e) => updateItem(items[index].key, 'model', e.target.value)} />
      ),
    },
    {
      title: '品名', dataIndex: 'product_name', key: 'product_name', width: 130,
      render: (v: string, _: unknown, index: number) => (
        <Input size="small" value={v} onChange={(e) => updateItem(items[index].key, 'product_name', e.target.value)} />
      ),
    },
    {
      title: '颜色', dataIndex: 'color', key: 'color', width: 70,
      render: (v: string, _: unknown, index: number) => (
        <Input size="small" value={v} onChange={(e) => updateItem(items[index].key, 'color', e.target.value)} />
      ),
    },
    {
      title: '描述/规格', dataIndex: 'description', key: 'description', width: 320,
      render: (v: string, _: unknown, index: number) => (
        <Input.TextArea size="small" rows={3} value={v} autoSize={{ minRows: 2, maxRows: 6 }}
          onChange={(e) => updateItem(items[index].key, 'description', e.target.value)} />
      ),
    },
    {
      title: '数量', dataIndex: 'quantity', key: 'quantity', width: 70,
      render: (v: number, _: unknown, index: number) => (
        <InputNumber size="small" min={1} style={{ width: '100%' }}
          value={v} onChange={(val) => updateItem(items[index].key, 'quantity', val || 1)} />
      ),
    },
    {
      title: '单价', dataIndex: 'unit_price', key: 'unit_price', width: 100,
      render: (v: number, _: unknown, index: number) => (
        <InputNumber size="small" min={0} precision={2} prefix="¥" style={{ width: '100%' }}
          value={v} onChange={(val) => updateItem(items[index].key, 'unit_price', val || 0)} />
      ),
    },
    {
      title: '小计', key: 'subtotal', width: 90,
      render: (_: unknown, __: unknown, index: number) => {
        const item = items[index];
        return `¥${(item.quantity * item.unit_price).toFixed(2)}`;
      },
    },
    {
      title: '备注', dataIndex: 'remarks', key: 'remarks', width: 200,
      render: (v: string, _: unknown, index: number) => (
        <Input.TextArea size="small" rows={2} value={v} placeholder="交货周期/注意事项"
          autoSize={{ minRows: 1, maxRows: 4 }}
          onChange={(e) => updateItem(items[index].key, 'remarks', e.target.value)} />
      ),
    },
    {
      title: '', key: 'actions', width: 40,
      render: (_: unknown, __: unknown, index: number) => (
        <Button type="text" size="small" danger icon={<DeleteOutlined />}
          onClick={() => removeItem(items[index].key)} />
      ),
    },
  ];

  return (
    <div>
      <Space style={{ marginBottom: 16 }}>
        <Button icon={<ArrowLeftOutlined />} onClick={() => navigate('/purchases')}>返回</Button>
      </Space>

      <Card title={isEdit ? '编辑采购单' : '新建采购单'}
        extra={isEdit && existingOrder ? (
          <Button onClick={() => {
            if (!existingOrder || !supplierData) return;
            const items: PurchaseItem[] = (existingOrder.purchase_items ?? []).map(i => ({
              id: i.id as string,
              purchase_order_id: existingOrder.id,
              product_id: i.product_id as string | null,
              model: i.model as string | null,
              product_name: i.product_name as string | null,
              color: i.color as string | null,
              description: i.description as string | null,
              remarks: i.remarks as string | null,
              quantity: i.quantity as number,
              unit_price: i.unit_price as number,
              created_at: i.created_at as string,
              user_id: i.user_id as string,
            }));
            exportPurchasePDF(existingOrder as PurchaseOrder, items, supplierData);
          }}>
            下载 PDF
          </Button>
        ) : null}>
        <Form form={form} layout="vertical">
          <Row gutter={16}>
            <Col xs={24} sm={12}>
              <Form.Item name="supplier_id" label="供应商" rules={[{ required: true, message: '请选择供应商' }]}>
                <Select
                  showSearch
                  placeholder="选择供应商"
                  optionFilterProp="label"
                  options={(suppliers ?? []).map((s: { id: string; name: string }) => ({
                    label: s.name, value: s.id,
                  }))}
                />
              </Form.Item>
            </Col>
            <Col xs={24} sm={12}>
              <Form.Item name="order_no" label="采购单号">
                <Input placeholder="留空自动生成" />
              </Form.Item>
            </Col>
            <Col xs={24} sm={12}>
              <Form.Item name="order_date" label="日期" initialValue={dayjs()}>
                <DatePicker style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col xs={24}>
              <Form.Item name="payment_terms" label="付款方式" initialValue="20%预付定金，验货通过后提货支付尾款80%">
                <Input placeholder="如：30%预付，70%发货前付清" />
              </Form.Item>
            </Col>
          </Row>

          <Typography.Title level={5} style={{ marginTop: 4 }}>采购商品</Typography.Title>

          <Table
            dataSource={items.map((item, i) => ({ ...item, _index: i }))}
            columns={itemColumns}
            rowKey="key"
            pagination={false}
            size="small"
            locale={{ emptyText: '暂无商品，点击下方按钮添加' }}
          />

          <Space style={{ marginTop: 12 }}>
            <Button type="dashed" icon={<PlusOutlined />} onClick={addItem}>添加商品行</Button>
            <Button icon={<SearchOutlined />} onClick={() => setSelectingIndex(-1)}>从产品库添加</Button>
          </Space>

          <div style={{ textAlign: 'right', marginTop: 16, fontSize: 16, fontWeight: 600 }}>
            合计：¥{totalAmount.toFixed(2)}
          </div>

          <Space style={{ marginTop: 16 }}>
            <Button type="primary" onClick={handleSubmit} loading={saving}>
              {isEdit ? '保存修改' : '创建采购单'}
            </Button>
            <Button onClick={() => navigate('/purchases')}>取消</Button>
          </Space>
        </Form>
      </Card>

      <Modal
        title="选择产品"
        open={selectingIndex !== null}
        onCancel={() => setSelectingIndex(null)}
        footer={null}
        width={500}
        destroyOnClose
      >
        <ProductSelector products={products ?? []} onSelect={(id) => {
          if (selectingIndex === -1) {
            addItemWithProduct(id);
          } else {
            if (selectingIndex !== null) updateItem(items[selectingIndex].key, 'product_id', id);
          }
          setSelectingIndex(null);
        }} />
      </Modal>
    </div>
  );
}

function ProductSelector({ products, onSelect }: {
  products: { id: string; official_model: string | null; supplier_model: string | null }[];
  onSelect: (id: string) => void;
}) {
  const [search, setSearch] = useState('');
  const filtered = search
    ? products.filter(p => (p.official_model || '').toLowerCase().includes(search.toLowerCase()) ||
        (p.supplier_model || '').toLowerCase().includes(search.toLowerCase()))
    : products;

  return (
    <div>
      <Input
        prefix={<SearchOutlined />}
        placeholder="搜索型号/品名"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        style={{ marginBottom: 12 }}
        autoFocus
      />
      <div style={{ maxHeight: 400, overflow: 'auto' }}>
        {filtered.map(p => (
          <div key={p.id}
            style={{ padding: '8px 12px', cursor: 'pointer', borderBottom: '1px solid #f0f0f0', display: 'flex', justifyContent: 'space-between' }}
            onClick={() => onSelect(p.id)}
            onMouseEnter={(e) => (e.currentTarget.style.background = '#f5f5f5')}
            onMouseLeave={(e) => (e.currentTarget.style.background = '')}
          >
            <span style={{ fontWeight: 500 }}>{p.supplier_model || p.official_model}</span>
            <span style={{ color: '#999' }}>{p.official_model}</span>
          </div>
        ))}
        {filtered.length === 0 && <div style={{ color: '#999', textAlign: 'center', padding: 24 }}>无匹配产品</div>}
      </div>
    </div>
  );
}
