import Link from "next/link";
import { notFound } from "next/navigation";
import { AtSign, Bot, Building2, ExternalLink, Inbox, Mail, MousePointerClick, PauseCircle, Phone, PhoneCall, Send } from "lucide-react";
import { SalesLeadEditor, SalesReplyForm } from "@/components/sales-actions";
import { SalesLeadEmailEditor } from "@/components/sales-email-actions";
import { AdminHeader, AdminStatusBadge } from "@/components/admin-ui";
import { salesReplyClassificationLabels } from "@/lib/sales";
import { requireAdmin } from "@/lib/server/admin-auth";
import { getSalesAutomationSettings } from "@/lib/server/sales-assistant";
import { suggestedSalesReply } from "@/lib/server/sales";
import { getSupabaseAdmin } from "@/lib/server/supabase";

export const dynamic = "force-dynamic";
export const metadata = { title: "Säljlead | Textback" };
const fmt = (value?: string | null) => value ? new Intl.DateTimeFormat("sv-SE", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value)) : "–";

export default async function SalesLeadPage({ params }: { params: { id: string } }) {
  requireAdmin();
  const db = getSupabaseAdmin();
  const [settings, { data: lead, error }, { data: messages }, { data: calls }, { data: recipients }, { data: emailRecipients }] = await Promise.all([
    getSalesAutomationSettings(),
    db.from("sales_leads").select("*").eq("id", params.id).maybeSingle(),
    db.from("sales_messages").select("id,direction,body,classification,suggested_reply,delivery_status,failure_reason,created_at,sent_at,delivered_at").eq("sales_lead_id", params.id).order("created_at"),
    db.from("missed_call_events").select("id,status,created_at,sms_delivered_at").eq("sales_lead_id", params.id).order("created_at", { ascending: false }).limit(20),
    db.from("sales_campaign_recipients").select("id,status,sent_at,delivered_at,sales_campaigns(id,name,status)").eq("sales_lead_id", params.id).order("created_at", { ascending: false }).limit(20),
    db.from("sales_email_campaign_recipients").select("id,status,email_address,rendered_subject,sent_at,delivered_at,clicked_at,bounced_at,failure_reason,sales_email_campaigns(id,name,status)").eq("sales_lead_id", params.id).order("created_at", { ascending: false }).limit(20),
  ]);
  if (error || !lead) notFound();
  const inbound = [...(messages || [])].reverse().find((message) => message.direction === "inbound");
  const classification = (inbound?.classification || lead.reply_classification || "question") as Parameters<typeof suggestedSalesReply>[0];
  const suggestion = inbound ? inbound.suggested_reply || suggestedSalesReply(classification, lead.company_name) : "";
  const replyDisabled = lead.do_not_contact || settings.paused;

  return <main className="admin-page"><div className="admin-wrap sales-narrow-wide">
    <AdminHeader salesAttention={lead.status === "replied" || lead.status === "interested" ? 1 : 0}/>
    <Link className="admin-link-button sales-back" href="/admin/sales">← Till Sales Hub</Link>
    <section className="sales-lead-hero admin-card">
      <div><div className="admin-kicker"><Building2 size={15}/> Säljlead</div><h1 className="admin-title">{lead.company_name}</h1><p className="admin-intro">{[lead.industry,lead.city].filter(Boolean).join(" · ") || "Bransch och ort saknas"}</p></div>
      <div className="sales-lead-actions"><AdminStatusBadge status={lead.do_not_contact ? "blocked" : lead.status}/><a className="admin-button neutral" href={`tel:${lead.phone_number}`}><Phone size={16}/> Ring</a>{lead.email_address && <a className="admin-button neutral" href={`mailto:${lead.email_address}`}><Mail size={16}/> Mejla</a>}{lead.source_url && <a className="admin-button neutral" href={lead.source_url} target="_blank" rel="noreferrer"><ExternalLink size={16}/> Källa</a>}</div>
    </section>

    {settings.paused && <div className="admin-note warning"><PauseCircle size={16}/><strong>Global paus är aktiv.</strong> Du kan granska leadet men inte skicka försäljningsmeddelanden.</div>}
    {lead.recommended_action && <section className="admin-card admin-section sales-recommendation"><div><div className="admin-kicker"><Bot size={14}/> Assistentens rekommendation</div><h2>{lead.recommended_action}</h2><p>{lead.recommendation_reason || "Ingen motivering sparad."}</p></div><div className="sales-recommendation-score"><strong>{lead.automation_score || 0}</strong><span>prioritet</span></div></section>}

    <section className="sales-summary-grid sales-lead-summary">
      <article className="admin-card"><Phone size={20}/><strong>{lead.phone_number}</strong><span>Kontakttelefon</span></article>
      <article className="admin-card"><Send size={20}/><strong>{lead.outbound_count}</strong><span>Utgående SMS</span></article>
      <article className="admin-card"><AtSign size={20}/><strong>{lead.email_address || "Saknas"}</strong><span>{lead.email_status === "verified" ? "Verifierad e-post" : "E-poststatus: " + (lead.email_status || "saknas")}</span></article>
      <article className="admin-card"><PhoneCall size={20}/><strong>{lead.demo_called_at ? "Ja" : "Nej"}</strong><span>Testat demon</span></article>
      <article className="admin-card"><MousePointerClick size={20}/><strong>{lead.website_clicked_at ? "Ja" : "Nej"}</strong><span>Bekräftat webbklick</span></article>
    </section>

    <div className="sales-detail-grid">
      <section className="admin-card admin-section">
        <div className="admin-section-head"><div><h2>Företagsuppgifter</h2><p>Underlag för bedömning och kontakt.</p></div></div>
        <dl className="sales-detail-list">
          <div><dt>Organisationsnummer</dt><dd>{lead.organization_number || "–"}</dd></div>
          <div><dt>Bolagsform</dt><dd>{lead.company_type === "aktiebolag" ? "Aktiebolag" : lead.company_type}</dd></div>
          <div><dt>Kontaktperson</dt><dd>{lead.contact_name || "–"}</dd></div>
          <div><dt>Källa verifierad</dt><dd>{fmt(lead.verified_at)}</dd></div>
          <div><dt>Automatisk kontroll</dt><dd><AdminStatusBadge status={lead.verification_status || "pending"}/></dd></div>
          <div><dt>Kontrollanmärkningar</dt><dd>{(lead.verification_reasons || []).join(" ") || "Inga"}</dd></div>
          <div><dt>Produktpassning</dt><dd>{lead.fit_score}/100</dd></div>
          <div><dt>Motivering</dt><dd>{lead.fit_reason || "–"}</dd></div>
          <div><dt>Första kontakt</dt><dd>{fmt(lead.first_contacted_at)}</dd></div>
          <div><dt>Senaste svar</dt><dd>{fmt(lead.last_reply_at)}</dd></div>
          <div><dt>Nästa uppföljning</dt><dd>{fmt(lead.next_follow_up_at)}</dd></div>
          <div><dt>E-posttyp</dt><dd><AdminStatusBadge status={lead.email_type || "unknown"}/></dd></div>
          <div><dt>E-poststatus</dt><dd><AdminStatusBadge status={lead.email_status || "missing"}/></dd></div>
          <div><dt>E-postkälla</dt><dd>{lead.email_source_url ? <a href={lead.email_source_url} target="_blank" rel="noreferrer">Öppna källan</a> : "–"}</dd></div>
          <div><dt>E-post verifierad</dt><dd>{fmt(lead.email_verified_at)}</dd></div>
          <div><dt>Utgående mejl</dt><dd>{lead.email_outbound_count || 0} av 2</dd></div>
        </dl>
      </section>
      <div className="sales-form-stack"><SalesLeadEditor lead={lead}/><SalesLeadEmailEditor lead={lead}/></div>
    </div>

    <section className="admin-card admin-section">
      <div className="admin-section-head"><div><h2>Kontaktlogg</h2><p>SMS, mejl, demosamtal och kampanjhistorik.</p></div>{classification && inbound && <span className="admin-badge interested">{salesReplyClassificationLabels[classification] || classification}</span>}</div>
      {(messages || []).length === 0 && (calls || []).length === 0 && (emailRecipients || []).length === 0 ? <div className="admin-empty"><Inbox size={30}/><strong>Ingen kontakt ännu</strong><span>Kontaktaktiviteter visas här när de sker.</span></div> : <div className="sales-timeline">
        {(messages || []).map((message) => <article className={`sales-message ${message.direction}`} key={message.id}><header><strong>{message.direction === "inbound" ? lead.company_name : "Textback"}</strong><span>{fmt(message.created_at)}</span></header><p>{message.body}</p><footer>{message.delivery_status || (message.direction === "inbound" ? "Mottaget" : "Skickat")}{message.failure_reason ? ` · ${message.failure_reason}` : ""}</footer></article>)}
        {(emailRecipients || []).map((recipient: any) => { const campaign = Array.isArray(recipient.sales_email_campaigns) ? recipient.sales_email_campaigns[0] : recipient.sales_email_campaigns; return <article className="sales-event" key={recipient.id}><Mail size={16}/><div><strong>{campaign?.name || "E-postkampanj"}</strong><span>{recipient.rendered_subject} · {recipient.status} · {fmt(recipient.sent_at)}</span>{recipient.failure_reason && <span>{recipient.failure_reason}</span>}</div></article>; })}
        {(calls || []).map((call) => <article className="sales-event" key={call.id}><PhoneCall size={16}/><div><strong>Demonumret ringdes</strong><span>{fmt(call.created_at)} · {call.status}</span></div></article>)}
        {(recipients || []).map((recipient: any) => { const campaign = Array.isArray(recipient.sales_campaigns) ? recipient.sales_campaigns[0] : recipient.sales_campaigns; return <article className="sales-event" key={recipient.id}><Send size={16}/><div><strong>{campaign?.name || "SMS-kampanj"}</strong><span>{recipient.status} · {fmt(recipient.sent_at)}</span></div></article>; })}
      </div>}
    </section>

    {inbound && <SalesReplyForm leadId={lead.id} suggestion={suggestion} disabled={replyDisabled} disabledReason={settings.paused ? "Global paus är aktiv." : undefined}/>} 
  </div></main>;
}