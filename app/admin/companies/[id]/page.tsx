import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/server/admin-auth";
import { getSupabaseAdmin } from "@/lib/server/supabase";
import { updateCompany } from "../../actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Redigera företag – Textback" };

const input: React.CSSProperties = { width:"100%",padding:"11px 12px",border:"1px solid #cbd5e1",borderRadius:10,fontSize:15,boxSizing:"border-box" };
const label: React.CSSProperties = { display:"grid",gap:7,fontWeight:700 };

export default async function CompanyPage({ params }: { params: { id: string } }) {
  requireAdmin();
  const { data: company, error } = await getSupabaseAdmin().from("textback_numbers")
    .select("id,business_name,provider_number,business_phone_numbers,sms_sender,sms_template,active,provider,created_at,updated_at")
    .eq("id", params.id).maybeSingle();
  if (error || !company) notFound();

  return <main style={{minHeight:"100vh",background:"#f4f7fb",color:"#10213f",padding:"32px 16px"}}>
    <div style={{maxWidth:760,margin:"0 auto"}}>
      <Link href="/admin" style={{color:"#1976d2",textDecoration:"none"}}>← Tillbaka till panelen</Link>
      <section style={{marginTop:18,background:"white",border:"1px solid #dbe4ef",borderRadius:18,padding:"clamp(20px,4vw,34px)",boxShadow:"0 10px 30px rgba(16,33,63,.06)"}}>
        <div style={{display:"flex",justifyContent:"space-between",gap:16,alignItems:"start",flexWrap:"wrap"}}>
          <div><h1 style={{margin:"0 0 6px"}}>{company.business_name}</h1><p style={{margin:0,color:"#64748b"}}>Leverantör: {company.provider}</p></div>
          <span style={{padding:"6px 10px",borderRadius:999,fontWeight:800,fontSize:13,background:company.active?"#dcfce7":"#f1f5f9",color:company.active?"#166534":"#475569"}}>{company.active?"Aktiv":"Pausad"}</span>
        </div>
        <form action={updateCompany} style={{display:"grid",gap:18,marginTop:26}}>
          <input type="hidden" name="id" value={company.id}/>
          <label style={label}>Företagsnamn<input name="businessName" required minLength={2} maxLength={120} defaultValue={company.business_name} style={input}/></label>
          <label style={label}>Textback-nummer från 46elks<input name="providerNumber" required defaultValue={company.provider_number} style={input}/></label>
          <label style={label}>Företagets ordinarie nummer<textarea name="businessPhoneNumbers" required rows={3} defaultValue={(company.business_phone_numbers || []).join("\n")} style={input}/></label>
          <label style={label}>SMS-avsändare<input name="smsSender" maxLength={20} defaultValue={company.sms_sender || ""} style={input}/></label>
          <label style={label}>SMS-mall<textarea name="smsTemplate" required rows={6} defaultValue={company.sms_template} style={input}/><span style={{fontWeight:400,color:"#64748b"}}>Använd <code>{"{{businessName}}"}</code> för företagsnamnet.</span></label>
          <label style={{display:"flex",alignItems:"center",gap:10,fontWeight:700}}><input type="checkbox" name="active" defaultChecked={company.active}/> Tjänsten är aktiv</label>
          <button style={{border:0,background:"#1976d2",color:"white",borderRadius:10,padding:"12px 16px",fontWeight:800,cursor:"pointer"}}>Spara ändringar</button>
        </form>
      </section>
    </div>
  </main>;
}
