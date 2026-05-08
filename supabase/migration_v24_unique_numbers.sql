-- ============================================================
-- CRM v24 - 单号唯一性保证（原子序列 + 唯一约束）
-- ============================================================

-- 1. 编号序列表
CREATE TABLE IF NOT EXISTS number_sequences (
  prefix TEXT NOT NULL,
  seq_date TEXT NOT NULL,
  last_seq INT NOT NULL DEFAULT 0,
  PRIMARY KEY (prefix, seq_date)
);

-- 2. 原子获取下一个序号
CREATE OR REPLACE FUNCTION get_next_seq(p_prefix TEXT, p_date TEXT)
RETURNS INT AS $$
DECLARE
  v_next INT;
BEGIN
  INSERT INTO number_sequences (prefix, seq_date, last_seq)
  VALUES (p_prefix, p_date, 0)
  ON CONFLICT (prefix, seq_date) DO NOTHING;

  UPDATE number_sequences SET last_seq = last_seq + 1
  WHERE prefix = p_prefix AND seq_date = p_date
  RETURNING last_seq INTO v_next;

  RETURN v_next;
END;
$$ LANGUAGE plpgsql;

-- 3. 采购单号唯一约束
DELETE FROM purchase_orders a USING purchase_orders b
  WHERE a.id < b.id AND a.order_no = b.order_no;
ALTER TABLE purchase_orders ADD CONSTRAINT purchase_orders_order_no_key UNIQUE (order_no);

-- 4. 报价单/PI 单号唯一约束
DELETE FROM quotations a USING quotations b
  WHERE a.id < b.id AND a.quotation_no = b.quotation_no;
ALTER TABLE quotations ADD CONSTRAINT quotations_quotation_no_key UNIQUE (quotation_no);
