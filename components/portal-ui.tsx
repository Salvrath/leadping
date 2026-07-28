import Link from "next/link";
import { Bell, LogOut, Settings } from "lucide-react";
import { logoutCustomer } from "@/app/portal/actions";

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
      <Link href="/portal/settings"><Settings size={16}/> Inställningar{notificationsEnabled && <Bell size={14}/>}</Link>
      <form action={logoutCustomer}><button><LogOut size={16}/> Logga ut</button></form>
    </nav>
  </header>;
}
