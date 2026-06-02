import { z } from "zod";

const EnvSchema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  PORT: z.coerce.number().default(4000),
  // Auth
  AGENT_API_SECRET: z.string().min(32, "Must be at least 32 characters"),
  CRON_SECRET: z.string().min(16),
  // DB
  SUPABASE_URL: z.string().url(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  // Onchain
  AGENT_PRIVATE_KEY: z.string().startsWith("0x"),
  CELO_RPC_URL: z.string().url().default("https://forno.celo.org"),
  // External
  GEMINI_API_KEY: z.string().min(1),
  // Optional
  AGENT_CONFIG_CIPHER_KEY: z.string().optional(),
  TELEGRAM_WEBHOOK_SECRET: z.string().optional(),
  X402_WALLET_ADDRESS: z.string().optional(),
  AGENT_ERC8004_ID: z.string().optional(),
  AGENT_SELF_ID: z.string().optional(),
  SENTRY_DSN: z.string().url().optional(),
  LOG_LEVEL: z.enum(["trace", "debug", "info", "warn", "error"]).default("info"),
  YIELD_CACHE_TTL_SECONDS: z.coerce.number().optional(),
});

export type Config = z.infer<typeof EnvSchema>;

let _config: Config | null = null;

export function getConfig(): Config {
  if (_config) return _config;
  const result = EnvSchema.safeParse(process.env);
  if (!result.success) {
    const issues = result.error.issues.map((i) => `  ${i.path.join(".")}: ${i.message}`).join("\n");
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }
  _config = result.data;
  return _config;
}

export function resetConfig(): void {
  _config = null;
}
