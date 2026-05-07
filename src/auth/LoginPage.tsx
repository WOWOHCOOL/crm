import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, Form, Input, Button, message, Tabs } from 'antd';
import { MailOutlined, LockOutlined, UserOutlined, WarningOutlined, KeyOutlined } from '@ant-design/icons';
import { useAuth } from './AuthContext';
import { isConfigured, supabase } from '../supabase';

export default function LoginPage() {
  const { signIn, signUp } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [tab, setTab] = useState<'login' | 'register'>('login');
  const [regForm] = Form.useForm();

  const handleLogin = async (values: { email: string; password: string }) => {
    setLoading(true);
    const result = await signIn(values.email, values.password);
    setLoading(false);
    if (result.error) {
      message.error(result.error);
      return;
    }
    navigate('/');
  };

  const handleRegister = async (values: { email: string; password: string; name: string; invite_code: string }) => {
    setLoading(true);

    // 先校验邀请码有效性
    const { data: validData, error: validError } = await supabase.rpc('validate_invite_code', {
      code_to_check: values.invite_code.toUpperCase(),
    });
    if (validError) {
      setLoading(false);
      message.error('校验邀请码失败，请重试');
      return;
    }
    const validResult = validData as { valid: boolean; error?: string };
    if (!validResult.valid) {
      setLoading(false);
      message.error(validResult.error || '邀请码无效或已使用');
      return;
    }

    // 执行注册
    const result = await signUp(values.email, values.password, values.name, values.invite_code);
    setLoading(false);
    if (result.error) {
      // 判断是否为数据库触发器拦截的注册
      if (result.error.includes('registration_blocked')) {
        message.error('邀请码无效或已被使用');
      } else {
        message.error(result.error);
      }
      return;
    }

    message.success('注册成功！请查收邮箱中的确认链接完成激活。');
    regForm.resetFields();
    setTab('login');
  };

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center',
      background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
    }}>
      <Card style={{ width: 420, boxShadow: '0 8px 24px rgba(0,0,0,0.15)' }}>
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <img src="/logo.webp" alt="WowohCool" style={{ height: 48, marginBottom: 12 }} />
          <p style={{ margin: 0, color: '#888', fontSize: 14 }}>
            {tab === 'register' ? '输入邀请码注册新账号' : '一站式外贸客户与业务管理平台'}
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

        {tab === 'login' ? (
          <Form onFinish={handleLogin} size="large">
            <Form.Item name="email" rules={[
              { required: true, message: '请输入邮箱' },
              { type: 'email', message: '邮箱格式不正确' },
            ]}>
              <Input prefix={<MailOutlined />} placeholder="邮箱" />
            </Form.Item>
            <Form.Item name="password" rules={[
              { required: true, message: '请输入密码' },
            ]}>
              <Input.Password prefix={<LockOutlined />} placeholder="密码" />
            </Form.Item>
            <Form.Item>
              <Button type="primary" htmlType="submit" loading={loading} block>
                登录
              </Button>
            </Form.Item>
          </Form>
        ) : (
          <Form form={regForm} onFinish={handleRegister} size="large">
            <Form.Item name="invite_code" label="邀请码"
              rules={[
                { required: true, message: '请输入邀请码' },
                { min: 5, message: '邀请码格式不正确' },
              ]}
              style={{ marginBottom: 8 }}
            >
              <Input
                prefix={<KeyOutlined />}
                placeholder="请联系管理员获取邀请码"
                style={{ textTransform: 'uppercase' }}
                onChange={(e) => {
                  const val = e.target.value.toUpperCase().replace(/[^A-Z0-9-]/g, '');
                  regForm.setFieldsValue({ invite_code: val });
                }}
              />
            </Form.Item>
            <div style={{ fontSize: 12, color: '#999', marginBottom: 16 }}>
              * 注册需要有效的邀请码，请联系团队管理员获取
            </div>
            <Form.Item name="name" rules={[
              { required: true, message: '请输入您的姓名' },
            ]}>
              <Input prefix={<UserOutlined />} placeholder="姓名 / 昵称" />
            </Form.Item>
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
                注册
              </Button>
            </Form.Item>
          </Form>
        )}
      </Card>
    </div>
  );
}
