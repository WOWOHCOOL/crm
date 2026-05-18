import { useState } from 'react';
import {
  Table, Button, Space, Input, Modal, Form, Select, DatePicker,
  message, Card, Tag, Checkbox, Popconfirm, Row, Col,
} from 'antd';
import { PlusOutlined, SearchOutlined, UploadOutlined } from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../supabase';
import type { Task, Customer } from '../../types';
import { logOperation } from '../../utils/log';
import { useAuth } from '../../auth/AuthContext';
import dayjs from 'dayjs';
import { withMobileLabels } from '../../utils/columns';

const statusLabels: Record<string, string> = {
  pending: '待处理',
  completed: '已完成',
  cancelled: '已取消',
};

const statusColors: Record<string, string> = {
  pending: 'orange',
  completed: 'green',
  cancelled: 'default',
};

const priorityLabels: Record<string, string> = {
  low: '低',
  normal: '中',
  high: '高',
  urgent: '紧急',
};

const priorityColors: Record<string, string> = {
  low: 'default',
  normal: 'blue',
  high: 'orange',
  urgent: 'red',
};

const priorityOptions = [
  { label: '低', value: 'low' },
  { label: '中', value: 'normal' },
  { label: '高', value: 'high' },
  { label: '紧急', value: 'urgent' },
];

