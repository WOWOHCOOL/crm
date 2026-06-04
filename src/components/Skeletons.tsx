import { Card, Skeleton, Row, Col } from 'antd';
import { useResponsive } from '../hooks/useResponsive';
import { tokens } from '../styles/theme';

/** Skeleton rows mimicking a table */
export function TableSkeleton({ rows = 8, cols = 4 }: { rows?: number; cols?: number }) {
  return (
    <Card styles={{ body: { padding: tokens.spacingXL } }}>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} style={{ display: 'flex', gap: tokens.spacingLG, marginBottom: tokens.spacingMD }}>
          {Array.from({ length: cols }).map((_, j) => (
            <Skeleton.Input
              key={j}
              active
              size="small"
              style={{ flex: 1, maxWidth: j === 0 ? 100 : j === 1 ? 160 : 'auto' }}
            />
          ))}
        </div>
      ))}
    </Card>
  );
}

/** Skeleton for CustomerDetail page */
export function DetailSkeleton() {
  const { isMobile } = useResponsive();
  return (
    <div style={{ maxWidth: 1200, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', gap: tokens.spacingMD, marginBottom: tokens.spacingLG }}>
        <Skeleton.Button active size="small" style={{ width: 100 }} />
        <Skeleton.Button active size="small" style={{ width: 100 }} />
      </div>
      {/* Info card */}
      <Card styles={{ body: { padding: tokens.spacingXL } }} style={{ marginBottom: 20, borderRadius: 12 }}>
        <div style={{ display: 'flex', gap: tokens.spacingLG, alignItems: 'center', marginBottom: tokens.spacingLG }}>
          <Skeleton.Avatar active size={56} shape="square" style={{ borderRadius: 14 }} />
          <div>
            <Skeleton.Input active style={{ width: 120, marginBottom: 8 }} />
            <Skeleton.Input active size="small" style={{ width: 80 }} />
          </div>
        </div>
        <Row gutter={[16, 16]}>
          {Array.from({ length: isMobile ? 4 : 8 }).map((_, i) => (
            <Col xs={12} md={3} key={i}>
              <Skeleton.Input active size="small" style={{ width: '100%' }} />
            </Col>
          ))}
        </Row>
      </Card>
      {/* Content */}
      <Card styles={{ body: { padding: tokens.spacingXL } }} style={{ borderRadius: 12 }}>
        <Skeleton active paragraph={{ rows: 8 }} />
      </Card>
    </div>
  );
}

/** Skeleton for Dashboard */
export function DashboardSkeleton() {
  const { isMobile } = useResponsive();
  return (
    <div>
      <Skeleton.Input active style={{ width: 200, marginBottom: tokens.spacingXL }} />
      <Row gutter={[16, 16]} style={{ marginBottom: tokens.spacingXL }}>
        {Array.from({ length: isMobile ? 4 : 6 }).map((_, i) => (
          <Col xs={12} sm={8} lg={4} key={i}>
            <div style={{ padding: tokens.spacingLG, background: '#fff', borderRadius: tokens.radiusLG, border: `1px solid ${tokens.colorBorder}` }}>
              <Skeleton.Avatar active size={36} shape="square" style={{ borderRadius: 8, marginBottom: 8 }} />
              <Skeleton.Input active size="small" style={{ width: '80%', marginBottom: 4 }} />
              <Skeleton.Input active size="small" style={{ width: '50%' }} />
            </div>
          </Col>
        ))}
      </Row>
      <Row gutter={[16, 16]}>
        <Col xs={24} lg={14}>
          <Card style={{ borderRadius: tokens.radiusLG }}>
            <Skeleton active paragraph={{ rows: 5 }} />
          </Card>
        </Col>
        <Col xs={24} lg={10}>
          <Card style={{ borderRadius: tokens.radiusLG }}>
            <Skeleton active paragraph={{ rows: 3 }} />
          </Card>
        </Col>
      </Row>
    </div>
  );
}
