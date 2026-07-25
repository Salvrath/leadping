import Link from "next/link";
import { requireAdmin } from "@/lib/server/admin-auth";
import { getSupabaseAdmin } from "@/lib/server/supabase";
import { logoutAdmin, setTextbackNumberActive, updateConversationStatus } from "./actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Textback internpanel" };

function date(value?: string | null) {
  return value ? new Intl.DateTimeFormat("sv-SE", { dateStyle: "short", timeStyle: "short" }).format(new Date(value)) : "–";
}

export default async function AdminPage() {
  requireAdmin();
  const db = getSupabaseAdmin();
  const [{ data: numbers }, { data: conversations }, { data: calls }, { count: openIncidents }] = await Promise.all([
    db.from("textback_numbers").select("id,business_name,provider_number,business_phone_numbers,active,provider,updated_at").order("business_name"),
    db.from("conversations").select("id,customer_number,status,latest_inbound_preview,last_message_at,textback_numbers(business_name,provider_number)").order("last_message_at", { ascending: false }).limit(50),
    db.from("missed_call_events").select("id,status,reason,caller_number,created_at,sms_delivered_at,textback_numbers(business_name)").order("created_at", { ascending: false }).limit(50),
    db.from("operational_incidents").select("id", { count: "exact", head: true }).is("resolved_at", null),
  ]);

  const allCalls = calls || [];
  const stats = {
    activeNumbers: (numbers || []).filter((item) => item.active).length,
    newConversations: (conversations || []).filter((item) => item.status === "new").length,
    delivered: allCalls.filter((item) => item.status === "sms_delivered").length,
    failures: openIncidents || 0,
  };

  const panel: React.CSSProperties = { background:"white",border:"1px solid #dbe4ef",borderRadius:16,padding:20,boxShadow:"0 8px 24px rgba(16,33,63,.05)" };
  const pill = (status:string): React.CSSProperties => ({display:"inline-block",padding:"4px 9px",borderRadius:999,fontSize:12,fontWeight:700,background:status.includes("fail")||status.includes("dead")?"#fff1f2":status==="new"?"#e0f2fe":"#eef2ff",color:status.includes("fail")||status.includes("dead")?"#9f1239":"#1e3a8a"});

  return <main style={{minHeight:"100vh",background:"#f4f7fb",color:"#10213f",padding:"24px clamp(16px,4vw,56px) 56px"}}>
    <header style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:20,marginBottom:28,flexWrap:"wrap"}}>
      <div><img src="/textback-logo.svg" alt="Textback" width="180" height="45"/><p style={{margin:"8px 0 0",color:"#64748b"}}>Intern driftpanel</p></div>
      <div style={{display:"flex",gap:10,alignItems:"center",flexWrap:"wrap"}}><Link href="/admin/audit" style={{border:"1px solid #cbd5e1",background:"white",color:"#10213f",padding:"10px 14px",borderRadius:10,textDecoration:"none",fontWeight:800}}>Revisionslogg</Link><Link href="/admin/operations" style={{border:"1px solid #cbd5e1",background:"white",color:"#10213f",padding:"10px 14px",borderRadius:10,textDecoration:"none",fontWeight:800}}>Driftövervakning{openIncidents ? ` (${openIncidents})` : ""}</Link><Link href="/admin/companies/new" style={{background:"#1976d2",color:"white",padding:"10px 14px",borderRadius:10,textDecoration:"none",fontWeight:800}}>Lägg till företag</Link><form action={logoutAdmin}><button style={{border:"1px solid #cbd5e1",background:"white",padding:"10px 14px",borderRadius:10,cursor:"pointer"}}>Logga ut</button></form></div>
    </header>

    <section style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(180px,1fr))",gap:16,marginBottom:24}}>
      {[["Aktiva företag",stats.activeNumbers],["Nya konversationer",stats.newConversations],["Levererade SMS",stats.delivered],["Fel kräver åtgärd",stats.failures]].map(([label,value])=><article key={String(label)} style={panel}><div style={{fontSize:30,fontWeight:800}}>{value}</div><div style={{color:"#64748b",marginTop:4}}>{label}</div></article>)}
    </section>

    <section style={{...panel,marginBottom:24,overflowX:"auto"}}>
      <h2 style={{marginTop:0}}>Företag och nummer</h2>
      <table style={{width:"100%",borderCollapse:"collapse",minWidth:780}}><thead><tr>{["Företag","Textback-nummer","Ordinarie nummer","Leverantör","Status","Åtgärd"].map(h=><th key={h} style={{textAlign:"left",padding:"10px 8px",borderBottom:"1px solid #e2e8f0",fontSize:13,color:"#64748b"}}>{h}</th>)}</tr></thead><tbody>
        {(numbers || []).map(number=><tr key={number.id}><td style={{padding:8,fontWeight:700}}><Link href={`/admin/companies/${number.id}`} style={{color:"#1976d2",textDecoration:"none"}}>{number.business_name}</Link></td><td style={{padding:8}}>{number.provider_number}</td><td style={{padding:8}}>{number.business_phone_numbers?.join(", ") || "–"}</td><td style={{padding:8}}>{number.provider}</td><td style={{padding:8}}><span style={pill(number.active?"active":"inactive")}>{number.active?"Aktiv":"Pausad"}</span></td><td style={{padding:8}}><div style={{display:"flex",gap:7}}><Link href={`/admin/companies/${number.id}`} style={{border:"1px solid #cbd5e1",background:"white",borderRadius:8,padding:"7px 10px",textDecoration:"none",color:"#10213f"}}>Redigera</Link><form action={setTextbackNumberActive}><input type="hidden" name="id" value={number.id}/><input type="hidden" name="active" value={String(!number.active)}/><button style={{border:"1px solid #cbd5e1",background:"white",borderRadius:8,padding:"7px 10px",cursor:"pointer"}}>{number.active?"Pausa":"Aktivera"}</button></form></div></td></tr>)}
      </tbody></table>
    </section>

    <section style={{...panel,marginBottom:24,overflowX:"auto"}}>
      <h2 style={{marginTop:0}}>Senaste konversationer</h2>
      <table style={{width:"100%",borderCollapse:"collapse",minWidth:760}}><thead><tr>{["Tid","Företag","Kund","Senaste svar","Status","Åtgärd"].map(h=><th key={h} style={{textAlign:"left",padding:"10px 8px",borderBottom:"1px solid #e2e8f0",fontSize:13,color:"#64748b"}}>{h}</th>)}</tr></thead><tbody>
        {(conversations || []).map((conversation:any)=>{const company=Array.isArray(conversation.textback_numbers)?conversation.textback_numbers[0]:conversation.textback_numbers;return <tr key={conversation.id}><td style={{padding:8,whiteSpace:"nowrap"}}>{date(conversation.last_message_at)}</td><td style={{padding:8,fontWeight:700}}>{company?.business_name || "Okänt"}</td><td style={{padding:8}}><Link href={`/admin/conversations/${conversation.id}`} style={{color:"#1976d2"}}>{conversation.customer_number}</Link></td><td style={{padding:8,maxWidth:360,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{conversation.latest_inbound_preview || "–"}</td><td style={{padding:8}}><span style={pill(conversation.status)}>{conversation.status}</span></td><td style={{padding:8}}><form action={updateConversationStatus} style={{display:"flex",gap:6}}><input type="hidden" name="id" value={conversation.id}/><select name="status" defaultValue={conversation.status} style={{padding:7,border:"1px solid #cbd5e1",borderRadius:8}}>{["new","open","contacted","closed","blocked"].map(s=><option key={s}>{s}</option>)}</select><button style={{border:0,background:"#1976d2",color:"white",borderRadius:8,padding:"7px 10px",cursor:"pointer"}}>Spara</button></form></td></tr>})}
      </tbody></table>
    </section>

    <section style={{...panel,overflowX:"auto"}}>
      <h2 style={{marginTop:0}}>Telefoni och leverans</h2>
      <table style={{width:"100%",borderCollapse:"collapse",minWidth:700}}><thead><tr>{["Tid","Företag","Uppringare","Status","Orsak","Levererad"].map(h=><th key={h} style={{textAlign:"left",padding:"10px 8px",borderBottom:"1px solid #e2e8f0",fontSize:13,color:"#64748b"}}>{h}</th>)}</tr></thead><tbody>
        {allCalls.map((call:any)=>{const company=Array.isArray(call.textback_numbers)?call.textback_numbers[0]:call.textback_numbers;return <tr key={call.id}><td style={{padding:8,whiteSpace:"nowrap"}}>{date(call.created_at)}</td><td style={{padding:8,fontWeight:700}}>{company?.business_name || "Okänt"}</td><td style={{padding:8}}>{call.caller_number || "Dolt nummer"}</td><td style={{padding:8}}><span style={pill(call.status)}>{call.status}</span></td><td style={{padding:8}}>{call.reason || "–"}</td><td style={{padding:8}}>{date(call.sms_delivered_at)}</td></tr>})}
      </tbody></table>
    </section>
  </main>;
}
