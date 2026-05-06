import { useState } from 'react';
import { Table, Button, Space, Modal, Form, Input, Select, message, Popconfirm, Card, Tag } from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../supabase';
import type { Account, AccountType } from '../../types';

const defaultAccounts = [
  { name: '营业收入', type: 'income' as const },
  { name: '其他收入', type: 'income' as const },
  { name: '办公费用', type: 'expense' as const },
  { name: '采购成本', type: 'expense' as const },
  { name: '差旅费用', type: 'expense' as const },
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
  });

  const saveMutation = useMutation({
    mutationFn: async (values: Partial<Account>) => {
      const { data: { user } } = await supabase.auth.getUser();
      const payload = { ...values, user_id: user?.id };
      if (editing) {
        const { error } = await supabase.from('accounts').update(payload).eq('id', editing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('accounts').insert([payload]);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['accounts'] });
      setModalOpen(false);
      setEditing(null);
      form.resetFields();
      message.success(editing ? '科目已更新' : '科目已添加');
    },
    onError: (error: Error) => message.error(error.message),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => { await supabase.from('accounts').delete().eq('id', id); },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['accounts'] });
      message.success('科目已删除');
    },
    onError: () => message.error('删除失败，可能有流水关联此科目'),
  });

  const initMutation = useMutation({
    mutationFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      const payload = defaultAccounts.map((a) => ({ ...a, user_id: user?.id }));
      const { error } = await supabase.from('accounts').insert(payload);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['accounts'] });
      message.success('默认科目已初始化');
    },
    onError: (error: Error) => message.error(error.message),
  });

  const openEdit = (record: Account) => {
    setEditing(record);
    form.setFieldsValue(record);
    setModalOpen(true);
  };

  const columns = [
    { title: '科目名称', dataIndex: 'name', key: 'name' },
    {
      title: '类型', dataIndex: 'type', key: 'type', width: 100,
      render: (v: AccountType) => <Tag color={typeColors[v]}>{typeLabels[v]}</Tag>,
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
        {!isLoading && (accounts ?? []).length === 0 && (
          <div style={{
            background: '#e6f4ff', border: '1px solid #91caff',
            borderRadius: 6, padding: '12px 16px', marginBottom: 16,
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          }}>
            <span>还没有科目，需要初始化默认科目（营业收入、办公费用等）</span>
            <Button type="primary" size="small" loading={initMutation.isPending}
              onClick={() => initMutation.mutate()}>
              一键初始化
            </Button>
          </div>
        )}
        <Space style={{ marginBottom: 16, width: '100%', justifyContent: 'flex-end' }}>
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
