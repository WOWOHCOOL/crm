-- ============================================================
-- CRM v11 - 任务/跟进提醒功能
-- ============================================================

-- 1. 任务表
CREATE TABLE IF NOT EXISTS tasks (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  customer_id UUID REFERENCES customers(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  description TEXT,
  due_date DATE,
  reminder_time TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'cancelled')),
  priority TEXT NOT NULL DEFAULT 'normal' CHECK (priority IN ('low', 'normal', 'high', 'urgent')),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tasks_org_status ON tasks(org_id, status);
CREATE INDEX IF NOT EXISTS idx_tasks_customer ON tasks(customer_id);
CREATE INDEX IF NOT EXISTS idx_tasks_due_date ON tasks(due_date);

ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;

-- 2. RLS 策略（与 v10 其余表一致）
DROP POLICY IF EXISTS "tasks_select" ON tasks;
DROP POLICY IF EXISTS "tasks_insert" ON tasks;
DROP POLICY IF EXISTS "tasks_update" ON tasks;
DROP POLICY IF EXISTS "tasks_delete" ON tasks;

CREATE POLICY "tasks_select" ON tasks FOR SELECT USING (
  auth.uid() = user_id OR users_in_same_org(user_id)
);
CREATE POLICY "tasks_insert" ON tasks FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "tasks_update" ON tasks FOR UPDATE USING (
  auth.uid() = user_id OR (current_user_is_admin_or_owner() AND users_in_same_org(user_id))
);
CREATE POLICY "tasks_delete" ON tasks FOR DELETE USING (
  auth.uid() = user_id OR (current_user_is_admin_or_owner() AND users_in_same_org(user_id))
);
-- ============================================================
-- CRM v12 - 操作日志权限修正
-- 主账号 → 看全部；管理员/普通成员 → 只能看自己的
-- ============================================================

-- 1. get_operation_logs 按角色返回不同范围
CREATE OR REPLACE FUNCTION get_operation_logs(
  p_limit INT DEFAULT 50
) RETURNS JSON AS $$
DECLARE
  result JSON;
BEGIN
  IF current_user_is_org_owner() THEN
    -- 主账号：看组织全部
    SELECT json_agg(json_build_object(
      'id', ol.id,
      'user_email', ol.user_email,
      'action', ol.action,
      'entity', ol.entity,
      'description', ol.description,
      'created_at', ol.created_at
    ) ORDER BY ol.created_at DESC) INTO result
    FROM operation_logs ol
    WHERE ol.org_id IN (SELECT get_my_org_ids())
    LIMIT p_limit;
  ELSE
    -- 管理员/普通成员：只看自己的
    SELECT json_agg(json_build_object(
      'id', ol.id,
      'user_email', ol.user_email,
      'action', ol.action,
      'entity', ol.entity,
      'description', ol.description,
      'created_at', ol.created_at
    ) ORDER BY ol.created_at DESC) INTO result
    FROM operation_logs ol
    WHERE ol.user_id = auth.uid()
    LIMIT p_limit;
  END IF;

  RETURN COALESCE(result, '[]'::JSON);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2. ops_select 策略同步修正（虽然 SECURITY DEFINER 绕过 RLS，留作后备）
DROP POLICY IF EXISTS "ops_select" ON operation_logs;
CREATE POLICY "ops_select" ON operation_logs FOR SELECT USING (
  org_id IN (SELECT get_my_org_ids())
  AND (current_user_is_org_owner() OR user_id = auth.uid())
);
-- ============================================================
-- CRM v13 - 订单状态流转 + 出运跟踪
-- ============================================================

-- 1. orders 表增加状态和出运字段
ALTER TABLE orders ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'pending'
  CHECK (status IN ('pending', 'confirmed', 'in_production', 'shipped', 'completed'));

ALTER TABLE orders ADD COLUMN IF NOT EXISTS tracking_company TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS tracking_number TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS container_number TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS etd DATE;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS eta DATE;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS shipped_date DATE;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS shipping_notes TEXT;
-- ============================================================
-- CRM v14 - 供应商管理 + 采购订单 + 报价对比
-- ============================================================

-- 1. 供应商表
CREATE TABLE IF NOT EXISTS suppliers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  contact_person TEXT,
  phone TEXT,
  email TEXT,
  address TEXT,
  payment_terms TEXT,
  bank_info TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_suppliers_org ON suppliers(org_id);

ALTER TABLE suppliers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "suppliers_select" ON suppliers;
DROP POLICY IF EXISTS "suppliers_insert" ON suppliers;
DROP POLICY IF EXISTS "suppliers_update" ON suppliers;
DROP POLICY IF EXISTS "suppliers_delete" ON suppliers;

CREATE POLICY "suppliers_select" ON suppliers FOR SELECT USING (
  auth.uid() = user_id OR users_in_same_org(user_id)
);
CREATE POLICY "suppliers_insert" ON suppliers FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "suppliers_update" ON suppliers FOR UPDATE USING (
  auth.uid() = user_id OR (current_user_is_admin_or_owner() AND users_in_same_org(user_id))
);
CREATE POLICY "suppliers_delete" ON suppliers FOR DELETE USING (
  auth.uid() = user_id OR (current_user_is_admin_or_owner() AND users_in_same_org(user_id))
);

