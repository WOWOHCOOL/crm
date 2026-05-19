-- ============================================================
-- CRM v3 迁移 - 多账号组织架构 + 邀请码注册
-- 执行方式：在 Supabase SQL Editor 中全部执行
-- ============================================================

-- ============================================================
-- 1. 基础辅助函数
-- ============================================================

-- 生成 8 位邀请码（格式：XXXX-XXXX）
CREATE OR REPLACE FUNCTION generate_invite_code()
RETURNS TEXT AS $$
DECLARE
  chars TEXT := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  result TEXT := '';
  i INT;
BEGIN
  FOR i IN 1..8 LOOP
    IF i = 5 THEN result := result || '-'; END IF;
    result := result || substr(chars, floor(random() * length(chars) + 1)::integer, 1);
  END LOOP;
  RETURN result;
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- 2. 组织表（必须先创建，其他表依赖它）
-- ============================================================
CREATE TABLE IF NOT EXISTS organizations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL DEFAULT '',
  invite_code TEXT UNIQUE NOT NULL DEFAULT generate_invite_code(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- 3. 组织成员表
-- ============================================================
CREATE TABLE IF NOT EXISTS organization_members (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('owner', 'member')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(org_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_org_members_org ON organization_members(org_id);
CREATE INDEX IF NOT EXISTS idx_org_members_user ON organization_members(user_id);

-- ============================================================
-- 4. 注册邀请码表（必须先有邀请码才能注册）
-- ============================================================
CREATE TABLE IF NOT EXISTS registration_tokens (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  code TEXT UNIQUE NOT NULL DEFAULT generate_invite_code(),
  org_id UUID REFERENCES organizations(id) ON DELETE CASCADE,  -- NULL = 管理员注册码（创建组织用）
  used BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  used_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  used_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_reg_tokens_code ON registration_tokens(code);

-- ============================================================
-- 5. 数据库级注册拦截器（阻止没有邀请码的注册）
-- ============================================================
CREATE OR REPLACE FUNCTION check_invite_code_on_signup()
RETURNS TRIGGER AS $$
DECLARE
  v_code TEXT;
BEGIN
  -- 获取用户注册时携带的邀请码（存在 raw_user_meta_data 中）
  v_code := NEW.raw_user_meta_data->>'invite_code';

  -- 没有邀请码 → 拦截注册
  IF v_code IS NULL THEN
    RAISE EXCEPTION 'registration_blocked: 注册需要有效的邀请码';
  END IF;

  -- 邀请码无效或已使用 → 拦截注册
  IF NOT EXISTS (SELECT 1 FROM public.registration_tokens WHERE code = v_code AND used = false AND org_id IS NOT NULL) THEN
    -- 允许管理员注册码（org_id IS NULL）
    IF NOT EXISTS (SELECT 1 FROM public.registration_tokens WHERE code = v_code AND used = false AND org_id IS NULL) THEN
      RAISE EXCEPTION 'registration_blocked: 邀请码无效或已使用';
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS tr_check_invite_code ON auth.users;

-- !!! 重要：如果此触发器导致注册失败，可以注释掉下面这行
CREATE TRIGGER tr_check_invite_code
  BEFORE INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION check_invite_code_on_signup();

-- ============================================================
-- 6. 注册成功后自动消耗邀请码并加入组织
-- ============================================================
CREATE OR REPLACE FUNCTION consume_invite_code_on_signup()
RETURNS TRIGGER AS $$
DECLARE
  v_code TEXT;
  v_org_id UUID;
BEGIN
  v_code := NEW.raw_user_meta_data->>'invite_code';

  IF v_code IS NOT NULL THEN
    -- 获取邀请码对应的组织 ID
    SELECT org_id INTO v_org_id FROM public.registration_tokens WHERE code = v_code AND used = false;

    -- 标记邀请码已使用
    UPDATE public.registration_tokens SET used = true, used_by = NEW.id, used_at = NOW() WHERE code = v_code;

    -- 如果邀请码关联了组织，自动加入该组织
    IF v_org_id IS NOT NULL THEN
      INSERT INTO public.organization_members (org_id, user_id, role)
      VALUES (v_org_id, NEW.id, 'member');
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS tr_consume_invite_code ON auth.users;
CREATE TRIGGER tr_consume_invite_code
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION consume_invite_code_on_signup();

-- ============================================================
-- 7. RLS 辅助函数（SECURITY DEFINER 绕过 RLS 避免递归）
-- ============================================================

CREATE OR REPLACE FUNCTION get_my_org_ids()
RETURNS SETOF UUID AS $$
  SELECT org_id FROM organization_members WHERE user_id = auth.uid();
$$ LANGUAGE sql STABLE SECURITY DEFINER;

CREATE OR REPLACE FUNCTION users_in_same_org(target_user_id UUID)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM organization_members a
    JOIN organization_members b ON a.org_id = b.org_id
    WHERE a.user_id = auth.uid() AND b.user_id = target_user_id
  );
$$ LANGUAGE sql STABLE SECURITY DEFINER;

CREATE OR REPLACE FUNCTION current_user_is_org_owner()
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM organization_members
    WHERE user_id = auth.uid() AND role = 'owner'
  );
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- ============================================================
-- 8. 组织表 RLS
-- ============================================================
ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "org_select" ON organizations FOR SELECT USING (
    id IN (SELECT get_my_org_ids())
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "org_update" ON organizations FOR UPDATE USING (
    EXISTS (SELECT 1 FROM organization_members WHERE org_id = organizations.id AND user_id = auth.uid() AND role = 'owner')
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ============================================================
-- 9. 组织成员表 RLS
-- ============================================================
ALTER TABLE organization_members ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "org_members_select" ON organization_members FOR SELECT USING (
    org_id IN (SELECT get_my_org_ids())
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ============================================================
-- 10. RPC 函数（前端调用入口，SECURITY DEFINER）
-- ============================================================

-- 创建组织（管理员注册后首次使用）
CREATE OR REPLACE FUNCTION create_org(org_name TEXT DEFAULT '')
RETURNS JSON AS $$
DECLARE
  new_org_id UUID;
  code TEXT;
BEGIN
  -- 同一用户只能在一个组织
  IF EXISTS (SELECT 1 FROM organization_members WHERE user_id = auth.uid()) THEN
    RETURN json_build_object('error', '您已加入其他团队');
  END IF;

  LOOP
    code := generate_invite_code();
    BEGIN
      INSERT INTO organizations (name, invite_code) VALUES (org_name, code) RETURNING id INTO new_org_id;
      EXIT;
    EXCEPTION WHEN unique_violation THEN END;
  END LOOP;

  INSERT INTO organization_members (org_id, user_id, role) VALUES (new_org_id, auth.uid(), 'owner');

  RETURN json_build_object('org_id', new_org_id, 'invite_code', code);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 校验邀请码是否有效（注册前调用）
CREATE OR REPLACE FUNCTION validate_invite_code(code_to_check TEXT)
RETURNS JSON AS $$
DECLARE
  v_org_id UUID;
BEGIN
  SELECT org_id INTO v_org_id FROM registration_tokens WHERE code = code_to_check AND used = false;
  IF v_org_id IS NULL AND NOT EXISTS (SELECT 1 FROM registration_tokens WHERE code = code_to_check AND used = false) THEN
    RETURN json_build_object('valid', false, 'error', '邀请码无效或已使用');
  END IF;
  RETURN json_build_object('valid', true, 'org_id', v_org_id);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 获取当前用户所在组织信息
CREATE OR REPLACE FUNCTION get_my_org()
RETURNS JSON AS $$
DECLARE
  result JSON;
BEGIN
  SELECT json_build_object(
    'org_id', o.id,
    'org_name', o.name,
    'invite_code', o.invite_code,
    'role', om.role
  ) INTO result
  FROM organization_members om
  JOIN organizations o ON o.id = om.org_id
  WHERE om.user_id = auth.uid()
  LIMIT 1;

  RETURN result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 获取组织所有成员（仅主账号可调用）
CREATE OR REPLACE FUNCTION get_org_members()
RETURNS JSON AS $$
DECLARE
  result JSON;
BEGIN
  SELECT json_agg(json_build_object(
    'user_id', om.user_id,
    'email', u.email,
    'role', om.role,
    'created_at', om.created_at
  )) INTO result
  FROM organization_members om
  JOIN auth.users u ON u.id = om.user_id
  WHERE om.org_id IN (SELECT get_my_org_ids())
    AND EXISTS (SELECT 1 FROM organization_members WHERE org_id = om.org_id AND user_id = auth.uid() AND role = 'owner');

  RETURN COALESCE(result, '[]'::JSON);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 生成团队成员邀请码（仅主账号可调用）
CREATE OR REPLACE FUNCTION generate_team_invite_code()
RETURNS JSON AS $$
DECLARE
  v_org_id UUID;
  v_code TEXT;
BEGIN
  SELECT org_id INTO v_org_id FROM organization_members WHERE user_id = auth.uid() AND role = 'owner';
  IF v_org_id IS NULL THEN
    RETURN json_build_object('error', '只有主账号可以生成邀请码');
  END IF;

  LOOP
    v_code := generate_invite_code();
    BEGIN
      INSERT INTO registration_tokens (code, org_id) VALUES (v_code, v_org_id);
      EXIT;
    EXCEPTION WHEN unique_violation THEN END;
  END LOOP;

  RETURN json_build_object('code', v_code);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 获取所有未使用的团队邀请码
CREATE OR REPLACE FUNCTION get_team_invite_codes()
RETURNS JSON AS $$
DECLARE
  result JSON;
BEGIN
  SELECT json_agg(json_build_object(
    'code', rt.code,
    'created_at', rt.created_at
  )) INTO result
  FROM registration_tokens rt
  WHERE rt.org_id IN (SELECT get_my_org_ids())
    AND rt.used = false
    AND EXISTS (SELECT 1 FROM organization_members WHERE org_id = rt.org_id AND user_id = auth.uid() AND role = 'owner');

  RETURN COALESCE(result, '[]'::JSON);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 登录后消耗待处理的邀请码（因触发器可能读不到 metadata）
CREATE OR REPLACE FUNCTION consume_pending_invite()
RETURNS JSON AS $$
DECLARE
  v_code TEXT;
  v_org_id UUID;
  v_user_id UUID;
BEGIN
  v_user_id := auth.uid();

  -- 查找当前用户注册时携带的邀请码
  SELECT raw_user_meta_data->>'invite_code' INTO v_code
  FROM auth.users WHERE id = v_user_id;

  -- 没有邀请码，直接返回空
  IF v_code IS NULL THEN
    RETURN json_build_object('consumed', false, 'reason', 'no_invite_code');
  END IF;

  -- 已经加入了组织，跳过
  IF EXISTS (SELECT 1 FROM organization_members WHERE user_id = v_user_id) THEN
    RETURN json_build_object('consumed', false, 'reason', 'already_member');
  END IF;

  -- 查找并消耗邀请码
  SELECT org_id INTO v_org_id FROM registration_tokens WHERE code = v_code AND used = false;
  IF v_org_id IS NULL THEN
    RETURN json_build_object('consumed', false, 'reason', 'token_invalid_or_used');
  END IF;

  UPDATE registration_tokens SET used = true, used_by = v_user_id, used_at = NOW() WHERE code = v_code;

  INSERT INTO organization_members (org_id, user_id, role) VALUES (v_org_id, v_user_id, 'member');

  RETURN json_build_object('consumed', true, 'org_id', v_org_id);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 已有用户使用邀请码加入组织（用于注册时无邀请码，后来拿到邀请码的场景）
CREATE OR REPLACE FUNCTION join_with_invite_code(invite_code TEXT)
RETURNS JSON AS $$
DECLARE
  v_org_id UUID;
  v_user_id UUID;
BEGIN
  v_user_id := auth.uid();

  -- 检查是否已加入组织
  IF EXISTS (SELECT 1 FROM organization_members WHERE user_id = v_user_id) THEN
    RETURN json_build_object('error', '您已加入其他团队');
  END IF;

  -- 查找邀请码
  SELECT org_id INTO v_org_id FROM registration_tokens WHERE code = invite_code AND used = false;
  IF v_org_id IS NULL THEN
    RETURN json_build_object('error', '邀请码无效或已使用');
  END IF;

  -- 消耗邀请码并加入组织
  UPDATE registration_tokens SET used = true, used_by = v_user_id, used_at = NOW() WHERE code = invite_code;
  INSERT INTO organization_members (org_id, user_id, role) VALUES (v_org_id, v_user_id, 'member');

  RETURN json_build_object('success', true, 'org_id', v_org_id);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- 11. Seed：初始管理员邀请码（用于首次注册）
-- ============================================================
INSERT INTO registration_tokens (code, org_id) VALUES ('WOWOH-ADMIN', NULL)
ON CONFLICT (code) DO NOTHING;

-- ============================================================
-- 12. 更新现有业务表的 RLS 策略
-- ============================================================

-- -------- 商品（同组织全部可见） --------
DROP POLICY IF EXISTS "users_manage_own_products" ON products;
DROP POLICY IF EXISTS "p_products" ON products;
DROP POLICY IF EXISTS "products_select" ON products;
DROP POLICY IF EXISTS "products_insert" ON products;
DROP POLICY IF EXISTS "products_update" ON products;
DROP POLICY IF EXISTS "products_delete" ON products;
CREATE POLICY "products_select" ON products FOR SELECT USING (
  auth.uid() = user_id OR users_in_same_org(user_id)
);
CREATE POLICY "products_insert" ON products FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "products_update" ON products FOR UPDATE USING (
  auth.uid() = user_id OR (current_user_is_org_owner() AND users_in_same_org(user_id))
);
CREATE POLICY "products_delete" ON products FOR DELETE USING (
  auth.uid() = user_id OR (current_user_is_org_owner() AND users_in_same_org(user_id))
);

-- -------- 科目（同组织全部可见） --------
DROP POLICY IF EXISTS "users_manage_own_accounts" ON accounts;
DROP POLICY IF EXISTS "accounts_select" ON accounts;
DROP POLICY IF EXISTS "accounts_insert" ON accounts;
DROP POLICY IF EXISTS "accounts_update" ON accounts;
DROP POLICY IF EXISTS "accounts_delete" ON accounts;
CREATE POLICY "accounts_select" ON accounts FOR SELECT USING (
  auth.uid() = user_id OR users_in_same_org(user_id)
);
CREATE POLICY "accounts_insert" ON accounts FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "accounts_update" ON accounts FOR UPDATE USING (
  auth.uid() = user_id OR (current_user_is_org_owner() AND users_in_same_org(user_id))
);
CREATE POLICY "accounts_delete" ON accounts FOR DELETE USING (
  auth.uid() = user_id OR (current_user_is_org_owner() AND users_in_same_org(user_id))
);

-- -------- 客户（成员看自己，主账号看全部） --------
DROP POLICY IF EXISTS "users_manage_own_customers" ON customers;
DROP POLICY IF EXISTS "customers_select" ON customers;
DROP POLICY IF EXISTS "customers_insert" ON customers;
DROP POLICY IF EXISTS "customers_update" ON customers;
DROP POLICY IF EXISTS "customers_delete" ON customers;
CREATE POLICY "customers_select" ON customers FOR SELECT USING (
  auth.uid() = user_id OR (current_user_is_org_owner() AND users_in_same_org(user_id))
);
CREATE POLICY "customers_insert" ON customers FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "customers_update" ON customers FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "customers_delete" ON customers FOR DELETE USING (auth.uid() = user_id);

-- -------- 流水（成员看自己，主账号看全部） --------
DROP POLICY IF EXISTS "users_manage_own_transactions" ON transactions;
DROP POLICY IF EXISTS "transactions_select" ON transactions;
DROP POLICY IF EXISTS "transactions_insert" ON transactions;
DROP POLICY IF EXISTS "transactions_update" ON transactions;
DROP POLICY IF EXISTS "transactions_delete" ON transactions;
CREATE POLICY "transactions_select" ON transactions FOR SELECT USING (
  auth.uid() = user_id OR (current_user_is_org_owner() AND users_in_same_org(user_id))
);
CREATE POLICY "transactions_insert" ON transactions FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "transactions_update" ON transactions FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "transactions_delete" ON transactions FOR DELETE USING (auth.uid() = user_id);

-- -------- 订单（成员看自己，主账号看全部） --------
DROP POLICY IF EXISTS "users_manage_own_orders" ON orders;
DROP POLICY IF EXISTS "p_orders" ON orders;
DROP POLICY IF EXISTS "orders_select" ON orders;
DROP POLICY IF EXISTS "orders_insert" ON orders;
DROP POLICY IF EXISTS "orders_update" ON orders;
DROP POLICY IF EXISTS "orders_delete" ON orders;
CREATE POLICY "orders_select" ON orders FOR SELECT USING (
  auth.uid() = user_id OR (current_user_is_org_owner() AND users_in_same_org(user_id))
);
CREATE POLICY "orders_insert" ON orders FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "orders_update" ON orders FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "orders_delete" ON orders FOR DELETE USING (auth.uid() = user_id);

-- -------- 订单明细（成员看自己，主账号看全部） --------
DROP POLICY IF EXISTS "users_manage_own_order_items" ON order_items;
DROP POLICY IF EXISTS "p_order_items" ON order_items;
DROP POLICY IF EXISTS "order_items_select" ON order_items;
DROP POLICY IF EXISTS "order_items_insert" ON order_items;
DROP POLICY IF EXISTS "order_items_update" ON order_items;
DROP POLICY IF EXISTS "order_items_delete" ON order_items;
CREATE POLICY "order_items_select" ON order_items FOR SELECT USING (
  auth.uid() = user_id OR (current_user_is_org_owner() AND users_in_same_org(user_id))
);
CREATE POLICY "order_items_insert" ON order_items FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "order_items_update" ON order_items FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "order_items_delete" ON order_items FOR DELETE USING (auth.uid() = user_id);
