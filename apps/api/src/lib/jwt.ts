import { SignJWT, jwtVerify } from "jose";

function secret(): Uint8Array {
  const key = process.env["AGENT_API_SECRET"];
  if (!key) throw new Error("AGENT_API_SECRET is not set");
  return new TextEncoder().encode(key);
}

export async function signWalletJwt(walletAddress: string): Promise<string> {
  return new SignJWT({ sub: walletAddress })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("1h")
    .sign(secret());
}

export async function verifyWalletJwt(token: string): Promise<string> {
  const { payload } = await jwtVerify(token, secret());
  if (typeof payload.sub !== "string") throw new Error("Invalid token subject");
  return payload.sub;
}

export async function signApprovalToken(quoteId: string, walletAddress: string): Promise<string> {
  return new SignJWT({ quoteId, sub: walletAddress })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("5m")
    .sign(secret());
}

export async function verifyApprovalToken(
  token: string,
): Promise<{ quoteId: string; walletAddress: string }> {
  const { payload } = await jwtVerify(token, secret());
  if (typeof payload.quoteId !== "string" || typeof payload.sub !== "string") {
    throw new Error("Invalid approval token");
  }
  return { quoteId: payload.quoteId, walletAddress: payload.sub };
}
