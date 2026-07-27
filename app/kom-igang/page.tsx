import type { Metadata } from "next";
import { LockKeyhole } from "lucide-react";
import { hashOnboardingToken } from "@/lib/server/provisioning";
import { getSupabaseAdmin } from "@/lib/server/supabase";
import { completeOnboarding } from "./actions";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Skapa ditt Textback-konto", robots: { index: false, follow: false } };

const errorMessages: Record<string, string> = {
  mismatch: "Lösenorden matchar inte.",
  password: "Lösenordet måste vara minst 12 tecken.",
  invalid: "Länken är ogiltig, använd eller har gått ut.",
  email: "E-postadressen används redan av ett annat Textback-konto.",
};

export default async function SetupPage({ searchParams }: { searchParams: { token?: string; error?: string } }) {
  const token = String(searchParams.token || "").slice(0, 200);
  let setup: { company: string; providerNumber: string; email: string } | null = null;

  if (token.length >= 32) {
    const db = getSupabaseAdmin();
    const { data: tokenRow } = await db.from("customer_onboarding_tokens")
      .select("pilot_lead_id,textback_number_id,expires_at,used_at")
      .eq("token_hash", hashOnboardingToken(token)).is("used_at", null).gt("expires_at", new Date().toISOString()).maybeSingle();
    if (tokenRow) {
      const [{ data: lead }, { data: number }] = await Promise.all([
        db.from("pilot_leads").select("company,email").eq("id", tokenRow.pilot_lead_id).maybeSingle(),
        db.from("textback_numbers").select("provider_number").eq("id", tokenRow.textback_number_id).maybeSingle(),
      ]);
      if (lead && number) setup = { company: lead.company, email: lead.email, providerNumber: number.provider_number };
    }
  }

  return <main style={{minHeight:"100vh",display:"grid",placeItems:"center",background:"#f4f7fb",padding:20,color:"#10213f"}}>
    <section style={{width:"100%",maxWidth:520,background:"white",padding:32,borderRadius:18,border:"1px solid #dbe4ef",boxShadow:"0 12px 36px rgba(16,33,63,.08)"}}>
      <img src="/textback-logo.svg" alt="Textback" width="190" height="50"/>
      <LockKeyhole size={36} style={{marginTop:26}}/>
      <h1>Skapa ditt portalkonto</h1>
      {setup ? <>
        <p>Betalningen är registrerad för <strong>{setup.company}</strong>. Välj ett lösenord för att fortsätta anslutningen.</p>
        <div style={{background:"#f1f5f9",padding:14,borderRadius:12,margin:"18px 0"}}><div><strong>E-post:</strong> {setup.email}</div><div><strong>Textback-nummer:</strong> {setup.providerNumber}</div></div>
        {searchParams.error && <p role="alert" style={{background:"#fff1f2",color:"#9f1239",padding:12,borderRadius:10}}>{errorMessages[searchParams.error] || errorMessages.invalid}</p>}
        <form action={completeOnboarding} style={{display:"grid",gap:16}}>
          <input type="hidden" name="token" value={token}/>
          <label>Lösenord<input name="password" type="password" minLength={12} maxLength={200} required autoComplete="new-password" style={{display:"block",width:"100%",boxSizing:"border-box",marginTop:6,padding:12,border:"1px solid #cbd5e1",borderRadius:10}}/></label>
          <label>Bekräfta lösenord<input name="password_confirmation" type="password" minLength={12} maxLength={200} required autoComplete="new-password" style={{display:"block",width:"100%",boxSizing:"border-box",marginTop:6,padding:12,border:"1px solid #cbd5e1",borderRadius:10}}/></label>
          <button className="button large">Skapa konto och fortsätt</button>
        </form>
        <p style={{fontSize:13,color:"#64748b"}}>Lösenordet lagras endast som en säker hash. Engångslänken förbrukas när kontot skapas.</p>
      </> : <><h2>Länken kan inte användas</h2><p>Den kan ha gått ut eller redan ha använts. Kontakta <a href="mailto:info@textback.se">info@textback.se</a> för en ny länk.</p></>}
    </section>
  </main>;
}
