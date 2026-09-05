import { useState, useMemo } from 'react';
import { Card, Row, Col, Statistic, Spin, DatePicker, Button, Space, Tag, Select } from 'antd';
import { DownloadOutlined, ArrowUpOutlined, ArrowDownOutlined } from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '../../supabase';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend, AreaChart, Area, RadialBarChart, RadialBar,
} from 'recharts';
import dayjs from 'dayjs';
import { useResponsive } from '../../hooks/useResponsive';
import { ENTITY_LABELS, CURRENCY_SYMBOLS } from '../../types';
import type { CurrencyType, EntityType } from '../../types';
import ResponsiveTable from '../../components/ResponsiveTable';

// ── Premium Color Palette ──
const COLORS = {
  gold: '#d4a843',
  goldLight: '#e8c76a',
  blue: '#3b82f6',
  blueLight: '#60a5fa',
  green: '#10b981',
  greenLight: '#34d399',
  red: '#ef4444',
  purple: '#8b5cf6',
  cyan: '#06b6d4',
  orange: '#f59e0b',
  pink: '#ec4899',
  indigo: '#6366f1',
  text: '#1e293b',
  muted: '#94a3b8',
  bg: '#f8f9fb',
};

const CHART_COLORS = [COLORS.gold, COLORS.blue, COLORS.green, COLORS.orange, COLORS.purple, COLORS.cyan, COLORS.pink, COLORS.indigo, COLORS.red, '#14b8a6'];
const PIE_COLORS = ['#d4a843', '#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#06b6d4', '#ec4899', '#6366f1', '#ef4444', '#14b8a6', '#f97316', '#84cc16'];

const CustomTooltip = ({ active, payload, label, sym = '¥' }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div style={{
      background: '#fff', border: '1px solid #e2e8f0', borderRadius: 10,
      padding: '12px 16px', boxShadow: '0 8px 30px rgba(0,0,0,0.08)',
    }}>
      <div style={{ fontSize: 12, color: '#94a3b8', marginBottom: 6 }}>{label}</div>
      {payload.map((p: any, i: number) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 600, color: '#1e293b' }}>
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: p.color }} />
          {p.name}: {sym}{Number(p.value).toLocaleString('zh-CN', { minimumFractionDigits: 2 })}
        </div>
      ))}
    </div>
  );
};

const formatY = (v: number, sym = '¥') => v >= 10000 ? `${sym}${(v / 10000).toFixed(1)}w` : `${sym}${v.toFixed(0)}`;

