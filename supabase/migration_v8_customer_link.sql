-- ============================================================
-- CRM v8 - 报价单/PI关联客户
-- ============================================================
ALTER TABLE quotations ADD COLUMN IF NOT EXISTS customer_id UUID REFERENCES customers(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_quotations_customer ON quotations(customer_id);
