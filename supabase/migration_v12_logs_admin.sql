-- ============================================================
-- CRM v12 - 操作日志对管理员可见 + ops_select 策略更新
-- ============================================================

-- 1. get_operation_logs 改为管理员也可查看
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
    AND (current_user_is_org_owner() OR current_user_is_admin_or_owner())
  LIMIT p_limit;

  RETURN COALESCE(result, '[]'::JSON);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2. ops_select 策略改为管理员也可查看
DROP POLICY IF EXISTS "ops_select" ON operation_logs;
CREATE POLICY "ops_select" ON operation_logs FOR SELECT USING (
  org_id IN (SELECT get_my_org_ids())
  AND (current_user_is_org_owner() OR current_user_is_admin_or_owner())
);
