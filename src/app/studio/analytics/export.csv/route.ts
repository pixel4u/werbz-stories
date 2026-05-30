import { NextResponse } from "next/server";

import { isStudioAuthenticated } from "@/lib/studio-auth";
import { getStudioAnalyticsSummary } from "@/lib/viewer-service";

function csvEscape(value: string): string {
  if (value.includes(",") || value.includes("\n") || value.includes('"')) {
    return `"${value.replaceAll('"', '""')}"`;
  }
  return value;
}

export async function GET() {
  const authenticated = await isStudioAuthenticated();
  if (!authenticated) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  const summary = await getStudioAnalyticsSummary();
  const header = ["email", "first_seen", "verified_at", "opted_out", "books_opened", "open_count"];
  const lines = [header.join(",")];

  for (const row of summary.viewerRows) {
    lines.push(
      [
        row.email,
        row.createdAt.toISOString(),
        row.verifiedAt ? row.verifiedAt.toISOString() : "",
        row.optedOut ? row.optedOut.toISOString() : "",
        String(row.distinctBooks),
        String(row.opens),
      ]
        .map(csvEscape)
        .join(",")
    );
  }

  return new NextResponse(lines.join("\n"), {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": 'attachment; filename="studio-analytics.csv"',
      "cache-control": "no-store",
    },
  });
}
