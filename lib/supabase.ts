// Load the dependency at runtime so TypeScript does not require its declarations
// while checking this server-only module.
type SupabaseClient = any;
const { createClient } = require('@supabase/supabase-js') as {
  createClient: (url: string, key: string, options: { auth: { persistSession: boolean } }) => SupabaseClient;
};

let admin: SupabaseClient | null = null;

/**
 * Server-only service-role client (ingestion, cron, admin reads).
 * Throws in the browser so the key can never leak client-side.
 */
export function getSupabaseAdmin(): SupabaseClient {
  if (typeof window !== 'undefined') {
    throw new Error('getSupabaseAdmin() is server-only');
  }
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  }
  admin ||= createClient(url, key, { auth: { persistSession: false } });
  return admin;
}

export function isSupabaseConfigured(): boolean {
  return Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
}