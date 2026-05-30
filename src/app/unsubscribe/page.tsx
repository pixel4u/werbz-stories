import Link from "next/link";

import { unsubscribeByEmail } from "@/lib/viewer-service";

interface Props {
  searchParams: Promise<{ email?: string }>;
}

export default async function UnsubscribePage({ searchParams }: Props) {
  const { email } = await searchParams;

  if (!email) {
    return (
      <main style={{ maxWidth: 560, margin: "3rem auto", padding: "1rem", fontFamily: "system-ui, sans-serif" }}>
        <h1>Unsubscribe</h1>
        <p>Provide your email in the URL, for example:</p>
        <code>/unsubscribe?email=you@example.com</code>
        <p style={{ marginTop: "1rem" }}><Link href="/">Back to Stories</Link></p>
      </main>
    );
  }

  const ok = await unsubscribeByEmail(email);

  return (
    <main style={{ maxWidth: 560, margin: "3rem auto", padding: "1rem", fontFamily: "system-ui, sans-serif" }}>
      <h1>Unsubscribe</h1>
      <p>{ok ? "You have been unsubscribed." : "We couldn't find that email."}</p>
      <p><Link href="/">Back to Stories</Link></p>
    </main>
  );
}
