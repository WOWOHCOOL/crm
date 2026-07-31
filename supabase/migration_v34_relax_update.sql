-- ============================================================
-- CRM v34 - 放宽流水 UPDATE 权限（同组织成员可编辑）
-- ============================================================

-- 旧策略：只有创建者或 admin/owner 能编辑
-- 新策略：同组织内可见的流水都能编辑（SELECT 已经限制了可见范围）
DROP POLICY IF EXISTS "transactions_update" ON transactions;
CREATE POLICY "transactions_update" ON transactions FOR UPDATE
  USING (auth.uid() = user_id OR users_in_same_org(user_id))
  WITH CHECK (true);
