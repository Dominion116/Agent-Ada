/**
 * Lean wallet connection using the raw EIP-1193 injected provider.
 *
 * MiniPay injects window.ethereum (with isMiniPay = true) on Celo, as do
 * standard browser wallets. This is the primary path: Ada is Celo-only and
 * most users open it inside MiniPay. Browsers with no injected provider fall
 * back to the Reown AppKit modal in `lib/reown.ts` / `hooks/use-wallet.tsx`.
 */

const CELO_CHAIN_ID_HEX = "0xa4ec"; // 42220

export interface Eip1193Provider {
  request(args: { method: string; params?: unknown[] | object }): Promise<unknown>;
  on?(event: string, handler: (...args: unknown[]) => void): void;
  removeListener?(event: string, handler: (...args: unknown[]) => void): void;
  isMiniPay?: boolean;
}

export function getProvider(): Eip1193Provider | null {
  if (typeof window === "undefined") return null;
  // @reown/appkit also augments `Window.ethereum` (as a looser type), so we
  // cast locally here instead of redeclaring the global.
  return (window as unknown as { ethereum?: Eip1193Provider }).ethereum ?? null;
}

export function isMiniPay(): boolean {
  return Boolean(getProvider()?.isMiniPay);
}

export function hasInjectedWallet(): boolean {
  return getProvider() !== null;
}

/** Prompts the wallet to connect and returns the primary address. */
export async function connectWallet(): Promise<string> {
  const provider = getProvider();
  if (!provider) {
    throw new Error(
      "No wallet found. Open Ada inside MiniPay or install a Celo-compatible wallet.",
    );
  }

  const accounts = (await provider.request({ method: "eth_requestAccounts" })) as string[];
  if (!accounts?.[0]) throw new Error("No account returned by wallet");

  // MiniPay is already on Celo; for other wallets, request a switch (best effort).
  if (!provider.isMiniPay) {
    try {
      await provider.request({
        method: "wallet_switchEthereumChain",
        params: [{ chainId: CELO_CHAIN_ID_HEX }],
      });
    } catch {
      // User declined or chain not added; reads still go through the backend.
    }
  }

  return accounts[0];
}

/** Returns the currently authorised account without prompting, or null. */
export async function getConnectedAccount(): Promise<string | null> {
  const provider = getProvider();
  if (!provider) return null;
  const accounts = (await provider.request({ method: "eth_accounts" })) as string[];
  return accounts?.[0] ?? null;
}

/** Signs a plain message with personal_sign for the given address. */
export async function signMessage(address: string, message: string): Promise<string> {
  const provider = getProvider();
  if (!provider) throw new Error("No wallet connected");
  const signature = (await provider.request({
    method: "personal_sign",
    params: [message, address],
  })) as string;
  return signature;
}
