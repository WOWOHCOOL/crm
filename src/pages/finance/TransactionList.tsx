import { useState } from 'react';
import {
  Table, Button, Space, Modal, Form, Input, InputNumber, Select,
  DatePicker, message, Popconfirm, Card, Tag,
} from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '../../supabase';
import { useApiMutation } from '../../hooks/useApiMutation';
import { logOperation } from '../../utils/log';
import dayjs from 'dayjs';

export default function TransactionList() {
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Record<string, unknown> | null>(null);
  const [form] = Form.useForm();
  const [filters, setFilters] = useState({ type: '', dateRange: [] as string[] });

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
    staleTime: 0,
    refetchOnMount: true,
  });

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

  const openAdd = () => {
    setEditing(null);
    form.resetFields();
    setModalOpen(true);
  };

  const openEdit = (record: Record<string, unknown>) => {
    setEditing(record);
    form.setFieldsValue({
      ...record,
      date: record.date ? dayjs(record.date as string) : dayjs(),
    });
    setModalOpen(true);
  };

  const saveMutation = useApiMutation({
    mutationFn: async (values: Record<string, unknown>) => {
      const payload = {
        ...values,
        date: values.date ? dayjs(values.date as string).format('YYYY-MM-DD') : dayjs().format('YYYY-MM-DD'),
        amount: Number(values.amount),
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
      setModalOpen(false);
      setEditing(null);
      form.resetFields();
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
    { title: '描述', dataIndex: 'description', key: 'description', ellipsis: true, onCell: () => ({ 'data-label': '描述' } as React.TdHTMLAttributes<any>) },
    {
      title: '操作', key: 'actions', width: 130,
      render: (_: unknown, record: Record<string, unknown>) => (
        <Space size="small">
          <Button size="small" onClick={() => openEdit(record)}>编辑</Button>
          <Popconfirm title="确定删除？" onConfirm={() => deleteMutation.mutate(record.id as string)}>
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
        onCancel={() => { setModalOpen(false); setEditing(null); }}
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
        </Form>
      </Modal>
    </div>
  );
}
