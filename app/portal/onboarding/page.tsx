import Link from "next/link";
import { CheckCircle2, Circle, PhoneForwarded, MessageSquareText, ShieldCheck } from "lucide-react";
import { requireCustomer } from "@/lib/server/customer-auth";
import { getSupabaseAdmin } from "@/lib/server/supabase";

export const dynamic = "force-dynamic";
export const metadata = { title: "Anslut telefoni | Textback" };

const completed = (value?: string | null) => Boolean(value);

export default async function OnboardingPage() {
  const user = await requireCustomer();
  const db = getSupabaseAdmin();
  const [{ data: number }, { data: lead }] = await Promise.all([
    db.from("textback_numbers").select("id,business_name,provider_number,business_phone_numbers,active,onboarding_test_mode,provider_configured_at,forwarding_verified_at,caller_id_verified_at,inbound_sms_verified_at,outbound_sms_verified_at,portal_account_verified_at,activated_at").eq("id", user.textback_number_id).maybeSingle(),
    db.from("pilot_leads").select("telephony,workshop_phone,provisioning_status").eq("textback_number_id", user.textback_number_id).maybeSingle(),
  ]);
  if (!number) return null;

  const checks = [
    ["Textback-numret är konfigurerat", number.provider_configured_at],
    ["Vidarekopplingen når Textback", number.forwarding_verified_at],
    ["Kundens nummerpresentation bevaras", number.caller_id_verified_at],
    ["Inkommande SMS når portalen", number.inbound_sms_verified_at],
    ["Utgående SMS-test godkänt", number.outbound_sms_verified_at],
    ["Portalkontot fungerar", number.portal_account_verified_at],
  ] as const;
  const done = checks.filter(([, value]) => completed(value)).length;

  return <main style={{minHeight:"100vh",background:"#f4f7fb",padding:"28px clamp(16px,5vw,72px)",color:"#10213f"}}>
    <div style={{maxWidth:980,margin:"0 auto"}}>
      <header style={{display:"flex",justifyContent:"space-between",gap:16,alignItems:"center",marginBottom:24}}><img src="/textback-logo.svg" alt="Textback" width="180" height="45"/><Link href="/portal">Till portalen</Link></header>
      <section style={{background:"white",border:"1px solid #dbe4ef",borderRadius:18,padding:28}}>
        {number.active ? <><CheckCircle2 size={48}/><span style={{display:"inline-block",marginTop:12,fontWeight:800,color:"#166534"}}>AKTIVERAD</span><h1>{number.business_name} är anslutet</h1><p>Textback är i live-läge. Missade samtal kan nu följas upp automatiskt och kundsvar samlas i portalen.</p><Link className="button large" href="/portal">Öppna kundportalen</Link></> : <>
          <span style={{fontWeight:800,color:"#1976d2"}}>STEG {done} AV 6 KLARA</span><h1>Anslut företagets telefoni</h1><p>Textback-numret <strong>{number.provider_number}</strong> är reserverat för {number.business_name}. Företaget aktiveras automatiskt när testen nedan är godkända.</p>
          <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(250px,1fr))",gap:12,margin:"24px 0"}}>{checks.map(([label,value])=><div key={label} style={{display:"flex",gap:10,alignItems:"center",padding:13,border:"1px solid #e2e8f0",borderRadius:12}}>{value?<CheckCircle2 size={20}/>:<Circle size={20}/>}<span>{label}</span></div>)}</div>

          <div style={{display:"grid",gap:18}}>
            <article style={{border:"1px solid #dbe4ef",borderRadius:14,padding:20}}><PhoneForwarded/><h2>1. Vidarekoppla vid ej svar</h2><p>Ställ in företagets nummer <strong>{lead?.workshop_phone || number.business_phone_numbers?.[0]}</strong> så obesvarade samtal vidarekopplas till:</p><div style={{fontSize:28,fontWeight:800,letterSpacing:1}}>{number.provider_number}</div><p style={{color:"#64748b"}}>Telefonilösning angiven vid beställningen: {lead?.telephony || "Ej angiven"}. Använd operatörens inställning för vidarekoppling vid ej svar, inte vidarekoppling av alla samtal.</p></article>
            <article style={{border:"1px solid #dbe4ef",borderRadius:14,padding:20}}><ShieldCheck/><h2>2. Kör ett säkert testsamtal</h2><p>Ring företagets ordinarie nummer från en extern mobil och låt samtalet gå obesvarat. Under onboarding använder Textback 46elks dry-run: samtalet verifieras utan att ett riktigt automatiskt SMS skickas.</p></article>
            <article style={{border:"1px solid #dbe4ef",borderRadius:14,padding:20}}><MessageSquareText/><h2>3. Verifiera inkommande SMS</h2><p>Skicka ett vanligt SMS från den externa mobilen till <strong>{number.provider_number}</strong>. Meddelandet ska visas i portalen. När alla rutor är klara aktiveras tjänsten automatiskt.</p></article>
          </div>
          <div style={{display:"flex",gap:12,flexWrap:"wrap",marginTop:24}}><a className="button large" href="/portal/onboarding">Kontrollera status igen</a><Link className="button secondary large" href="/portal">Öppna portalen</Link></div>
        </>}
      </section>
    </div>
  </main>;
}
