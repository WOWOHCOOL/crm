import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Table, Button, Space, Input, message, Popconfirm, Card, Segmented, Tag } from 'antd';
import { PlusOutlined, SearchOutlined, DeleteOutlined, EditOutlined, DownloadOutlined } from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../supabase';
import type { Quotation } from '../../types';
import * as XLSX from 'xlsx';

export default function QuotationList() {
  const [search, setSearch] = useState('');
  const [tab, setTab] = useState<'quotation' | 'pi'>('quotation');
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const { data: quotations, isLoading } = useQuery({
    queryKey: ['quotations', tab, search],
    queryFn: async () => {
      let query = supabase.from('quotations').select('*').eq('type', tab).order('created_at', { ascending: false });
      if (search) {
        query = query.or(`quotation_no.ilike.%${search}%,customer_company.ilike.%${search}%`);
      }
      const { data } = await query;
      return (data ?? []) as Quotation[];
    },
    staleTime: 0,
    refetchOnMount: true,
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('quotations').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['quotations'] });
      message.success('已删除');
    },
    onError: (error: Error) => message.error(error.message),
  });

  const handleExportExcel = async (record: Quotation) => {
    const { data: items } = await supabase
      .from('quotation_items')
      .select('*, products(image_url)')
      .eq('quotation_id', record.id)
      .order('created_at');
    if (!items) return;

    const title = tab === 'quotation' ? 'QUOTATION' : 'PROFORMA INVOICE';
    const totalUSD = (items ?? []).reduce((s, i) => s + Number(i.unit_price_usd) * i.quantity, 0);
    const validUntil = new Date(new Date(record.created_at).getTime() + (record.valid_days || 15) * 86400000);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const wsData: any[] = [];
    const wb = XLSX.utils.book_new();

    // Header
    wsData.push([title]);
    wsData.push([`No: ${record.quotation_no}`]);
    wsData.push([`Date: ${new Date(record.created_at).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}`]);
    wsData.push([`Valid Until: ${validUntil.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}`]);
    wsData.push([]);

    // Supplier
    wsData.push(['SELLER:']);
    wsData.push(['Dong Yi Technology Co., Limited']);
    wsData.push(['Contact: Sales Department']);
    wsData.push(['Tel: +86-755-XXXXXXXX']);
    wsData.push(['Email: sales@wowohcool.com']);
    wsData.push(['Web: www.wowohcool.com']);
    wsData.push(['Address: Shenzhen, Guangdong, China']);
    wsData.push([]);

    // Customer
    wsData.push(['BUYER:']);
    wsData.push([record.customer_company || '____________________']);
    wsData.push([`Contact: ${record.customer_contact || '____________________'}`]);
    wsData.push([`Tel: ${record.customer_phone || '____________________'}`]);
    wsData.push([`Web: ${record.customer_website || '____________________'}`]);
    wsData.push([`Address: ${record.customer_address || '____________________'}`]);
    wsData.push([]);
    wsData.push([]);

    // Items
    if (tab === 'quotation') {
      wsData.push(['#', 'Model', 'Description', 'MOQ', 'Qty', 'Price (USD)', 'Total (USD)', 'Remarks']);
    } else {
      wsData.push(['#', 'Model', 'Qty', 'Price (USD)', 'Total (USD)']);
    }
    (items ?? []).forEach((item, i) => {
      if (tab === 'quotation') {
        wsData.push([i + 1, item.official_model, item.description || '', item.moq || 1, item.quantity,
          Number(item.unit_price_usd), Number(item.unit_price_usd) * item.quantity, item.remarks || '']);
      } else {
        wsData.push([i + 1, item.official_model, item.quantity,
          Number(item.unit_price_usd), Number(item.unit_price_usd) * item.quantity]);
      }
    });
    wsData.push([]);
    wsData.push([`TOTAL AMOUNT: $${totalUSD.toFixed(2)}`]);
    wsData.push([]);

    // Bank
    wsData.push(['BANK INFORMATION:']);
    wsData.push([`Beneficiary: ${record.bank_beneficiary || 'Dong Yi Technology Co., Limited'}`]);
    wsData.push([`Bank: ${record.bank_name || ''}`]);
    wsData.push([`Account: ${record.bank_account || ''}`]);
    wsData.push([`SWIFT: ${record.bank_swift || ''}`]);
    wsData.push([]);

    // Terms
    wsData.push(['TERMS & CONDITIONS:']);
    wsData.push([`Payment: ${record.payment_terms || ''}`]);
    wsData.push([`Delivery: ${record.delivery_time_global || record.delivery_time || ''}`]);
    wsData.push([`Validity: ${record.valid_days || 15} days`]);

    const ws = XLSX.utils.aoa_to_sheet(wsData);
    ws['!cols'] = [{ wch: 5 }, { wch: 25 }, { wch: 28 }, { wch: 6 }, { wch: 6 }, { wch: 14 }, { wch: 14 }, { wch: 20 }];

    XLSX.utils.book_append_sheet(wb, ws, title);
    XLSX.writeFile(wb, `${record.quotation_no}.xlsx`);
    message.success('Excel 已导出');
  };

  const title = tab === 'quotation' ? '报价单' : 'PI';
  const noPrefix = tab === 'quotation' ? 'QUO' : 'PI';

  const columns = [
    { title: `${title}编号`, dataIndex: 'quotation_no', key: 'quotation_no', width: 200 },
    { title: '客户公司', dataIndex: 'customer_company', key: 'customer_company', width: 180, render: (v: string | null) => v || '-' },
    { title: '日期', dataIndex: 'created_at', key: 'created_at', width: 120, render: (v: string) => new Date(v).toLocaleDateString('zh-CN') },
    { title: '状态', dataIndex: 'status', key: 'status', width: 80, render: (v: string) => <Tag>{v === 'draft' ? '草稿' : '已发送'}</Tag> },
    {
      title: '操作', key: 'actions', width: 240,
      render: (_: unknown, record: Quotation) => (
        <Space>
          <Button size="small" icon={<EditOutlined />} onClick={() => navigate(`/quotations/edit/${record.id}`)}>
            编辑
          </Button>
          <Button size="small" icon={<DownloadOutlined />} onClick={() => handleExportExcel(record)}>
            导出Excel
          </Button>
          <Popconfirm title="确定删除？" onConfirm={() => deleteMutation.mutate(record.id)}>
            <Button size="small" danger icon={<DeleteOutlined />}>删除</Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <div>
      <Card>
        <Space style={{ marginBottom: 16, width: '100%', justifyContent: 'space-between' }} wrap>
          <Space>
            <Segmented
              value={tab}
              onChange={(v) => setTab(v as 'quotation' | 'pi')}
              options={[
                { label: `报价单 (QUO)`, value: 'quotation' },
                { label: `PI管理 (PI)`, value: 'pi' },
              ]}
            />
            <Input
              placeholder={`搜索${title}编号 / 客户公司`}
              prefix={<SearchOutlined />}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              allowClear
              style={{ width: 260 }}
            />
          </Space>
          <Button type="primary" icon={<PlusOutlined />}
            onClick={() => navigate(`/quotations/new?type=${tab}`)}>
            新建{title}
          </Button>
        </Space>
        <Table
          dataSource={quotations}
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
