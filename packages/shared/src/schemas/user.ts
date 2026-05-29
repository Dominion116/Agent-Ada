import { z } from "zod";

export const UserSchema = z.object({
  id: z.string().uuid(),
  wallet_address: z.string().regex(/^0x[0-9a-fA-F]{40}$/),
  self_agent_id: z.string().nullable(),
  created_at: z.string().datetime(),
});

export type User = z.infer<typeof UserSchema>;
