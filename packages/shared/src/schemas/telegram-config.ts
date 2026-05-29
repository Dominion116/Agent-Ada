import { z } from "zod";

export const TelegramEventSchema = z.enum(["dry_run", "executed", "error"]);

export const TelegramConfigSchema = z.object({
  id: z.string().uuid(),
  wallet_address: z.string().regex(/^0x[0-9a-fA-F]{40}$/),
  // Stored encrypted at rest; never returned to the client in plaintext
  bot_token_ciphertext: z.string(),
  chat_id: z.string(),
  events: z.array(TelegramEventSchema),
  created_at: z.string().datetime(),
});

export const TelegramConfigInputSchema = z.object({
  bot_token: z.string().min(10),
  chat_id: z.string().min(1),
  events: z.array(TelegramEventSchema).min(1),
});

export type TelegramEvent = z.infer<typeof TelegramEventSchema>;
export type TelegramConfig = z.infer<typeof TelegramConfigSchema>;
export type TelegramConfigInput = z.infer<typeof TelegramConfigInputSchema>;
