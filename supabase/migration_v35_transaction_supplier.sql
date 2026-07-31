-- ============================================================
-- CRM v35 - 流水关联供应商
-- ============================================================
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS supplier_id UUID REFERENCES suppliers(id) ON DELETE SET NULL;
