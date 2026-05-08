import { useNavigate } from 'react-router-dom';
import {
  Table, Button, Space, Tag, Card, Popconfirm, message,
} from 'antd';
import { PlusOutlined, DownloadOutlined } from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../supabase';
import type { PurchaseOrder, PurchaseItem, PurchaseStatus, Supplier } from '../../types';
import { useAuth } from '../../auth/AuthContext';
import { logOperation } from '../../utils/log';
import { exportPurchasePDF } from '../../utils/purchaseExport';

const statusLabels: Record<PurchaseStatus, string> = {
  draft: '草稿',
  ordered: '已下单',
  partial: '部分到货',
  received: '已入库',
  cancelled: '已取消',
};

const statusColors: Record<PurchaseStatus, string> = {
  draft: 'default',
  ordered: 'blue',
  partial: 'orange',
  received: 'green',
  cancelled: 'red',
};

export default function PurchaseList() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { isOwner, isAdmin } = useAuth();
  const canEdit = isOwner || isAdmin;

  const { data: orders, isLoading } = useQuery({
    queryKey: ['purchase-orders'],
    queryFn: async () => {
      const { data } = await supabase
        .from('purchase_orders')
        .select('*, suppliers(name)')
        .order('created_at', { ascending: false });
      return (data ?? []) as (PurchaseOrder & { suppliers: { name: string } | null })[];
    },
    staleTime: 0,
    refetchOnMount: true,
  });

  const handleDownload = async (order: PurchaseOrder) => {
    const { data: supData } = await supabase
      .from('purchase_orders')
      .select('*, purchase_items(*), suppliers(*)')
      .eq('id', order.id)
      .single();
    if (!supData) { message.error('获取数据失败'); return; }
    const items = (supData.purchase_items ?? []) as PurchaseItem[];
    const supplier = supData.suppliers as Supplier | null;
    exportPurchasePDF(supData as PurchaseOrder, items, supplier);
  };

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('purchase_orders').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['purchase-orders'] });
      message.success('采购单已删除');
      logOperation('purchase_order', 'delete');
    },
    onError: (error: Error) => message.error(error.message),
  });

  const columns = [
    { title: '采购单号', dataIndex: 'order_no', key: 'order_no', width: 180 },
    {
      title: '供应商', key: 'supplier', width: 150,
      render: (_: unknown, r: PurchaseOrder & { suppliers: { name: string } | null }) => r.suppliers?.name || '-',
    },
    { title: '日期', dataIndex: 'order_date', key: 'order_date', width: 110 },
    {
      title: '金额', dataIndex: 'total_amount', key: 'total_amount', width: 120,
      render: (v: number | null) => v ? `¥${Number(v).toFixed(2)}` : '-',
    },
    {
      title: '状态', dataIndex: 'status', key: 'status', width: 100,
      render: (v: PurchaseStatus) => <Tag color={statusColors[v]}>{statusLabels[v]}</Tag>,
    },
    {
      title: '操作', key: 'actions', width: 200,
      render: (_: unknown, record: PurchaseOrder) => (
        <Space>
          <Button size="small" onClick={() => navigate(`/purchases/edit/${record.id}`)}>查看</Button>
          <Button size="small" icon={<DownloadOutlined />} onClick={() => handleDownload(record)}>PDF</Button>
          {canEdit && record.status === 'draft' && (
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
      <Card>
        <Space style={{ marginBottom: 16, width: '100%', justifyContent: 'flex-end' }}>
          {canEdit && (
            <Button type="primary" icon={<PlusOutlined />} onClick={() => navigate('/purchases/new')}>
              新建采购单
            </Button>
          )}
        </Space>
        <Table
          dataSource={orders}
          columns={columns}
          rowKey="id"
          loading={isLoading}
          pagination={{ pageSize: 20, showSizeChanger: true, showTotal: (t) => `共 ${t} 条` }}
          scroll={{ x: 800 }}
        />
      </Card>
    </div>
  );
}
