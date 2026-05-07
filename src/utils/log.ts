import { supabase } from '../supabase';

/** 记录子账号操作日志（主账号可见） */
export async function logOperation(
  entity: string,
  action: string,
  entityId?: string,
  description?: string,
) {
  try {
    await supabase.rpc('log_operation', {
      p_entity: entity,
      p_action: action,
      p_entity_id: entityId || null,
      p_description: description || '',
    });
  } catch {
    // silently fail — logging should never block the user
  }
}
