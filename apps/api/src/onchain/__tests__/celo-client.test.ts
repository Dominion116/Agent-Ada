import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  getStablecoinBalance,
  getAllStablecoinBalances,
  CELO_ASSETS,
  _resetCeloClients,
} from "../celo-client.js";

const TEST_WALLET = "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045" as const;

function makeClient(balanceRaw: bigint) {
  return {
    readContract: vi.fn().mockResolvedValue(balanceRaw),
  };
}

beforeEach(() => {
  _resetCeloClients();
});

describe("getStablecoinBalance", () => {
  it("calls balanceOf on the correct cUSD contract address", async () => {
    const client = makeClient(0n);
    await getStablecoinBalance(TEST_WALLET, "cUSD", client);
    expect(client.readContract).toHaveBeenCalledWith(
      expect.objectContaining({ address: CELO_ASSETS.cUSD }),
    );
  });

  it("calls balanceOf on the correct USDC contract address", async () => {
    const client = makeClient(0n);
    await getStablecoinBalance(TEST_WALLET, "USDC", client);
    expect(client.readContract).toHaveBeenCalledWith(
      expect.objectContaining({ address: CELO_ASSETS.USDC }),
    );
  });

  it("passes the wallet address as the balanceOf argument", async () => {
    const client = makeClient(0n);
    await getStablecoinBalance(TEST_WALLET, "cUSD", client);
    expect(client.readContract).toHaveBeenCalledWith(
      expect.objectContaining({ args: [TEST_WALLET] }),
    );
  });

  it("returns raw bigint value", async () => {
    const raw = 5_000_000_000_000_000_000n; // 5 cUSD (18 dec)
    const result = await getStablecoinBalance(TEST_WALLET, "cUSD", makeClient(raw));
    expect(result.raw).toBe(raw);
  });

  it("formats cUSD (18 decimals) correctly", async () => {
    // 1.5 cUSD = 1_500_000_000_000_000_000
    const raw = 1_500_000_000_000_000_000n;
    const result = await getStablecoinBalance(TEST_WALLET, "cUSD", makeClient(raw));
    expect(result.formatted).toBe("1.5");
  });

  it("formats USDC (6 decimals) correctly", async () => {
    // 250.75 USDC = 250_750_000
    const raw = 250_750_000n;
    const result = await getStablecoinBalance(TEST_WALLET, "USDC", makeClient(raw));
    expect(result.formatted).toBe("250.75");
  });

  it("formats a zero balance as '0'", async () => {
    const result = await getStablecoinBalance(TEST_WALLET, "cUSD", makeClient(0n));
    expect(result.formatted).toBe("0");
  });

  it("formats a whole-number balance with no decimal point", async () => {
    const raw = 100_000_000_000_000_000_000n; // 100 cUSD
    const result = await getStablecoinBalance(TEST_WALLET, "cUSD", makeClient(raw));
    expect(result.formatted).toBe("100");
  });

  it("returns correct decimals per asset", async () => {
    const cusd = await getStablecoinBalance(TEST_WALLET, "cUSD", makeClient(0n));
    const usdc = await getStablecoinBalance(TEST_WALLET, "USDC", makeClient(0n));
    expect(cusd.decimals).toBe(18);
    expect(usdc.decimals).toBe(6);
  });
});

describe("getAllStablecoinBalances", () => {
  it("returns entries for all supported assets", async () => {
    const client = makeClient(1_000_000n);
    const balances = await getAllStablecoinBalances(TEST_WALLET, client);
    expect(balances).toHaveLength(2);
    const assets = balances.map((b) => b.asset);
    expect(assets).toContain("cUSD");
    expect(assets).toContain("USDC");
  });

  it("returns partial results when one asset call fails", async () => {
    let callCount = 0;
    const client = {
      readContract: vi.fn().mockImplementation(() => {
        callCount++;
        if (callCount === 1) return Promise.reject(new Error("revert"));
        return Promise.resolve(500_000n);
      }),
    };
    const balances = await getAllStablecoinBalances(TEST_WALLET, client);
    expect(balances).toHaveLength(1);
  });
});
