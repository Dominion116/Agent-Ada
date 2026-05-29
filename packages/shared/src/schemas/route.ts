import { z } from "zod";
import { ChainSchema, VenueSchema } from "./policy.js";
import { AssetSchema } from "./position.js";

export const RouteSchema = z.object({
  source_chain: ChainSchema,
  source_venue: VenueSchema,
  dest_chain: ChainSchema,
  dest_venue: VenueSchema,
  asset: AssetSchema,
  amount_in: z.string(),
  amount_out: z.string(),
  route_cost_bps: z.number().int().min(0),
  net_gain_bps: z.number().int(),
  payback_days: z.number().min(0),
  estimated_time_seconds: z.number().int().min(0),
  // Raw LI.FI route stored for execution; null for Celo-only moves
  lifi_route: z.record(z.unknown()).nullable(),
});

export type Route = z.infer<typeof RouteSchema>;
