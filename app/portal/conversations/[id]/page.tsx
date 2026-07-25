import Link from "next/link";
import { notFound } from "next/navigation";
import { requireCustomer } from "@/lib/server/customer-auth";
import { getSupabaseAdmin } from "@/lib/server/supabase";
import { updateCustomerConversationStatus } from "../../actions";

export const dynamic="force-dynamic";
const fmt=(v?:string|null)=>v?new Intl.DateTimeFormat("sv-SE",{dateStyle:"medium",timeStyle:"short"}).format(new Date(v)):"–";
export default async function ConversationPage({params}:{params:{id:string}}){
 const user=await requireCustomer(); const db=getSupabaseAdmin();
 const {data:conversation}=await db.from("conversations").select("id,customer_number,status,last_message_at").eq("id",params.id).eq("textback_number_id",user.textback_number_id).maybeSingle();
 if(!conversation) notFound();
 const {data:messages}=await db.from("sms_messages").select("id,direction,body,delivery_status,created_at").eq("conversation_id",conversation.id).eq("textback_number_id",user.textback_number_id).order("created_at");
 return <main style={{minHeight:"100vh",background:"#f4f7fb",padding:"28px clamp(16px,5vw,72px)",color:"#10213f"}}><Link href="/portal">← Tillbaka</Link><section style={{maxWidth:860,margin:"24px auto",background:"white",border:"1px solid #dbe4ef",borderRadius:18,padding:24}}><header style={{display:"flex",justifyContent:"space-between",gap:20,alignItems:"start"}}><div><h1 style={{marginTop:0}}>{conversation.customer_number}</h1><p style={{color:"#64748b"}}>Senast aktiv {fmt(conversation.last_message_at)}</p></div><form action={updateCustomerConversationStatus}><input type="hidden" name="id" value={conversation.id}/><select name="status" defaultValue={conversation.status}>{["new","open","contacted","closed"].map(s=><option key={s}>{s}</option>)}</select> <button>Spara</button></form></header><div style={{display:"grid",gap:12,marginTop:28}}>{(messages||[]).map(m=><article key={m.id} style={{maxWidth:"78%",justifySelf:m.direction==="inbound"?"start":"end",background:m.direction==="inbound"?"#f1f5f9":"#dbeafe",padding:"12px 15px",borderRadius:14}}><div style={{whiteSpace:"pre-wrap"}}>{m.body}</div><small style={{display:"block",marginTop:7,color:"#64748b"}}>{fmt(m.created_at)} · {m.delivery_status||m.direction}</small></article>)}</div></section></main>;
}
