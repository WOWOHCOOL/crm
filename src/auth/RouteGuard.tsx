import type { ReactNode } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Result, Button } from 'antd';
import { LockOutlined } from '@ant-design/icons';
import { useAuth } from './AuthContext';
import { permissionForPath } from './routePermissions';

/**
 * 路由级权限守卫。
 *
 * 背景：侧边栏按权限隐藏了菜单入口，但路由没有任何校验 ——
 * 成员直接敲 #/finance 依然能打开页面，权限只挡菜单不挡访问。
 * 这里补上路由级校验，让「菜单不可见」与「URL 不可达」一致。
 *
 * 主账号与管理员直接放行（与 MainLayout 的 hasPerm 语义一致：
 * hasPerm = isOwner || isAdmin || permissions.includes(k)）。
 *
 * 不做静默重定向 —— 直接说明原因并给一个返回入口，比莫名跳回首页更好排查。
 */
export default function RouteGuard({ children }: { children: ReactNode }) {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const { permissions, isOwner, isAdmin } = useAuth();

  const need = permissionForPath(pathname);
  const allowed = need === null
    || (need === 'owner' ? isOwner : (isOwner || isAdmin || permissions.includes(need)));

  if (allowed) return <>{children}</>;

  return (
    <Result
      icon={<LockOutlined style={{ color: '#d4a843' }} />}
      status="403"
      title="无访问权限"
      subTitle={need === 'owner'
        ? '该页面仅主账号可访问。'
        : '你当前的角色没有这个模块的权限，请联系主账号在「团队管理 → 成员」中配置。'}
      extra={<Button type="primary" onClick={() => navigate('/')}>返回仪表盘</Button>}
    />
  );
}
