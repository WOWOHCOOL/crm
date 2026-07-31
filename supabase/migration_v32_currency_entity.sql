-- ============================================================
-- CRM v32 - 双币种金额 + 账户主体归属
-- ============================================================

-- 1. transactions 表增加美元金额字段
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS amount_usd DECIMAL(12,2);

-- 2. accounts 表增加归属主体字段
-- entity: 'dongyixin' (东易鑫), 'dongyi' (东易), 'private' (私账)
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS entity TEXT;

-- 3. 放宽 amount CHECK 约束：允许 0（仅填 USD 时不强制填 RMB）
ALTER TABLE transactions DROP CONSTRAINT IF EXISTS transactions_amount_check;
ALTER TABLE transactions ADD CONSTRAINT transactions_amount_check CHECK (amount >= 0);
