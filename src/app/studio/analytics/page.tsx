import Link from "next/link";
import { redirect } from "next/navigation";

import { isStudioAuthenticated } from "@/lib/studio-auth";
import { getStudioAnalyticsSummary } from "@/lib/viewer-service";

export const dynamic = "force-dynamic";

export default async function StudioAnalyticsPage() {
  const authenticated = await isStudioAuthenticated();
  if (!authenticated) redirect("/studio");

  const summary = await getStudioAnalyticsSummary();

  return (
    <main style={{ maxWidth: 1200, margin: "2rem auto", padding: "1rem", fontFamily: "system-ui, sans-serif" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
        <div>
          <h1 style={{ margin: 0 }}>Studio Analytics</h1>
          <p style={{ margin: "0.35rem 0 0", color: "#6b7280" }}>Viewer growth and story opens.</p>
        </div>
        <div style={{ display: "flex", gap: "0.6rem" }}>
          <Link href="/studio">Back to Studio</Link>
          <Link href="/studio/analytics/export.csv">Export CSV</Link>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "0.8rem", marginBottom: "1rem" }}>
        <div style={{ border: "1px solid #e5e7eb", borderRadius: 10, padding: "0.9rem", background: "#fff" }}>
          <div style={{ color: "#6b7280", fontSize: 13 }}>Total viewers</div>
          <div style={{ fontSize: 28, fontWeight: 700 }}>{summary.totalViewers}</div>
        </div>
        <div style={{ border: "1px solid #e5e7eb", borderRadius: 10, padding: "0.9rem", background: "#fff" }}>
          <div style={{ color: "#6b7280", fontSize: 13 }}>Total opens</div>
          <div style={{ fontSize: 28, fontWeight: 700 }}>{summary.totalOpens}</div>
        </div>
      </div>

      <h2>Per-book opens</h2>
      <div style={{ overflowX: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: "1.2rem", minWidth: 520 }}>
        <thead>
          <tr>
            <th style={{ textAlign: "left", borderBottom: "1px solid #ddd", padding: "0.5rem" }}>Book</th>
            <th style={{ textAlign: "left", borderBottom: "1px solid #ddd", padding: "0.5rem" }}>Slug</th>
            <th style={{ textAlign: "right", borderBottom: "1px solid #ddd", padding: "0.5rem" }}>Opens</th>
          </tr>
        </thead>
        <tbody>
          {summary.perBook.map((row) => (
            <tr key={row.storybookId}>
              <td style={{ borderBottom: "1px solid #f1f5f9", padding: "0.5rem" }}>{row.title}</td>
              <td style={{ borderBottom: "1px solid #f1f5f9", padding: "0.5rem" }}><code>{row.slug}</code></td>
              <td style={{ borderBottom: "1px solid #f1f5f9", padding: "0.5rem", textAlign: "right" }}>{row.opens}</td>
            </tr>
          ))}
        </tbody>
      </table>
      </div>

      <h2>Viewers</h2>
      <div style={{ overflowX: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 860 }}>
        <thead>
          <tr>
            <th style={{ textAlign: "left", borderBottom: "1px solid #ddd", padding: "0.5rem" }}>Email</th>
            <th style={{ textAlign: "left", borderBottom: "1px solid #ddd", padding: "0.5rem" }}>First seen</th>
            <th style={{ textAlign: "left", borderBottom: "1px solid #ddd", padding: "0.5rem" }}>Verified</th>
            <th style={{ textAlign: "left", borderBottom: "1px solid #ddd", padding: "0.5rem" }}>Opted out</th>
            <th style={{ textAlign: "right", borderBottom: "1px solid #ddd", padding: "0.5rem" }}>Books opened</th>
            <th style={{ textAlign: "right", borderBottom: "1px solid #ddd", padding: "0.5rem" }}>Open count</th>
          </tr>
        </thead>
        <tbody>
          {summary.viewerRows.map((row) => (
            <tr key={row.id}>
              <td style={{ borderBottom: "1px solid #f1f5f9", padding: "0.5rem" }}>{row.email}</td>
              <td style={{ borderBottom: "1px solid #f1f5f9", padding: "0.5rem" }}>{new Date(row.createdAt).toLocaleString()}</td>
              <td style={{ borderBottom: "1px solid #f1f5f9", padding: "0.5rem" }}>{row.verifiedAt ? new Date(row.verifiedAt).toLocaleString() : "-"}</td>
              <td style={{ borderBottom: "1px solid #f1f5f9", padding: "0.5rem" }}>{row.optedOut ? new Date(row.optedOut).toLocaleString() : "-"}</td>
              <td style={{ borderBottom: "1px solid #f1f5f9", padding: "0.5rem", textAlign: "right" }}>{row.distinctBooks}</td>
              <td style={{ borderBottom: "1px solid #f1f5f9", padding: "0.5rem", textAlign: "right" }}>{row.opens}</td>
            </tr>
          ))}
        </tbody>
      </table>
      </div>
    </main>
  );
}
