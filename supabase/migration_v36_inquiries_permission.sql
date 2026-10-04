-- ============================================================
-- CRM v36 - 新增「询盘管理」权限（inquiries），与「客户管理」解耦
-- 执行方式：在 Supabase SQL Editor 中执行
-- ============================================================
--
-- 背景：/inquiries（询盘线索）此前由 customers 权限把守，权限清单里没有独立的一项，
-- 于是「只给询盘、不给客户」和「只给客户、不给询盘」都做不到。
-- 前端已把 inquiries 拆成独立的权限键（见 src/types/index.ts 的 ALL_PERMISSIONS）。
--
-- member_permissions.permission 是 TEXT 且**没有 CHECK 约束**，
-- 所以新增权限键**不需要改表结构**，本文件只做一件事：数据回填。
--
-- ⚠️ 回填的必要性：拆分前「有 customers 权限」隐含「能看询盘」。
-- 若不回填，那些成员会**静默失去询盘入口**（菜单项消失、敲 URL 撞 403）。
-- 本脚本把「当前 customers = true」的成员补上 inquiries = true，
-- 行为与拆分前完全一致；之后主账号可以在「团队管理 → 成员 → 配置权限」里单独取消。
--
-- 幂等：可重复执行。用 DO NOTHING 而不是 DO UPDATE ——
-- 若某行已存在且被主账号显式设成了 false，重复执行不应把它改回 true。

INSERT INTO member_permissions (org_id, user_id, permission, allowed)
SELECT org_id, user_id, 'inquiries', true
FROM member_permissions
WHERE permission = 'customers'
  AND allowed = true
ON CONFLICT (org_id, user_id, permission) DO NOTHING;

-- 校验：回填后，凡「有 customers 权限」的成员都应同时有 inquiries 权限。
-- 下面这句应当返回 0 行；返回非 0 说明还有成员会被挡在询盘之外。
--
-- SELECT c.user_id
-- FROM member_permissions c
-- LEFT JOIN member_permissions i
--   ON i.org_id = c.org_id AND i.user_id = c.user_id AND i.permission = 'inquiries'
-- WHERE c.permission = 'customers' AND c.allowed = true
--   AND (i.id IS NULL OR i.allowed = false);
