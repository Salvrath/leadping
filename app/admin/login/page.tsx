import { redirect } from "next/navigation";
import { isAdminAuthenticated } from "@/lib/server/admin-auth";
import { loginAdmin } from "../actions";

export const metadata = { title: "Intern inloggning | Textback" };
export const dynamic = "force-dynamic";

export default function AdminLogin({ searchParams }: { searchParams: { error?: string } }) {
  if (isAdminAuthenticated()) redirect("/admin");
  return (
    <main style={{minHeight:"100vh",display:"grid",placeItems:"center",background:"#f4f7fb",padding:24,color:"#10213f"}}>
      <section style={{width:"100%",maxWidth:420,background:"white",border:"1px solid #dbe4ef",borderRadius:20,padding:32,boxShadow:"0 20px 50px rgba(16,33,63,.08)"}}>
        <img src="/textback-logo.svg" alt="Textback" width="190" height="48" style={{display:"block",marginBottom:28}}/>
        <h1 style={{fontSize:28,margin:"0 0 8px"}}>Intern panel</h1>
        <p style={{color:"#64748b",margin:"0 0 24px"}}>Logga in för att hantera företag, telefoni och kundkonversationer.</p>
        {searchParams.error && <p role="alert" style={{background:"#fff1f2",color:"#9f1239",padding:12,borderRadius:10}}>Fel lösenord.</p>}
        <form action={loginAdmin} style={{display:"grid",gap:14}}>
          <label style={{display:"grid",gap:6,fontWeight:600}}>Lösenord<input name="password" type="password" required autoComplete="current-password" style={{padding:"12px 14px",border:"1px solid #cbd5e1",borderRadius:10,fontSize:16}}/></label>
          <button type="submit" style={{padding:"13px 16px",border:0,borderRadius:10,background:"#1976d2",color:"white",fontWeight:700,fontSize:16,cursor:"pointer"}}>Logga in</button>
        </form>
      </section>
    </main>
  );
}
