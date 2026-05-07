import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, Form, Input, Button, message, Segmented, Space } from 'antd';
import { TeamOutlined, KeyOutlined, ArrowRightOutlined } from '@ant-design/icons';
import { useAuth } from './AuthContext';

export default function OrgSetup() {
  const { createOrg, joinWithInviteCode, refreshOrg } = useAuth();
  const navigate = useNavigate();
  const [mode, setMode] = useState<'create' | 'join'>('create');
  const [loading, setLoading] = useState(false);
  const [form] = Form.useForm();

  const handleSubmit = async (values: { name?: string; invite_code?: string }) => {
    setLoading(true);
    const result = mode === 'create'
      ? await createOrg(values.name || '')
      : await joinWithInviteCode(values.invite_code || '');

    setLoading(false);

    if (result.error) {
      message.error(result.error);
      return;
    }

    message.success(mode === 'create' ? '团队创建成功！' : '已成功加入团队！');
    await refreshOrg();
    navigate('/');
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
          <h2 style={{ margin: '0 0 4px' }}>团队设置</h2>
          <p style={{ margin: 0, color: '#888', fontSize: 14 }}>
            {mode === 'create' ? '创建一个新团队开始使用' : '输入邀请码加入已有团队'}
          </p>
        </div>

        <Segmented
          block
          value={mode}
          onChange={(val) => { setMode(val as 'create' | 'join'); form.resetFields(); }}
          style={{ marginBottom: 24 }}
          options={[
            { label: <Space><TeamOutlined />创建团队</Space>, value: 'create' },
            { label: <Space><KeyOutlined />加入团队</Space>, value: 'join' },
          ]}
        />

        <Form form={form} layout="vertical" onFinish={handleSubmit} size="large">
          {mode === 'create' ? (
            <>
              <Form.Item name="name" label="团队名称" rules={[{ required: true, message: '请输入团队名称' }]}>
                <Input prefix={<TeamOutlined />} placeholder="例如：深圳外贸部" />
              </Form.Item>
              <Form.Item>
                <Button type="primary" htmlType="submit" loading={loading} block icon={<ArrowRightOutlined />}>
                  创建并开始使用
                </Button>
              </Form.Item>
              <div style={{ fontSize: 13, color: '#999', textAlign: 'center' }}>
                创建后你将自动成为团队管理员（主账号）
              </div>
            </>
          ) : (
            <>
              <Form.Item name="invite_code" label="邀请码" rules={[{ required: true, message: '请输入邀请码' }]}>
                <Input
                  prefix={<KeyOutlined />}
                  placeholder="输入管理员给你的邀请码"
                  style={{ textTransform: 'uppercase' }}
                  onChange={(e) => {
                    const val = e.target.value.toUpperCase().replace(/[^A-Z0-9-]/g, '');
                    form.setFieldsValue({ invite_code: val });
                  }}
                />
              </Form.Item>
              <Form.Item>
                <Button type="primary" htmlType="submit" loading={loading} block icon={<ArrowRightOutlined />}>
                  加入团队
                </Button>
              </Form.Item>
              <div style={{ fontSize: 13, color: '#999', textAlign: 'center' }}>
                加入后你将自动成为团队成员（子账号）
              </div>
            </>
          )}
        </Form>
      </Card>
    </div>
  );
}
