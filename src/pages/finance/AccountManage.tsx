import { useState, useMemo, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Table, Button, Space, Modal, Form, Input, Select, message, Popconfirm, Card, Tag } from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../supabase';
import type { Account, AccountType, EntityType } from '../../types';
import { ENTITY_LABELS, ENTITY_COLORS } from '../../types';
import { logOperation } from '../../utils/log';

async function getUserId() {
  const { data: { user } } = await supabase.auth.getUser();
  return user?.id;
}

const defaultAccounts = [
  { name: '商品销售收入', type: 'income' as const },
  { name: '出口退税收入', type: 'income' as const },
  { name: '样品收入', type: 'income' as const },
  { name: '其他收入', type: 'income' as const },
  { name: '商品采购成本', type: 'expense' as const },
  { name: '国际运费', type: 'expense' as const },
  { name: '报关报检费', type: 'expense' as const },
  { name: '港杂费', type: 'expense' as const },
  { name: '保险费', type: 'expense' as const },
  { name: '银行手续费', type: 'expense' as const },
  { name: '认证检测费', type: 'expense' as const },
  { name: '平台费用', type: 'expense' as const },
  { name: '办公费用', type: 'expense' as const },
  { name: '员工工资', type: 'expense' as const },
  { name: '差旅费用', type: 'expense' as const },
  { name: '租金水电', type: 'expense' as const },
  { name: '其他支出', type: 'expense' as const },
];

const typeLabels: Record<AccountType, string> = {
  income: '收入',
  expense: '支出',
  asset: '资产',
  liability: '负债',
  equity: '权益',
};

const typeColors: Record<AccountType, string> = {
  income: 'green',
  expense: 'red',
  asset: 'blue',
  liability: 'orange',
  equity: 'purple',
};

