-- ============================================================
-- CRM v10 fix - 创建缺失函数 + 修正 order_items RLS
-- ============================================================

-- 补创建函数（v10 可能因错误未完全执行）
CREATE OR REPLACE FUNCTION current_user_is_admin_or_owner()
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM organization_members
    WHERE user_id = auth.uid() AND role IN ('owner', 'admin')
  );
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- 扩展 role 允许值（幂等）
ALTER TABLE organization_members DROP CONSTRAINT IF EXISTS organization_members_role_check;
ALTER TABLE organization_members ADD CONSTRAINT organization_members_role_check CHECK (role IN ('owner', 'admin', 'member'));

-- 补创建 set_member_role（v10 可能因错误未执行）
DROP FUNCTION IF EXISTS set_member_role;
CREATE OR REPLACE FUNCTION set_member_role(
  p_user_id UUID,
  p_role TEXT
) RETURNS JSON AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM organization_members WHERE user_id = auth.uid() AND role = 'owner') THEN
    RETURN json_build_object('error', '仅主账号可操作');
  END IF;
  IF p_role NOT IN ('admin', 'member') THEN
    RETURN json_build_object('error', '无效角色');
  END IF;
  UPDATE organization_members SET role = p_role WHERE user_id = p_user_id AND org_id IN (SELECT get_my_org_ids());
  RETURN json_build_object('success', true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 修正 order_items 和 quotation_items 的 RLS
DROP POLICY IF EXISTS "order_items_select" ON order_items;
DROP POLICY IF EXISTS "order_items_update" ON order_items;
DROP POLICY IF EXISTS "order_items_delete" ON order_items;
DROP POLICY IF EXISTS "order_items_insert" ON order_items;

-- order_items 使用 order_id 关联 orders
CREATE POLICY "order_items_select" ON order_items FOR SELECT USING (
  order_id IN (SELECT id FROM orders WHERE auth.uid() = user_id OR users_in_same_org(user_id))
);
CREATE POLICY "order_items_insert" ON order_items FOR INSERT WITH CHECK (
  order_id IN (SELECT id FROM orders WHERE auth.uid() = user_id)
);
CREATE POLICY "order_items_update" ON order_items FOR UPDATE USING (
  order_id IN (SELECT id FROM orders WHERE auth.uid() = user_id OR (current_user_is_admin_or_owner() AND users_in_same_org(user_id)))
);
CREATE POLICY "order_items_delete" ON order_items FOR DELETE USING (
  order_id IN (SELECT id FROM orders WHERE auth.uid() = user_id OR (current_user_is_admin_or_owner() AND users_in_same_org(user_id)))
);
