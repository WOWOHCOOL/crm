import { HashRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ConfigProvider } from 'antd';
import zhCN from 'antd/locale/zh_CN';
import { AuthProvider } from './auth/AuthContext';
import ProtectedRoute from './auth/ProtectedRoute';
import LoginPage from './auth/LoginPage';
import MainLayout from './layouts/MainLayout';
import Dashboard from './pages/Dashboard';
import CustomerList from './pages/customers/CustomerList';
import InquiryList from './pages/customers/InquiryList';
import CustomerDetail from './pages/customers/CustomerDetail';
import TransactionList from './pages/finance/TransactionList';
import AccountManage from './pages/finance/AccountManage';
import Reports from './pages/reports/Reports';
import ProductList from './pages/products/ProductList';
import ProductDetail from './pages/products/ProductDetail';
import QuotationQuoList from './pages/quotations/QuotationQuoList';
import QuotationPIList from './pages/quotations/QuotationPIList';
import QuotationForm from './pages/quotations/QuotationForm';
import OrgManage from './pages/OrgManage';
import TaskList from './pages/tasks/TaskList';
import SupplierList from './pages/suppliers/SupplierList';
import SupplierDetail from './pages/suppliers/SupplierDetail';
import PurchaseList from './pages/purchases/PurchaseList';
import PurchaseForm from './pages/purchases/PurchaseForm';
import OrderList from './pages/orders/OrderList';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 60_000,
      gcTime: 5 * 60_000,
      refetchOnMount: true,
      refetchOnWindowFocus: false,
    },
  },
});

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ConfigProvider
        locale={zhCN}
        theme={{
          token: {
            colorPrimary: '#1677ff',
            colorSuccess: '#52c41a',
            colorWarning: '#fa8c16',
            colorError: '#ff4d4f',
            borderRadius: 6,
            colorText: 'rgba(0,0,0,0.88)',
            colorTextSecondary: 'rgba(0,0,0,0.65)',
            colorTextTertiary: 'rgba(0,0,0,0.45)',
            colorBorder: '#f0f0f0',
            colorBorderSecondary: '#f5f5f5',
            colorBgLayout: '#f5f5f5',
            fontFamily: `-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif`,
            controlHeight: 36,
            lineHeight: 1.5715,
          },
          components: {
            Card: { borderRadiusLG: 8, paddingLG: 20 },
            Table: { borderRadiusLG: 8, headerBg: '#fafafa' },
            Button: { borderRadius: 6, controlHeight: 36 },
            Tag: { borderRadiusSM: 4 },
            Modal: { borderRadiusLG: 12 },
          },
        }}
      >
        <HashRouter>
          <AuthProvider>
            <Routes>
              <Route path="/login" element={<LoginPage />} />
              <Route
                path="/"
                element={
                  <ProtectedRoute>
                    <MainLayout />
                  </ProtectedRoute>
                }
              >
                <Route index element={<Dashboard />} />
                <Route path="inquiries" element={<InquiryList />} />
                <Route path="customers" element={<CustomerList />} />
                <Route path="customers/:id" element={<CustomerDetail />} />
                <Route path="products" element={<ProductList />} />
                <Route path="products/:id" element={<ProductDetail />} />
                <Route path="finance" element={<TransactionList />} />
                <Route path="accounts" element={<AccountManage />} />
                <Route path="reports" element={<Reports />} />
                <Route path="quotations" element={<QuotationQuoList />} />
                <Route path="quotations/quo" element={<QuotationQuoList />} />
                <Route path="quotations/pi" element={<QuotationPIList />} />
                <Route path="quotations/new" element={<QuotationForm />} />
                <Route path="quotations/edit/:id" element={<QuotationForm />} />
                <Route path="org" element={<OrgManage />} />
                <Route path="tasks" element={<TaskList />} />
                <Route path="orders" element={<OrderList />} />
                <Route path="suppliers" element={<SupplierList />} />
                <Route path="suppliers/:id" element={<SupplierDetail />} />
                <Route path="purchases" element={<PurchaseList />} />
                <Route path="purchases/new" element={<PurchaseForm />} />
                <Route path="purchases/edit/:id" element={<PurchaseForm />} />
              </Route>
            </Routes>
          </AuthProvider>
        </HashRouter>
      </ConfigProvider>
    </QueryClientProvider>
  );
}

export default App;
