import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, Form, Input, Button, message } from 'antd';
import { TeamOutlined, ArrowRightOutlined } from '@ant-design/icons';
import { useAuth } from './AuthContext';

/**
 * 团队初始化页面
 * 仅在以下情况显示：
 * - 使用管理员邀请码（WOWOH-ADMIN）注册的用户，首次登录后需要创建组织
 * - 普通团队成员通过邀请码注册后会自动加入组织，不会看到此页面
 */
export default function OrgSetup() {
  const { createOrg, refreshOrg } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (values: { name: string }) => {
    setLoading(true);
    const result = await createOrg(values.name);
    setLoading(false);
    if (result.error) {
      message.error(result.error);
      return;
    }
    message.success('团队创建成功！');
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
          <h2 style={{ margin: '0 0 4px' }}>创建你的团队</h2>
          <p style={{ margin: 0, color: '#888', fontSize: 14 }}>
            首次使用，请先创建一个团队，你将自动成为团队主账号
          </p>
        </div>

        <Form layout="vertical" onFinish={handleSubmit} size="large">
          <Form.Item name="name" label="团队名称" rules={[{ required: true, message: '请输入团队名称' }]}>
            <Input prefix={<TeamOutlined />} placeholder="例如：深圳外贸部" />
          </Form.Item>
          <Form.Item>
            <Button type="primary" htmlType="submit" loading={loading} block icon={<ArrowRightOutlined />}>
              创建团队并开始使用
            </Button>
          </Form.Item>
          <div style={{ fontSize: 13, color: '#999', textAlign: 'center' }}>
            创建后你可以通过「团队管理」生成邀请码，邀请其他成员加入
          </div>
        </Form>
      </Card>
    </div>
  );
}
