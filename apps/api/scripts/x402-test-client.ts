/**
 * One-off script: drives a full x402 paid request against Ada's API using a
 * real EIP-712 signature for cUSD ("Mento Dollar") on Celo mainnet.
 *
 * cUSD implements EIP-2612 `permit` (not EIP-3009 `transferWithAuthorization`),
 * so this signs a `Permit(owner, spender, value, nonce, deadline)` message and
 * maps it into the x402 "exact" scheme's {from, to, value, validAfter,
 * validBefore, nonce} authorization shape, per thirdweb's facilitator.
 *
 * No thirdweb SDK involved — the server's facilitator calls are made by
 * `apps/api/src/middleware/x402.ts`; this script only needs `viem` (already
 * a dependency) to sign and to read the payer's current cUSD permit nonce.
 *
 * Usage (from apps/api directory):
 *   TEST_PAYER_PRIVATE_KEY=0x... npx tsx --env-file .env scripts/x402-test-client.ts [path]
 *
 * - `path` defaults to /api/agent/yields
 * - target base URL defaults to API_BASE_URL from .env, or https://agent-ada.onrender.com
 * - TEST_PAYER_PRIVATE_KEY must hold a small amount of cUSD
 *   (0x765DE816845861e75A25fCA122bb6898B8B1282a) on Celo mainnet to cover the
 *   price of the requested endpoint.
 */

import { createPublicClient, http, parseAbi, toHex } from "viem";
import { celo } from "viem/chains";
import { privateKeyToAccount } from "viem/accounts";
import {
  encodePaymentHeader,
  decodeSettlementHeader,
  type PaymentRequiredBody,
  type PaymentRequirement,
  type PaymentPayload,
} from "@ada/contracts";

const ERC20_PERMIT_ABI = parseAbi(["function nonces(address owner) view returns (uint256)"]);

async function main() {
  const privateKey = process.env["TEST_PAYER_PRIVATE_KEY"];
  if (!privateKey) {
    console.error("TEST_PAYER_PRIVATE_KEY is not set");
    process.exit(1);
  }

  const baseUrl = process.env["API_BASE_URL"] ?? "https://agent-ada.onrender.com";
  const path = process.argv[2] ?? "/api/agent/yields";
  const url = `${baseUrl}${path}`;

  const account = privateKeyToAccount(privateKey as `0x${string}`);
  console.log(`Payer address: ${account.address}`);
  console.log(`Target: GET ${url}`);

  // ── Step 1: request without payment, expect 402 ──────────────
  const first = await fetch(url);
  console.log(`\nStep 1: unauthenticated request -> ${first.status}`);

  if (first.status !== 402) {
    console.log("Did not receive 402 - either the endpoint isn't gated or it succeeded outright.");
    console.log(await first.text());
    return;
  }

  const body = (await first.json()) as PaymentRequiredBody;
  const requirements: PaymentRequirement | undefined = body.accepts[0];
  if (!requirements) {
    console.error("402 response had no payment requirements in `accepts`");
    process.exit(1);
  }
  console.log("Payment requirements:", JSON.stringify(requirements, null, 2));

  // ── Step 2: build & sign the EIP-712 authorization ────────────
  const chainId = Number(requirements.network.split(":")[1]);
  if (!Number.isFinite(chainId)) {
    console.error(`Could not parse chainId from network "${requirements.network}"`);
    process.exit(1);
  }

  const extra = (requirements.extra ?? {}) as { name?: string; version?: string; primaryType?: string };
  const tokenName = extra.name ?? "USDC";
  const tokenVersion = extra.version ?? "2";
  const primaryType = extra.primaryType ?? "TransferWithAuthorization";

  const validBefore = String(Math.floor(Date.now() / 1000) + requirements.maxTimeoutSeconds);

  let authorization: PaymentPayload["payload"]["authorization"];
  let signature: `0x${string}`;

  if (primaryType === "Permit") {
    // EIP-2612: Permit(owner, spender, value, nonce, deadline)
    const publicClient = createPublicClient({ chain: celo, transport: http(process.env["CELO_RPC_URL"]) });
    const nonce = await publicClient.readContract({
      address: requirements.asset as `0x${string}`,
      abi: ERC20_PERMIT_ABI,
      functionName: "nonces",
      args: [account.address],
    });

    authorization = {
      from: account.address,
      to: requirements.payTo,
      value: requirements.maxAmountRequired,
      validAfter: "0",
      validBefore,
      nonce: toHex(nonce, { size: 32 }),
    };

    signature = await account.signTypedData({
      domain: { name: tokenName, version: tokenVersion, chainId, verifyingContract: requirements.asset as `0x${string}` },
      types: {
        Permit: [
          { name: "owner", type: "address" },
          { name: "spender", type: "address" },
          { name: "value", type: "uint256" },
          { name: "nonce", type: "uint256" },
          { name: "deadline", type: "uint256" },
        ],
      },
      primaryType: "Permit",
      message: {
        owner: account.address,
        spender: requirements.payTo as `0x${string}`,
        value: BigInt(requirements.maxAmountRequired),
        nonce,
        deadline: BigInt(validBefore),
      },
    });
  } else {
    // EIP-3009: TransferWithAuthorization(from, to, value, validAfter, validBefore, nonce)
    const nonce = `0x${Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString("hex")}` as `0x${string}`;

    authorization = {
      from: account.address,
      to: requirements.payTo,
      value: requirements.maxAmountRequired,
      validAfter: "0",
      validBefore,
      nonce,
    };

    signature = await account.signTypedData({
      domain: { name: tokenName, version: tokenVersion, chainId, verifyingContract: requirements.asset as `0x${string}` },
      types: {
        TransferWithAuthorization: [
          { name: "from", type: "address" },
          { name: "to", type: "address" },
          { name: "value", type: "uint256" },
          { name: "validAfter", type: "uint256" },
          { name: "validBefore", type: "uint256" },
          { name: "nonce", type: "bytes32" },
        ],
      },
      primaryType: "TransferWithAuthorization",
      message: {
        from: authorization.from as `0x${string}`,
        to: authorization.to as `0x${string}`,
        value: BigInt(authorization.value),
        validAfter: BigInt(authorization.validAfter),
        validBefore: BigInt(authorization.validBefore),
        nonce: authorization.nonce as `0x${string}`,
      },
    });
  }

  // ── Step 3: build the X-PAYMENT payload ───────────────────────
  const payment: PaymentPayload = {
    x402Version: body.x402Version,
    scheme: requirements.scheme,
    network: requirements.network,
    payload: { signature, authorization },
  };
  const paymentHeader = encodePaymentHeader(payment);

  // ── Step 4: retry the request with X-PAYMENT ──────────────────
  console.log("\nStep 2: retrying with X-PAYMENT header...");
  const second = await fetch(url, { headers: { "X-PAYMENT": paymentHeader } });
  console.log(`Status: ${second.status}`);

  const settlementHeader = second.headers.get("X-PAYMENT-RESPONSE");
  if (settlementHeader) {
    const settlement = decodeSettlementHeader(settlementHeader);
    console.log("Settlement:", JSON.stringify(settlement, null, 2));
  }

  const text = await second.text();
  try {
    console.log("Response body:", JSON.stringify(JSON.parse(text), null, 2));
  } catch {
    console.log("Response body:", text);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
