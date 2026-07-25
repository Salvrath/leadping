import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/server/admin-auth";
import { activationReadiness, activationStepFields, activationStepLabels } from "@/lib/server/company-activation";
import { getSupabaseAdmin } from "@/lib/server/supabase";
import { saveCompanyActivationNotes, setCompanyActivationStep, setTextbackNumberActive, updateCompany } from "../../actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Redigera företag – Textback" };

const input: React.CSSProperties = { width:"100%",padding:"11px 12px",border:"1px solid #cbd5e1",borderRadius:10,fontSize:15,boxSizing:"border-box" };
const label: React.CSSProperties = { display:"grid",gap:7,fontWeight:700 };
const panel: React.CSSProperties = { background:"white",border:"1px solid #dbe4ef",borderRadius:18,padding:"clamp(20px,4vw,34px)",boxShadow:"0 10px 30px rgba(16,33,63,.06)" };
const fmt = (value?: string | null) => value ? new Intl.DateTimeFormat("sv-SE", { dateStyle:"medium", timeStyle:"short" }).format(new Date(value)) : "Inte verifierad";

export default async function CompanyPage({ params }: { params: { id: string } }) {
  requireAdmin();
  const { data: company, error } = await getSupabaseAdmin().from("textback_numbers")
    .select("id,business_name,provider_number,business_phone_numbers,sms_sender,sms_template,active,provider,created_at,updated_at,provider_configured_at,forwarding_verified_at,caller_id_verified_at,inbound_sms_verified_at,outbound_sms_verified_at,portal_account_verified_at,activated_at,activation_notes")
    .eq("id", params.id).maybeSingle();
  if (error || !company) notFound();
  const readiness = activationReadiness(company);
  const activationBlocked = !company.active && !readiness.ready;

  return <main style={{minHeight:"100vh",background:"#f4f7fb",color:"#10213f",padding:"32px 16px"}}>
    <div style={{maxWidth:900,margin:"0 auto",display:"grid",gap:20}}>
      <Link href="/admin" style={{color:"#1976d2",textDecoration:"none"}}>← Tillbaka till panelen</Link>

      <section style={panel}>
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
          <button style={{border:0,background:"#1976d2",color:"white",borderRadius:10,padding:"12px 16px",fontWeight:800,cursor:"pointer"}}>Spara företagsuppgifter</button>
        </form>
      </section>

      <section style={panel}>
        <div style={{display:"flex",justifyContent:"space-between",gap:16,alignItems:"start",flexWrap:"wrap"}}>
          <div><h2 style={{margin:"0 0 7px"}}>Produktionsaktivering</h2><p style={{margin:0,color:"#64748b"}}>{readiness.completed} av {readiness.total} kontroller verifierade. Tjänsten kan inte aktiveras innan alla är klara.</p></div>
          <strong style={{fontSize:20,color:readiness.ready?"#166534":"#b45309"}}>{Math.round(readiness.completed/readiness.total*100)}%</strong>
        </div>
        <div style={{height:10,background:"#e2e8f0",borderRadius:999,overflow:"hidden",margin:"18px 0 22px"}}><div style={{height:"100%",width:`${readiness.completed/readiness.total*100}%`,background:readiness.ready?"#16a34a":"#1976d2"}}/></div>
        <div style={{display:"grid",gap:10}}>
          {activationStepFields.map((step) => {
            const verifiedAt = company[step];
            return <article key={step} style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:16,padding:"14px 16px",border:"1px solid #e2e8f0",borderRadius:12,background:verifiedAt?"#f0fdf4":"#fff"}}>
              <div><div style={{fontWeight:800}}>{activationStepLabels[step]}</div><div style={{fontSize:13,color:verifiedAt?"#166534":"#64748b",marginTop:3}}>{fmt(verifiedAt)}</div></div>
              <form action={setCompanyActivationStep}>
                <input type="hidden" name="id" value={company.id}/><input type="hidden" name="step" value={step}/><input type="hidden" name="verified" value={String(!verifiedAt)}/>
                <button style={{border:"1px solid #cbd5e1",background:verifiedAt?"white":"#10213f",color:verifiedAt?"#10213f":"white",borderRadius:9,padding:"8px 11px",cursor:"pointer",fontWeight:700}}>{verifiedAt?"Återställ":"Markera verifierad"}</button>
              </form>
            </article>;
          })}
        </div>

        <form action={saveCompanyActivationNotes} style={{display:"grid",gap:9,marginTop:20}}>
          <input type="hidden" name="id" value={company.id}/>
          <label style={label}>Testanteckningar<textarea name="activation_notes" rows={5} maxLength={2000} defaultValue={company.activation_notes || ""} style={input} placeholder="Operatör, vidarekopplingskod, testnummer, datum och eventuella avvikelser."/></label>
          <button style={{justifySelf:"start",border:"1px solid #cbd5e1",background:"white",borderRadius:9,padding:"9px 12px",cursor:"pointer",fontWeight:700}}>Spara anteckningar</button>
        </form>

        <div style={{marginTop:22,paddingTop:20,borderTop:"1px solid #e2e8f0",display:"flex",justifyContent:"space-between",alignItems:"center",gap:16,flexWrap:"wrap"}}>
          <div><strong>{company.active?"Tjänsten är live":"Tjänsten är pausad"}</strong><div style={{fontSize:13,color:"#64748b",marginTop:3}}>{company.activated_at?`Aktiverad ${fmt(company.activated_at)}`:"Ingen produktionsaktivering genomförd"}</div></div>
          <form action={setTextbackNumberActive}><input type="hidden" name="id" value={company.id}/><input type="hidden" name="active" value={String(!company.active)}/><button disabled={activationBlocked} style={{border:0,background:company.active?"#991b1b":"#166534",color:"white",borderRadius:10,padding:"11px 15px",fontWeight:800,cursor:activationBlocked?"not-allowed":"pointer",opacity:activationBlocked?0.45:1}}>{company.active?"Pausa tjänsten":"Aktivera i produktion"}</button></form>
        </div>
      </section>
    </div>
  </main>;
}
