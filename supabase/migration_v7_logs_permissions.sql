-- ============================================================
-- CRM v7 - 操作日志 & 子账号权限
-- ============================================================

-- 操作日志表
CREATE TABLE IF NOT EXISTS operation_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  user_email TEXT,
  action TEXT NOT NULL,
  entity TEXT NOT NULL,
  entity_id UUID,
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ops_org ON operation_logs(org_id, created_at DESC);

ALTER TABLE operation_logs ENABLE ROW LEVEL SECURITY;

-- Owner can read all logs in org; members can insert their own
DROP POLICY IF EXISTS "ops_select" ON operation_logs;
DROP POLICY IF EXISTS "ops_insert" ON operation_logs;
CREATE POLICY "ops_select" ON operation_logs FOR SELECT USING (
  org_id IN (SELECT get_my_org_ids()) AND current_user_is_org_owner()
);
CREATE POLICY "ops_insert" ON operation_logs FOR INSERT WITH CHECK (
  auth.uid() = user_id
);

-- 成员权限表
CREATE TABLE IF NOT EXISTS member_permissions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  permission TEXT NOT NULL,
  allowed BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(org_id, user_id, permission)
);

CREATE INDEX IF NOT EXISTS idx_perm_user ON member_permissions(user_id);

ALTER TABLE member_permissions ENABLE ROW LEVEL SECURITY;

-- Owner can manage all; members can read their own
DROP POLICY IF EXISTS "perm_select" ON member_permissions;
DROP POLICY IF EXISTS "perm_insert" ON member_permissions;
DROP POLICY IF EXISTS "perm_update" ON member_permissions;
DROP POLICY IF EXISTS "perm_delete" ON member_permissions;

CREATE POLICY "perm_select" ON member_permissions FOR SELECT USING (
  org_id IN (SELECT get_my_org_ids()) AND (auth.uid() = user_id OR current_user_is_org_owner())
);
CREATE POLICY "perm_insert" ON member_permissions FOR INSERT WITH CHECK (
  org_id IN (SELECT get_my_org_ids()) AND current_user_is_org_owner()
);
CREATE POLICY "perm_update" ON member_permissions FOR UPDATE USING (
  org_id IN (SELECT get_my_org_ids()) AND current_user_is_org_owner()
);
CREATE POLICY "perm_delete" ON member_permissions FOR DELETE USING (
  org_id IN (SELECT get_my_org_ids()) AND current_user_is_org_owner()
);

-- RPC: 记录操作日志
CREATE OR REPLACE FUNCTION log_operation(
  p_entity TEXT,
  p_action TEXT,
  p_entity_id UUID DEFAULT NULL,
  p_description TEXT DEFAULT ''
) RETURNS JSON AS $$
DECLARE
  v_org_id UUID;
  v_email TEXT;
BEGIN
  SELECT org_id INTO v_org_id FROM organization_members WHERE user_id = auth.uid() LIMIT 1;
  SELECT email INTO v_email FROM auth.users WHERE id = auth.uid();

  INSERT INTO operation_logs (org_id, user_id, user_email, action, entity, entity_id, description)
  VALUES (v_org_id, auth.uid(), v_email, p_action, p_entity, p_entity_id, p_description);

  RETURN json_build_object('logged', true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- RPC: 获取操作日志（仅主账号）
CREATE OR REPLACE FUNCTION get_operation_logs(
  p_limit INT DEFAULT 50
) RETURNS JSON AS $$
DECLARE
  result JSON;
BEGIN
  SELECT json_agg(json_build_object(
    'id', ol.id,
    'user_email', ol.user_email,
    'action', ol.action,
    'entity', ol.entity,
    'description', ol.description,
    'created_at', ol.created_at
  ) ORDER BY ol.created_at DESC) INTO result
  FROM operation_logs ol
  WHERE ol.org_id IN (SELECT get_my_org_ids())
    AND current_user_is_org_owner()
  LIMIT p_limit;

  RETURN COALESCE(result, '[]'::JSON);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- RPC: 设置成员权限
CREATE OR REPLACE FUNCTION set_member_permission(
  p_user_id UUID,
  p_permission TEXT,
  p_allowed BOOLEAN
) RETURNS JSON AS $$
DECLARE
  v_org_id UUID;
BEGIN
  SELECT org_id INTO v_org_id FROM organization_members WHERE user_id = auth.uid() AND role = 'owner' LIMIT 1;
  IF v_org_id IS NULL THEN RETURN json_build_object('error', '仅主账号可操作'); END IF;

  INSERT INTO member_permissions (org_id, user_id, permission, allowed)
  VALUES (v_org_id, p_user_id, p_permission, p_allowed)
  ON CONFLICT (org_id, user_id, permission) DO UPDATE SET allowed = p_allowed;

  RETURN json_build_object('success', true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- RPC: 获取成员权限
CREATE OR REPLACE FUNCTION get_member_permissions(
  p_user_id UUID
) RETURNS JSON AS $$
DECLARE
  result JSON;
BEGIN
  SELECT json_agg(json_build_object('permission', permission, 'allowed', allowed)) INTO result
  FROM member_permissions
  WHERE user_id = p_user_id
    AND org_id IN (SELECT get_my_org_ids());

  RETURN COALESCE(result, '[]'::JSON);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- RPC: 获取当前用户所有权限
CREATE OR REPLACE FUNCTION get_my_permissions()
RETURNS JSON AS $$
DECLARE
  result JSON;
BEGIN
  SELECT json_agg(permission) INTO result
  FROM member_permissions
  WHERE user_id = auth.uid() AND allowed = true;

  RETURN COALESCE(result, '[]'::JSON);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
