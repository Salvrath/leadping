import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/server/admin-auth";
import { getSupabaseAdmin } from "@/lib/server/supabase";
import { updateConversationStatus } from "../../actions";

export const dynamic = "force-dynamic";

function date(value?: string | null) {
  return value ? new Intl.DateTimeFormat("sv-SE", { dateStyle:"medium", timeStyle:"short" }).format(new Date(value)) : "–";
}

export default async function ConversationPage({ params }: { params: { id: string } }) {
  requireAdmin();
  const db = getSupabaseAdmin();
  const { data: conversation } = await db.from("conversations").select("id,customer_number,status,last_message_at,textback_numbers(business_name,provider_number)").eq("id", params.id).maybeSingle();
  if (!conversation) notFound();
  const { data: messages } = await db.from("sms_messages").select("id,direction,sender_number,recipient_number,body,delivery_status,created_at,provider_created_at").eq("conversation_id", params.id).order("created_at", { ascending:true });
  const company = Array.isArray(conversation.textback_numbers) ? conversation.textback_numbers[0] : conversation.textback_numbers;

  return <main style={{minHeight:"100vh",background:"#f4f7fb",color:"#10213f",padding:"24px clamp(16px,4vw,56px) 56px"}}>
    <Link href="/admin" style={{color:"#1976d2",textDecoration:"none"}}>← Till översikten</Link>
    <header style={{display:"flex",justifyContent:"space-between",alignItems:"end",gap:20,margin:"22px 0"}}>
      <div><h1 style={{margin:"0 0 6px"}}>{company?.business_name || "Konversation"}</h1><p style={{margin:0,color:"#64748b"}}>{conversation.customer_number} · senast {date(conversation.last_message_at)}</p></div>
      <form action={updateConversationStatus} style={{display:"flex",gap:8}}><input type="hidden" name="id" value={conversation.id}/><select name="status" defaultValue={conversation.status} style={{padding:10,border:"1px solid #cbd5e1",borderRadius:9}}>{['new','open','contacted','closed','blocked'].map(s=><option key={s}>{s}</option>)}</select><button style={{border:0,background:"#1976d2",color:"white",borderRadius:9,padding:"10px 14px",fontWeight:700}}>Spara</button></form>
    </header>
    <section style={{maxWidth:820,background:"white",border:"1px solid #dbe4ef",borderRadius:18,padding:24,display:"grid",gap:14}}>
      {(messages || []).length === 0 && <p style={{color:"#64748b"}}>Inga meddelanden ännu.</p>}
      {(messages || []).map(message => {
        const inbound = message.direction === "inbound";
        return <article key={message.id} style={{justifySelf:inbound?"start":"end",maxWidth:"78%",background:inbound?"#f1f5f9":"#dbeafe",borderRadius:14,padding:"12px 14px"}}>
          <div style={{whiteSpace:"pre-wrap",lineHeight:1.5}}>{message.body}</div>
          <div style={{fontSize:12,color:"#64748b",marginTop:7}}>{inbound?"Kund":"Textback"} · {date(message.provider_created_at || message.created_at)}{message.delivery_status?` · ${message.delivery_status}`:""}</div>
        </article>;
      })}
    </section>
  </main>;
}
