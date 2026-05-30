import Link from "next/link";

import { getAssetUrl } from "@/lib/assets";
import { listPublishedStorybooks } from "@/lib/stories/repository";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const items = await listPublishedStorybooks();

  return (
    <main style={{ maxWidth: 1100, margin: "2rem auto", padding: "1rem", fontFamily: "system-ui, sans-serif" }}>
      <h1 style={{ marginBottom: "1rem" }}>Stories</h1>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: "1rem" }}>
        {items.map((item) => (
          <article key={item.id} style={{ border: "1px solid #e5e7eb", borderRadius: 10, overflow: "hidden", background: "#fff" }}>
            <Link href={`/${item.slug}`} style={{ color: "inherit", textDecoration: "none" }}>
              <img
                src={getAssetUrl(item.coverAssetId || "asset-placeholder-cover")}
                alt={item.title}
                style={{ width: "100%", height: 180, objectFit: "cover", display: "block" }}
              />
              <div style={{ padding: "0.9rem" }}>
                <h2 style={{ fontSize: "1.1rem", margin: "0 0 0.4rem" }}>{item.title}</h2>
                <p style={{ margin: 0, color: "#4b5563" }}>{item.summary || "No summary yet."}</p>
              </div>
            </Link>
          </article>
        ))}
      </div>
    </main>
  );
}
