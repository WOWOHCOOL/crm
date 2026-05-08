-- ============================================================
-- CRM v21 - 采购订单增加采购方信息
-- ============================================================
ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS buyer_name TEXT DEFAULT '东易科技有限公司';
ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS buyer_contact TEXT;
ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS buyer_phone TEXT;
