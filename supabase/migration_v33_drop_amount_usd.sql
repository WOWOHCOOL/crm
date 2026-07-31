-- ============================================================
-- CRM v33 - 清理旧 amount_usd 列（已被 currency 字段取代）
-- ============================================================
ALTER TABLE transactions DROP COLUMN IF EXISTS amount_usd;
