import Link from "next/link";
import { requireAdmin } from "@/lib/server/admin-auth";
import { defaultSmsTemplate } from "@/lib/server/admin-company";
import { createCompany } from "../../actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Nytt företag – Textback" };

const input: React.CSSProperties = { width:"100%",padding:"11px 12px",border:"1px solid #cbd5e1",borderRadius:10,fontSize:15,boxSizing:"border-box" };
const label: React.CSSProperties = { display:"grid",gap:7,fontWeight:700 };

export default function NewCompanyPage() {
  requireAdmin();
  return <main style={{minHeight:"100vh",background:"#f4f7fb",color:"#10213f",padding:"32px 16px"}}>
    <div style={{maxWidth:760,margin:"0 auto"}}>
      <Link href="/admin" style={{color:"#1976d2",textDecoration:"none"}}>← Tillbaka till panelen</Link>
      <section style={{marginTop:18,background:"white",border:"1px solid #dbe4ef",borderRadius:18,padding:"clamp(20px,4vw,34px)",boxShadow:"0 10px 30px rgba(16,33,63,.06)"}}>
        <h1 style={{marginTop:0}}>Lägg till företag</h1>
        <p style={{color:"#64748b",lineHeight:1.6}}>Skapa företaget inaktivt tills 46elks-numret, vidarekopplingen och ett verkligt test är verifierade.</p>
        <form action={createCompany} style={{display:"grid",gap:18}}>
          <label style={label}>Företagsnamn<input name="businessName" required minLength={2} maxLength={120} style={input}/></label>
          <label style={label}>Textback-nummer från 46elks<input name="providerNumber" required placeholder="+4670..." style={input}/></label>
          <label style={label}>Företagets ordinarie nummer<textarea name="businessPhoneNumbers" required rows={3} placeholder="Ett nummer per rad, eller separerade med kommatecken" style={input}/></label>
          <label style={label}>SMS-avsändare <span style={{fontWeight:400,color:"#64748b"}}>Lämna tomt för Textback-numret. Alfanumeriskt namn stöds bara där leverantören tillåter det.</span><input name="smsSender" maxLength={20} style={input}/></label>
          <label style={label}>SMS-mall<textarea name="smsTemplate" required rows={6} defaultValue={defaultSmsTemplate} style={input}/><span style={{fontWeight:400,color:"#64748b"}}>Använd <code>{"{{businessName}}"}</code> för företagsnamnet.</span></label>
          <label style={{display:"flex",alignItems:"center",gap:10,fontWeight:700}}><input type="checkbox" name="active"/> Aktivera direkt</label>
          <button style={{border:0,background:"#1976d2",color:"white",borderRadius:10,padding:"12px 16px",fontWeight:800,cursor:"pointer"}}>Skapa företag</button>
        </form>
      </section>
    </div>
  </main>;
}
