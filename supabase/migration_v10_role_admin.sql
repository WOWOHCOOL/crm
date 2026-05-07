-- ============================================================
-- CRM v10 - 三层权限: owner / admin / member
-- ============================================================

-- 1. 扩展 role 允许值
ALTER TABLE organization_members DROP CONSTRAINT IF EXISTS organization_members_role_check;
ALTER TABLE organization_members ADD CONSTRAINT organization_members_role_check CHECK (role IN ('owner', 'admin', 'member'));

-- 2. 辅助函数：是否为管理员或主账号
CREATE OR REPLACE FUNCTION current_user_is_admin_or_owner()
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM organization_members
    WHERE user_id = auth.uid() AND role IN ('owner', 'admin')
  );
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- 3. 更新业务表 RLS（管理员拥有和主账号一样的读权限，但不能管理成员）

-- 客户：管理员可看全部，成员仅自己
DROP POLICY IF EXISTS "customers_select" ON customers;
CREATE POLICY "customers_select" ON customers FOR SELECT USING (
  auth.uid() = user_id OR users_in_same_org(user_id)
);
DROP POLICY IF EXISTS "customers_update" ON customers;
CREATE POLICY "customers_update" ON customers FOR UPDATE USING (
  auth.uid() = user_id OR (current_user_is_admin_or_owner() AND users_in_same_org(user_id))
);
DROP POLICY IF EXISTS "customers_delete" ON customers;
CREATE POLICY "customers_delete" ON customers FOR DELETE USING (
  auth.uid() = user_id OR (current_user_is_admin_or_owner() AND users_in_same_org(user_id))
);

-- 流水：管理员可看全部，成员仅自己
DROP POLICY IF EXISTS "transactions_select" ON transactions;
CREATE POLICY "transactions_select" ON transactions FOR SELECT USING (
  auth.uid() = user_id OR users_in_same_org(user_id)
);
DROP POLICY IF EXISTS "transactions_update" ON transactions;
CREATE POLICY "transactions_update" ON transactions FOR UPDATE USING (
  auth.uid() = user_id OR (current_user_is_admin_or_owner() AND users_in_same_org(user_id))
);
DROP POLICY IF EXISTS "transactions_delete" ON transactions;
CREATE POLICY "transactions_delete" ON transactions FOR DELETE USING (
  auth.uid() = user_id OR (current_user_is_admin_or_owner() AND users_in_same_org(user_id))
);

-- 订单：管理员可看全部，成员仅自己
DROP POLICY IF EXISTS "orders_select" ON orders;
CREATE POLICY "orders_select" ON orders FOR SELECT USING (
  auth.uid() = user_id OR users_in_same_org(user_id)
);
DROP POLICY IF EXISTS "orders_update" ON orders;
CREATE POLICY "orders_update" ON orders FOR UPDATE USING (
  auth.uid() = user_id OR (current_user_is_admin_or_owner() AND users_in_same_org(user_id))
);
DROP POLICY IF EXISTS "orders_delete" ON orders;
CREATE POLICY "orders_delete" ON orders FOR DELETE USING (
  auth.uid() = user_id OR (current_user_is_admin_or_owner() AND users_in_same_org(user_id))
);

-- 订单明细
DROP POLICY IF EXISTS "order_items_select" ON order_items;
CREATE POLICY "order_items_select" ON order_items FOR SELECT USING (
  quotation_id IN (SELECT id FROM orders WHERE auth.uid() = user_id OR users_in_same_org(user_id))
);
DROP POLICY IF EXISTS "order_items_update" ON order_items;
CREATE POLICY "order_items_update" ON order_items FOR UPDATE USING (
  quotation_id IN (SELECT id FROM orders WHERE auth.uid() = user_id OR (current_user_is_admin_or_owner() AND users_in_same_org(user_id)))
);
DROP POLICY IF EXISTS "order_items_delete" ON order_items;
CREATE POLICY "order_items_delete" ON order_items FOR DELETE USING (
  quotation_id IN (SELECT id FROM orders WHERE auth.uid() = user_id OR (current_user_is_admin_or_owner() AND users_in_same_org(user_id)))
);

-- 报价单/PI：管理员可看全部，成员仅自己
DROP POLICY IF EXISTS "quotations_select" ON quotations;
CREATE POLICY "quotations_select" ON quotations FOR SELECT USING (
  auth.uid() = user_id OR users_in_same_org(user_id)
);
DROP POLICY IF EXISTS "quotations_update" ON quotations;
CREATE POLICY "quotations_update" ON quotations FOR UPDATE USING (
  auth.uid() = user_id OR (current_user_is_admin_or_owner() AND users_in_same_org(user_id))
);
DROP POLICY IF EXISTS "quotations_delete" ON quotations;
CREATE POLICY "quotations_delete" ON quotations FOR DELETE USING (
  auth.uid() = user_id OR (current_user_is_admin_or_owner() AND users_in_same_org(user_id))
);

-- 报价单明细
DROP POLICY IF EXISTS "qitems_select" ON quotation_items;
CREATE POLICY "qitems_select" ON quotation_items FOR SELECT USING (
  quotation_id IN (SELECT id FROM quotations WHERE auth.uid() = user_id OR users_in_same_org(user_id))
);
DROP POLICY IF EXISTS "qitems_update" ON quotation_items;
CREATE POLICY "qitems_update" ON quotation_items FOR UPDATE USING (
  quotation_id IN (SELECT id FROM quotations WHERE auth.uid() = user_id OR (current_user_is_admin_or_owner() AND users_in_same_org(user_id)))
);
DROP POLICY IF EXISTS "qitems_delete" ON quotation_items;
CREATE POLICY "qitems_delete" ON quotation_items FOR DELETE USING (
  quotation_id IN (SELECT id FROM quotations WHERE auth.uid() = user_id OR (current_user_is_admin_or_owner() AND users_in_same_org(user_id)))
);

-- 商品：管理员可管理全部，成员可看全部（价格隐藏由前端控制）
DROP POLICY IF EXISTS "products_update" ON products;
CREATE POLICY "products_update" ON products FOR UPDATE USING (
  auth.uid() = user_id OR (current_user_is_admin_or_owner() AND users_in_same_org(user_id))
);
DROP POLICY IF EXISTS "products_delete" ON products;
CREATE POLICY "products_delete" ON products FOR DELETE USING (
  auth.uid() = user_id OR (current_user_is_admin_or_owner() AND users_in_same_org(user_id))
);

-- 科目：管理员可管理全部，成员仅看
DROP POLICY IF EXISTS "accounts_update" ON accounts;
CREATE POLICY "accounts_update" ON accounts FOR UPDATE USING (
  auth.uid() = user_id OR (current_user_is_admin_or_owner() AND users_in_same_org(user_id))
);
DROP POLICY IF EXISTS "accounts_delete" ON accounts;
CREATE POLICY "accounts_delete" ON accounts FOR DELETE USING (
  auth.uid() = user_id OR (current_user_is_admin_or_owner() AND users_in_same_org(user_id))
);

-- 4. RPC：修改成员角色（仅主账号）
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
