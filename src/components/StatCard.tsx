import { Skeleton } from 'antd';
import { tokens } from '../styles/theme';

interface StatCardProps {
  icon: React.ReactNode;
  label: string;
  value: number | string;
  color: string;
  loading?: boolean;
  onClick?: () => void;
}

export default function StatCard({ icon, label, value, color, loading, onClick }: StatCardProps) {
  if (loading) {
    return (
      <div style={{ padding: tokens.spacingLG }}>
        <Skeleton.Input active size="small" style={{ width: 60, marginBottom: 8 }} />
        <Skeleton.Input active size="small" style={{ width: 40 }} />
      </div>
    );
  }

  const formatted = typeof value === 'number' && value >= 1000
    ? value.toLocaleString()
    : String(value);

  return (
    <div
      onClick={onClick}
      style={{
        padding: tokens.spacingLG,
        background: tokens.colorBgContainer,
        borderRadius: tokens.radiusLG,
        border: `1px solid ${tokens.colorBorder}`,
        cursor: onClick ? 'pointer' : 'default',
        transition: 'box-shadow 0.2s',
        textAlign: 'center',
      }}
      onMouseEnter={(e) => {
        if (onClick) e.currentTarget.style.boxShadow = tokens.shadowCardHover;
      }}
      onMouseLeave={(e) => {
        if (onClick) e.currentTarget.style.boxShadow = 'none';
      }}
    >
      <div
        style={{
          width: 36,
          height: 36,
          borderRadius: tokens.radiusLG,
          background: `${color}15`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          margin: '0 auto 8px',
          color,
          fontSize: 18,
        }}
      >
        {icon}
      </div>
      <div style={{ fontSize: tokens.fontSizeXXL, fontWeight: 700, color: color, lineHeight: 1.2 }}>
        {formatted}
      </div>
      <div style={{ fontSize: tokens.fontSizeXS, color: tokens.colorTextTertiary, marginTop: 2 }}>
        {label}
      </div>
    </div>
  );
}
