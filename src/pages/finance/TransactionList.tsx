import { useState } from 'react';
import {
  Table, Button, Space, Modal, Form, Input, InputNumber, Select,
  DatePicker, message, Popconfirm, Card, Tag,
} from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../supabase';
import dayjs from 'dayjs';

export default function TransactionList() {
  const [modalOpen, setModalOpen] = useState(false);
  const [form] = Form.useForm();
  const [filters, setFilters] = useState({ type: '', dateRange: [] as string[] });
  const queryClient = useQueryClient();

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

  const saveMutation = useMutation({
    mutationFn: async (values: Record<string, unknown>) => {
      const { error } = await supabase.from('transactions').insert([{
        ...values,
        date: values.date ? dayjs(values.date as string).format('YYYY-MM-DD') : dayjs().format('YYYY-MM-DD'),
        amount: Number(values.amount),
      }]);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['transactions'] });
      setModalOpen(false);
      form.resetFields();
      message.success('流水已添加');
    },
    onError: (error: Error) => message.error(error.message),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => { await supabase.from('transactions').delete().eq('id', id); },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['transactions'] });
      message.success('已删除');
    },
  });

  const columns = [
    { title: '日期', dataIndex: 'date', key: 'date', width: 120, sorter: (a: Record<string, unknown>, b: Record<string, unknown>) => (a.date as string).localeCompare(b.date as string) },
    {
      title: '类型', dataIndex: 'type', key: 'type', width: 80,
      render: (v: string) => <Tag color={v === 'income' ? 'green' : 'red'}>{v === 'income' ? '收入' : '支出'}</Tag>,
    },
    { title: '金额', dataIndex: 'amount', key: 'amount', width: 120, render: (v: number) => `¥${v.toFixed(2)}` },
    { title: '客户', key: 'customer', width: 100, render: (_: unknown, r: Record<string, unknown>) => (r.customers as Record<string, string> | null)?.name ?? '-' },
    { title: '科目', key: 'account', width: 100, render: (_: unknown, r: Record<string, unknown>) => (r.accounts as Record<string, string> | null)?.name ?? '-' },
    { title: '描述', dataIndex: 'description', key: 'description', ellipsis: true },
    {
      title: '操作', key: 'actions', width: 80,
      render: (_: unknown, record: Record<string, unknown>) => (
        <Popconfirm title="确定删除？" onConfirm={() => deleteMutation.mutate(record.id as string)}>
          <Button size="small" danger>删除</Button>
        </Popconfirm>
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
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setModalOpen(true)}>
            添加流水
          </Button>
        </Space>

        <Table
          dataSource={transactions ?? []}
          columns={columns}
          rowKey="id"
          loading={isLoading}
          pagination={{ pageSize: 20, showSizeChanger: true, showTotal: (t) => `共 ${t} 条` }}
          scroll={{ x: 800 }}
        />
      </Card>

      <Modal
        title="添加流水"
        open={modalOpen}
        onCancel={() => setModalOpen(false)}
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
              allowClear
              placeholder="选择客户（可选）"
              options={(customers ?? []).map((c: Record<string, string>) => ({ label: c.name, value: c.id }))}
              showSearch
              filterOption={(input, option) => (option?.label ?? '').toLowerCase().includes(input.toLowerCase())}
            />
          </Form.Item>
          <Form.Item name="account_id" label="科目">
            <Select
              allowClear
              placeholder="选择科目（可选）"
              options={(accounts ?? []).map((a: Record<string, string>) => ({
                label: a.name,
                value: a.id,
              }))}
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
