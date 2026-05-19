import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, Form, Input, Button, message, Tabs, Steps, Checkbox, Spin } from 'antd';
import { MailOutlined, LockOutlined, UserOutlined, WarningOutlined, KeyOutlined, CheckCircleOutlined } from '@ant-design/icons';
import { useAuth } from './AuthContext';
import { isConfigured, supabase } from '../supabase';

const REMEMBER_KEY = 'crm_remember';
const PASS_KEY = 'crm_remember_pass';

function loadRemembered(): { email: string; password: string; remember: boolean } {
  try {
    const raw = localStorage.getItem(REMEMBER_KEY);
    if (raw) return JSON.parse(raw);
  } catch { /* ignore */ }
  return { email: '', password: '', remember: false };
}

function saveRemembered(email: string, password: string, remember: boolean) {
  if (remember) {
    localStorage.setItem(REMEMBER_KEY, JSON.stringify({ email, password: btoa(password), remember }));
  } else {
    localStorage.removeItem(REMEMBER_KEY);
  }
}

export default function LoginPage() {
  const { signIn, signUp } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(true);
  const [tab, setTab] = useState<'login' | 'register'>('login');
  const [step, setStep] = useState<'invite' | 'register'>('invite');
  const [validInvite, setValidInvite] = useState<{ code: string } | null>(null);
  const [regForm] = Form.useForm();
  const [remember, setRemember] = useState(() => loadRemembered().remember);
  const [loginForm] = Form.useForm();

  // Auto-fill remembered credentials
  useEffect(() => {
    const saved = loadRemembered();
    if (saved.email) {
      loginForm.setFieldsValue({
        email: saved.email,
        password: saved.password ? atob(saved.password) : '',
      });
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Check for existing session and auto-login
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        navigate('/', { replace: true });
      } else {
        setChecking(false);
      }
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  if (checking) {
    return (
      <div style={{ height: '100vh', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
        <Spin size="large" tip="检查登录状态..." />
      </div>
    );
  }

  const handleLogin = async (values: { email: string; password: string }) => {
    setLoading(true);
    saveRemembered(values.email, values.password, remember);
    const result = await signIn(values.email, values.password);
    setLoading(false);
    if (result.error) {
      message.error(result.error);
      return;
    }
    navigate('/');
  };

  const handleVerifyInvite = async (values: { invite_code: string }) => {
    setLoading(true);
    const code = values.invite_code.toUpperCase().replace(/[^A-Z0-9-]/g, '');
    const { data, error } = await supabase.rpc('validate_invite_code', {
      code_to_check: code,
    });
    setLoading(false);
    if (error) {
      message.error('验证失败，请重试');
      return;
    }
    const result = data as { valid: boolean; error?: string };
    if (!result.valid) {
      message.error(result.error || '邀请码无效或已使用');
      return;
    }
    setValidInvite({ code });
    setStep('register');
  };

  const handleRegister = async (values: { email: string; password: string; name: string }) => {
    if (!validInvite) return;
    setLoading(true);
    const result = await signUp(values.email, values.password, values.name, validInvite.code);
    setLoading(false);
    if (result.error) {
      if (result.error.includes('registration_blocked')) {
        message.error('邀请码无效或已被使用');
      } else {
        message.error(result.error);
      }
      return;
    }
    message.success('注册成功！请查收邮箱中的确认链接完成激活。');
    regForm.resetFields();
    setStep('invite');
    setValidInvite(null);
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
            {tab === 'register'
              ? '需要有效的邀请码才能注册'
              : '一站式外贸客户与业务管理平台'}
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
            系统未配置数据库连接
          </div>
        )}
        <Tabs activeKey={tab} onChange={(k) => {
          setTab(k as 'login' | 'register');
          setStep('invite');
          setValidInvite(null);
        }} centered
          items={[
            { key: 'login', label: '登录' },
            { key: 'register', label: '注册' },
          ]}
        />

        {tab === 'login' ? (
          <Form form={loginForm} onFinish={handleLogin} size="large">
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
              <Checkbox checked={remember} onChange={(e) => setRemember(e.target.checked)}>
                记住密码
              </Checkbox>
            </Form.Item>
            <Form.Item>
              <Button type="primary" htmlType="submit" loading={loading} block>
                登录
              </Button>
            </Form.Item>
          </Form>
        ) : (
          <>
            <Steps
              size="small"
              current={step === 'invite' ? 0 : 1}
              style={{ marginBottom: 24 }}
              items={[
                { title: '验证邀请码', icon: step === 'register' ? <CheckCircleOutlined /> : <KeyOutlined /> },
                { title: '填写信息' },
              ]}
            />

            {step === 'invite' ? (
              <Form onFinish={handleVerifyInvite} size="large">
                <Form.Item name="invite_code" rules={[
                  { required: true, message: '请输入邀请码' },
                ]}>
                  <Input
                    prefix={<KeyOutlined />}
                    placeholder="请输入管理员给你的邀请码"
                    style={{ textTransform: 'uppercase', textAlign: 'center', fontSize: 18, letterSpacing: 3 }}
                    onChange={(e) => {
                      const val = e.target.value.toUpperCase().replace(/[^A-Z0-9-]/g, '');
                      const field = regForm.getFieldValue('invite_code');
                      if (field !== val) regForm.setFieldsValue({ invite_code: val });
                    }}
                    autoComplete="off"
                  />
                </Form.Item>
                <Form.Item>
                  <Button type="primary" htmlType="submit" loading={loading} block size="large">
                    验证邀请码
                  </Button>
                </Form.Item>
                <div style={{ fontSize: 12, color: '#999', textAlign: 'center' }}>
                  没有邀请码？请联系团队管理员获取
                </div>
              </Form>
            ) : (
              <Form form={regForm} onFinish={handleRegister} size="large">
                <div style={{
                  background: '#f6ffed',
                  border: '1px solid #b7eb8f',
                  borderRadius: 6,
                  padding: '8px 14px',
                  marginBottom: 16,
                  fontSize: 13,
                  color: '#389e0d',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                }}>
                  <CheckCircleOutlined />
                  邀请码验证通过
                  <Button type="link" size="small" onClick={() => {
                    setStep('invite');
                    setValidInvite(null);
                  }} style={{ padding: 0, fontSize: 12 }}>
                    更换
                  </Button>
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
                  <Input.Password prefix={<LockOutlined />} placeholder="密码（至少6位）" />
                </Form.Item>
                <Form.Item>
                  <Button type="primary" htmlType="submit" loading={loading} block>
                    注册并加入团队
                  </Button>
                </Form.Item>
              </Form>
            )}
          </>
        )}
      </Card>
    </div>
  );
}
