import { NextResponse } from "next/server";

import { listPublishedStorybooks } from "@/lib/stories/repository";

export async function GET() {
  const items = await listPublishedStorybooks();
  return NextResponse.json({ items });
}
