import Link from "next/link";
import { randomUUID } from "node:crypto";
import { notFound } from "next/navigation";
import { requireCustomer } from "@/lib/server/customer-auth";
import { getSupabaseAdmin } from "@/lib/server/supabase";
import { getSmsMode } from "@/lib/server/telephony/elks";
import { sendCustomerReply, updateCustomerConversationStatus } from "../../actions";

export const dynamic = "force-dynamic";
const fmt = (v?: string | null) => v ? new Intl.DateTimeFormat("sv-SE", { dateStyle: "medium", timeStyle: "short" }).format(new Date(v)) : "–";

export default async function ConversationPage({ params, searchParams }: { params: { id: string }; searchParams: { error?: string } }) {
  const user = await requireCustomer();
  const db = getSupabaseAdmin();
  const { data: conversation } = await db.from("conversations")
    .select("id,customer_number,status,last_message_at,textback_numbers(active,business_name)")
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

  return <main style={{ minHeight: "100vh", background: "#f4f7fb", padding: "28px clamp(16px,5vw,72px)", color: "#10213f" }}>
    <Link href="/portal">← Tillbaka</Link>
    <section style={{ maxWidth: 860, margin: "24px auto", background: "white", border: "1px solid #dbe4ef", borderRadius: 18, padding: 24 }}>
      <header style={{ display: "flex", justifyContent: "space-between", gap: 20, alignItems: "start", flexWrap: "wrap" }}>
        <div><h1 style={{ marginTop: 0 }}>{conversation.customer_number}</h1><p style={{ color: "#64748b" }}>Senast aktiv {fmt(conversation.last_message_at)}</p></div>
        <form action={updateCustomerConversationStatus}><input type="hidden" name="id" value={conversation.id} /><select name="status" defaultValue={conversation.status}>{["new", "open", "contacted", "closed"].map(s => <option key={s}>{s}</option>)}</select> <button>Spara</button></form>
      </header>

      {rateLimited && <p role="alert" style={{background:"#fff7ed",color:"#9a3412",padding:12,borderRadius:10,lineHeight:1.5}}>För många SMS-försök på kort tid. Vänta fem minuter innan du försöker igen.</p>}
      {testMode && <p style={{background:"#eff6ff",color:"#1e3a8a",padding:12,borderRadius:10,lineHeight:1.5}}>Testläge är aktivt. Svaret skickas som 46elks dry-run och når inte kundens telefon.</p>}

      <div style={{ display: "grid", gap: 12, marginTop: 28 }}>
        {(messages || []).map(m => <article key={m.id} style={{ maxWidth: "78%", justifySelf: m.direction === "inbound" ? "start" : "end", background: m.direction === "inbound" ? "#f1f5f9" : "#dbeafe", padding: "12px 15px", borderRadius: 14 }}>
          <div style={{ whiteSpace: "pre-wrap" }}>{m.body}</div>
          <small style={{ display: "block", marginTop: 7, color: m.delivery_status === "failed" ? "#b91c1c" : "#64748b" }}>{fmt(m.created_at)} · {m.delivery_status || m.direction}{m.failure_reason ? ` · ${m.failure_reason}` : ""}</small>
        </article>)}
      </div>

      <form action={sendCustomerReply} style={{ marginTop: 28, borderTop: "1px solid #e2e8f0", paddingTop: 20 }}>
        <input type="hidden" name="conversation_id" value={conversation.id} />
        <input type="hidden" name="request_id" value={requestId} />
        <label htmlFor="message" style={{ display: "block", fontWeight: 800, marginBottom: 8 }}>{testMode ? "Testa svar via SMS" : "Svara via SMS"}</label>
        <textarea id="message" name="message" required maxLength={1600} rows={5} disabled={!canSend} placeholder="Skriv ditt svar..." style={{ width: "100%", boxSizing: "border-box", border: "1px solid #cbd5e1", borderRadius: 12, padding: 12, resize: "vertical" }} />
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", marginTop: 10 }}>
          <small style={{ color: "#64748b" }}>{testMode ? "Testet verifierar 46elks utan att leverera ett riktigt SMS." : number?.active ? "Svaret skickas från företagets Textback-nummer." : "Tjänsten är pausad och live-läge är aktivt."}</small>
          <button disabled={!canSend} style={{ border: 0, background: canSend ? "#1976d2" : "#94a3b8", color: "white", borderRadius: 10, padding: "10px 16px", fontWeight: 800, cursor: canSend ? "pointer" : "not-allowed" }}>{testMode ? "Kör SMS-test" : "Skicka SMS"}</button>
        </div>
      </form>
    </section>
  </main>;
}
