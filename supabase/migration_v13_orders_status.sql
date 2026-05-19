-- ============================================================
-- CRM v13 - 订单状态流转 + 出运跟踪
-- ============================================================

-- 1. orders 表增加状态和出运字段
ALTER TABLE orders ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'pending'
  CHECK (status IN ('pending', 'confirmed', 'in_production', 'shipped', 'completed'));

ALTER TABLE orders ADD COLUMN IF NOT EXISTS tracking_company TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS tracking_number TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS container_number TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS etd DATE;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS eta DATE;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS shipped_date DATE;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS shipping_notes TEXT;
