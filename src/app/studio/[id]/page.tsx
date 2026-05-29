import { redirect } from "next/navigation";

import { isStudioAuthenticated } from "@/lib/studio-auth";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function StudioStorybookPage({ params }: Props) {
  const authenticated = await isStudioAuthenticated();
  if (!authenticated) redirect("/studio");

  const { id } = await params;

  return (
    <main style={{ maxWidth: 900, margin: "2rem auto", padding: "1rem", fontFamily: "system-ui, sans-serif" }}>
      <h1>Storybook {id}</h1>
      <p>Full page editor arrives in Prompt 4.</p>
    </main>
  );
}
