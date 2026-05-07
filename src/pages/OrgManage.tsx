import { useState } from 'react';
import { Card, Table, Tag, Button, message, Space, Typography, Tooltip, Tabs, Switch, Spin, Select } from 'antd';
import { CopyOutlined, UserOutlined, PlusOutlined } from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../supabase';
import { useAuth } from '../auth/AuthContext';
import type { OrgMemberInfo, OperationLog } from '../types';
import { ALL_PERMISSIONS } from '../types';

export default function OrgManage() {
  const { orgInfo } = useAuth();
  const queryClient = useQueryClient();
  const [copied, setCopied] = useState<string | null>(null);
  const [tab, setTab] = useState('invite');

  const { data: members, isLoading } = useQuery({
    queryKey: ['org-members'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_org_members');
      if (error) throw error;
      return (data ?? []) as OrgMemberInfo[];
    },
  });

  const { data: inviteCodes, isLoading: codesLoading } = useQuery({
    queryKey: ['org-invite-codes'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_team_invite_codes');
      if (error) throw error;
      return (data ?? []) as { code: string; created_at: string }[];
    },
  });

  const { data: logs, isLoading: logsLoading } = useQuery({
    queryKey: ['org-logs'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_operation_logs', { p_limit: 100 });
      if (error) throw error;
      return (data ?? []) as OperationLog[];
    },
    enabled: tab === 'logs',
  });

  const generateMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc('generate_team_invite_code');
      if (error) throw error;
      const result = data as { error?: string; code?: string };
      if (result.error) throw new Error(result.error);
      return result.code!;
    },
    onSuccess: (code) => {
      queryClient.invalidateQueries({ queryKey: ['org-invite-codes'] });
      handleCopy(code);
    },
    onError: (error: Error) => message.error(error.message),
  });

  const roleMutation = useMutation({
    mutationFn: async ({ userId, role }: { userId: string; role: string }) => {
      const { data, error } = await supabase.rpc('set_member_role', { p_user_id: userId, p_role: role });
      if (error) throw error;
      const result = data as { error?: string };
      if (result.error) throw new Error(result.error);
    },
    onSuccess: () => { message.success('角色已更新'); queryClient.invalidateQueries({ queryKey: ['org-members'] }); },
    onError: (err: Error) => message.error(err.message),
  });

  const permMutation = useMutation({
    mutationFn: async ({ userId, perm, allowed }: { userId: string; perm: string; allowed: boolean }) => {
      const { data, error } = await supabase.rpc('set_member_permission', {
        p_user_id: userId,
        p_permission: perm,
        p_allowed: allowed,
      });
      if (error) throw error;
      const result = data as { error?: string };
      if (result.error) throw new Error(result.error);
    },
    onSuccess: () => message.success('权限已更新'),
    onError: (err: Error) => message.error(err.message),
  });

  const handleCopy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(text);
      message.success('已复制');
      setTimeout(() => setCopied(null), 2000);
    } catch {
      message.error('复制失败');
    }
  };

  const actionLabels: Record<string, string> = { create: '新建', update: '编辑', delete: '删除' };
  const entityLabels: Record<string, string> = {
    customer: '客户', product: '商品', transaction: '流水',
    account: '科目', quotation: '报价单', pi: 'PI',
  };

  const nonOwnerMembers = (members ?? []).filter(m => m.role === 'member');

  return (
    <div>
      <Card style={{ marginBottom: 16 }}>
        <Space direction="vertical" size="small" style={{ width: '100%' }}>
          <Typography.Text type="secondary" style={{ fontSize: 13 }}>团队名称</Typography.Text>
          <div style={{ fontSize: 18, fontWeight: 600 }}>
            <UserOutlined style={{ marginRight: 8 }} />
            {orgInfo?.org_name || '未命名团队'}
            <Tag color="blue" style={{ marginLeft: 12 }}>主账号</Tag>
          </div>
        </Space>
      </Card>

      <Card>
        <Tabs activeKey={tab} onChange={setTab} items={[
          {
            key: 'invite',
            label: '邀请码管理',
            children: (
              <>
                <Space style={{ marginBottom: 12, justifyContent: 'space-between', width: '100%' }}>
                  <Typography.Text type="secondary">将邀请码分享给团队成员，注册时输入即可加入</Typography.Text>
                  <Button type="primary" size="small" icon={<PlusOutlined />}
                    loading={generateMutation.isPending} onClick={() => generateMutation.mutate()}>
                    生成邀请码
                  </Button>
                </Space>
                <Table dataSource={inviteCodes ?? []}
                  columns={[
                    {
                      title: '邀请码', dataIndex: 'code', key: 'code',
                      render: (v: string) => (
                        <Space>
                          <code style={{ fontSize: 18, fontWeight: 700, letterSpacing: 2,
                            fontFamily: 'monospace', background: '#f5f5f5', padding: '2px 12px', borderRadius: 4 }}>
                            {v}
                          </code>
                          <Button size="small" icon={<CopyOutlined />}
                            onClick={() => handleCopy(v)} disabled={copied === v} />
                        </Space>
                      ),
                    },
                    { title: '生成时间', dataIndex: 'created_at', key: 'created_at', width: 180,
                      render: (v: string) => v ? new Date(v).toLocaleString('zh-CN') : '-' },
                    { title: '状态', key: 'status', width: 80, render: () => <Tag color="green">待使用</Tag> },
                  ]}
                  rowKey="code" loading={codesLoading} pagination={false}
                  locale={{ emptyText: '暂无邀请码' }} />
              </>
            ),
          },
          {
            key: 'perms',
            label: `成员权限 (${nonOwnerMembers.length})`,
            children: nonOwnerMembers.length === 0 ? (
              <Typography.Text type="secondary">暂无子账号</Typography.Text>
            ) : (
              <Table dataSource={nonOwnerMembers} rowKey="user_id" pagination={false}
                columns={[
                  { title: '邮箱', dataIndex: 'email', key: 'email', render: (v: string) => v || '-' },
                  {
                    title: '角色', dataIndex: 'role', key: 'role', width: 140,
                    render: (v: string, record: OrgMemberInfo) => (
                      <Select size="small" value={v} style={{ width: 110 }}
                        onChange={(val) => roleMutation.mutate({ userId: record.user_id, role: val })}
                        options={[
                          { label: '管理员', value: 'admin' },
                          { label: '普通账号', value: 'member' },
                        ]}
                      />
                    ),
                  },
                  ...ALL_PERMISSIONS.map(p => ({
                    title: p.label,
                    key: p.key,
                    width: 90,
                    render: (_: unknown, record: OrgMemberInfo) => (
                      <Switch size="small" defaultChecked
                        loading={permMutation.isPending}
                        onChange={(val) => permMutation.mutate({ userId: record.user_id, perm: p.key, allowed: val })}
                      />
                    ),
                  })),
                ]}
              />
            ),
          },
          {
            key: 'logs',
            label: `操作日志`,
            children: logsLoading ? <Spin /> : (
              <Table dataSource={logs ?? []} rowKey="id" pagination={{ pageSize: 20 }}
                columns={[
                  { title: '时间', dataIndex: 'created_at', key: 'created_at', width: 160,
                    render: (v: string) => new Date(v).toLocaleString('zh-CN') },
                  { title: '成员', dataIndex: 'user_email', key: 'user_email', width: 200 },
                  { title: '操作', dataIndex: 'action', key: 'action', width: 80,
                    render: (v: string) => <Tag>{actionLabels[v] || v}</Tag> },
                  { title: '模块', dataIndex: 'entity', key: 'entity', width: 80,
                    render: (v: string) => entityLabels[v] || v },
                  { title: '描述', dataIndex: 'description', key: 'description' },
                ]}
                locale={{ emptyText: '暂无操作记录' }} />
            ),
          },
        ]} />
      </Card>
    </div>
  );
}
