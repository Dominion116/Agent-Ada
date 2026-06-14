import type {
  Policy,
  PolicyUpdate,
  Quote,
  Run,
  YieldData,
  Route,
  ChatMessage,
} from "@ada/shared";
import { mockApi } from "@/lib/mocks";

const API_BASE = process.env["NEXT_PUBLIC_API_BASE_URL"] ?? "http://localhost:4000";

// ── Session token storage ─────────────────────────────────────
// The JWT issued by POST /api/auth/verify is kept in memory and mirrored
// to localStorage so it survives reloads within the browser session.

const TOKEN_KEY = "ada_session_token";

export function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(TOKEN_KEY, token);
}

export function clearToken(): void {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(TOKEN_KEY);
}

// ── Core fetch wrapper ────────────────────────────────────────

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public body?: unknown,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

interface RequestOptions {
  method?: "GET" | "POST" | "PUT" | "DELETE";
  body?: unknown;
  /** Set false for public endpoints that need no auth header. */
  auth?: boolean;
}

async function request<T>(path: string, opts: RequestOptions = {}): Promise<T> {
  const { method = "GET", body, auth = true } = opts;

  const headers: Record<string, string> = { "Content-Type": "application/json" };

  if (auth) {
    const token = getToken();
    if (token) headers["Authorization"] = `Bearer ${token}`;
  }

  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  const text = await res.text();
  const data = text ? JSON.parse(text) : null;

  if (!res.ok) {
    const message =
      data && typeof data === "object" && "error" in data
        ? typeof data.error === "string"
          ? data.error
          : JSON.stringify(data.error)
        : `Request failed: ${res.status}`;
    throw new ApiError(res.status, message, data);
  }

  return data as T;
}

// ── Auth ──────────────────────────────────────────────────────

export async function fetchNonce(wallet: string): Promise<string> {
  const data = await request<{ nonce: string }>(
    `/api/auth/nonce?wallet=${wallet}`,
    { auth: false },
  );
  return data.nonce;
}

export async function verifySignature(
  message: string,
  signature: string,
): Promise<{ token: string; walletAddress: string }> {
  return request("/api/auth/verify", {
    method: "POST",
    body: { message, signature },
    auth: false,
  });
}

// ── Typed endpoint helpers (used by SWR hooks) ───────────────

const realApi = {
  yields: () =>
    request<{ yields: YieldData[]; cachedAt: string }>("/api/agent/yields", { auth: false }),

  balance: () =>
    request<{ balances: { asset: string; raw: string; decimals: number; formatted: string }[] }>(
      "/api/agent/balance",
    ),

  quotes: () =>
    request<{ quotes: Quote[] }>("/api/agent/quotes"),

  rejectQuote: (quoteId: string) =>
    request<{ ok: boolean }>(`/api/agent/quotes/${quoteId}`, { method: "DELETE" }),

  quote: (amount: string, asset: "cUSD" | "USDC" = "USDC") =>
    request<{ quoteId: string; route: Route; approvalToken: string; expiresAt: string }>(
      "/api/agent/quote",
      { method: "POST", body: { amount, asset } },
    ),

  execute: (approvalToken: string) =>
    request<{ run: Run }>("/api/agent/execute", {
      method: "POST",
      body: { approvalToken },
    }),

  runs: (limit = 20, offset = 0) =>
    request<{ runs: Run[] }>(`/api/agent/runs?limit=${limit}&offset=${offset}`),

  run: (id: string) => request<{ run: Run }>(`/api/agent/runs/${id}`),

  getPolicy: (): Promise<{ policy: Policy | null }> =>
    request<{ policy: Policy }>("/api/agent/policy").catch((err) => {
      // A wallet with no saved policy yet gets a 404, not an error.
      if (err instanceof ApiError && err.status === 404) return { policy: null };
      throw err;
    }),

  updatePolicy: (policy: PolicyUpdate) =>
    request<{ policy: Policy }>("/api/agent/policy", { method: "PUT", body: policy }),

  sendChat: (message: string) =>
    request<{ response: string; command: unknown; payload: unknown }>("/api/agent/chat", {
      method: "POST",
      body: { message },
    }),

  chatHistory: () => request<{ messages: ChatMessage[] }>("/api/agent/chat"),

  saveTelegram: (bot_token: string, chat_id: string, events: string[]) =>
    request<{ ok: boolean }>("/api/agent/telegram", {
      method: "POST",
      body: { bot_token, chat_id, events },
    }),

  profile: () =>
    request<{
      name: string;
      erc8004RegistryId: string | null;
      selfAgentId: string | null;
      chains: string[];
      agentscanUrl: string | null;
      scan8004Url: string | null;
    }>("/api/agent/profile", { auth: false }),

  deleteAllData: () => request<{ ok: boolean }>("/api/agent/data", { method: "DELETE" }),
};

/** Shape of the typed endpoint client, shared by the real and mock backends. */
export type ApiClient = typeof realApi;

// Flip on with NEXT_PUBLIC_USE_MOCKS=true to render the dashboard from fixtures
// (src/lib/mocks.ts) with no backend running. Defaults to the real API.
const USE_MOCKS = process.env["NEXT_PUBLIC_USE_MOCKS"] === "true";

export const api: ApiClient = USE_MOCKS ? mockApi : realApi;
