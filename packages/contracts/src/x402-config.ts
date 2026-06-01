/**
 * x402 payment middleware for Ada's metered endpoints.
 *
 * x402 is an HTTP-native micropayment protocol. When a client calls a
 * protected endpoint without prior payment, the server responds with
 * HTTP 402 Payment Required and a payment payload. The client pays in
 * USDC, then retries with a payment receipt header. The server verifies
 * the receipt before serving the response.
 *
 * Two endpoints are metered:
 *   GET  /api/agent/yields   0.001 USDC  (read, for other agents)
 *   POST /api/agent/execute  0.10  USDC  (execution fee, on top of gas)
 *
 * Implementation uses the x402 npm package, which is the reference
 * implementation maintained by Coinbase. Install it in apps/api:
 *   npm install x402 -w @ada/api
 *
 * Settlement receipts are written to the api_calls table by the route
 * handlers after the middleware passes.
 */

// Express types are used only for type annotations; install express in apps/api.
type Request = { protocol: string; get(h: string): string | undefined; originalUrl: string };
type Response = { status(c: number): Response; json(b: unknown): void };
type NextFunction = () => void;

// ── Payment amounts ───────────────────────────────────────────

export const X402_PRICES = {
  yields: "0.001",   // USDC per call
  execute: "0.10",   // USDC per execution
} as const;

// ── Config type ───────────────────────────────────────────────

export interface X402Config {
  /** USDC amount as a decimal string, e.g. "0.001" */
  amountUsdc: string;
  /** Wallet address that receives the payment */
  payTo: `0x${string}`;
  /** Chain where payment is settled: "base" for mainnet, "base-sepolia" for testnet */
  network: "base" | "base-sepolia";
}

// ── Middleware factory ────────────────────────────────────────

/**
 * Returns an Express middleware that gates the route behind an x402 payment.
 *
 * Usage in apps/api/src/routes/agent.ts:
 *
 *   import { createX402Middleware, X402_PRICES } from "@ada/contracts";
 *
 *   router.get(
 *     "/api/agent/yields",
 *     createX402Middleware({ amountUsdc: X402_PRICES.yields, ... }),
 *     yieldsHandler,
 *   );
 *
 * The middleware reads the x402 payment receipt from the
 * X-PAYMENT header, verifies it against the declared amount and
 * recipient, and calls next() on success. On failure it sends 402.
 */
export function createX402Middleware(config: X402Config) {
  return async function x402Gate(req: Request, res: Response, next: NextFunction) {
    // Dynamic import keeps x402 out of the module graph until the
    // middleware is actually invoked, making the package optional for
    // packages that import this config file without running a server.
    try {
      const { paymentMiddleware } = await import("x402-express" as string);
      return paymentMiddleware({
        amount: config.amountUsdc,
        currency: "USDC",
        network: config.network,
        payTo: config.payTo,
      })(req, res, next);
    } catch {
      // x402-express not installed — fail open in development,
      // fail closed in production.
      if (process.env["NODE_ENV"] === "production") {
        res.status(402).json({ error: "x402 payment required; middleware not configured" });
        return;
      }
      next();
    }
  };
}

// ── 402 response shape ────────────────────────────────────────
// Used by route handlers to manually emit a 402 if needed.

export interface PaymentRequiredBody {
  error: "Payment Required";
  x402Version: 1;
  accepts: PaymentOption[];
}

export interface PaymentOption {
  scheme: "exact";
  network: string;
  maxAmountRequired: string;
  resource: string;
  description: string;
  mimeType: "application/json";
  payTo: string;
  maxTimeoutSeconds: 300;
  asset: string;
  extra: { name: string; version: string };
}

export function buildPaymentRequired(
  req: Request,
  config: X402Config,
): PaymentRequiredBody {
  return {
    error: "Payment Required",
    x402Version: 1,
    accepts: [
      {
        scheme: "exact",
        network: config.network,
        maxAmountRequired: config.amountUsdc,
        resource: `${req.protocol}://${req.get("host")}${req.originalUrl}`,
        description: "Ada agent API call",
        mimeType: "application/json",
        payTo: config.payTo,
        maxTimeoutSeconds: 300,
        asset: "USDC",
        extra: { name: "Ada", version: "1.0.0" },
      },
    ],
  };
}
