-- ============================================================
-- CRM v35 - 单据币种：采购单/订单/报价单PI
-- ============================================================
-- 采购单和客户订单此前无币种字段，金额默认按人民币显示。
-- 加 currency 列后单据可记录币种（'RMB' | 'USD'），前端按单据币种显示。
-- quotations 已有 unit_price_rmb/unit_price_usd 双价，加 currency 记录主币种。

ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS currency TEXT DEFAULT 'RMB';
ALTER TABLE orders ADD COLUMN IF NOT EXISTS currency TEXT DEFAULT 'RMB';
ALTER TABLE quotations ADD COLUMN IF NOT EXISTS currency TEXT DEFAULT 'RMB';
