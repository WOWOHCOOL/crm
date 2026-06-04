import { Tag, Checkbox, Dropdown } from 'antd';
import type { MenuProps } from 'antd';
import { EditOutlined, DeleteOutlined, MoreOutlined } from '@ant-design/icons';
import type { Task, Customer } from '../types';
import { tokens } from '../styles/theme';
import dayjs from 'dayjs';

const priorityLabels: Record<string, string> = { low: '低', normal: '中', high: '高', urgent: '紧急' };
const priorityColors: Record<string, string> = { low: 'default', normal: 'blue', high: 'orange', urgent: 'red' };

interface TaskCardProps {
  task: Task & { customers: Customer | null };
  onClick: () => void;
  onToggle: () => void;
  onEdit?: () => void;
  onDelete?: () => void;
}

export default function TaskCard({ task, onClick, onToggle, onEdit, onDelete }: TaskCardProps) {
  const menuItems: MenuProps['items'] = [
    ...(onEdit ? [{ key: 'edit', icon: <EditOutlined />, label: '编辑', onClick: (e: { domEvent: { stopPropagation: () => void } }) => { e.domEvent.stopPropagation(); onEdit(); } }] : []),
    ...(onDelete ? [{ key: 'delete', icon: <DeleteOutlined />, label: '删除', danger: true, onClick: (e: { domEvent: { stopPropagation: () => void } }) => { e.domEvent.stopPropagation(); onDelete(); } }] : []),
  ];

  // Countdown
  const getCountdown = (dueDate: string | null) => {
    if (!dueDate) return null;
    const today = dayjs().startOf('day');
    const due = dayjs(dueDate).startOf('day');
    const diff = due.diff(today, 'day');
    if (diff < 0) return { text: `逾期 ${Math.abs(diff)} 天`, color: '#ff4d4f', bg: '#fff2f0' };
    if (diff === 0) return { text: '今天截止', color: '#fa8c16', bg: '#fff7e6' };
    if (diff === 1) return { text: '明天截止', color: '#fa8c16', bg: '#fff7e6' };
    if (diff <= 3) return { text: `剩余 ${diff} 天`, color: '#1677ff', bg: '#f0f5ff' };
    return { text: `${dueDate}`, color: tokens.colorTextTertiary, bg: '#f5f5f5' };
  };

  const countdown = getCountdown(task.due_date);
  const isDone = task.status === 'completed';
  const priorityColor = priorityColors[task.priority] || 'blue';

  return (
    <div
      onClick={onClick}
      style={{
        position: 'relative',
        background: isDone ? '#f9f9f9' : tokens.colorBgContainer,
        borderRadius: tokens.radiusLG,
        border: `1px solid ${tokens.colorBorder}`,
        overflow: 'hidden',
        cursor: 'pointer',
        transition: 'box-shadow 0.2s, transform 0.2s',
        opacity: isDone ? 0.7 : 1,
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.boxShadow = tokens.shadowCardHover;
        e.currentTarget.style.transform = 'translateY(-1px)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.boxShadow = 'none';
        e.currentTarget.style.transform = 'none';
      }}
    >
      {/* Priority color bar */}
      <div style={{ position: 'absolute', top: 0, left: 0, bottom: 0, width: 3, background: priorityColor }} />

      <div style={{ padding: `10px 12px` }}>
        {/* Top row: checkbox + title + menu */}
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
          <div onClick={(e) => e.stopPropagation()} style={{ paddingTop: 2 }}>
            <Checkbox checked={isDone} onChange={onToggle} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{
              fontSize: tokens.fontSizeLG,
              fontWeight: 600,
              color: isDone ? tokens.colorTextTertiary : tokens.colorText,
              textDecoration: isDone ? 'line-through' : 'none',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              marginBottom: 4,
            }}>
              {task.title}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <Tag color={priorityColor} style={{ margin: 0, fontSize: 10, lineHeight: '18px' }}>
                {priorityLabels[task.priority]}
              </Tag>
              {task.customers && (
                <span style={{ fontSize: tokens.fontSizeSM, color: tokens.colorTextTertiary }}>
                  {task.customers.name}
                </span>
              )}
            </div>
          </div>
          {(onEdit || onDelete) && (
            <div onClick={(e) => e.stopPropagation()}>
              <Dropdown menu={{ items: menuItems }} trigger={['click']} placement="bottomRight">
                <div style={{
                  width: 28, height: 28, borderRadius: '50%',
                  background: 'rgba(0,0,0,0.5)', display: 'flex',
                  alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
                }}>
                  <MoreOutlined style={{ fontSize: 16, color: '#fff' }} />
                </div>
              </Dropdown>
            </div>
          )}
        </div>

        {/* Countdown bar */}
        {countdown && (
          <div style={{
            marginTop: 8,
            padding: '4px 10px',
            background: countdown.bg,
            borderRadius: tokens.radiusSM,
            fontSize: tokens.fontSizeSM,
            fontWeight: 600,
            color: countdown.color,
            textAlign: 'center',
          }}>
            {countdown.text}
          </div>
        )}
      </div>
    </div>
  );
}
