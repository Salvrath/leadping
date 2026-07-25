import Link from "next/link";
import { requireAdmin } from "@/lib/server/admin-auth";
import { getSupabaseAdmin } from "@/lib/server/supabase";
import { createPrivacyRequest, runRetentionNow, updatePrivacyRequest } from "./actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Dataskydd – Textback" };

const panel: React.CSSProperties = { background:"white",border:"1px solid #dbe4ef",borderRadius:16,padding:20,boxShadow:"0 8px 24px rgba(16,33,63,.05)" };
const input: React.CSSProperties = { width:"100%",padding:10,border:"1px solid #cbd5e1",borderRadius:8,boxSizing:"border-box" };
function date(value?: string | null) { return value ? new Intl.DateTimeFormat("sv-SE", { dateStyle:"short", timeStyle:"short" }).format(new Date(value)) : "–"; }

export default async function DataPage() {
  requireAdmin();
  const db = getSupabaseAdmin();
  const [{ data: companies }, { data: requests }, { data: runs }] = await Promise.all([
    db.from("textback_numbers").select("id,business_name").order("business_name"),
    db.from("privacy_requests").select("id,request_type,status,subject_phone,subject_email,requester_name,notes,due_at,completed_at,created_at,textback_numbers(business_name)").order("created_at", { ascending:false }).limit(100),
    db.from("data_retention_runs").select("id,status,started_at,completed_at,deleted_counts,error_code").order("started_at", { ascending:false }).limit(20),
  ]);

  return <main style={{minHeight:"100vh",background:"#f4f7fb",color:"#10213f",padding:"24px clamp(16px,4vw,56px) 56px"}}>
    <header style={{display:"flex",justifyContent:"space-between",gap:16,alignItems:"center",flexWrap:"wrap",marginBottom:24}}>
      <div><h1 style={{margin:0}}>Dataskydd och retention</h1><p style={{color:"#64748b"}}>Hantering av registrerades rättigheter och automatisk gallring.</p></div>
      <Link href="/admin" style={{color:"#1976d2"}}>Till internpanelen</Link>
    </header>

    <section style={{...panel,marginBottom:24}}>
      <h2 style={{marginTop:0}}>Retentionregler</h2>
      <p style={{lineHeight:1.6}}>Rate-limit-data: 2 dagar. Stripe-webhookjournal: 180 dagar. Lösta driftincidenter: 365 dagar. Revisionslogg: 730 dagar. Kundkonversationer och SMS gallras inte automatiskt eftersom de kan utgöra affärsdokumentation; de hanteras genom ett verifierat integritetsärende.</p>
      <form action={runRetentionNow}><button style={{border:0,background:"#1976d2",color:"white",padding:"10px 14px",borderRadius:9,cursor:"pointer",fontWeight:700}}>Kör gallring nu</button></form>
    </section>

    <section style={{...panel,marginBottom:24}}>
      <h2 style={{marginTop:0}}>Registrera integritetsärende</h2>
      <form action={createPrivacyRequest} style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(220px,1fr))",gap:14}}>
        <label>Typ<select name="request_type" required style={input}><option value="access">Registerutdrag</option><option value="correction">Rättelse</option><option value="deletion">Radering</option><option value="restriction">Begränsning</option><option value="objection">Invändning</option><option value="portability">Dataportabilitet</option></select></label>
        <label>Företag<select name="textback_number_id" style={input}><option value="">Ej fastställt</option>{(companies||[]).map(c=><option key={c.id} value={c.id}>{c.business_name}</option>)}</select></label>
        <label>Telefon<input name="subject_phone" style={input}/></label>
        <label>E-post<input type="email" name="subject_email" style={input}/></label>
        <label>Namn<input name="requester_name" style={input}/></label>
        <label style={{gridColumn:"1 / -1"}}>Anteckningar<textarea name="notes" maxLength={4000} rows={4} style={input}/></label>
        <button style={{border:0,background:"#1976d2",color:"white",padding:"11px 14px",borderRadius:9,cursor:"pointer",fontWeight:700}}>Skapa ärende</button>
      </form>
    </section>

    <section style={{...panel,marginBottom:24,overflowX:"auto"}}>
      <h2 style={{marginTop:0}}>Integritetsärenden</h2>
      <table style={{width:"100%",borderCollapse:"collapse",minWidth:950}}><thead><tr>{["Skapad","Företag","Typ","Registrerad","Förfaller","Status","Åtgärd"].map(h=><th key={h} style={{textAlign:"left",padding:8,borderBottom:"1px solid #e2e8f0",color:"#64748b"}}>{h}</th>)}</tr></thead><tbody>
        {(requests||[]).map((r:any)=>{const company=Array.isArray(r.textback_numbers)?r.textback_numbers[0]:r.textback_numbers;return <tr key={r.id}><td style={{padding:8}}>{date(r.created_at)}</td><td style={{padding:8}}>{company?.business_name||"–"}</td><td style={{padding:8}}>{r.request_type}</td><td style={{padding:8}}>{r.subject_email||r.subject_phone||"–"}</td><td style={{padding:8}}>{date(r.due_at)}</td><td style={{padding:8}}>{r.status}</td><td style={{padding:8}}><form action={updatePrivacyRequest} style={{display:"flex",gap:6,alignItems:"center"}}><input type="hidden" name="id" value={r.id}/><input type="hidden" name="notes" value={r.notes||""}/><select name="status" defaultValue={r.status} style={{padding:7,border:"1px solid #cbd5e1",borderRadius:8}}>{["open","identity_verification","in_progress","completed","rejected"].map(s=><option key={s}>{s}</option>)}</select><button style={{padding:"7px 10px",borderRadius:8,border:"1px solid #cbd5e1",background:"white"}}>Spara</button></form></td></tr>})}
      </tbody></table>
    </section>

    <section style={{...panel,overflowX:"auto"}}><h2 style={{marginTop:0}}>Senaste gallringar</h2><table style={{width:"100%",borderCollapse:"collapse",minWidth:700}}><thead><tr>{["Start","Slut","Status","Raderat","Fel"].map(h=><th key={h} style={{textAlign:"left",padding:8,borderBottom:"1px solid #e2e8f0",color:"#64748b"}}>{h}</th>)}</tr></thead><tbody>{(runs||[]).map((r:any)=><tr key={r.id}><td style={{padding:8}}>{date(r.started_at)}</td><td style={{padding:8}}>{date(r.completed_at)}</td><td style={{padding:8}}>{r.status}</td><td style={{padding:8}}><code>{JSON.stringify(r.deleted_counts)}</code></td><td style={{padding:8}}>{r.error_code||"–"}</td></tr>)}</tbody></table></section>
  </main>;
}
