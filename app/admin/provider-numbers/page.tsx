import Link from "next/link";
import { requireAdmin } from "@/lib/server/admin-auth";
import { getSupabaseAdmin } from "@/lib/server/supabase";
import { addProviderNumber, disableProviderNumber } from "./actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "46elks-nummer | Textback" };

export default async function ProviderNumbersPage() {
  requireAdmin();
  const db = getSupabaseAdmin();
  const [{ data: numbers }, { data: companies }, { count: waiting }] = await Promise.all([
    db.from("provider_number_inventory").select("id,provider,provider_number,status,configured_at,assigned_at,assigned_textback_number_id").order("created_at", { ascending: false }),
    db.from("textback_numbers").select("id,business_name"),
    db.from("pilot_leads").select("id", { count: "exact", head: true }).eq("provisioning_status", "awaiting_number").not("paid_at", "is", null),
  ]);
  const companyNames = new Map((companies || []).map((company) => [company.id, company.business_name]));

  return <main style={{minHeight:"100vh",background:"#f4f7fb",padding:"28px clamp(16px,5vw,72px)",color:"#10213f"}}>
    <div style={{maxWidth:1050,margin:"0 auto"}}><Link href="/admin">← Till driftpanelen</Link>
      <section style={{background:"white",border:"1px solid #dbe4ef",borderRadius:18,padding:28,marginTop:20}}>
        <h1>46elks-nummerpool</h1><p>Endast nummer där både voice- och SMS-webhooken redan är konfigurerade får läggas till. Ett ledigt nummer reserveras automatiskt efter en lyckad Stripe-betalning.</p>
        <div style={{background:waiting?"#fff7ed":"#f0fdf4",padding:14,borderRadius:12,margin:"18px 0"}}><strong>{waiting || 0}</strong> betalda beställningar väntar på nummer.</div>
        <form action={addProviderNumber} style={{display:"flex",gap:12,flexWrap:"wrap",alignItems:"end",marginBottom:28}}><label style={{flex:"1 1 280px"}}>Nytt konfigurerat 46elks-nummer<input name="provider_number" type="tel" required placeholder="+467..." style={{display:"block",width:"100%",boxSizing:"border-box",padding:12,marginTop:6}}/></label><button className="button">Lägg till i poolen</button></form>
        <div style={{overflowX:"auto"}}><table style={{width:"100%",borderCollapse:"collapse"}}><thead><tr><th align="left">Nummer</th><th align="left">Status</th><th align="left">Tilldelat företag</th><th align="left">Konfigurerat</th><th>Åtgärd</th></tr></thead><tbody>{(numbers || []).map((number) => <tr key={number.id} style={{borderTop:"1px solid #e2e8f0"}}><td style={{padding:"12px 4px"}}>{number.provider_number}</td><td>{number.status}</td><td>{number.assigned_textback_number_id ? companyNames.get(number.assigned_textback_number_id) || "Tilldelat" : "–"}</td><td>{number.configured_at ? new Intl.DateTimeFormat("sv-SE",{dateStyle:"short",timeStyle:"short"}).format(new Date(number.configured_at)) : "–"}</td><td align="center">{number.status === "available" && <form action={disableProviderNumber}><input type="hidden" name="id" value={number.id}/><button>Inaktivera</button></form>}</td></tr>)}</tbody></table></div>
      </section>
    </div>
  </main>;
}
