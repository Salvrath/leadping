import Link from "next/link";
import { Activity, Building2, Database, FileClock, KeyRound, LayoutDashboard, Phone, Plus, Target } from "lucide-react";
import { AdminLogoutForm } from "@/components/admin-actions";
import { salesLeadStatusLabel } from "@/lib/sales";

export function AdminHeader({ openIncidents = 0, availableNumbers = 0, salesAttention = 0 }: { openIncidents?: number; availableNumbers?: number; salesAttention?: number }) {
  return <header className="admin-header">
    <div className="admin-brand">
      <Link href="/admin" aria-label="Till adminpanelens startsida"><img src="/textback-logo.svg" alt="Textback" width="174" height="44"/></Link>
      <div><strong>Internpanel</strong><span>Drift, kunder och försäljning</span></div>
    </div>
    <nav className="admin-nav" aria-label="Adminmeny">
      <Link href="/admin"><LayoutDashboard size={16}/><span>Översikt</span></Link>
      <Link href="/admin/sales"><Target size={16}/><span>Sales Hub</span>{salesAttention > 0 && <b>{salesAttention}</b>}</Link>
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
    paused: "Pausad",
    simulation: "Simulering",
    pending: "Väntar",
    ready: "Redo",
    needs_review: "Kontroll krävs",
    rejected: "Avvisad",
    processing: "Bearbetas",
    completed: "Slutförd",
    partially_completed: "Delvis klar",
    new: "Nytt",
    open: "Pågående",
    contacted: "Kontaktad",
    closed: "Avslutad",
    blocked: "Spärrad",
    sms_delivered: "Levererat",
    sms_sent: "Skickat",
    ignored: "Ignorerat",
    failed: "Misslyckat",
    dead_letter: "Kräver åtgärd",
    draft: "Utkast",
    sending: "Skickar",
    partially_failed: "Delvis misslyckad",
    cancelled: "Avbruten",
    queued: "Köad",
    sent: "Skickat",
    delivered: "Levererat",
    replied: "Svarat",
    skipped: "Överhoppad",
    review: salesLeadStatusLabel("review"),
    approved: salesLeadStatusLabel("approved"),
    engaged: salesLeadStatusLabel("engaged"),
    demo_tested: salesLeadStatusLabel("demo_tested"),
    interested: salesLeadStatusLabel("interested"),
    follow_up: salesLeadStatusLabel("follow_up"),
    converted: salesLeadStatusLabel("converted"),
    not_interested: salesLeadStatusLabel("not_interested"),
    invalid: salesLeadStatusLabel("invalid"),
  };
  return <span className={`admin-badge ${status}`}>{labels[status] || status.replaceAll("_", " ")}</span>;
}

export function AdminEmpty({ title, text }: { title: string; text: string }) {
  return <div className="admin-empty"><Building2 size={30}/><strong>{title}</strong><span>{text}</span></div>;
}