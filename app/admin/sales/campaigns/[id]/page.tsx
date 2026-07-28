import Link from "next/link";
import { notFound } from "next/navigation";
import { CircleDollarSign, Clock, MessageSquareText, ShieldCheck, Users } from "lucide-react";
import { SendSalesCampaignForm } from "@/components/sales-actions";
import { AdminHeader, AdminStatusBadge } from "@/components/admin-ui";
import { requireAdmin } from "@/lib/server/admin-auth";
import { getSupabaseAdmin } from "@/lib/server/supabase";

export const dynamic = "force-dynamic";
export const metadata = { title: "Förhandsgranska kampanj | Textback" };
const fmt = (value?: string | null) => value ? new Intl.DateTimeFormat("sv-SE", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value)) : "–";

export default async function SalesCampaignPage({ params }: { params: { id: string } }) {
  requireAdmin();
  const { data: campaign, error } = await getSupabaseAdmin().from("sales_campaigns")
    .select("id,name,status,message_template,recipient_count,sent_count,delivered_count,reply_count,failed_count,estimated_parts,estimated_cost_ore,created_at,sent_at,completed_at,textback_numbers(provider_number),sales_campaign_recipients(id,status,rendered_message,estimated_parts,estimated_cost_ore,provider_message_id,failure_reason,sent_at,delivered_at,sales_leads(id,company_name,phone_number,status,do_not_contact,fit_score))")
    .eq("id", params.id).maybeSingle();
  if (error || !campaign) notFound();
  const number = Array.isArray(campaign.textback_numbers) ? campaign.textback_numbers[0] : campaign.textback_numbers;
  const recipients = campaign.sales_campaign_recipients || [];
  const sendable = campaign.status === "draft" && recipients.length > 0;

  return <main className="admin-page"><div className="admin-wrap sales-narrow-wide">
    <AdminHeader/>
    <Link className="admin-link-button sales-back" href="/admin/sales">← Till Sales Hub</Link>
    <div className="admin-kicker"><ShieldCheck size={15}/> Förhandsgranskning</div>
    <div className="sales-campaign-title"><div><h1 className="admin-title">{campaign.name}</h1><p className="admin-intro">Skapad {fmt(campaign.created_at)} · skickas från {number?.provider_number || "demonumret"}</p></div><AdminStatusBadge status={campaign.status}/></div>

    <section className="sales-summary-grid">
      <article className="admin-card"><Users size={20}/><strong>{campaign.recipient_count}</strong><span>Mottagare</span></article>
      <article className="admin-card"><MessageSquareText size={20}/><strong>{campaign.estimated_parts}</strong><span>Beräknade SMS-delar</span></article>
      <article className="admin-card"><CircleDollarSign size={20}/><strong>{(campaign.estimated_cost_ore / 100).toLocaleString("sv-SE", {style:"currency",currency:"SEK"})}</strong><span>Beräknad SMS-kostnad</span></article>
      <article className="admin-card"><Clock size={20}/><strong>{campaign.sent_count}</strong><span>Skickade hittills</span></article>
    </section>

    {campaign.status === "draft" && <div className="admin-note warning"><strong>Kontrollpunkt:</strong> verifiera mottagare och meddelanden nedan. Skicka endast när listan är korrekt och mottagarna är relevanta för Textback.</div>}
    {campaign.status !== "draft" && <div className="admin-note success"><strong>Resultat:</strong> {campaign.sent_count} skickade, {campaign.delivered_count} levererade, {campaign.reply_count} svar och {campaign.failed_count} misslyckade eller spärrade.</div>}

    <section className="admin-card admin-section">
      <div className="admin-section-head"><div><h2>Mottagare och exakt SMS</h2><p>Varje länk är unik och registrerar när mottagaren öppnar Textbacks webbplats.</p></div></div>
      <div className="sales-preview-list">{recipients.map((recipient: any) => {
        const lead = Array.isArray(recipient.sales_leads) ? recipient.sales_leads[0] : recipient.sales_leads;
        return <article className="sales-preview-card" key={recipient.id}>
          <header><div><Link href={`/admin/sales/leads/${lead?.id}`}><strong>{lead?.company_name || "Okänt företag"}</strong></Link><span>{lead?.phone_number}</span></div><AdminStatusBadge status={recipient.status}/></header>
          <p>{recipient.rendered_message}</p>
          <footer><span>{recipient.estimated_parts} SMS-delar</span><span>{(recipient.estimated_cost_ore / 100).toLocaleString("sv-SE", {style:"currency",currency:"SEK"})}</span>{recipient.failure_reason && <span className="sales-error">{recipient.failure_reason}</span>}</footer>
        </article>;
      })}</div>
    </section>

    <section className="admin-card admin-section sales-final-approval">
      <div><h2>{campaign.status === "draft" ? "Godkänn utskicket" : "Kampanjen är behandlad"}</h2><p className="muted">Utskick till kalla leads begränsas till vardagar 08–18, högst 20 mottagare per kampanj och högst 50 SMS per dag.</p></div>
      <SendSalesCampaignForm campaignId={campaign.id} disabled={!sendable}/>
    </section>
  </div></main>;
}
