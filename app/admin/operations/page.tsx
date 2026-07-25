import Link from "next/link";
import { requireAdmin } from "@/lib/server/admin-auth";
import { getSupabaseAdmin } from "@/lib/server/supabase";
import { resolveOperationalIncident } from "./actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Driftövervakning – Textback" };

const fmt = (value?: string | null) => value ? new Intl.DateTimeFormat("sv-SE", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value)) : "–";

export default async function OperationsPage() {
  requireAdmin();
  const { data, error } = await getSupabaseAdmin().from("operational_incidents")
    .select("id,source,severity,code,summary,context,occurrence_count,first_seen_at,last_seen_at,alerted_at,resolved_at")
    .order("resolved_at", { ascending: true, nullsFirst: true })
    .order("last_seen_at", { ascending: false })
    .limit(200);
  if (error) throw new Error("INCIDENTS_LOAD_FAILED");
  const incidents = data || [];
  const open = incidents.filter((item) => !item.resolved_at);
  const critical = open.filter((item) => item.severity === "critical").length;
  const warnings = open.filter((item) => item.severity === "warning").length;
  const panel: React.CSSProperties = { background: "white", border: "1px solid #dbe4ef", borderRadius: 16, padding: 20, boxShadow: "0 8px 24px rgba(16,33,63,.05)" };

  return <main style={{ minHeight: "100vh", background: "#f4f7fb", color: "#10213f", padding: "28px clamp(16px,4vw,56px) 56px" }}>
    <div style={{ maxWidth: 1200, margin: "0 auto" }}>
      <Link href="/admin" style={{ color: "#1976d2", textDecoration: "none" }}>← Tillbaka till driftpanelen</Link>
      <header style={{ margin: "22px 0" }}><h1 style={{ marginBottom: 6 }}>Driftövervakning</h1><p style={{ margin: 0, color: "#64748b" }}>Deduplicerade fel från telefoni, SMS, webhookar och betalningar.</p></header>
      <section style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))", gap: 16, marginBottom: 22 }}>
        <article style={panel}><div style={{ fontSize: 30, fontWeight: 800 }}>{critical}</div><div style={{ color: "#64748b" }}>Öppna kritiska fel</div></article>
        <article style={panel}><div style={{ fontSize: 30, fontWeight: 800 }}>{warnings}</div><div style={{ color: "#64748b" }}>Öppna varningar</div></article>
        <article style={panel}><div style={{ fontSize: 30, fontWeight: 800 }}>{incidents.filter((item) => item.alerted_at).length}</div><div style={{ color: "#64748b" }}>E-postlarm skickade</div></article>
      </section>
      <section style={{ ...panel, overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 950 }}>
          <thead><tr>{["Senast", "Allvar", "Källa", "Kod", "Beskrivning", "Antal", "Larm", "Status"].map((heading) => <th key={heading} style={{ textAlign: "left", padding: "10px 8px", borderBottom: "1px solid #e2e8f0", color: "#64748b", fontSize: 13 }}>{heading}</th>)}</tr></thead>
          <tbody>{incidents.map((incident) => <tr key={incident.id} style={{ opacity: incident.resolved_at ? .55 : 1 }}>
            <td style={{ padding: 8, whiteSpace: "nowrap" }}>{fmt(incident.last_seen_at)}</td>
            <td style={{ padding: 8, fontWeight: 800, color: incident.severity === "critical" ? "#991b1b" : "#b45309" }}>{incident.severity}</td>
            <td style={{ padding: 8 }}>{incident.source}</td>
            <td style={{ padding: 8 }}><code>{incident.code}</code></td>
            <td style={{ padding: 8, maxWidth: 380 }}>{incident.summary}</td>
            <td style={{ padding: 8 }}>{incident.occurrence_count}</td>
            <td style={{ padding: 8 }}>{fmt(incident.alerted_at)}</td>
            <td style={{ padding: 8 }}>{incident.resolved_at ? `Löst ${fmt(incident.resolved_at)}` : <form action={resolveOperationalIncident}><input type="hidden" name="id" value={incident.id}/><button style={{ border: 0, background: "#166534", color: "white", borderRadius: 8, padding: "7px 10px", cursor: "pointer", fontWeight: 700 }}>Markera löst</button></form>}</td>
          </tr>)}</tbody>
        </table>
      </section>
    </div>
  </main>;
}
