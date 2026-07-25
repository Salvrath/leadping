import Link from "next/link";
import { requireAdmin } from "@/lib/server/admin-auth";
import { getSupabaseAdmin } from "@/lib/server/supabase";
import { saveCustomerAccess } from "../actions";

export const dynamic="force-dynamic";
export const metadata={title:"Kundkonton | Textback"};
export default async function CustomerAccountsPage(){
 requireAdmin(); const db=getSupabaseAdmin();
 const [{data:numbers},{data:users}]=await Promise.all([
  db.from("textback_numbers").select("id,business_name,provider_number,active").order("business_name"),
  db.from("customer_users").select("id,email,textback_number_id,active,last_login_at,textback_numbers(business_name,provider_number)").order("email")
 ]);
 const byNumber=new Map((users||[]).map((u:any)=>[u.textback_number_id,u]));
 return <main style={{minHeight:"100vh",background:"#f4f7fb",padding:"28px clamp(16px,5vw,72px)",color:"#10213f"}}><Link href="/admin">← Till driftpanelen</Link><section style={{maxWidth:1000,margin:"24px auto",background:"white",border:"1px solid #dbe4ef",borderRadius:18,padding:28}}><h1>Kundkonton</h1><p style={{color:"#64748b"}}>Skapa inloggning eller återställ lösenord för varje företag. Lösenord visas aldrig efter att det sparats.</p><div style={{display:"grid",gap:18,marginTop:24}}>{(numbers||[]).map((n:any)=>{const user:any=byNumber.get(n.id);return <form key={n.id} action={saveCustomerAccess} style={{border:"1px solid #e2e8f0",borderRadius:14,padding:18,display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(200px,1fr))",gap:14,alignItems:"end"}}><input type="hidden" name="textback_number_id" value={n.id}/><div><strong>{n.business_name}</strong><div style={{color:"#64748b",fontSize:13}}>{n.provider_number}</div></div><label>E-post<input name="email" type="email" required defaultValue={user?.email||""} style={{display:"block",width:"100%",boxSizing:"border-box",padding:9,marginTop:5}}/></label><label>{user?"Nytt lösenord (valfritt)":"Lösenord"}<input name="password" type="password" minLength={12} required={!user} style={{display:"block",width:"100%",boxSizing:"border-box",padding:9,marginTop:5}}/></label><label style={{display:"flex",gap:8,alignItems:"center"}}><input type="checkbox" name="active" value="true" defaultChecked={user?.active??true}/> Aktiv åtkomst</label><button style={{padding:"10px 14px",border:0,borderRadius:9,background:"#1976d2",color:"white",fontWeight:700}}>{user?"Uppdatera":"Skapa konto"}</button>{user?.last_login_at&&<small style={{gridColumn:"1/-1",color:"#64748b"}}>Senaste inloggning: {new Intl.DateTimeFormat("sv-SE",{dateStyle:"short",timeStyle:"short"}).format(new Date(user.last_login_at))}</small>}</form>})}</div></section></main>;
}
