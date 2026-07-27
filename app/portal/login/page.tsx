import { loginCustomer } from "../actions";

export const metadata = { title: "Logga in | Textback" };
export default function CustomerLogin({ searchParams }: { searchParams: { error?: string } }) {
  const invalidCredentials = searchParams.error === "1";
  const rateLimited = searchParams.error === "rate-limit";
  const configurationError = searchParams.error === "config";

  return <main style={{minHeight:"100vh",display:"grid",placeItems:"center",background:"#f4f7fb",padding:20,color:"#10213f"}}>
    <section style={{width:"100%",maxWidth:430,background:"white",padding:32,borderRadius:18,border:"1px solid #dbe4ef",boxShadow:"0 12px 36px rgba(16,33,63,.08)"}}>
      <img src="/textback-logo.svg" alt="Textback" width="190" height="50"/>
      <h1 style={{margin:"28px 0 8px"}}>Kundportal</h1><p style={{color:"#64748b",marginTop:0}}>Logga in för att hantera samtal, kundsvar och inställningar.</p>
      {invalidCredentials && <p role="alert" style={{background:"#fff1f2",color:"#9f1239",padding:12,borderRadius:10}}>Fel e-postadress eller lösenord.</p>}
      {rateLimited && <p role="alert" style={{background:"#fff7ed",color:"#9a3412",padding:12,borderRadius:10,lineHeight:1.5}}>För många inloggningsförsök. Vänta 30 minuter innan du försöker igen.</p>}
      {configurationError && <p role="alert" style={{background:"#fff7ed",color:"#9a3412",padding:12,borderRadius:10,lineHeight:1.5}}>Kundportalen är inte färdigkonfigurerad. Kontakta Textback-administratören.</p>}
      <form action={loginCustomer} style={{display:"grid",gap:16}}>
        <label>E-post<input name="email" type="email" autoComplete="email" required style={{display:"block",width:"100%",boxSizing:"border-box",marginTop:6,padding:12,border:"1px solid #cbd5e1",borderRadius:10}}/></label>
        <label>Lösenord<input name="password" type="password" autoComplete="current-password" required style={{display:"block",width:"100%",boxSizing:"border-box",marginTop:6,padding:12,border:"1px solid #cbd5e1",borderRadius:10}}/></label>
        <button style={{border:0,borderRadius:10,padding:13,background:"#1976d2",color:"white",fontWeight:700,cursor:"pointer"}}>Logga in</button>
      </form>
    </section>
  </main>;
}
