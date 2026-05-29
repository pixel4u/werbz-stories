import { createHmac, timingSafeEqual } from "node:crypto";

import { cookies } from "next/headers";

const COOKIE_NAME = "studio_session";
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30;

function base64Url(input: string): string {
  return Buffer.from(input, "utf8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function fromBase64Url(input: string): string {
  const padded = input.replace(/-/g, "+").replace(/_/g, "/");
  const mod = padded.length % 4;
  const withPadding = mod === 0 ? padded : padded + "=".repeat(4 - mod);
  return Buffer.from(withPadding, "base64").toString("utf8");
}

function getCookieSecret(): string {
  const secret = process.env.COOKIE_SECRET;
  if (!secret) throw new Error("COOKIE_SECRET is required");
  return secret;
}

function signPayload(payload: string): string {
  return createHmac("sha256", getCookieSecret()).update(payload).digest("base64url");
}

function buildSessionToken(): string {
  const exp = Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS;
  const payload = base64Url(JSON.stringify({ exp }));
  const sig = signPayload(payload);
  return `${payload}.${sig}`;
}

function verifySessionToken(token: string | undefined): boolean {
  if (!token) return false;
  const [payload, sig] = token.split(".");
  if (!payload || !sig) return false;

  const expectedSig = signPayload(payload);
  const actual = Buffer.from(sig);
  const expected = Buffer.from(expectedSig);
  if (actual.length !== expected.length) return false;
  if (!timingSafeEqual(actual, expected)) return false;

  try {
    const decoded = JSON.parse(fromBase64Url(payload)) as { exp?: number };
    if (!decoded.exp) return false;
    return decoded.exp > Math.floor(Date.now() / 1000);
  } catch {
    return false;
  }
}

export async function isStudioAuthenticated(): Promise<boolean> {
  const store = await cookies();
  const token = store.get(COOKIE_NAME)?.value;
  return verifySessionToken(token);
}

export async function requireStudioPassword(password: string): Promise<boolean> {
  const expected = process.env.STUDIO_PASSWORD;
  if (!expected) throw new Error("STUDIO_PASSWORD is required");
  return password === expected;
}

export async function setStudioSessionCookie(): Promise<void> {
  const store = await cookies();
  store.set(COOKIE_NAME, buildSessionToken(), {
    httpOnly: true,
    sameSite: "lax",
    secure: true,
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
  });
}

export async function clearStudioSessionCookie(): Promise<void> {
  const store = await cookies();
  store.set(COOKIE_NAME, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: true,
    path: "/",
    maxAge: 0,
  });
}
