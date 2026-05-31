import Link from "next/link";

import { getAssetUrl } from "@/lib/assets";
import { listPublishedStorybooks } from "@/lib/stories/repository";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const items = await listPublishedStorybooks();

  return (
    <main style={{ maxWidth: 1100, margin: "2rem auto", padding: "1rem", fontFamily: "system-ui, sans-serif" }}>
      <header style={{ marginBottom: "1.4rem", textAlign: "center" }}>
        <h1 style={{ margin: "0 0 0.35rem", fontSize: "2rem" }}>Stories</h1>
        <p style={{ margin: 0, color: "#4b5563" }}>Private and family-ready storybooks from Werbz.</p>
      </header>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: "1rem" }}>
        {items.map((item) => (
          <Link
            key={item.id}
            href={`/${item.slug}`}
            style={{
              color: "inherit",
              textDecoration: "none",
              border: "1px solid #e5e7eb",
              borderRadius: 12,
              overflow: "hidden",
              background: "#fff",
              boxShadow: "0 2px 12px rgba(15,23,42,0.05)",
              display: "grid",
            }}
          >
            <img
              src={getAssetUrl(item.coverAssetId || "asset-placeholder-cover")}
              alt={item.title}
              style={{ width: "100%", height: 260, objectFit: "cover", display: "block" }}
            />
            <div style={{ padding: "0.8rem", textAlign: "center" }}>
              <h2 style={{ fontSize: "1.05rem", margin: 0 }}>{item.title}</h2>
            </div>
          </Link>
        ))}
      </div>
      {items.length === 0 ? (
        <p style={{ marginTop: "1rem", color: "#6b7280", textAlign: "center" }}>No published stories yet.</p>
      ) : null}
    </main>
  );
}
