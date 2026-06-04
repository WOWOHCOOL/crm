import { Image, Tag, Dropdown } from 'antd';
import type { MenuProps } from 'antd';
import { EditOutlined, EyeOutlined, DeleteOutlined, MoreOutlined } from '@ant-design/icons';
import type { Product } from '../types';
import { tokens } from '../styles/theme';

interface ProductCardProps {
  product: Product & { suppliers?: { name: string } | null };
  onClick: () => void;
  onEdit?: () => void;
  onDelete?: () => void;
}

export default function ProductCard({ product, onClick, onEdit, onDelete }: ProductCardProps) {
  const menuItems: MenuProps['items'] = [
    { key: 'view', icon: <EyeOutlined />, label: '查看详情', onClick: (e) => { e.domEvent.stopPropagation(); onClick(); } },
    ...(onEdit ? [{ key: 'edit', icon: <EditOutlined />, label: '编辑', onClick: (e: { domEvent: { stopPropagation: () => void } }) => { e.domEvent.stopPropagation(); onEdit(); } }] : []),
    ...(onDelete ? [{ type: 'divider' as const }, { key: 'delete', icon: <DeleteOutlined />, label: '删除', danger: true, onClick: (e: { domEvent: { stopPropagation: () => void } }) => { e.domEvent.stopPropagation(); onDelete(); } }] : []),
  ];

  const supplierName = product.suppliers?.name || product.supplier_name || '-';

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
      {/* Image area */}
      <div style={{
        width: '100%',
        height: 140,
        background: '#fafafa',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden',
      }}>
        {product.image_url ? (
          <Image
            src={product.image_url}
            width="100%"
            height="100%"
            style={{ objectFit: 'cover' }}
            preview={{ mask: null }}
            onClick={(e) => e.stopPropagation()}
            fallback="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' width='80' height='80'><rect fill='%23f5f5f5' width='80' height='80'/><text x='50%' y='50%' dominant-baseline='middle' text-anchor='middle' fill='%23ccc' font-size='32'>📷</text></svg>"
          />
        ) : (
          <div style={{ fontSize: 48, opacity: 0.15, color: tokens.colorTextTertiary }}>📷</div>
        )}
      </div>

      {/* Card body */}
      <div style={{ padding: tokens.spacingMD, paddingBottom: tokens.spacingSM }}>
        {/* Model */}
        <div style={{
          fontSize: tokens.fontSizeLG,
          fontWeight: 600,
          color: tokens.colorText,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          marginBottom: 2,
        }}>
          {product.official_model}
        </div>

        {/* Product name */}
        {product.product_name && (
          <div style={{
            fontSize: tokens.fontSizeSM,
            color: tokens.colorTextSecondary,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            marginBottom: 4,
          }}>
            {product.product_name}
          </div>
        )}

        {/* Supplier + Tax tag */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6, flexWrap: 'wrap' }}>
          <span style={{ fontSize: tokens.fontSizeSM, color: tokens.colorTextTertiary, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
            {supplierName}
          </span>
          <Tag color={product.tax_included ? 'blue' : 'default'} style={{ margin: 0, fontSize: 10, lineHeight: '18px', padding: '0 6px', flexShrink: 0 }}>
            {product.tax_included ? '含税' : '不含'}
          </Tag>
        </div>

        {/* Prices */}
        <div style={{
          display: 'flex',
          gap: tokens.spacingLG,
          paddingTop: tokens.spacingSM,
          borderTop: `1px solid ${tokens.colorBorderSecondary}`,
        }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: tokens.fontSizeXS, color: tokens.colorTextTertiary, marginBottom: 1 }}>供货价</div>
            <div style={{ fontSize: tokens.fontSizeMD, fontWeight: 600, color: tokens.colorText }}>
              {product.supply_price ? `¥${Number(product.supply_price).toFixed(2)}` : '-'}
            </div>
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: tokens.fontSizeXS, color: tokens.colorTextTertiary, marginBottom: 1 }}>建议报价</div>
            <div style={{ fontSize: tokens.fontSizeMD, fontWeight: 600, color: tokens.colorPrimary }}>
              {product.suggested_price ? `¥${Number(product.suggested_price).toFixed(2)}` : '-'}
            </div>
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
