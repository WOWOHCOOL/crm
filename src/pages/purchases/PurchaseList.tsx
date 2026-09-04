import { useNavigate } from 'react-router-dom';
import {
  Button, Space, Tag, Card, Popconfirm, message, Select,
} from 'antd';
import { PlusOutlined, DownloadOutlined, DollarOutlined } from '@ant-design/icons';
import ResponsiveTable from '../../components/ResponsiveTable';
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

  // Match supplier names to customer IDs for quick-bookkeep (case-insensitive)
  const { data: supplierCustomerMap } = useQuery({
    queryKey: ['supplier-customer-map', orders],
    queryFn: async () => {
      if (!orders || orders.length === 0) return {};
      const { data: customers } = await supabase.from('customers').select('id,name');
      const map: Record<string, string> = {};
      // Build lowercase lookup: customer name (lowercase) → customer id
      const custLowerMap: Record<string, string> = {};
      (customers ?? []).forEach((c: { id: string; name: string }) => {
        custLowerMap[c.name.toLowerCase().trim()] = c.id;
      });
      // Match each supplier name to a customer
      const supplierNames = [...new Set(orders.map(o => o.suppliers?.name).filter(Boolean) as string[])];
      supplierNames.forEach(name => {
        const cid = custLowerMap[name.toLowerCase().trim()];
        if (cid) map[name] = cid;
      });
      return map;
    },
    enabled: !!orders && orders.length > 0,
  });

  const handleStatusChange = async (id: string, newStatus: PurchaseStatus) => {
    const { data: updatedOrder, error: updateErr } = await supabase
      .from('purchase_orders')
      .update({ status: newStatus })
      .eq('id', id)
      .select('order_no')
      .single();
    if (updateErr) { message.error(updateErr.message); return; }

    queryClient.invalidateQueries({ queryKey: ['purchase-orders'] });
    queryClient.invalidateQueries({ queryKey: ['purchase-linked-txns'] });
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
      render: (v: number | null, r: PurchaseOrder) => {
        if (!v) return '-';
        const sym = r.currency === 'USD' ? '$' : '¥';
        const color = r.currency === 'USD' ? '#1677ff' : undefined;
        return <span style={{ fontWeight: 500, color }}>{sym}{Number(v).toFixed(2)}</span>;
      },
    },
    {
      title: '状态', dataIndex: 'status', key: 'status', width: 100,
      render: (v: PurchaseStatus) => <Tag color={statusColors[v]}>{statusLabels[v]}</Tag>,
    },
    {
      title: '财务', key: 'finance', width: 80,
      render: (_: unknown, r: PurchaseOrder & { suppliers: { name: string } | null }) => {
        const tx = linkedTxns?.[r.id];
        const needsAccounting = r.status === 'ordered' || r.status === 'partial' || r.status === 'received';
        if (tx) {
          return (
            <Tag color="green" style={{ borderRadius: 6, cursor: 'pointer' }}
              onClick={() => navigate(`/finance?edit=${tx.id}`)}>
              <DollarOutlined /> 已记账
            </Tag>
          );
        }
        if (needsAccounting) {
          const supplierName = r.suppliers?.name || '';
          const desc = `采购单 ${r.order_no}${supplierName ? ` - ${supplierName}` : ''}`;
          const custId = supplierName ? supplierCustomerMap?.[supplierName] : undefined;
          const params = new URLSearchParams({
            add: '1',
            ref_type: 'purchase_order',
            ref_id: r.id,
            amount: String(r.total_amount || 0),
            currency: r.currency || 'RMB',
            type: 'expense',
            description: desc,
          });
          if (custId) params.set('customer_id', custId);
          return (
            <Button size="small" type="primary" ghost icon={<DollarOutlined />}
              onClick={() => navigate(`/finance?${params.toString()}`)}>
              记账
            </Button>
          );
        }
        return null;
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
              <Popconfirm title="删除后无法恢复，确定删除此采购单？" onConfirm={() => deleteMutation.mutate(record.id)} okText="确认删除" cancelText="取消">
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
        <ResponsiveTable
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
