import { Table } from 'antd';
import type { TableProps } from 'antd';
import type { ColumnsType } from 'antd/es/table';

/** Extended cell attributes that support data-label for mobile CSS */
interface CellAttributes extends React.TdHTMLAttributes<unknown> {
  'data-label'?: string;
}

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
      | ((record: T, index?: number) => CellAttributes)
      | undefined;

    const colTitle = typeof col.title === 'string' ? col.title : undefined;

    return {
      ...col,
      onCell: (record: T, index?: number) => {
        const base: CellAttributes = originalOnCell ? originalOnCell(record, index) : {};
        // Only inject data-label if not already set by the caller
        if (base['data-label'] === undefined && colTitle) {
          base['data-label'] = colTitle;
        }
        return base;
      },
    };
  }) as ColumnsType<T>;

  return <Table<T> columns={enhancedColumns} {...rest} />;
}
