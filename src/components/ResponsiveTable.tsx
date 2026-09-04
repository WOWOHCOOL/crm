import { Table } from 'antd';
import type { TableProps } from 'antd';
import type { ColumnsType } from 'antd/es/table';

type CellResult = Record<string, unknown> & {
  'data-label'?: string;
};

/**
 * Wrapper around Ant Design Table that auto-injects `data-label` on every column.
 * This ensures mobile CSS table-to-card transformation works without manual onCell boilerplate.
 *
 * Usage: identical to <Table>, just replace the import.
 */
export default function ResponsiveTable<T extends object>({
  columns,
  ...rest
}: TableProps<T>) {
  const enhancedColumns = (columns as ColumnsType<T>).map((col) => {
    const originalOnCell = (col as Record<string, unknown>).onCell as
      | ((record: T, index?: number) => CellResult)
      | undefined;

    const colTitle = typeof col.title === 'string' ? col.title : undefined;
    // Action columns (key: 'actions') get a marker so mobile CSS can render
    // them as the gray button row instead of assuming the last column
    const isActions = col.key === 'actions';

    return {
      ...col,
      onCell: (record: T, index?: number): CellResult => {
        const base: CellResult = originalOnCell ? originalOnCell(record, index) : {};
        if (base['data-label'] === undefined && colTitle) {
          base['data-label'] = colTitle;
        }
        if (isActions) {
          base['data-role'] = 'actions';
        }
        return base;
      },
    };
  }) as ColumnsType<T>;

  return <Table<T> columns={enhancedColumns} {...rest} />;
}
