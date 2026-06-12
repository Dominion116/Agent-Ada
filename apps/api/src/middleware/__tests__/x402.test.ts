import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { Request, Response } from "express";
import { createX402Middleware } from "../x402.js";
import {
  THIRDWEB_X402_BASE_URL,
  encodeSettlementHeader,
  type PaymentRequirement,
  type PaymentPayload,
  type SettleResponse,
} from "@ada/contracts";

vi.mock("../../lib/db.js", () => ({
  getDb: vi.fn(() => ({})),
  recordApiCall: vi.fn().mockResolvedValue(undefined),
}));

import { recordApiCall } from "../../lib/db.js";

const ENV_KEYS = ["THIRDWEB_SECRET_KEY", "X402_WALLET_ADDRESS", "X402_SERVER_WALLET_ADDRESS", "X402_NETWORK"];

function setEnv() {
  process.env["THIRDWEB_SECRET_KEY"] = "tw_secret_test";
  process.env["X402_WALLET_ADDRESS"] = "0x00000000000000000000000000000000000aaa";
  process.env["X402_SERVER_WALLET_ADDRESS"] = "0x00000000000000000000000000000000000bbb";
}

function clearEnv() {
  for (const key of ENV_KEYS) delete process.env[key];
}

function mockReq(headers: Record<string, string> = {}): Request {
  return {
    protocol: "https",
    method: "GET",
    originalUrl: "/api/agent/yields",
    get: (h: string) => (h.toLowerCase() === "host" ? "ada.example" : undefined),
    header: (h: string) => headers[h],
  } as unknown as Request;
}

interface MockRes {
  status: ReturnType<typeof vi.fn>;
  json: ReturnType<typeof vi.fn>;
  setHeader: ReturnType<typeof vi.fn>;
  statusCode?: number;
  body?: unknown;
}

function mockRes(): MockRes & Response {
  const res = {} as MockRes;
  res.status = vi.fn((code: number) => { res.statusCode = code; return res; });
  res.json = vi.fn((body: unknown) => { res.body = body; return res; });
  res.setHeader = vi.fn();
  return res as MockRes & Response;
}

const ACCEPT: PaymentRequirement = {
  scheme: "exact",
  network: "eip155:42220",
  maxAmountRequired: "1000",
  resource: "https://ada.example/api/agent/yields",
  description: "Current cached yield data",
  mimeType: "application/json",
  payTo: "0x00000000000000000000000000000000000aaa",
  maxTimeoutSeconds: 300,
  asset: "0xcebA9300f2b948710d2653dD7B07f33A8B32118C",
};

const PAYMENT_PAYLOAD: PaymentPayload = {
  x402Version: 1,
  scheme: "exact",
  network: "eip155:42220",
  payload: {
    signature: "0xsignature",
    authorization: {
      from: "0x00000000000000000000000000000000000ccc",
      to: "0x00000000000000000000000000000000000aaa",
      value: "1000",
      validAfter: "0",
      validBefore: "9999999999",
      nonce: "0x01",
    },
  },
};

function encodePayment(payload: PaymentPayload): string {
  return Buffer.from(JSON.stringify(payload), "utf-8").toString("base64");
}

function jsonResponse(body: unknown, ok = true) {
  return { ok, status: ok ? 200 : 500, json: async () => body };
}

