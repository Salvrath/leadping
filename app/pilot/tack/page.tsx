import type { Metadata } from "next";
import { CheckCircle2, Clock3 } from "lucide-react";
import { getStripe } from "@/lib/server/stripe";
import { ConversionTracker } from "@/components/conversion-tracker";
export const metadata: Metadata = { title: "Tack för din beställning – Textback", robots: { index: false, follow: false } };

export default async function Page({ searchParams }: { searchParams: { session_id?: string } }) {
  let paid = false; let verified = false;
  if (searchParams.session_id?.startsWith("cs_")) try {
    const session = await getStripe().checkout.sessions.retrieve(searchParams.session_id);
    verified = Boolean(session.metadata?.pilot_lead_id);
    paid = verified && ["paid", "no_payment_required"].includes(session.payment_status);
  } catch { /* neutral state below */ }
  return <main className="section"><section className="shell narrow success-card standalone" tabIndex={-1}>
    {paid ? <CheckCircle2 size={48}/> : <Clock3 size={48}/>}<span className="eyebrow">Textback-beställning</span>
    <h1>{paid ? "Betalningen är mottagen." : "Betalningen behandlas."}</h1>
    <p>{verified ? "Stripe-sessionen har verifierats. Textback reserverar nu ett konfigurerat nummer och förbereder ditt portalkonto automatiskt." : "Vi kunde inte verifiera betalningssessionen från länken. Kontakta oss om du är osäker på betalningsstatusen."}</p>
    <h2>Vad händer nu?</h2><p>{paid ? "Du får ett e-postmeddelande med ditt tilldelade Textback-nummer och en säker engångslänk för att välja lösenord. Därefter följer du anslutningsguiden och tjänsten aktiveras automatiskt när testerna är godkända." : "När Stripe har bekräftat betalningen startar den automatiska anslutningen. Du behöver inte skicka in uppgifterna igen."}</p>
    <p>Kontrollera även skräpposten. Engångslänken gäller i sju dagar.</p>
    <a className="button secondary" href="/">Tillbaka till Textback</a>{paid && <ConversionTracker event="pilot_payment_completed"/>}
  </section></main>;
}
