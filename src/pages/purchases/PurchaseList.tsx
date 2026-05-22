import { useNavigate } from 'react-router-dom';
import {
  Table, Button, Space, Tag, Card, Popconfirm, message, Select,
} from 'antd';
import { PlusOutlined, DownloadOutlined, DollarOutlined } from '@ant-design/icons';
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

/** Allowed next statuses from each status */
const nextStatuses: Partial<Record<PurchaseStatus, PurchaseStatus[]>> = {
  draft: ['ordered', 'cancelled'],
  ordered: ['partial', 'received', 'cancelled'],
  partial: ['received', 'cancelled'],
  received: [],
  cancelled: ['draft'],
};

export default function PurchaseList() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { isOwner, isAdmin } = useAuth();
  const canEdit = isOwner || isAdmin;

  // Also fetch linked transactions for finance status
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

  // Fetch linked transactions
  const { data: linkedTxns } = useQuery({
    queryKey: ['purchase-linked-txns'],
    queryFn: async () => {
      if (!orders || orders.length === 0) return {};
      const { data } = await supabase
        .from('transactions')
        .select('id, ref_id, amount')
        .eq('ref_type', 'purchase_order')
        .in('ref_id', orders.map(o => o.id));
      const map: Record<string, { id: string; ref_id: string | null; amount: number }> = {};
      (data ?? []).forEach((t: { id: string; ref_id: string | null; amount: number }) => { if (t.ref_id) map[t.ref_id] = t; });
      return map;
    },
    enabled: !!orders && orders.length > 0,
  });

  const handleStatusChange = async (id: string, newStatus: PurchaseStatus) => {
    // 1. Update purchase order status
    const { data: updatedOrder, error: updateErr } = await supabase
      .from('purchase_orders')
      .update({ status: newStatus })
      .eq('id', id)
      .select('order_no')
      .single();
    if (updateErr) { message.error(updateErr.message); return; }

    // 2. Auto-create expense transaction when ordered/received
    if (newStatus === 'ordered' || newStatus === 'received') {
      const { data: order } = await supabase
        .from('purchase_orders')
        .select('*, suppliers(name)')
        .eq('id', id)
        .single();
      if (!order) return;

      // Check if transaction already exists
      const { data: existing } = await supabase
        .from('transactions')
        .select('id')
        .eq('ref_type', 'purchase_order')
        .eq('ref_id', id)
        .maybeSingle();

      if (!existing) {
        // Find "商品采购成本" account, fallback to first expense account
        const { data: accounts } = await supabase
          .from('accounts')
          .select('id')
          .eq('name', '商品采购成本')
          .limit(1);
        let accountId = accounts?.[0]?.id || null;
        if (!accountId) {
          const { data: fallback } = await supabase
            .from('accounts')
            .select('id')
            .eq('type', 'expense')
            .order('created_at')
            .limit(1);
          accountId = fallback?.[0]?.id || null;
        }

        const { data: { user } } = await supabase.auth.getUser();
        const supplierName = (order as any).suppliers?.name || '';

        const { error: txErr } = await supabase.from('transactions').insert([{
          type: 'expense',
          amount: order.total_amount || 0,
          description: `采购单 ${order.order_no} - ${supplierName}`,
          date: order.order_date,
          account_id: accountId,
          ref_type: 'purchase_order',
          ref_id: id,
          user_id: user?.id,
        }]);
        if (txErr) console.error('Failed to create transaction:', txErr);
      }
    }

    // 3. Remove linked transaction if cancelled
    if (newStatus === 'cancelled') {
      await supabase
        .from('transactions')
        .delete()
        .eq('ref_type', 'purchase_order')
        .eq('ref_id', id);
    }

    queryClient.invalidateQueries({ queryKey: ['purchase-orders'] });
    queryClient.invalidateQueries({ queryKey: ['purchase-linked-txns'] });
    queryClient.invalidateQueries({ queryKey: ['transactions'] });
    queryClient.invalidateQueries({ queryKey: ['recent-transactions'] });
    queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] });
    message.success(`状态已更新为「${statusLabels[newStatus]}」`);
    logOperation('purchase_order', 'status_change', id, `${updatedOrder?.order_no || ''} → ${newStatus}`);
  };

  const statusChangeMutation = useMutation({
    mutationFn: ({ id, newStatus }: { id: string; newStatus: PurchaseStatus }) =>
      handleStatusChange(id, newStatus),
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
      title: '财务', key: 'finance', width: 60,
      render: (_: unknown, r: PurchaseOrder) => {
        const tx = linkedTxns?.[r.id];
        const inFinancialStatus = r.status === 'ordered' || r.status === 'partial' || r.status === 'received';
        return tx ? (
          <Tag color="green" style={{ borderRadius: 6 }}>
            <DollarOutlined /> 已记账
          </Tag>
        ) : inFinancialStatus ? (
          <Tag color="orange" style={{ borderRadius: 6 }}>
            <DollarOutlined /> 待记账
          </Tag>
        ) : null;
      },
    },
    {
      title: '操作', key: 'actions', width: 280,
      render: (_: unknown, record: PurchaseOrder) => {
        const nextOpts = nextStatuses[record.status] ?? [];
        return (
          <Space size="small" wrap>
            <Button size="small" onClick={() => navigate(`/purchases/edit/${record.id}`)}>
              {record.status === 'draft' ? '编辑' : '查看'}
            </Button>
            <Button size="small" icon={<DownloadOutlined />} onClick={() => handleDownload(record)}>PDF</Button>
            {canEdit && nextOpts.length > 0 && (
              <Select
                size="small"
                placeholder="变更状态"
                style={{ width: 110 }}
                onChange={(val: PurchaseStatus) => statusChangeMutation.mutate({ id: record.id, newStatus: val })}
                options={nextOpts.map(s => ({ label: statusLabels[s], value: s }))}
              />
            )}
            {canEdit && record.status === 'draft' && (
              <Popconfirm title="确定删除？" onConfirm={() => deleteMutation.mutate(record.id)}>
                <Button size="small" danger>删除</Button>
              </Popconfirm>
            )}
          </Space>
        );
      },
    },
  ];

  return (
    <div>
      <Card title="供应商采购单">
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
          scroll={{ x: 1000 }}
        />
      </Card>
    </div>
  );
}
