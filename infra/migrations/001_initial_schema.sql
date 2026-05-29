-- ============================================================
-- Agent Ada — Initial Schema
-- Run against a fresh Supabase project (Postgres 15+)
-- ============================================================

-- ── Extensions ───────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS "pgcrypto";   -- gen_random_uuid(), encrypt()
CREATE EXTENSION IF NOT EXISTS "pg_net";     -- optional: async HTTP from DB

-- ============================================================
-- TABLES
-- ============================================================

-- ── users ────────────────────────────────────────────────────
CREATE TABLE users (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  wallet_address  TEXT NOT NULL UNIQUE
                    CHECK (wallet_address ~ '^0x[0-9a-fA-F]{40}$'),
  self_agent_id   TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── policies ─────────────────────────────────────────────────
CREATE TABLE policies (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  wallet_address       TEXT NOT NULL
                         CHECK (wallet_address ~ '^0x[0-9a-fA-F]{40}$'),
  version              INTEGER NOT NULL DEFAULT 1 CHECK (version > 0),
  min_net_gain_bps     INTEGER NOT NULL DEFAULT 50  CHECK (min_net_gain_bps >= 0),
  max_route_cost_bps   INTEGER NOT NULL DEFAULT 150 CHECK (max_route_cost_bps >= 0),
  cooldown_hours       INTEGER NOT NULL DEFAULT 24  CHECK (cooldown_hours >= 0),
  allowed_chains       TEXT[]  NOT NULL DEFAULT ARRAY['celo'],
  allowed_venues       TEXT[]  NOT NULL DEFAULT ARRAY['moola'],
  kill_switch          BOOLEAN NOT NULL DEFAULT false,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── positions ────────────────────────────────────────────────
CREATE TABLE positions (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  wallet_address   TEXT NOT NULL
                     CHECK (wallet_address ~ '^0x[0-9a-fA-F]{40}$'),
  chain            TEXT NOT NULL,
  venue            TEXT NOT NULL,
  asset            TEXT NOT NULL,
  amount           NUMERIC NOT NULL DEFAULT 0,  -- stored as wei / atomic units
  supply_rate_bps  INTEGER NOT NULL DEFAULT 0 CHECK (supply_rate_bps >= 0),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (wallet_address, chain, venue, asset)
);

-- ── quotes ───────────────────────────────────────────────────
CREATE TABLE quotes (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  wallet_address   TEXT NOT NULL
                     CHECK (wallet_address ~ '^0x[0-9a-fA-F]{40}$'),
  source_chain     TEXT NOT NULL,
  source_venue     TEXT NOT NULL,
  dest_chain       TEXT NOT NULL,
  dest_venue       TEXT NOT NULL,
  asset            TEXT NOT NULL,
  amount           NUMERIC NOT NULL,
  route_cost_bps   INTEGER NOT NULL DEFAULT 0 CHECK (route_cost_bps >= 0),
  net_gain_bps     INTEGER NOT NULL,
  payback_days     NUMERIC NOT NULL,
  policy_version   INTEGER NOT NULL,
  approval_token   TEXT NOT NULL,
  expires_at       TIMESTAMPTZ NOT NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── runs ─────────────────────────────────────────────────────
CREATE TABLE runs (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  wallet_address  TEXT NOT NULL
                    CHECK (wallet_address ~ '^0x[0-9a-fA-F]{40}$'),
  quote_id        UUID REFERENCES quotes (id) ON DELETE SET NULL,
  mode            TEXT NOT NULL CHECK (mode IN ('dry_run', 'live')),
  status          TEXT NOT NULL
                    CHECK (status IN (
                      'pending', 'executing', 'completed',
                      'failed', 'dry_run_complete'
                    )),
  tx_hashes       JSONB NOT NULL DEFAULT '[]'::jsonb,
  policy_version  INTEGER NOT NULL,
  outcome         JSONB,
  started_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at    TIMESTAMPTZ
);

-- ── reports ──────────────────────────────────────────────────
CREATE TABLE reports (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  wallet_address TEXT NOT NULL
                   CHECK (wallet_address ~ '^0x[0-9a-fA-F]{40}$'),
  period         TEXT NOT NULL,   -- e.g. '2026-05', '2026-W22'
  summary_json   JSONB NOT NULL DEFAULT '{}'::jsonb,
  generated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── chats ────────────────────────────────────────────────────
CREATE TABLE chats (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  wallet_address  TEXT NOT NULL
                    CHECK (wallet_address ~ '^0x[0-9a-fA-F]{40}$'),
  role            TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
  content         TEXT NOT NULL,
  payload         JSONB,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── telegram_configs ─────────────────────────────────────────
-- bot_token_ciphertext is AES-256-GCM encrypted by the backend.
-- It is never decrypted inside the DB; the backend owns the key.
CREATE TABLE telegram_configs (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  wallet_address        TEXT NOT NULL UNIQUE
                          CHECK (wallet_address ~ '^0x[0-9a-fA-F]{40}$'),
  bot_token_ciphertext  TEXT NOT NULL,
  chat_id               TEXT NOT NULL,
  events                TEXT[] NOT NULL DEFAULT ARRAY['dry_run', 'executed', 'error'],
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── api_calls ────────────────────────────────────────────────
CREATE TABLE api_calls (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  caller_agent_id  TEXT,
  endpoint         TEXT NOT NULL,
  x402_invoice     TEXT,
  settled_tx       TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- INDEXES
-- ============================================================

CREATE INDEX idx_policies_wallet     ON policies (wallet_address, version DESC);
CREATE INDEX idx_positions_wallet    ON positions (wallet_address);
CREATE INDEX idx_quotes_wallet       ON quotes (wallet_address, expires_at DESC);
CREATE INDEX idx_runs_wallet         ON runs (wallet_address, started_at DESC);
CREATE INDEX idx_runs_quote          ON runs (quote_id);
CREATE INDEX idx_reports_wallet      ON reports (wallet_address, generated_at DESC);
CREATE INDEX idx_chats_wallet        ON chats (wallet_address, created_at ASC);
CREATE INDEX idx_api_calls_created   ON api_calls (created_at DESC);

-- ============================================================
-- ROW LEVEL SECURITY
-- RLS uses app.wallet_address, set per-transaction by the
-- backend before every query:
--   SET LOCAL app.wallet_address = '<hex-address>';
-- The service-role key bypasses RLS, but we keep policies
-- here as a defence-in-depth layer for any future anon usage.
-- ============================================================

ALTER TABLE users              ENABLE ROW LEVEL SECURITY;
ALTER TABLE policies           ENABLE ROW LEVEL SECURITY;
ALTER TABLE positions          ENABLE ROW LEVEL SECURITY;
ALTER TABLE quotes             ENABLE ROW LEVEL SECURITY;
ALTER TABLE runs               ENABLE ROW LEVEL SECURITY;
ALTER TABLE reports            ENABLE ROW LEVEL SECURITY;
ALTER TABLE chats              ENABLE ROW LEVEL SECURITY;
ALTER TABLE telegram_configs   ENABLE ROW LEVEL SECURITY;
-- api_calls is not wallet-scoped so RLS is intentionally omitted

CREATE POLICY "users_wallet_scope"            ON users
  USING (wallet_address = current_setting('app.wallet_address', true));

CREATE POLICY "policies_wallet_scope"         ON policies
  USING (wallet_address = current_setting('app.wallet_address', true));

CREATE POLICY "positions_wallet_scope"        ON positions
  USING (wallet_address = current_setting('app.wallet_address', true));

CREATE POLICY "quotes_wallet_scope"           ON quotes
  USING (wallet_address = current_setting('app.wallet_address', true));

CREATE POLICY "runs_wallet_scope"             ON runs
  USING (wallet_address = current_setting('app.wallet_address', true));

CREATE POLICY "reports_wallet_scope"          ON reports
  USING (wallet_address = current_setting('app.wallet_address', true));

CREATE POLICY "chats_wallet_scope"            ON chats
  USING (wallet_address = current_setting('app.wallet_address', true));

CREATE POLICY "telegram_configs_wallet_scope" ON telegram_configs
  USING (wallet_address = current_setting('app.wallet_address', true));

-- ============================================================
-- HELPER FUNCTIONS
-- ============================================================

-- Returns the latest policy for a wallet (or NULL if none).
CREATE OR REPLACE FUNCTION latest_policy(p_wallet TEXT)
RETURNS policies AS $$
  SELECT * FROM policies
  WHERE wallet_address = p_wallet
  ORDER BY version DESC
  LIMIT 1;
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- Upserts a position row and bumps updated_at.
CREATE OR REPLACE FUNCTION upsert_position(
  p_wallet   TEXT,
  p_chain    TEXT,
  p_venue    TEXT,
  p_asset    TEXT,
  p_amount   NUMERIC,
  p_rate_bps INTEGER
) RETURNS positions AS $$
  INSERT INTO positions
    (wallet_address, chain, venue, asset, amount, supply_rate_bps, updated_at)
  VALUES
    (p_wallet, p_chain, p_venue, p_asset, p_amount, p_rate_bps, now())
  ON CONFLICT (wallet_address, chain, venue, asset)
  DO UPDATE SET
    amount          = EXCLUDED.amount,
    supply_rate_bps = EXCLUDED.supply_rate_bps,
    updated_at      = now()
  RETURNING *;
$$ LANGUAGE sql VOLATILE SECURITY DEFINER;

-- ============================================================
-- SEED — one test wallet for local development
-- Remove before production deployment.
-- ============================================================

DO $$
DECLARE
  test_wallet CONSTANT TEXT := '0x000000000000000000000000000000000000dEaD';
BEGIN
  INSERT INTO users (wallet_address)
  VALUES (test_wallet)
  ON CONFLICT DO NOTHING;

  INSERT INTO policies (wallet_address, version, min_net_gain_bps,
                        max_route_cost_bps, cooldown_hours,
                        allowed_chains, allowed_venues, kill_switch)
  VALUES (test_wallet, 1, 50, 150, 24,
          ARRAY['celo'], ARRAY['moola'], false)
  ON CONFLICT DO NOTHING;
END $$;
