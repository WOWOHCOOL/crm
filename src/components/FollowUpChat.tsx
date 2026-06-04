import { useState } from 'react';
import { Form, Input, Button, Card, Row, Col, message, DatePicker, Checkbox } from 'antd';
import { SendOutlined, CalendarOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import type { FollowUp } from '../types';
import { tokens } from '../styles/theme';
import { supabase } from '../supabase';
import { useQueryClient } from '@tanstack/react-query';

interface FollowUpChatProps {
  customerId: string;
  followUps: FollowUp[];
  inquiryContent?: string | null;
}

export default function FollowUpChat({ customerId, followUps, inquiryContent }: FollowUpChatProps) {
  const [form] = Form.useForm();
  const [sending, setSending] = useState(false);
  const queryClient = useQueryClient();

  const handleSubmit = async (values: {
    content: string;
    next_plan?: string;
    follow_up_date: dayjs.Dayjs;
    create_task: boolean;
  }) => {
    setSending(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('未登录');

      const followUpDate = values.follow_up_date
        ? values.follow_up_date.toISOString()
        : new Date().toISOString();

      // 1. Save follow-up record
      const { error } = await supabase.from('follow_ups').insert([{
        customer_id: customerId,
        content: values.content,
        next_plan: values.next_plan || null,
        follow_up_date: followUpDate,
        user_id: user.id,
      }]);
      if (error) throw error;

      // 2. Optionally create a linked task
      if (values.create_task && values.next_plan) {
        // Get org_id for the task
        const { data: orgData } = await supabase
          .from('organization_members')
          .select('org_id')
          .eq('user_id', user.id)
          .single();

        const { error: taskError } = await supabase.from('tasks').insert([{
          org_id: orgData?.org_id,
          customer_id: customerId,
          title: values.next_plan,
          description: `[来自跟进] ${values.content.slice(0, 200)}`,
          due_date: values.follow_up_date
            ? values.follow_up_date.format('YYYY-MM-DD')
            : dayjs().format('YYYY-MM-DD'),
          status: 'pending',
          priority: 'normal',
          user_id: user.id,
        }]);
        if (taskError) {
          console.warn('Task creation failed (follow-up saved):', taskError.message);
        }
      }

      queryClient.invalidateQueries({ queryKey: ['customer-followups'] });
      queryClient.invalidateQueries({ queryKey: ['customer', customerId] });
      queryClient.invalidateQueries({ queryKey: ['customers'] });
      queryClient.invalidateQueries({ queryKey: ['customer-tasks'] });
      form.resetFields();
      message.success(values.create_task && values.next_plan
        ? '跟进已保存，任务已创建'
        : '跟进已保存');
    } catch (e: unknown) {
      const err = e as Error;
      message.error(err.message || '保存失败');
    } finally {
      setSending(false);
    }
  };

  return (
    <div>
      {/* Inquiry content — always shown first */}
      {inquiryContent && (
        <div style={{ marginBottom: tokens.spacingXL }}>
          <div style={{
            textAlign: 'center',
            color: tokens.colorTextQuaternary,
            fontSize: tokens.fontSizeXS,
            marginBottom: tokens.spacingMD,
          }}>
            ── 首次询盘 ──
          </div>
          <div style={{
            background: '#fffbe6',
            border: '1px solid #ffe58f',
            borderRadius: tokens.radiusLG,
            padding: `${tokens.spacingMD}px ${tokens.spacingLG}px`,
            fontSize: tokens.fontSizeMD,
            color: '#595959',
            whiteSpace: 'pre-wrap',
            lineHeight: 1.6,
          }}>
            {inquiryContent}
          </div>
        </div>
      )}

      {/* Chat timeline */}
      {followUps.length > 0 && (
        <div style={{ marginBottom: tokens.spacingLG }}>
          {followUps.map((f) => (
            <div key={f.id} style={{ marginBottom: tokens.spacingLG }}>
              {/* Date divider */}
              <div style={{
                textAlign: 'center',
                color: tokens.colorTextQuaternary,
                fontSize: tokens.fontSizeXS,
                marginBottom: tokens.spacingMD,
              }}>
                ── {dayjs(f.follow_up_date).format('YYYY-MM-DD HH:mm')} ──
              </div>
              {/* Message bubble */}
              <div style={{
                position: 'relative',
                marginLeft: 0,
                maxWidth: '100%',
              }}>
                <div style={{
                  background: '#f0f5ff',
                  border: '1px solid #d6e4ff',
                  borderRadius: tokens.radiusLG,
                  padding: `${tokens.spacingMD}px ${tokens.spacingLG}px`,
                  borderLeft: `3px solid ${tokens.colorPrimary}`,
                }}>
                  <div style={{
                    fontSize: tokens.fontSizeLG,
                    color: tokens.colorText,
                    whiteSpace: 'pre-wrap',
                    lineHeight: 1.7,
                    marginBottom: f.next_plan ? tokens.spacingSM : 0,
                  }}>
                    {f.content}
                  </div>
                  {f.next_plan && (
                    <div style={{
                      display: 'inline-block',
                      fontSize: tokens.fontSizeSM,
                      color: tokens.colorPrimary,
                      background: '#e6f4ff',
                      padding: '2px 10px',
                      borderRadius: tokens.radiusSM,
                      marginTop: tokens.spacingSM,
                    }}>
                      📋 下一步：{f.next_plan}
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Input area */}
      <Card
        size="small"
        styles={{ body: { padding: tokens.spacingMD } }}
        style={{
          borderRadius: tokens.radiusLG,
          background: tokens.colorBgLayout,
          border: `1px solid ${tokens.colorBorder}`,
          position: 'sticky',
          bottom: 0,
        }}
      >
        <Form
          form={form}
          onFinish={handleSubmit}
          initialValues={{
            follow_up_date: dayjs(),
            create_task: false,
          }}
        >
          {/* Content */}
          <Form.Item
            name="content"
            rules={[{ required: true, message: '请输入跟进内容' }]}
            style={{ marginBottom: tokens.spacingSM }}
          >
            <Input.TextArea
              rows={2}
              placeholder="记录本次沟通内容..."
              autoSize={{ minRows: 2, maxRows: 4 }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                  e.preventDefault();
                  form.submit();
                }
              }}
            />
          </Form.Item>

          {/* Date + Next Plan */}
          <Row gutter={8} style={{ marginBottom: tokens.spacingSM }}>
            <Col xs={24} sm={8}>
              <Form.Item name="follow_up_date" style={{ marginBottom: 0 }}>
                <DatePicker
                  style={{ width: '100%' }}
                  placeholder="跟进日期"
                  prefix={<CalendarOutlined />}
                  allowClear={false}
                />
              </Form.Item>
            </Col>
            <Col xs={24} sm={16}>
              <Form.Item name="next_plan" style={{ marginBottom: 0 }}>
                <Input placeholder="下一步计划（可选）" />
              </Form.Item>
            </Col>
          </Row>

          {/* Task checkbox + Send button */}
          <Row gutter={8} align="middle">
            <Col flex="auto">
              <Form.Item name="create_task" valuePropName="checked" style={{ marginBottom: 0 }}>
                <Checkbox>同时创建跟进任务</Checkbox>
              </Form.Item>
            </Col>
            <Col flex="none">
              <Button
                type="primary"
                htmlType="submit"
                icon={<SendOutlined />}
                loading={sending}
              >
                保存跟进
              </Button>
            </Col>
          </Row>
        </Form>
      </Card>
    </div>
  );
}
