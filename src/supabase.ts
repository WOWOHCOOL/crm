import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const supabase = createClient(
  supabaseUrl || 'https://placeholder.supabase.co',
  supabaseAnonKey || 'placeholder',
  {
    auth: {
      autoRefreshToken: true,
      persistSession: true,
    },
  },
);

export const isConfigured = !!(supabaseUrl && supabaseAnonKey);

// Warm up the connection to the API origin (DNS + TCP + TLS) in parallel
// with bundle execution, so the first query starts on an existing socket.
if (isConfigured && typeof document !== 'undefined') {
  const origin = new URL(supabaseUrl).origin;
  for (const rel of ['preconnect', 'dns-prefetch'] as const) {
    const link = document.createElement('link');
    link.rel = rel;
    link.href = origin;
    link.crossOrigin = 'anonymous';
    document.head.appendChild(link);
  }
}
