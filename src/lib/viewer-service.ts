import { and, desc, eq, sql } from "drizzle-orm";

import { getDb } from "@/db/client";
import { storybooks, viewEvents, viewers } from "@/db/schema";
import { createOtpCode, hashOtpCode } from "@/lib/viewer-auth";
import { sendOtpEmail } from "@/lib/email";

const OTP_TTL_MINUTES = 5;

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function validateEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export async function requestViewerOtp(rawEmail: string): Promise<{ email: string }> {
  const email = normalizeEmail(rawEmail);
  if (!validateEmail(email)) {
    throw new Error("Please enter a valid email address.");
  }

  const db = getDb();
  const code = createOtpCode();
  const otpHash = hashOtpCode(email, code);
  const otpExpires = new Date(Date.now() + OTP_TTL_MINUTES * 60 * 1000);

  const existing = await db.select().from(viewers).where(eq(viewers.email, email)).limit(1);
  if (existing[0]) {
    await db.update(viewers).set({ otpHash, otpExpires }).where(eq(viewers.id, existing[0].id));
  } else {
    await db.insert(viewers).values({ email, otpHash, otpExpires });
  }

  await sendOtpEmail({ to: email, code });
  return { email };
}

export async function verifyViewerOtp(rawEmail: string, rawCode: string): Promise<{ viewerId: string; email: string }> {
  const email = normalizeEmail(rawEmail);
  const code = rawCode.trim();
  if (!validateEmail(email) || !/^\d{6}$/.test(code)) {
    throw new Error("Invalid email or code.");
  }

  const db = getDb();
  const rows = await db.select().from(viewers).where(eq(viewers.email, email)).limit(1);
  const viewer = rows[0];
  if (!viewer || !viewer.otpHash || !viewer.otpExpires) {
    throw new Error("No active code for this email.");
  }

  if (viewer.otpExpires.getTime() < Date.now()) {
    throw new Error("Code expired. Request a new code.");
  }

  const expected = hashOtpCode(email, code);
  if (expected !== viewer.otpHash) {
    throw new Error("Incorrect code.");
  }

  await db
    .update(viewers)
    .set({
      verifiedAt: new Date(),
      otpHash: null,
      otpExpires: null,
    })
    .where(eq(viewers.id, viewer.id));

  return { viewerId: viewer.id, email };
}

export async function findVerifiedViewer(viewerId: string, email: string): Promise<boolean> {
  const db = getDb();
  const rows = await db
    .select({ id: viewers.id })
    .from(viewers)
    .where(and(eq(viewers.id, viewerId), eq(viewers.email, normalizeEmail(email)), sql`${viewers.verifiedAt} is not null`))
    .limit(1);
  return rows.length > 0;
}

export async function logViewEvent(viewerId: string, storybookId: string): Promise<void> {
  const db = getDb();
  await db.insert(viewEvents).values({ viewerId, storybookId });
}

export async function unsubscribeByEmail(rawEmail: string): Promise<boolean> {
  const email = normalizeEmail(rawEmail);
  if (!validateEmail(email)) return false;
  const db = getDb();
  const rows = await db.select({ id: viewers.id }).from(viewers).where(eq(viewers.email, email)).limit(1);
  if (!rows[0]) return false;
  await db.update(viewers).set({ optedOut: new Date() }).where(eq(viewers.email, email));
  return true;
}

export interface StudioAnalyticsSummary {
  totalViewers: number;
  totalOpens: number;
  perBook: Array<{ storybookId: string; slug: string; title: string; opens: number }>;
  viewerRows: Array<{
    id: string;
    email: string;
    createdAt: Date;
    verifiedAt: Date | null;
    optedOut: Date | null;
    opens: number;
    distinctBooks: number;
  }>;
}

export async function getStudioAnalyticsSummary(): Promise<StudioAnalyticsSummary> {
  const db = getDb();
  const [totalViewersRow] = await db.select({ count: sql<number>`count(*)::int` }).from(viewers);
  const [totalOpensRow] = await db.select({ count: sql<number>`count(*)::int` }).from(viewEvents);

  const perBook = await db
    .select({
      storybookId: storybooks.id,
      slug: storybooks.slug,
      title: storybooks.title,
      opens: sql<number>`count(${viewEvents.id})::int`,
    })
    .from(storybooks)
    .leftJoin(viewEvents, eq(viewEvents.storybookId, storybooks.id))
    .groupBy(storybooks.id, storybooks.slug, storybooks.title)
    .orderBy(desc(sql`count(${viewEvents.id})`));

  const viewerRows = await db
    .select({
      id: viewers.id,
      email: viewers.email,
      createdAt: viewers.createdAt,
      verifiedAt: viewers.verifiedAt,
      optedOut: viewers.optedOut,
      opens: sql<number>`count(${viewEvents.id})::int`,
      distinctBooks: sql<number>`count(distinct ${viewEvents.storybookId})::int`,
    })
    .from(viewers)
    .leftJoin(viewEvents, eq(viewEvents.viewerId, viewers.id))
    .groupBy(viewers.id, viewers.email, viewers.createdAt, viewers.verifiedAt, viewers.optedOut)
    .orderBy(desc(viewers.createdAt));

  return {
    totalViewers: Number(totalViewersRow?.count ?? 0),
    totalOpens: Number(totalOpensRow?.count ?? 0),
    perBook: perBook.map((row) => ({ ...row, opens: Number(row.opens) })),
    viewerRows: viewerRows.map((row) => ({
      ...row,
      opens: Number(row.opens),
      distinctBooks: Number(row.distinctBooks),
    })),
  };
}
