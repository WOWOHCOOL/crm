import { HashRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ConfigProvider, Spin } from 'antd';
import zhCN from 'antd/locale/zh_CN';
import { AuthProvider, useAuth } from './auth/AuthContext';
import ProtectedRoute from './auth/ProtectedRoute';
import LoginPage from './auth/LoginPage';
import OrgSetup from './auth/OrgSetup';
import MainLayout from './layouts/MainLayout';
import Dashboard from './pages/Dashboard';
import CustomerList from './pages/customers/CustomerList';
import CustomerDetail from './pages/customers/CustomerDetail';
import TransactionList from './pages/finance/TransactionList';
import AccountManage from './pages/finance/AccountManage';
import Reports from './pages/reports/Reports';
import ProductList from './pages/products/ProductList';
import QuotationQuoList from './pages/quotations/QuotationQuoList';
import QuotationPIList from './pages/quotations/QuotationPIList';
import QuotationForm from './pages/quotations/QuotationForm';
import OrgManage from './pages/OrgManage';
import TaskList from './pages/tasks/TaskList';
import SupplierList from './pages/suppliers/SupplierList';
import PurchaseList from './pages/purchases/PurchaseList';
import PurchaseForm from './pages/purchases/PurchaseForm';
import OrderList from './pages/orders/OrderList';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 0,
      refetchOnMount: 'always',
      refetchOnWindowFocus: true,
    },
  },
});

/** 检查用户是否已设置团队，未设置则跳转到 /org-setup */
function OrgGuard({ children }: { children: React.ReactNode }) {
  const { orgLoading, hasOrgSetup } = useAuth();

  if (orgLoading) {
    return (
      <div style={{
        height: '100vh',
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
      }}>
        <Spin size="large" tip="加载中..." />
      </div>
    );
  }

  if (!hasOrgSetup) {
    return <Navigate to="/org-setup" replace />;
  }

  return <>{children}</>;
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ConfigProvider
        locale={zhCN}
        theme={{
          token: {
            colorPrimary: '#ff6b00',
            colorLink: '#ff6b00',
            borderRadius: 8,
            colorBgContainer: '#ffffff',
            colorBgLayout: '#f8f9fb',
            colorBorder: '#e8eaef',
            colorText: '#1e293b',
            colorTextSecondary: '#64748b',
            fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', 'Helvetica Neue', Arial, sans-serif",
          },
          components: {
            Menu: {
              colorItemBg: 'transparent',
              colorItemBgSelected: 'rgba(255,107,0,0.12)',
              colorItemText: 'rgba(255,255,255,0.65)',
              colorItemTextSelected: '#ff6b00',
              colorItemTextHover: '#ffffff',
              colorItemBgHover: 'rgba(255,255,255,0.06)',
              colorSubItemBg: 'transparent',
              borderRadius: 8,
              itemMarginInline: 12,
              itemMarginBlock: 2,
            },
            Layout: {
              colorBgHeader: '#ffffff',
              colorBgBody: '#f8f9fb',
              colorBgTrigger: '#0f172a',
            },
            Table: {
              headerBg: '#f8f9fb',
              headerColor: '#64748b',
              rowHoverBg: 'rgba(255,107,0,0.04)',
              borderColor: '#e8eaef',
            },
            Card: {
              paddingLG: 20,
            },
            Button: {
              primaryShadow: '0 2px 8px rgba(255,107,0,0.25)',
            },
          },
        }}
      >
        <HashRouter>
          <AuthProvider>
            <Routes>
              <Route path="/login" element={<LoginPage />} />
              <Route
                path="/org-setup"
                element={
                  <ProtectedRoute>
                    <OrgSetup />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/"
                element={
                  <ProtectedRoute>
                    <OrgGuard>
                      <MainLayout />
                    </OrgGuard>
                  </ProtectedRoute>
                }
              >
                <Route index element={<Dashboard />} />
                <Route path="customers" element={<CustomerList />} />
                <Route path="customers/:id" element={<CustomerDetail />} />
                <Route path="products" element={<ProductList />} />
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
