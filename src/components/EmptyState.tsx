import { Button } from 'antd';
import { tokens } from '../styles/theme';

interface EmptyStateProps {
  icon?: React.ReactNode;
  title?: string;
  description?: string;
  action?: { label: string; onClick: () => void };
}

export default function EmptyState({ icon, title = '暂无数据', description, action }: EmptyStateProps) {
  return (
    <div
      style={{
        textAlign: 'center',
        padding: `${tokens.spacingXXL}px ${tokens.spacingLG}px`,
        color: tokens.colorTextTertiary,
      }}
    >
      {icon && (
        <div style={{ fontSize: 48, marginBottom: tokens.spacingMD, opacity: 0.5 }}>
          {icon}
        </div>
      )}
      <div style={{ fontSize: tokens.fontSizeLG, fontWeight: 500, color: tokens.colorTextSecondary, marginBottom: 4 }}>
        {title}
      </div>
      {description && (
        <div style={{ fontSize: tokens.fontSizeSM, marginBottom: tokens.spacingLG }}>
          {description}
        </div>
      )}
      {action && (
        <Button type="primary" size="small" onClick={action.onClick}>
          {action.label}
        </Button>
      )}
    </div>
  );
}
