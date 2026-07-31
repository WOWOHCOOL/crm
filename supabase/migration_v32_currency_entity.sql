-- ============================================================
-- CRM v32 - 币种 + 账户主体归属
-- ============================================================

-- 1. transactions 表增加币种字段
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS currency TEXT DEFAULT 'RMB';

-- 2. accounts 表增加归属主体字段
-- entity: 'dongyixin' (东易鑫), 'dongyi' (东易), 'private' (私账)
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS entity TEXT;
