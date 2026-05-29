import Link from "next/link";

export default function HomePage() {
  return (
    <main style={{ padding: "2rem", fontFamily: "system-ui, sans-serif" }}>
      <h1>Stories</h1>
      <p>Public library placeholder for werbz.com stories.</p>
      <ul>
        <li>
          <Link href="/studio">Go to Studio</Link>
        </li>
        <li>
          <Link href="/the-lighthouse">Open sample slug route</Link>
        </li>
      </ul>
    </main>
  );
}
