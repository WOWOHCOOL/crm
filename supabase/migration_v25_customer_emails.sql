-- ============================================================
-- CRM v25 - 客户多邮箱支持
-- ============================================================
ALTER TABLE customers ADD COLUMN IF NOT EXISTS email2 TEXT;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS email3 TEXT;
