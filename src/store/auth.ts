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
  isOwner: boolean;
  isAdmin: boolean;
  setSession: (user: User | null, session: Session | null) => void;
  setOrgInfo: (info: OrgInfo | null) => void;
  setPermissions: (perms: Permission[]) => void;
  setLoading: (loading: boolean) => void;
  setOrgLoading: (loading: boolean) => void;
  reset: () => void;
}

const initialState = {
  user: null,
  session: null,
  loading: true,
  orgInfo: null,
  orgLoading: true,
  permissions: [],
};

export const useAuthStore = create<AuthStore>((set, get) => ({
  ...initialState,
  get isOwner() { return get().orgInfo?.role === 'owner'; },
  get isAdmin() { return get().orgInfo?.role === 'admin' || get().orgInfo?.role === 'owner'; },
  setSession: (user, session) => set({ user, session, loading: false }),
  setOrgInfo: (orgInfo) => set({ orgInfo, orgLoading: false }),
  setPermissions: (permissions) => set({ permissions }),
  setLoading: (loading) => set({ loading }),
  setOrgLoading: (orgLoading) => set({ orgLoading }),
  reset: () => set(initialState),
}));

// ── Auth helpers (moved from AuthContext, uses zustand internally) ──

export async function fetchOrg() {
  const set = useAuthStore.getState().setOrgInfo;
  const setLoading = useAuthStore.getState().setOrgLoading;
  setLoading(true);
  try {
    const { data, error } = await supabase.rpc('get_my_org');
    if (error) throw error;
    set(data?.org_id ? (data as OrgInfo) : null);
  } catch {
    set(null);
  }
}

export async function loadPermissions() {
  try {
    const { data } = await supabase.rpc('get_my_permissions');
    if (Array.isArray(data)) useAuthStore.getState().setPermissions(data as Permission[]);
  } catch { /* ignore */ }
}

export async function initOrg() {
  const setOrg = useAuthStore.getState().setOrgInfo;
  const setLoading = useAuthStore.getState().setOrgLoading;
  setLoading(true);
  try {
    const { data: orgData } = await supabase.rpc('get_my_org');
    if (orgData?.org_id) {
      setOrg(orgData as OrgInfo);
      await loadPermissions();
      setLoading(false);
      return;
    }
    const { data: inviteResult } = await supabase.rpc('consume_pending_invite');
    if (inviteResult?.consumed) {
      const { data: newOrg } = await supabase.rpc('get_my_org');
      if (newOrg?.org_id) { setOrg(newOrg as OrgInfo); await loadPermissions(); setLoading(false); return; }
    }
    setOrg(null);
  } catch {
    setOrg(null);
  } finally {
    await loadPermissions();
    setLoading(false);
  }
}
