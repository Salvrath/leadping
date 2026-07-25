"use client";

export default function CompanyError({ reset }: { error: Error; reset: () => void }) {
  return <main style={{minHeight:"100vh",display:"grid",placeItems:"center",background:"#f4f7fb",padding:20,color:"#10213f"}}>
    <section style={{maxWidth:520,background:"white",border:"1px solid #dbe4ef",borderRadius:18,padding:28,textAlign:"center"}}>
      <h1>Företaget kunde inte sparas</h1>
      <p style={{color:"#64748b",lineHeight:1.6}}>Kontrollera att Textback-numret är unikt, att samtliga telefonnummer är giltiga och att SMS-mallen innehåller minst tio tecken.</p>
      <button onClick={reset} style={{border:0,background:"#1976d2",color:"white",padding:"11px 15px",borderRadius:10,fontWeight:800,cursor:"pointer"}}>Försök igen</button>
    </section>
  </main>;
}
