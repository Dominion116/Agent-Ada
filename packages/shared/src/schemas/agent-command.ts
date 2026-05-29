import { z } from "zod";
import { ChainSchema } from "./policy.js";

export const AgentCommandSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("check_yields") }),
  z.object({ type: z.literal("check_balance") }),
  z.object({
    type: z.literal("rebalance"),
    amount: z.union([z.number().positive(), z.literal("all")]),
  }),
  z.object({
    type: z.literal("bridge"),
    amount: z.number().positive(),
    from: ChainSchema,
    to: ChainSchema,
  }),
  z.object({ type: z.literal("explain_last_run") }),
  z.object({ type: z.literal("unknown"), raw: z.string() }),
]);

export type AgentCommand = z.infer<typeof AgentCommandSchema>;
