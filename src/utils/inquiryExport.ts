import type { Customer } from '../types';
import { customerStatusMap, intentionMap } from '../styles/theme';

// xlsx (~430KB) loads on demand when the user actually exports
type XLSXModule = typeof import('xlsx');

function fmtDateTime(d: string): string {
  if (!d) return '';
  return new Date(d).toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function statusLabel(v: string): string {
  return customerStatusMap[v]?.label ?? v;
}

function intentionLabel(v: string): string {
  return intentionMap[v]?.label ?? v;
}

const HEADERS = [
  '姓名',
  '公司',
  '电话',
  '邮箱',
  '邮箱2',
  '国家',
  '来源',
  '状态',
  '意向',
  '产品标签',
  '询盘内容',
  '备注',
  '创建时间',
  '更新时间',
];

// Column widths — designed around realistic content sizes
const COL_WIDTHS = [
  { wch: 10 },  // 姓名
  { wch: 22 },  // 公司
  { wch: 16 },  // 电话
  { wch: 26 },  // 邮箱
  { wch: 26 },  // 邮箱2
  { wch: 10 },  // 国家
  { wch: 14 },  // 来源
  { wch: 10 },  // 状态
  { wch: 10 },  // 意向
  { wch: 24 },  // 产品标签
  { wch: 48 },  // 询盘内容
  { wch: 36 },  // 备注
  { wch: 18 },  // 创建时间
  { wch: 18 },  // 更新时间
];

export async function exportInquiriesToExcel(data: Customer[]) {
  const XLSX: XLSXModule = await import('xlsx');
  const rows: unknown[][] = [HEADERS];

  for (const c of data) {
    rows.push([
      c.name || '',
      c.company || '',
      c.phone || '',
      c.email || '',
      c.email2 || '',
      c.country || '',
      c.source || '',
      statusLabel(c.status),
      intentionLabel(c.intention || ''),
      c.tags || '',
      c.inquiry_content || '',
      c.notes || '',
      fmtDateTime(c.created_at),
      fmtDateTime(c.updated_at),
    ]);
  }

  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws['!cols'] = COL_WIDTHS;

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, '询盘线索');
  XLSX.writeFile(wb, `询盘线索_${new Date().toISOString().slice(0, 10)}.xlsx`);
}