export default function AccountManage() {
  const [form] = Form.useForm();
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const editId = searchParams.get('edit') || undefined;
  const isAdding = searchParams.get('add') === '1';
  const modalOpen = !!editId || isAdding;

  const { data: accounts, isLoading } = useQuery({
    queryKey: ['accounts'],
    queryFn: async () => {
      const { data } = await supabase.from('accounts').select('*').order('type').order('name');
      return (data ?? []) as Account[];
    },
  });

  const editing = useMemo(() => {
    if (!editId || !accounts) return null;
    return accounts.find(a => a.id === editId) ?? null;
  }, [editId, accounts]);

  useEffect(() => {
    if (editing) form.setFieldsValue(editing);
  }, [editing]); // eslint-disable-line react-hooks/exhaustive-deps

  // Restore draft from sessionStorage on mount (add mode only)
  useEffect(() => {
    if (editId) return;
    const draft = sessionStorage.getItem('account_form_draft');
    if (!draft) return;
    try {
      const data = JSON.parse(draft);
      if (data.formValues) form.setFieldsValue(data.formValues);
      sessionStorage.removeItem('account_form_draft');
    } catch { /* ignore */ }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Save draft on visibility change (add mode only)
  const isEditMode = !!editId;
  useEffect(() => {
    if (isEditMode) return;
    const save = () => {
      sessionStorage.setItem('account_form_draft', JSON.stringify({
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

  const openEdit = (record: Account) => {
    form.setFieldsValue(record);
    setModalParam({ edit: record.id, add: null });
  };

  const openAdd = () => {
    form.resetFields();
    setModalParam({ add: '1', edit: null });
  };

  const closeModal = () => {
    sessionStorage.removeItem('account_form_draft');
    form.resetFields();
    setModalParam({ add: null, edit: null });
  };

  const saveMutation = useMutation({
    mutationFn: async (values: Partial<Account>) => {
      if (editing) {
        const { error } = await supabase.from('accounts').update(values).eq('id', editing.id);
        if (error) throw error;
      } else {
        const uid = await getUserId();
        if (!uid) throw new Error('未登录');
        const { error } = await supabase.from('accounts').insert([{ ...values, user_id: uid }]);
        if (error) throw error;
      }
    },
    onSuccess: (_data, values) => {
      queryClient.invalidateQueries({ queryKey: ['accounts'] });
      queryClient.invalidateQueries({ queryKey: ['accounts-select'] });
      closeModal();
      const isUpdate = !!editing;
      message.success(isUpdate ? '科目已更新' : '科目已添加');
      logOperation('account', isUpdate ? 'update' : 'create', editing?.id, values.name);
    },
    onError: (error: Error) => message.error(error.message),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { data } = await supabase.from('accounts').select('name').eq('id', id).single();
      const { data: delData, error } = await supabase.from('accounts').delete().eq('id', id).select();
      if (error) throw error;
      if (!delData || delData.length === 0) throw new Error('无权删除此科目（可能由其他成员创建），请联系主账号处理');
      return data as { name: string } | null;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['accounts'] });
      queryClient.invalidateQueries({ queryKey: ['accounts-select'] });
      message.success('科目已删除');
      logOperation('account', 'delete', undefined, data?.name || '');
    },
    onError: (error: Error) => message.error(error.message),
  });

  const initMutation = useMutation({
    mutationFn: async () => {
      const uid = await getUserId();
      if (!uid) throw new Error('未登录');
      const { data: existing } = await supabase.from('accounts').select('name,entity').eq('user_id', uid);
      // Build set of existing "name|entity" pairs
      const existingPairs = new Set((existing ?? []).map((a: { name: string; entity: string | null }) => `${a.name}|${a.entity || ''}`));
      const entities = ['dongyixin', 'dongyi', 'private'] as const;
      const newAccounts: { name: string; type: string; entity: string; user_id: string }[] = [];
      for (const entity of entities) {
        for (const a of defaultAccounts) {
          if (!existingPairs.has(`${a.name}|${entity}`)) {
            newAccounts.push({ ...a, entity, user_id: uid });
          }
        }
      }
      if (newAccounts.length === 0) throw new Error('所有科目已存在，无需重复添加');
      const { error } = await supabase.from('accounts').insert(newAccounts);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['accounts'] });
      queryClient.invalidateQueries({ queryKey: ['accounts-select'] });
      message.success('已为东易鑫/东易/私账创建科目');
    },
    onError: (error: Error) => message.error(error.message),
  });

  const columns = [
    { title: '科目名称', dataIndex: 'name', key: 'name', onCell: () => ({ 'data-label': '科目名称' } as any) },
    {
      title: '类型', dataIndex: 'type', key: 'type', width: 100, onCell: () => ({ 'data-label': '类型' } as any),
      render: (v: AccountType) => <Tag color={typeColors[v]} style={{ borderRadius: 6 }}>{typeLabels[v]}</Tag>,
    },
    {
      title: '归属主体', dataIndex: 'entity', key: 'entity', width: 100, onCell: () => ({ 'data-label': '归属主体' } as any),
      render: (v: EntityType | null) => v ? <Tag color={ENTITY_COLORS[v]} style={{ borderRadius: 6 }}>{ENTITY_LABELS[v]}</Tag> : <span style={{ color: '#999' }}>-</span>,
    },
    {
      title: '操作', key: 'actions', width: 160,
      render: (_: unknown, record: Account) => (
        <Space>
          <Button size="small" onClick={() => openEdit(record)}>编辑</Button>
          <Popconfirm title="删除后无法恢复，确定删除此科目？" onConfirm={() => deleteMutation.mutate(record.id)} okText="确认删除" cancelText="取消">
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
          <Button size="small" loading={initMutation.isPending}
            onClick={() => initMutation.mutate()}>
            初始化科目（东易鑫/东易/私账）
          </Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={openAdd}>
            添加科目
          </Button>
        </Space>
        <Table
          dataSource={accounts}
          columns={columns}
          rowKey="id"
          loading={isLoading}
          pagination={false}
          scroll={{ x: 650 }}
        />
      </Card>

      <Modal
        title={editing ? '编辑科目' : '添加科目'}
        open={modalOpen}
        onCancel={closeModal}
        onOk={() => form.submit()}
        confirmLoading={saveMutation.isPending}
        destroyOnClose
      >
        <Form form={form} layout="vertical" onFinish={(values) => saveMutation.mutate(values)}>
          <Form.Item name="name" label="科目名称" rules={[{ required: true, message: '请输入科目名称' }]}>
            <Input />
          </Form.Item>
          <Form.Item name="type" label="类型" rules={[{ required: true, message: '请选择类型' }]}>
            <Select options={Object.entries(typeLabels).map(([value, label]) => ({ label, value }))} />
          </Form.Item>
          <Form.Item name="entity" label="归属主体">
            <Select
              allowClear placeholder="选择主体（可选）"
              options={Object.entries(ENTITY_LABELS).map(([value, label]) => ({ label, value }))}
            />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
