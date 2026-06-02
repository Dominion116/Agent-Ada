#!/usr/bin/env node
import { Command } from "commander";

const API_BASE = process.env["ADA_API_URL"] ?? "https://api.ada.xyz";

async function get(path: string, token?: string): Promise<unknown> {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
  return res.json();
}

async function post(path: string, body: unknown, token?: string): Promise<unknown> {
  const res = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
  return res.json();
}

function storedToken(): string | undefined {
  return process.env["ADA_TOKEN"];
}

function printTable(rows: Record<string, unknown>[]): void {
  if (rows.length === 0) { console.log("(no results)"); return; }
  const keys = Object.keys(rows[0]!);
  const widths = keys.map((k) =>
    Math.max(k.length, ...rows.map((r) => String(r[k] ?? "").length)),
  );
  console.log(keys.map((k, i) => k.padEnd(widths[i]!)).join("  "));
  console.log(widths.map((w) => "-".repeat(w)).join("  "));
  rows.forEach((r) =>
    console.log(keys.map((k, i) => String(r[k] ?? "").padEnd(widths[i]!)).join("  ")),
  );
}

const program = new Command();

program
  .name("ada")
  .description("Agent Ada CLI - autonomous stablecoin treasury agent on Celo")
  .version("1.0.0");

program
  .command("yields")
  .description("Show current yield rates across all supported venues")
  .action(async () => {
    const data = await get("/api/agent/yields") as { yields: Record<string, unknown>[] };
    printTable(
      data.yields.map((y) => ({
        chain: y["chain"],
        venue: y["venue"],
        asset: y["asset"],
        "apr%": (Number(y["supply_rate_bps"]) / 100).toFixed(2),
        "util%": (Number(y["utilisation_bps"]) / 100).toFixed(1),
      })),
    );
  });

program
  .command("balance <wallet>")
  .description("Show stablecoin balances for a wallet address")
  .option("-t, --token <jwt>", "Session token (or set ADA_TOKEN env var)")
  .action(async (wallet: string, opts: { token?: string }) => {
    const token = opts.token ?? storedToken();
    const data = await get(`/api/agent/balance?wallet=${wallet}`, token) as { balances: Record<string, unknown>[] };
    printTable(data.balances);
  });

program
  .command("quote <wallet>")
  .description("Get the best available rebalance quote for a wallet")
  .option("-t, --token <jwt>", "Session token")
  .option("-a, --amount <amount>", "Amount in atomic USDC units", "1000000000")
  .action(async (_wallet: string, opts: { token?: string; amount: string }) => {
    const token = opts.token ?? storedToken();
    const data = await post("/api/agent/quote", { amount: opts.amount, asset: "USDC" }, token) as Record<string, unknown>;
    const route = data["route"] as Record<string, unknown> | undefined;
    if (!route) { console.log("No better route found."); return; }
    console.log(`Source:  ${route["source_venue"]} on ${route["source_chain"]}`);
    console.log(`Dest:    ${route["dest_venue"]} on ${route["dest_chain"]}`);
    console.log(`Gain:    ${(Number(route["net_gain_bps"]) / 100).toFixed(2)}% APR`);
    console.log(`Cost:    ${(Number(route["route_cost_bps"]) / 100).toFixed(3)}%`);
    console.log(`Payback: ${Number(route["payback_days"]).toFixed(1)} days`);
    console.log(`\nApproval token: ${String(data["approvalToken"]).slice(0, 40)}...`);
  });

program
  .command("rebalance")
  .description("Execute a rebalance using an approval token from the quote command")
  .requiredOption("-t, --token <jwt>", "Session token")
  .requiredOption("--approval <token>", "Approval token")
  .action(async (opts: { token: string; approval: string }) => {
    const data = await post("/api/agent/execute", { approvalToken: opts.approval }, opts.token) as Record<string, unknown>;
    const run = data["run"] as Record<string, unknown>;
    console.log(`Run ID: ${run["id"]}`);
    console.log(`Status: ${run["status"]}`);
  });

const policyCmd = program.command("policy").description("Manage wallet policy");

policyCmd
  .command("get")
  .description("Show the current policy")
  .requiredOption("-t, --token <jwt>", "Session token")
  .action(async (opts: { token: string }) => {
    const data = await get("/api/agent/policy", opts.token) as { policy: Record<string, unknown> };
    const p = data.policy;
    console.log(`Version:     ${p["version"]}`);
    console.log(`Min gain:    ${p["min_net_gain_bps"]} bps`);
    console.log(`Max cost:    ${p["max_route_cost_bps"]} bps`);
    console.log(`Cooldown:    ${p["cooldown_hours"]}h`);
    console.log(`Chains:      ${String(p["allowed_chains"])}`);
    console.log(`Venues:      ${String(p["allowed_venues"])}`);
    console.log(`Kill switch: ${p["kill_switch"]}`);
  });

program.parseAsync(process.argv).catch((err: unknown) => {
  console.error("Error:", err instanceof Error ? err.message : String(err));
  process.exit(1);
});
