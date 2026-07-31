import Link from "next/link";
import { Megaphone, ShieldCheck } from "lucide-react";
import { AdminEmpty, AdminHeader, AdminStatusBadge } from "@/components/admin-ui";
import { createSalesCampaign } from "@/app/admin/sales/actions";
import { defaultSalesCampaignMessage } from "@/lib/sales";
import { requireAdmin } from "@/lib/server/admin-auth";
import { salesBatchLimit } from "@/lib/server/sales";
import { getSupabaseAdmin } from "@/lib/server/supabase";

export const dynamic = "force-dynamic";
export const metadata = { title: "Ny säljkampanj | Textback" };

export default async function NewSalesCampaignPage({ searchParams }: { searchParams?: { error?: string } }) {
  requireAdmin();
  const { data: leads } = await getSupabaseAdmin().from("sales_leads")
    .select("id,company_name,contact_name,contact_role,phone_number,phone_contact_type,decision_maker_verified,industry,city,fit_score,status,outbound_count,last_reply_at,demo_called_at,do_not_contact")
    .in("status", ["approved", "follow_up", "interested", "replied", "demo_tested", "engaged"])
    .eq("do_not_contact", false)
    .order("fit_score", { ascending: false }).limit(200);
  const eligible = (leads || []).filter((lead) =>
    Boolean(lead.phone_number && lead.contact_name && lead.contact_role)
    && lead.phone_contact_type === "direct_decision_maker"
    && lead.decision_maker_verified
    && (lead.outbound_count < 2 || lead.last_reply_at || lead.demo_called_at)
  );
  const error = searchParams?.error === "selection" ? `Välj mellan 1 och ${salesBatchLimit()} mottagare.` : searchParams?.error === "eligible" ? "De valda mottagarna saknar ett verifierat direktnummer till beslutsfattaren." : "";

  return <main className="admin-page"><div className="admin-wrap sales-narrow-wide">
    <AdminHeader/>
    <Link className="admin-link-button sales-back" href="/admin/sales">← Till Sales Hub</Link>
    <div className="admin-kicker"><Megaphone size={15}/> Ny SMS-kampanj</div>
    <h1 className="admin-title">Förbered ett kontrollerat SMS-utskick.</h1>
    <p className="admin-intro">Endast namngivna beslutsfattare med verifierat direktnummer kan väljas. Nästa sida visar exakt meddelande, SMS-delar och kostnadsestimat innan något skickas.</p>
    {error && <div className="admin-note error">{error}</div>}
    <div className="admin-note"><ShieldCheck size={16}/><strong>Ingen automatisk sändning:</strong> kampanjen skapas som utkast och kräver ett separat godkännande.</div>

    {eligible.length === 0 ? <AdminEmpty title="Inga SMS-kvalificerade leads" text="Lägg in en namngiven ägare, VD eller verksamhetsansvarig med ett direkt mobilnummer från en tydlig källa."/> : <form action={createSalesCampaign} className="admin-card admin-section sales-form">
      <div className="sales-field-grid">
        <label className="sales-field">Kampanjnamn<input name="name" required minLength={2} maxLength={160} defaultValue={`Textback demo ${new Intl.DateTimeFormat("sv-SE").format(new Date())}`}/></label>
      </div>
      <label className="sales-field">SMS-mall<textarea name="message_template" required minLength={20} maxLength={1000} rows={6} defaultValue={defaultSalesCampaignMessage}/><span className="sales-help">Tillgängliga variabler: {"{{companyName}}"}, {"{{demoNumber}}"} och {"{{link}}"}. Avsändare och STOPP-instruktion läggs till om de saknas.</span></label>
      <div className="admin-section-head sales-recipient-head"><div><h2>Välj beslutsfattare</h2><p>{eligible.length} verifierade direktkontakter är tillgängliga. Max {salesBatchLimit()} per kampanj.</p></div></div>
      <div className="sales-recipient-list">{eligible.map((lead) => <label className="sales-recipient" key={lead.id}>
        <input type="checkbox" name="lead_id" value={lead.id}/>
        <span><strong>{lead.contact_name} · {lead.company_name}</strong><small>{lead.contact_role} · {lead.phone_number} · {[lead.industry,lead.city].filter(Boolean).join(" · ") || "Bransch/ort saknas"}</small></span>
        <span className="sales-recipient-score">{lead.fit_score}/100</span>
        <AdminStatusBadge status={lead.status}/>
      </label>)}</div>
      <div className="sales-form-footer sticky"><button className="admin-button primary" type="submit"><Megaphone size={16}/> Skapa utkast och förhandsgranska</button><span className="muted">Inga SMS skickas i detta steg.</span></div>
    </form>}
  </div></main>;
}
