-- ============================================================
-- CRM v4 迁移 - 报价管理
-- 在 Supabase SQL Editor 中执行
-- ============================================================

-- 报价单表
CREATE TABLE IF NOT EXISTS quotations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  quotation_no TEXT NOT NULL,
  customer_company TEXT,
  customer_contact TEXT,
  customer_website TEXT,
  customer_address TEXT,
  customer_phone TEXT,
  exchange_rate DECIMAL(10,4) DEFAULT 7.25,
  valid_days INTEGER DEFAULT 15,
  payment_terms TEXT DEFAULT 'T/T 30% deposit, 70% before shipment',
  delivery_time TEXT DEFAULT '15-20 working days after deposit confirmation',
  notes TEXT,
  bank_beneficiary TEXT DEFAULT 'Dong Yi Technology Co., Limited',
  bank_name TEXT DEFAULT 'Bank of China, Shenzhen Branch',
  bank_address TEXT,
  bank_account TEXT,
  bank_swift TEXT DEFAULT 'BKCHCNBJ45A',
  status TEXT DEFAULT 'draft',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  org_id UUID REFERENCES organizations(id) ON DELETE SET NULL
);

-- 报价单明细表
CREATE TABLE IF NOT EXISTS quotation_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  quotation_id UUID NOT NULL REFERENCES quotations(id) ON DELETE CASCADE,
  product_id UUID REFERENCES products(id) ON DELETE SET NULL,
  official_model TEXT NOT NULL,
  supplier_model TEXT,
  quantity INTEGER NOT NULL DEFAULT 1 CHECK (quantity > 0),
  unit_price_rmb DECIMAL(12,2) NOT NULL,
  unit_price_usd DECIMAL(12,2) NOT NULL,
  supply_price DECIMAL(12,2),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_quotations_org ON quotations(org_id);
CREATE INDEX IF NOT EXISTS idx_quotations_user ON quotations(user_id);
CREATE INDEX IF NOT EXISTS idx_quotation_items_qid ON quotation_items(quotation_id);

-- RLS
ALTER TABLE quotations ENABLE ROW LEVEL SECURITY;
ALTER TABLE quotation_items ENABLE ROW LEVEL SECURITY;

-- Quotations: same org visibility pattern as other tables
DROP POLICY IF EXISTS "quotations_select" ON quotations;
DROP POLICY IF EXISTS "quotations_insert" ON quotations;
DROP POLICY IF EXISTS "quotations_update" ON quotations;
DROP POLICY IF EXISTS "quotations_delete" ON quotations;

CREATE POLICY "quotations_select" ON quotations FOR SELECT USING (
  auth.uid() = user_id OR users_in_same_org(user_id)
);
CREATE POLICY "quotations_insert" ON quotations FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "quotations_update" ON quotations FOR UPDATE USING (
  auth.uid() = user_id OR (current_user_is_org_owner() AND users_in_same_org(user_id))
);
CREATE POLICY "quotations_delete" ON quotations FOR DELETE USING (
  auth.uid() = user_id OR (current_user_is_org_owner() AND users_in_same_org(user_id))
);

-- Quotation Items
DROP POLICY IF EXISTS "qitems_select" ON quotation_items;
DROP POLICY IF EXISTS "qitems_insert" ON quotation_items;
DROP POLICY IF EXISTS "qitems_update" ON quotation_items;
DROP POLICY IF EXISTS "qitems_delete" ON quotation_items;

CREATE POLICY "qitems_select" ON quotation_items FOR SELECT USING (
  quotation_id IN (SELECT id FROM quotations WHERE auth.uid() = user_id OR users_in_same_org(user_id))
);
CREATE POLICY "qitems_insert" ON quotation_items FOR INSERT WITH CHECK (
  quotation_id IN (SELECT id FROM quotations WHERE auth.uid() = user_id)
);
CREATE POLICY "qitems_update" ON quotation_items FOR UPDATE USING (
  quotation_id IN (SELECT id FROM quotations WHERE auth.uid() = user_id OR (current_user_is_org_owner() AND users_in_same_org(user_id)))
);
CREATE POLICY "qitems_delete" ON quotation_items FOR DELETE USING (
  quotation_id IN (SELECT id FROM quotations WHERE auth.uid() = user_id OR (current_user_is_org_owner() AND users_in_same_org(user_id)))
);
