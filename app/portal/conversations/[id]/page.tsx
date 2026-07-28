import Link from "next/link";
import { randomUUID } from "node:crypto";
import { notFound } from "next/navigation";
import { MessageSquareText, Phone, Send } from "lucide-react";
import { requireCustomer } from "@/lib/server/customer-auth";
import { getSupabaseAdmin } from "@/lib/server/supabase";
import { getSmsMode } from "@/lib/server/telephony/elks";
import { PortalHeader, StatusBadge, conversationStatuses, statusLabel } from "@/components/portal-ui";
import { sendCustomerReply, updateCustomerConversationStatus } from "../../actions";

export const dynamic = "force-dynamic";
const fmt = (value?: string | null) => value ? new Intl.DateTimeFormat("sv-SE", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value)) : "–";

export default async function ConversationPage({ params, searchParams }: { params: { id: string }; searchParams: { error?: string } }) {
  const user = await requireCustomer();
  const db = getSupabaseAdmin();
  const { data: conversation } = await db.from("conversations")
    .select("id,customer_number,status,last_message_at,textback_numbers(active,business_name,demo_mode,email_notifications_enabled)")
    .eq("id", params.id).eq("textback_number_id", user.textback_number_id).maybeSingle();
  if (!conversation) notFound();
  const number = Array.isArray(conversation.textback_numbers) ? conversation.textback_numbers[0] : conversation.textback_numbers;
  const { data: messages } = await db.from("sms_messages")
    .select("id,direction,body,delivery_status,failure_reason,created_at,sent_at,delivered_at")
    .eq("conversation_id", conversation.id).eq("textback_number_id", user.textback_number_id).order("created_at");
  const requestId = randomUUID();
  const rateLimited = searchParams.error === "rate-limit";
  const smsMode = getSmsMode();
  const testMode = !number?.active && smsMode !== "live";
  const canSend = Boolean(number?.active || testMode);

  return <main className="portal-page"><div className="portal-wrap">
    <PortalHeader businessName={number?.business_name} demoMode={number?.demo_mode} notificationsEnabled={number?.email_notifications_enabled}/>
    <Link className="portal-back" href="/portal">← Till leadinkorgen</Link>

    <section className="portal-card portal-panel">
      <header className="portal-chat-head">
        <div><div className="portal-kicker"><MessageSquareText size={15}/> Kundärende</div><h1 className="portal-title" style={{fontSize:"2.3rem"}}>{conversation.customer_number}</h1><p className="portal-muted">Senast aktiv {fmt(conversation.last_message_at)}</p></div>
        <div className="portal-chat-actions">
          <StatusBadge status={conversation.status}/>
          <a className="portal-button" href={`tel:${conversation.customer_number}`}><Phone size={16}/> Ring kunden</a>
          <form className="portal-status-form" action={updateCustomerConversationStatus}><input type="hidden" name="id" value={conversation.id}/><select name="status" defaultValue={conversation.status}>{conversationStatuses.map((status) => <option value={status} key={status}>{statusLabel(status)}</option>)}</select><button>Spara</button></form>
        </div>
      </header>

      {rateLimited && <div className="portal-alert"><p><strong>För många SMS-försök.</strong><br/>Vänta fem minuter innan du försöker igen.</p></div>}
      {testMode && <div className="portal-alert info"><p><strong>Testläge är aktivt.</strong><br/>Svaret körs som 46elks dry-run och når inte kundens telefon.</p></div>}

      <div className="portal-messages" aria-label="Meddelanden">
        {(messages || []).length === 0 && <div className="portal-empty"><MessageSquareText size={34}/><h3>Inga meddelanden ännu</h3></div>}
        {(messages || []).map((message) => <article key={message.id} className={`portal-message ${message.direction}`}>
          <p>{message.body}</p>
          <small>{fmt(message.created_at)} · {message.delivery_status || (message.direction === "inbound" ? "Mottaget" : "Skickat")}{message.failure_reason ? ` · ${message.failure_reason}` : ""}</small>
        </article>)}
      </div>

      <form action={sendCustomerReply} className="portal-reply">
        <input type="hidden" name="conversation_id" value={conversation.id}/>
        <input type="hidden" name="request_id" value={requestId}/>
        <label htmlFor="message" className="portal-field">{testMode ? "Testa svar via SMS" : "Svara kunden via SMS"}
          <textarea id="message" name="message" required maxLength={1600} disabled={!canSend} placeholder="Skriv ett kort och tydligt svar..."/>
        </label>
        <div className="portal-reply-footer">
          <small className="portal-muted">{testMode ? "Testet verifierar 46elks utan att leverera ett riktigt SMS." : number?.active ? "Svaret skickas från företagets Textback-nummer." : "Tjänsten är pausad och kan inte skicka live-SMS."}</small>
          <button className="portal-button primary" disabled={!canSend}><Send size={16}/>{testMode ? "Kör SMS-test" : "Skicka SMS"}</button>
        </div>
      </form>
    </section>
  </div></main>;
}
