import { z } from "zod";
import { ChainSchema, VenueSchema } from "./policy.js";

export const AssetSchema = z.enum(["cUSD", "USDC"]);

export const PositionSchema = z.object({
  id: z.string().uuid(),
  wallet_address: z.string().regex(/^0x[0-9a-fA-F]{40}$/),
  chain: ChainSchema,
  venue: VenueSchema,
  asset: AssetSchema,
  amount: z.string(), // bigint as string to avoid precision loss
  supply_rate_bps: z.number().int().min(0),
  updated_at: z.string().datetime(),
});

export type Asset = z.infer<typeof AssetSchema>;
export type Position = z.infer<typeof PositionSchema>;
