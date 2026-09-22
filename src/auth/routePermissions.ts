import type { Permission } from '../types';

/**
 * 路径 → 所需权限的单一映射。
 *
 * 侧边栏菜单是人工分组的树（见 MainLayout 的 menuItems），这里是同一套权限模型
 * 在路由上的投影，两者必须一致 —— 否则会出现「菜单里看不到、敲 URL 却能打开」
 * 这种权限形同虚设的状态（本项目原先正是如此）。
 *
 * 返回值：
 *   null      → 不需要权限（仪表盘）
 *   'owner'   → 仅主账号（团队管理）
 *   Permission→ 对应权限键（主账号/管理员在守卫里直接放行）
 *
 * 注意：这是 UI 层的收敛，不是安全边界。真正的数据隔离应由 Supabase RLS 负责。
 */
export function permissionForPath(pathname: string): Permission | 'owner' | null {
  const seg0 = pathname.split('/').filter(Boolean)[0];
  switch (seg0) {
    case undefined: // 仪表盘
      return null;

    // 客户管理组：销售订单与客户同组（侧边栏归在「客户管理」下）
    case 'inquiries':
    case 'customers':
    case 'orders':
      return 'customers';

    case 'quotations':
      return 'quotations';

    // 供应商管理组：供应商资料与采购单都归在该组下，由 products 权限把守
    case 'products':
    case 'suppliers':
    case 'purchases':
      return 'products';

    case 'finance':
      return 'finance';

    case 'accounts':
      return 'accounts';

    case 'reports':
      return 'reports';

    case 'tasks':
      return 'tasks';

    case 'org':
      return 'owner';

    default:
      return null;
  }
}
