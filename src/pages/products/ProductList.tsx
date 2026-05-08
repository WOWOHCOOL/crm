import { useState } from 'react';
import {
  Table, Button, Space, Input, Modal, Form, InputNumber, Switch,
  message, Popconfirm, Card, Row, Col, Tag, Image, Upload,
} from 'antd';
import { PlusOutlined, SearchOutlined, InboxOutlined } from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../supabase';
import type { Product } from '../../types';
import { logOperation } from '../../utils/log';
import { useAuth } from '../../auth/AuthContext';
import * as XLSX from 'xlsx';

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
  const queryClient = useQueryClient();

  const { data: products, isLoading } = useQuery({
    queryKey: ['products', search],
    queryFn: async () => {
      let query = supabase.from('products').select('*').order('official_model');
      if (search) {
        query = query.or(`official_model.ilike.%${search}%,supplier_model.ilike.%${search}%,supplier_name.ilike.%${search}%`);
      }
      const { data } = await query;
      return (data ?? []) as Product[];
    },
    staleTime: 0,
    refetchOnMount: true,
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

  const importColumns = [
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
    { title: '官网型号', dataIndex: 'official_model', key: 'official_model', width: 180 },
    { title: '供应商型号', dataIndex: 'supplier_model', key: 'supplier_model', width: 180 },
    { title: '供应商名称', dataIndex: 'supplier_name', key: 'supplier_name', width: 150 },
    ...(canEdit ? [{ title: '供货价', dataIndex: 'supply_price', key: 'supply_price', width: 120, render: (v: number | null) => v ? `¥${Number(v).toFixed(2)}` : '-' }] : []),
    { title: '建议报价', dataIndex: 'suggested_price', key: 'suggested_price', width: 120, render: (v: number | null) => v ? `¥${Number(v).toFixed(2)}` : '-' },
    {
      title: '含税', dataIndex: 'tax_included', key: 'tax_included', width: 80,
      render: (v: boolean) => <Tag color={v ? 'blue' : 'default'}>{v ? '含税' : '不含'}</Tag>,
    },
    ...(canEdit ? [{
      title: '操作', key: 'actions', width: 150,
      render: (_: unknown, record: Product) => (
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
          </Space>}
        </Space>
        <Table
          dataSource={products}
          columns={columns}
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
              <Form.Item name="official_model" label="官网产品型号" rules={[{ required: true, message: '请输入官网型号' }]}>
                <Input />
              </Form.Item>
            </Col>
            <Col xs={24} sm={12}>
              <Form.Item name="supplier_model" label="供应商型号">
                <Input />
              </Form.Item>
            </Col>
            <Col xs={24} sm={12}>
              <Form.Item name="supplier_name" label="供应商名称">
                <Input />
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
    </div>
  );
}