export default function TaskList() {
  const { isOwner, isAdmin, orgInfo } = useAuth();
  const canEdit = isOwner || isAdmin;
  const queryClient = useQueryClient();

  const [statusFilter, setStatusFilter] = useState<string>('pending');
  const [priorityFilter, setPriorityFilter] = useState<string | undefined>();
  const [search, setSearch] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Task | null>(null);
  const [form] = Form.useForm();

  const { data: tasks, isLoading } = useQuery({
    queryKey: ['tasks', statusFilter, priorityFilter, search],
    queryFn: async () => {
      let query = supabase
        .from('tasks')
        .select('*, customers(name, company)')
        .order('due_date', { ascending: true });

      if (statusFilter !== 'all') {
        query = query.eq('status', statusFilter);
      }
      if (priorityFilter) {
        query = query.eq('priority', priorityFilter);
      }
      if (search) {
        query = query.or(`title.ilike.%${search}%,customers.name.ilike.%${search}%`);
      }

      const { data } = await query;
      return (data ?? []) as (Task & { customers: Customer | null })[];
    },
    staleTime: 0,
    refetchOnMount: true,
  });

  const { data: customers } = useQuery({
    queryKey: ['customers-list'],
    queryFn: async () => {
      const { data } = await supabase.from('customers').select('id, name, company').order('name');
      return (data ?? []) as Pick<Customer, 'id' | 'name' | 'company'>[];
    },
  });

  const saveMutation = useMutation({
    mutationFn: async (values: Partial<Task>) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('未登录');

      const payload = {
        title: values.title,
        description: values.description || null,
        customer_id: values.customer_id || null,
        due_date: values.due_date || null,
        reminder_time: values.reminder_time || null,
        priority: values.priority || 'normal',
        status: values.status || 'pending',
      };

      if (editing) {
        const { error } = await supabase.from('tasks').update(payload).eq('id', editing.id);
        if (error) throw error;
      } else {
        if (!orgInfo?.org_id) throw new Error('未找到组织信息');
        const { error } = await supabase.from('tasks').insert([{ ...payload, org_id: orgInfo.org_id, user_id: user.id }]);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      setModalOpen(false);
      setEditing(null);
      form.resetFields();
      message.success(editing ? '任务已更新' : '任务已创建');
      logOperation('task', editing ? 'update' : 'create');
    },
    onError: (error: Error) => message.error(error.message),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('tasks').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      message.success('任务已删除');
      logOperation('task', 'delete');
    },
    onError: (error: Error) => message.error(error.message),
  });

  const toggleStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const { error } = await supabase.from('tasks').update({ status }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      logOperation('task', 'update');
    },
    onError: (error: Error) => message.error(error.message),
  });

  const openEdit = (record: Task) => {
    setEditing(record);
    form.setFieldsValue({
      ...record,
      due_date: record.due_date ? dayjs(record.due_date) : null,
      reminder_time: record.reminder_time ? dayjs(record.reminder_time) : null,
    });
    setModalOpen(true);
  };

  const getDueDateTag = (dueDate: string | null) => {
    if (!dueDate) return null;
    const today = dayjs().startOf('day');
    const due = dayjs(dueDate).startOf('day');
    const diff = due.diff(today, 'day');

    if (diff < 0) return <Tag color="red">已逾期 {Math.abs(diff)} 天</Tag>;
    if (diff === 0) return <Tag color="orange">今天</Tag>;
    if (diff <= 3) return <Tag color="blue">剩余 {diff} 天</Tag>;
    return <Tag>{dueDate}</Tag>;
  };

  const columns = [
    {
      title: '', key: 'check', width: 40,
      render: (_: unknown, record: Task) => (
        <Checkbox
          checked={record.status === 'completed'}
          onChange={(e) => toggleStatus.mutate({
            id: record.id,
            status: e.target.checked ? 'completed' : 'pending',
          })}
        />
      ),
    },
    { title: '标题', dataIndex: 'title', key: 'title', width: 200 },
    {
      title: '客户', key: 'customer', width: 150,
      render: (_: unknown, record: Task & { customers: Customer | null }) =>
        record.customers ? `${record.customers.name}${record.customers.company ? ` (${record.customers.company})` : ''}` : '-',
    },
    {
      title: '优先级', dataIndex: 'priority', key: 'priority', width: 80,
      render: (v: string) => <Tag color={priorityColors[v]}>{priorityLabels[v]}</Tag>,
    },
    {
      title: '截止日期', dataIndex: 'due_date', key: 'due_date', width: 140,
      render: (v: string | null) => getDueDateTag(v),
    },
    {
      title: '状态', dataIndex: 'status', key: 'status', width: 80,
      render: (v: string) => <Tag color={statusColors[v]}>{statusLabels[v]}</Tag>,
    },
    {
      title: '操作', key: 'actions', width: 140,
      render: (_: unknown, record: Task) => (
        <Space>
          <Button size="small" onClick={() => openEdit(record)}>编辑</Button>
          <Popconfirm title="确定删除？" onConfirm={() => deleteMutation.mutate(record.id)}>
            <Button size="small" danger>删除</Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <div>
      <Card>
        <Space style={{ marginBottom: 16, width: '100%', justifyContent: 'space-between' }}>
          <Space wrap>
            <Select
              value={statusFilter}
              onChange={(v) => setStatusFilter(v)}
              style={{ width: 110 }}
              options={[
                { label: '全部', value: 'all' },
                { label: '待处理', value: 'pending' },
                { label: '已完成', value: 'completed' },
              ]}
            />
            <Select
              placeholder="优先级"
              value={priorityFilter}
              onChange={(v) => setPriorityFilter(v)}
              allowClear
              style={{ width: 100 }}
              options={priorityOptions}
            />
            <Input
              placeholder="搜索任务 / 客户"
              prefix={<SearchOutlined />}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              allowClear
              style={{ width: 220 }}
            />
          </Space>
          {canEdit && (
            <Button type="primary" icon={<PlusOutlined />}
              onClick={() => { setEditing(null); form.resetFields(); setModalOpen(true); }}>
              新建任务
            </Button>
          )}
        </Space>
        <Table
          dataSource={tasks}
          columns={withMobileLabels(columns)}
          rowKey="id"
          loading={isLoading}
          pagination={{ pageSize: 20, showSizeChanger: true, showTotal: (t) => `共 ${t} 条` }}
          scroll={{ x: 800 }}
        />
      </Card>

      <Modal
        title={editing ? '编辑任务' : '新建任务'}
        open={modalOpen}
        onCancel={() => { setModalOpen(false); setEditing(null); }}
        onOk={() => form.submit()}
        confirmLoading={saveMutation.isPending}
        width={600}
        destroyOnClose
      >
        <Form form={form} layout="vertical" onFinish={(values) => saveMutation.mutate(values)}>
          <Form.Item name="title" label="任务标题" rules={[{ required: true, message: '请输入任务标题' }]}>
            <Input />
          </Form.Item>
          <Row gutter={16}>
            <Col xs={24} sm={12}>
              <Form.Item name="customer_id" label="关联客户">
                <Select
                  showSearch
                  allowClear
                  placeholder="选择客户（可选）"
                  optionFilterProp="label"
                  options={(customers ?? []).map((c) => ({
                    label: `${c.name}${c.company ? ` (${c.company})` : ''}`,
                    value: c.id,
                  }))}
                />
              </Form.Item>
            </Col>
            <Col xs={24} sm={12}>
              <Form.Item name="priority" label="优先级" initialValue="normal">
                <Select options={priorityOptions} />
              </Form.Item>
            </Col>
            <Col xs={24} sm={12}>
              <Form.Item name="due_date" label="截止日期">
                <DatePicker style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col xs={24} sm={12}>
              <Form.Item name="reminder_time" label="提醒时间">
                <DatePicker showTime style={{ width: '100%' }} />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item name="description" label="任务描述">
            <Input.TextArea rows={3} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
