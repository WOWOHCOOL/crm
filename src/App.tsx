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
            colorPrimary: '#1677ff',
            borderRadius: 6,
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
              </Route>
            </Routes>
          </AuthProvider>
        </HashRouter>
      </ConfigProvider>
    </QueryClientProvider>
  );
}

export default App;
