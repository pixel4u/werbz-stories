interface StoryPageProps {
  params: Promise<{ slug: string }>;
}

export default async function StoryPage({ params }: StoryPageProps) {
  const { slug } = await params;

  return (
    <main style={{ padding: "2rem", fontFamily: "system-ui, sans-serif" }}>
      <h1>Story Viewer</h1>
      <p>Book viewer placeholder for slug: <strong>{slug}</strong></p>
    </main>
  );
}
