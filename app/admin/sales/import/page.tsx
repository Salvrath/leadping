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
    <h1 className="admin-title">Lägg in verifierade kontaktvägar.</h1>
    <p className="admin-intro">Ett lead kan innehålla direktnummer, e-post eller båda. SMS kräver ett verifierat direktnummer till en namngiven beslutsfattare. En verifierad företags- eller beslutsfattarmejl kan användas även när telefonnummer saknas.</p>
    <div className="admin-note"><ShieldCheck size={16}/><strong>Rekommenderade kolumner:</strong> företagsnamn, kontaktperson, roll, mobilnummer, nummertyp, beslutsfattare verifierad, e-post, bolagsform, bransch, ort, källa, telefonkälla, e-postkälla, verifierad, fitscore och motivering. Minst telefon eller e-post krävs. Inga utskick görs vid import.</div>
    <SalesImportForm/>
  </div></main>;
}
