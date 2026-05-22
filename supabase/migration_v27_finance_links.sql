-- ============================================================
-- CRM v27 - 财务流水关联源单据（采购单/订单自动记账）
-- ============================================================

-- 1. transactions 表增加单据关联字段
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS ref_type TEXT;
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS ref_id UUID;

CREATE INDEX IF NOT EXISTS idx_transactions_ref ON transactions(ref_type, ref_id);

-- 2. 采购单状态流转自动记账函数
-- 当采购单状态变为 ordered/received 时自动生成支出流水
CREATE OR REPLACE FUNCTION auto_create_purchase_transaction()
RETURNS TRIGGER AS $$
DECLARE
  v_account_id UUID;
  v_user_id UUID;
  v_supplier_name TEXT;
BEGIN
  -- 只在状态从 draft 变为 ordered/received 时触发
  IF OLD.status = 'draft' AND NEW.status IN ('ordered', 'received') THEN
    -- 获取供应商名称
    SELECT name INTO v_supplier_name FROM suppliers WHERE id = NEW.supplier_id;

    -- 查找"商品采购成本"科目，找不到则使用第一个支出科目
    SELECT id INTO v_account_id FROM accounts
      WHERE name = '商品采购成本' AND user_id = NEW.user_id
      LIMIT 1;
    IF v_account_id IS NULL THEN
      SELECT id INTO v_account_id FROM accounts
        WHERE type = 'expense' AND user_id = NEW.user_id
        ORDER BY created_at LIMIT 1;
    END IF;

    -- 检查是否已有关联流水（幂等）
    IF NOT EXISTS (SELECT 1 FROM transactions WHERE ref_type = 'purchase_order' AND ref_id = NEW.id) THEN
      INSERT INTO transactions (type, amount, description, date, account_id, ref_type, ref_id, user_id)
      VALUES (
        'expense',
        COALESCE(NEW.total_amount, 0),
        COALESCE('采购单 ' || NEW.order_no || ' - ' || v_supplier_name, '采购单 ' || NEW.order_no),
        COALESCE(NEW.order_date, CURRENT_DATE),
        v_account_id,
        'purchase_order',
        NEW.id,
        NEW.user_id
      );
    END IF;
  END IF;

  -- 取消/删除采购单时清除关联流水
  IF NEW.status IN ('cancelled') AND OLD.status NOT IN ('cancelled') THEN
    DELETE FROM transactions WHERE ref_type = 'purchase_order' AND ref_id = NEW.id;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_purchase_order_auto_transaction ON purchase_orders;
CREATE TRIGGER trg_purchase_order_auto_transaction
  AFTER UPDATE OF status ON purchase_orders
  FOR EACH ROW EXECUTE FUNCTION auto_create_purchase_transaction();

-- ============================================================
-- 3. PI 状态流转自动记账函数
-- 当 PI 状态变为 sent 时自动生成收入流水
-- ============================================================
CREATE OR REPLACE FUNCTION auto_create_pi_transaction()
RETURNS TRIGGER AS $$
DECLARE
  v_account_id UUID;
  v_customer_name TEXT;
  v_description TEXT;
  v_amount DECIMAL(12,2);
BEGIN
  -- 只在状态从 draft 变为 sent 时触发
  IF OLD.status = 'draft' AND NEW.status = 'sent' THEN
    -- 获取客户名称
    SELECT COALESCE(company, name) INTO v_customer_name FROM customers WHERE id = NEW.customer_id;

    -- 计算总金额（从明细汇总）
    SELECT COALESCE(SUM(unit_price_rmb * quantity), 0) INTO v_amount
    FROM quotation_items WHERE quotation_id = NEW.id;

    -- 查找"商品销售收入"科目，找不到则使用第一个收入科目
    SELECT id INTO v_account_id FROM accounts
      WHERE name = '商品销售收入' AND user_id = NEW.user_id
      LIMIT 1;
    IF v_account_id IS NULL THEN
      SELECT id INTO v_account_id FROM accounts
        WHERE type = 'income' AND user_id = NEW.user_id
        ORDER BY created_at LIMIT 1;
    END IF;

    -- 检查是否已有关联流水（幂等）
    IF NOT EXISTS (SELECT 1 FROM transactions WHERE ref_type = 'pi' AND ref_id = NEW.id) THEN
      v_description := COALESCE('PI ' || NEW.quotation_no || ' - ' || v_customer_name, 'PI ' || NEW.quotation_no);
      INSERT INTO transactions (
        type, amount, description, date, customer_id, account_id, ref_type, ref_id, user_id
      ) VALUES (
        'income',
        v_amount,
        v_description,
        COALESCE(NEW.created_at::date, CURRENT_DATE),
        NEW.customer_id,
        v_account_id,
        'pi',
        NEW.id,
        NEW.user_id
      );
    END IF;
  END IF;

  -- 撤回到草稿或取消时清除关联流水
  IF NEW.status = 'draft' AND OLD.status = 'sent' THEN
    DELETE FROM transactions WHERE ref_type = 'pi' AND ref_id = NEW.id;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_pi_auto_transaction ON quotations;
CREATE TRIGGER trg_pi_auto_transaction
  AFTER UPDATE OF status ON quotations
  FOR EACH ROW
  WHEN (NEW.type = 'pi')
  EXECUTE FUNCTION auto_create_pi_transaction();
