import { useState } from 'react';
import { Card, Table, Tag, Button, message, Space, Tabs, Switch, Spin, Select, Typography, Row, Col } from 'antd';
import { CopyOutlined, UserOutlined, PlusOutlined, TeamOutlined, KeyOutlined, SafetyOutlined, HistoryOutlined } from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../supabase';
import { useAuth } from '../auth/AuthContext';
import type { OrgMemberInfo, OperationLog } from '../types';
import { ALL_PERMISSIONS } from '../types';

const actionLabels: Record<string, string> = { create: '新建', update: '编辑', delete: '删除' };
const entityLabels: Record<string, string> = { customer: '客户', product: '商品', transaction: '流水', account: '科目', quotation: '报价单', pi: 'PI', task: '任务' };

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
    onSuccess: (code) => { queryClient.invalidateQueries({ queryKey: ['org-invite-codes'] }); handleCopy(code); },
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

  const handleCopy = async (text: string) => {
    try { await navigator.clipboard.writeText(text); setCopied(text); message.success('已复制'); setTimeout(() => setCopied(null), 2000); }
    catch { message.error('复制失败'); }
  };

  const nonOwnerMembers = (members ?? []).filter(m => m.role !== 'owner');

  return (
    <div style={{ maxWidth: 1000, margin: '0 auto' }}>
      {/* ═══ Team Info Card ═══ */}
      <Card styles={{ body: { padding: '20px 24px' } }} style={{ marginBottom: 16, borderRadius: 12, border: '1px solid #f0f0f0' }}>
        <Row align="middle" gutter={[16, 12]}>
          <Col xs={24} sm={12}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ width: 44, height: 44, borderRadius: 12, background: 'linear-gradient(135deg,#d4a843,#b8922e)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 20 }}>
                <TeamOutlined />
              </div>
              <div>
                <div style={{ fontSize: 16, fontWeight: 600 }}>{orgInfo?.org_name || '未命名团队'}</div>
                <div style={{ fontSize: 12, color: '#94a3b8' }}>{members?.length || 0} 名成员 · 邀请码: {orgInfo?.invite_code || '-'}</div>
              </div>
            </div>
          </Col>
          <Col xs={24} sm={12}>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', justifyContent: { xs: 'flex-start', sm: 'flex-end' } as any }}>
              <Tag color="gold" style={{ borderRadius: 6, padding: '2px 10px' }}><UserOutlined /> 主账号</Tag>
              {orgInfo?.invite_code && (
                <Button size="small" icon={<CopyOutlined />} onClick={() => handleCopy(orgInfo.invite_code!)}>
                  复制邀请码
                </Button>
              )}
            </div>
          </Col>
        </Row>
      </Card>

      {/* ═══ Tab Content ═══ */}
      <Card styles={{ body: { padding: 0 } }} style={{ borderRadius: 12, border: '1px solid #f0f0f0' }}>
        <Tabs activeKey={tab} onChange={setTab} style={{ padding: '0 4px' }}
          items={[
            // ── INVITE CODES ──
            { key: 'invite', label: <span><KeyOutlined /> 邀请码</span>, children: (
              <div style={{ padding: '12px 20px 20px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14, flexWrap: 'wrap', gap: 10 }}>
                  <span style={{ fontSize: 13, color: '#64748b' }}>将邀请码分享给团队成员，注册时输入即可加入</span>
                  <Button type="primary" size="small" icon={<PlusOutlined />}
                    loading={generateMutation.isPending} onClick={() => generateMutation.mutate()}>
                    生成邀请码
                  </Button>
                </div>
                <Table dataSource={inviteCodes ?? []}
                  columns={[
                    { title: '邀请码', dataIndex: 'code', key: 'code', onCell: () => ({ 'data-label': '邀请码' } as any),
                      render: (v: string) => (
                        <Space>
                          <code style={{ fontSize: 16, fontWeight: 700, letterSpacing: 2, fontFamily: 'monospace', background: '#f5f5f5', padding: '2px 10px', borderRadius: 4 }}>{v}</code>
                          <Button size="small" icon={<CopyOutlined />} onClick={() => handleCopy(v)} disabled={copied === v} />
                        </Space>
                      ),
                    },
                    { title: '生成时间', dataIndex: 'created_at', key: 'created_at', width: 170, onCell: () => ({ 'data-label': '时间' } as any),
                      render: (v: string) => v ? new Date(v).toLocaleString('zh-CN') : '-' },
                    { title: '状态', key: 'status', width: 80, onCell: () => ({ 'data-label': '状态' } as any),
                      render: () => <Tag color="green" style={{ borderRadius: 6 }}>待使用</Tag> },
                  ]}
                  rowKey="code" loading={codesLoading} pagination={false}
                  scroll={{ x: 500 }}
                  locale={{ emptyText: '暂无邀请码，点击上方按钮生成' }} />
              </div>
            )},

            // ── PERMISSIONS ──
            { key: 'perms', label: <span><SafetyOutlined /> 成员 ({nonOwnerMembers.length})</span>, children: (
              <div style={{ padding: '12px 20px 20px' }}>
                {nonOwnerMembers.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: 40, color: '#94a3b8' }}>暂无子账号，生成邀请码邀请成员加入</div>
                ) : (
                  <Table dataSource={nonOwnerMembers} rowKey="user_id" pagination={false}
                    columns={[
                      { title: '邮箱', dataIndex: 'email', key: 'email', onCell: () => ({ 'data-label': '邮箱' } as any), render: (v: string) => v || '-' },
                      { title: '角色', dataIndex: 'role', key: 'role', width: 130, onCell: () => ({ 'data-label': '角色' } as any),
                        render: (v: string, record: OrgMemberInfo) => (
                          <Select size="small" value={v} style={{ width: 110 }}
                            onChange={(val) => roleMutation.mutate({ userId: record.user_id, role: val })}
                            options={[{ label: '管理员', value: 'admin' }, { label: '普通账号', value: 'member' }]} />
                        ),
                      },
                      ...ALL_PERMISSIONS.map(p => ({
                        title: p.label, key: p.key, width: 70, onCell: () => ({ 'data-label': p.label } as any),
                        render: (_: unknown, record: OrgMemberInfo) => (
                          <Switch size="small" defaultChecked
                            onChange={(val) => roleMutation.mutate({ userId: record.user_id, role: val ? 'admin' : 'member' })}
                          />
                        ),
                      })),
                    ]}
                    scroll={{ x: 600 }}
                  />
                )}
              </div>
            )},

            // ── LOGS ──
            { key: 'logs', label: <span><HistoryOutlined /> 日志</span>, children: (
              <div style={{ padding: '12px 20px 20px' }}>
                {logsLoading ? <div style={{ textAlign: 'center', padding: 40 }}><Spin /></div> : (
                  <Table dataSource={logs ?? []} rowKey="id" pagination={{ pageSize: 20 }}
                    columns={[
                      { title: '时间', dataIndex: 'created_at', key: 'created_at', width: 160, onCell: () => ({ 'data-label': '时间' } as any),
                        render: (v: string) => new Date(v).toLocaleString('zh-CN') },
                      { title: '成员', dataIndex: 'user_email', key: 'user_email', width: 180, onCell: () => ({ 'data-label': '成员' } as any) },
                      { title: '操作', dataIndex: 'action', key: 'action', width: 70, onCell: () => ({ 'data-label': '操作' } as any),
                        render: (v: string) => <Tag style={{ borderRadius: 6 }}>{actionLabels[v] || v}</Tag> },
                      { title: '模块', dataIndex: 'entity', key: 'entity', width: 70, onCell: () => ({ 'data-label': '模块' } as any),
                        render: (v: string) => entityLabels[v] || v },
                      { title: '描述', dataIndex: 'description', key: 'description', onCell: () => ({ 'data-label': '描述' } as any) },
                    ]}
                    scroll={{ x: 600 }}
                    locale={{ emptyText: '暂无操作记录' }} />
                )}
              </div>
            )},
          ]}
        />
      </Card>
    </div>
  );
}
