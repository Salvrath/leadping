import Link from "next/link";
import { Mail, ShieldCheck } from "lucide-react";
import { AdminEmpty, AdminHeader } from "@/components/admin-ui";
import { createSalesEmailCampaign } from "@/app/admin/sales/email/actions";
import { requireAdmin } from "@/lib/server/admin-auth";
import { defaultSalesEmailBody, defaultSalesEmailSubject, salesEmailBatchLimit } from "@/lib/server/sales-email";
import { getSupabaseAdmin } from "@/lib/server/supabase";

export const dynamic = "force-dynamic";
export const metadata = { title: "Ny e-postkampanj | Textback" };

export default async function NewSalesEmailCampaignPage({ searchParams }: { searchParams?: { error?: string } }) {
  requireAdmin();
  const db = getSupabaseAdmin();
  const [{ data: leads }, { data: suppressions }] = await Promise.all([
    db.from("sales_leads").select("id,company_name,industry,city,email_address,email_type,email_status,email_outbound_count,automation_score,fit_score,do_not_contact").eq("email_status", "verified").eq("email_type", "generic").eq("do_not_contact", false).lt("email_outbound_count", 2).order("automation_score", { ascending: false }).limit(500),
    db.from("sales_email_suppressions").select("email_address"),
  ]);
  const suppressed = new Set((suppressions || []).map((item) => item.email_address.toLocaleLowerCase("en-US")));
  const eligible = (leads || []).filter((lead) => lead.email_address && !suppressed.has(lead.email_address.toLocaleLowerCase("en-US")));
  const errorText = searchParams?.error === "selection" ? `Välj mellan 1 och ${salesEmailBatchLimit()} mottagare.` : searchParams?.error === "eligible" ? "Inga valda adresser var utskicksklara." : null;

  return <main className="admin-page"><div className="admin-wrap sales-narrow-wide">
    <AdminHeader/>
    <Link className="admin-link-button sales-back" href="/admin/sales/email">← Till e-postkampanjer</Link>
    <div className="admin-kicker"><Mail size={15}/> Ny e-postkampanj</div>
    <h1 className="admin-title">Förbered ett kontrollerat mejlutskick.</h1>
    <p className="admin-intro">Välj verifierade generella företagsadresser. Du får en fullständig förhandsvisning på nästa sida innan något skickas.</p>
    {errorText && <div className="admin-note error">{errorText}</div>}

    {eligible.length === 0 ? <AdminEmpty title="Inga utskicksklara e-postadresser" text="Importera och verifiera generella företagsadresser först."/> : <form action={createSalesEmailCampaign} className="sales-form">
      <section className="admin-card admin-section">
        <div className="admin-section-head"><div><h2>Kampanjinnehåll</h2><p>Variabler: {"{{companyName}}"}, {"{{demoNumber}}"}, {"{{link}}"} och {"{{unsubscribeUrl}}"}.</p></div></div>
        <label className="sales-field">Kampanjnamn<input name="name" required minLength={2} maxLength={160} defaultValue={`Textback e-post ${new Intl.DateTimeFormat("sv-SE").format(new Date())}`}/></label>
        <label className="sales-field">Ämnesrad<input name="subject_template" required minLength={2} maxLength={200} defaultValue={defaultSalesEmailSubject}/></label>
        <label className="sales-field">Mejltext<textarea name="body_template" rows={16} required minLength={20} maxLength={10000} defaultValue={defaultSalesEmailBody}/></label>
        <div className="admin-note"><ShieldCheck size={16}/><strong>Avregistrering läggs alltid till.</strong> Varje mottagare får en unik avregistreringslänk och en standardsignal till e-postklientens egen avregistreringsknapp.</div>
      </section>

      <section className="admin-card admin-section">
        <div className="admin-section-head"><div><h2>Välj mottagare</h2><p>Högst {salesEmailBatchLimit()} företag per kampanj. Personliga arbetsadresser visas inte här.</p></div><span className="admin-badge active">{eligible.length} tillgängliga</span></div>
        <div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>Välj</th><th>Företag</th><th>E-post</th><th>Prioritet</th><th>Kontaktförsök</th></tr></thead><tbody>{eligible.map((lead) => <tr key={lead.id}><td><input type="checkbox" name="lead_id" value={lead.id}/></td><td><strong>{lead.company_name}</strong><div className="muted">{[lead.industry, lead.city].filter(Boolean).join(" · ") || "–"}</div></td><td>{lead.email_address}</td><td>{lead.automation_score || lead.fit_score}/100</td><td>{lead.email_outbound_count} av 2</td></tr>)}</tbody></table></div>
        <div className="admin-mobile-list">{eligible.map((lead) => <label className="admin-mobile-card sales-mobile-select" key={lead.id}><input type="checkbox" name="lead_id" value={lead.id}/><span><strong>{lead.company_name}</strong><small>{lead.email_address}</small><small>{[lead.industry, lead.city].filter(Boolean).join(" · ") || "–"} · prioritet {lead.automation_score || lead.fit_score}</small></span></label>)}</div>
      </section>

      <div className="sales-selection-bar"><button className="admin-button primary" type="submit"><Mail size={16}/> Skapa förhandsvisning</button><span className="muted">Inga mejl skickas i detta steg.</span></div>
    </form>}
  </div></main>;
}