// Warm up lazy route chunks ahead of navigation so tapping a bottom-nav
// item on mobile doesn't wait for the chunk download before first paint.
// Each entry holds the dynamic import thunk for a route page.
const routeImports: Record<string, () => Promise<unknown>> = {
  '/finance': () => import('../pages/finance/TransactionList'),
  '/customers': () => import('../pages/customers/CustomerList'),
  '/tasks': () => import('../pages/tasks/TaskList'),
  '/orders': () => import('../pages/orders/OrderList'),
};

// Kick off loading once per session; failures retry on the next call.
const started = new Set<string>();

export function lazyPrefetch(path: string) {
  const load = routeImports[path];
  if (!load || started.has(path)) return;
  started.add(path);
  load().catch(() => started.delete(path));
}
