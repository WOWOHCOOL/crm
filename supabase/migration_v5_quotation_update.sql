-- ============================================================
-- CRM v5 迁移 - 报价管理增强（MOQ/详情/图片/编号/PI管理）
-- ============================================================

-- 1. 产品表增加图片字段
ALTER TABLE products ADD COLUMN IF NOT EXISTS image_url TEXT;

-- 2. 报价单表增加类型字段
ALTER TABLE quotations ADD COLUMN IF NOT EXISTS type TEXT DEFAULT 'quotation' CHECK (type IN ('quotation', 'pi'));
ALTER TABLE quotations ADD COLUMN IF NOT EXISTS delivery_time_global TEXT DEFAULT '15-20 working days after deposit confirmation';

-- 3. 报价单明细表增加字段
ALTER TABLE quotation_items ADD COLUMN IF NOT EXISTS moq INTEGER DEFAULT 1;
ALTER TABLE quotation_items ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE quotation_items ADD COLUMN IF NOT EXISTS remarks TEXT;
