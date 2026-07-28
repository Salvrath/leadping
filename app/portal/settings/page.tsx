import Link from "next/link";
import { BellRing, Building2, MessageSquareText, ShieldCheck, Sparkles } from "lucide-react";
import { requireCustomer } from "@/lib/server/customer-auth";
import { PortalHeader } from "@/components/portal-ui";
import { updateCustomerSettings } from "../actions";

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
      <form action={updateCustomerSettings} className="portal-card portal-panel">
        <div className="portal-section-label"><BellRing size={14}/> E-postnotiser</div>
        <h2>Få ett mejl när ett nytt lead kommer in</h2>
        <label className="portal-toggle">
          <input type="checkbox" name="email_notifications_enabled" defaultChecked={Boolean(number?.email_notifications_enabled)}/>
          <span><strong>Skicka e-postnotis för nya kundärenden</strong><span className="portal-muted">Mejlet innehåller kundens telefonnummer, meddelande och en direktlänk till konversationen.</span></span>
        </label>
        <label className="portal-field">E-postadress för notiser
          <input type="email" name="notification_email" maxLength={320} defaultValue={notificationEmail} placeholder="namn@foretag.se"/>
          <span className="portal-help">Adressen används endast för notifieringar från Textback.</span>
        </label>

        <div style={{height:1,background:"#edf2f4",margin:"26px 0"}}/>

        <div className="portal-section-label"><MessageSquareText size={14}/> Automatiskt SMS</div>
        <h2>Meddelandet kunden får</h2>
        {number?.demo_mode && <div className="portal-alert info"><Sparkles size={19}/><p><strong>Demonumret använder en fast demotext.</strong><br/>Den publika demon skickar alltid Textbacks demonstrationsmeddelande och länk till webbplatsen.</p></div>}
        <label className="portal-field">SMS-mall
          <textarea name="sms_template" required minLength={10} maxLength={1000} defaultValue={number?.sms_template || ""} rows={7}/>
          <span className="portal-help">Använd {"{{businessName}}"} för att infoga företagsnamnet automatiskt.</span>
        </label>
        <div className="portal-save-row"><button className="portal-button primary">Spara inställningar</button><span className="portal-muted">Ändringar gäller direkt.</span></div>
      </form>

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
