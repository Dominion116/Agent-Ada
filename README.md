# Agent Ada

An autonomous stablecoin treasury agent built natively for Celo.

Ada watches a user's stablecoin holdings, finds the strongest available yield across Celo and supported destination chains, prices the full cost of moving between positions, and executes rebalances under an explicit user policy. It is designed so a MiniPay user can save into yield from a Telegram conversation without ever opening a dashboard, and so a DeFi power user can configure fine-grained thresholds and approve moves with one tap.

Ada is registered as an ERC-8004 agent, verified through Self Agent ID, charges a transparent fee per executed rebalance via x402, and surfaces every action on agentscan and 8004scan.

Built for the Celo Onchain Agents Hackathon, May to June 2026.

---

## Table of Contents

1. [What Ada Does](#what-ada-does)
2. [Repository Layout](#repository-layout)
3. [Tech Stack](#tech-stack)
4. [Prerequisites](#prerequisites)
5. [Setup](#setup)
6. [Running the Tests](#running-the-tests)
7. [Test Coverage Overview](#test-coverage-overview)
8. [Environment Variables](#environment-variables)
9. [External Service Setup](#external-service-setup)
10. [Architecture Overview](#architecture-overview)
11. [Current Build Status](#current-build-status)
12. [Roadmap](#roadmap)

---

## What Ada Does

**Yield discovery.** Ada fetches live supply rates from Moola Market on Celo (cUSD and USDC) and from Aave V3 on Base, Polygon, Arbitrum, and Optimism (USDC). Results are cached for 60 seconds to protect against rate limits.

**Route comparison.** For each destination allowed by the user's policy, Ada calls the LI.FI SDK to quote the full bridge cost including fees, slippage, and gas. It computes a payback window in days: how long it takes for the incremental yield to cover the one-time bridge cost. Routes that exceed the payback cap or the cost cap are discarded before the user ever sees them.

**Policy engine.** Every action passes through a strict policy gate. The guards run in fixed priority order: kill switch, cooldown window, minimum net yield gain, maximum bridge cost, allowed chains, allowed venues. A user can halt everything with a single toggle or Telegram command.

**Execution engine.** Approved rebalances execute step by step: withdraw from the source venue, bridge via LI.FI if cross-chain, deposit to the destination. Each step writes its transaction hash and block number to the database before proceeding. A dry-run mode produces the same run record and notifications without sending any transactions.

**NL command parser.** Ada translates plain-language messages (from the chat interface or Telegram) into structured agent commands using Gemini. Common commands bypass the LLM entirely with exact-match shortcuts. Anything Gemini cannot parse safely falls back to an `unknown` command rather than guessing.

**Telegram interface.** Users receive notifications on dry-run proposals, live executions, and errors. Non-technical users can onboard entirely through Telegram using the MiniPay companion mode.

**Paid API.** Other agents can call Ada's yield and execution endpoints via x402 micropayments. Every call is recorded with the caller's agent ID and the settlement transaction.

---

## Repository Layout

```
agent-ada/
├── apps/
│   ├── api/                    Node.js 22 + Express backend
│   │   └── src/
│   │       ├── agent/          Core agent logic (all injectable, all tested)
│   │       │   ├── adapters/   Moola and Aave V3 yield adapters
│   │       │   ├── abis.ts     Minimal ABI slices
│   │       │   ├── execution-engine.ts
│   │       │   ├── lifi-client.ts
│   │       │   ├── nl-parser.ts
│   │       │   ├── policy-engine.ts
│   │       │   ├── route-comparison.ts
│   │       │   └── yield-discovery.ts
│   │       ├── lib/
│   │       │   └── db.ts       Supabase singleton + typed query helpers
│   │       └── onchain/
│   │           ├── celo-client.ts    Public and wallet Viem clients
│   │           └── moola-actions.ts  Supply and withdraw tx builders
│   ├── web/                    Next.js 16 frontend (Phase 4)
│   └── cli/                    Commander.js CLI, published as agent-ada (Phase 3)
├── packages/
│   ├── shared/                 Zod schemas + TypeScript types + Database type
│   │   └── src/
│   │       ├── db.ts           Supabase Database type definition
│   │       ├── index.ts        Barrel export
│   │       └── schemas/        One file per domain entity
│   └── contracts/              ERC-8004 scripts, Moola ABIs, x402 config (Phase 2)
└── infra/
    └── migrations/
        └── 001_initial_schema.sql   Full Postgres schema with RLS
```

---

## Tech Stack

| Layer | Choice | Notes |
|-------|--------|-------|
| Runtime | Node.js 22 LTS | ESM throughout |
| Language | TypeScript 5.5 | Strict mode, exactOptionalPropertyTypes |
| Monorepo | npm workspaces | No pnpm, no Turborepo |
| Shared types | Zod 3 | Runtime validation + inferred TS types |
| Onchain client | Viem 2 | Celo, Base, Polygon, Arbitrum, Optimism |
| Yield venues | Moola Market (Celo), Aave V3 (multi-chain) | |
| Bridging | LI.FI SDK 3 | Route aggregation across EVM chains |
| AI | Gemini 1.5 Flash via @google/generative-ai | NL command parsing + run explanations |
| Database | Supabase (Postgres 15) | Row-level security per wallet address |
| Agent identity | ERC-8004 + Self Agent ID | Phase 2 |
| Payments | x402 via Thirdweb | Phase 3 |
| Frontend | Next.js 16 + shadcn/ui | Phase 4 |
| Notifications | Telegram Bot API | Phase 3 |
| Testing | Vitest 2 | 143 unit tests, no network calls |

---

## Prerequisites

- Node.js 22 or later (`node --version`)
- npm 10 or later (`npm --version`)
- A Supabase project (free tier works for development)
- A Gemini API key from Google AI Studio (free tier available)
- A Celo wallet private key for the agent operational wallet

For running against live protocols you will also need RPC endpoints for Celo, Base, Polygon, Arbitrum, and Optimism. Public endpoints are fine for testing but not recommended for production.

---

## Setup

### 1. Clone and install

```bash
git clone https://github.com/your-username/agent-ada.git
cd agent-ada
npm install
```

The `.npmrc` at the root sets `legacy-peer-deps=true` to work around a known npm 11 arborist issue with Vitest's wildcard peer dependencies.

### 2. Copy environment files

```bash
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env.local
```

Fill in the values described in the [Environment Variables](#environment-variables) section below.

### 3. Run the Supabase migration

Open the Supabase SQL editor for your project and run the contents of:

```
infra/migrations/001_initial_schema.sql
```

This creates all nine tables with row-level security, indexes, helper functions, and a seed row for the test wallet `0x000000000000000000000000000000000000dEaD`.

### 4. Build the shared package

The shared package must be built before the web app can import it. The API dev server uses Vitest aliases to point directly at the TypeScript source, so rebuilding on every change is not required during backend development.

```bash
npm run build -w @ada/shared
```

---

## Running the Tests

All tests are unit tests. They mock every external dependency: Viem public clients, Supabase, LI.FI SDK, and Gemini. No network access is required to run the test suite.

### Run everything

```bash
npm test --workspaces --if-present
```

Expected output: 9 test files, 143 tests, all passing.

### Run by workspace

```bash
# Agent logic and onchain helpers (129 tests across 8 files)
npm run test -w @ada/api

# Zod schema validation (14 tests)
npm run test -w @ada/shared
```

### Watch mode (reruns on file save)

```bash
# Watch the api package
npm run test -w @ada/api -- --watch
```

### Type checking

```bash
# Check all packages that have a typecheck script
npm run typecheck --workspaces --if-present

# Check individually
npm run typecheck -w @ada/shared
npm run typecheck -w @ada/api
```

---

## Test Coverage Overview

| File | Tests | What it covers |
|------|-------|----------------|
| `schemas.test.ts` | 14 | Zod schema validation for all 9 DB entities and the AgentCommand union |
| `yield-discovery.test.ts` | 10 | Cache TTL, partial adapter failure, `bestYield` filtering |
| `moola.test.ts` | 6 | RAY-to-BPS conversion, utilisation math, partial asset failure |
| `celo-client.test.ts` | 11 | `balanceOf` call params, decimal formatting for cUSD (18 dec) and USDC (6 dec) |
| `moola-actions.test.ts` | 15 | Approve+deposit step order, withdraw step, gas parameter propagation |
| `route-comparison.test.ts` | 28 | Math helpers, all 5 policy guards, LI.FI fallback, multi-destination winner selection |
| `policy-engine.test.ts` | 20 | All 7 guards in isolation, priority ordering, cooldown boundary conditions |
| `execution-engine.test.ts` | 18 | Dry-run pass/fail, live same-chain step ordering, cross-chain bridge, tx revert handling |
| `nl-parser.test.ts` | 21 | Exact-match shortcuts, Gemini JSON parsing, fence stripping, malformed responses, fallbacks |
| **Total** | **143** | |

### What is not covered by unit tests

The following require real external services and are covered by manual integration testing during development:

- Live Moola Market RPC calls (requires Celo mainnet or Alfajores RPC)
- Live Aave V3 RPC calls (requires Base, Polygon, Arbitrum, Optimism RPCs)
- LI.FI route quotes against real bridge liquidity
- Supabase row-level security policy enforcement
- Gemini API responses for edge-case natural language inputs
- On-chain transaction submission and receipt polling

---

## Environment Variables

### Backend (`apps/api/.env`)

| Variable | Required | Description |
|----------|----------|-------------|
| `SUPABASE_URL` | Yes | Your Supabase project URL, e.g. `https://xyz.supabase.co` |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes | Service role key from Supabase project settings. Never expose this to the browser. |
| `AGENT_PRIVATE_KEY` | Yes | Hex private key for the agent's operational wallet. Used to sign Moola and LI.FI transactions. |
| `AGENT_API_SECRET` | Yes | Random 32-byte hex string used to sign session JWTs. Generate with `openssl rand -hex 32`. |
| `CRON_SECRET` | Yes | Secret header value for the scheduled scan endpoint. |
| `AGENT_CONFIG_CIPHER_KEY` | Yes | Random 32-byte hex string for AES-256-GCM encryption of Telegram bot tokens. |
| `GEMINI_API_KEY` | Yes | API key from Google AI Studio. |
| `CELO_RPC_URL` | No | Defaults to `https://forno.celo.org` if not set. |
| `BASE_RPC_URL` | No | Defaults to `https://mainnet.base.org`. |
| `POLYGON_RPC_URL` | No | Defaults to `https://polygon-rpc.com`. |
| `ARBITRUM_RPC_URL` | No | Defaults to `https://arb1.arbitrum.io/rpc`. |
| `OPTIMISM_RPC_URL` | No | Defaults to `https://mainnet.optimism.io`. |
| `TELEGRAM_WEBHOOK_SECRET` | Yes (for Telegram) | Validates inbound Telegram webhook requests. |
| `X402_WALLET_ADDRESS` | Yes (for paid API) | Wallet address that receives x402 fee payments. |
| `AGENT_ERC8004_ID` | Set after Phase 2 | Registry ID assigned during ERC-8004 registration. |
| `SENTRY_DSN` | No | Sentry error tracking DSN. |
| `LOG_LEVEL` | No | Pino log level. Defaults to `info`. |
| `YIELD_CACHE_TTL_SECONDS` | No | Overrides the 60-second yield cache TTL. |
| `GEMINI_MODEL` | No | Defaults to `gemini-1.5-flash`. |

### Frontend (`apps/web/.env.local`)

| Variable | Required | Description |
|----------|----------|-------------|
| `NEXT_PUBLIC_DYNAMIC_ENV_ID` | Yes | Dynamic wallet environment ID. |
| `NEXT_PUBLIC_LIFI_API_KEY` | Yes | LI.FI API key for frontend route display. |
| `NEXT_PUBLIC_SUPABASE_URL` | Yes | Same URL as `SUPABASE_URL` but safe to expose to the browser. |
| `NEXT_PUBLIC_API_BASE_URL` | Yes | Base URL of the deployed backend, e.g. `http://localhost:4000`. |

---

## External Service Setup

### Supabase

1. Create a project at supabase.com.
2. Copy the project URL and service role key from Settings > API.
3. Open the SQL editor and run `infra/migrations/001_initial_schema.sql`.
4. Verify the tables appear in the Table Editor.

The migration enables row-level security on every wallet-scoped table. Policies use `current_setting('app.wallet_address', true)` as the session variable. The backend sets this before each query using the service role key.

### Gemini

1. Go to aistudio.google.com and create an API key.
2. Set it as `GEMINI_API_KEY` in `apps/api/.env`.
3. The parser defaults to `gemini-1.5-flash`. Override with `GEMINI_MODEL` if needed.

### Agent operational wallet

The agent needs a funded wallet on Celo to pay gas for Moola transactions. For testnet development use Alfajores and fund via the Celo faucet. For mainnet, keep the balance minimal: Ada only needs gas money, not user principal.

```bash
# Generate a throwaway key for development (do not use in production)
node -e "const {privateKeyToAccount} = require('viem/accounts'); \
  const key = '0x' + require('crypto').randomBytes(32).toString('hex'); \
  console.log('key:', key); \
  console.log('address:', privateKeyToAccount(key).address);"
```

---

## Architecture Overview

Ada is a monorepo with four logical layers.

```
User (Dashboard / Telegram / CLI / Other Agent)
         |
         v
    apps/api  (Express + Swagger)
         |
    +-----------+----------+----------+
    |           |          |          |
  agent/     onchain/    lib/db    Telegram
  (brain)    (Viem)    (Supabase)   (bot)
    |           |
    v           v
  LI.FI     Moola / Aave V3
  Gemini    Celo RPC / multi-chain RPCs
```

**Request flow for a user-initiated rebalance:**

1. User connects wallet via Dynamic on the dashboard.
2. User clicks Rebalance or types `rebalance 100 USDC` in chat.
3. Frontend sends `POST /api/agent/quote` with wallet address and amount.
4. Backend runs `getYields()` (cached), `findBestRoute()` (may call LI.FI), `evaluatePolicy()`.
5. If the candidate passes policy, the backend returns a Quote with an approval token valid for 5 minutes.
6. User sees the QuoteCard (route cost, net gain, payback window, policy verdict) and approves.
7. Frontend sends `POST /api/agent/execute` with the token.
8. Backend verifies the token, runs `executeRebalance()` in live mode, sends on-chain steps.
9. Frontend polls `GET /api/agent/runs/:id` until the run reaches a terminal status.
10. Telegram notification is sent to the user's configured bot.

**Request flow for a Telegram-first MiniPay user:**

1. User sends `/start` to Ada's Telegram bot.
2. Bot asks for a Celo wallet address and walks through a three-message policy form.
3. Bot returns a one-time deep link to the dashboard for signing (if needed).
4. From then on the user controls Ada with `save`, `balance`, `yields`, and `stop`.
5. The scheduled cron scan runs every hour, finds better yield, sends a dry-run notification.
6. User replies to approve; bot triggers `POST /api/agent/execute`.

---

## Current Build Status

Phase 1 (Agent Core) is complete. All agent logic is implemented and unit tested.

| Module | Status | Tests |
|--------|--------|-------|
| Monorepo and shared schemas | Done | 14 |
| Supabase schema and DB client | Done | n/a (migration + types) |
| Yield discovery: Moola adapter | Done | 6 |
| Yield discovery: Aave V3 adapter | Done | via yield-discovery tests |
| Yield discovery: cache and aggregator | Done | 10 |
| Viem Celo client: balance reader | Done | 11 |
| Moola supply and withdraw tx builders | Done | 15 |
| Route comparison: LI.FI wrapper | Done | via route-comparison tests |
| Route comparison: math and filters | Done | 28 |
| Policy engine | Done | 20 |
| Execution engine | Done | 18 |
| Gemini NL command parser | Done | 21 |

Phases 2 through 4 are scaffolded (directory structure and stubs in place) but not yet implemented.

| Phase | Description | Status |
|-------|-------------|--------|
| Phase 2 | ERC-8004 registration, x402 config, Moola ABIs, Self verification | Not started |
| Phase 3 | Express API, SIWE auth, all REST endpoints, Telegram bot, CLI | Not started |
| Phase 4 | Next.js dashboard, Dynamic wallet, all pages, landing page | Not started |

---

## Roadmap

These items are in scope for the hackathon submission by 15 June 2026.

**Phase 2 (target: 4 June)**: Register the agent wallet under ERC-8004. Write the agent metadata JSON. Configure x402 payment middleware. Pull Moola ABIs. Attempt Self Agent ID verification.

**Phase 3 (target: 9 June)**: Stand up the Express server with Swagger docs. Implement SIWE sign-in with JWT sessions. Wire all REST endpoints to the Phase 1 agent services. Build the Telegram bot (outbound notifications plus inbound command handling). Implement AES-256-GCM encryption for Telegram bot tokens. Publish the CLI to npm as `agent-ada`.

**Phase 4 (target: 13 June)**: Build the Next.js 16 dashboard using shadcn/ui. Integrate Dynamic wallet connection with MiniPay support. Implement all seven dashboard pages (Overview, Approvals, Runs, Policies, Chat, Telegram setup, Settings). Build the marketing landing page. Ensure all pages work at 320 px width for MiniPay users.

**Final (15 June)**: Attempt Self verification or capture the unsupported-region screenshot. Record the demo video with a live rebalance and a Telegram receipt. Submit to the hackathon form.

---

## License

MIT
