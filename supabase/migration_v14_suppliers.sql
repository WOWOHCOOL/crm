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
