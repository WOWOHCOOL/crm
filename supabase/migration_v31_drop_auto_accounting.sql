-- ============================================================
-- CRM v31 - 移除自动记账，全部改为人工记账
-- ============================================================
-- 原因：客户订单和采购订单都存在付款不确定性问题
-- （可能延期、部分付款、金额不一致），所有记账必须人工操作。

-- 1. 移除采购单自动记账触发器
DROP TRIGGER IF EXISTS trg_purchase_order_auto_transaction ON purchase_orders;
DROP FUNCTION IF EXISTS auto_create_purchase_transaction();

-- 2. 移除 PI 自动记账触发器
DROP TRIGGER IF EXISTS trg_pi_auto_transaction ON quotations;
DROP FUNCTION IF EXISTS auto_create_pi_transaction();

-- Note: transactions 表的 ref_type/ref_id 字段保留，
-- 用于人工记账时手动关联源单据。
