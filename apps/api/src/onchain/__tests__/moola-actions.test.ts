import { describe, it, expect } from "vitest";
import { parseGwei } from "viem";
import {
  buildSupplyToMoola,
  buildWithdrawFromMoola,
  MAX_UINT256,
} from "../moola-actions.js";
import { CELO_ASSETS, GAS_LIMITS, GAS_PARAMS } from "../celo-client.js";

const USER = "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045" as const;
const MOOLA_POOL = "0x970b12522CA9b4054807a2c5B736149a5BE6f670" as const;
const AMOUNT = 100_000_000_000_000_000_000n; // 100 cUSD

describe("buildSupplyToMoola", () => {
  it("returns exactly two steps (approve then deposit)", () => {
    const steps = buildSupplyToMoola("cUSD", AMOUNT, USER);
    expect(steps).toHaveLength(2);
  });

  it("first step is ERC-20 approve on the cUSD token", () => {
    const [approve] = buildSupplyToMoola("cUSD", AMOUNT, USER);
    expect(approve!.address).toBe(CELO_ASSETS.cUSD);
    expect(approve!.functionName).toBe("approve");
  });

  it("approve step targets the Moola LendingPool with the correct amount", () => {
    const [approve] = buildSupplyToMoola("cUSD", AMOUNT, USER);
    expect(approve!.args[0]).toBe(MOOLA_POOL);
    expect(approve!.args[1]).toBe(AMOUNT);
  });

  it("second step is deposit on the Moola LendingPool", () => {
    const [, deposit] = buildSupplyToMoola("cUSD", AMOUNT, USER);
    expect(deposit!.address).toBe(MOOLA_POOL);
    expect(deposit!.functionName).toBe("deposit");
  });

  it("deposit step passes asset address, amount, onBehalfOf, and referralCode 0", () => {
    const [, deposit] = buildSupplyToMoola("cUSD", AMOUNT, USER);
    expect(deposit!.args).toEqual([CELO_ASSETS.cUSD, AMOUNT, USER, 0]);
  });

  it("uses the correct gas limits from GAS_LIMITS", () => {
    const [approve, deposit] = buildSupplyToMoola("cUSD", AMOUNT, USER);
    expect(approve!.gas).toBe(GAS_LIMITS.ERC20_APPROVE);
    expect(deposit!.gas).toBe(GAS_LIMITS.MOOLA_DEPOSIT);
  });

  it("uses default GAS_PARAMS when no override is provided", () => {
    const [, deposit] = buildSupplyToMoola("cUSD", AMOUNT, USER);
    expect(deposit!.maxFeePerGas).toBe(GAS_PARAMS.maxFeePerGas);
    expect(deposit!.maxPriorityFeePerGas).toBe(GAS_PARAMS.maxPriorityFeePerGas);
  });

  it("applies gas override to both steps", () => {
    const customFee = parseGwei("10");
    const steps = buildSupplyToMoola("cUSD", AMOUNT, USER, { maxFeePerGas: customFee });
    steps.forEach((step) => expect(step.maxFeePerGas).toBe(customFee));
  });

  it("works for USDC asset with correct token address", () => {
    const [approve, deposit] = buildSupplyToMoola("USDC", 1_000_000n, USER);
    expect(approve!.address).toBe(CELO_ASSETS.USDC);
    expect(deposit!.args[0]).toBe(CELO_ASSETS.USDC);
  });
});

describe("buildWithdrawFromMoola", () => {
  it("returns exactly one step", () => {
    const steps = buildWithdrawFromMoola("cUSD", AMOUNT, USER);
    expect(steps).toHaveLength(1);
  });

  it("step targets the Moola LendingPool withdraw function", () => {
    const [withdraw] = buildWithdrawFromMoola("cUSD", AMOUNT, USER);
    expect(withdraw!.address).toBe(MOOLA_POOL);
    expect(withdraw!.functionName).toBe("withdraw");
  });

  it("passes asset address, amount, and recipient correctly", () => {
    const [withdraw] = buildWithdrawFromMoola("cUSD", AMOUNT, USER);
    expect(withdraw!.args).toEqual([CELO_ASSETS.cUSD, AMOUNT, USER]);
  });

  it("uses the MOOLA_WITHDRAW gas limit", () => {
    const [withdraw] = buildWithdrawFromMoola("cUSD", AMOUNT, USER);
    expect(withdraw!.gas).toBe(GAS_LIMITS.MOOLA_WITHDRAW);
  });

  it("accepts MAX_UINT256 for a full position close", () => {
    const [withdraw] = buildWithdrawFromMoola("cUSD", MAX_UINT256, USER);
    expect(withdraw!.args[1]).toBe(MAX_UINT256);
  });

  it("applies gas override", () => {
    const customTip = parseGwei("3");
    const [withdraw] = buildWithdrawFromMoola("cUSD", AMOUNT, USER, {
      maxPriorityFeePerGas: customTip,
    });
    expect(withdraw!.maxPriorityFeePerGas).toBe(customTip);
  });
});
