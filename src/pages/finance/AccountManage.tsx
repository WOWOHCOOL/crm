import { useState } from 'react';
import { Table, Button, Space, Modal, Form, Input, Select, message, Popconfirm, Card, Tag } from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../supabase';
import type { Account, AccountType } from '../../types';
import { logOperation } from '../../utils/log';

async function getUserId() {
  const { data: { user } } = await supabase.auth.getUser();
  return user?.id;
}

const defaultAccounts = [
  // ── 收入类 ──
  { name: '商品销售收入', type: 'income' as const },
  { name: '出口退税收入', type: 'income' as const },
  { name: '样品收入', type: 'income' as const },
  { name: '其他收入', type: 'income' as const },
  // ── 支出类 ──
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
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Account | null>(null);
  const [form] = Form.useForm();
  const queryClient = useQueryClient();

  const { data: accounts, isLoading } = useQuery({
    queryKey: ['accounts'],
    queryFn: async () => {
      const { data } = await supabase.from('accounts').select('*').order('type').order('name');
      return (data ?? []) as Account[];
    },
    staleTime: 0,
    refetchOnMount: true,
  });

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
      setModalOpen(false);
      setEditing(null);
      form.resetFields();
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
      const { data: existing } = await supabase.from('accounts').select('name').eq('user_id', uid);
      const existingNames = new Set((existing ?? []).map((a: { name: string }) => a.name));
      const newAccounts = defaultAccounts.filter(a => !existingNames.has(a.name)).map(a => ({ ...a, user_id: uid }));
      if (newAccounts.length === 0) throw new Error('所有科目已存在，无需重复添加');
      const { error } = await supabase.from('accounts').insert(newAccounts);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['accounts'] });
      queryClient.invalidateQueries({ queryKey: ['accounts-select'] });
      message.success('外贸科目已添加');
    },
    onError: (error: Error) => message.error(error.message),
  });

  const openEdit = (record: Account) => {
    setEditing(record);
    form.setFieldsValue(record);
    setModalOpen(true);
  };

  const columns = [
    { title: '科目名称', dataIndex: 'name', key: 'name', onCell: () => ({ 'data-label': '科目名称' } as any) },
    {
      title: '类型', dataIndex: 'type', key: 'type', width: 100, onCell: () => ({ 'data-label': '类型' } as any),
      render: (v: AccountType) => <Tag color={typeColors[v]} style={{ borderRadius: 6 }}>{typeLabels[v]}</Tag>,
    },
    {
      title: '操作', key: 'actions', width: 160,
      render: (_: unknown, record: Account) => (
        <Space>
          <Button size="small" onClick={() => openEdit(record)}>编辑</Button>
          <Popconfirm title="确定删除此科目？" onConfirm={() => deleteMutation.mutate(record.id)}>
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
            初始化默认科目（外贸专用）
          </Button>
          <Button type="primary" icon={<PlusOutlined />}
            onClick={() => { setEditing(null); form.resetFields(); setModalOpen(true); }}
          >
            添加科目
          </Button>
        </Space>
        <Table
          dataSource={accounts}
          columns={columns}
          rowKey="id"
          loading={isLoading}
          pagination={false}
          scroll={{ x: 500 }}
        />
      </Card>

      <Modal
        title={editing ? '编辑科目' : '添加科目'}
        open={modalOpen}
        onCancel={() => { setModalOpen(false); setEditing(null); }}
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
        </Form>
      </Modal>
    </div>
  );
}
