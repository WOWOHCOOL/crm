import { lazy, Suspense } from 'react';
import { HashRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ConfigProvider, Spin } from 'antd';
import zhCN from 'antd/locale/zh_CN';
import { AuthProvider } from './auth/AuthContext';
import ProtectedRoute from './auth/ProtectedRoute';
import LoginPage from './auth/LoginPage';
import MainLayout from './layouts/MainLayout';

// Route-level code splitting: each page loads on demand, keeping the
// initial bundle small (recharts/xlsx only ship with pages that use them).
const Dashboard = lazy(() => import('./pages/Dashboard'));
const CustomerList = lazy(() => import('./pages/customers/CustomerList'));
const InquiryList = lazy(() => import('./pages/customers/InquiryList'));
const CustomerDetail = lazy(() => import('./pages/customers/CustomerDetail'));
const TransactionList = lazy(() => import('./pages/finance/TransactionList'));
const AccountManage = lazy(() => import('./pages/finance/AccountManage'));
const Reports = lazy(() => import('./pages/reports/Reports'));
const ProductList = lazy(() => import('./pages/products/ProductList'));
const ProductDetail = lazy(() => import('./pages/products/ProductDetail'));
const QuotationQuoList = lazy(() => import('./pages/quotations/QuotationQuoList'));
const QuotationPIList = lazy(() => import('./pages/quotations/QuotationPIList'));
const QuotationForm = lazy(() => import('./pages/quotations/QuotationForm'));
const OrgManage = lazy(() => import('./pages/OrgManage'));
const TaskList = lazy(() => import('./pages/tasks/TaskList'));
const SupplierList = lazy(() => import('./pages/suppliers/SupplierList'));
const SupplierDetail = lazy(() => import('./pages/suppliers/SupplierDetail'));
const PurchaseList = lazy(() => import('./pages/purchases/PurchaseList'));
const PurchaseForm = lazy(() => import('./pages/purchases/PurchaseForm'));
const OrderList = lazy(() => import('./pages/orders/OrderList'));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      // Keep data fresh longer so revisiting a page shows cached content
      // instantly instead of waiting for a network round-trip.
      staleTime: 5 * 60_000,
      gcTime: 30 * 60_000,
      refetchOnMount: false,
      refetchOnWindowFocus: false,
    },
  },
});

const PageFallback = () => (
  <div style={{ display: 'flex', justifyContent: 'center', padding: 80 }}>
    <Spin size="large" />
  </div>
);

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
                <Route index element={<Suspense fallback={<PageFallback />}><Dashboard /></Suspense>} />
                <Route path="inquiries" element={<Suspense fallback={<PageFallback />}><InquiryList /></Suspense>} />
                <Route path="customers" element={<Suspense fallback={<PageFallback />}><CustomerList /></Suspense>} />
                <Route path="customers/:id" element={<Suspense fallback={<PageFallback />}><CustomerDetail /></Suspense>} />
                <Route path="products" element={<Suspense fallback={<PageFallback />}><ProductList /></Suspense>} />
                <Route path="products/:id" element={<Suspense fallback={<PageFallback />}><ProductDetail /></Suspense>} />
                <Route path="finance" element={<Suspense fallback={<PageFallback />}><TransactionList /></Suspense>} />
                <Route path="accounts" element={<Suspense fallback={<PageFallback />}><AccountManage /></Suspense>} />
                <Route path="reports" element={<Suspense fallback={<PageFallback />}><Reports /></Suspense>} />
                <Route path="quotations" element={<Suspense fallback={<PageFallback />}><QuotationQuoList /></Suspense>} />
                <Route path="quotations/quo" element={<Suspense fallback={<PageFallback />}><QuotationQuoList /></Suspense>} />
                <Route path="quotations/pi" element={<Suspense fallback={<PageFallback />}><QuotationPIList /></Suspense>} />
                <Route path="quotations/new" element={<Suspense fallback={<PageFallback />}><QuotationForm /></Suspense>} />
                <Route path="quotations/edit/:id" element={<Suspense fallback={<PageFallback />}><QuotationForm /></Suspense>} />
                <Route path="org" element={<Suspense fallback={<PageFallback />}><OrgManage /></Suspense>} />
                <Route path="tasks" element={<Suspense fallback={<PageFallback />}><TaskList /></Suspense>} />
                <Route path="orders" element={<Suspense fallback={<PageFallback />}><OrderList /></Suspense>} />
                <Route path="suppliers" element={<Suspense fallback={<PageFallback />}><SupplierList /></Suspense>} />
                <Route path="suppliers/:id" element={<Suspense fallback={<PageFallback />}><SupplierDetail /></Suspense>} />
                <Route path="purchases" element={<Suspense fallback={<PageFallback />}><PurchaseList /></Suspense>} />
                <Route path="purchases/new" element={<Suspense fallback={<PageFallback />}><PurchaseForm /></Suspense>} />
                <Route path="purchases/edit/:id" element={<Suspense fallback={<PageFallback />}><PurchaseForm /></Suspense>} />
              </Route>
            </Routes>
          </AuthProvider>
        </HashRouter>
      </ConfigProvider>
    </QueryClientProvider>
  );
}

export default App;
