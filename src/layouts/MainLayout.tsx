import { useState } from 'react';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import { Layout, Menu, Button, theme, Dropdown, Modal, Form, Input, message } from 'antd';
import type { MenuProps } from 'antd';
import {
  DashboardOutlined,
  TeamOutlined,
  ShoppingOutlined,
  DollarOutlined,
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
  const { user, signOut, orgInfo } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const { token: { colorBgContainer, borderRadiusLG } } = theme.useToken();

  const isMobile = window.innerWidth < 768;

  const selectedKey = '/' + location.pathname.split('/').filter(Boolean)[0] || '/';

  const displayName = (user?.user_metadata?.name as string) || user?.email;

  const isOwner = orgInfo?.role === 'owner';

  const menuItems: MenuProps['items'] = [
    { key: '/', icon: <DashboardOutlined />, label: '仪表盘' },
    { key: '/customers', icon: <TeamOutlined />, label: '客户管理' },
    { key: '/products', icon: <ShoppingOutlined />, label: '商品管理' },
    { key: '/finance', icon: <DollarOutlined />, label: '财务记账' },
    { key: '/accounts', icon: <AccountBookOutlined />, label: '科目管理' },
    { key: '/reports', icon: <BarChartOutlined />, label: '财务报表' },
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

  const userSubtitle = isOwner ? '主账号' : '子账号';

  const userMenuItems: MenuProps['items'] = [
    { key: 'name', label: (
      <div>
        <div style={{ fontWeight: 500 }}>{displayName}</div>
        <div style={{ fontSize: 12, color: '#999' }}>{userSubtitle} · {orgInfo?.org_name}</div>
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
