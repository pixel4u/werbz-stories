import { BookViewer } from "@/components/book/book-viewer";

interface StoryPageProps {
  params: Promise<{ slug: string }>;
}

export default async function StoryPage({ params }: StoryPageProps) {
  const { slug } = await params;
  return <BookViewer slug={slug} />;
}
