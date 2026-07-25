import Link from "next/link";
import { requireCustomer } from "@/lib/server/customer-auth";
import { updateCustomerSettings } from "../actions";

export const dynamic="force-dynamic";
export default async function SettingsPage(){
 const user=await requireCustomer(); const number=Array.isArray(user.textback_numbers)?user.textback_numbers[0]:user.textback_numbers;
 return <main style={{minHeight:"100vh",background:"#f4f7fb",padding:"28px clamp(16px,5vw,72px)",color:"#10213f"}}><Link href="/portal">← Tillbaka</Link><section style={{maxWidth:760,margin:"24px auto",background:"white",border:"1px solid #dbe4ef",borderRadius:18,padding:28}}><h1>Inställningar</h1><dl><dt>Företag</dt><dd>{number?.business_name}</dd><dt>Textback-nummer</dt><dd>{number?.provider_number}</dd><dt>Ordinarie nummer</dt><dd>{number?.business_phone_numbers?.join(", ")||"–"}</dd><dt>Status</dt><dd>{number?.active?"Aktiv":"Pausad"}</dd></dl><form action={updateCustomerSettings} style={{display:"grid",gap:12,marginTop:24}}><label>Automatiskt SMS<textarea name="sms_template" required minLength={10} maxLength={1000} defaultValue={number?.sms_template||""} rows={7} style={{display:"block",width:"100%",boxSizing:"border-box",marginTop:7,padding:12,border:"1px solid #cbd5e1",borderRadius:10}}/></label><small style={{color:"#64748b"}}>Använd {"{{businessName}}"} för att infoga företagsnamnet.</small><button style={{justifySelf:"start",border:0,borderRadius:10,padding:"11px 16px",background:"#1976d2",color:"white",fontWeight:700}}>Spara inställningar</button></form></section></main>;
}
