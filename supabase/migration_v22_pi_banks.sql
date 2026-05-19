-- ============================================================
-- CRM v22 - PI 增加银行选择和Paypal字段
-- ============================================================
ALTER TABLE quotations ADD COLUMN IF NOT EXISTS bank_selection TEXT;
ALTER TABLE quotations ADD COLUMN IF NOT EXISTS paypal_account TEXT;
