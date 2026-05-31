import { NextResponse } from "next/server";

import { getPublishedStorybookBySlug } from "@/lib/stories/repository";

interface Params {
  params: Promise<{ slug: string }>;
}

// Always serve fresh canonical data so Studio edits (new images, reordered
// pages, etc.) show in the reader immediately on refresh — never a cached
// payload pointing at an old asset id.
export const dynamic = "force-dynamic";

export async function GET(_: Request, { params }: Params) {
  const { slug } = await params;
  const storybook = await getPublishedStorybookBySlug(slug);

  if (!storybook) {
    return NextResponse.json({ error: "Not found" }, { status: 404, headers: { "cache-control": "no-store" } });
  }

  return NextResponse.json({ storybook }, { headers: { "cache-control": "no-store" } });
}