export default function ReportPage() {
  const [year, setYear] = useState(dayjs().year());
  const [currencyFilter, setCurrencyFilter] = useState<string>('');
  const [entityFilter, setEntityFilter] = useState<string>('');
  const { isMobile } = useResponsive();

  // Fetch account IDs for entity filter
  const { data: entityAccountIds } = useQuery({
    queryKey: ['entity-account-ids', entityFilter],
    queryFn: async () => {
      if (!entityFilter) return null;
      const { data } = await supabase.from('accounts').select('id').eq('entity', entityFilter);
      return (data ?? []).map((a: { id: string }) => a.id);
    },
    enabled: !!entityFilter,
  });

  const currencySym = currencyFilter ? CURRENCY_SYMBOLS[currencyFilter as CurrencyType] : '¥';
  const currencyLabel = currencyFilter ? (currencyFilter === 'USD' ? '美元' : '人民币') : '全部币种';
  const entityLabel = entityFilter ? ENTITY_LABELS[entityFilter as EntityType] : '全部主体';

  const { data: monthlyData, isLoading } = useQuery({
    queryKey: ['monthly-report', year, currencyFilter, entityFilter],
    queryFn: async () => {
      const start = `${year}-01-01`;
      const end = `${year}-12-31`;
      const incQ = supabase.from('transactions').select('date,amount,currency').eq('type', 'income').gte('date', start).lte('date', end);
      const expQ = supabase.from('transactions').select('date,amount,currency').eq('type', 'expense').gte('date', start).lte('date', end);
      const { data: incRaw } = await (entityAccountIds ? incQ.in('account_id', entityAccountIds) : incQ);
      const { data: expRaw } = await (entityAccountIds ? expQ.in('account_id', entityAccountIds) : expQ);
      // Per-currency buckets: USD and RMB are never summed together.
      // No filter → aggregate only RMB in charts/KPI; USD totals are surfaced separately.
      const cur = currencyFilter || 'RMB';
      const pick = (rows: any[] | null) => (rows ?? []).filter((t: any) => (t.currency || 'RMB') === cur);
      const incomes = pick(incRaw);
      const expenses = pick(expRaw);
      const sumCur = (rows: any[] | null, c: string) => (rows ?? []).filter((t: any) => (t.currency || 'RMB') === c).reduce((s: number, t: any) => s + Number(t.amount), 0);
      const months = Array.from({ length: 12 }, (_, i) => {
        const m = String(i + 1).padStart(2, '0');
        const inc = incomes.filter((t: any) => (t.date as string).startsWith(`${year}-${m}`)).reduce((s: number, t: any) => s + Number(t.amount), 0);
        const exp = expenses.filter((t: any) => (t.date as string).startsWith(`${year}-${m}`)).reduce((s: number, t: any) => s + Number(t.amount), 0);
        return { month: `${m}月`, 收入: inc, 支出: exp, 利润: inc - exp };
      });
      return {
        months,
        totalIncome: months.reduce((s, m) => s + m.收入, 0),
        totalExpense: months.reduce((s, m) => s + m.支出, 0),
        otherCurrencyIncome: currencyFilter ? null : sumCur(incRaw, 'USD'),
        otherCurrencyExpense: currencyFilter ? null : sumCur(expRaw, 'USD'),
      };
    },
  });

  const { data: accountData } = useQuery({
    queryKey: ['account-breakdown', year, currencyFilter, entityFilter],
    queryFn: async () => {
      const start = `${year}-01-01`;
      const end = `${year}-12-31`;
      let query = supabase.from('transactions').select('amount,type,currency,accounts(name,entity)').gte('date', start).lte('date', end);
      if (entityAccountIds) query = query.in('account_id', entityAccountIds);
      const { data } = await query;
      // Same currency as the monthly view: filtered → that currency; no filter → RMB only
      const cur = currencyFilter || 'RMB';
      const im: Record<string, number> = {}, em: Record<string, number> = {};
      (data ?? []).forEach((t: any) => {
        if ((t.currency || 'RMB') !== cur) return;
        const name = (t.accounts as any)?.name ?? '未分类';
        if (t.type === 'income') im[name] = (im[name] ?? 0) + Number(t.amount);
        else em[name] = (em[name] ?? 0) + Number(t.amount);
      });
      return {
        income: Object.entries(im).map(([n, v]) => ({ name: n, value: v })),
        expense: Object.entries(em).map(([n, v]) => ({ name: n, value: v })),
      };
    },
  });

  const { data: customerRank } = useQuery({
    queryKey: ['customer-rank', year, currencyFilter, entityFilter],
    queryFn: async () => {
      const start = `${year}-01-01`;
      const end = `${year}-12-31`;
      let query = supabase.from('transactions').select('amount,currency,customers(name)').eq('type', 'income').gte('date', start).lte('date', end);
      if (entityAccountIds) query = query.in('account_id', entityAccountIds);
      const { data } = await query;
      // Group by (customer, currency) - USD and RMB are never summed together.
      // No filter → show only RMB (consistent with the monthly KPI view).
      const cur = currencyFilter || 'RMB';
      const map: Record<string, { name: string; currency: CurrencyType; amount: number }> = {};
      (data ?? []).forEach((t: any) => {
        if ((t.currency || 'RMB') !== cur) return;
        const n = (t.customers as any)?.name ?? '未关联';
        const c = (t.currency as CurrencyType) || 'RMB';
        const key = `${n}|${c}`;
        if (!map[key]) map[key] = { name: n, currency: c, amount: 0 };
        map[key].amount += Number(t.amount);
      });
      return Object.values(map)
        .sort((a, b) => b.amount - a.amount)
        .slice(0, 10)
        .map((r, i) => ({ rank: i + 1, ...r, sym: CURRENCY_SYMBOLS[r.currency] || '¥' }));
    },
  });

  const totalProfit = (monthlyData?.totalIncome ?? 0) - (monthlyData?.totalExpense ?? 0);
  const profitMargin = (monthlyData?.totalIncome ?? 0) > 0 ? ((totalProfit / (monthlyData?.totalIncome ?? 1)) * 100).toFixed(1) : '0.0';
  // When no currency filter is set, charts show RMB only; USD totals are not
  // summed in - shown as a separate line on the KPI cards instead.
  const usdNote = (v: number | null | undefined) =>
    v != null && v !== 0 ? `  + $${v.toLocaleString('en-US')} (USD,未计入)` : '';

  const handleExport = async () => {
    // xlsx (~430KB) loads on demand at export time
    const XLSX = await import('xlsx');
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet((monthlyData?.months ?? []).map((m: any) => ({ '月份': m.month, '收入': m.收入, '支出': m.支出, '利润': m.利润 }))), '月度收支');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet((accountData?.income ?? []).map((i: any) => ({ '科目': i.name, '金额': i.value }))), '收入科目');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet((accountData?.expense ?? []).map((i: any) => ({ '科目': i.name, '金额': i.value }))), '支出科目');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet((customerRank ?? []).map((r: any) => ({ '排名': r.rank, '客户': r.name, '币种': r.currency, '贡献金额': r.amount }))), '客户排行');
    XLSX.writeFile(wb, `财务报表_${year}年.xlsx`);
  };

  if (isLoading) return <div style={{ display: 'flex', justifyContent: 'center', padding: 80 }}><Spin size="large" /></div>;

  return (
    <div style={{ maxWidth: 1400, margin: '0 auto' }}>
      {/* ── Header ── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: COLORS.text }}>财务报表</h2>
          <p style={{ margin: '2px 0 0', fontSize: 13, color: COLORS.muted }}>
            {year}年 财务数据汇总（{currencyLabel}）
          </p>
        </div>
        <Space wrap>
          <Select
            style={{ width: 110 }}
            value={currencyFilter || undefined}
            placeholder="全部币种"
            allowClear
            onChange={(v) => setCurrencyFilter(v ?? '')}
            options={[
              { label: '¥ 人民币', value: 'RMB' },
              { label: '$ 美元', value: 'USD' },
            ]}
          />
          <Select
            style={{ width: 110 }}
            value={entityFilter || undefined}
            placeholder="全部主体"
            allowClear
            onChange={(v) => setEntityFilter(v ?? '')}
            options={Object.entries(ENTITY_LABELS).map(([value, label]) => ({ label, value }))}
          />
          <DatePicker picker="year" value={dayjs(`${year}`)} onChange={(d) => setYear(d?.year() ?? dayjs().year())} />
          <Button icon={<DownloadOutlined />} onClick={() => { void handleExport(); }}>导出 Excel</Button>
        </Space>
      </div>

      {/* ── KPI Row ── */}
      <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
        {[
          { label: `年度收入（${currencyLabel}）`, value: monthlyData?.totalIncome ?? 0, prefix: currencySym, color: COLORS.green, icon: <ArrowUpOutlined />, bg: '#ecfdf5', extra: usdNote(monthlyData?.otherCurrencyIncome) },
          { label: `年度支出（${currencyLabel}）`, value: monthlyData?.totalExpense ?? 0, prefix: currencySym, color: COLORS.red, icon: <ArrowDownOutlined />, bg: '#fef2f2', extra: usdNote(monthlyData?.otherCurrencyExpense) },
          { label: `年度利润（${currencyLabel}）`, value: totalProfit, prefix: currencySym, color: totalProfit >= 0 ? COLORS.gold : COLORS.red, icon: null, bg: totalProfit >= 0 ? '#fffbeb' : '#fef2f2', extra: '' },
          { label: '利润率', value: profitMargin, suffix: '%', color: COLORS.blue, icon: null, bg: '#eff6ff', extra: '' },
        ].map((card, i) => (
          <Col xs={12} sm={6} key={i}>
            <Card styles={{ body: { padding: '18px 20px' } }} style={{ borderRadius: 12, border: '1px solid #f0f0f0' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                  <div style={{ fontSize: 12, color: COLORS.muted, marginBottom: 4, fontWeight: 500 }}>{card.label}</div>
                  <div style={{ fontSize: 22, fontWeight: 700, color: card.color, lineHeight: 1.2 }}>
                    {card.prefix || ''}{Number(card.value).toLocaleString('zh-CN', { minimumFractionDigits: card.suffix ? 1 : 2 })}{card.suffix || ''}
                  </div>
                  {card.extra ? <div style={{ fontSize: 11, color: '#1677ff', marginTop: 4 }}>{card.extra}</div> : null}
                </div>
                {card.icon && <div style={{ width: 36, height: 36, borderRadius: 10, background: card.bg, color: card.color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18 }}>{card.icon}</div>}
              </div>
            </Card>
          </Col>
        ))}
      </Row>

      {/* ── Monthly Trend Area Chart ── */}
      <Card styles={{ body: { padding: 0 } }} style={{ marginBottom: 24, borderRadius: 12, border: '1px solid #f0f0f0', overflow: 'hidden' }}>
        <div style={{ padding: '18px 20px', borderBottom: '1px solid #f0f0f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 600, color: COLORS.text }}>月度收支趋势</div>
            <div style={{ fontSize: 12, color: COLORS.muted, marginTop: 2 }}>
              全年月度营收与支出变化{!currencyFilter && monthlyData?.otherCurrencyIncome ? '（仅人民币，USD 未计入）' : ''}
            </div>
          </div>
          <Space size={12}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: COLORS.muted }}><span style={{ width: 12, height: 3, borderRadius: 2, background: COLORS.gold }} /> 收入</span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: COLORS.muted }}><span style={{ width: 12, height: 3, borderRadius: 2, background: COLORS.red }} /> 支出</span>
          </Space>
        </div>
        <div style={{ padding: '8px 0 0' }}>
          <ResponsiveContainer width="100%" height={isMobile ? 240 : 320}>
            <AreaChart data={monthlyData?.months ?? []} margin={{ top: 10, right: 20, left: 10, bottom: 10 }}>
              <defs>
                <linearGradient id="gradIncome" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={COLORS.gold} stopOpacity={0.3} /><stop offset="100%" stopColor={COLORS.gold} stopOpacity={0.02} /></linearGradient>
                <linearGradient id="gradExpense" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={COLORS.red} stopOpacity={0.2} /><stop offset="100%" stopColor={COLORS.red} stopOpacity={0.02} /></linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
              <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: COLORS.muted }} />
              <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: COLORS.muted }} tickFormatter={(v: number) => formatY(v, currencySym)} />
              <Tooltip content={<CustomTooltip sym={currencySym} />} />
              <Area type="monotone" dataKey="收入" stroke={COLORS.gold} strokeWidth={2} fill="url(#gradIncome)" />
              <Area type="monotone" dataKey="支出" stroke={COLORS.red} strokeWidth={2} fill="url(#gradExpense)" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </Card>

      {/* ── Account Pie Charts ── */}
      <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
        {[
          { title: '收入科目占比', data: accountData?.income ?? [], total: monthlyData?.totalIncome ?? 0 },
          { title: '支出科目占比', data: accountData?.expense ?? [], total: monthlyData?.totalExpense ?? 0 },
        ].map((section, si) => (
          <Col xs={24} lg={12} key={si}>
            <Card styles={{ body: { padding: 0 } }} style={{ borderRadius: 12, border: '1px solid #f0f0f0', overflow: 'hidden', height: '100%' }}>
              <div style={{ padding: '16px 20px', borderBottom: '1px solid #f0f0f0' }}>
                <div style={{ fontSize: 15, fontWeight: 600, color: COLORS.text }}>{section.title}</div>
                <div style={{ fontSize: 12, color: COLORS.muted, marginTop: 2 }}>共 {section.data.length} 个科目</div>
              </div>
              {section.data.length > 0 ? (
                <div style={{ display: 'flex', alignItems: 'center', padding: '12px 0', flexDirection: isMobile ? 'column' : 'row' }}>
                  <ResponsiveContainer width={isMobile ? '100%' : '55%'} height={isMobile ? 240 : 280}>
                    <PieChart>
                      <Pie data={section.data} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={isMobile ? 40 : 50} outerRadius={isMobile ? 80 : 100} paddingAngle={3}>
                        {section.data.map((_: any, i: number) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} stroke="none" />)}
                      </Pie>
                      <Tooltip content={<CustomTooltip sym={currencySym} />} />
                    </PieChart>
                  </ResponsiveContainer>
                  <div style={{ flex: 1, paddingRight: isMobile ? 0 : 20, paddingLeft: isMobile ? 20 : 0, alignSelf: 'stretch' }}>
                    {section.data.slice(0, 6).map((item: any, i: number) => (
                      <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '5px 0', fontSize: 12, borderBottom: i < Math.min(section.data.length, 6) - 1 ? '1px solid #f5f5f5' : 'none' }}>
                        <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <span style={{ width: 8, height: 8, borderRadius: '50%', background: PIE_COLORS[i % PIE_COLORS.length], display: 'inline-block' }} />
                          {item.name}
                        </span>
                        <span style={{ fontWeight: 600, color: COLORS.text }}>{currencySym}{Number(item.value).toLocaleString()}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ) : <div style={{ padding: 40, textAlign: 'center', color: COLORS.muted, fontSize: 13 }}>暂无数据</div>}
            </Card>
          </Col>
        ))}
      </Row>

      {/* ── Customer Contribution ── */}
      <Card styles={{ body: { padding: 0 } }} style={{ marginBottom: 24, borderRadius: 12, border: '1px solid #f0f0f0', overflow: 'hidden' }}>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid #f0f0f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 600, color: COLORS.text }}>客户贡献排行</div>
            <div style={{ fontSize: 12, color: COLORS.muted, marginTop: 2 }}>Top 10 客户营收贡献</div>
          </div>
        </div>
        <Row>
          <Col xs={24} lg={14}>
            <div style={{ padding: '8px 20px 8px 0' }}>
              <ResponsiveContainer width="100%" height={isMobile ? 280 : 320}>
                <BarChart data={customerRank ?? []} margin={{ top: 16, right: 20, left: isMobile ? -10 : 10, bottom: 10 }} layout="vertical">
                  <defs>
                    <linearGradient id="gradBar" x1="0" y1="0" x2="1" y2="0"><stop offset="0%" stopColor={COLORS.gold} stopOpacity={0.7} /><stop offset="100%" stopColor={COLORS.goldLight} stopOpacity={1} /></linearGradient>
                    <linearGradient id="gradBarUsd" x1="0" y1="0" x2="1" y2="0"><stop offset="0%" stopColor={COLORS.blue} stopOpacity={0.7} /><stop offset="100%" stopColor={COLORS.blueLight} stopOpacity={1} /></linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" horizontal={false} />
                  <XAxis type="number" axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: COLORS.muted }} tickFormatter={(v: number) => formatY(v, currencySym)} />
                  <YAxis type="category" dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: isMobile ? 10 : 11, fill: COLORS.text }} width={isMobile ? 90 : 120} />
                  <Tooltip content={<CustomTooltip sym={currencySym} />} />
                  <Bar dataKey="amount" radius={[0, 4, 4, 0]} barSize={20}>
                    {(customerRank ?? []).map((r: any, i: number) => <Cell key={i} fill={r.currency === 'USD' ? 'url(#gradBarUsd)' : 'url(#gradBar)'} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Col>
          <Col xs={24} lg={10}>
            <div style={{ padding: '16px 20px' }}>
              <ResponsiveTable dataSource={customerRank ?? []} rowKey="rank" size="small" pagination={false}
                columns={[
                  { title: '#', dataIndex: 'rank', key: 'rank', width: 40, render: (v: number) => <Tag style={{ borderRadius: 10, minWidth: 22, textAlign: 'center' }}>{v}</Tag> },
                  { title: '客户', dataIndex: 'name', key: 'name', ellipsis: true },
                  { title: '币种', dataIndex: 'currency', key: 'currency', width: 60, render: (v: string) => <Tag color={v === 'USD' ? 'blue' : 'gold'} style={{ borderRadius: 6, margin: 0 }}>{v === 'USD' ? 'USD' : 'RMB'}</Tag> },
                  { title: '金额', dataIndex: 'amount', key: 'amount', render: (v: number, r: any) => <span style={{ fontWeight: 600 }}>{(r.sym || '¥')}{v.toLocaleString()}</span> },
                ]}
              />
            </div>
          </Col>
        </Row>
      </Card>
    </div>
  );
}
