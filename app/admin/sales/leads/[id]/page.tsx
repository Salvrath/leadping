import Link from "next/link";
import { notFound } from "next/navigation";
import { Building2, ExternalLink, Inbox, MousePointerClick, Phone, PhoneCall, Send } from "lucide-react";
import { SalesLeadEditor, SalesReplyForm } from "@/components/sales-actions";
import { AdminHeader, AdminStatusBadge } from "@/components/admin-ui";
import { salesReplyClassificationLabels } from "@/lib/sales";
import { requireAdmin } from "@/lib/server/admin-auth";
import { suggestedSalesReply } from "@/lib/server/sales";
import { getSupabaseAdmin } from "@/lib/server/supabase";

export const dynamic = "force-dynamic";
export const metadata = { title: "Säljlead | Textback" };
const fmt = (value?: string | null) => value ? new Intl.DateTimeFormat("sv-SE", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value)) : "–";

export default async function SalesLeadPage({ params }: { params: { id: string } }) {
  requireAdmin();
  const db = getSupabaseAdmin();
  const [{ data: lead, error }, { data: messages }, { data: calls }, { data: recipients }] = await Promise.all([
    db.from("sales_leads").select("*").eq("id", params.id).maybeSingle(),
    db.from("sales_messages").select("id,direction,body,classification,suggested_reply,delivery_status,failure_reason,created_at,sent_at,delivered_at").eq("sales_lead_id", params.id).order("created_at"),
    db.from("missed_call_events").select("id,status,created_at,sms_delivered_at").eq("sales_lead_id", params.id).order("created_at", { ascending: false }).limit(20),
    db.from("sales_campaign_recipients").select("id,status,sent_at,delivered_at,sales_campaigns(id,name,status)").eq("sales_lead_id", params.id).order("created_at", { ascending: false }).limit(20),
  ]);
  if (error || !lead) notFound();
  const inbound = [...(messages || [])].reverse().find((message) => message.direction === "inbound");
  const classification = (inbound?.classification || lead.reply_classification || "question") as Parameters<typeof suggestedSalesReply>[0];
  const suggestion = inbound ? inbound.suggested_reply || suggestedSalesReply(classification, lead.company_name) : "";

  return <main className="admin-page"><div className="admin-wrap sales-narrow-wide">
    <AdminHeader salesAttention={lead.status === "replied" || lead.status === "interested" ? 1 : 0}/>
    <Link className="admin-link-button sales-back" href="/admin/sales">← Till Sales Hub</Link>
    <section className="sales-lead-hero admin-card">
      <div><div className="admin-kicker"><Building2 size={15}/> Säljlead</div><h1 className="admin-title">{lead.company_name}</h1><p className="admin-intro">{[lead.industry,lead.city].filter(Boolean).join(" · ") || "Bransch och ort saknas"}</p></div>
      <div className="sales-lead-actions"><AdminStatusBadge status={lead.do_not_contact ? "blocked" : lead.status}/><a className="admin-button neutral" href={`tel:${lead.phone_number}`}><Phone size={16}/> Ring</a>{lead.source_url && <a className="admin-button neutral" href={lead.source_url} target="_blank" rel="noreferrer"><ExternalLink size={16}/> Källa</a>}</div>
    </section>

    <section className="sales-summary-grid sales-lead-summary">
      <article className="admin-card"><Phone size={20}/><strong>{lead.phone_number}</strong><span>Kontakttelefon</span></article>
      <article className="admin-card"><Send size={20}/><strong>{lead.outbound_count}</strong><span>Utgående SMS</span></article>
      <article className="admin-card"><PhoneCall size={20}/><strong>{lead.demo_called_at ? "Ja" : "Nej"}</strong><span>Testat demon</span></article>
      <article className="admin-card"><MousePointerClick size={20}/><strong>{lead.website_clicked_at ? "Ja" : "Nej"}</strong><span>Öppnat länken</span></article>
    </section>

    <div className="sales-detail-grid">
      <section className="admin-card admin-section">
        <div className="admin-section-head"><div><h2>Företagsuppgifter</h2><p>Underlag för bedömning och kontakt.</p></div></div>
        <dl className="sales-detail-list">
          <div><dt>Organisationsnummer</dt><dd>{lead.organization_number || "–"}</dd></div>
          <div><dt>Bolagsform</dt><dd>{lead.company_type === "aktiebolag" ? "Aktiebolag" : lead.company_type}</dd></div>
          <div><dt>Kontaktperson</dt><dd>{lead.contact_name || "–"}</dd></div>
          <div><dt>Källa verifierad</dt><dd>{fmt(lead.verified_at)}</dd></div>
          <div><dt>Produktpassning</dt><dd>{lead.fit_score}/100</dd></div>
          <div><dt>Motivering</dt><dd>{lead.fit_reason || "–"}</dd></div>
          <div><dt>Första kontakt</dt><dd>{fmt(lead.first_contacted_at)}</dd></div>
          <div><dt>Senaste svar</dt><dd>{fmt(lead.last_reply_at)}</dd></div>
          <div><dt>Nästa uppföljning</dt><dd>{fmt(lead.next_follow_up_at)}</dd></div>
        </dl>
      </section>
      <SalesLeadEditor lead={lead}/>
    </div>

    <section className="admin-card admin-section">
      <div className="admin-section-head"><div><h2>Kontaktlogg</h2><p>SMS, demosamtal och kampanjhistorik i tidsordning.</p></div>{classification && inbound && <span className="admin-badge interested">{salesReplyClassificationLabels[classification] || classification}</span>}</div>
      {(messages || []).length === 0 && (calls || []).length === 0 ? <div className="admin-empty"><Inbox size={30}/><strong>Ingen kontakt ännu</strong><span>SMS och demosamtal visas här när de sker.</span></div> : <div className="sales-timeline">
        {(messages || []).map((message) => <article className={`sales-message ${message.direction}`} key={message.id}><header><strong>{message.direction === "inbound" ? lead.company_name : "Textback"}</strong><span>{fmt(message.created_at)}</span></header><p>{message.body}</p><footer>{message.delivery_status || (message.direction === "inbound" ? "Mottaget" : "Skickat")}{message.failure_reason ? ` · ${message.failure_reason}` : ""}</footer></article>)}
        {(calls || []).map((call) => <article className="sales-event" key={call.id}><PhoneCall size={16}/><div><strong>Demonumret ringdes</strong><span>{fmt(call.created_at)} · {call.status}</span></div></article>)}
        {(recipients || []).map((recipient: any) => { const campaign = Array.isArray(recipient.sales_campaigns) ? recipient.sales_campaigns[0] : recipient.sales_campaigns; return <article className="sales-event" key={recipient.id}><Send size={16}/><div><strong>{campaign?.name || "Kampanj"}</strong><span>{recipient.status} · {fmt(recipient.sent_at)}</span></div></article>; })}
      </div>}
    </section>

    {inbound && <SalesReplyForm leadId={lead.id} suggestion={suggestion} disabled={lead.do_not_contact}/>} 
  </div></main>;
}
