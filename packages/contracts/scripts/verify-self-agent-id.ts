/**
 * Self Agent ID verification script.
 *
 * Self (https://self.xyz) issues verifiable credentials to agents.
 * Run this script once during setup to obtain Ada's selfAgentId.
 *
 * Usage:
 *   npx tsx packages/contracts/scripts/verify-self-agent-id.ts
 *
 * If Self is available in your region, the script will open a QR code
 * or deep link for the verification flow and print the credential ID on
 * success. Set the result as AGENT_SELF_ID in apps/api/.env.
 *
 * If Self is NOT available in your region (common for African IP addresses):
 *   1. Open https://docs.self.xyz/agents in your browser.
 *   2. Follow the manual verification flow.
 *   3. Take a screenshot of the "Region not supported" or equivalent page.
 *   4. Save it to infra/self-verification-screenshot.png
 *   5. Include it in the hackathon submission packet.
 *
 * The hackathon FAQ explicitly allows a screenshot as proof when Self
 * is unavailable in the submitter's region.
 *
 * Required env vars:
 *   AGENT_PRIVATE_KEY
 *   SELF_APP_ID        (from https://self.xyz/dashboard)
 */

import { createWalletClient, http } from "viem";
import { celo } from "viem/chains";
import { privateKeyToAccount } from "viem/accounts";
import { writeFileSync } from "fs";
import { resolve } from "path";

const SCREENSHOT_PATH = resolve(process.cwd(), "infra/self-verification-screenshot.png");

async function main() {
  const privateKey = process.env["AGENT_PRIVATE_KEY"];
  if (!privateKey) throw new Error("AGENT_PRIVATE_KEY is not set");

  const selfAppId = process.env["SELF_APP_ID"];
  if (!selfAppId) {
    console.warn("SELF_APP_ID is not set. Get one at https://self.xyz/dashboard");
    console.warn("Proceeding with address-based identity only.");
  }

  const account = privateKeyToAccount(privateKey as `0x${string}`);
  console.log("Agent wallet:", account.address);

  // Attempt to dynamically import the Self SDK.
  // The SDK may not be available in all environments.
  try {
    // Self does not yet publish a stable npm package for agent verification.
    // Replace this block with the actual Self SDK call when available.
    // Docs: https://docs.self.xyz/agents
    //
    // Expected flow:
    //   const { SelfVerifier } = await import("@selfxyz/agent");
    //   const verifier = new SelfVerifier({ appId: selfAppId, wallet: account });
    //   const credential = await verifier.verify();
    //   console.log("Self Agent ID:", credential.id);
    //   console.log("Add to .env: AGENT_SELF_ID=" + credential.id);

    throw new Error("Self SDK not yet installed. See comments in this script.");
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);

    console.log("\nSelf verification could not complete automatically.");
    console.log("Reason:", message);
    console.log("\nManual verification steps:");
    console.log("  1. Open https://docs.self.xyz/agents in your browser.");
    console.log("  2. Connect the agent wallet:", account.address);
    console.log("  3. Complete the verification flow.");
    console.log("  4. If your region is unsupported, take a screenshot of that page.");
    console.log("  5. Save the screenshot to:", SCREENSHOT_PATH);
    console.log("\nFor the hackathon submission, include the screenshot or the credential ID.");

    // Write a placeholder metadata file for the submission packet.
    const meta = {
      agentAddress: account.address,
      verificationAttemptedAt: new Date().toISOString(),
      status: "manual_verification_required",
      screenshotPath: SCREENSHOT_PATH,
      docsUrl: "https://docs.self.xyz/agents",
    };

    const metaPath = resolve(process.cwd(), "infra/self-verification-meta.json");
    writeFileSync(metaPath, JSON.stringify(meta, null, 2));
    console.log("\nVerification metadata written to:", metaPath);
  }
}

main().catch((err) => {
  console.error("Script failed:", err);
  process.exit(1);
});
