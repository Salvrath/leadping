import Link from "next/link";
import { notFound } from "next/navigation";
import { AlertTriangle, CheckCircle2, Mail, MousePointerClick, Send, ShieldCheck } from "lucide-react";
import { AdminHeader, AdminStatusBadge } from "@/components/admin-ui";
import { SendSalesEmailCampaignForm } from "@/components/sales-email-actions";
import { requireAdmin } from "@/lib/server/admin-auth";
import { getSalesAutomationSettings } from "@/lib/server/sales-assistant";
import { isEmailDeliveryConfigured, remainingSalesEmailDailyCapacity } from "@/lib/server/sales-email";
import { isSalesSendWindow } from "@/lib/server/sales";
import { getSupabaseAdmin } from "@/lib/server/supabase";

export const dynamic = "force-dynamic";
export const metadata = { title: "E-postkampanj | Textback" };
const fmt = (value?: string | null) => value ? new Intl.DateTimeFormat("sv-SE", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value)) : "–";

export default async function SalesEmailCampaignPage({ params }: { params: { id: string } }) {
  requireAdmin();
  const db = getSupabaseAdmin();
  const [settings, { data: campaign, error }, remaining] = await Promise.all([
    getSalesAutomationSettings(),
    db.from("sales_email_campaigns").select("*,sales_email_campaign_recipients(id,status,email_address,rendered_subject,rendered_text,rendered_html,provider_message_id,failure_reason,sent_at,delivered_at,clicked_at,bounced_at,sales_leads(id,company_name,email_status,email_type,email_outbound_count,do_not_contact))").eq("id", params.id).maybeSingle(),
    remainingSalesEmailDailyCapacity(),
  ]);
  if (error || !campaign) notFound();
  const recipients = campaign.sales_email_campaign_recipients || [];
  const configured = isEmailDeliveryConfigured();
  const sendWindow = isSalesSendWindow();
  const disabledReason = campaign.status !== "draft" ? "Kampanjen är inte längre ett utkast."
    : settings.paused ? "Global försäljningspaus är aktiv."
    : !configured ? "Resend eller avsändaradressen saknar konfiguration."
    : !sendWindow ? "Utskick kan göras vardagar klockan 08–18."
    : remaining < recipients.length ? `Dagens återstående kapacitet är ${remaining} mejl.`
    : undefined;
  const preview = recipients[0];

  return <main className="admin-page"><div className="admin-wrap sales-narrow-wide">
    <AdminHeader/>
    <Link className="admin-link-button sales-back" href="/admin/sales/email">← Till e-postkampanjer</Link>
    <section className="sales-lead-hero admin-card">
      <div><div className="admin-kicker"><Mail size={15}/> E-postkampanj</div><h1 className="admin-title">{campaign.name}</h1><p className="admin-intro">Skapad {fmt(campaign.created_at)} · avsändare Textback &lt;info@textback.se&gt;</p></div>
      <AdminStatusBadge status={campaign.status}/>
    </section>

    <section className="admin-stats sales-stats">
      <article className="admin-card admin-stat"><Mail size={19}/><strong>{campaign.recipient_count}</strong><span>Mottagare</span></article>
      <article className="admin-card admin-stat"><Send size={19}/><strong>{campaign.sent_count}</strong><span>Skickade</span></article>
      <article className="admin-card admin-stat"><CheckCircle2 size={19}/><strong>{campaign.delivered_count}</strong><span>Levererade</span></article>
      <article className="admin-card admin-stat"><MousePointerClick size={19}/><strong>{campaign.clicked_count}</strong><span>Bekräftade klick</span></article>
      <article className="admin-card admin-stat"><AlertTriangle size={19}/><strong>{campaign.bounced_count}</strong><span>Studsar</span></article>
      <article className="admin-card admin-stat"><ShieldCheck size={19}/><strong>{campaign.failed_count}</strong><span>Spärrade/fel</span></article>
    </section>

    {campaign.status === "draft" && <section className="admin-card admin-section">
      <div className="admin-section-head"><div><h2>Slutligt godkännande</h2><p>Kontrollera ämnesrad, text och mottagare. Knappen skickar riktiga mejl från info@textback.se.</p></div></div>
      <div className="admin-note"><strong>Kapacitet idag:</strong> {remaining} mejl återstår. Kampanjen innehåller {recipients.length} mottagare.</div>
      <SendSalesEmailCampaignForm campaignId={campaign.id} disabled={Boolean(disabledReason)} disabledReason={disabledReason}/>
    </section>}

    {preview && <section className="admin-card admin-section">
      <div className="admin-section-head"><div><h2>Förhandsvisning</h2><p>Exempel för {Array.isArray(preview.sales_leads) ? preview.sales_leads[0]?.company_name : preview.sales_leads?.company_name}.</p></div></div>
      <div className="sales-email-preview">
        <div><span className="muted">Ämne</span><strong>{preview.rendered_subject}</strong></div>
        <pre>{preview.rendered_text}</pre>
      </div>
    </section>}

    <section className="admin-card admin-section">
      <div className="admin-section-head"><div><h2>Mottagare och leveransstatus</h2><p>Öppningsspårning används inte. Klick kräver en scannerskyddad webbläsarbekräftelse.</p></div></div>
      <div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>Företag</th><th>E-post</th><th>Status</th><th>Skickat</th><th>Levererat</th><th>Klick</th><th>Fel</th></tr></thead><tbody>{recipients.map((recipient: any) => { const lead = Array.isArray(recipient.sales_leads) ? recipient.sales_leads[0] : recipient.sales_leads; return <tr key={recipient.id}><td><Link href={`/admin/sales/leads/${recipient.sales_lead_id || lead?.id}`}>{lead?.company_name || "Lead"}</Link></td><td>{recipient.email_address}</td><td><AdminStatusBadge status={recipient.status}/></td><td>{fmt(recipient.sent_at)}</td><td>{fmt(recipient.delivered_at)}</td><td>{fmt(recipient.clicked_at)}</td><td className="muted">{recipient.failure_reason || "–"}</td></tr>; })}</tbody></table></div>
      <div className="admin-mobile-list">{recipients.map((recipient: any) => { const lead = Array.isArray(recipient.sales_leads) ? recipient.sales_leads[0] : recipient.sales_leads; return <article className="admin-mobile-card" key={recipient.id}><div className="admin-mobile-head"><div><strong>{lead?.company_name || "Lead"}</strong><small>{recipient.email_address}</small></div><AdminStatusBadge status={recipient.status}/></div><div className="admin-mobile-meta"><span>Skickat: {fmt(recipient.sent_at)}</span><span>Levererat: {fmt(recipient.delivered_at)}</span><span>Klick: {fmt(recipient.clicked_at)}</span>{recipient.failure_reason && <span>{recipient.failure_reason}</span>}</div></article>; })}</div>
    </section>
  </div></main>;
}