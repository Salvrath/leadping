import Link from "next/link";
import { AlertTriangle, AtSign, Ban, CheckCircle2, Mail, Megaphone, Send, ShieldCheck } from "lucide-react";
import { AdminEmpty, AdminHeader, AdminStatusBadge } from "@/components/admin-ui";
import { SalesEmailImportForm } from "@/components/sales-email-actions";
import { requireAdmin } from "@/lib/server/admin-auth";
import { isEmailDeliveryConfigured, salesEmailBatchLimit } from "@/lib/server/sales-email";
import { getSupabaseAdmin } from "@/lib/server/supabase";

export const dynamic = "force-dynamic";
export const metadata = { title: "E-postkampanjer | Textback" };
const fmt = (value?: string | null) => value ? new Intl.DateTimeFormat("sv-SE", { dateStyle: "short", timeStyle: "short" }).format(new Date(value)) : "–";

export default async function SalesEmailPage() {
  requireAdmin();
  const db = getSupabaseAdmin();
  const [{ data: leads }, { data: campaigns }, { count: suppressions }] = await Promise.all([
    db.from("sales_leads").select("id,company_name,industry,city,email_address,email_type,email_status,email_source_url,email_verified_at,email_outbound_count,automation_score,fit_score,do_not_contact").order("automation_score", { ascending: false }).limit(1000),
    db.from("sales_email_campaigns").select("id,name,status,recipient_count,sent_count,delivered_count,clicked_count,replied_count,bounced_count,failed_count,created_at,sent_at").order("created_at", { ascending: false }).limit(20),
    db.from("sales_email_suppressions").select("id", { count: "exact", head: true }),
  ]);
  const all = leads || [];
  const ready = all.filter((lead) => lead.email_status === "verified" && lead.email_type === "generic" && !lead.do_not_contact);
  const review = all.filter((lead) => lead.email_address && (lead.email_status === "pending" || lead.email_type !== "generic"));
  const missing = all.filter((lead) => !lead.email_address).length;
  const bounced = all.filter((lead) => ["bounced", "complained", "unsubscribed"].includes(lead.email_status)).length;
  const configured = isEmailDeliveryConfigured();

  return <main className="admin-page"><div className="admin-wrap">
    <AdminHeader/>
    <Link className="admin-link-button sales-back" href="/admin/sales">← Till Sales Hub</Link>
    <div className="sales-campaign-title"><div><div className="admin-kicker"><Mail size={15}/> E-postkanal</div><h1 className="admin-title">E-postkampanjer från info@textback.se</h1><p className="admin-intro">Verifiera generella företagsadresser, skapa ett utkast och granska varje mottagare innan något skickas.</p></div><AdminStatusBadge status={configured ? "active" : "paused"}/></div>

    {!configured && <div className="admin-note warning"><AlertTriangle size={16}/><strong>E-postleverans saknar konfiguration.</strong> RESEND_API_KEY och TEXTBACK_FROM_EMAIL måste finnas i Production innan ett utskick kan godkännas.</div>}

    <section className="admin-stats sales-stats">
      <article className="admin-card admin-stat"><CheckCircle2 size={19}/><strong>{ready.length}</strong><span>Utskicksklara</span></article>
      <article className={`admin-card admin-stat${review.length ? " attention" : ""}`}><ShieldCheck size={19}/><strong>{review.length}</strong><span>Behöver bedömas</span></article>
      <article className="admin-card admin-stat"><AtSign size={19}/><strong>{missing}</strong><span>Saknar e-post</span></article>
      <article className="admin-card admin-stat"><Ban size={19}/><strong>{suppressions || 0}</strong><span>Spärrade adresser</span></article>
      <article className="admin-card admin-stat"><Send size={19}/><strong>{all.reduce((sum, lead) => sum + (lead.email_outbound_count || 0), 0)}</strong><span>Skickade kontaktmejl</span></article>
      <article className={`admin-card admin-stat${bounced ? " attention" : ""}`}><AlertTriangle size={19}/><strong>{bounced}</strong><span>Studs/avregistrering</span></article>
    </section>

    <section className="admin-action-grid sales-action-grid">
      <Link className="admin-card admin-action-card" href="/admin/sales/email/new"><Megaphone size={22}/><div><strong>Skapa e-postkampanj</strong><span>{ready.length} verifierade adresser kan väljas · max {salesEmailBatchLimit()}</span></div></Link>
      <a className="admin-card admin-action-card" href="#import"><AtSign size={22}/><div><strong>Importera e-postadresser</strong><span>Matcha adresser mot befintliga leads</span></div></a>
    </section>

    <div className="admin-note"><strong>Mätning:</strong> Textback använder inte öppningsgrad som beslutsunderlag. Leverans, scannerskyddade klick, svar, demosamtal, studs och avregistrering är de relevanta signalerna.</div>

    <section className="admin-card admin-section">
      <div className="admin-section-head"><div><h2>Verifierade adresser</h2><p>Endast generella företagskonton med sparad källänk och verifieringsdatum kan väljas automatiskt.</p></div><Link className="admin-link-button" href="/admin/sales/email/new">Ny kampanj</Link></div>
      {ready.length === 0 ? <AdminEmpty title="Inga utskicksklara adresser" text="Importera e-postadresser eller öppna ett lead och lägg in en verifierad företagsadress."/> : <div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>Företag</th><th>E-post</th><th>Källa</th><th>Kontaktförsök</th><th>Prioritet</th></tr></thead><tbody>{ready.map((lead) => <tr key={lead.id}><td><Link href={`/admin/sales/leads/${lead.id}`}>{lead.company_name}</Link><div className="muted">{[lead.industry, lead.city].filter(Boolean).join(" · ") || "–"}</div></td><td>{lead.email_address}<div className="muted">Generell företagsadress</div></td><td>{lead.email_source_url ? <a href={lead.email_source_url} target="_blank" rel="noreferrer">Öppna källa</a> : "–"}<div className="muted">{fmt(lead.email_verified_at)}</div></td><td>{lead.email_outbound_count || 0} av 2</td><td>{lead.automation_score || lead.fit_score}/100</td></tr>)}</tbody></table></div>}
    </section>

    <section className="admin-card admin-section">
      <div className="admin-section-head"><div><h2>Senaste e-postkampanjer</h2><p>Alla kampanjer kräver ett separat godkännande på detaljsidan.</p></div></div>
      {(campaigns || []).length === 0 ? <AdminEmpty title="Inga e-postkampanjer ännu" text="Skapa ett utkast när verifierade adresser har importerats."/> : <div className="sales-campaign-grid">{(campaigns || []).map((campaign) => <Link className="sales-campaign-card" href={`/admin/sales/email/${campaign.id}`} key={campaign.id}><div><strong>{campaign.name}</strong><span>{fmt(campaign.created_at)}</span></div><AdminStatusBadge status={campaign.status}/><dl><div><dt>Mottagare</dt><dd>{campaign.recipient_count}</dd></div><div><dt>Levererade</dt><dd>{campaign.delivered_count}</dd></div><div><dt>Klick</dt><dd>{campaign.clicked_count}</dd></div><div><dt>Studs</dt><dd>{campaign.bounced_count}</dd></div></dl></Link>)}</div>}
    </section>

    <div id="import"><SalesEmailImportForm/></div>
  </div></main>;
}