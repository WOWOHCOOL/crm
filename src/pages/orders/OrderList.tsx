import { useNavigate } from 'react-router-dom';
import { Table, Button, Space, Tag, Card, message, Popconfirm } from 'antd';
import { PlusOutlined, DownloadOutlined } from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../supabase';
import type { Order, OrderStatus } from '../../types';
import { useAuth } from '../../auth/AuthContext';
import { logOperation } from '../../utils/log';
import dayjs from 'dayjs';

const statusLabels: Record<OrderStatus, string> = {
  pending: '待确认',
  confirmed: '已确认',
  in_production: '生产中',
  shipped: '已发货',
  completed: '已完成',
};

const statusColors: Record<OrderStatus, string> = {
  pending: 'orange',
  confirmed: 'geekblue',
  in_production: 'purple',
  shipped: 'cyan',
  completed: 'green',
};

const orderTypeLabels: Record<string, string> = {
  normal: '正常订单',
  repeat: '返单',
  sample: '样品',
};

export default function OrderList() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { isOwner, isAdmin } = useAuth();
  const canEdit = isOwner || isAdmin;

  const { data: orders, isLoading } = useQuery({
    queryKey: ['orders-list'],
    queryFn: async () => {
      const { data } = await supabase
        .from('orders')
        .select('*, customers(name, company)')
        .order('date', { ascending: false });
      return (data ?? []) as (Order & { customers: { name: string; company: string | null } | null })[];
    },
    staleTime: 0,
    refetchOnMount: true,
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('orders').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['orders-list'] });
      message.success('订单已删除');
      logOperation('order', 'delete');
    },
    onError: (error: Error) => message.error(error.message),
  });

  const columns = [
    {
      title: '日期', dataIndex: 'date', key: 'date', width: 100,
      sorter: (a: Order, b: Order) => a.date.localeCompare(b.date),
    },
    {
      title: '客户', key: 'customer', width: 130,
      render: (_: unknown, r: Order & { customers: { name: string; company: string | null } | null }) =>
        r.customers?.name || '-',
    },
    {
      title: '类型', dataIndex: 'order_type', key: 'order_type', width: 80,
      render: (v: string) => <Tag>{orderTypeLabels[v] || v}</Tag>,
    },
    {
      title: '金额', dataIndex: 'total_amount', key: 'total_amount', width: 110,
      render: (v: number | null) => v ? `¥${Number(v).toFixed(2)}` : '-',
    },
    {
      title: '状态', dataIndex: 'status', key: 'status', width: 90,
      render: (v: OrderStatus) => <Tag color={statusColors[v]}>{statusLabels[v]}</Tag>,
    },
    {
      title: 'PI编号', dataIndex: 'pi_number', key: 'pi_number', width: 150,
      render: (v: string | null) => v || '-',
    },
    {
      title: '出运', key: 'tracking', width: 160,
      render: (_: unknown, r: Order) => {
        const info: string[] = [];
        if (r.tracking_company) info.push(r.tracking_company);
        if (r.tracking_number) info.push(r.tracking_number);
        if (r.etd) info.push(`ETD:${r.etd}`);
        if (r.eta) info.push(`ETA:${r.eta}`);
        return info.length > 0
          ? <Tag color="blue" style={{ fontSize: 11 }}>{info.join(' ')}</Tag>
          : '-';
      },
    },
    {
      title: '操作', key: 'actions', width: 120,
      render: (_: unknown, record: Order) => (
        <Space>
          <Button size="small" onClick={() => navigate(`/customers/${record.customer_id}`)}>查看客户</Button>
          {canEdit && (
            <Popconfirm title="确定删除？" onConfirm={() => deleteMutation.mutate(record.id)}>
              <Button size="small" danger>删除</Button>
            </Popconfirm>
          )}
        </Space>
      ),
    },
  ];

  return (
    <div>
      <Card title="客户订单">
        <Table
          dataSource={orders}
          columns={columns}
          rowKey="id"
          loading={isLoading}
          pagination={{ pageSize: 20, showSizeChanger: true, showTotal: (t) => `共 ${t} 条` }}
          scroll={{ x: 900 }}
        />
      </Card>
    </div>
  );
}
