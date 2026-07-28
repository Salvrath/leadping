import Link from "next/link";
import { Activity, Building2, Database, FileClock, KeyRound, LayoutDashboard, Phone, Plus } from "lucide-react";
import { AdminLogoutForm } from "@/components/admin-actions";

export function AdminHeader({ openIncidents = 0, availableNumbers = 0 }: { openIncidents?: number; availableNumbers?: number }) {
  return <header className="admin-header">
    <div className="admin-brand">
      <Link href="/admin" aria-label="Till adminpanelens startsida"><img src="/textback-logo.svg" alt="Textback" width="174" height="44"/></Link>
      <div><strong>Internpanel</strong><span>Drift, kunder och telefoni</span></div>
    </div>
    <nav className="admin-nav" aria-label="Adminmeny">
      <Link href="/admin"><LayoutDashboard size={16}/><span>Översikt</span></Link>
      <Link href="/admin/customers"><KeyRound size={16}/><span>Kundkonton</span></Link>
      <Link href="/admin/provider-numbers"><Phone size={16}/><span>Nummer</span>{availableNumbers > 0 && <b>{availableNumbers}</b>}</Link>
      <Link href="/admin/operations"><Activity size={16}/><span>Drift</span>{openIncidents > 0 && <b className="danger">{openIncidents}</b>}</Link>
      <Link href="/admin/audit"><FileClock size={16}/><span>Logg</span></Link>
      <Link href="/admin/data"><Database size={16}/><span>Dataskydd</span></Link>
      <Link className="admin-nav-primary" href="/admin/companies/new"><Plus size={16}/><span>Nytt företag</span></Link>
      <AdminLogoutForm/>
    </nav>
  </header>;
}

export function AdminStatusBadge({ status }: { status: string }) {
  const labels: Record<string,string> = {
    active: "Aktiv",
    inactive: "Pausad",
    new: "Nytt",
    open: "Pågående",
    contacted: "Kontaktad",
    closed: "Avslutad",
    blocked: "Blockerad",
    sms_delivered: "Levererat",
    sms_sent: "Skickat",
    ignored: "Ignorerat",
    failed: "Misslyckat",
    dead_letter: "Kräver åtgärd",
  };
  return <span className={`admin-badge ${status}`}>{labels[status] || status.replaceAll("_", " ")}</span>;
}

export function AdminEmpty({ title, text }: { title: string; text: string }) {
  return <div className="admin-empty"><Building2 size={30}/><strong>{title}</strong><span>{text}</span></div>;
}
