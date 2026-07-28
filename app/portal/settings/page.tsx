import Link from "next/link";
import { Building2, ShieldCheck } from "lucide-react";
import { requireCustomer } from "@/lib/server/customer-auth";
import { PortalHeader } from "@/components/portal-ui";
import { CustomerSettingsForm } from "@/components/portal-forms";

export const dynamic = "force-dynamic";
export const metadata = { title: "Inställningar | Textback" };

export default async function SettingsPage() {
  const user = await requireCustomer();
  const number = Array.isArray(user.textback_numbers) ? user.textback_numbers[0] : user.textback_numbers;
  const notificationEmail = number?.notification_email || user.email || "";

  return <main className="portal-page"><div className="portal-wrap">
    <PortalHeader businessName={number?.business_name} demoMode={number?.demo_mode} notificationsEnabled={number?.email_notifications_enabled}/>
    <Link className="portal-back" href="/portal">← Till leadinkorgen</Link>
    <div className="portal-kicker"><ShieldCheck size={15}/> Inställningar</div>
    <h1 className="portal-title">Enkelt att ställa in. Enkelt att använda.</h1>
    <p className="portal-intro">Välj hur kunderna möts efter ett missat samtal och vart nya kundärenden ska skickas.</p>

    <div className="portal-grid">
      <CustomerSettingsForm
        notificationsEnabled={Boolean(number?.email_notifications_enabled)}
        notificationEmail={notificationEmail}
        smsTemplate={number?.sms_template || ""}
        demoMode={Boolean(number?.demo_mode)}
      />

      <aside className="portal-stack">
        <section className="portal-card portal-panel">
          <div className="portal-section-label"><Building2 size={14}/> Konto</div>
          <h2>{number?.business_name}</h2>
          <dl className="portal-meta">
            <div><dt>Status</dt><dd><span className={`portal-badge ${number?.active ? "active" : "paused"}`}>{number?.active ? "Aktiv" : "Pausad"}</span></dd></div>
            <div><dt>Textback-nummer</dt><dd>{number?.provider_number || "–"}</dd></div>
            <div><dt>Företagets nummer</dt><dd>{number?.business_phone_numbers?.join(", ") || "–"}</dd></div>
            <div><dt>Inloggning</dt><dd>{user.email}</dd></div>
            <div><dt>E-postnotiser</dt><dd>{number?.email_notifications_enabled ? "Aktiverade" : "Avstängda"}</dd></div>
          </dl>
        </section>
        <section className="portal-card portal-panel"><h2>Så fungerar notisen</h2><p className="portal-muted">Ett mejl skickas när en kund svarar första gången på ett automatiskt SMS. Fortsatta meddelanden hanteras i samma konversation utan extra mejl för varje svar.</p></section>
      </aside>
    </div>
  </div></main>;
}
