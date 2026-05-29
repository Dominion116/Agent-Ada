import { z } from "zod";

export const ChainSchema = z.enum([
  "celo",
  "base",
  "polygon",
  "arbitrum",
  "optimism",
]);

export const VenueSchema = z.enum(["moola", "aave-v3"]);

export const PolicySchema = z.object({
  id: z.string().uuid(),
  wallet_address: z.string().regex(/^0x[0-9a-fA-F]{40}$/),
  version: z.number().int().positive(),
  min_net_gain_bps: z.number().int().min(0),
  max_route_cost_bps: z.number().int().min(0),
  cooldown_hours: z.number().int().min(0),
  allowed_chains: z.array(ChainSchema).min(1),
  allowed_venues: z.array(VenueSchema).min(1),
  kill_switch: z.boolean(),
  created_at: z.string().datetime(),
});

export const PolicyUpdateSchema = PolicySchema.omit({
  id: true,
  wallet_address: true,
  version: true,
  created_at: true,
});

export const DefaultPolicy: z.infer<typeof PolicyUpdateSchema> = {
  min_net_gain_bps: 50,
  max_route_cost_bps: 150,
  cooldown_hours: 24,
  allowed_chains: ["celo"],
  allowed_venues: ["moola"],
  kill_switch: false,
};

export type Chain = z.infer<typeof ChainSchema>;
export type Venue = z.infer<typeof VenueSchema>;
export type Policy = z.infer<typeof PolicySchema>;
export type PolicyUpdate = z.infer<typeof PolicyUpdateSchema>;