describe("createX402Middleware", () => {
  beforeEach(() => {
    setEnv();
  });

  afterEach(() => {
    clearEnv();
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it("skips the gate when x402 is not configured", async () => {
    clearEnv();
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const middleware = createX402Middleware({ price: "$0.001", description: "x", endpoint: "GET /x" });
    const next = vi.fn();
    await middleware(mockReq(), mockRes(), next);

    expect(next).toHaveBeenCalledOnce();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns 402 with accepted payment options when no X-PAYMENT header is sent", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ accepts: [ACCEPT] }));
    vi.stubGlobal("fetch", fetchMock);

    const middleware = createX402Middleware({ price: "$0.001", description: "x", endpoint: "GET /x" });
    const res = mockRes();
    const next = vi.fn();
    await middleware(mockReq(), res, next);

    expect(fetchMock).toHaveBeenCalledWith(
      `${THIRDWEB_X402_BASE_URL}/accepts`,
      expect.objectContaining({ headers: expect.objectContaining({ "x-secret-key": "tw_secret_test" }) }),
    );
    expect(res.status).toHaveBeenCalledWith(402);
    expect(res.body).toMatchObject({ x402Version: 1, accepts: [ACCEPT] });
    expect(next).not.toHaveBeenCalled();
  });

  it("returns 402 for an undecodable X-PAYMENT header", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ accepts: [ACCEPT] }));
    vi.stubGlobal("fetch", fetchMock);

    const middleware = createX402Middleware({ price: "$0.001", description: "x", endpoint: "GET /x" });
    const req = mockReq({ "X-PAYMENT": "not-base64-json" });
    const res = mockRes();
    const next = vi.fn();
    await middleware(req, res, next);

    expect(res.status).toHaveBeenCalledWith(402);
    expect(res.body).toMatchObject({ error: "Invalid X-PAYMENT header" });
    expect(next).not.toHaveBeenCalled();
  });

  it("returns 402 when the payment's network has no matching requirement", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ accepts: [ACCEPT] }));
    vi.stubGlobal("fetch", fetchMock);

    const mismatched: PaymentPayload = { ...PAYMENT_PAYLOAD, network: "eip155:8453" };
    const middleware = createX402Middleware({ price: "$0.001", description: "x", endpoint: "GET /x" });
    const req = mockReq({ "X-PAYMENT": encodePayment(mismatched) });
    const res = mockRes();
    const next = vi.fn();
    await middleware(req, res, next);

    expect(res.status).toHaveBeenCalledWith(402);
    expect(res.body).toMatchObject({ error: "No matching payment requirements" });
    expect(next).not.toHaveBeenCalled();
  });

  it("returns 402 when the facilitator rejects verification", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ accepts: [ACCEPT] }))
      .mockResolvedValueOnce(jsonResponse({ isValid: false, invalidReason: "insufficient_funds" }));
    vi.stubGlobal("fetch", fetchMock);

    const middleware = createX402Middleware({ price: "$0.001", description: "x", endpoint: "GET /x" });
    const req = mockReq({ "X-PAYMENT": encodePayment(PAYMENT_PAYLOAD) });
    const res = mockRes();
    const next = vi.fn();
    await middleware(req, res, next);

    expect(res.status).toHaveBeenCalledWith(402);
    expect(res.body).toMatchObject({ error: "insufficient_funds" });
    expect(next).not.toHaveBeenCalled();
  });

  it("returns 402 when settlement fails", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ accepts: [ACCEPT] }))
      .mockResolvedValueOnce(jsonResponse({ isValid: true, payer: "0xpayer" }))
      .mockResolvedValueOnce(jsonResponse({ success: false, errorReason: "settle_failed", transaction: "", network: "eip155:42220" }));
    vi.stubGlobal("fetch", fetchMock);

    const middleware = createX402Middleware({ price: "$0.001", description: "x", endpoint: "GET /x" });
    const req = mockReq({ "X-PAYMENT": encodePayment(PAYMENT_PAYLOAD) });
    const res = mockRes();
    const next = vi.fn();
    await middleware(req, res, next);

    expect(res.status).toHaveBeenCalledWith(402);
    expect(res.body).toMatchObject({ error: "settle_failed" });
    expect(next).not.toHaveBeenCalled();
  });

  it("returns 502 when the facilitator is unreachable", async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error("network error"));
    vi.stubGlobal("fetch", fetchMock);

    const middleware = createX402Middleware({ price: "$0.001", description: "x", endpoint: "GET /x" });
    const res = mockRes();
    const next = vi.fn();
    await middleware(mockReq(), res, next);

    expect(res.status).toHaveBeenCalledWith(502);
    expect(next).not.toHaveBeenCalled();
  });

  it("settles a valid payment, sets X-PAYMENT-RESPONSE, records the call, and calls next()", async () => {
    const settlement: SettleResponse = {
      success: true,
      payer: "0x00000000000000000000000000000000000ccc",
      transaction: "0xdeadbeef",
      network: "eip155:42220",
    };

    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ accepts: [ACCEPT] }))
      .mockResolvedValueOnce(jsonResponse({ isValid: true, payer: settlement.payer }))
      .mockResolvedValueOnce(jsonResponse(settlement));
    vi.stubGlobal("fetch", fetchMock);

    const middleware = createX402Middleware({ price: "$0.001", description: "x", endpoint: "GET /api/agent/yields" });
    const req = mockReq({ "X-PAYMENT": encodePayment(PAYMENT_PAYLOAD) });
    const res = mockRes();
    const next = vi.fn();
    await middleware(req, res, next);

    expect(next).toHaveBeenCalledOnce();
    expect(res.setHeader).toHaveBeenCalledWith("X-PAYMENT-RESPONSE", encodeSettlementHeader(settlement));
    expect(req.x402Payer).toBe(settlement.payer);
    expect(recordApiCall).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        endpoint: "GET /api/agent/yields",
        caller_agent_id: settlement.payer,
        settled_tx: settlement.transaction,
        x402_invoice: encodeSettlementHeader(settlement),
      }),
    );
  });

  it("prefers the X-Agent-Id header over the payer address for caller_agent_id", async () => {
    const settlement: SettleResponse = {
      success: true,
      payer: "0x00000000000000000000000000000000000ccc",
      transaction: "0xdeadbeef",
      network: "eip155:42220",
    };

    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ accepts: [ACCEPT] }))
      .mockResolvedValueOnce(jsonResponse({ isValid: true, payer: settlement.payer }))
      .mockResolvedValueOnce(jsonResponse(settlement));
    vi.stubGlobal("fetch", fetchMock);

    const middleware = createX402Middleware({ price: "$0.001", description: "x", endpoint: "GET /api/agent/yields" });
    const req = mockReq({ "X-PAYMENT": encodePayment(PAYMENT_PAYLOAD), "X-Agent-Id": "agent-42" });
    const res = mockRes();
    const next = vi.fn();
    await middleware(req, res, next);

    expect(recordApiCall).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ caller_agent_id: "agent-42" }),
    );
  });
});
