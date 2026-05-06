import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, Form, Input, Button, message, Tabs } from 'antd';
import { MailOutlined, LockOutlined, UserOutlined, WarningOutlined } from '@ant-design/icons';
import { useAuth } from './AuthContext';
import { isConfigured } from '../supabase';

export default function LoginPage() {
  const { signIn, signUp } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [tab, setTab] = useState<'login' | 'register'>('login');

  const handleSubmit = async (values: { email: string; password: string; name?: string }) => {
    setLoading(true);
    const result = tab === 'login'
      ? await signIn(values.email, values.password)
      : await signUp(values.email, values.password, values.name);

    setLoading(false);

    if (result.error) {
      message.error(result.error);
      return;
    }

    if (tab === 'register') {
      message.success('注册成功！请查收邮箱中的确认链接完成激活。');
      setTab('login');
    } else {
      navigate('/');
    }
  };

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center',
      background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
    }}>
      <Card style={{ width: 400, boxShadow: '0 8px 24px rgba(0,0,0,0.15)' }}>
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <img src="/logo.webp" alt="WowohCool" style={{ height: 48, marginBottom: 12 }} />
          <p style={{ margin: 0, color: '#888', fontSize: 14 }}>
            {tab === 'register' ? '创建账号，开启客户管理之旅' : '一站式外贸客户与业务管理平台'}
          </p>
        </div>
        {!isConfigured && (
          <div style={{
            background: '#fff2f0',
            border: '1px solid #ffccc7',
            borderRadius: 6,
            padding: 12,
            marginBottom: 16,
            color: '#ff4d4f',
            fontSize: 14,
          }}>
            <WarningOutlined style={{ marginRight: 8 }} />
            系统未配置数据库连接，请设置 VITE_SUPABASE_URL 和 VITE_SUPABASE_ANON_KEY 环境变量后重新构建
          </div>
        )}
        <Tabs activeKey={tab} onChange={(k) => setTab(k as 'login' | 'register')} centered
          items={[
            { key: 'login', label: '登录' },
            { key: 'register', label: '注册' },
          ]}
        />
        <Form onFinish={handleSubmit} size="large">
          {tab === 'register' && (
            <Form.Item name="name" rules={[
              { required: true, message: '请输入您的姓名' },
            ]}>
              <Input prefix={<UserOutlined />} placeholder="姓名 / 昵称" />
            </Form.Item>
          )}
          <Form.Item name="email" rules={[
            { required: true, message: '请输入邮箱' },
            { type: 'email', message: '邮箱格式不正确' },
          ]}>
            <Input prefix={<MailOutlined />} placeholder="邮箱" />
          </Form.Item>
          <Form.Item name="password" rules={[
            { required: true, message: '请输入密码' },
            { min: 6, message: '密码至少6位' },
          ]}>
            <Input.Password prefix={<LockOutlined />} placeholder="密码" />
          </Form.Item>
          <Form.Item>
            <Button type="primary" htmlType="submit" loading={loading} block>
              {tab === 'login' ? '登录' : '注册'}
            </Button>
          </Form.Item>
        </Form>
      </Card>
    </div>
  );
}
