-- ============================================================
-- CRM v6 - PI/QUO 增强（贸易条款、银行信息、首付尾款等）
-- ============================================================
ALTER TABLE quotations ADD COLUMN IF NOT EXISTS trade_terms TEXT DEFAULT '';
ALTER TABLE quotations ADD COLUMN IF NOT EXISTS bank_code TEXT DEFAULT '';
ALTER TABLE quotations ADD COLUMN IF NOT EXISTS deposit_rate DECIMAL(5,2) DEFAULT 50;
-- ============================================================
-- CRM v22 - PI 增加银行选择和Paypal字段
-- ============================================================
ALTER TABLE quotations ADD COLUMN IF NOT EXISTS bank_selection TEXT;
ALTER TABLE quotations ADD COLUMN IF NOT EXISTS paypal_account TEXT;
-- ============================================================
-- CRM v23 - PI 增加条款条件字段
-- ============================================================
ALTER TABLE quotations ADD COLUMN IF NOT EXISTS terms_conditions TEXT;
