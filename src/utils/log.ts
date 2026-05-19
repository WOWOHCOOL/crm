import { supabase } from '../supabase';

/** 记录子账号操作日志（主账号/管理员可见） */
export async function logOperation(
  entity: string,
  action: string,
  entityId?: string,
  description?: string,
) {
  const { error } = await supabase.rpc('log_operation', {
    p_entity: entity,
    p_action: action,
    p_entity_id: entityId || null,
    p_description: description || '',
  });
  if (error) console.warn('logOperation RPC error:', error);
}
