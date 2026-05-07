import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from 'react';
import { supabase } from '../supabase';
import type { User, Session } from '@supabase/supabase-js';
import type { OrgInfo } from '../types';

interface AuthState {
  user: User | null;
  session: Session | null;
  loading: boolean;
  orgInfo: OrgInfo | null;
  orgLoading: boolean;
  signUp: (email: string, password: string, name: string, inviteCode: string) => Promise<{ error?: string }>;
  signIn: (email: string, password: string) => Promise<{ error?: string }>;
  signOut: () => Promise<void>;
  createOrg: (name: string) => Promise<{ error?: string }>;
  refreshOrg: () => Promise<void>;
  hasOrgSetup: boolean;
}

const AuthContext = createContext<AuthState | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [orgInfo, setOrgInfo] = useState<OrgInfo | null>(null);
  const [orgLoading, setOrgLoading] = useState(true);

  const fetchOrg = useCallback(async () => {
    setOrgLoading(true);
    try {
      const { data, error } = await supabase.rpc('get_my_org');
      if (error) throw error;
      if (data && data.org_id) {
        setOrgInfo(data as OrgInfo);
      } else {
        setOrgInfo(null);
      }
    } catch {
      setOrgInfo(null);
    } finally {
      setOrgLoading(false);
    }
  }, []);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      setLoading(false);
      if (session?.user) {
        fetchOrg();
      } else {
        setOrgLoading(false);
      }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) {
        fetchOrg();
      } else {
        setOrgInfo(null);
      }
    });

    return () => subscription.unsubscribe();
  }, [fetchOrg]);

  const signUp = async (email: string, password: string, name: string, inviteCode: string) => {
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          name,
          invite_code: inviteCode.toUpperCase(),
        },
      },
    });
    if (error) return { error: error.message };
    return {};
  };

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) return { error: error.message };
    return {};
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    setOrgInfo(null);
  };

  const createOrg = async (name: string) => {
    const { data, error } = await supabase.rpc('create_org', { org_name: name });
    if (error) return { error: error.message };
    const result = data as { error?: string; org_id?: string };
    if (result.error) return { error: result.error };
    await fetchOrg();
    return {};
  };

  const refreshOrg = fetchOrg;

  const hasOrgSetup = !!orgInfo;

  return (
    <AuthContext.Provider value={{
      user, session, loading, orgInfo, orgLoading,
      signUp, signIn, signOut,
      createOrg, refreshOrg,
      hasOrgSetup,
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
