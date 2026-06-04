import { Breadcrumb, Skeleton, Space } from 'antd';
import type { ReactNode } from 'react';
import { useResponsive } from '../hooks/useResponsive';
import { tokens } from '../styles/theme';

interface PageContainerProps {
  title?: string;
  breadcrumb?: { label: string; path?: string }[];
  loading?: boolean;
  skeletonRows?: number;
  extra?: ReactNode;
  children: ReactNode;
}

export default function PageContainer({
  breadcrumb,
  loading,
  skeletonRows = 6,
  extra,
  children,
}: PageContainerProps) {
  const { isMobile } = useResponsive();

  if (loading) {
    return (
      <div style={{ padding: isMobile ? tokens.spacingSM : tokens.spacingXL }}>
        {breadcrumb && breadcrumb.length > 0 && !isMobile && (
          <Breadcrumb
            style={{ marginBottom: tokens.spacingLG }}
            items={breadcrumb.map((b, i) => ({
              title: i === breadcrumb.length - 1 ? b.label : b.label,
            }))}
          />
        )}
        <Space direction="vertical" style={{ width: '100%' }} size="middle">
          {Array.from({ length: skeletonRows }).map((_, i) => (
            <Skeleton key={i} active paragraph={{ rows: 1 }} title={{ width: i === 0 ? '60%' : '80%' }} />
          ))}
        </Space>
      </div>
    );
  }

  return (
    <div style={{ padding: isMobile ? `${tokens.spacingSM}px 0` : 0 }}>
      {breadcrumb && breadcrumb.length > 0 && !isMobile && (
        <Breadcrumb
          style={{ marginBottom: tokens.spacingLG }}
          items={breadcrumb.map((b) => ({
            title: b.label,
          }))}
        />
      )}
      {extra && (
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: tokens.spacingMD }}>
          {extra}
        </div>
      )}
      {children}
    </div>
  );
}
