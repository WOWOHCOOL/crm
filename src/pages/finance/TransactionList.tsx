import { useState, useEffect, useMemo, useRef } from 'react';
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
import { ENTITY_LABELS, ENTITY_COLORS, CURRENCY_SYMBOLS, CURRENCY_LABELS } from '../../types';
import type { CurrencyType } from '../../types';
import dayjs from 'dayjs';

export default function TransactionList() {
  const navigate = useNavigate();
  const [form] = Form.useForm();
  const [filters, setFilters] = useState({ type: '', currency: '' as string, dateRange: [] as string[] });
  const [searchParams, setSearchParams] = useSearchParams();
  const editId = searchParams.get('edit') || undefined;
  const isAdding = searchParams.get('add') === '1';
  const modalOpen = !!editId || isAdding;
  const [voucherPreview, setVoucherPreview] = useState<string | null>(null);
  const [accountEntityFilter, setAccountEntityFilter] = useState<string>('');
  const currencyWatch = Form.useWatch('currency', form);

  // Restore draft from sessionStorage on mount (add mode only)
  useEffect(() => {
    if (editId) return;
    const draft = sessionStorage.getItem('transaction_form_draft');
    if (!draft) return;
    try {
      const data = JSON.parse(draft);
      if (data.formValues) form.setFieldsValue(data.formValues);
      if (data.voucherPreview) setVoucherPreview(data.voucherPreview);
      sessionStorage.removeItem('transaction_form_draft');
    } catch { /* ignore */ }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Save draft on visibility change and before unload (add mode only)
  const isEditMode = !!editId;
  useEffect(() => {
    if (isEditMode) return;
    const save = () => {
      sessionStorage.setItem('transaction_form_draft', JSON.stringify({
        formValues: form.getFieldsValue(),
        voucherPreview,
      }));
    };
    document.addEventListener('visibilitychange', save);
    window.addEventListener('beforeunload', save);
    return () => {
      document.removeEventListener('visibilitychange', save);
      window.removeEventListener('beforeunload', save);
    };
  }, [form, voucherPreview, isEditMode]);

  const setModalParam = (params: Record<string, string | null>) => {
    const next = new URLSearchParams(searchParams);
    Object.entries(params).forEach(([k, v]) => {
      if (v === null) next.delete(k); else next.set(k, v);
    });
    setSearchParams(next, { replace: true });
  };

  // Shared pre-fill from URL params (记账 button from PO/PI)
  const applyPrefill = () => {
    const refType = searchParams.get('ref_type');
    const refId = searchParams.get('ref_id');
    if (!refType || !refId) return;
    form.setFieldsValue({
      ref_type: refType,
      ref_id: refId,
      type: searchParams.get('type') || undefined,
      currency: searchParams.get('currency') || 'RMB',
      amount: Number(searchParams.get('amount')) || undefined,
      description: searchParams.get('description') || undefined,
      customer_id: searchParams.get('customer_id') || undefined,
    });
  };

  // On mount: if opened from external link, reset + pre-fill
  useEffect(() => {
    if (isAdding) {
      setVoucherPreview(null);
      setAccountEntityFilter('');
      form.resetFields();
      applyPrefill();
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const openAdd = () => {
    setVoucherPreview(null);
    setAccountEntityFilter('');
    form.resetFields();
    setModalParam({ add: '1', edit: null });
  };

  const openEdit = (record: Record<string, unknown>) => {
    setVoucherPreview((record.voucher_url as string) || null);
    // Pre-set entity filter to match selected account's entity
    const accEntity = (accounts ?? []).find((a: Record<string, unknown>) => a.id === record.account_id)?.entity;
    setAccountEntityFilter((accEntity as string) || '');
    form.resetFields();
    form.setFieldsValue({
      type: record.type,
      amount: record.amount,
      currency: record.currency,
      date: record.date ? dayjs(record.date as string) : dayjs(),
      customer_id: record.customer_id || undefined,
      account_id: record.account_id || undefined,
      description: record.description,
      voucher_url: record.voucher_url,
      ref_type: record.ref_type,
      ref_id: record.ref_id,
    });
    setModalParam({ edit: record.id as string, add: null });
  };

  const closeModal = () => {
    sessionStorage.removeItem('transaction_form_draft');
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
      if (filters.currency) query = query.eq('currency', filters.currency);
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
      const accEntity = (accounts ?? []).find((a: Record<string, unknown>) => a.id === editing.account_id)?.entity;
      setAccountEntityFilter((accEntity as string) || '');
      form.resetFields();
      form.setFieldsValue({
        type: editing.type,
        amount: editing.amount,
        currency: editing.currency,
        date: editing.date ? dayjs(editing.date as string) : dayjs(),
        customer_id: editing.customer_id || undefined,
        account_id: editing.account_id || undefined,
        description: editing.description,
        voucher_url: editing.voucher_url,
        ref_type: editing.ref_type,
        ref_id: editing.ref_id,
      });
    }
  }, [editing]); // eslint-disable-line react-hooks/exhaustive-deps


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
      const { data } = await supabase.from('accounts').select('id,name,type,entity');
      return data ?? [];
    },
  });

  const saveMutation = useApiMutation({
    mutationFn: async (values: Record<string, unknown>) => {
      const amount = Number(values.amount);
      if (!amount || amount <= 0) throw new Error('请输入金额');
      const payload = {
        type: values.type,
        amount,
        currency: (values.currency as string) || 'RMB',
        date: values.date ? dayjs(values.date as string).format('YYYY-MM-DD') : dayjs().format('YYYY-MM-DD'),
        customer_id: (values.customer_id as string) || null,
        account_id: (values.account_id as string) || null,
        description: (values.description as string) || null,
        voucher_url: (values.voucher_url as string) || null,
        ref_type: (values.ref_type as string) || null,
        ref_id: (values.ref_id as string) || null,
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
      const sym = CURRENCY_SYMBOLS[values.currency as CurrencyType] || '¥';
      logOperation('transaction', editing ? 'update' : 'create', undefined,
        `${values.type === 'income' ? '收入' : '支出'} ${sym}${values.amount}`);
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
    { title: '金额', key: 'amount', width: 120, onCell: () => ({ 'data-label': '金额' } as React.TdHTMLAttributes<any>),
      render: (_: unknown, r: Record<string, unknown>) => {
        const currency = (r.currency as CurrencyType) || 'RMB';
        const sym = CURRENCY_SYMBOLS[currency] || '¥';
        const color = currency === 'USD' ? '#1677ff' : undefined;
        return <span style={{ fontWeight: 600, color }}>{sym}{Number(r.amount || 0).toFixed(2)}</span>;
      } },
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
      render: (_: unknown, record: Record<string, unknown>) => (
        <Space size="small">
          <Button size="small" onClick={() => openEdit(record)}>编辑</Button>
          <Popconfirm
            title="确定删除？"
            description="删除后无法恢复"
            onConfirm={() => deleteMutation.mutate(record.id as string)}
          >
            <Button size="small" danger>删除</Button>
          </Popconfirm>
        </Space>
      ),
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
              style={{ width: 100 }}
              value={filters.type || undefined}
              onChange={(v) => setFilters({ ...filters, type: v ?? '' })}
              options={[
                { label: '收入', value: 'income' },
                { label: '支出', value: 'expense' },
              ]}
            />
            <Select
              placeholder="全部币种"
              allowClear
              style={{ width: 110 }}
              value={filters.currency || undefined}
              onChange={(v) => setFilters({ ...filters, currency: v ?? '' })}
              options={[
                { label: '¥ 人民币', value: 'RMB' },
                { label: '$ 美元', value: 'USD' },
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
          scroll={{ x: 950 }}
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
          <Form.Item label="金额" required>
            <Space.Compact style={{ width: '100%' }}>
              <Form.Item noStyle name="currency" initialValue="RMB" rules={[{ required: true }]}>
                <Select style={{ width: 100 }} options={[
                  { label: '¥ 人民币', value: 'RMB' },
                  { label: '$ 美元', value: 'USD' },
                ]} />
              </Form.Item>
              <Form.Item noStyle name="amount" rules={[{ required: true, message: '请输入金额' }]}>
                <InputNumber min={0} step={0.01} precision={2} style={{ flex: 1 }} prefix={CURRENCY_SYMBOLS[(currencyWatch as CurrencyType) || 'RMB']} placeholder="金额" />
              </Form.Item>
            </Space.Compact>
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
          <Form.Item label="科目">
            <div style={{ display: 'flex', gap: 8 }}>
              <Select
                style={{ width: 110, flexShrink: 0 }}
                placeholder="主体"
                allowClear
                value={accountEntityFilter || undefined}
                onChange={(v) => setAccountEntityFilter(v ?? '')}
                options={Object.entries(ENTITY_LABELS).map(([value, label]) => ({ label, value }))}
              />
              <Form.Item noStyle name="account_id">
                <Select allowClear placeholder="选择科目（可选）" style={{ flex: 1 }}>
                  {(accounts ?? []).filter((a: Record<string, unknown>) => !accountEntityFilter || !a.entity || a.entity === accountEntityFilter).reduce((acc: { entity: string | null; id: string; name: string }[][], a: Record<string, unknown>) => {
                const group = acc.find(g => g[0]?.entity === (a.entity || null));
                const item = { entity: (a.entity as string) || null, id: a.id as string, name: a.name as string };
                if (group) { group.push(item); } else { acc.push([item]); }
                return acc;
              }, []).map(group => {
                const entity = group[0]?.entity as keyof typeof ENTITY_LABELS | null;
                const label = entity ? ENTITY_LABELS[entity] : '未分类';
                const color = entity ? ENTITY_COLORS[entity] : undefined;
                return (
                  <Select.OptGroup key={entity || '__untyped__'} label={<span style={{ color, fontWeight: 500 }}>{label}</span>}>
                    {group.map(a => (
                      <Select.Option key={a.id} value={a.id}>{a.name}</Select.Option>
                    ))}
                  </Select.OptGroup>
                );
              })}
                </Select>
              </Form.Item>
            </div>
          </Form.Item>
          <Form.Item name="description" label="描述">
            <Input.TextArea rows={3} />
          </Form.Item>
          <Form.Item name="ref_type" hidden>
            <Input />
          </Form.Item>
          <Form.Item name="ref_id" hidden>
            <Input />
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
