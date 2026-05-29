import { z } from "zod";
import { ChainSchema, VenueSchema } from "./policy.js";
import { AssetSchema } from "./position.js";

export const YieldDataSchema = z.object({
  chain: ChainSchema,
  venue: VenueSchema,
  asset: AssetSchema,
  supply_rate_bps: z.number().int().min(0),
  utilisation_bps: z.number().int().min(0).max(10000),
  last_updated: z.string().datetime(),
});

export type YieldData = z.infer<typeof YieldDataSchema>;
