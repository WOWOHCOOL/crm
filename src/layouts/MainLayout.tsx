import { useState } from 'react';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import { Layout, Menu, Button, theme, Dropdown, Modal, Form, Input, message } from 'antd';
import type { MenuProps } from 'antd';
import {
  DashboardOutlined,
  TeamOutlined,
  BellOutlined,
  DollarOutlined,
  ShopOutlined,
  AccountBookOutlined,
  BarChartOutlined,
  MenuFoldOutlined,
  MenuUnfoldOutlined,
  UserOutlined,
  LogoutOutlined,
  KeyOutlined,
  LockOutlined,
  SettingOutlined,
} from '@ant-design/icons';
import { useAuth } from '../auth/AuthContext';
import { supabase } from '../supabase';

const { Header, Sider, Content, Footer } = Layout;

export default function MainLayout() {
  const [collapsed, setCollapsed] = useState(window.innerWidth < 768);
  const [passwordModalOpen, setPasswordModalOpen] = useState(false);
  const [passwordLoading, setPasswordLoading] = useState(false);
  const [passwordForm] = Form.useForm();
  const { user, signOut, orgInfo, permissions, isOwner, isAdmin } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [openKeys, setOpenKeys] = useState<string[]>(() => {
    const p = location.pathname;
    const groups: string[] = [];
    if (p.startsWith('/customers') || p.startsWith('/orders') || p.startsWith('/quotations') || p.startsWith('/tasks')) groups.push('customers-group');
    if (p.startsWith('/products') || p.startsWith('/suppliers') || p.startsWith('/purchases')) groups.push('supplier-group');
    if (p.startsWith('/finance') || p.startsWith('/accounts')) groups.push('finance-group');
    return groups;
  });
  const { token: { colorBgContainer, borderRadiusLG } } = theme.useToken();

  const isMobile = window.innerWidth < 768;

  const pathParts = location.pathname.split('/').filter(Boolean);
  let selectedKey = '/' + (pathParts[0] || '');
  if (pathParts.length >= 2 && pathParts[0] === 'purchases') selectedKey = '/purchases';
  if (pathParts.length >= 2 && pathParts[0] === 'quotations') selectedKey = '/' + pathParts.slice(0, 2).join('/');

  const displayName = (user?.user_metadata?.name as string) || user?.email;

  const hasPerm = (k: string) => isOwner || isAdmin || permissions.includes(k as never);

  const menuItems: MenuProps['items'] = [
    { key: '/', icon: <DashboardOutlined />, label: '仪表盘' },
    ...(hasPerm('tasks') ? [{ key: '/tasks', icon: <BellOutlined />, label: '任务跟进' }] : []),
    ...(hasPerm('customers') ? [{
      key: 'customers-group', icon: <TeamOutlined />, label: '客户管理',
      children: [
        { key: '/customers', label: '客户列表' },
        { key: '/orders', label: '采购订单（PO）' },
        { key: '/quotations/quo', label: '报价单 (QUO)' },
        { key: '/quotations/pi', label: '形式发票（PI）' },
      ],
    }] : []),
    ...(hasPerm('products') ? [{
      key: 'supplier-group', icon: <ShopOutlined />, label: '供应商管理',
      children: [
        { key: '/products', label: '商品管理' },
        { key: '/suppliers', label: '供应商资料' },
        { key: '/purchases', label: '供应商采购单' },
      ],
    }] : []),
    ...((hasPerm('finance') || hasPerm('accounts')) ? [{
      key: 'finance-group', icon: <DollarOutlined />, label: '财务管理',
      children: [
        ...(hasPerm('finance') ? [{ key: '/finance', label: '财务记账' }] : []),
        ...(hasPerm('accounts') ? [{ key: '/accounts', label: '科目管理' }] : []),
      ],
    }] : []),
    { key: '/reports', icon: <BarChartOutlined />, label: '财务报表', style: hasPerm('reports') ? {} : { display: 'none' } },
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

  return (
    <Layout style={{ minHeight: '100vh', background: '#f8f9fb' }}>
      <Sider trigger={null} collapsible collapsed={collapsed} breakpoint="lg"
        onBreakpoint={(broken) => setCollapsed(broken)}
        style={{
          background: '#0f172a',
          borderRight: '1px solid rgba(255,255,255,0.06)',
        }}
      >
        <div style={{
          margin: 16,
          padding: collapsed ? '10px 0' : '12px 16px',
          background: 'rgba(255,255,255,0.04)',
          borderRadius: 10,
          display: 'flex',
          alignItems: 'center',
          justifyContent: collapsed ? 'center' : 'flex-start',
          gap: 10,
          border: '1px solid rgba(255,255,255,0.06)',
        }}>
          <img
            src="/logo.webp"
            alt="WowohCool CRM"
            style={{
              height: collapsed ? 26 : 32,
              maxWidth: collapsed ? 26 : 120,
              objectFit: 'contain',
              filter: 'brightness(0) invert(1)',
            }}
          />
          {!collapsed && <span style={{ color: '#ff6b00', fontWeight: 700, fontSize: 15 }}>WOWOHCOOL</span>}
        </div>
        <Menu
          theme="dark"
          mode="inline"
          selectedKeys={[selectedKey]}
          items={menuItems}
          openKeys={openKeys}
          onOpenChange={setOpenKeys}
          onClick={({ key }) => navigate(key)}
          style={{ background: 'transparent', borderInlineEnd: 'none', padding: '4px 0' }}
        />
      </Sider>
      <Layout style={{ background: '#f8f9fb' }}>
        <Header style={{
          padding: '0 24px',
          background: '#ffffff',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          borderBottom: '1px solid #e8eaef',
          boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
          height: 56,
          lineHeight: '56px',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <Button
              type="text"
              icon={collapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
              onClick={() => setCollapsed(!collapsed)}
              style={{ fontSize: 16, color: '#64748b' }}
            />
          </div>
          <Dropdown menu={{ items: userMenuItems }} placement="bottomRight">
            <Button type="text" icon={<UserOutlined style={{ color: '#ff6b00' }} />}
              style={{ fontWeight: 500, color: '#1e293b', borderRadius: 8 }}>
              {displayName}
            </Button>
          </Dropdown>
        </Header>
        <Content style={{
          margin: 20,
          padding: 0,
          minHeight: 280,
        }}>
          <Outlet />
        </Content>
        <Footer style={{ textAlign: 'center', color: '#94a3b8', fontSize: 12, padding: '12px 24px', background: '#f8f9fb' }}>
          &copy; {new Date().getFullYear()} WOWOHCOOL CRM
        </Footer>
      </Layout>

      <Modal
        title="修改密码"
        open={passwordModalOpen}
        onCancel={() => { setPasswordModalOpen(false); passwordForm.resetFields(); }}
        onOk={() => passwordForm.submit()}
        confirmLoading={passwordLoading}
        destroyOnClose
      >
        <Form form={passwordForm} layout="vertical" onFinish={handleChangePassword}>
          <Form.Item name="newPassword" label="新密码" rules={[
            { required: true, message: '请输入新密码' },
            { min: 6, message: '密码至少6位' },
          ]}>
            <Input.Password prefix={<LockOutlined />} placeholder="请输入至少6位的新密码" />
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
            <Input.Password prefix={<LockOutlined />} placeholder="请再次输入新密码" />
          </Form.Item>
        </Form>
      </Modal>
    </Layout>
  );
}
