import Link from "next/link";
import { requireAdmin } from "@/lib/server/admin-auth";
import { getSupabaseAdmin } from "@/lib/server/supabase";

export const dynamic = "force-dynamic";
export const metadata = { title: "Revisionslogg – Textback" };

const fmt = (value: string) => new Intl.DateTimeFormat("sv-SE", { dateStyle: "short", timeStyle: "medium" }).format(new Date(value));

export default async function AuditPage() {
  requireAdmin();
  const { data, error } = await getSupabaseAdmin().from("audit_events")
    .select("id,actor_type,actor_id,action,target_type,target_id,metadata,created_at")
    .order("created_at", { ascending: false }).limit(250);
  if (error) throw new Error("AUDIT_LOG_LOAD_FAILED");

  return <main style={{minHeight:"100vh",background:"#f4f7fb",color:"#10213f",padding:"28px 16px 56px"}}>
    <div style={{maxWidth:1200,margin:"0 auto",display:"grid",gap:18}}>
      <Link href="/admin" style={{color:"#1976d2",textDecoration:"none"}}>← Tillbaka till panelen</Link>
      <section style={{background:"white",border:"1px solid #dbe4ef",borderRadius:18,padding:"clamp(20px,4vw,32px)",boxShadow:"0 10px 30px rgba(16,33,63,.06)",overflowX:"auto"}}>
        <h1 style={{marginTop:0}}>Revisionslogg</h1>
        <p style={{color:"#64748b"}}>De 250 senaste säkerhets- och ändringshändelserna. Lösenord och hemligheter lagras aldrig här.</p>
        <table style={{width:"100%",borderCollapse:"collapse",minWidth:980}}>
          <thead><tr>{["Tid","Aktör","Händelse","Mål","Metadata"].map(h=><th key={h} style={{textAlign:"left",padding:"10px 8px",borderBottom:"1px solid #e2e8f0",fontSize:13,color:"#64748b"}}>{h}</th>)}</tr></thead>
          <tbody>{(data || []).map((event:any)=><tr key={event.id}>
            <td style={{padding:8,whiteSpace:"nowrap"}}>{fmt(event.created_at)}</td>
            <td style={{padding:8}}><strong>{event.actor_type}</strong>{event.actor_id ? <div style={{fontSize:12,color:"#64748b"}}>{event.actor_id}</div> : null}</td>
            <td style={{padding:8,fontWeight:700}}>{event.action}</td>
            <td style={{padding:8}}>{event.target_type}<div style={{fontSize:12,color:"#64748b"}}>{event.target_id || "–"}</div></td>
            <td style={{padding:8,maxWidth:420,fontFamily:"ui-monospace,monospace",fontSize:12,whiteSpace:"pre-wrap",wordBreak:"break-word"}}>{JSON.stringify(event.metadata || {})}</td>
          </tr>)}</tbody>
        </table>
      </section>
    </div>
  </main>;
}