-- 2. 采购订单表
CREATE TABLE IF NOT EXISTS purchase_orders (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  supplier_id UUID REFERENCES suppliers(id) ON DELETE SET NULL,
  order_no TEXT NOT NULL,
  order_date DATE DEFAULT CURRENT_DATE,
  total_amount DECIMAL(12,2),
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'ordered', 'partial', 'received', 'cancelled')),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_purchase_orders_org ON purchase_orders(org_id);
CREATE INDEX IF NOT EXISTS idx_purchase_orders_supplier ON purchase_orders(supplier_id);

ALTER TABLE purchase_orders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "purchase_orders_select" ON purchase_orders;
DROP POLICY IF EXISTS "purchase_orders_insert" ON purchase_orders;
DROP POLICY IF EXISTS "purchase_orders_update" ON purchase_orders;
DROP POLICY IF EXISTS "purchase_orders_delete" ON purchase_orders;

CREATE POLICY "purchase_orders_select" ON purchase_orders FOR SELECT USING (
  auth.uid() = user_id OR users_in_same_org(user_id)
);
CREATE POLICY "purchase_orders_insert" ON purchase_orders FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "purchase_orders_update" ON purchase_orders FOR UPDATE USING (
  auth.uid() = user_id OR (current_user_is_admin_or_owner() AND users_in_same_org(user_id))
);
CREATE POLICY "purchase_orders_delete" ON purchase_orders FOR DELETE USING (
  auth.uid() = user_id OR (current_user_is_admin_or_owner() AND users_in_same_org(user_id))
);

-- 3. 采购订单明细表
CREATE TABLE IF NOT EXISTS purchase_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  purchase_order_id UUID NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,
  product_id UUID REFERENCES products(id) ON DELETE SET NULL,
  model TEXT,
  description TEXT,
  quantity INTEGER NOT NULL DEFAULT 1 CHECK (quantity > 0),
  unit_price DECIMAL(12,2) NOT NULL CHECK (unit_price >= 0),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_purchase_items_order ON purchase_items(purchase_order_id);

ALTER TABLE purchase_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "purchase_items_select" ON purchase_items;
DROP POLICY IF EXISTS "purchase_items_insert" ON purchase_items;
DROP POLICY IF EXISTS "purchase_items_update" ON purchase_items;
DROP POLICY IF EXISTS "purchase_items_delete" ON purchase_items;

CREATE POLICY "purchase_items_select" ON purchase_items FOR SELECT USING (
  purchase_order_id IN (SELECT id FROM purchase_orders WHERE auth.uid() = user_id OR users_in_same_org(user_id))
);
CREATE POLICY "purchase_items_insert" ON purchase_items FOR INSERT WITH CHECK (
  purchase_order_id IN (SELECT id FROM purchase_orders WHERE auth.uid() = user_id)
);
CREATE POLICY "purchase_items_update" ON purchase_items FOR UPDATE USING (
  purchase_order_id IN (SELECT id FROM purchase_orders WHERE auth.uid() = user_id OR (current_user_is_admin_or_owner() AND users_in_same_org(user_id)))
);
CREATE POLICY "purchase_items_delete" ON purchase_items FOR DELETE USING (
  purchase_order_id IN (SELECT id FROM purchase_orders WHERE auth.uid() = user_id OR (current_user_is_admin_or_owner() AND users_in_same_org(user_id)))
);

-- 4. products 表增加 supplier_id
ALTER TABLE products ADD COLUMN IF NOT EXISTS supplier_id UUID REFERENCES suppliers(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_products_supplier ON products(supplier_id);
-- ============================================================
-- CRM v15 - 供应商增加结构化银行信息
-- ============================================================
ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS tax_id TEXT;
ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS bank_account_name TEXT;
ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS bank_account_number TEXT;
ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS bank_name TEXT;
-- ============================================================
-- CRM v16 - 产品参数扩展
-- ============================================================
ALTER TABLE products ADD COLUMN IF NOT EXISTS color TEXT;
ALTER TABLE products ADD COLUMN IF NOT EXISTS material TEXT;
ALTER TABLE products ADD COLUMN IF NOT EXISTS weight TEXT;
ALTER TABLE products ADD COLUMN IF NOT EXISTS size TEXT;
ALTER TABLE products ADD COLUMN IF NOT EXISTS specifications TEXT;
ALTER TABLE products ADD COLUMN IF NOT EXISTS package_includes TEXT;
-- ============================================================
-- CRM v17 - 采购订单明细增加颜色字段
-- ============================================================
ALTER TABLE purchase_items ADD COLUMN IF NOT EXISTS color TEXT;
-- ============================================================
-- CRM v18 - 采购单明细增加品名和备注字段
-- ============================================================
ALTER TABLE purchase_items ADD COLUMN IF NOT EXISTS product_name TEXT;
ALTER TABLE purchase_items ADD COLUMN IF NOT EXISTS remarks TEXT;
