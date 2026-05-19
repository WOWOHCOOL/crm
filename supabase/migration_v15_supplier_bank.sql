-- ============================================================
-- CRM v15 - 供应商增加结构化银行信息
-- ============================================================
ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS tax_id TEXT;
ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS bank_account_name TEXT;
ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS bank_account_number TEXT;
ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS bank_name TEXT;
