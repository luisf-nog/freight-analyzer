import { createClient } from "@supabase/supabase-js";

// Public anon client for MCP tools. Never use service role here — the MCP
// server is unauthenticated, so callers must not gain more privilege than
// the browser's anon role already has.
export function getPublicSupabase() {
  const url = process.env.SUPABASE_URL;
  const anon = process.env.SUPABASE_PUBLISHABLE_KEY ?? process.env.SUPABASE_ANON_KEY;
  if (!url || !anon) {
    throw new Error("Supabase env not configured (SUPABASE_URL / SUPABASE_PUBLISHABLE_KEY)");
  }
  return createClient(url, anon, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
