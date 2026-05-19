import { createContext, useContext, useEffect, type ReactNode } from 'react';
import { supabase } from '../supabase';
import { useAuthStore, initOrg, fetchOrg } from '../store/auth';
import type { OrgInfo } from '../types';

interface AuthState {
  user: ReturnType<typeof useAuthStore.getState>['user'];
  session: ReturnType<typeof useAuthStore.getState>['session'];
  loading: boolean;
  orgInfo: OrgInfo | null;
  orgLoading: boolean;
  permissions: ReturnType<typeof useAuthStore.getState>['permissions'];
  isOwner: boolean;
  isAdmin: boolean;
  signUp: (email: string, password: string, name: string, inviteCode: string) => Promise<{ error?: string }>;
  signIn: (email: string, password: string) => Promise<{ error?: string }>;
  signOut: () => Promise<void>;
  createOrg: (name: string) => Promise<{ error?: string }>;
  joinWithInviteCode: (inviteCode: string) => Promise<{ error?: string }>;
  refreshOrg: () => Promise<void>;
  hasOrgSetup: boolean;
}

const AuthContext = createContext<AuthState | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const user = useAuthStore((s) => s.user);
  const session = useAuthStore((s) => s.session);
  const loading = useAuthStore((s) => s.loading);
  const orgInfo = useAuthStore((s) => s.orgInfo);
  const orgLoading = useAuthStore((s) => s.orgLoading);
  const permissions = useAuthStore((s) => s.permissions);

  const isOwner = orgInfo?.role === 'owner';
  const isAdmin = orgInfo?.role === 'admin' || isOwner;

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      useAuthStore.getState().setSession(session?.user ?? null, session);
      if (session?.user) initOrg();
      else useAuthStore.getState().setOrgLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      useAuthStore.getState().setSession(session?.user ?? null, session);
      if (session?.user) initOrg();
      else useAuthStore.getState().reset();
    });

    return () => subscription.unsubscribe();
  }, []);

  const signUp = async (email: string, password: string, name: string, inviteCode: string) => {
    const { error } = await supabase.auth.signUp({
      email, password,
      options: { data: { name, invite_code: inviteCode.toUpperCase() } },
    });
    return error ? { error: error.message } : {};
  };

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return error ? { error: error.message } : {};
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    useAuthStore.getState().reset();
  };

  const createOrg = async (name: string) => {
    const { data, error } = await supabase.rpc('create_org', { org_name: name });
    if (error) return { error: error.message };
    const result = data as { error?: string; org_id?: string };
    if (result.error) return { error: result.error };
    await fetchOrg();
    return {};
  };

  const joinWithInviteCode = async (inviteCode: string) => {
    const { data, error } = await supabase.rpc('join_with_invite_code', { invite_code: inviteCode.toUpperCase() });
    if (error) return { error: error.message };
    const result = data as { error?: string; success?: boolean };
    if (result.error) return { error: result.error };
    await fetchOrg();
    return {};
  };

  return (
    <AuthContext.Provider value={{
      user, session, loading, orgInfo, orgLoading, permissions,
      isOwner, isAdmin,
      signUp, signIn, signOut,
      createOrg, joinWithInviteCode, refreshOrg: fetchOrg,
      hasOrgSetup: !!orgInfo,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
