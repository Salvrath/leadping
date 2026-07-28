import Link from "next/link";
import { FileSpreadsheet, ShieldCheck } from "lucide-react";
import { SalesImportForm } from "@/components/sales-actions";
import { AdminHeader } from "@/components/admin-ui";
import { requireAdmin } from "@/lib/server/admin-auth";

export const metadata = { title: "Importera leads | Textback" };

export default function SalesImportPage() {
  requireAdmin();
  return <main className="admin-page"><div className="admin-wrap sales-narrow">
    <AdminHeader/>
    <Link className="admin-link-button sales-back" href="/admin/sales">← Till Sales Hub</Link>
    <div className="admin-kicker"><FileSpreadsheet size={15}/> Import</div>
    <h1 className="admin-title">Lägg in en spårbar leadbatch.</h1>
    <p className="admin-intro">Importen stoppar dubbletter, registrerar källa och kör den automatiska kontrollen direkt. Endast leads som klarar samtliga fasta krav kan läggas i ett kampanjutkast.</p>
    <div className="admin-note"><ShieldCheck size={16}/><strong>Rekommenderade kolumner:</strong> företagsnamn, mobilnummer, bolagsform, bransch, ort, organisationsnummer, källa, verifierad, fitscore, motivering och taggar. Inga SMS skickas vid import.</div>
    <SalesImportForm/>
  </div></main>;
}