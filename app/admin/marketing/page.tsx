import { BarChart3, ExternalLink, FileText, MousePointerClick, PhoneCall, Users } from "lucide-react";
import { AdminHeader, AdminEmpty } from "@/components/admin-ui";
import { requireAdmin } from "@/lib/server/admin-auth";
import { getSupabaseAdmin } from "@/lib/server/supabase";

export const dynamic = "force-dynamic";
export const metadata = { title: "Marknadsföring | Textback" };

const percent = (value: number, base: number) => base > 0 ? `${((value / base) * 100).toFixed(1).replace(".", ",")} %` : "–";
const fmt = (value?: string | null) => value ? new Intl.DateTimeFormat("sv-SE", { dateStyle: "short", timeStyle: "short" }).format(new Date(value)) : "–";

export default async function MarketingPage() {
  requireAdmin();
  const db = getSupabaseAdmin();
  const sinceDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const since = sinceDate.toISOString();
  const [{ data: events }, { data: leads }, { count: demoCalls }] = await Promise.all([
    db.from("marketing_events").select("event_name,session_id,path,landing_path,utm_source,utm_medium,utm_campaign,utm_content,utm_term,gclid,gbraid,wbraid,created_at").gte("created_at", since).order("created_at", { ascending: false }).limit(5000),
    db.from("pilot_leads").select("id,company,status,utm_source,utm_campaign,utm_term,gclid,gbraid,wbraid,landing_path,created_at").gte("created_at", since).order("created_at", { ascending: false }).limit(500),
    db.from("missed_call_events").select("id", { count: "exact", head: true }).gte("created_at", since).is("sales_lead_id", null),
  ]);

  const rows = events || [];
  const adLandingPath = "/missade-samtal";
  const sessions = new Set(rows.filter((event) => event.event_name === "page_view" && event.path === adLandingPath).map((event) => event.session_id));
  const formStarts = new Set(rows.filter((event) => event.event_name === "launch_form_started" && event.landing_path === adLandingPath).map((event) => event.session_id));
  const demoClicks = new Set(rows.filter((event) => event.event_name === "demo_phone_clicked" && event.landing_path === adLandingPath).map((event) => event.session_id));
  const adLeads = (leads || []).filter((lead) => lead.landing_path === adLandingPath || lead.gclid || lead.gbraid || lead.wbraid);
  const googleLeads = adLeads.filter((lead) => lead.gclid || lead.gbraid || lead.wbraid || lead.utm_source === "google");

  const campaignMap = new Map<string, { campaign: string; term: string; sessions: Set<string>; formStarts: Set<string>; demoClicks: Set<string>; leads: number }>();
  for (const event of rows) {
    if (event.landing_path !== adLandingPath && event.path !== adLandingPath) continue;
    const campaign = event.utm_campaign || "(utan kampanj)";
    const term = event.utm_term || "(utan sökterm)";
    const key = `${campaign}::${term}`;
    const item = campaignMap.get(key) || { campaign, term, sessions: new Set<string>(), formStarts: new Set<string>(), demoClicks: new Set<string>(), leads: 0 };
    if (event.event_name === "page_view") item.sessions.add(event.session_id);
    if (event.event_name === "launch_form_started") item.formStarts.add(event.session_id);
    if (event.event_name === "demo_phone_clicked") item.demoClicks.add(event.session_id);
    campaignMap.set(key, item);
  }
  for (const lead of adLeads) {
    const campaign = lead.utm_campaign || "(utan kampanj)";
    const term = lead.utm_term || "(utan sökterm)";
    const key = `${campaign}::${term}`;
    const item = campaignMap.get(key) || { campaign, term, sessions: new Set<string>(), formStarts: new Set<string>(), demoClicks: new Set<string>(), leads: 0 };
    item.leads += 1;
    campaignMap.set(key, item);
  }
  const breakdown = [...campaignMap.values()].sort((a, b) => (b.leads + b.demoClicks.size + b.formStarts.size) - (a.leads + a.demoClicks.size + a.formStarts.size));

  return <main className="admin-page"><div className="admin-wrap">
    <AdminHeader/>
    <div className="admin-kicker"><BarChart3 size={15}/> Marknadsföring</div>
    <h1 className="admin-title">Google Ads-tratten, från klick till lead.</h1>
    <p className="admin-intro">Första parts-data från de senaste 30 dagarna. Endast händelser med analysgodkännande ingår; sparade intresseanmälningar visas oavsett cookieval.</p>

    <section className="admin-stats" aria-label="Marknadsföringstratt">
      <article className="admin-card admin-stat"><Users size={19}/><strong>{sessions.size}</strong><span>Landningsbesök</span></article>
      <article className="admin-card admin-stat"><FileText size={19}/><strong>{formStarts.size}</strong><span>Formulärstarter</span></article>
      <article className="admin-card admin-stat"><PhoneCall size={19}/><strong>{demoClicks.size}</strong><span>Klick på demonummer</span></article>
      <article className="admin-card admin-stat"><MousePointerClick size={19}/><strong>{adLeads.length}</strong><span>Annonsrelaterade leads</span></article>
      <article className="admin-card admin-stat"><BarChart3 size={19}/><strong>{googleLeads.length}</strong><span>Google-attribuerade leads</span></article>
      <article className="admin-card admin-stat"><PhoneCall size={19}/><strong>{demoCalls || 0}</strong><span>Publika demosamtal totalt</span></article>
    </section>

    <section className="admin-card admin-section">
      <div className="admin-section-head"><div><h2>Konvertering</h2><p>Visar var besökarna faller bort på den dedikerade sidan.</p></div><a className="admin-link-button" href="/missade-samtal" target="_blank" rel="noreferrer">Öppna landningssidan <ExternalLink size={14}/></a></div>
      <div className="admin-action-grid">
        <article className="admin-card admin-action-card"><div><strong>Besök → formulärstart</strong><span>{percent(formStarts.size, sessions.size)}</span></div></article>
        <article className="admin-card admin-action-card"><div><strong>Besök → demoklick</strong><span>{percent(demoClicks.size, sessions.size)}</span></div></article>
        <article className="admin-card admin-action-card"><div><strong>Besök → lead</strong><span>{percent(adLeads.length, sessions.size)}</span></div></article>
      </div>
    </section>

    <section className="admin-card admin-section">
      <div className="admin-section-head"><div><h2>Kampanj och sökterm</h2><p>UTM-data från landningsbesök, demoklick, formulärstarter och leads.</p></div></div>
      {breakdown.length === 0 ? <AdminEmpty title="Ingen attribuerad trafik ännu" text="Använd /missade-samtal som slutlig webbadress och lägg till UTM-parametrar i Google Ads."/> : <div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>Kampanj</th><th>Sökterm</th><th>Besök</th><th>Formstarter</th><th>Demoklick</th><th>Leads</th></tr></thead><tbody>{breakdown.map((item) => <tr key={`${item.campaign}-${item.term}`}><td>{item.campaign}</td><td>{item.term}</td><td>{item.sessions.size}</td><td>{item.formStarts.size}</td><td>{item.demoClicks.size}</td><td><strong>{item.leads}</strong></td></tr>)}</tbody></table></div>}
    </section>

    <section className="admin-card admin-section">
      <div className="admin-section-head"><div><h2>Senaste annonsrelaterade leads</h2><p>Klick-ID sparas internt för framtida kvalificerad/offline-konvertering.</p></div></div>
      {adLeads.length === 0 ? <AdminEmpty title="Inga annonsleads ännu" text="När formuläret skickas från Google Ads visas företaget här."/> : <div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>Företag</th><th>Attribution</th><th>Landningssida</th><th>Registrerad</th></tr></thead><tbody>{adLeads.slice(0, 30).map((lead) => <tr key={lead.id}><td>{lead.company}</td><td>{lead.gclid ? "GCLID" : lead.gbraid ? "GBRAID" : lead.wbraid ? "WBRAID" : lead.utm_source || "UTM"}<div className="muted">{[lead.utm_campaign,lead.utm_term].filter(Boolean).join(" · ") || "Ingen kampanj/sökterm"}</div></td><td>{lead.landing_path || "–"}</td><td>{fmt(lead.created_at)}</td></tr>)}</tbody></table></div>}
    </section>
  </div></main>;
}