import { useState, useMemo, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Button, Space, Input, Modal, Form, Select, DatePicker,
  message, Popconfirm, Card, Tag, Row, Col, Pagination, Tooltip, Descriptions,
} from 'antd';
import { PlusOutlined, SearchOutlined, AppstoreOutlined, UnorderedListOutlined } from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../supabase';
import type { Task, Customer } from '../../types';
import { logOperation } from '../../utils/log';
import { useAuth } from '../../auth/AuthContext';
import { useResponsive } from '../../hooks/useResponsive';
import { tokens } from '../../styles/theme';
import TaskCard from '../../components/TaskCard';
import ResponsiveTable from '../../components/ResponsiveTable';
import { TableSkeleton } from '../../components/Skeletons';
import dayjs from 'dayjs';

const PAGE_SIZE = 20;
const VIEW_KEY = 'task_view_mode';

const priorityLabels: Record<string, string> = { low: '低', normal: '中', high: '高', urgent: '紧急' };
const priorityColors: Record<string, string> = { low: 'default', normal: 'blue', high: 'orange', urgent: 'red' };
const priorityOptions = [
  { label: '低', value: 'low' }, { label: '中', value: 'normal' },
  { label: '高', value: 'high' }, { label: '紧急', value: 'urgent' },
];

export default function TaskList() {
  const { isOwner, isAdmin, orgInfo } = useAuth();
  const canEdit = isOwner || isAdmin;
  const queryClient = useQueryClient();
  const { isMobile } = useResponsive();

  const [statusFilter, setStatusFilter] = useState<string>('pending');
  const [priorityFilter, setPriorityFilter] = useState<string | undefined>();
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [viewMode, setViewMode] = useState<'grid' | 'list'>(() =>
    (localStorage.getItem(VIEW_KEY) as 'grid' | 'list') || 'grid'
  );
  const [form] = Form.useForm();
  const [searchParams, setSearchParams] = useSearchParams();
  const editId = searchParams.get('edit') || undefined;
  const isAdding = searchParams.get('add') === '1';
  const detailId = searchParams.get('detail') || undefined;
  const modalOpen = !!editId || isAdding;
  const detailOpen = !!detailId;

  const { data: tasks, isLoading } = useQuery({
    queryKey: ['tasks', statusFilter, priorityFilter, search],
    queryFn: async () => {
      let query = supabase.from('tasks').select('*, customers(name, company)').order('due_date', { ascending: true });
      if (statusFilter !== 'all') query = query.eq('status', statusFilter);
      if (priorityFilter) query = query.eq('priority', priorityFilter);
      if (search) query = query.or(`title.ilike.%${search}%,customers.name.ilike.%${search}%`);
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

  const editing = useMemo(() => { if (!editId || !tasks) return null; return tasks.find(t => t.id === editId) ?? null; }, [editId, tasks]);
  const detailTask = useMemo(() => { if (!detailId || !tasks) return null; return tasks.find(t => t.id === detailId) ?? null; }, [detailId, tasks]);

  useEffect(() => {
    if (editing) form.setFieldsValue({ ...editing, due_date: editing.due_date ? dayjs(editing.due_date) : null, reminder_time: editing.reminder_time ? dayjs(editing.reminder_time) : null });
  }, [editing]);

  useEffect(() => { if (editId) return; const d = sessionStorage.getItem('task_form_draft'); if (!d) return; try { const p = JSON.parse(d); if (p.formValues) form.setFieldsValue(p.formValues); sessionStorage.removeItem('task_form_draft'); } catch { /* */ } }, []);
  const isEditMode = !!editId;
  useEffect(() => { if (isEditMode) return; const save = () => sessionStorage.setItem('task_form_draft', JSON.stringify({ formValues: form.getFieldsValue() })); document.addEventListener('visibilitychange', save); window.addEventListener('beforeunload', save); return () => { document.removeEventListener('visibilitychange', save); window.removeEventListener('beforeunload', save); }; }, [form, isEditMode]);

  const setModalParam = (params: Record<string, string | null>) => { const next = new URLSearchParams(searchParams); Object.entries(params).forEach(([k, v]) => { if (v === null) next.delete(k); else next.set(k, v); }); setSearchParams(next, { replace: true }); };
  const openEdit = (record: Task) => { form.setFieldsValue({ ...record, due_date: record.due_date ? dayjs(record.due_date) : null, reminder_time: record.reminder_time ? dayjs(record.reminder_time) : null }); setModalParam({ edit: record.id, add: null, detail: null }); };
  const openAdd = () => { form.resetFields(); setModalParam({ add: '1', edit: null, detail: null }); };
  const closeModal = () => { sessionStorage.removeItem('task_form_draft'); form.resetFields(); setModalParam({ add: null, edit: null, detail: null }); };
  const showDetail = (record: Task) => { setModalParam({ detail: record.id, add: null, edit: null }); };
  const closeDetail = () => { setModalParam({ detail: null, add: null, edit: null }); };

  const saveMutation = useMutation({
    mutationFn: async (values: Partial<Task>) => {
      const payload = { title: values.title, description: values.description || null, customer_id: values.customer_id || null, due_date: values.due_date || null, reminder_time: values.reminder_time || null, priority: values.priority || 'normal', status: values.status || 'pending' };
      if (editId) { const { error } = await supabase.from('tasks').update(payload).eq('id', editId); if (error) throw error; }
      else { if (!orgInfo?.org_id) throw new Error('未找到组织信息'); const { data: { user } } = await supabase.auth.getUser(); const { error } = await supabase.from('tasks').insert([{ ...payload, org_id: orgInfo.org_id, user_id: user?.id }]); if (error) throw error; }
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['tasks'] }); closeModal(); message.success(editId ? '任务已更新' : '任务已创建'); logOperation('task', editId ? 'update' : 'create'); },
    onError: (error: Error) => message.error(error.message),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => { const { error } = await supabase.from('tasks').delete().eq('id', id); if (error) throw error; },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['tasks'] }); message.success('任务已删除'); logOperation('task', 'delete'); },
    onError: (error: Error) => message.error(error.message),
  });

  const toggleStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => { const { error } = await supabase.from('tasks').update({ status }).eq('id', id); if (error) throw error; },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['tasks'] }); },
    onError: (error: Error) => message.error(error.message),
  });

  const columns = [
    { title: '标题', dataIndex: 'title', key: 'title', width: 140, ellipsis: true, render: (v: string, r: Task) => <a onClick={() => showDetail(r)}>{v}</a> },
    { title: '客户', key: 'customer', width: 100, ellipsis: true, render: (_: unknown, r: Task & { customers: Customer | null }) => r.customers?.name || '-' },
    { title: '优先级', dataIndex: 'priority', key: 'priority', width: 60, render: (v: string) => <Tag color={priorityColors[v]}>{priorityLabels[v]}</Tag> },
    { title: '截止', dataIndex: 'due_date', key: 'due_date', width: 80, render: (v: string | null) => v || '-' },
    { title: '状态', dataIndex: 'status', key: 'status', width: 60, render: (v: string) => <Tag color={v === 'completed' ? 'green' : 'orange'}>{v === 'completed' ? '✓' : '待'}</Tag> },
    ...(canEdit ? [{ title: '操作', key: 'actions', width: 100, render: (_: unknown, r: Task) => (<Space><Button size="small" type="link" onClick={() => openEdit(r)}>编辑</Button><Popconfirm title="删除后无法恢复，确定删除此任务？" onConfirm={() => deleteMutation.mutate(r.id)} okText="确认删除" cancelText="取消"><Button size="small" type="link" danger>删除</Button></Popconfirm></Space>) }] : []),
  ];

  const total = tasks?.length ?? 0;
  const paged = (tasks ?? []).slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const toggleView = (mode: 'grid' | 'list') => { setViewMode(mode); localStorage.setItem(VIEW_KEY, mode); };

  return (
    <div>
      <Card>
        <Space style={{ marginBottom: tokens.spacingLG, width: '100%', justifyContent: 'space-between' }} wrap>
          <Space wrap>
            <Select value={statusFilter} onChange={(v) => setStatusFilter(v)} style={{ width: 100 }} options={[{ label: '全部', value: 'all' }, { label: '待处理', value: 'pending' }, { label: '已完成', value: 'completed' }]} />
            <Select placeholder="优先级" value={priorityFilter} onChange={(v) => setPriorityFilter(v)} allowClear style={{ width: 90 }} options={priorityOptions} />
            <Input placeholder="搜索" prefix={<SearchOutlined />} value={search} onChange={(e) => setSearch(e.target.value)} allowClear style={{ width: 180 }} />
          </Space>
          <Space>
            <Tooltip title={viewMode === 'grid' ? '列表' : '卡片'}><Button size="small" type="text" icon={viewMode === 'grid' ? <UnorderedListOutlined /> : <AppstoreOutlined />} onClick={() => toggleView(viewMode === 'grid' ? 'list' : 'grid')} /></Tooltip>
            {canEdit && <Button type="primary" icon={<PlusOutlined />} onClick={openAdd}>新建任务</Button>}
          </Space>
        </Space>

        {isLoading ? (
          <TableSkeleton rows={isMobile ? 5 : 4} cols={3} />
        ) : viewMode === 'grid' ? (
          <>
            <Row gutter={[12, 12]}>
              {paged.map((t) => (
                <Col xs={24} sm={12} lg={8} key={t.id}>
                  <TaskCard
                    task={t}
                    onClick={() => showDetail(t)}
                    onToggle={() => toggleStatus.mutate({ id: t.id, status: t.status === 'completed' ? 'pending' : 'completed' })}
                    onEdit={canEdit ? () => openEdit(t) : undefined}
                    onDelete={canEdit ? () => deleteMutation.mutate(t.id) : undefined}
                  />
                </Col>
              ))}
            </Row>
            {total > PAGE_SIZE && (<div style={{ textAlign: 'center', marginTop: tokens.spacingXL }}><Pagination current={page} total={total} pageSize={PAGE_SIZE} onChange={setPage} showSizeChanger={false} showTotal={(t) => `共 ${t} 条`} /></div>)}
          </>
        ) : (
          <ResponsiveTable dataSource={tasks} columns={columns} rowKey="id" loading={isLoading} pagination={{ pageSize: PAGE_SIZE }} scroll={{ x: 500 }} />
        )}
      </Card>

      {/* Add/Edit Modal */}
      <Modal title={editing ? '编辑任务' : '新建任务'} open={modalOpen} onCancel={closeModal} onOk={() => form.submit()} confirmLoading={saveMutation.isPending} width={600} destroyOnClose>
        <Form form={form} layout="vertical" onFinish={(values) => saveMutation.mutate(values)}>
          <Form.Item name="title" label="任务标题" rules={[{ required: true, message: '请输入任务标题' }]}><Input /></Form.Item>
          <Row gutter={16}>
            <Col xs={24} sm={12}><Form.Item name="customer_id" label="关联客户"><Select showSearch allowClear placeholder="选择客户（可选）" optionFilterProp="label" options={(customers ?? []).map(c => ({ label: `${c.name}${c.company ? ` (${c.company})` : ''}`, value: c.id }))} /></Form.Item></Col>
            <Col xs={24} sm={12}><Form.Item name="priority" label="优先级" initialValue="normal"><Select options={priorityOptions} /></Form.Item></Col>
            <Col xs={24} sm={12}><Form.Item name="due_date" label="截止日期"><DatePicker style={{ width: '100%' }} /></Form.Item></Col>
            <Col xs={24} sm={12}><Form.Item name="reminder_time" label="提醒时间"><DatePicker showTime style={{ width: '100%' }} /></Form.Item></Col>
          </Row>
          <Form.Item name="description" label="任务描述"><Input.TextArea rows={3} /></Form.Item>
        </Form>
      </Modal>

      {/* Detail Modal */}
      <Modal title="任务详情" open={detailOpen} onCancel={closeDetail} footer={null} width={600} destroyOnClose>
        {detailTask && (
          <Descriptions column={1} size="small" colon={false} labelStyle={{ color: tokens.colorTextTertiary, fontSize: tokens.fontSizeSM, width: 80 }} contentStyle={{ color: tokens.colorText }}>
            <Descriptions.Item label="标题"><strong>{detailTask.title}</strong></Descriptions.Item>
            <Descriptions.Item label="状态"><Tag color={detailTask.status === 'completed' ? 'green' : 'orange'}>{detailTask.status === 'completed' ? '已完成' : detailTask.status === 'cancelled' ? '已取消' : '待处理'}</Tag></Descriptions.Item>
            <Descriptions.Item label="优先级"><Tag color={priorityColors[detailTask.priority]}>{priorityLabels[detailTask.priority]}</Tag></Descriptions.Item>
            <Descriptions.Item label="客户">{detailTask.customers?.name || '-'}</Descriptions.Item>
            <Descriptions.Item label="截止日期">{detailTask.due_date || '-'}</Descriptions.Item>
            <Descriptions.Item label="提醒时间">{detailTask.reminder_time ? dayjs(detailTask.reminder_time).format('YYYY-MM-DD HH:mm') : '-'}</Descriptions.Item>
            <Descriptions.Item label="描述">{detailTask.description || '-'}</Descriptions.Item>
          </Descriptions>
        )}
      </Modal>
    </div>
  );
}
