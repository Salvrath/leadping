import type { Metadata } from "next";
import { CheckCircle2, Clock3 } from "lucide-react";
import { getStripe } from "@/lib/server/stripe";
import { ConversionTracker } from "@/components/conversion-tracker";
export const metadata: Metadata = { title: "Tack för din pilotbetalning – Textback", robots: { index: false, follow: false } };

export default async function Page({ searchParams }: { searchParams: { session_id?: string } }) {
  let paid = false; let verified = false;
  if (searchParams.session_id?.startsWith("cs_")) try {
    const session = await getStripe().checkout.sessions.retrieve(searchParams.session_id);
    verified = Boolean(session.metadata?.pilot_lead_id);
    paid = verified && session.payment_status === "paid";
  } catch { /* neutral state below */ }
  return <main className="section"><section className="shell narrow success-card standalone" tabIndex={-1}>
    {paid ? <CheckCircle2 size={48}/> : <Clock3 size={48}/>}<span className="eyebrow">Pilotbetalning</span>
    <h1>{paid ? "Betalningen är mottagen." : "Betalningen behandlas."}</h1>
    <p>{verified ? "Stripe-sessionen har verifierats. Webhooken registrerar betalningsstatusen i vårt pilotsystem." : "Vi kunde inte verifiera betalningssessionen från länken. Kontakta oss om du är osäker på betalningsstatusen."}</p>
    <h2>Vad händer nu?</h2><p>Leadping kontrollerar kompatibiliteten med verkstadens telefonilösning och kontaktar er. En betalning innebär inte att kompatibiliteten är godkänd. Om tjänsten inte kan aktiveras hanteras återbetalning enligt pilotvillkoren.</p>
    <a className="button secondary" href="/">Tillbaka till Textback</a>{paid && <ConversionTracker event="pilot_payment_completed"/>}
  </section></main>;
}
