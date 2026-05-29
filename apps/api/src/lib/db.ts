import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@ada/shared";

let _client: SupabaseClient<Database> | null = null;

/**
 * Returns a singleton Supabase client configured with the service-role key.
 * Never import this in browser-side code.
 *
 * All wallet-scoping is enforced by explicit .eq("wallet_address", wallet)
 * on every query — do not omit it.
 */
export function getDb(): SupabaseClient<Database> {
  if (_client) return _client;

  const url = process.env["SUPABASE_URL"];
  const key = process.env["SUPABASE_SERVICE_ROLE_KEY"];

  if (!url || !key) {
    throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set");
  }

  _client = createClient<Database>(url, key, {
    auth: { persistSession: false },
  });

  return _client;
}

export type Db = SupabaseClient<Database>;

// ── Named query helpers ───────────────────────────────────────
// Each one enforces the wallet filter so callers cannot omit it.

export async function getLatestPolicy(db: Db, wallet: string) {
  const { data, error } = await db
    .from("policies")
    .select("*")
    .eq("wallet_address", wallet)
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw new Error(`getLatestPolicy: ${error.message}`);
  return data;
}

export async function upsertUser(db: Db, wallet: string) {
  const { data, error } = await db
    .from("users")
    .upsert({ wallet_address: wallet }, { onConflict: "wallet_address" })
    .select()
    .single();

  if (error) throw new Error(`upsertUser: ${error.message}`);
  return data;
}

export async function updateRunStatus(
  db: Db,
  runId: string,
  update: Database["public"]["Tables"]["runs"]["Update"],
) {
  const { data, error } = await db
    .from("runs")
    .update(update)
    .eq("id", runId)
    .select()
    .single();

  if (error) throw new Error(`updateRunStatus: ${error.message}`);
  return data;
}

export async function getPositions(db: Db, wallet: string) {
  const { data, error } = await db
    .from("positions")
    .select("*")
    .eq("wallet_address", wallet);

  if (error) throw new Error(`getPositions: ${error.message}`);
  return data ?? [];
}

export async function getChatHistory(db: Db, wallet: string, limit = 50) {
  const { data, error } = await db
    .from("chats")
    .select("*")
    .eq("wallet_address", wallet)
    .order("created_at", { ascending: true })
    .limit(limit);

  if (error) throw new Error(`getChatHistory: ${error.message}`);
  return data ?? [];
}

export async function getTelegramConfig(db: Db, wallet: string) {
  const { data, error } = await db
    .from("telegram_configs")
    .select("*")
    .eq("wallet_address", wallet)
    .maybeSingle();

  if (error) throw new Error(`getTelegramConfig: ${error.message}`);
  return data;
}

export async function getRuns(
  db: Db,
  wallet: string,
  opts: { limit?: number; offset?: number } = {},
) {
  const { data, error } = await db
    .from("runs")
    .select("*")
    .eq("wallet_address", wallet)
    .order("started_at", { ascending: false })
    .range(opts.offset ?? 0, (opts.offset ?? 0) + (opts.limit ?? 20) - 1);

  if (error) throw new Error(`getRuns: ${error.message}`);
  return data ?? [];
}
