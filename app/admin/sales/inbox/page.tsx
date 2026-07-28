import Link from "next/link";
import { Inbox, MessageSquareText, PhoneCall } from "lucide-react";
import { AdminEmpty, AdminHeader, AdminStatusBadge } from "@/components/admin-ui";
import { salesReplyClassificationLabels } from "@/lib/sales";
import { requireAdmin } from "@/lib/server/admin-auth";
import { getSupabaseAdmin } from "@/lib/server/supabase";

export const dynamic = "force-dynamic";
export const metadata = { title: "Säljinbox | Textback" };
const fmt = (value?: string | null) => value ? new Intl.DateTimeFormat("sv-SE", { dateStyle: "short", timeStyle: "short" }).format(new Date(value)) : "–";

export default async function SalesInboxPage() {
  requireAdmin();
  const db = getSupabaseAdmin();
  const { data: messages } = await db.from("sales_messages")
    .select("id,sales_lead_id,body,classification,created_at,sales_leads(company_name,phone_number,status,reply_classification,last_reply_at,demo_called_at,do_not_contact)")
    .eq("direction", "inbound").order("created_at", { ascending: false }).limit(200);
  const latestByLead = Array.from(new Map((messages || []).map((message: any) => [message.sales_lead_id, message])).values());

  return <main className="admin-page"><div className="admin-wrap sales-narrow-wide">
    <AdminHeader salesAttention={latestByLead.length}/>
    <Link className="admin-link-button sales-back" href="/admin/sales">← Till Sales Hub</Link>
    <div className="admin-kicker"><Inbox size={15}/> Säljinbox</div>
    <h1 className="admin-title">Svar och köpsignaler som kräver nästa steg.</h1>
    <p className="admin-intro">Inkommande svar från kontaktade företag hålls separerade från kundernas vanliga leadinkorg.</p>

    {latestByLead.length === 0 ? <AdminEmpty title="Inga säljsvar ännu" text="När ett kontaktat företag svarar på SMS visas det här automatiskt."/> : <section className="sales-inbox-list">{latestByLead.map((message: any) => {
      const lead = Array.isArray(message.sales_leads) ? message.sales_leads[0] : message.sales_leads;
      return <Link className="admin-card sales-inbox-item" href={`/admin/sales/leads/${message.sales_lead_id}`} key={message.id}>
        <div className="sales-inbox-icon">{lead?.demo_called_at ? <PhoneCall size={19}/> : <MessageSquareText size={19}/>}</div>
        <div className="sales-inbox-main"><div><strong>{lead?.company_name || "Okänt företag"}</strong><span>{lead?.phone_number}</span></div><p>{message.body}</p><small>{fmt(message.created_at)} · {salesReplyClassificationLabels[(message.classification || lead?.reply_classification) as keyof typeof salesReplyClassificationLabels] || "Nytt svar"}</small></div>
        <AdminStatusBadge status={lead?.do_not_contact ? "blocked" : lead?.status || "replied"}/>
      </Link>;
    })}</section>}
  </div></main>;
}
