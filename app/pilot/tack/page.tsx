import type { Metadata } from "next";
import { CheckCircle2, Clock3 } from "lucide-react";
import { getStripe } from "@/lib/server/stripe";
import { ConversionTracker } from "@/components/conversion-tracker";
export const metadata: Metadata = { title: "Tack för din beställning – Textback", robots: { index: false, follow: false } };

export default async function Page({ searchParams }: { searchParams: { session_id?: string } }) {
  let ready = false; let verified = false; let legacyPaid = false;
  if (searchParams.session_id?.startsWith("cs_")) try {
    const session = await getStripe().checkout.sessions.retrieve(searchParams.session_id);
    verified = Boolean(session.metadata?.pilot_lead_id);
    ready = verified && session.mode === "setup" && session.status === "complete" && Boolean(session.setup_intent);
    legacyPaid = verified && session.mode !== "setup" && ["paid", "no_payment_required"].includes(session.payment_status);
  } catch { /* neutral state below */ }
  const complete = ready || legacyPaid;
  return <main className="section"><section className="shell narrow success-card standalone" tabIndex={-1}>
    {complete ? <CheckCircle2 size={48}/> : <Clock3 size={48}/>}<span className="eyebrow">Textback-anslutning</span>
    <h1>{ready ? "Betalmetoden är registrerad." : legacyPaid ? "Betalningen är mottagen." : "Stripe-sessionen behandlas."}</h1>
    <p>{verified ? "Stripe-sessionen har verifierats. Textback reserverar nu ett konfigurerat nummer och förbereder ditt portalkonto automatiskt." : "Vi kunde inte verifiera Stripe-sessionen från länken. Kontakta oss om du är osäker på statusen."}</p>
    <h2>Vad händer nu?</h2><p>{complete ? "Du får ett e-postmeddelande med ditt tilldelade Textback-nummer och en säker engångslänk för att välja lösenord. Ingen debitering sker förrän anslutningstesterna är godkända och tjänsten aktiveras." : "När Stripe har bekräftat registreringen startar den automatiska anslutningen. Du behöver inte skicka in uppgifterna igen."}</p>
    <p>Kontrollera även skräpposten. Engångslänken gäller i sju dagar.</p>
    <a className="button secondary" href="/">Tillbaka till Textback</a>{ready && <ConversionTracker event="pilot_payment_method_saved"/>}{legacyPaid && <ConversionTracker event="pilot_payment_completed"/>}
  </section></main>;
}
