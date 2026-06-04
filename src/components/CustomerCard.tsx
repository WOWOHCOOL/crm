import { Image, Tag, Dropdown } from 'antd';
import type { MenuProps } from 'antd';
import { EditOutlined, EyeOutlined, DeleteOutlined, MoreOutlined } from '@ant-design/icons';
import type { Customer } from '../types';
import { tokens, customerStatusMap } from '../styles/theme';

interface CustomerCardProps {
  customer: Customer;
  onClick: () => void;
  onEdit?: () => void;
  onDelete?: () => void;
}

// Country name to emoji flag mapping (common trade countries)
const countryFlags: Record<string, string> = {
  '中国': '🇨🇳', '美国': '🇺🇸', '英国': '🇬🇧', '德国': '🇩🇪', '法国': '🇫🇷',
  '日本': '🇯🇵', '韩国': '🇰🇷', '印度': '🇮🇳', '巴西': '🇧🇷', '加拿大': '🇨🇦',
  '澳大利亚': '🇦🇺', '意大利': '🇮🇹', '西班牙': '🇪🇸', '墨西哥': '🇲🇽',
  '俄罗斯': '🇷🇺', '阿联酋': '🇦🇪', '沙特阿拉伯': '🇸🇦', '土耳其': '🇹🇷',
  '泰国': '🇹🇭', '越南': '🇻🇳', '马来西亚': '🇲🇾', '新加坡': '🇸🇬',
  '印度尼西亚': '🇮🇩', '菲律宾': '🇵🇭', '荷兰': '🇳🇱', '比利时': '🇧🇪',
  '瑞士': '🇨🇭', '瑞典': '🇸🇪', '挪威': '🇳🇴', '丹麦': '🇩🇰',
  '波兰': '🇵🇱', '南非': '🇿🇦', '埃及': '🇪🇬', '尼日利亚': '🇳🇬',
  '巴基斯坦': '🇵🇰', '孟加拉国': '🇧🇩',
};

function getFlag(country: string | null): string {
  if (!country) return '';
  return countryFlags[country] || '';
}

export default function CustomerCard({ customer, onClick, onEdit, onDelete }: CustomerCardProps) {
  const status = customerStatusMap[customer.status] || customerStatusMap.new;
  const flag = getFlag(customer.country);

  const menuItems: MenuProps['items'] = [
    { key: 'view', icon: <EyeOutlined />, label: '查看详情', onClick: (e) => { e.domEvent.stopPropagation(); onClick(); } },
    ...(onEdit ? [{ key: 'edit', icon: <EditOutlined />, label: '编辑', onClick: (e: { domEvent: { stopPropagation: () => void } }) => { e.domEvent.stopPropagation(); onEdit(); } }] : []),
    ...(onDelete ? [{ type: 'divider' as const }, { key: 'delete', icon: <DeleteOutlined />, label: '删除', danger: true, onClick: (e: { domEvent: { stopPropagation: () => void } }) => { e.domEvent.stopPropagation(); onDelete(); } }] : []),
  ];

  return (
    <div
      onClick={onClick}
      style={{
        position: 'relative',
        background: tokens.colorBgContainer,
        borderRadius: tokens.radiusXL,
        border: `1px solid ${tokens.colorBorder}`,
        overflow: 'hidden',
        cursor: 'pointer',
        transition: 'box-shadow 0.2s, transform 0.2s',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.boxShadow = tokens.shadowCardHover;
        e.currentTarget.style.transform = 'translateY(-2px)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.boxShadow = 'none';
        e.currentTarget.style.transform = 'none';
      }}
    >
      {/* Status color bar */}
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          bottom: 0,
          width: 3,
          background: status.color === 'blue' ? tokens.colorPrimary
            : status.color === 'green' ? tokens.colorSuccess
            : status.color === 'red' ? tokens.colorError
            : tokens.colorTextQuaternary,
        }}
      />

      {/* Card body */}
      <div style={{ padding: `${tokens.spacingLG}px ${tokens.spacingLG}px ${tokens.spacingMD}px` }}>
        {/* Business card preview */}
        <div
          style={{
            width: '100%',
            height: 100,
            borderRadius: tokens.radiusMD,
            background: '#f5f5f5',
            marginBottom: tokens.spacingMD,
            overflow: 'hidden',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {customer.business_card ? (
            <Image
              src={customer.business_card}
              width="100%"
              height="100%"
              style={{ objectFit: 'cover' }}
              preview={{ mask: null }}
              onClick={(e) => e.stopPropagation()}
            />
          ) : (
            <div
              style={{
                width: 40,
                height: 40,
                borderRadius: tokens.radiusLG,
                background: 'linear-gradient(135deg, #d4a843, #b8922e)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 18,
                color: '#fff',
                fontWeight: 700,
              }}
            >
              {customer.name?.charAt(0) || '?'}
            </div>
          )}
        </div>

        {/* Customer name + status */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
          <span style={{
            fontSize: tokens.fontSizeLG,
            fontWeight: 600,
            color: tokens.colorText,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            flex: 1,
          }}>
            {customer.name}
          </span>
          <Tag color={status.color} style={{ margin: 0, fontSize: 10, lineHeight: '18px', padding: '0 6px', flexShrink: 0 }}>
            {status.label}
          </Tag>
        </div>

        {/* Country + company */}
        <div style={{ fontSize: tokens.fontSizeSM, color: tokens.colorTextTertiary, display: 'flex', alignItems: 'center', gap: 4 }}>
          {flag && <span>{flag}</span>}
          <span>{customer.country || '-'}</span>
          {customer.company && (
            <>
              <span style={{ opacity: 0.4 }}>·</span>
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{customer.company}</span>
            </>
          )}
        </div>
      </div>

      {/* Action menu */}
      {(onEdit || onDelete) && (
        <div style={{ position: 'absolute', top: 10, right: 8 }}>
          <Dropdown menu={{ items: menuItems }} trigger={['click']} placement="bottomRight">
            <div
              onClick={(e) => e.stopPropagation()}
              style={{
                width: 28,
                height: 28,
                borderRadius: tokens.radiusSM,
                background: 'rgba(0,0,0,0.03)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
              }}
            >
              <MoreOutlined style={{ fontSize: 14, color: tokens.colorTextSecondary }} />
            </div>
          </Dropdown>
        </div>
      )}
    </div>
  );
}
