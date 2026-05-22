import { useState, useEffect, useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  Table, Button, Space, Modal, Form, Input, InputNumber, Select,
  DatePicker, message, Popconfirm, Card, Tag, Tooltip, Upload, Image,
} from 'antd';
import { PlusOutlined, LinkOutlined, UploadOutlined, PaperClipOutlined } from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '../../supabase';
import { useApiMutation } from '../../hooks/useApiMutation';
import { logOperation } from '../../utils/log';
import dayjs from 'dayjs';

export default function TransactionList() {
  const navigate = useNavigate();
  const [form] = Form.useForm();
  const [filters, setFilters] = useState({ type: '', dateRange: [] as string[] });
  const [searchParams, setSearchParams] = useSearchParams();
  const editId = searchParams.get('edit') || undefined;
  const isAdding = searchParams.get('add') === '1';
  const modalOpen = !!editId || isAdding;
  const [voucherPreview, setVoucherPreview] = useState<string | null>(null);

  const setModalParam = (params: Record<string, string | null>) => {
    const next = new URLSearchParams(searchParams);
    Object.entries(params).forEach(([k, v]) => {
      if (v === null) next.delete(k); else next.set(k, v);
    });
    setSearchParams(next, { replace: true });
  };

  const openAdd = () => {
    setVoucherPreview(null);
    form.resetFields();
    setModalParam({ add: '1', edit: null });
  };

  const openEdit = (record: Record<string, unknown>) => {
    setVoucherPreview((record.voucher_url as string) || null);
    form.setFieldsValue({
      ...record,
      date: record.date ? dayjs(record.date as string) : dayjs(),
    });
    setModalParam({ edit: record.id as string, add: null });
  };

  const closeModal = () => {
    setVoucherPreview(null);
    form.resetFields();
    setModalParam({ add: null, edit: null });
  };

  const handleVoucherUpload = async (file: File): Promise<boolean> => {
    const isImage = file.type.startsWith('image/');
    if (!isImage) { message.error('仅支持图片文件'); return false; }
    const isLt5M = file.size / 1024 / 1024 < 5;
    if (!isLt5M) { message.error('图片不能超过 5MB'); return false; }

    const ext = file.name.split('.').pop();
    const fileName = `voucher_${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;
    const { data: uploadData, error } = await supabase.storage
      .from('vouchers')
      .upload(fileName, file, { contentType: file.type });

    if (!error && uploadData) {
      const { data: { publicUrl } } = supabase.storage.from('vouchers').getPublicUrl(fileName);
      form.setFieldValue('voucher_url', publicUrl);
      setVoucherPreview(publicUrl);
      return false;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      const dataUrl = e.target?.result as string;
      form.setFieldValue('voucher_url', dataUrl);
      setVoucherPreview(dataUrl);
    };
    reader.readAsDataURL(file);
    return false;
  };

  const { data: transactions, isLoading } = useQuery({
    queryKey: ['transactions', filters],
    queryFn: async () => {
      let query = supabase
        .from('transactions')
        .select('*, customers(name), accounts(name)')
        .order('date', { ascending: false });

      if (filters.type) query = query.eq('type', filters.type);
      if (filters.dateRange[0]) query = query.gte('date', filters.dateRange[0]);
      if (filters.dateRange[1]) query = query.lte('date', filters.dateRange[1]);

      const { data } = await query.limit(200);
      return data ?? [];
    },
  });

  const editing = useMemo(() => {
    if (!editId || !transactions) return null;
    return (transactions as Record<string, unknown>[]).find(t => t.id === editId) ?? null;
  }, [editId, transactions]);

  useEffect(() => {
    if (editing) {
      setVoucherPreview((editing.voucher_url as string) || null);
      form.setFieldsValue({
        ...editing,
        date: editing.date ? dayjs(editing.date as string) : dayjs(),
      });
    }
  }, [editing]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (isAdding && !editing) {
      setVoucherPreview(null);
      form.resetFields();
    }
  }, [isAdding]); // eslint-disable-line react-hooks/exhaustive-deps

  const { data: customers } = useQuery({
    queryKey: ['customers-select'],
    queryFn: async () => {
      const { data } = await supabase.from('customers').select('id,name').order('name');
      return data ?? [];
    },
  });

  const { data: accounts } = useQuery({
    queryKey: ['accounts-select'],
    queryFn: async () => {
      const { data } = await supabase.from('accounts').select('id,name,type');
      return data ?? [];
    },
  });

  const saveMutation = useApiMutation({
    mutationFn: async (values: Record<string, unknown>) => {
      const { voucher_file, ...rest } = values;
      const payload = {
        ...rest,
        date: rest.date ? dayjs(rest.date as string).format('YYYY-MM-DD') : dayjs().format('YYYY-MM-DD'),
        amount: Number(rest.amount),
      };
      if (editing) {
        const { error } = await supabase.from('transactions').update(payload).eq('id', editing.id as string);
        if (error) throw error;
      } else {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) throw new Error('未登录');
        const { error } = await supabase.from('transactions').insert([{ ...payload, user_id: user.id }]);
        if (error) throw error;
      }
    },
    invalidateKeys: [['transactions'], ['recent-transactions'], ['dashboard-stats']],
    onSuccess: (_data, values) => {
      closeModal();
      logOperation('transaction', editing ? 'update' : 'create', undefined,
        `${values.type === 'income' ? '收入' : '支出'} ¥${values.amount}`);
    },
  });

  const deleteMutation = useApiMutation({
    mutationFn: async (id: string) => {
      await supabase.from('transactions').delete().eq('id', id);
    },
    successMsg: '已删除',
    invalidateKeys: [['transactions'], ['recent-transactions'], ['dashboard-stats']],
    onSuccess: () => logOperation('transaction', 'delete'),
  });

  const columns = [
    { title: '日期', dataIndex: 'date', key: 'date', width: 120, onCell: () => ({ 'data-label': '日期' } as React.TdHTMLAttributes<any>),
      sorter: (a: Record<string, unknown>, b: Record<string, unknown>) => (a.date as string).localeCompare(b.date as string) },
    { title: '类型', dataIndex: 'type', key: 'type', width: 80, onCell: () => ({ 'data-label': '类型' } as React.TdHTMLAttributes<any>),
      render: (v: string) => <Tag color={v === 'income' ? 'green' : 'red'}>{v === 'income' ? '收入' : '支出'}</Tag> },
    { title: '金额', dataIndex: 'amount', key: 'amount', width: 120, onCell: () => ({ 'data-label': '金额' } as React.TdHTMLAttributes<any>),
      render: (v: number) => <span style={{ fontWeight: 600 }}>¥{v.toFixed(2)}</span> },
    { title: '客户', key: 'customer', width: 100, onCell: () => ({ 'data-label': '客户' } as React.TdHTMLAttributes<any>),
      render: (_: unknown, r: Record<string, unknown>) => (r.customers as Record<string, string> | null)?.name ?? '-' },
    { title: '科目', key: 'account', width: 100, onCell: () => ({ 'data-label': '科目' } as React.TdHTMLAttributes<any>),
      render: (_: unknown, r: Record<string, unknown>) => (r.accounts as Record<string, string> | null)?.name ?? '-' },
    {
      title: '来源', key: 'source', width: 100, onCell: () => ({ 'data-label': '来源' } as React.TdHTMLAttributes<any>),
      render: (_: unknown, r: Record<string, unknown>) => {
        if (r.ref_type === 'purchase_order') {
          return (
            <Tooltip title="点击查看采购单">
              <Tag color="blue" style={{ cursor: 'pointer', borderRadius: 6 }}
                onClick={() => navigate(`/purchases/edit/${r.ref_id}`)}>
                <LinkOutlined /> 采购单
              </Tag>
            </Tooltip>
          );
        }
        if (r.ref_type === 'pi') {
          return (
            <Tooltip title="点击查看PI">
              <Tag color="green" style={{ cursor: 'pointer', borderRadius: 6 }}
                onClick={() => navigate(`/quotations/edit/${r.ref_id}`)}>
                <LinkOutlined /> PI
              </Tag>
            </Tooltip>
          );
        }
        return <span style={{ color: '#999' }}>手动录入</span>;
      },
    },
    { title: '描述', dataIndex: 'description', key: 'description', ellipsis: true, onCell: () => ({ 'data-label': '描述' } as React.TdHTMLAttributes<any>) },
    {
      title: '凭证', key: 'voucher', width: 60, onCell: () => ({ 'data-label': '凭证' } as React.TdHTMLAttributes<any>),
      render: (_: unknown, r: Record<string, unknown>) => r.voucher_url
        ? <Image src={r.voucher_url as string} width={32} height={32} style={{ borderRadius: 4, objectFit: 'cover', cursor: 'pointer' }} preview={{ mask: <PaperClipOutlined /> }} />
        : '-',
    },
    {
      title: '操作', key: 'actions', width: 130,
      render: (_: unknown, record: Record<string, unknown>) => {
        const isAutoGenerated = !!record.ref_type;
        return (
          <Space size="small">
            <Button size="small" disabled={isAutoGenerated} onClick={() => openEdit(record)}>
              {isAutoGenerated ? '自动生成' : '编辑'}
            </Button>
            <Popconfirm
              title="确定删除？"
              description={isAutoGenerated
                ? `此流水由${record.ref_type === 'purchase_order' ? '采购单' : 'PI'}自动生成，删除后可在源单据重新生成`
                : undefined}
              onConfirm={() => deleteMutation.mutate(record.id as string)}
            >
              <Button size="small" danger>删除</Button>
            </Popconfirm>
          </Space>
        );
      },
    },
  ];

  return (
    <div>
      <Card>
        <Space style={{ marginBottom: 16, width: '100%', justifyContent: 'space-between' }} wrap>
          <Space wrap>
            <Select
              placeholder="全部类型"
              allowClear
              style={{ width: 120 }}
              value={filters.type || undefined}
              onChange={(v) => setFilters({ ...filters, type: v ?? '' })}
              options={[
                { label: '收入', value: 'income' },
                { label: '支出', value: 'expense' },
              ]}
            />
            <DatePicker.RangePicker
              onChange={(dates) => {
                setFilters({
                  ...filters,
                  dateRange: dates ? [dates[0]!.format('YYYY-MM-DD'), dates[1]!.format('YYYY-MM-DD')] : [],
                });
              }}
              placeholder={['开始日期', '结束日期']}
            />
          </Space>
          <Button type="primary" icon={<PlusOutlined />} onClick={openAdd}>
            添加流水
          </Button>
        </Space>

        <Table
          dataSource={transactions ?? []}
          columns={columns}
          rowKey="id"
          loading={isLoading}
          pagination={{ pageSize: 20, showSizeChanger: true, showTotal: (t) => `共 ${t} 条` }}
          scroll={{ x: 900 }}
        />
      </Card>

      <Modal
        title={editing ? '编辑流水' : '添加流水'}
        open={modalOpen}
        onCancel={closeModal}
        onOk={() => form.submit()}
        confirmLoading={saveMutation.isPending}
        destroyOnClose
      >
        <Form form={form} layout="vertical" onFinish={(values) => saveMutation.mutate(values)}>
          <Form.Item name="type" label="类型" rules={[{ required: true, message: '请选择类型' }]}>
            <Select options={[
              { label: '收入', value: 'income' },
              { label: '支出', value: 'expense' },
            ]} />
          </Form.Item>
          <Form.Item name="amount" label="金额" rules={[{ required: true, message: '请输入金额' }]}>
            <InputNumber min={0.01} step={0.01} precision={2} style={{ width: '100%' }} prefix="¥" />
          </Form.Item>
          <Form.Item name="date" label="日期" initialValue={dayjs()}>
            <DatePicker style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="customer_id" label="关联客户">
            <Select
              allowClear placeholder="选择客户（可选）"
              options={(customers ?? []).map((c: Record<string, string>) => ({ label: c.name, value: c.id }))}
              showSearch filterOption={(input, option) => (option?.label ?? '').toLowerCase().includes(input.toLowerCase())}
            />
          </Form.Item>
          <Form.Item name="account_id" label="科目">
            <Select
              allowClear placeholder="选择科目（可选）"
              options={(accounts ?? []).map((a: Record<string, string>) => ({ label: a.name, value: a.id }))}
            />
          </Form.Item>
          <Form.Item name="description" label="描述">
            <Input.TextArea rows={3} />
          </Form.Item>
          <Form.Item name="voucher_url" label="凭证附件">
            <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
              <Upload
                accept="image/*"
                showUploadList={false}
                beforeUpload={handleVoucherUpload}
              >
                <Button icon={<UploadOutlined />}>上传凭证</Button>
              </Upload>
              {voucherPreview && (
                <div style={{ position: 'relative' }}>
                  <Image src={voucherPreview} width={80} style={{ borderRadius: 6, border: '1px solid #f0f0f0' }} />
                  <Button size="small" danger type="text" style={{ position: 'absolute', top: -6, right: -6, minWidth: 18, height: 18, borderRadius: 9, fontSize: 10, padding: 0, background: '#fff', boxShadow: '0 2px 4px rgba(0,0,0,0.1)' }}
                    onClick={() => { form.setFieldValue('voucher_url', null); setVoucherPreview(null); }}>✕</Button>
                </div>
              )}
            </div>
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
