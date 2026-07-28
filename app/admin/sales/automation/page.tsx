import Link from "next/link";
import { AlertTriangle, Bot, CheckCircle2, ClipboardCheck, FlaskConical, Inbox, Megaphone, PauseCircle, RefreshCw } from "lucide-react";
import { AdminEmpty, AdminHeader, AdminStatusBadge } from "@/components/admin-ui";
import { SalesAssistantRunForm, SalesAutomationSettingsForm } from "@/components/sales-automation-actions";
import { requireAdmin } from "@/lib/server/admin-auth";
import { getSalesAutomationSettings } from "@/lib/server/sales-assistant";
import { getSupabaseAdmin } from "@/lib/server/supabase";

export const dynamic = "force-dynamic";
export const metadata = { title: "Assisterat läge | Textback" };
const fmt = (value?: string | null) => value ? new Intl.DateTimeFormat("sv-SE", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value)) : "–";

export default async function SalesAutomationPage() {
  requireAdmin();
  const db = getSupabaseAdmin();
  const settings = await getSalesAutomationSettings();
  const now = new Date().toISOString();
  const [
    { data: runs },
    { count: pending },
    { count: ready },
    { count: needsReview },
    { count: due },
    { count: hot },
    { data: drafts },
    { data: batches },
  ] = await Promise.all([
    db.from("sales_automation_runs").select("id,source,dry_run,status,summary,error_message,created_at,completed_at").order("created_at", { ascending: false }).limit(12),
    db.from("sales_leads").select("id", { count: "exact", head: true }).eq("verification_status", "pending"),
    db.from("sales_leads").select("id", { count: "exact", head: true }).eq("verification_status", "ready").eq("do_not_contact", false),
    db.from("sales_leads").select("id", { count: "exact", head: true }).eq("verification_status", "needs_review"),
    db.from("sales_leads").select("id", { count: "exact", head: true }).lte("next_follow_up_at", now).eq("do_not_contact", false),
    db.from("sales_leads").select("id", { count: "exact", head: true }).in("status", ["interested", "replied", "demo_tested", "engaged"]),
    db.from("sales_campaigns").select("id,name,status,automation_type,recipient_count,estimated_cost_ore,created_at").eq("created_by_mode", "assisted").in("status", ["draft", "sending"]).order("created_at", { ascending: false }),
    db.from("sales_import_batches").select("id,source,status,total_rows,imported_count,rejected_count,duplicate_count,created_at,completed_at").order("created_at", { ascending: false }).limit(8),
  ]);
  const latest = (runs || [])[0];
  const latestSummary = (latest?.summary || {}) as Record<string, unknown>;
  const attention = (needsReview || 0) + (due || 0) + (hot || 0);

  return <main className="admin-page"><div className="admin-wrap sales-narrow-wide">
    <AdminHeader salesAttention={attention}/>
    <Link className="admin-link-button sales-back" href="/admin/sales">← Till Sales Hub</Link>
    <div className="admin-kicker"><Bot size={15}/> Assisterat läge</div>
    <div className="sales-campaign-title"><div><h1 className="admin-title">Systemet förbereder. Du godkänner.</h1><p className="admin-intro">Verifiera leads, prioritera dagens arbete, skapa balanserade kampanjutkast och föreslå uppföljningar utan automatisk sändning.</p></div><AdminStatusBadge status={settings.paused ? "paused" : settings.simulation_only ? "simulation" : "active"}/></div>

    {settings.paused && <div className="admin-note warning"><PauseCircle size={17}/><strong>Global paus är aktiv.</strong> Inga säljsms kan skickas. Analys och simulering kan fortfarande köras.</div>}

    <section className="admin-stats sales-stats" aria-label="Automationsöversikt">
      <article className="admin-card admin-stat"><RefreshCw size={19}/><strong>{pending || 0}</strong><span>Väntar på kontroll</span></article>
      <article className="admin-card admin-stat"><CheckCircle2 size={19}/><strong>{ready || 0}</strong><span>Automatiskt redo</span></article>
      <article className={`admin-card admin-stat${needsReview ? " attention" : ""}`}><AlertTriangle size={19}/><strong>{needsReview || 0}</strong><span>Kräver manuell kontroll</span></article>
      <article className={`admin-card admin-stat${due ? " attention" : ""}`}><ClipboardCheck size={19}/><strong>{due || 0}</strong><span>Uppföljning förfallen</span></article>
      <article className={`admin-card admin-stat${hot ? " attention" : ""}`}><Inbox size={19}/><strong>{hot || 0}</strong><span>Varma signaler</span></article>
      <article className="admin-card admin-stat"><Megaphone size={19}/><strong>{(drafts || []).length}</strong><span>Assisterade utkast</span></article>
    </section>

    <section className="admin-card admin-section sales-assistant-control">
      <div><div className="admin-kicker"><FlaskConical size={14}/> Nästa körning</div><h2>Kontrollera resultatet innan systemet ändrar något.</h2><p className="muted">Simulering visar urval och åtgärder. En riktig körning uppdaterar verifieringsstatus och skapar endast kampanjutkast.</p></div>
      <div className="sales-assistant-buttons"><SalesAssistantRunForm mode="simulate"/><SalesAssistantRunForm mode="apply"/></div>
    </section>

    {latest && <section className="admin-card admin-section">
      <div className="admin-section-head"><div><h2>Senaste körning</h2><p>{fmt(latest.created_at)} · {latest.source === "cron" ? "Schemalagd" : "Manuell"}</p></div><AdminStatusBadge status={latest.status}/></div>
      <div className="sales-run-summary">
        <span><strong>{String(latestSummary.evaluated ?? 0)}</strong> analyserade</span>
        <span><strong>{String(latestSummary.ready ?? 0)}</strong> redo</span>
        <span><strong>{String(latestSummary.needsReview ?? 0)}</strong> kontroll</span>
        <span><strong>{String(latestSummary.autoApproved ?? 0)}</strong> godkända</span>
        <span><strong>{String(latestSummary.dueFollowUps ?? 0)}</strong> uppföljningar</span>
      </div>
      {latest.error_message && <div className="admin-note error">{latest.error_message}</div>}
    </section>}

    <SalesAutomationSettingsForm settings={settings}/>

    <section className="admin-card admin-section">
      <div className="admin-section-head"><div><h2>Utkast som väntar på dig</h2><p>Inget av dessa skickas utan ett separat godkännande på kampanjsidan.</p></div></div>
      {(drafts || []).length === 0 ? <AdminEmpty title="Inga assisterade utkast" text="Kör simuleringen för att se om tillräckligt många verifierade leads finns."/> : <div className="sales-campaign-grid">{(drafts || []).map((draft) => <Link className="sales-campaign-card" href={`/admin/sales/campaigns/${draft.id}`} key={draft.id}><div><strong>{draft.name}</strong><span>{draft.automation_type === "follow_up" ? "Uppföljning" : "Första kontakt"} · {fmt(draft.created_at)}</span></div><AdminStatusBadge status={draft.status}/><div className="sales-campaign-metrics"><span>{draft.recipient_count} mottagare</span><span>{(draft.estimated_cost_ore / 100).toLocaleString("sv-SE", { style: "currency", currency: "SEK" })}</span></div></Link>)}</div>}
    </section>

    <section className="admin-card admin-section">
      <div className="admin-section-head"><div><h2>Senaste importbatcher</h2><p>Spårning av var leads kom från och hur många rader som accepterades.</p></div><Link className="admin-link-button" href="/admin/sales/import">Importera ny lista</Link></div>
      {(batches || []).length === 0 ? <AdminEmpty title="Inga batcher ännu" text="Nästa CSV-import registreras här automatiskt."/> : <div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>Tid</th><th>Källa</th><th>Status</th><th>Rader</th><th>Importerade</th><th>Avvisade</th><th>Dubbletter</th></tr></thead><tbody>{(batches || []).map((batch) => <tr key={batch.id}><td>{fmt(batch.created_at)}</td><td>{batch.source}</td><td><AdminStatusBadge status={batch.status}/></td><td>{batch.total_rows}</td><td>{batch.imported_count}</td><td>{batch.rejected_count}</td><td>{batch.duplicate_count}</td></tr>)}</tbody></table></div>}
    </section>
  </div></main>;
}