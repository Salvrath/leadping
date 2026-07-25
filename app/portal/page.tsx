import Link from "next/link";
import { requireCustomer } from "@/lib/server/customer-auth";
import { getSupabaseAdmin } from "@/lib/server/supabase";
import { logoutCustomer, updateCustomerConversationStatus } from "./actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Kundportal | Textback" };
const fmt=(v?:string|null)=>v?new Intl.DateTimeFormat("sv-SE",{dateStyle:"short",timeStyle:"short"}).format(new Date(v)):"–";
export default async function PortalPage(){
 const user=await requireCustomer(); const number=Array.isArray(user.textback_numbers)?user.textback_numbers[0]:user.textback_numbers; const db=getSupabaseAdmin();
 const [{data:conversations},{data:calls}]=await Promise.all([
  db.from("conversations").select("id,customer_number,status,latest_inbound_preview,last_message_at").eq("textback_number_id",user.textback_number_id).order("last_message_at",{ascending:false}).limit(100),
  db.from("missed_call_events").select("id,status,created_at").eq("textback_number_id",user.textback_number_id).order("created_at",{ascending:false}).limit(500)
 ]);
 const conv=conversations||[], events=calls||[]; const stats={missed:events.length,replies:conv.length,new:conv.filter(x=>x.status==="new").length,delivered:events.filter(x=>x.status==="sms_delivered").length};
 const card:React.CSSProperties={background:"white",border:"1px solid #dbe4ef",borderRadius:16,padding:20};
 return <main style={{minHeight:"100vh",background:"#f4f7fb",color:"#10213f",padding:"24px clamp(16px,4vw,56px) 56px"}}>
  <header style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:20,marginBottom:28}}><div><img src="/textback-logo.svg" alt="Textback" width="180" height="45"/><p style={{margin:"8px 0 0",color:"#64748b"}}>{number?.business_name}</p></div><nav style={{display:"flex",gap:10,alignItems:"center"}}><Link href="/portal/settings">Inställningar</Link><form action={logoutCustomer}><button>Logga ut</button></form></nav></header>
  {!number?.active&&<p style={{background:"#fff7ed",color:"#9a3412",padding:14,borderRadius:12}}>Tjänsten är pausad. Kontakta Textback för aktivering.</p>}
  <section style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(170px,1fr))",gap:16,marginBottom:24}}>{[["Missade samtal",stats.missed],["Kundsvar",stats.replies],["Nya ärenden",stats.new],["Levererade SMS",stats.delivered]].map(([l,v])=><article key={String(l)} style={card}><strong style={{fontSize:30}}>{v}</strong><div style={{color:"#64748b"}}>{l}</div></article>)}</section>
  <section style={{...card,overflowX:"auto"}}><h2 style={{marginTop:0}}>Konversationer</h2><table style={{width:"100%",borderCollapse:"collapse",minWidth:760}}><thead><tr>{["Tid","Kund","Senaste svar","Status","Åtgärd"].map(h=><th key={h} style={{textAlign:"left",padding:9,borderBottom:"1px solid #e2e8f0"}}>{h}</th>)}</tr></thead><tbody>{conv.map(c=><tr key={c.id}><td style={{padding:9}}>{fmt(c.last_message_at)}</td><td style={{padding:9}}><Link href={`/portal/conversations/${c.id}`}>{c.customer_number}</Link></td><td style={{padding:9}}>{c.latest_inbound_preview||"–"}</td><td style={{padding:9}}>{c.status}</td><td style={{padding:9}}><form action={updateCustomerConversationStatus}><input type="hidden" name="id" value={c.id}/><select name="status" defaultValue={c.status}>{["new","open","contacted","closed"].map(s=><option key={s}>{s}</option>)}</select> <button>Spara</button></form></td></tr>)}</tbody></table></section>
 </main>;
}
