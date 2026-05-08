-- ============================================================
-- CRM v12 - 操作日志权限修正
-- 主账号 → 看全部；管理员/普通成员 → 只能看自己的
-- ============================================================

-- 1. get_operation_logs 按角色返回不同范围
CREATE OR REPLACE FUNCTION get_operation_logs(
  p_limit INT DEFAULT 50
) RETURNS JSON AS $$
DECLARE
  result JSON;
BEGIN
  IF current_user_is_org_owner() THEN
    -- 主账号：看组织全部
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
    LIMIT p_limit;
  ELSE
    -- 管理员/普通成员：只看自己的
    SELECT json_agg(json_build_object(
      'id', ol.id,
      'user_email', ol.user_email,
      'action', ol.action,
      'entity', ol.entity,
      'description', ol.description,
      'created_at', ol.created_at
    ) ORDER BY ol.created_at DESC) INTO result
    FROM operation_logs ol
    WHERE ol.user_id = auth.uid()
    LIMIT p_limit;
  END IF;

  RETURN COALESCE(result, '[]'::JSON);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2. ops_select 策略同步修正（虽然 SECURITY DEFINER 绕过 RLS，留作后备）
DROP POLICY IF EXISTS "ops_select" ON operation_logs;
CREATE POLICY "ops_select" ON operation_logs FOR SELECT USING (
  org_id IN (SELECT get_my_org_ids())
  AND (current_user_is_org_owner() OR user_id = auth.uid())
);
