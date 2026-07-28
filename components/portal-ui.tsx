import Link from "next/link";
import { Bell, Settings } from "lucide-react";
import { CustomerLogoutForm } from "@/components/portal-forms";

export const conversationStatuses = ["new", "open", "contacted", "closed"] as const;
export type ConversationStatus = typeof conversationStatuses[number];

export function statusLabel(status: string) {
  return ({ new: "Nytt", open: "Pågående", contacted: "Kontaktad", closed: "Avslutad" } as Record<string, string>)[status] || status;
}

export function StatusBadge({ status }: { status: string }) {
  return <span className={`portal-badge ${status}`}>{statusLabel(status)}</span>;
}

export function PortalHeader({ businessName, demoMode = false, notificationsEnabled = false }: { businessName?: string; demoMode?: boolean; notificationsEnabled?: boolean }) {
  return <header className="portal-header">
    <div className="portal-brand">
      <Link href="/portal" aria-label="Till portalens startsida"><img src="/textback-logo.svg" alt="Textback" width="180" height="45" /></Link>
      <div className="portal-brand-copy"><strong>{businessName || "Kundportal"}</strong><span className="portal-muted">{demoMode ? "Demonummer" : "Kundportal"}</span></div>
    </div>
    <nav className="portal-nav" aria-label="Portalmeny">
      <Link href="/portal/settings"><Settings size={16}/><span>Inställningar</span>{notificationsEnabled && <span className="portal-nav-notification" title="E-postnotiser är aktiva"><Bell size={12}/><span className="sr-only">E-postnotiser är aktiva</span></span>}</Link>
      <CustomerLogoutForm/>
    </nav>
  </header>;
}
