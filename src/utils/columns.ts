/**
 * Mobile-responsive column helpers.
 * Adds `data-label` to each column so mobile CSS can show field names.
 */
import type { ColumnsType } from 'antd/es/table';

export function withMobileLabels<T>(columns: ColumnsType<T>): ColumnsType<T> {
  return columns.map((col: any) => {
    if (!col || col.key === 'actions' || col.key === 'action' || col.title === '操作' || col.title === 'Action') {
      return col;
    }
    const label = col.title || '';
    if (!col.onCell && label) {
      return { ...col, onCell: () => ({ 'data-label': label } as any) };
    }
    return col;
  });
}
