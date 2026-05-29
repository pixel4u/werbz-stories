import { NextResponse } from "next/server";

import { getPublishedStorybookBySlug } from "@/lib/stories/repository";

interface Params {
  params: Promise<{ slug: string }>;
}

export async function GET(_: Request, { params }: Params) {
  const { slug } = await params;
  const storybook = await getPublishedStorybookBySlug(slug);

  if (!storybook) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json({ storybook });
}
