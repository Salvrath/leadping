import Link from "next/link";
import { BellRing, Inbox, MessageSquareText, PhoneCall, Send, Sparkles } from "lucide-react";
import { requireCustomer } from "@/lib/server/customer-auth";
import { getSupabaseAdmin } from "@/lib/server/supabase";
import { PortalHeader, StatusBadge, conversationStatuses, statusLabel } from "@/components/portal-ui";
import { StatusUpdateForm } from "@/components/portal-forms";

export const dynamic = "force-dynamic";
export const metadata = { title: "Kundportal | Textback" };
const fmt = (value?: string | null) => value ? new Intl.DateTimeFormat("sv-SE", { dateStyle: "short", timeStyle: "short" }).format(new Date(value)) : "–";

export default async function PortalPage({ searchParams }: { searchParams?: { status?: string } }) {
  const user = await requireCustomer();
  const number = Array.isArray(user.textback_numbers) ? user.textback_numbers[0] : user.textback_numbers;
  const db = getSupabaseAdmin();
  const since = new Date(Date.now() - 30 * 24 * 60 * 60_000).toISOString();
  const [{ data: conversations }, { data: calls }] = await Promise.all([
    db.from("conversations").select("id,customer_number,status,latest_inbound_preview,last_message_at").eq("textback_number_id", user.textback_number_id).order("last_message_at", { ascending: false }).limit(200),
    db.from("missed_call_events").select("id,status,created_at").eq("textback_number_id", user.textback_number_id).gte("created_at", since).order("created_at", { ascending: false }).limit(1000),
  ]);

  const allConversations = conversations || [];
  const events = calls || [];
  const activeFilter = conversationStatuses.includes(searchParams?.status as any) ? searchParams!.status! : "all";
  const visibleConversations = activeFilter === "all" ? allConversations : allConversations.filter((conversation) => conversation.status === activeFilter);
  const sentEvents = events.filter((event) => ["sms_sent", "sms_delivered"].includes(event.status));
  const stats = {
    missed: events.length,
    replies: allConversations.length,
    new: allConversations.filter((conversation) => conversation.status === "new").length,
    delivered: events.filter((event) => event.status === "sms_delivered").length,
    deliveryRate: sentEvents.length ? Math.round(events.filter((event) => event.status === "sms_delivered").length / sentEvents.length * 100) : 0,
  };

  return <main className="portal-page"><div className="portal-wrap">
    <PortalHeader businessName={number?.business_name} demoMode={number?.demo_mode} notificationsEnabled={number?.email_notifications_enabled}/>

    <div className="portal-kicker"><Inbox size={15}/> Leadinkorg</div>
    <h1 className="portal-title">Era kundärenden på ett ställe.</h1>
    <p className="portal-intro">Se vem som ringde, vad kunden behöver och vad som ska följas upp. Statistiken nedan avser de senaste 30 dagarna.</p>

    {!number?.active && <div className="portal-alert"><PhoneCall size={20}/><p><strong>Tjänsten är pausad.</strong><br/>Nya automatiska SMS skickas inte förrän numret har aktiverats.</p></div>}
    {!number?.email_notifications_enabled && <div className="portal-alert info"><BellRing size={20}/><p><strong>Få nya leads direkt i mejlen.</strong><br/>Aktivera e-postnotiser under <Link href="/portal/settings"><u>Inställningar</u></Link>.</p></div>}
    {number?.demo_mode && <div className="portal-demo-note"><span className="portal-badge demo"><Sparkles size={13}/> Demoläge</span><h2 style={{fontSize:"1.45rem",marginBottom:8}}>Det publika demonumret är aktivt.</h2><p>Samtal till {number.provider_number} använder en fast demotext, sex timmars spärr per uppringare och ett dagligt SMS-tak.</p></div>}

    <section className="portal-stats" aria-label="Översikt senaste 30 dagarna">
      <article className="portal-card portal-stat"><PhoneCall size={19}/><strong>{stats.missed}</strong><span>Missade samtal</span></article>
      <article className="portal-card portal-stat"><MessageSquareText size={19}/><strong>{stats.replies}</strong><span>Kundärenden</span></article>
      <article className="portal-card portal-stat"><Inbox size={19}/><strong>{stats.new}</strong><span>Nya att hantera</span></article>
      <article className="portal-card portal-stat"><Send size={19}/><strong>{stats.deliveryRate}%</strong><span>Levererade av skickade</span></article>
    </section>

    <section className="portal-card portal-panel">
      <div className="portal-toolbar">
        <div><div className="portal-section-label">Leadinkorg</div><h2 style={{marginBottom:0}}>Konversationer {stats.new > 0 && <span className="portal-count">{stats.new}</span>}</h2></div>
        <div className="portal-filters" aria-label="Filtrera ärenden">
          <Link className={`portal-filter ${activeFilter === "all" ? "active" : ""}`} href="/portal">Alla</Link>
          {conversationStatuses.map((status) => <Link key={status} className={`portal-filter ${activeFilter === status ? "active" : ""}`} href={`/portal?status=${status}`}>{statusLabel(status)}</Link>)}
        </div>
      </div>

      {visibleConversations.length === 0 ? <div className="portal-empty"><Inbox size={36}/><h3>Inga ärenden här ännu</h3><p className="portal-muted">Nya kundsvar visas automatiskt när någon svarar på ett Textback-SMS.</p></div> : <div className="portal-table-wrap"><table className="portal-table">
        <thead><tr><th>Senast</th><th>Kund</th><th>Meddelande</th><th>Status</th><th>Ändra</th></tr></thead>
        <tbody>{visibleConversations.map((conversation) => <tr key={conversation.id}>
          <td>{fmt(conversation.last_message_at)}</td>
          <td><Link className="portal-customer-link" href={`/portal/conversations/${conversation.id}`}>{conversation.customer_number}</Link></td>
          <td><div className="portal-preview">{conversation.latest_inbound_preview || "Inget svar ännu"}</div></td>
          <td><StatusBadge status={conversation.status}/></td>
          <td><StatusUpdateForm id={conversation.id} status={conversation.status}/></td>
        </tr>)}</tbody>
      </table></div>}
    </section>
  </div></main>;
}
