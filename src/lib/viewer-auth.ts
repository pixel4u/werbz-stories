import { createHmac, randomInt, timingSafeEqual } from "node:crypto";

import { cookies } from "next/headers";

const VIEWER_COOKIE_NAME = "viewer_session";
const VIEWER_PENDING_COOKIE_NAME = "viewer_pending";
const VIEWER_SESSION_TTL_SECONDS = 60 * 60 * 24 * 180;
const VIEWER_PENDING_TTL_SECONDS = 60 * 10;

function getViewerSecret(): string {
  return process.env.VIEWER_COOKIE_SECRET || process.env.COOKIE_SECRET || "";
}

function ensureViewerSecret(): string {
  const secret = getViewerSecret();
  if (!secret) throw new Error("VIEWER_COOKIE_SECRET or COOKIE_SECRET is required");
  return secret;
}

function signPayload(payload: string): string {
  return createHmac("sha256", ensureViewerSecret()).update(payload).digest("base64url");
}

function encodePayload(data: Record<string, unknown>): string {
  return Buffer.from(JSON.stringify(data), "utf8").toString("base64url");
}

function decodePayload(tokenPart: string): Record<string, unknown> | null {
  try {
    const decoded = Buffer.from(tokenPart, "base64url").toString("utf8");
    return JSON.parse(decoded) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function verifyToken(token: string | undefined): Record<string, unknown> | null {
  if (!token) return null;
  const [payloadPart, sig] = token.split(".");
  if (!payloadPart || !sig) return null;

  const expectedSig = signPayload(payloadPart);
  const actual = Buffer.from(sig);
  const expected = Buffer.from(expectedSig);
  if (actual.length !== expected.length) return null;
  if (!timingSafeEqual(actual, expected)) return null;

  const payload = decodePayload(payloadPart);
  if (!payload) return null;

  const exp = Number(payload.exp || 0);
  if (!exp || exp < Math.floor(Date.now() / 1000)) return null;
  return payload;
}

function buildToken(payload: Record<string, unknown>): string {
  const payloadPart = encodePayload(payload);
  const sig = signPayload(payloadPart);
  return `${payloadPart}.${sig}`;
}

export async function setViewerSessionCookie(viewerId: string, email: string): Promise<void> {
  const store = await cookies();
  const exp = Math.floor(Date.now() / 1000) + VIEWER_SESSION_TTL_SECONDS;
  const token = buildToken({ viewerId, email, exp });
  store.set(VIEWER_COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: true,
    path: "/",
    maxAge: VIEWER_SESSION_TTL_SECONDS,
  });
}

export async function readViewerSessionCookie(): Promise<{ viewerId: string; email: string } | null> {
  const store = await cookies();
  const token = store.get(VIEWER_COOKIE_NAME)?.value;
  const payload = verifyToken(token);
  if (!payload) return null;

  const viewerId = String(payload.viewerId || "");
  const email = String(payload.email || "");
  if (!viewerId || !email) return null;
  return { viewerId, email };
}

export async function setViewerPendingCookie(email: string): Promise<void> {
  const store = await cookies();
  const exp = Math.floor(Date.now() / 1000) + VIEWER_PENDING_TTL_SECONDS;
  const token = buildToken({ email, exp });
  store.set(VIEWER_PENDING_COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: true,
    path: "/",
    maxAge: VIEWER_PENDING_TTL_SECONDS,
  });
}

export async function readViewerPendingCookie(): Promise<string | null> {
  const store = await cookies();
  const token = store.get(VIEWER_PENDING_COOKIE_NAME)?.value;
  const payload = verifyToken(token);
  if (!payload) return null;
  const email = String(payload.email || "");
  return email || null;
}

export async function clearViewerPendingCookie(): Promise<void> {
  const store = await cookies();
  store.set(VIEWER_PENDING_COOKIE_NAME, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: true,
    path: "/",
    maxAge: 0,
  });
}

export function createOtpCode(): string {
  return String(randomInt(100000, 1000000));
}

export function hashOtpCode(email: string, code: string): string {
  return createHmac("sha256", ensureViewerSecret())
    .update(`${email.toLowerCase()}::${code}`)
    .digest("hex");
}
