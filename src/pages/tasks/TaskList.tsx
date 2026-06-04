import { useState, useMemo, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Button, Space, Input, Modal, Form, Select, DatePicker,
  message, Card, Tag, Checkbox, Popconfirm, Row, Col,
} from 'antd';
import ResponsiveTable from '../../components/ResponsiveTable';
import { PlusOutlined, SearchOutlined, UploadOutlined } from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../supabase';
import type { Task, Customer } from '../../types';
import { logOperation } from '../../utils/log';
import { useAuth } from '../../auth/AuthContext';
import dayjs from 'dayjs';

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
  const [form] = Form.useForm();
  const [searchParams, setSearchParams] = useSearchParams();
  const editId = searchParams.get('edit') || undefined;
  const isAdding = searchParams.get('add') === '1';
  const modalOpen = !!editId || isAdding;

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
  });

  const { data: customers } = useQuery({
    queryKey: ['customers-list'],
    queryFn: async () => {
      const { data } = await supabase.from('customers').select('id, name, company').order('name');
      return (data ?? []) as Pick<Customer, 'id' | 'name' | 'company'>[];
    },
  });

  const editing = useMemo(() => {
    if (!editId || !tasks) return null;
    return tasks.find(t => t.id === editId) ?? null;
  }, [editId, tasks]);

  useEffect(() => {
    if (editing) {
      form.setFieldsValue({
        ...editing,
        due_date: editing.due_date ? dayjs(editing.due_date) : null,
        reminder_time: editing.reminder_time ? dayjs(editing.reminder_time) : null,
      });
    }
  }, [editing]); // eslint-disable-line react-hooks/exhaustive-deps

  // Restore draft from sessionStorage on mount (add mode only)
  useEffect(() => {
    if (editId) return;
    const draft = sessionStorage.getItem('task_form_draft');
    if (!draft) return;
    try {
      const data = JSON.parse(draft);
      if (data.formValues) form.setFieldsValue(data.formValues);
      sessionStorage.removeItem('task_form_draft');
    } catch { /* ignore */ }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Save draft on visibility change (add mode only)
  const isEditMode = !!editId;
  useEffect(() => {
    if (isEditMode) return;
    const save = () => {
      sessionStorage.setItem('task_form_draft', JSON.stringify({
        formValues: form.getFieldsValue(),
      }));
    };
    document.addEventListener('visibilitychange', save);
    window.addEventListener('beforeunload', save);
    return () => {
      document.removeEventListener('visibilitychange', save);
      window.removeEventListener('beforeunload', save);
    };
  }, [form, isEditMode]);

  const setModalParam = (params: Record<string, string | null>) => {
    const next = new URLSearchParams(searchParams);
    Object.entries(params).forEach(([k, v]) => {
      if (v === null) next.delete(k); else next.set(k, v);
    });
    setSearchParams(next, { replace: true });
  };

  const openEdit = (record: Task) => {
    form.setFieldsValue({
      ...record,
      due_date: record.due_date ? dayjs(record.due_date) : null,
      reminder_time: record.reminder_time ? dayjs(record.reminder_time) : null,
    });
    setModalParam({ edit: record.id, add: null });
  };

  const openAdd = () => {
    form.resetFields();
    setModalParam({ add: '1', edit: null });
  };

  const closeModal = () => {
    sessionStorage.removeItem('task_form_draft');
    form.resetFields();
    setModalParam({ add: null, edit: null });
  };

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
      closeModal();
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
    { title: '标题', dataIndex: 'title', key: 'title', width: 120, ellipsis: true },
    {
      title: '客户', key: 'customer', width: 120, ellipsis: true,
      render: (_: unknown, record: Task & { customers: Customer | null }) =>
        record.customers ? record.customers.name : '-',
    },
    {
      title: '优先级', dataIndex: 'priority', key: 'priority', width: 70,
      render: (v: string) => <Tag color={priorityColors[v]}>{priorityLabels[v]}</Tag>,
    },
    {
      title: '截止', dataIndex: 'due_date', key: 'due_date', width: 110,
      render: (v: string | null) => getDueDateTag(v),
    },
    {
      title: '状态', dataIndex: 'status', key: 'status', width: 70,
      render: (v: string) => <Tag color={statusColors[v]}>{statusLabels[v]}</Tag>,
    },
    {
      title: '操作', key: 'actions', width: 120,
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
            <Button type="primary" icon={<PlusOutlined />} onClick={openAdd}>
              新建任务
            </Button>
          )}
        </Space>
        <ResponsiveTable
          dataSource={tasks}
          columns={columns}
          rowKey="id"
          loading={isLoading}
          pagination={{ pageSize: 20, showSizeChanger: true, showTotal: (t) => `共 ${t} 条` }}
          scroll={{ x: 650 }}
        />
      </Card>

      <Modal
        title={editing ? '编辑任务' : '新建任务'}
        open={modalOpen}
        onCancel={closeModal}
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
