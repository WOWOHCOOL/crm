import { useState } from 'react';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import { Layout, Menu, Button, theme, Dropdown, Modal, Form, Input, message } from 'antd';
import type { MenuProps } from 'antd';
import {
  DashboardOutlined,
  TeamOutlined,
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
    if (p.startsWith('/customers') || p.startsWith('/quotations') || p.startsWith('/tasks')) groups.push('customers-group');
    if (p.startsWith('/products') || p.startsWith('/suppliers') || p.startsWith('/purchases')) groups.push('supplier-group');
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
    ...(hasPerm('customers') ? [{
      key: 'customers-group', icon: <TeamOutlined />, label: '客户管理',
      children: [
        { key: '/customers', label: '客户列表' },
        ...(hasPerm('tasks') ? [{ key: '/tasks', label: '任务跟进' }] : []),
        { key: '/quotations/quo', label: '报价单 (QUO)' },
        { key: '/quotations/pi', label: 'PI管理 (PI)' },
      ],
    }] : []),
    ...(hasPerm('products') ? [{
      key: 'supplier-group', icon: <ShopOutlined />, label: '供应商管理',
      children: [
        { key: '/products', label: '商品管理' },
        { key: '/suppliers', label: '供应商资料' },
        { key: '/purchases', label: '采购订单' },
      ],
    }] : []),
    { key: '/finance', icon: <DollarOutlined />, label: '财务记账', style: hasPerm('finance') ? {} : { display: 'none' } },
    { key: '/accounts', icon: <AccountBookOutlined />, label: '科目管理', style: hasPerm('accounts') ? {} : { display: 'none' } },
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
    <Layout style={{ minHeight: '100vh' }}>
      <Sider trigger={null} collapsible collapsed={collapsed} breakpoint="lg"
        onBreakpoint={(broken) => setCollapsed(broken)}
      >
        <div style={{
          margin: 16,
          padding: 8,
          background: 'rgba(255,255,255,0.95)',
          borderRadius: 8,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}>
          <img
            src="/logo.webp"
            alt="WowohCool CRM"
            style={{
              height: collapsed ? 28 : 36,
              maxWidth: collapsed ? 40 : 150,
              objectFit: 'contain',
            }}
          />
        </div>
        <Menu
          theme="dark"
          mode="inline"
          selectedKeys={[selectedKey]}
          items={menuItems}
          openKeys={openKeys}
          onOpenChange={setOpenKeys}
          onClick={({ key }) => navigate(key)}
        />
      </Sider>
      <Layout>
        <Header style={{
          padding: '0 24px',
          background: colorBgContainer,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}>
          <Button
            type="text"
            icon={collapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
            onClick={() => setCollapsed(!collapsed)}
          />
          <Dropdown menu={{ items: userMenuItems }} placement="bottomRight">
            <Button type="text" icon={<UserOutlined />}>
              {displayName}
            </Button>
          </Dropdown>
        </Header>
        <Content style={{
          margin: isMobile ? 8 : 24,
          padding: isMobile ? 12 : 24,
          background: colorBgContainer,
          borderRadius: borderRadiusLG,
          minHeight: 280,
          overflow: 'auto',
        }}>
          <Outlet />
        </Content>
        <Footer style={{ textAlign: 'center', color: '#999', fontSize: 13 }}>
          &copy; snowy {new Date().getFullYear()} WowohCool CRM
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
