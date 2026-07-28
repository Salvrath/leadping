import Link from "next/link";
import { Bot, CalendarClock, CheckCircle2, Import, Inbox, Megaphone, MousePointerClick, PauseCircle, PhoneCall, Search, Target } from "lucide-react";
import { SalesApprovalForm } from "@/components/sales-actions";
import { AdminEmpty, AdminHeader, AdminStatusBadge } from "@/components/admin-ui";
import { salesLeadStatuses, salesLeadStatusLabel } from "@/lib/sales";
import { requireAdmin } from "@/lib/server/admin-auth";
import { getSalesAutomationSettings } from "@/lib/server/sales-assistant";
import { getSupabaseAdmin } from "@/lib/server/supabase";

export const dynamic = "force-dynamic";
export const metadata = { title: "Sales Hub | Textback" };

const fmt = (value?: string | null) => value ? new Intl.DateTimeFormat("sv-SE", { dateStyle: "short", timeStyle: "short" }).format(new Date(value)) : "–";
const normalize = (value?: string) => (value || "").trim().toLocaleLowerCase("sv-SE");

export default async function SalesPage({ searchParams }: { searchParams?: { q?: string; status?: string; view?: string } }) {
  requireAdmin();
  const db = getSupabaseAdmin();
  const now = new Date().toISOString();
  const [settings, { data: leads }, { data: campaigns }, { count: inboxCount }, { count: suppressions }, { count: demoTests }, { data: latestRun }] = await Promise.all([
    getSalesAutomationSettings(),
    db.from("sales_leads").select("id,company_name,organization_number,company_type,industry,city,phone_number,source_url,verified_at,fit_score,status,reply_classification,outbound_count,last_contacted_at,last_reply_at,demo_called_at,website_clicked_at,next_follow_up_at,do_not_contact,verification_status,verification_reasons,automation_score,recommended_action,recommendation_reason,updated_at").order("updated_at", { ascending: false }).limit(500),
    db.from("sales_campaigns").select("id,name,status,recipient_count,sent_count,delivered_count,reply_count,failed_count,estimated_cost_ore,created_at,sent_at,created_by_mode,automation_type").order("created_at", { ascending: false }).limit(12),
    db.from("sales_leads").select("id", { count: "exact", head: true }).in("status", ["replied", "interested"]),
    db.from("sales_suppressions").select("id", { count: "exact", head: true }),
    db.from("sales_leads").select("id", { count: "exact", head: true }).not("demo_called_at", "is", null),
    db.from("sales_automation_runs").select("id,status,dry_run,summary,created_at").order("created_at", { ascending: false }).limit(1).maybeSingle(),
  ]);
  const allLeads = leads || [];
  const query = normalize(searchParams?.q);
  const status = salesLeadStatuses.includes(searchParams?.status as any) ? searchParams!.status! : "all";
  const view = ["all", "due", "hot", "review", "verification"].includes(searchParams?.view || "") ? searchParams!.view! : "all";
  const visible = allLeads.filter((lead) => {
    const haystack = [lead.company_name, lead.organization_number, lead.industry, lead.city, lead.phone_number].join(" ").toLocaleLowerCase("sv-SE");
    const matchesStatus = status === "all" || lead.status === status;
    const matchesView = view === "all"
      || (view === "due" && lead.next_follow_up_at && lead.next_follow_up_at <= now && !lead.do_not_contact)
      || (view === "hot" && ["interested", "replied", "demo_tested", "engaged"].includes(lead.status))
      || (view === "review" && lead.status === "review")
      || (view === "verification" && ["pending", "needs_review"].includes(lead.verification_status));
    return matchesStatus && matchesView && (!query || haystack.includes(query));
  });
  const stats = {
    total: allLeads.length,
    review: allLeads.filter((lead) => lead.status === "review").length,
    verification: allLeads.filter((lead) => ["pending", "needs_review"].includes(lead.verification_status)).length,
    approved: allLeads.filter((lead) => lead.status === "approved").length,
    contacted: allLeads.filter((lead) => lead.outbound_count > 0).length,
    hot: allLeads.filter((lead) => ["interested", "replied", "demo_tested", "engaged"].includes(lead.status)).length,
    due: allLeads.filter((lead) => lead.next_follow_up_at && lead.next_follow_up_at <= now && !lead.do_not_contact).length,
  };
  const attention = (inboxCount || 0) + stats.due + stats.verification;

  return <main className="admin-page"><div className="admin-wrap">
    <AdminHeader salesAttention={attention}/>
    <div className="admin-kicker"><Target size={15}/> Sales Hub</div>
    <div className="sales-campaign-title"><div><h1 className="admin-title">Dagens säljjobb, prioriterat.</h1><p className="admin-intro">Systemet verifierar, rangordnar och förbereder kampanjutkast. Du granskar mottagare, meddelanden och alla svar innan något skickas.</p></div><AdminStatusBadge status={settings.paused ? "paused" : settings.simulation_only ? "simulation" : "active"}/></div>

    {settings.paused && <div className="admin-note warning"><PauseCircle size={16}/><strong>Global paus är aktiv.</strong> All utgående försäljning är blockerad tills du öppnar Assisterat läge och häver pausen.</div>}

    <section className="admin-stats sales-stats" aria-label="Säljnyckeltal">
      <article className="admin-card admin-stat"><Target size={19}/><strong>{stats.total}</strong><span>Leads totalt</span></article>
      <article className={`admin-card admin-stat${stats.verification ? " attention" : ""}`}><CheckCircle2 size={19}/><strong>{stats.verification}</strong><span>Kontroll behövs</span></article>
      <article className="admin-card admin-stat"><Megaphone size={19}/><strong>{stats.contacted}</strong><span>Kontaktade</span></article>
      <article className="admin-card admin-stat"><PhoneCall size={19}/><strong>{demoTests || 0}</strong><span>Testat demon</span></article>
      <article className={`admin-card admin-stat${stats.hot ? " attention" : ""}`}><Inbox size={19}/><strong>{stats.hot}</strong><span>Varma leads</span></article>
      <article className={`admin-card admin-stat${stats.due ? " attention" : ""}`}><CalendarClock size={19}/><strong>{stats.due}</strong><span>Ska följas upp</span></article>
    </section>

    <section className="sales-work-queue" aria-label="Dagens arbetskö">
      <Link className={`admin-card sales-work-card${stats.hot ? " attention" : ""}`} href="/admin/sales?view=hot"><Inbox size={20}/><div><strong>{stats.hot} varma leads</strong><span>Svar, klick och demosamtal att hantera först.</span></div></Link>
      <Link className={`admin-card sales-work-card${stats.due ? " attention" : ""}`} href="/admin/sales?view=due"><CalendarClock size={20}/><div><strong>{stats.due} uppföljningar</strong><span>Förberedda nästa steg som väntar på granskning.</span></div></Link>
      <Link className={`admin-card sales-work-card${stats.verification ? " attention" : ""}`} href="/admin/sales?view=verification"><CheckCircle2 size={20}/><div><strong>{stats.verification} kontroller</strong><span>Saknad, gammal eller avvikande leadinformation.</span></div></Link>
    </section>

    <section className="admin-action-grid sales-action-grid">
      <Link className="admin-card admin-action-card" href="/admin/sales/automation"><Bot size={22}/><div><strong>Assisterat läge</strong><span>{latestRun ? `Senast kört ${fmt(latestRun.created_at)}` : "Simulera och förbered dagens arbete"}</span></div></Link>
      <Link className="admin-card admin-action-card" href="/admin/sales/import"><Import size={22}/><div><strong>Importera leadlista</strong><span>Batchspårning, dubblettkontroll och verifiering</span></div></Link>
      <Link className="admin-card admin-action-card" href="/admin/sales/campaigns/new"><Megaphone size={22}/><div><strong>Skapa manuellt utskick</strong><span>{stats.approved} godkända leads kan väljas</span></div></Link>
      <Link className="admin-card admin-action-card" href="/admin/sales/inbox"><Inbox size={22}/><div><strong>Öppna säljinboxen</strong><span>{inboxCount || 0} svar behöver hanteras</span></div></Link>
    </section>

    <div className="admin-note"><strong>Inbyggda skydd:</strong> assisterat läge skickar aldrig på egen hand, alla kampanjer kräver separat godkännande, max två kalla SMS, vardagar 08–18, dagligt utskickstak och central STOPP-spärr ({suppressions || 0} nummer).</div>

    <div className="admin-toolbar">
      <div><div className="admin-kicker"><Search size={14}/> Leadregister</div><p className="admin-intro" style={{marginBottom:0}}>{visible.length} av {allLeads.length} leads visas.</p></div>
      <form className="admin-search" action="/admin/sales" method="get">
        <label><Search size={16}/><input name="q" defaultValue={searchParams?.q || ""} placeholder="Sök företag, nummer eller ort"/></label>
        <select name="view" defaultValue={view}><option value="all">Alla vyer</option><option value="verification">Automatisk kontroll</option><option value="review">Behöver granskas</option><option value="hot">Varma leads</option><option value="due">Uppföljning nu</option></select>
        <select name="status" defaultValue={status}><option value="all">Alla statusar</option>{salesLeadStatuses.map((item) => <option key={item} value={item}>{salesLeadStatusLabel(item)}</option>)}</select>
        <button className="admin-button primary">Visa</button>
        {(query || status !== "all" || view !== "all") && <Link className="admin-button neutral" href="/admin/sales">Rensa</Link>}
      </form>
    </div>

    <section className="admin-card admin-section">
      <div className="admin-section-head"><div><h2>Företag att bearbeta</h2><p>Assistentens rekommendation visas som nästa steg. Du kan fortfarande göra en manuell bedömning.</p></div><Link className="admin-link-button" href="/admin/sales/automation">Kör assistenten</Link></div>
      {visible.length === 0 ? <AdminEmpty title="Inga leads matchar" text="Importera en lista eller ändra sökning och filter."/> : <SalesApprovalForm>
        <div className="admin-table-wrap"><table className="admin-table sales-table"><thead><tr><th>Välj</th><th>Företag</th><th>Kontakt</th><th>Prioritet</th><th>Status</th><th>Signaler</th><th>Nästa steg</th></tr></thead><tbody>
          {visible.map((lead) => <tr key={lead.id}>
            <td><input type="checkbox" name="lead_id" value={lead.id} disabled={lead.status !== "review" || lead.do_not_contact}/></td>
            <td><Link href={`/admin/sales/leads/${lead.id}`}>{lead.company_name}</Link><div className="muted">{[lead.industry, lead.city].filter(Boolean).join(" · ") || "Ingen bransch/ort"}</div></td>
            <td><div>{lead.phone_number}</div><div className="muted">{lead.verification_status === "ready" ? "Automatiskt verifierad" : lead.company_type === "aktiebolag" ? "Aktiebolag" : "Kontrollera bolagsform"}</div></td>
            <td><strong>{lead.automation_score || lead.fit_score}/100</strong><div className="sales-score"><span style={{width:`${lead.automation_score || lead.fit_score}%`}}/></div></td>
            <td><AdminStatusBadge status={lead.status}/><div style={{marginTop:5}}><AdminStatusBadge status={lead.verification_status || "pending"}/></div></td>
            <td><div className="sales-signals">{lead.demo_called_at && <span><PhoneCall size={13}/> Demo</span>}{lead.website_clicked_at && <span><MousePointerClick size={13}/> Klick</span>}{lead.last_reply_at && <span><Inbox size={13}/> Svar</span>}{!lead.demo_called_at && !lead.website_clicked_at && !lead.last_reply_at && <span className="muted">Inga ännu</span>}</div></td>
            <td><Link className="admin-link-button" href={`/admin/sales/leads/${lead.id}`}>{lead.recommended_action || "Öppna"}</Link>{lead.next_follow_up_at && <div className="muted" style={{marginTop:5}}>{fmt(lead.next_follow_up_at)}</div>}</td>
          </tr>)}
        </tbody></table></div>
        <div className="admin-mobile-list">{visible.map((lead) => <article className="admin-mobile-card" key={lead.id}><div className="admin-mobile-head"><label className="sales-mobile-select"><input type="checkbox" name="lead_id" value={lead.id} disabled={lead.status !== "review" || lead.do_not_contact}/><span><strong>{lead.company_name}</strong><small>{lead.phone_number}</small></span></label><AdminStatusBadge status={lead.status}/></div><div className="admin-mobile-meta"><span>Prioritet: {lead.automation_score || lead.fit_score}/100</span><span>{[lead.industry,lead.city].filter(Boolean).join(" · ") || "Bransch och ort saknas"}</span><span>{lead.recommended_action || "Ingen rekommendation ännu"}</span></div><Link className="admin-link-button" href={`/admin/sales/leads/${lead.id}`}>Öppna lead</Link></article>)}</div>
      </SalesApprovalForm>}
    </section>

    <section className="admin-card admin-section">
      <div className="admin-section-head"><div><h2>Senaste kampanjer</h2><p>Assisterade utkast och manuella kampanjer samlas här.</p></div><Link className="admin-link-button" href="/admin/sales/campaigns/new">Ny kampanj</Link></div>
      {(campaigns || []).length === 0 ? <AdminEmpty title="Inga kampanjer ännu" text="Kör assisterat läge eller välj godkända leads manuellt."/> : <div className="sales-campaign-grid">{(campaigns || []).map((campaign) => <Link className="sales-campaign-card" href={`/admin/sales/campaigns/${campaign.id}`} key={campaign.id}><div><strong>{campaign.name}</strong><span>{campaign.created_by_mode === "assisted" ? "Assisterat" : "Manuellt"} · {fmt(campaign.created_at)}</span></div><AdminStatusBadge status={campaign.status}/><div className="sales-campaign-metrics"><span>{campaign.sent_count}/{campaign.recipient_count} skickade</span><span>{campaign.reply_count} svar</span><span>{(campaign.estimated_cost_ore / 100).toLocaleString("sv-SE", {style:"currency",currency:"SEK"})}</span></div></Link>)}</div>}
    </section>
  </div></main>;
}