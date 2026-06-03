import { AgentCommandSchema, type AgentCommand, type Run, type TxRecord } from "@ada/shared";

// ── Injectable LLM client interface ───────────────────────────
// Kept provider-agnostic so tests can inject a mock without network calls.

export interface LLMClient {
  chat(systemPrompt: string, userMessage: string): Promise<string>;
}

// ── Groq implementation ────────────────────────────────────────

export class GroqSdkClient implements LLMClient {
  private model: string;

  constructor(model = process.env["GROQ_MODEL"] ?? "llama-3.3-70b-versatile") {
    this.model = model;
  }

  async chat(systemPrompt: string, userMessage: string): Promise<string> {
    const Groq = (await import("groq-sdk")).default;
    const apiKey = process.env["GROQ_API_KEY"];
    if (!apiKey) throw new Error("GROQ_API_KEY must be set");

    const groq = new Groq({ apiKey });

    const completion = await groq.chat.completions.create({
      model: this.model,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userMessage },
      ],
      temperature: 0,
    });

    return completion.choices[0]?.message?.content ?? "";
  }
}

// ── System prompts ─────────────────────────────────────────────

const PARSE_COMMAND_PROMPT = `\
You are Ada, an autonomous stablecoin yield agent on Celo.
Parse the user's message into exactly one JSON command object.

Return ONLY a raw JSON object — no markdown, no code fences, no explanation.

Use exactly one of these schemas:
{"type":"check_yields"}
{"type":"check_balance"}
{"type":"rebalance","amount":<positive number or the string "all">}
{"type":"bridge","amount":<positive number>,"from":<chain>,"to":<chain>}
{"type":"explain_last_run"}
{"type":"unknown","raw":"<verbatim user message>"}

Valid chain values: celo, base, polygon, arbitrum, optimism

Examples:
"check yields" → {"type":"check_yields"}
"what's my current balance?" → {"type":"check_balance"}
"rebalance 100 USDC" → {"type":"rebalance","amount":100}
"move everything into yield" → {"type":"rebalance","amount":"all"}
"bridge 500 from celo to base" → {"type":"bridge","amount":500,"from":"celo","to":"base"}
"what happened last time?" → {"type":"explain_last_run"}
"hello there" → {"type":"unknown","raw":"hello there"}

If the intent is unclear or not related to the agent's capabilities, use type "unknown".`;

const EXPLAIN_RUN_PROMPT = `\
You are Ada, an autonomous stablecoin yield agent on Celo.
Explain what happened in this agent run to a non-technical user.
Write 2 to 3 plain sentences. Be specific about amounts, venues, and chains.
Do not use jargon like "basis points" — convert to percentages instead.
Do not mention tx hashes or block numbers unless summarising them.
If the run failed, explain why in plain language.`;

// ── JSON extraction ────────────────────────────────────────────

function extractJson(text: string): string {
  // Strip markdown code fences if the model wraps the output.
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  if (fenced?.[1]) return fenced[1].trim();
  return text.trim();
}

// ── parseCommand ───────────────────────────────────────────────

/**
 * Parses a natural-language user message into a structured AgentCommand.
 *
 * Falls back to `{ type: "unknown", raw: text }` if the model returns
 * invalid JSON or an unrecognised command shape.
 *
 * @param text           Raw user message.
 * @param walletAddress  Used for logging / context; not sent to the LLM.
 * @param client         Injectable LLMClient — defaults to the Groq SDK.
 */
export async function parseCommand(
  text: string,
  walletAddress: string,
  client: LLMClient = new GroqSdkClient(),
): Promise<AgentCommand> {
  // Hard-coded shortcuts that don't need an LLM round-trip.
  const lower = text.trim().toLowerCase();
  if (lower === "check yields" || lower === "yields") return { type: "check_yields" };
  if (lower === "check balance" || lower === "balance") return { type: "check_balance" };
  if (lower === "explain last run") return { type: "explain_last_run" };

  let raw: string;
  try {
    raw = await client.chat(PARSE_COMMAND_PROMPT, text);
  } catch {
    return { type: "unknown", raw: text };
  }

  try {
    const json = extractJson(raw);
    const parsed = JSON.parse(json) as unknown;
    return AgentCommandSchema.parse(parsed);
  } catch {
    return { type: "unknown", raw: text };
  }
}

// ── composeExplanation ─────────────────────────────────────────

interface RunSummary {
  mode: string;
  status: string;
  source: string | undefined;
  destination: string | undefined;
  amount_in: string | undefined;
  amount_out: string | undefined;
  error: string | undefined;
  tx_count: number;
}

function summariseRun(run: Run): RunSummary {
  const outcome = (run.outcome ?? {}) as Record<string, unknown>;
  const route = outcome["route"] as Record<string, unknown> | undefined;
  const errorMsg = outcome["error"] as string | undefined;

  return {
    mode: run.mode,
    status: run.status,
    source: route ? `${String(route["source_venue"])} on ${String(route["source_chain"])}` : undefined,
    destination: route ? `${String(route["dest_venue"])} on ${String(route["dest_chain"])}` : undefined,
    amount_in: route ? String(route["amount_in"]) : undefined,
    amount_out: route ? String(route["amount_out"]) : undefined,
    error: errorMsg,
    tx_count: (run.tx_hashes as TxRecord[]).length,
  };
}

/**
 * Returns a plain-English explanation of a completed or failed run.
 *
 * @param run    The Run record to explain.
 * @param client Injectable LLMClient — defaults to the Groq SDK.
 */
export async function composeExplanation(
  run: Run,
  client: LLMClient = new GroqSdkClient(),
): Promise<string> {
  const summary = summariseRun(run);
  const userMessage = `Run details:\n${JSON.stringify(summary, null, 2)}`;

  try {
    return await client.chat(EXPLAIN_RUN_PROMPT, userMessage);
  } catch {
    if (run.status === "completed") {
      return `Your rebalance completed successfully with ${summary.tx_count} on-chain step(s).`;
    }
    if (run.status === "dry_run_complete") {
      return "Ada ran a simulation of your rebalance — no funds were moved.";
    }
    return `Your rebalance did not complete. ${summary.error ?? "An unexpected error occurred."}`;
  }
}
