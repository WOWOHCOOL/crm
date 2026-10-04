import { useState } from 'react';
import { Card, Tag, Button, message, Space, Tabs, Switch, Spin, Select, Row, Col, Drawer, Empty, Divider, Alert } from 'antd';
import { CopyOutlined, UserOutlined, PlusOutlined, TeamOutlined, KeyOutlined, SafetyOutlined, HistoryOutlined, SettingOutlined } from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../supabase';
import { useAuth } from '../auth/AuthContext';
import ResponsiveTable from '../components/ResponsiveTable';
import type { OrgMemberInfo, OperationLog, MemberPermission, Permission } from '../types';
import { ALL_PERMISSIONS } from '../types';

const actionLabels: Record<string, string> = { create: '新建', update: '编辑', delete: '删除' };
const entityLabels: Record<string, string> = { customer: '客户', product: '商品', transaction: '流水', account: '科目', quotation: '报价单', pi: 'PI', task: '任务' };

// 成员权限摘要：管理员在 hasPerm() 里直接绕过全部开关，所以展示为「全部权限」，
// 不再逐个列出，避免给出「这些开关对他有效」的错误暗示。
function renderPermSummary(record: OrgMemberInfo, granted: string[]) {
  if (record.role === 'admin') {
    return <Tag color="gold" style={{ borderRadius: 6, margin: 0 }}>全部权限</Tag>;
  }
  if (granted.length === 0) {
    return <span style={{ fontSize: 12, color: '#94a3b8' }}>未分配</span>;
  }
  return (
    <Space size={[4, 4]} wrap>
      {ALL_PERMISSIONS.filter(p => granted.includes(p.key)).map(p => (
        <Tag key={p.key} color="blue" style={{ borderRadius: 6, margin: 0, fontSize: 11 }}>{p.label}</Tag>
      ))}
    </Space>
  );
}

