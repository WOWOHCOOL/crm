-- CRM v2 迁移脚本
-- 在 Supabase SQL Editor 中全部执行

-- 1. 更新 customers 表（替换 social_media 为 whatsapp/linkedin/website）
ALTER TABLE customers DROP COLUMN IF EXISTS social_media;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS whatsapp TEXT;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS linkedin TEXT;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS website TEXT;

-- 2. 自动填充 user_id 的触发器
CREATE OR REPLACE FUNCTION set_user_id()
RETURNS TRIGGER AS $$
BEGIN
  NEW.user_id = auth.uid();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 为所有表挂载触发器（如果已存在先删除再建）
DROP TRIGGER IF EXISTS tr_set_user_id_customers ON customers;
CREATE TRIGGER tr_set_user_id_customers BEFORE INSERT ON customers FOR EACH ROW EXECUTE FUNCTION set_user_id();

DROP TRIGGER IF EXISTS tr_set_user_id_accounts ON accounts;
CREATE TRIGGER tr_set_user_id_accounts BEFORE INSERT ON accounts FOR EACH ROW EXECUTE FUNCTION set_user_id();

DROP TRIGGER IF EXISTS tr_set_user_id_transactions ON transactions;
CREATE TRIGGER tr_set_user_id_transactions BEFORE INSERT ON transactions FOR EACH ROW EXECUTE FUNCTION set_user_id();

-- 3. 商品表
CREATE TABLE IF NOT EXISTS products (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  official_model TEXT NOT NULL,
  supplier_model TEXT,
  supplier_name TEXT,
  supply_price DECIMAL(12,2),
  tax_included BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE
);

DROP TRIGGER IF EXISTS tr_set_user_id_products ON products;
CREATE TRIGGER tr_set_user_id_products BEFORE INSERT ON products FOR EACH ROW EXECUTE FUNCTION set_user_id();

-- 4. 订单表
CREATE TABLE IF NOT EXISTS orders (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  customer_id UUID REFERENCES customers(id) ON DELETE CASCADE,
  pi_number TEXT,
  order_type TEXT DEFAULT 'normal' CHECK (order_type IN ('normal', 'repeat', 'sample')),
  total_amount DECIMAL(12,2),
  notes TEXT,
  date DATE DEFAULT CURRENT_DATE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE
);

DROP TRIGGER IF EXISTS tr_set_user_id_orders ON orders;
CREATE TRIGGER tr_set_user_id_orders BEFORE INSERT ON orders FOR EACH ROW EXECUTE FUNCTION set_user_id();

-- 5. 订单明细表
CREATE TABLE IF NOT EXISTS order_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  order_id UUID REFERENCES orders(id) ON DELETE CASCADE,
  product_id UUID REFERENCES products(id) ON DELETE SET NULL,
  model TEXT,
  quantity INTEGER NOT NULL DEFAULT 1 CHECK (quantity > 0),
  unit_price DECIMAL(12,2) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE
);

DROP TRIGGER IF EXISTS tr_set_user_id_order_items ON order_items;
CREATE TRIGGER tr_set_user_id_order_items BEFORE INSERT ON order_items FOR EACH ROW EXECUTE FUNCTION set_user_id();

-- 6. 索引
CREATE INDEX IF NOT EXISTS idx_products_user ON products(user_id);
CREATE INDEX IF NOT EXISTS idx_orders_user ON orders(user_id);
CREATE INDEX IF NOT EXISTS idx_orders_customer ON orders(customer_id);
CREATE INDEX IF NOT EXISTS idx_order_items_order ON order_items(order_id);

-- 7. RLS 策略
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_items ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "users_manage_own_products" ON products FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "users_manage_own_orders" ON orders FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "users_manage_own_order_items" ON order_items FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 8. 确认删除之前坏掉的注册触发器
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
