import { create } from 'zustand';
import { supabase } from '../supabase';
import type { User, Session } from '@supabase/supabase-js';
import type { OrgInfo, Permission } from '../types';

interface AuthStore {
  user: User | null;
  session: Session | null;
  loading: boolean;
  orgInfo: OrgInfo | null;
  orgLoading: boolean;
  permissions: Permission[];
  setSession: (user: User | null, session: Session | null) => void;
  setOrgInfo: (info: OrgInfo | null) => void;
  setPermissions: (perms: Permission[]) => void;
  setLoading: (loading: boolean) => void;
  setOrgLoading: (loading: boolean) => void;
  reset: () => void;
}

export const useAuthStore = create<AuthStore>((set) => ({
  user: null,
  session: null,
  loading: true,
  orgInfo: null,
  orgLoading: true,
  permissions: [],
  setSession: (user, session) => set({ user, session, loading: false }),
  setOrgInfo: (orgInfo) => set({ orgInfo, orgLoading: false }),
  setPermissions: (permissions) => set({ permissions }),
  setLoading: (loading) => set({ loading }),
  setOrgLoading: (orgLoading) => set({ orgLoading }),
  reset: () => set({ user: null, session: null, loading: true, orgInfo: null, orgLoading: true, permissions: [] }),
}));

export async function fetchOrg() {
  const s = useAuthStore.getState();
  s.setOrgLoading(true);
  try {
    const { data, error } = await supabase.rpc('get_my_org');
    if (error) throw error;
    s.setOrgInfo(data?.org_id ? (data as OrgInfo) : null);
  } catch {
    s.setOrgInfo(null);
  }
}

export async function loadPermissions() {
  try {
    const { data } = await supabase.rpc('get_my_permissions');
    if (Array.isArray(data)) useAuthStore.getState().setPermissions(data as Permission[]);
  } catch { /* ignore */ }
}

export async function initOrg() {
  const s = useAuthStore.getState();
  s.setOrgLoading(true);
  try {
    const { data: orgData } = await supabase.rpc('get_my_org');
    if (orgData?.org_id) {
      s.setOrgInfo(orgData as OrgInfo);
      await loadPermissions();
      s.setOrgLoading(false);
      return;
    }
    const { data: inviteResult } = await supabase.rpc('consume_pending_invite');
    if (inviteResult?.consumed) {
      const { data: newOrg } = await supabase.rpc('get_my_org');
      if (newOrg?.org_id) { s.setOrgInfo(newOrg as OrgInfo); await loadPermissions(); s.setOrgLoading(false); return; }
    }
    s.setOrgInfo(null);
  } catch {
    const s = useAuthStore.getState();
    s.setOrgInfo(null);
  } finally {
    await loadPermissions();
    useAuthStore.getState().setOrgLoading(false);
  }
}
