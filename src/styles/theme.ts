// Unified design tokens for the CRM app
// Replace hardcoded Tailwind grey scale with semantic tokens

export const tokens = {
  // Primary palette
  colorPrimary: '#1677ff',
  colorSuccess: '#52c41a',
  colorWarning: '#fa8c16',
  colorError: '#ff4d4f',
  colorInfo: '#1677ff',
  colorPurple: '#722ed1',
  colorCyan: '#13c2c2',

  // Neutral palette — replaces Tailwind greys
  colorText: '#1e293b',
  colorTextSecondary: '#64748b',
  colorTextTertiary: '#94a3b8',
  colorTextQuaternary: '#cbd5e1',

  // Borders
  colorBorder: '#f0f0f0',
  colorBorderSecondary: '#f5f5f5',

  // Backgrounds
  colorBgContainer: '#ffffff',
  colorBgLayout: '#f5f5f5',
  colorBgElevated: '#ffffff',

  // Status background tints
  colorSuccessBg: '#f6ffed',
  colorWarningBg: '#fffbe6',
  colorErrorBg: '#fff2f0',
  colorInfoBg: '#f0f5ff',
  colorPurpleBg: '#f9f0ff',

  // Spacing scale
  spacingXS: 4,
  spacingSM: 8,
  spacingMD: 12,
  spacingLG: 16,
  spacingXL: 24,
  spacingXXL: 32,

  // Border radius
  radiusSM: 4,
  radiusMD: 6,
  radiusLG: 8,
  radiusXL: 12,
  radiusXXL: 14,

  // Shadows
  shadowCard: '0 2px 8px rgba(0,0,0,0.06)',
  shadowCardHover: '0 4px 16px rgba(0,0,0,0.10)',
  shadowModal: '0 6px 24px rgba(0,0,0,0.12)',

  // Typography
  fontSizeXS: 11,
  fontSizeSM: 12,
  fontSizeMD: 13,
  fontSizeLG: 14,
  fontSizeXL: 18,
  fontSizeXXL: 20,
  fontSizeTitle: 24,
} as const;

// Customer status config — single source of truth
export const customerStatusMap: Record<string, { label: string; color: string }> = {
  new: { label: '新线索', color: 'default' },
  following: { label: '跟进中', color: 'blue' },
  dealt: { label: '已成交', color: 'green' },
  closed: { label: '已关闭', color: 'red' },
};

export type CustomerStatus = keyof typeof customerStatusMap;
