import Link from "next/link";
import { Bot, CalendarClock, CheckCircle2, Import, Inbox, Mail, Megaphone, MousePointerClick, PauseCircle, PhoneCall, Search, Target } from "lucide-react";
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
const smsReady = (lead: any) => Boolean(lead.phone_number && lead.phone_contact_type === "direct_decision_maker" && lead.decision_maker_verified && lead.contact_name && lead.contact_role);
const emailReady = (lead: any) => Boolean(lead.email_address && lead.email_status === "verified" && lead.email_verified_at);

export default async function SalesPage({ searchParams }: { searchParams?: { q?: string; status?: string; view?: string } }) {
  requireAdmin();
  const db = getSupabaseAdmin();
  const now = new Date().toISOString();
  const [settings, { data: leads }, { data: campaigns }, { data: inboxMessages }, { count: suppressions }, { count: demoTests }, { data: latestRun }] = await Promise.all([
    getSalesAutomationSettings(),
    db.from("sales_leads").select("id,company_name,organization_number,company_type,industry,city,contact_name,contact_role,phone_number,phone_contact_type,decision_maker_verified,email_address,email_type,email_status,email_verified_at,source_url,verified_at,fit_score,status,reply_classification,outbound_count,last_contacted_at,last_reply_at,demo_called_at,website_clicked_at,next_follow_up_at,do_not_contact,verification_status,verification_reasons,automation_score,recommended_action,recommendation_reason,updated_at").order("updated_at", { ascending: false }).limit(500),
    db.from("sales_campaigns").select("id,name,status,recipient_count,sent_count,delivered_count,reply_count,failed_count,estimated_cost_ore,created_at,sent_at,created_by_mode,automation_type").order("created_at", { ascending: false }).limit(12),
    db.from("sales_messages").select("sales_lead_id").eq("direction", "inbound").order("created_at", { ascending: false }).limit(500),
    db.from("sales_suppressions").select("id", { count: "exact", head: true }),
    db.from("sales_leads").select("id", { count: "exact", head: true }).not("demo_called_at", "is", null),
    db.from("sales_automation_runs").select("id,status,dry_run,summary,created_at").order("created_at", { ascending: false }).limit(1).maybeSingle(),
  ]);
  const allLeads = leads || [];
  const inboxCount = new Set((inboxMessages || []).map((message) => message.sales_lead_id)).size;
  const query = normalize(searchParams?.q);
  const status = salesLeadStatuses.includes(searchParams?.status as any) ? searchParams!.status! : "all";
  const view = ["all", "due", "hot", "review", "verification", "sms", "email"].includes(searchParams?.view || "") ? searchParams!.view! : "all";
  const visible = allLeads.filter((lead) => {
    const haystack = [lead.company_name, lead.organization_number, lead.industry, lead.city, lead.contact_name, lead.contact_role, lead.phone_number, lead.email_address].filter(Boolean).join(" ").toLocaleLowerCase("sv-SE");
    const matchesStatus = status === "all" || lead.status === status;
    const matchesView = view === "all"
      || (view === "due" && lead.next_follow_up_at && lead.next_follow_up_at <= now && !lead.do_not_contact)
      || (view === "hot" && ["interested", "replied", "demo_tested", "engaged"].includes(lead.status))
      || (view === "review" && lead.status === "review")
      || (view === "verification" && ["pending", "needs_review"].includes(lead.verification_status))
      || (view === "sms" && smsReady(lead))
      || (view === "email" && emailReady(lead));
    return matchesStatus && matchesView && (!query || haystack.includes(query));
  });
  const stats = {
    total: allLeads.length,
    review: allLeads.filter((lead) => lead.status === "review").length,
    verification: allLeads.filter((lead) => ["pending", "needs_review"].includes(lead.verification_status)).length,
    approved: allLeads.filter((lead) => lead.status === "approved").length,
    contacted: allLeads.filter((lead) => lead.outbound_count > 0).length,
    sms: allLeads.filter(smsReady).length,
    email: allLeads.filter(emailReady).length,
    hot: allLeads.filter((lead) => ["interested", "replied", "demo_tested", "engaged"].includes(lead.status)).length,
    due: allLeads.filter((lead) => lead.next_follow_up_at && lead.next_follow_up_at <= now && !lead.do_not_contact && smsReady(lead)).length,
  };
  const attention = inboxCount + stats.due + stats.verification;

  return <main className="admin-page"><div className="admin-wrap">
    <AdminHeader salesAttention={attention}/>
    <div className="admin-kicker"><Target size={15}/> Sales Hub</div>
    <div className="sales-campaign-title"><div><h1 className="admin-title">Dagens säljjobb, prioriterat.</h1><p className="admin-intro">SMS går endast till verifierade direktnummer hos namngivna beslutsfattare. Verifierade e-postadresser hanteras i en separat kampanjkanal.</p></div><AdminStatusBadge status={settings.paused ? "paused" : settings.simulation_only ? "simulation" : "active"}/></div>

    {settings.paused && <div className="admin-note warning"><PauseCircle size={16}/><strong>Global paus är aktiv.</strong> All utgående försäljning är blockerad tills du öppnar Assisterat läge och häver pausen.</div>}

    <section className="admin-stats sales-stats" aria-label="Säljnyckeltal">
      <article className="admin-card admin-stat"><Target size={19}/><strong>{stats.total}</strong><span>Leads totalt</span></article>
      <article className="admin-card admin-stat"><PhoneCall size={19}/><strong>{stats.sms}</strong><span>SMS-verifierade</span></article>
      <article className="admin-card admin-stat"><Mail size={19}/><strong>{stats.email}</strong><span>E-postverifierade</span></article>
      <article className={`admin-card admin-stat${stats.verification ? " attention" : ""}`}><CheckCircle2 size={19}/><strong>{stats.verification}</strong><span>Kontroll behövs</span></article>
      <article className={`admin-card admin-stat${stats.hot ? " attention" : ""}`}><Inbox size={19}/><strong>{stats.hot}</strong><span>Varma leads</span></article>
      <article className={`admin-card admin-stat${stats.due ? " attention" : ""}`}><CalendarClock size={19}/><strong>{stats.due}</strong><span>SMS-uppföljningar</span></article>
    </section>

    <section className="sales-work-queue" aria-label="Dagens arbetskö">
      <Link className={`admin-card sales-work-card${stats.hot ? " attention" : ""}`} href="/admin/sales?view=hot"><Inbox size={20}/><div><strong>{stats.hot} varma leads</strong><span>Svar, klick och demosamtal att hantera först.</span></div></Link>
      <Link className="admin-card sales-work-card" href="/admin/sales?view=sms"><PhoneCall size={20}/><div><strong>{stats.sms} SMS-kontakter</strong><span>Namngivna beslutsfattare med verifierat direktnummer.</span></div></Link>
      <Link className="admin-card sales-work-card" href="/admin/sales?view=email"><Mail size={20}/><div><strong>{stats.email} e-postkontakter</strong><span>Verifierade företags- eller beslutsfattaradresser.</span></div></Link>
    </section>

    <section className="admin-action-grid sales-action-grid">
      <Link className="admin-card admin-action-card" href="/admin/sales/automation"><Bot size={22}/><div><strong>Assisterat läge</strong><span>{latestRun ? `Senast kört ${fmt(latestRun.created_at)}` : "Simulera och förbered dagens arbete"}</span></div></Link>
      <Link className="admin-card admin-action-card" href="/admin/sales/import"><Import size={22}/><div><strong>Importera leadlista</strong><span>Direktnummer, e-post eller båda</span></div></Link>
      <Link className="admin-card admin-action-card" href="/admin/sales/campaigns/new"><Megaphone size={22}/><div><strong>Skapa SMS-utskick</strong><span>{stats.sms} verifierade beslutsfattare</span></div></Link>
      <Link className="admin-card admin-action-card" href="/admin/sales/email/new"><Mail size={22}/><div><strong>Skapa e-postutskick</strong><span>{stats.email} verifierade adresser</span></div></Link>
      <Link className="admin-card admin-action-card" href="/admin/sales/inbox"><Inbox size={22}/><div><strong>Öppna säljinboxen</strong><span>{inboxCount} företag har svarat</span></div></Link>
    </section>

    <div className="admin-note"><strong>Inbyggda skydd:</strong> inga utskick sker automatiskt, SMS kräver verifierad beslutsfattare och direktnummer, e-post kräver verifierad adress och källa, alla kampanjer kräver separat godkännande och STOPP/avregistrering spärrar fortsatt kontakt.</div>

    <div className="admin-toolbar">
      <div><div className="admin-kicker"><Search size={14}/> Leadregister</div><p className="admin-intro" style={{marginBottom:0}}>{visible.length} av {allLeads.length} leads visas.</p></div>
      <form className="admin-search" action="/admin/sales" method="get">
        <label><Search size={16}/><input name="q" defaultValue={searchParams?.q || ""} placeholder="Sök företag, person, nummer eller e-post"/></label>
        <select name="view" defaultValue={view}><option value="all">Alla vyer</option><option value="sms">SMS-verifierade</option><option value="email">E-postverifierade</option><option value="verification">Automatisk kontroll</option><option value="review">Behöver granskas</option><option value="hot">Varma leads</option><option value="due">Uppföljning nu</option></select>
        <select name="status" defaultValue={status}><option value="all">Alla statusar</option>{salesLeadStatuses.map((item) => <option key={item} value={item}>{salesLeadStatusLabel(item)}</option>)}</select>
        <button className="admin-button primary">Visa</button>
        {(query || status !== "all" || view !== "all") && <Link className="admin-button neutral" href="/admin/sales">Rensa</Link>}
      </form>
    </div>

    <section className="admin-card admin-section">
      <div className="admin-section-head"><div><h2>Företag att bearbeta</h2><p>Varje kontaktväg visar sin egen verifieringsstatus. Ett e-postlead behöver inte ha telefonnummer.</p></div><Link className="admin-link-button" href="/admin/sales/automation">Kör assistenten</Link></div>
      {visible.length === 0 ? <AdminEmpty title="Inga leads matchar" text="Importera en kvalificerad lista eller ändra sökning och filter."/> : <SalesApprovalForm>
        <div className="admin-table-wrap"><table className="admin-table sales-table"><thead><tr><th>Välj</th><th>Företag</th><th>Kontakt</th><th>Kanaler</th><th>Prioritet</th><th>Status</th><th>Nästa steg</th></tr></thead><tbody>
          {visible.map((lead) => <tr key={lead.id}>
            <td><input type="checkbox" name="lead_id" value={lead.id} disabled={lead.status !== "review" || lead.do_not_contact}/></td>
            <td><Link href={`/admin/sales/leads/${lead.id}`}>{lead.company_name}</Link><div className="muted">{[lead.industry, lead.city].filter(Boolean).join(" · ") || "Ingen bransch/ort"}</div></td>
            <td><div>{lead.contact_name || "Ingen namngiven kontakt"}</div><div className="muted">{lead.contact_role || "Roll saknas"}</div></td>
            <td><div className="sales-signals">{smsReady(lead) && <span><PhoneCall size={13}/> SMS</span>}{emailReady(lead) && <span><Mail size={13}/> E-post</span>}{!smsReady(lead) && !emailReady(lead) && <span className="muted">Ingen verifierad kanal</span>}</div><div className="muted" style={{marginTop:5}}>{lead.phone_number || lead.email_address || "–"}</div></td>
            <td><strong>{lead.automation_score || lead.fit_score}/100</strong><div className="sales-score"><span style={{width:`${lead.automation_score || lead.fit_score}%`}}/></div></td>
            <td><AdminStatusBadge status={lead.status}/><div style={{marginTop:5}}><AdminStatusBadge status={lead.verification_status || "pending"}/></div></td>
            <td><Link className="admin-link-button" href={`/admin/sales/leads/${lead.id}`}>{lead.recommended_action || "Öppna"}</Link>{lead.next_follow_up_at && smsReady(lead) && <div className="muted" style={{marginTop:5}}>{fmt(lead.next_follow_up_at)}</div>}{lead.demo_called_at && <div className="muted">Demo testad</div>}{lead.website_clicked_at && <div className="muted">Länk klickad</div>}{lead.last_reply_at && <div className="muted">Svar mottaget</div>}</td>
          </tr>)}
        </tbody></table></div>
        <div className="admin-mobile-list">{visible.map((lead) => <article className="admin-mobile-card" key={lead.id}><div className="admin-mobile-head"><label className="sales-mobile-select"><input type="checkbox" name="lead_id" value={lead.id} disabled={lead.status !== "review" || lead.do_not_contact}/><span><strong>{lead.company_name}</strong><small>{lead.contact_name ? `${lead.contact_name} · ${lead.contact_role || "roll saknas"}` : "Ingen namngiven kontakt"}</small><small>{lead.phone_number || lead.email_address || "Ingen kontaktuppgift"}</small></span></label><AdminStatusBadge status={lead.status}/></div><div className="admin-mobile-meta"><span>Prioritet: {lead.automation_score || lead.fit_score}/100</span><span>{smsReady(lead) ? "SMS verifierad" : "SMS ej verifierad"}</span><span>{emailReady(lead) ? "E-post verifierad" : "E-post ej verifierad"}</span><span>{lead.recommended_action || "Ingen rekommendation ännu"}</span></div><Link className="admin-link-button" href={`/admin/sales/leads/${lead.id}`}>Öppna lead</Link></article>)}</div>
      </SalesApprovalForm>}
    </section>

    <section className="admin-card admin-section">
      <div className="admin-section-head"><div><h2>Senaste SMS-kampanjer</h2><p>Assisterade utkast och manuella SMS-kampanjer samlas här.</p></div><Link className="admin-link-button" href="/admin/sales/campaigns/new">Ny SMS-kampanj</Link></div>
      {(campaigns || []).length === 0 ? <AdminEmpty title="Inga kampanjer ännu" text="Välj verifierade beslutsfattare och skapa ett utkast."/> : <div className="sales-campaign-grid">{(campaigns || []).map((campaign) => <Link className="sales-campaign-card" href={`/admin/sales/campaigns/${campaign.id}`} key={campaign.id}><div><strong>{campaign.name}</strong><span>{campaign.created_by_mode === "assisted" ? "Assisterat" : "Manuellt"} · {fmt(campaign.created_at)}</span></div><AdminStatusBadge status={campaign.status}/><div className="sales-campaign-metrics"><span>{campaign.sent_count}/{campaign.recipient_count} skickade</span><span>{campaign.delivered_count} levererade</span><span>{campaign.reply_count} svar</span><span>{(campaign.estimated_cost_ore / 100).toLocaleString("sv-SE", {style:"currency",currency:"SEK"})}</span></div></Link>)}</div>}
    </section>
  </div></main>;
}
