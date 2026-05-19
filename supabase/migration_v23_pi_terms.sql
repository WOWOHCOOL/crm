-- ============================================================
-- CRM v23 - PI 增加条款条件字段
-- ============================================================
ALTER TABLE quotations ADD COLUMN IF NOT EXISTS terms_conditions TEXT;
