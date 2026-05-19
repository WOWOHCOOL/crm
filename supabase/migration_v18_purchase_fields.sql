-- ============================================================
-- CRM v18 - 采购单明细增加品名和备注字段
-- ============================================================
ALTER TABLE purchase_items ADD COLUMN IF NOT EXISTS product_name TEXT;
ALTER TABLE purchase_items ADD COLUMN IF NOT EXISTS remarks TEXT;
