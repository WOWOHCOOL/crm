import { Tag, Dropdown } from 'antd';
import type { MenuProps } from 'antd';
import { EditOutlined, EyeOutlined, DeleteOutlined, MoreOutlined, ShopOutlined } from '@ant-design/icons';
import type { Supplier } from '../types';
import { tokens } from '../styles/theme';

interface SupplierCardProps {
  supplier: Supplier;
  productCount: number;
  purchaseCount: number;
  purchaseAmount: number;
  onClick: () => void;
  onEdit?: () => void;
  onDelete?: () => void;
}

export default function SupplierCard({
  supplier,
  productCount,
  purchaseCount,
  purchaseAmount,
  onClick,
  onEdit,
  onDelete,
}: SupplierCardProps) {
  const menuItems: MenuProps['items'] = [
    { key: 'view', icon: <EyeOutlined />, label: '查看详情', onClick: (e) => { e.domEvent.stopPropagation(); onClick(); } },
    ...(onEdit ? [{ key: 'edit', icon: <EditOutlined />, label: '编辑', onClick: (e: { domEvent: { stopPropagation: () => void } }) => { e.domEvent.stopPropagation(); onEdit(); } }] : []),
    ...(onDelete ? [{ type: 'divider' as const }, { key: 'delete', icon: <DeleteOutlined />, label: '删除', danger: true, onClick: (e: { domEvent: { stopPropagation: () => void } }) => { e.domEvent.stopPropagation(); onDelete(); } }] : []),
  ];

  const purchaseAmt = purchaseAmount
    ? purchaseAmount >= 10000
      ? `¥${(purchaseAmount / 10000).toFixed(1)}万`
      : `¥${purchaseAmount.toFixed(0)}`
    : null;

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
      {/* Card body */}
      <div style={{ padding: `${tokens.spacingLG}px` }}>
        {/* Header: icon + name + action */}
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: tokens.spacingMD }}>
          <div style={{
            width: 44,
            height: 44,
            borderRadius: tokens.radiusLG,
            background: 'linear-gradient(135deg, #ff9c6e, #ff7a45)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 20,
            color: '#fff',
            fontWeight: 700,
            flexShrink: 0,
          }}>
            <ShopOutlined />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: tokens.fontSizeLG, fontWeight: 600, color: tokens.colorText, marginBottom: 2 }}>
              {supplier.name}
            </div>
            <div style={{ fontSize: tokens.fontSizeSM, color: tokens.colorTextTertiary }}>
              {supplier.contact_person || '无联系人'} {supplier.phone && `· ${supplier.phone}`}
            </div>
          </div>
        </div>

        {/* Stats row */}
        <div style={{
          display: 'flex',
          gap: tokens.spacingLG,
          paddingTop: tokens.spacingMD,
          borderTop: `1px solid ${tokens.colorBorderSecondary}`,
        }}>
          <div style={{ textAlign: 'center', flex: 1 }}>
            <div style={{ fontSize: tokens.fontSizeXL, fontWeight: 700, color: tokens.colorPrimary }}>{productCount}</div>
            <div style={{ fontSize: tokens.fontSizeXS, color: tokens.colorTextTertiary }}>产品</div>
          </div>
          <div style={{ textAlign: 'center', flex: 1 }}>
            <div style={{ fontSize: tokens.fontSizeXL, fontWeight: 700, color: tokens.colorWarning }}>{purchaseCount}</div>
            <div style={{ fontSize: tokens.fontSizeXS, color: tokens.colorTextTertiary }}>采购次数</div>
          </div>
          <div style={{ textAlign: 'center', flex: 1 }}>
            <div style={{ fontSize: tokens.fontSizeMD, fontWeight: 700, color: tokens.colorSuccess, whiteSpace: 'nowrap' }}>{purchaseAmt || '-'}</div>
            <div style={{ fontSize: tokens.fontSizeXS, color: tokens.colorTextTertiary }}>采购金额</div>
          </div>
        </div>
      </div>

      {/* Action menu */}
      {(onEdit || onDelete) && (
        <div style={{ position: 'absolute', top: 8, right: 8 }}>
          <Dropdown menu={{ items: menuItems }} trigger={['click']} placement="bottomRight">
            <div
              onClick={(e) => e.stopPropagation()}
              style={{
                width: 32,
                height: 32,
                borderRadius: '50%',
                background: 'rgba(0,0,0,0.65)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                transition: 'background 0.15s',
              }}
              onMouseEnter={(e) => { e.currentTarget.style.background = tokens.colorPrimary; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(0,0,0,0.65)'; }}
            >
              <MoreOutlined style={{ fontSize: 18, color: '#fff' }} />
            </div>
          </Dropdown>
        </div>
      )}
    </div>
  );
}
