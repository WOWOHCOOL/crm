import { useState } from 'react';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import { Layout, Menu, Button, Drawer, Dropdown, Modal, Form, Input, message } from 'antd';
import type { MenuProps } from 'antd';
import {
  DashboardOutlined,
  FunnelPlotOutlined,
  TeamOutlined,
  CarryOutOutlined,
  AccountBookOutlined,
  ShopOutlined,
  BarChartOutlined,
  MenuFoldOutlined,
  MenuUnfoldOutlined,
  UserOutlined,
  LogoutOutlined,
  KeyOutlined,
  LockOutlined,
  SettingOutlined,
  AppstoreOutlined,
} from '@ant-design/icons';
import { useResponsive } from '../hooks/useResponsive';
import { useAuth } from '../auth/AuthContext';
import RouteGuard from '../auth/RouteGuard';
import { supabase } from '../supabase';
import { lazyPrefetch } from '../utils/lazyRoutes';

const { Header, Sider, Content, Footer } = Layout;

/**
 * 意向等级的圆点标记。
 * 原先用 emoji（🔴🟠⚪）作菜单图标，存在三个问题：
 *   1. emoji 由系统字体渲染，各平台大小/基线不一致，菜单行高会被撑得参差
 *   2. 无法跟随主题色，深色侧边栏下观感尤其突兀
 *   3. 语义上"红点"易被误读为未读提醒，而非"意向等级"
 * 改为统一尺寸的色点，与 intentionMap 的颜色一一对应。
 */
const IntentionDot = ({ color }: { color: string }) => (
  <span
    style={{
      display: 'inline-block',
      width: 7,
      height: 7,
      borderRadius: '50%',
      background: color,
      boxShadow: `0 0 0 2px ${color}22`,
    }}
  />
);

const bottomNavItems = [
  { key: '/', icon: <DashboardOutlined />, label: '总览' },
  { key: '/customers', icon: <TeamOutlined />, label: '客户' },
  { key: '/tasks', icon: <CarryOutOutlined />, label: '任务' },
  { key: '/finance', icon: <AccountBookOutlined />, label: '财务' },
  { key: '__more__', icon: <AppstoreOutlined />, label: '更多' },
];

/**
 * 由当前路径推导侧边栏高亮项。
 * 必须与 menuItems 的 key 严格一一对应，否则会出现"当前页面无高亮"。
 * 旧实现用一连串 if 就地改写，且遗漏了 /quotations（无子路径）与
 * /inquiries 带其它 query 参数的情况。
 */
function resolveSelectedKey(pathname: string, search: string): string {
  const [seg0, seg1] = pathname.split('/').filter(Boolean);
  if (seg0 === 'inquiries') {
    const intention = new URLSearchParams(search).get('intention');
    return intention ? `/inquiries?intention=${intention}` : '/inquiries';
  }
  if (seg0 === 'quotations') return seg1 === 'pi' ? '/quotations/pi' : '/quotations/quo';
  if (seg0 === 'purchases') return '/purchases';
  return '/' + (seg0 || '');
}

/** 当前路径所属的菜单分组（用于侧边栏默认展开） */
function resolveOpenKeys(pathname: string): string[] {
  const seg0 = pathname.split('/').filter(Boolean)[0] || '';
  const groups: string[] = [];
  if (seg0 === 'inquiries') groups.push('inquiries-group');
  if (['customers', 'orders', 'quotations', 'tasks'].includes(seg0)) groups.push('customers-group');
  if (['products', 'suppliers', 'purchases'].includes(seg0)) groups.push('supplier-group');
  if (['finance', 'accounts'].includes(seg0)) groups.push('finance-group');
  return groups;
}

