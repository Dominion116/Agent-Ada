import { z } from "zod";

export const RunModeSchema = z.enum(["dry_run", "live"]);

export const RunStatusSchema = z.enum([
  "pending",
  "executing",
  "completed",
  "failed",
  "dry_run_complete",
]);

export const TxRecordSchema = z.object({
  step: z.string(),
  hash: z.string().nullable(),
  block_number: z.number().int().nullable(),
  status: z.enum(["pending", "confirmed", "failed", "reverted"]),
});

export const RunSchema = z.object({
  id: z.string().uuid(),
  wallet_address: z.string().regex(/^0x[0-9a-fA-F]{40}$/),
  quote_id: z.string().uuid().nullable(),
  mode: RunModeSchema,
  status: RunStatusSchema,
  tx_hashes: z.array(TxRecordSchema),
  policy_version: z.number().int().positive(),
  outcome: z.record(z.unknown()).nullable(), // structured outcome JSON
  started_at: z.string().datetime(),
  completed_at: z.string().datetime().nullable(),
});

export type RunMode = z.infer<typeof RunModeSchema>;
export type RunStatus = z.infer<typeof RunStatusSchema>;
export type TxRecord = z.infer<typeof TxRecordSchema>;
export type Run = z.infer<typeof RunSchema>;
