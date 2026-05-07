import { useState } from 'react';
import { Card, Table, Tag, Button, message, Space, Typography, Tooltip, Popconfirm } from 'antd';
import { CopyOutlined, ReloadOutlined, UserOutlined, PlusOutlined, KeyOutlined, DeleteOutlined } from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../supabase';
import { useAuth } from '../auth/AuthContext';
import type { OrgMemberInfo } from '../types';

export default function OrgManage() {
  const { orgInfo, refreshOrg } = useAuth();
  const queryClient = useQueryClient();
  const [copied, setCopied] = useState<string | null>(null);

  const { data: members, isLoading } = useQuery({
    queryKey: ['org-members'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_org_members');
      if (error) throw error;
      return (data ?? []) as OrgMemberInfo[];
    },
    staleTime: 0,
    refetchOnMount: true,
  });

  const { data: inviteCodes, isLoading: codesLoading } = useQuery({
    queryKey: ['org-invite-codes'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_team_invite_codes');
      if (error) throw error;
      return (data ?? []) as { code: string; created_at: string }[];
    },
    staleTime: 0,
    refetchOnMount: true,
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
      message.success(`邀请码已生成`);
      // 自动复制
      handleCopy(code);
    },
    onError: (error: Error) => message.error(error.message),
  });

  const handleCopy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(text);
      message.success('邀请码已复制');
      setTimeout(() => setCopied(null), 2000);
    } catch {
      message.error('复制失败，请手动复制');
    }
  };

  const roleLabels: Record<string, { label: string; color: string }> = {
    owner: { label: '主账号', color: 'blue' },
    member: { label: '子账号', color: 'green' },
  };

  const memberColumns = [
    {
      title: '邮箱', dataIndex: 'email', key: 'email',
      render: (v: string) => v || '(未知)',
    },
    {
      title: '角色', dataIndex: 'role', key: 'role', width: 120,
      render: (v: string) => {
        const info = roleLabels[v] || { label: v, color: 'default' };
        return <Tag color={info.color}>{info.label}</Tag>;
      },
    },
    {
      title: '加入时间', dataIndex: 'created_at', key: 'created_at', width: 180,
      render: (v: string) => v ? new Date(v).toLocaleString('zh-CN') : '-',
    },
  ];

  return (
    <div>
      {/* 团队信息 */}
      <Card style={{ marginBottom: 16 }}>
        <Space direction="vertical" size="middle" style={{ width: '100%' }}>
          <div>
            <Typography.Text type="secondary" style={{ fontSize: 13 }}>团队名称</Typography.Text>
            <div style={{ fontSize: 18, fontWeight: 600, marginTop: 4 }}>
              <UserOutlined style={{ marginRight: 8 }} />
              {orgInfo?.org_name || '未命名团队'}
              <Tag color="blue" style={{ marginLeft: 12, verticalAlign: 'middle' }}>主账号</Tag>
            </div>
          </div>
        </Space>
      </Card>

      {/* 邀请码管理 */}
      <Card
        title="邀请码管理"
        style={{ marginBottom: 16 }}
        extra={
          <Button
            type="primary"
            size="small"
            icon={<PlusOutlined />}
            loading={generateMutation.isPending}
            onClick={() => generateMutation.mutate()}
          >
            生成新邀请码
          </Button>
        }
      >
        <Typography.Text type="secondary" style={{ fontSize: 13, display: 'block', marginBottom: 12 }}>
          将邀请码分享给团队成员，他们注册时输入即可自动加入团队
        </Typography.Text>

        <Table
          dataSource={inviteCodes ?? []}
          columns={[
            {
              title: '邀请码', dataIndex: 'code', key: 'code',
              render: (v: string) => (
                <Space>
                  <code style={{
                    fontSize: 18, fontWeight: 700, letterSpacing: 2,
                    fontFamily: 'monospace', background: '#f5f5f5',
                    padding: '2px 12px', borderRadius: 4,
                  }}>
                    {v}
                  </code>
                  <Tooltip title="复制邀请码">
                    <Button
                      size="small"
                      icon={<CopyOutlined />}
                      onClick={() => handleCopy(v)}
                      disabled={copied === v}
                    />
                  </Tooltip>
                </Space>
              ),
            },
            {
              title: '生成时间', dataIndex: 'created_at', key: 'created_at', width: 180,
              render: (v: string) => v ? new Date(v).toLocaleString('zh-CN') : '-',
            },
            {
              title: '状态', key: 'status', width: 80,
              render: () => <Tag color="green">待使用</Tag>,
            },
          ]}
          rowKey="code"
          loading={codesLoading}
          pagination={false}
          locale={{ emptyText: '暂无邀请码，点击上方按钮生成' }}
        />
      </Card>

      {/* 团队成员 */}
      <Card title={`团队成员（${members?.length ?? 0} 人）`}>
        <Table
          dataSource={members ?? []}
          columns={memberColumns}
          rowKey="user_id"
          loading={isLoading}
          pagination={false}
        />
      </Card>
    </div>
  );
}