export default function MainLayout() {
  const [collapsed, setCollapsed] = useState(() => window.innerWidth < 1200);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [passwordModalOpen, setPasswordModalOpen] = useState(false);
  const [passwordLoading, setPasswordLoading] = useState(false);
  const [passwordForm] = Form.useForm();
  const { user, signOut, orgInfo, isOwner, hasPerm } = useAuth();
  const { isMobile } = useResponsive();
  const navigate = useNavigate();
  const location = useLocation();
  const [openKeys, setOpenKeys] = useState<string[]>(() => resolveOpenKeys(location.pathname));

  const selectedKey = resolveSelectedKey(location.pathname, location.search);

  const displayName = (user?.user_metadata?.name as string) || user?.email;
  // hasPerm 统一由 AuthContext 提供（主账号/管理员放行 + permissions 数组）

  const menuItems: MenuProps['items'] = [
    { key: '/', icon: <DashboardOutlined />, label: '仪表盘' },
    ...(hasPerm('tasks') ? [{ key: '/tasks', icon: <CarryOutOutlined />, label: '任务跟进' }] : []),
    ...(hasPerm('customers') ? [{
      key: 'inquiries-group', icon: <FunnelPlotOutlined />, label: '询盘线索',
      children: [
        { key: '/inquiries', label: '全部线索' },
        { key: '/inquiries?intention=high', icon: <IntentionDot color="#ff4d4f" />, label: '重点意向' },
        { key: '/inquiries?intention=normal', icon: <IntentionDot color="#fa8c16" />, label: '一般意向' },
        { key: '/inquiries?intention=low', icon: <IntentionDot color="#bfbfbf" />, label: '意向较弱' },
      ],
    }] : []),
    // 报价单/PI 在 ALL_PERMISSIONS 里是独立的 quotations 权限。
    // 原先无条件挂在 customers 组下，导致 quotations 配了也没用、
    // 而只给 customers 的人反而能进报价单 —— 现按各自权限分别控制。
    ...((hasPerm('customers') || hasPerm('quotations')) ? [{
      key: 'customers-group', icon: <TeamOutlined />, label: '客户管理',
      children: [
        ...(hasPerm('customers') ? [
          { key: '/customers', label: '客户列表' },
          // 原为「采购订单（PO）」，实为客户的销售订单（orders 表含 customer_id / pi_number），
          // 与供应商侧的「采购单」重名易混淆，故更名。
          { key: '/orders', label: '销售订单' },
        ] : []),
        ...(hasPerm('quotations') ? [
          { key: '/quotations/quo', label: '报价单 (QUO)' },
          { key: '/quotations/pi', label: '形式发票 (PI)' },
        ] : []),
      ],
    }] : []),
    ...(hasPerm('products') ? [{
      key: 'supplier-group', icon: <ShopOutlined />, label: '供应商管理',
      children: [
        { key: '/products', label: '商品管理' },
        { key: '/suppliers', label: '供应商资料' },
        { key: '/purchases', label: '采购单' },
      ],
    }] : []),
    ...((hasPerm('finance') || hasPerm('accounts')) ? [{
      key: 'finance-group', icon: <AccountBookOutlined />, label: '财务管理',
      children: [
        ...(hasPerm('finance') ? [{ key: '/finance', label: '财务记账' }] : []),
        ...(hasPerm('accounts') ? [{ key: '/accounts', label: '科目管理' }] : []),
      ],
    }] : []),
    // 原先用 style:{display:'none'} 隐藏无权限项，会留下一个不可点击的占位节点，
    // 改为按权限决定是否生成该菜单项。
    ...(hasPerm('reports') ? [{ key: '/reports', icon: <BarChartOutlined />, label: '财务报表' }] : []),
    ...(isOwner ? [{ key: '/org', icon: <SettingOutlined />, label: '团队管理' }] : []),
  ];

  const handleChangePassword = async (values: { newPassword: string }) => {
    setPasswordLoading(true);
    const { error } = await supabase.auth.updateUser({ password: values.newPassword });
    setPasswordLoading(false);
    if (error) {
      message.error(error.message);
      return;
    }
    message.success('密码修改成功');
    setPasswordModalOpen(false);
    passwordForm.resetFields();
  };

  const roleLabel = isOwner ? '主账号' : '';

  const userMenuItems: MenuProps['items'] = [
    { key: 'name', label: (
      <div>
        <div style={{ fontWeight: 500 }}>{displayName}</div>
        <div style={{ fontSize: 12, color: '#999' }}>{roleLabel ? `${roleLabel} · ` : ''}{orgInfo?.org_name}</div>
      </div>
    ), disabled: true },
    { type: 'divider' },
    {
      key: 'changePassword',
      icon: <KeyOutlined />,
      label: '修改密码',
      onClick: () => setPasswordModalOpen(true),
    },
    ...(isOwner ? [{
      key: 'orgManage',
      icon: <SettingOutlined />,
      label: '团队管理',
      onClick: () => navigate('/org'),
    }] : []),
    { type: 'divider' },
    {
      key: 'logout',
      icon: <LogoutOutlined />,
      label: '退出登录',
      onClick: async () => {
        await signOut();
        navigate('/login');
      },
    },
  ];

  const isActive = (path: string) => {
    if (path === '/') return location.pathname === '/';
    return location.pathname.startsWith(path);
  };

  return (
    <Layout style={{ minHeight: '100vh' }}>
      {/* Desktop Sidebar */}
      {!isMobile && (
        <Sider trigger={null} collapsible collapsed={collapsed} breakpoint="lg"
          onBreakpoint={(broken) => setCollapsed(broken)}
        >
          <div style={{
            margin: 16, padding: 8,
            background: 'rgba(255,255,255,0.95)',
            borderRadius: 8, display: 'flex',
            alignItems: 'center', justifyContent: 'center',
          }}>
            <img src="/logo.webp" alt="WowohCool CRM"
              style={{
                height: collapsed ? 28 : 36,
                maxWidth: collapsed ? 40 : 150,
                objectFit: 'contain',
              }}
            />
          </div>
          <Menu theme="dark" mode="inline"
            selectedKeys={[selectedKey]}
            items={menuItems}
            openKeys={openKeys}
            onOpenChange={setOpenKeys}
            onClick={({ key }) => { lazyPrefetch(key); navigate(key); }}
          />
        </Sider>
      )}

      <Layout>
        <Header style={{
          padding: '0 16px',
          background: '#fff',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          position: 'sticky', top: 0, zIndex: 50,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {isMobile ? (
              <Button type="text" icon={<MenuUnfoldOutlined />}
                onClick={() => setDrawerOpen(true)}
              />
            ) : (
              <Button type="text"
                icon={collapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
                onClick={() => setCollapsed(!collapsed)}
              />
            )}
          </div>
          <Dropdown menu={{ items: userMenuItems }} placement="bottomRight">
            <Button type="text" icon={<UserOutlined />}>
              {!isMobile && <span style={{ marginLeft: 4 }}>{displayName}</span>}
            </Button>
          </Dropdown>
        </Header>

        <Content style={{
          margin: isMobile ? 8 : 24,
          padding: isMobile ? 8 : 24,
          background: '#fff',
          borderRadius: 8,
          minHeight: 280,
          overflow: isMobile ? 'hidden auto' : 'auto',
          overflowX: 'hidden',
          paddingBottom: isMobile ? 72 : 24, /* space for bottom nav */
        }}>
          {/* 路由级权限校验：与侧边栏菜单使用同一套权限映射，
              避免「菜单里没有、敲 URL 却能进」 */}
          <RouteGuard>
            <Outlet />
          </RouteGuard>
        </Content>

        <Footer style={{ textAlign: 'center', color: '#999', fontSize: 13 }}>
          &copy; {new Date().getFullYear()} WowohCool CRM
        </Footer>
      </Layout>

      {/* Mobile Bottom Navigation */}
      {isMobile && (
        <nav style={{
          position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 100,
          background: '#fff', borderTop: '1px solid #f0f0f0',
          display: 'flex', height: 56,
          paddingBottom: 'env(safe-area-inset-bottom, 0)',
        }}>
          {bottomNavItems.map(item => {
            const active = item.key === '__more__' ? drawerOpen : isActive(item.key);
            return (
              <div key={item.key}
                onClick={() => {
                  if (item.key === '__more__') { setDrawerOpen(true); return; }
                  lazyPrefetch(item.key);
                  navigate(item.key);
                }}
                style={{
                  flex: 1, display: 'flex', flexDirection: 'column',
                  alignItems: 'center', justifyContent: 'center',
                  gap: 2, cursor: 'pointer', fontSize: 10,
                  color: active ? '#1677ff' : '#999',
                  borderTop: active ? '2px solid #1677ff' : '2px solid transparent',
                  padding: '4px 0',
                }}
              >
                <span style={{ fontSize: 18, lineHeight: 1 }}>{item.icon}</span>
                <span>{item.label}</span>
              </div>
            );
          })}
        </nav>
      )}

      {/* Mobile Drawer */}
      <Drawer
        placement="left"
        onClose={() => setDrawerOpen(false)}
        open={isMobile && drawerOpen}
        // antd 6 弃用了 width，且 size 只接受 default(378)/large(736)，
        // 都会超出 390px 视口，故改用 styles.wrapper 精确控制。
        styles={{ body: { padding: 0 }, wrapper: { width: 'min(280px, 82vw)' } }}
        closeIcon={null}
      >
        <div style={{ padding: '18px 16px', textAlign: 'center', borderBottom: '1px solid #f0f0f0' }}>
          <img src="/logo.webp" alt="WowohCool CRM" style={{ height: 34, objectFit: 'contain' }} />
        </div>
        <Menu mode="inline"
          selectedKeys={[selectedKey]}
          items={menuItems}
          openKeys={openKeys}
          onOpenChange={setOpenKeys}
          onClick={({ key }) => { lazyPrefetch(key); navigate(key); setDrawerOpen(false); }}
          style={{ borderRight: 'none', fontSize: 14 }}
        />
      </Drawer>

      {/* Password Modal */}
      <Modal title="修改密码" open={passwordModalOpen}
        onCancel={() => { setPasswordModalOpen(false); passwordForm.resetFields(); }}
        onOk={() => passwordForm.submit()}
        confirmLoading={passwordLoading} destroyOnHidden
      >
        <Form form={passwordForm} layout="vertical" onFinish={handleChangePassword}>
          <Form.Item name="newPassword" label="新密码" rules={[
            { required: true, message: '请输入新密码' },
            { min: 6, message: '密码至少6位' },
          ]}>
            <Input.Password prefix={<LockOutlined />} placeholder="至少6位的新密码" />
          </Form.Item>
          <Form.Item name="confirmPassword" label="确认密码" dependencies={['newPassword']}
            rules={[
              { required: true, message: '请再次输入新密码' },
              ({ getFieldValue }) => ({
                validator(_, value) {
                  if (!value || getFieldValue('newPassword') === value) return Promise.resolve();
                  return Promise.reject(new Error('两次输入的密码不一致'));
                },
              }),
            ]}
          >
            <Input.Password prefix={<LockOutlined />} placeholder="再次输入新密码" />
          </Form.Item>
        </Form>
      </Modal>
    </Layout>
  );
}
