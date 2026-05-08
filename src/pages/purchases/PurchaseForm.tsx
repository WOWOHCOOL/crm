import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Card, Form, Select, Input, InputNumber, Button, Space, Table,
  message, Row, Col, Popconfirm, DatePicker, Typography,
} from 'antd';
import { PlusOutlined, DeleteOutlined, ArrowLeftOutlined } from '@ant-design/icons';
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
    description: string;
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
      const { data } = await supabase.from('products').select('id, official_model, supplier_model, supply_price').order('official_model');
      return (data ?? []) as Pick<Product, 'id' | 'official_model' | 'supplier_model' | 'supply_price'>[];
    },
  });

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
        notes: existingOrder.notes,
      });
      setItems((existingOrder.purchase_items ?? []).map((item) => ({
        key: item.id as string,
        product_id: item.product_id as string | null,
        model: (item.model as string) || '',
        description: (item.description as string) || '',
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
      description: '',
      quantity: 1,
      unit_price: 0,
    }]);
  };

  const removeItem = (key: string) => {
    setItems(items.filter(i => i.key !== key));
  };

  const updateItem = (key: string, field: string, value: unknown) => {
    setItems(items.map(i => {
      if (i.key !== key) return i;
      const updated = { ...i, [field]: value };
      // Auto-fill model and price when product is selected
      if (field === 'product_id' && value) {
        const product = products?.find(p => p.id === value);
        if (product) {
          updated.model = product.supplier_model || product.official_model;
          updated.unit_price = product.supply_price || 0;
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

    const orderData = {
      org_id: orgInfo.org_id,
      supplier_id: values.supplier_id || null,
      order_no: values.order_no || `CG-${today}-DY-${todayCount || 1}`,
      order_date: values.order_date ? dayjs(values.order_date).format('YYYY-MM-DD') : dayjs().format('YYYY-MM-DD'),
      total_amount: totalAmount,
      status: 'draft',
      notes: values.notes || null,
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
            description: item.description || null,
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
            description: item.description || null,
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

  const itemColumns = [
    {
      title: '产品', dataIndex: 'product_id', key: 'product_id', width: 200,
      render: (v: string | null, _: unknown, index: number) => (
        <Select
          showSearch
          allowClear
          placeholder="搜索选择产品"
          style={{ width: '100%' }}
          value={v}
          onChange={(val) => updateItem(items[index].key, 'product_id', val)}
          optionFilterProp="label"
          options={(products ?? []).map(p => ({
            label: `${p.supplier_model || p.official_model}${p.supplier_model ? ` (${p.official_model})` : ''}`,
            value: p.id,
          }))}
        />
      ),
    },
    {
      title: '型号', dataIndex: 'model', key: 'model', width: 140,
      render: (v: string, _: unknown, index: number) => (
        <Input size="small" value={v} onChange={(e) => updateItem(items[index].key, 'model', e.target.value)} />
      ),
    },
    {
      title: '描述', dataIndex: 'description', key: 'description',
      render: (v: string, _: unknown, index: number) => (
        <Input size="small" value={v} onChange={(e) => updateItem(items[index].key, 'description', e.target.value)} />
      ),
    },
    {
      title: '数量', dataIndex: 'quantity', key: 'quantity', width: 80,
      render: (v: number, _: unknown, index: number) => (
        <InputNumber size="small" min={1} style={{ width: '100%' }}
          value={v} onChange={(val) => updateItem(items[index].key, 'quantity', val || 1)} />
      ),
    },
    {
      title: '单价', dataIndex: 'unit_price', key: 'unit_price', width: 110,
      render: (v: number, _: unknown, index: number) => (
        <InputNumber size="small" min={0} precision={2} prefix="¥" style={{ width: '100%' }}
          value={v} onChange={(val) => updateItem(items[index].key, 'unit_price', val || 0)} />
      ),
    },
    {
      title: '小计', key: 'subtotal', width: 100,
      render: (_: unknown, __: unknown, index: number) => {
        const item = items[index];
        return `¥${(item.quantity * item.unit_price).toFixed(2)}`;
      },
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
              description: i.description as string | null,
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
        <Form form={form} layout="vertical" style={{ maxWidth: 800 }}>
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
          </Row>

          <Typography.Title level={5} style={{ marginTop: 4 }}>采购商品</Typography.Title>

          <Table
            dataSource={items.map((item, i) => ({ ...item, _index: i }))}
            columns={itemColumns}
            rowKey="key"
            pagination={false}
            size="small"
            scroll={{ x: 700 }}
            locale={{ emptyText: '暂无商品，点击下方按钮添加' }}
          />

          <Space style={{ marginTop: 12 }}>
            <Button type="dashed" icon={<PlusOutlined />} onClick={addItem}>添加商品行</Button>
          </Space>

          <div style={{ textAlign: 'right', marginTop: 16, fontSize: 16, fontWeight: 600 }}>
            合计：¥{totalAmount.toFixed(2)}
          </div>

          <Form.Item name="notes" label="备注" style={{ marginTop: 16 }}>
            <Input.TextArea rows={2} />
          </Form.Item>

          <Space style={{ marginTop: 16 }}>
            <Button type="primary" onClick={handleSubmit} loading={saving}>
              {isEdit ? '保存修改' : '创建采购单'}
            </Button>
            <Button onClick={() => navigate('/purchases')}>取消</Button>
          </Space>
        </Form>
      </Card>
    </div>
  );
}
