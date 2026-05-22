-- ============================================================
-- CRM v28 - 财务凭证 & 付款水单
-- ============================================================

-- 1. 财务流水增加凭证附件
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS voucher_url TEXT;

-- 2. 采购订单增加付款水单
ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS payment_receipt_url TEXT;

-- 3. PI（形式发票）增加付款水单
ALTER TABLE quotations ADD COLUMN IF NOT EXISTS payment_receipt_url TEXT;
