-- ============================================================
-- CRM v10 fix - 修正 order_items RLS（quotation_id → order_id）
-- ============================================================
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
