import Link from "next/link";

export default function CompanyNotFound() {
  return <main style={{minHeight:"100vh",display:"grid",placeItems:"center",background:"#f4f7fb",padding:20,color:"#10213f"}}>
    <section style={{maxWidth:520,background:"white",border:"1px solid #dbe4ef",borderRadius:18,padding:28,textAlign:"center"}}>
      <h1>Företaget hittades inte</h1>
      <p style={{color:"#64748b"}}>Posten kan ha tagits bort eller adressen kan vara felaktig.</p>
      <Link href="/admin" style={{color:"#1976d2"}}>Tillbaka till panelen</Link>
    </section>
  </main>;
}
