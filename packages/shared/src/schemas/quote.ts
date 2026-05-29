import { z } from "zod";
import { ChainSchema, VenueSchema } from "./policy.js";
import { AssetSchema } from "./position.js";

export const QuoteSchema = z.object({
  id: z.string().uuid(),
  wallet_address: z.string().regex(/^0x[0-9a-fA-F]{40}$/),
  source_chain: ChainSchema,
  source_venue: VenueSchema,
  dest_chain: ChainSchema,
  dest_venue: VenueSchema,
  asset: AssetSchema,
  amount: z.string(), // bigint as string
  route_cost_bps: z.number().int().min(0),
  net_gain_bps: z.number().int(),
  payback_days: z.number().min(0),
  policy_version: z.number().int().positive(),
  approval_token: z.string(),
  expires_at: z.string().datetime(),
  created_at: z.string().datetime(),
});

export const QuoteRequestSchema = z.object({
  amount: z.string().regex(/^\d+$/, "Amount must be a positive integer string"),
  asset: AssetSchema.optional().default("USDC"),
});

export type Quote = z.infer<typeof QuoteSchema>;
export type QuoteRequest = z.infer<typeof QuoteRequestSchema>;
