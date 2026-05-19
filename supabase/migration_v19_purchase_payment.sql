-- ============================================================
-- CRM v19 - 采购订单增加付款方式字段
-- ============================================================
ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS payment_terms TEXT;
