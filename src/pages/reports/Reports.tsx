import { Card, Col, Row, Space, Statistic, Table, Spin, DatePicker, Button } from 'antd';
import { ArrowUpOutlined, ArrowDownOutlined, DownloadOutlined } from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '../../supabase';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend,
} from 'recharts';
import { useState } from 'react';
import dayjs from 'dayjs';
import * as XLSX from 'xlsx';

const COLORS = ['#52c41a', '#ff4d4f', '#1677ff', '#faad14', '#722ed1', '#13c2c2', '#eb2f96', '#fa8c16'];

export default function Reports() {
  const [year, setYear] = useState(dayjs().year());

  const { data: monthlyData, isLoading } = useQuery({
    queryKey: ['monthly-report', year],
    queryFn: async () => {
      const start = `${year}-01-01`;
      const end = `${year}-12-31`;

      const [{ data: incomes }, { data: expenses }] = await Promise.all([
        supabase.from('transactions').select('date,amount').eq('type', 'income').gte('date', start).lte('date', end),
        supabase.from('transactions').select('date,amount').eq('type', 'expense').gte('date', start).lte('date', end),
      ]);

      const months = Array.from({ length: 12 }, (_, i) => {
        const m = String(i + 1).padStart(2, '0');
        const inc = (incomes ?? []).filter((t: Record<string, unknown>) => (t.date as string).startsWith(`${year}-${m}`)).reduce((s: number, t: Record<string, unknown>) => s + Number(t.amount), 0);
        const exp = (expenses ?? []).filter((t: Record<string, unknown>) => (t.date as string).startsWith(`${year}-${m}`)).reduce((s: number, t: Record<string, unknown>) => s + Number(t.amount), 0);
        return { month: `${m}月`, 收入: inc, 支出: exp };
      });

      const totalIncome = months.reduce((s, m) => s + m.收入, 0);
      const totalExpense = months.reduce((s, m) => s + m.支出, 0);

      return { months, totalIncome, totalExpense };
    },
  });

  const { data: accountData } = useQuery({
    queryKey: ['account-breakdown', year],
    queryFn: async () => {
      const start = `${year}-01-01`;
      const end = `${year}-12-31`;

      const { data } = await supabase
        .from('transactions')
        .select('amount,type,accounts(name)')
        .gte('date', start)
        .lte('date', end);

      const incomeMap: Record<string, number> = {};
      const expenseMap: Record<string, number> = {};

      (data ?? []).forEach((t: Record<string, unknown>) => {
        const acc = t.accounts as Record<string, string> | null;
        const name = acc?.name ?? '未分类';
        const amount = Number(t.amount);
        if (t.type === 'income') {
          incomeMap[name] = (incomeMap[name] ?? 0) + amount;
        } else {
          expenseMap[name] = (expenseMap[name] ?? 0) + amount;
        }
      });

      return {
        income: Object.entries(incomeMap).map(([name, value]) => ({ name, value })),
        expense: Object.entries(expenseMap).map(([name, value]) => ({ name, value })),
      };
    },
  });

  const { data: customerRank } = useQuery({
    queryKey: ['customer-rank', year],
    queryFn: async () => {
      const start = `${year}-01-01`;
      const end = `${year}-12-31`;

      const { data } = await supabase
        .from('transactions')
        .select('amount,customers(name)')
        .eq('type', 'income')
        .gte('date', start)
        .lte('date', end);

      const map: Record<string, number> = {};
      (data ?? []).forEach((t: Record<string, unknown>) => {
        const cus = t.customers as Record<string, string> | null;
        const name = cus?.name ?? '未关联客户';
        map[name] = (map[name] ?? 0) + Number(t.amount);
      });

      return Object.entries(map)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .map(([name, amount], i) => ({ key: i, name, amount }));
    },
  });

  const handleExport = () => {
    const wb = XLSX.utils.book_new();

    // Sheet 1: 月度收支
    const monthlyRows = (monthlyData?.months ?? []).map((m) => ({
      '月份': m.month,
      '收入 (¥)': m.收入,
      '支出 (¥)': m.支出,
      '结余 (¥)': m.收入 - m.支出,
    }));
    const ws1 = XLSX.utils.json_to_sheet(monthlyRows);
    XLSX.utils.book_append_sheet(wb, ws1, '月度收支');

    // Sheet 2: 收入科目
    const incomeRows = (accountData?.income ?? []).map((item) => ({
      '科目': item.name,
      '金额 (¥)': item.value,
    }));
    const ws2 = XLSX.utils.json_to_sheet(incomeRows);
    XLSX.utils.book_append_sheet(wb, ws2, '收入科目');

    // Sheet 3: 支出科目
    const expenseRows = (accountData?.expense ?? []).map((item) => ({
      '科目': item.name,
      '金额 (¥)': item.value,
    }));
    const ws3 = XLSX.utils.json_to_sheet(expenseRows);
    XLSX.utils.book_append_sheet(wb, ws3, '支出科目');

    // Sheet 4: 客户排行
    const rankRows = (customerRank ?? []).map((item, i) => ({
      '排名': i + 1,
      '客户': item.name,
      '贡献金额 (¥)': item.amount,
    }));
    const ws4 = XLSX.utils.json_to_sheet(rankRows);
    XLSX.utils.book_append_sheet(wb, ws4, '客户贡献排行');

    XLSX.writeFile(wb, `财务报表_${year}年.xlsx`);
  };

  if (isLoading) return <Spin />;

  return (
    <div>
      <Space style={{ marginBottom: 16 }}>
        <DatePicker picker="year" value={dayjs(`${year}`)} onChange={(d) => setYear(d?.year() ?? dayjs().year())} />
        <Button icon={<DownloadOutlined />} onClick={handleExport}>
          导出 Excel
        </Button>
      </Space>

      <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
        <Col xs={24} sm={8}>
          <Card>
            <Statistic title="年度收入" value={monthlyData?.totalIncome ?? 0} precision={2}
              prefix={<ArrowUpOutlined style={{ color: '#52c41a' }} />} suffix="元" />
          </Card>
        </Col>
        <Col xs={24} sm={8}>
          <Card>
            <Statistic title="年度支出" value={monthlyData?.totalExpense ?? 0} precision={2}
              prefix={<ArrowDownOutlined style={{ color: '#ff4d4f' }} />} suffix="元" />
          </Card>
        </Col>
        <Col xs={24} sm={8}>
          <Card>
            <Statistic title="年度结余" value={(monthlyData?.totalIncome ?? 0) - (monthlyData?.totalExpense ?? 0)}
              precision={2} suffix="元" />
          </Card>
        </Col>
      </Row>

      <Card title="月度收支趋势" style={{ marginBottom: 24 }}>
        <ResponsiveContainer width="100%" height={350}>
          <BarChart data={monthlyData?.months ?? []}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="month" />
            <YAxis />
            <Tooltip formatter={(v) => `¥${Number(v).toFixed(2)}`} />
            <Bar dataKey="收入" fill="#52c41a" />
            <Bar dataKey="支出" fill="#ff4d4f" />
          </BarChart>
        </ResponsiveContainer>
      </Card>

      <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
        <Col xs={24} lg={12}>
          <Card title="收入科目占比">
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie data={accountData?.income ?? []} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={100} label={({ name, value }) => `${name} ¥${value.toFixed(0)}`}>
                  {(accountData?.income ?? []).map((_, i) => (
                    <Cell key={i} fill={COLORS[i % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip formatter={(v) => `¥${Number(v).toFixed(2)}`} />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </Card>
        </Col>
        <Col xs={24} lg={12}>
          <Card title="支出科目占比">
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie data={accountData?.expense ?? []} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={100} label={({ name, value }) => `${name} ¥${value.toFixed(0)}`}>
                  {(accountData?.expense ?? []).map((_, i) => (
                    <Cell key={i} fill={COLORS[i % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip formatter={(v) => `¥${Number(v).toFixed(2)}`} />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </Card>
        </Col>
      </Row>

      <Card title="客户贡献排行（Top 10）">
        <Table
          dataSource={customerRank ?? []}
          columns={[
            { title: '排名', dataIndex: 'key', key: 'key', width: 60, render: (_: unknown, __: unknown, i: number) => i + 1 },
            { title: '客户', dataIndex: 'name', key: 'name' },
            { title: '贡献金额', dataIndex: 'amount', key: 'amount', render: (v: number) => `¥${v.toFixed(2)}` },
          ]}
          pagination={false}
          size="small"
          rowKey="key"
        />
      </Card>
    </div>
  );
}
