import { z } from "zod";

export const ApiCallSchema = z.object({
  id: z.string().uuid(),
  caller_agent_id: z.string().nullable(),
  endpoint: z.string(),
  x402_invoice: z.string().nullable(),
  settled_tx: z.string().nullable(),
  created_at: z.string().datetime(),
});

export type ApiCall = z.infer<typeof ApiCallSchema>;