export default function OrgManage() {
  const { orgInfo } = useAuth();
  const queryClient = useQueryClient();
  const [copied, setCopied] = useState<string | null>(null);
  const [tab, setTab] = useState('invite');
  // 权限抽屉当前编辑的成员 **user_id**（null = 关闭）。
  // ⚠️ 刻意只存 id、不存成员对象：把角色从「管理员」改成「普通账号」后会
  // invalidate org-members 并重新拉取，若这里存的是快照，抽屉里的 role 会停在旧值
  // —— 横幅不消失、开关不解除禁用，用户会以为「改了没生效」。
  const [permUserId, setPermUserId] = useState<string | null>(null);

  const { data: members, error: membersError } = useQuery({
    queryKey: ['org-members'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_org_members');
      if (error) throw error;
      return (data ?? []) as OrgMemberInfo[];
    },
  });

  // 主账号（owner）拥有全部权限，不参与权限配置
  const nonOwnerMembers = (members ?? []).filter(m => m.role !== 'owner');

  // 抽屉当前编辑的成员：由 permUserId 实时派生（理由见上方 useState 的注释）
  const permMember = nonOwnerMembers.find(m => m.user_id === permUserId) ?? null;

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

  // 成员权限：get_org_members() 只返回 user_id/email/role，没有权限字段，
  // 只能按成员逐个调 get_member_permissions。用一次 Promise.all 合并成单个查询，
  // 避免 N 个独立 useQuery 各自触发 loading。
  const memberIds = nonOwnerMembers.map(m => m.user_id).join(',');
  const { data: memberPerms, isLoading: permsLoading, error: permsError } = useQuery({
    queryKey: ['org-member-perms', memberIds],
    queryFn: async () => {
      const entries = await Promise.all(
        nonOwnerMembers.map(async (m) => {
          const { data, error } = await supabase.rpc('get_member_permissions', { p_user_id: m.user_id });
          if (error) throw error;
          const allowed = ((data ?? []) as MemberPermission[])
            .filter(p => p.allowed)
            .map(p => p.permission);
          return [m.user_id, allowed] as const;
        }),
      );
      return Object.fromEntries(entries) as Record<string, string[]>;
    },
    enabled: tab === 'perms' && nonOwnerMembers.length > 0,
  });

  const permsOf = (userId: string): string[] => memberPerms?.[userId] ?? [];

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
    onSuccess: () => {
      message.success('角色已更新');
      queryClient.invalidateQueries({ queryKey: ['org-members'] });
      // 角色一变，有效权限集合就变（管理员绕过全部开关），摘要要跟着刷新
      queryClient.invalidateQueries({ queryKey: ['org-member-perms'] });
    },
    onError: (err: Error) => message.error(err.message),
  });

  // 真正的权限开关：写 member_permissions 表。
  // ⚠️ 原实现把 7 个开关的 onChange 全接到了 roleMutation（改 admin/member），
  // 用户以为在配权限，实际在改角色 —— 这里改为写 set_member_permission。
  const permissionMutation = useMutation({
    mutationFn: async ({ userId, permission, allowed }: { userId: string; permission: Permission; allowed: boolean }) => {
      const { data, error } = await supabase.rpc('set_member_permission', {
        p_user_id: userId, p_permission: permission, p_allowed: allowed,
      });
      if (error) throw error;
      const result = data as { error?: string };
      if (result.error) throw new Error(result.error);
    },
    onSuccess: (_data, vars) => {
      message.success(vars.allowed ? '已授予权限' : '已收回权限');
      queryClient.invalidateQueries({ queryKey: ['org-member-perms'] });
    },
    onError: (err: Error) => message.error(err.message),
  });

  const handleCopy = async (text: string) => {
    try { await navigator.clipboard.writeText(text); setCopied(text); message.success('已复制'); setTimeout(() => setCopied(null), 2000); }
    catch { message.error('复制失败'); }
  };

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
                <ResponsiveTable dataSource={inviteCodes ?? []}
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
            // 原先是「邮箱 + 角色 + 7 个权限开关」共 9 列（scroll x=600），
            // 既挤又让开关语义混乱。现收敛为 4 列，权限细节放进抽屉。
            { key: 'perms', label: <span><SafetyOutlined /> 成员 ({nonOwnerMembers.length})</span>, children: (
              <div style={{ padding: '12px 20px 20px' }}>
                {membersError ? (
                  // 原先这里不分青红皂白：无论「真的没有子账号」还是「RPC 失败」，
                  // 都显示同一句「暂无子账号，生成邀请码邀请成员加入」——
                  // 把失败伪装成正常空态，用户会以为成员凭空消失了。现在如实报错。
                  <Alert type="error" showIcon style={{ borderRadius: 8 }}
                    message="成员列表加载失败"
                    description={`${membersError.message}。请刷新重试；若持续失败，请确认当前账号仍是该团队的主账号。`} />
                ) : nonOwnerMembers.length === 0 ? (
                  <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} style={{ padding: '28px 0' }}
                    description={<span style={{ color: '#94a3b8' }}>暂无子账号，生成邀请码邀请成员加入</span>} />
                ) : (
                  <ResponsiveTable dataSource={nonOwnerMembers} rowKey="user_id" pagination={false} loading={permsLoading}
                    columns={[
                      { title: '邮箱', dataIndex: 'email', key: 'email', onCell: () => ({ 'data-label': '邮箱' } as any), render: (v: string) => v || '-' },
                      { title: '角色', dataIndex: 'role', key: 'role', width: 130, onCell: () => ({ 'data-label': '角色' } as any),
                        render: (v: string, record: OrgMemberInfo) => (
                          <Select size="small" value={v} style={{ width: 110 }}
                            onChange={(val) => roleMutation.mutate({ userId: record.user_id, role: val })}
                            options={[{ label: '管理员', value: 'admin' }, { label: '普通账号', value: 'member' }]} />
                        ),
                      },
                      { title: '权限', key: 'perms', onCell: () => ({ 'data-label': '权限' } as any),
                        render: (_: unknown, record: OrgMemberInfo) => renderPermSummary(record, permsOf(record.user_id)),
                      },
                      // ⚠️ 这里原先是 `record.role === 'admin' ? <禁用按钮> : <正常按钮>`。
                      // 「管理员绕过全部开关」这个前提没错，但把入口直接禁用是错的：
                      // ① 解释只挂在 Tooltip 上，手机上根本没有 hover，用户只看到一个灰按钮，
                      //    完全不知道原因 —— 反馈就是「主账号不能给子账号勾选权限」；
                      // ② 历史遗留：更早的实现把 7 个权限开关全接到了 set_member_role，
                      //    勾一个开关 = 把成员提升成「管理员」。凡是被那样误操作过的成员，
                      //    角色就永久卡在 admin，而新 UI 又把按钮禁用，用户被彻底锁在门外。
                      // 现在按钮始终可点，进入抽屉后用**可见的横幅**解释原因并给出一键出口。
                      { title: '操作', key: 'actions', width: 108, onCell: () => ({ 'data-label': '操作' } as any),
                        render: (_: unknown, record: OrgMemberInfo) => (
                          <Button size="small" icon={<SettingOutlined />} onClick={() => setPermUserId(record.user_id)}>配置权限</Button>
                        ),
                      },
                    ]}
                  />
                )}
              </div>
            )},

            // ── LOGS ──
            { key: 'logs', label: <span><HistoryOutlined /> 日志</span>, children: (
              <div style={{ padding: '12px 20px 20px' }}>
                {logsLoading ? <div style={{ textAlign: 'center', padding: 40 }}><Spin /></div> : (
                  <ResponsiveTable dataSource={logs ?? []} rowKey="id" pagination={{ pageSize: 20 }}
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

      {/* ═══ 权限配置抽屉 ═══ */}
      <Drawer
        open={!!permMember}
        onClose={() => setPermUserId(null)}
        title="配置权限"
        placement="right"
        // antd 6 的 size 已接受任意 CSS 长度（内部 parseWidthHeight 对非纯数字字符串原样透传），
        // 不必再走 styles.wrapper 覆盖宽度。
        size="min(400px, 92vw)"
        styles={{ body: { padding: '16px 20px 24px' } }}
        destroyOnHidden
      >
        {permMember && (
          <>
            <div style={{ fontSize: 14, fontWeight: 600, wordBreak: 'break-all' }}>
              {permMember.email || permMember.user_id}
            </div>
            <div style={{ fontSize: 12, color: '#94a3b8', margin: '4px 0 12px' }}>
              勾选决定「能用哪些模块」；「角色」决定「能看、能改谁的数据」。
            </div>

            {/*
              「管理员」这一角色在 hasPerm() 里直接放行，逐项开关对他不起作用。
              但这件事必须**看得见**：原先只挂在按钮的 Tooltip 上，手机上无 hover，
              用户面对一个灰按钮完全无从下手。现在改成抽屉里的横幅 + 一键出口。
            */}
            {permMember.role === 'admin' && (
              <Alert
                type="warning"
                showIcon
                style={{ marginBottom: 12, borderRadius: 8 }}
                message="该成员是「管理员」，默认拥有全部模块"
                description={
                  <div style={{ fontSize: 12, lineHeight: 1.7 }}>
                    所以下面的开关对他不起作用，一律显示为已开启。若需要逐项勾选，
                    请先把他改为「普通账号」—— 角色只影响能看/改谁的数据，不影响模块的可用范围。
                    <Button
                      type="primary" size="small" style={{ marginTop: 8, display: 'block' }}
                      loading={roleMutation.isPending}
                      onClick={() => roleMutation.mutate({ userId: permMember.user_id, role: 'member' })}
                    >
                      改为「普通账号」并开始勾选
                    </Button>
                  </div>
                }
              />
            )}

            {/*
              权限读取失败时必须说出来。原先失败会被静默吞掉：memberPerms 变成 undefined，
              7 个开关全部显示为「未勾选」，用户勾一下、刷新、又变回未勾选 ——
              表现和「勾不动」一模一样，但根因在网络/接口层。
            */}
            {permsError && (
              <Alert
                type="error" showIcon style={{ marginBottom: 12, borderRadius: 8 }}
                message="权限读取失败"
                description={`${permsError.message}。下方开关显示的可能是过期状态，请先刷新页面。`}
              />
            )}

            {ALL_PERMISSIONS.map((p, i) => (
              <div key={p.key}>
                {i > 0 && <Divider style={{ margin: 0 }} />}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '13px 0' }}>
                  <span style={{ fontSize: 13 }}>{p.label}</span>
                  <Switch
                    size="small"
                    // 管理员：一律显示为已开启且不可点（他本来就全都有），
                    // 不能因为 member_permissions 里没有记录就显示成关闭 —— 那是在说谎。
                    checked={permMember.role === 'admin' ? true : permsOf(permMember.user_id).includes(p.key)}
                    disabled={permMember.role === 'admin'}
                    loading={permissionMutation.isPending && permissionMutation.variables?.permission === p.key}
                    onChange={(val) => permissionMutation.mutate({
                      userId: permMember.user_id,
                      permission: p.key,
                      allowed: val,
                    })}
                  />
                </div>
              </div>
            ))}
          </>
        )}
      </Drawer>
    </div>
  );
}
