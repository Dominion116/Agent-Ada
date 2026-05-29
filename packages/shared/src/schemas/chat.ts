import { z } from "zod";

export const ChatRoleSchema = z.enum(["user", "assistant"]);

export const ChatMessageSchema = z.object({
  id: z.string().uuid(),
  wallet_address: z.string().regex(/^0x[0-9a-fA-F]{40}$/),
  role: ChatRoleSchema,
  content: z.string(),
  // Optional structured payload attached to assistant messages (e.g. inline quote)
  payload: z.record(z.unknown()).nullable(),
  created_at: z.string().datetime(),
});

export const ChatInputSchema = z.object({
  message: z.string().min(1).max(2000),
});

export type ChatRole = z.infer<typeof ChatRoleSchema>;
export type ChatMessage = z.infer<typeof ChatMessageSchema>;
export type ChatInput = z.infer<typeof ChatInputSchema>;
