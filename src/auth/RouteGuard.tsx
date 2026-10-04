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
 * ⚠️ 判定一律走 `hasPerm` 这一个入口。原先这里手写了一遍
 * 「isOwner || isAdmin || permissions.includes(need)」，等于第二套判定 ——
 * 一旦 hasPerm 的语义调整（例如管理员是否绕过开关），这里就会悄悄漂移，
 * 出现「菜单藏了但路由放行」这类只在特定角色下复现的裂缝。
 *
 * 不做静默重定向 —— 直接说明原因并给一个返回入口，比莫名跳回首页更好排查。
 */
export default function RouteGuard({ children }: { children: ReactNode }) {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const { hasPerm, isOwner } = useAuth();

  const need = permissionForPath(pathname);
  const allowed = need === null
    || (need === 'owner'
      ? isOwner
      // 数组 = 任一命中即可（被多个模块共用的页面，见 routePermissions 的说明）
      : Array.isArray(need) ? need.some(k => hasPerm(k)) : hasPerm(need));

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
