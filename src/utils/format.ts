import dayjs from 'dayjs';

/**
 * 全站统一的展示格式化。
 *
 * 背景：此前各页面各自为政 —— 有的用 `new Date(v).toLocaleString()`，
 * 有的直接输出原始字段，导致同一张表里日期格式不一致（如财务页出现
 * `2026-09-22T08:59:49.500Z` 这种原始时间戳），金额也时而带千分位时而没有。
 * 这里集中定义，避免同一数据在不同页面呈现不同。
 */

/** 日期：YYYY-MM-DD。入参兼容 `2026-09-22` 与完整 ISO 串。 */
export function formatDate(value: string | null | undefined): string {
  if (!value) return '-';
  const d = dayjs(value);
  return d.isValid() ? d.format('YYYY-MM-DD') : String(value);
}

/** 日期+时间：YYYY-MM-DD HH:mm。 */
export function formatDateTime(value: string | null | undefined): string {
  if (!value) return '-';
  const d = dayjs(value);
  return d.isValid() ? d.format('YYYY-MM-DD HH:mm') : String(value);
}

/**
 * 金额：千分位 + 两位小数。
 * symbol 由调用方按币种传入（USD → $，RMB → ¥），本函数不猜币种。
 */
export function formatMoney(
  amount: number | string | null | undefined,
  symbol = '',
  fractionDigits = 2,
): string {
  if (amount === null || amount === undefined || amount === '') return '-';
  const n = Number(amount);
  if (!Number.isFinite(n)) return '-';
  return (
    symbol +
    n.toLocaleString('zh-CN', {
      minimumFractionDigits: fractionDigits,
      maximumFractionDigits: fractionDigits,
    })
  );
}

/** 大额金额缩写：>= 10000 显示为「1.2万」，用于卡片等窄空间。 */
export function formatMoneyCompact(
  amount: number | null | undefined,
  symbol = '',
): string {
  if (amount === null || amount === undefined) return '-';
  if (amount >= 10000) return `${symbol}${(amount / 10000).toFixed(1)}万`;
  return `${symbol}${amount.toFixed(2).replace(/\.00$/, '')}`;
}
