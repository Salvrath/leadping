import type { Metadata } from "next";
import { startCheckout } from "@/app/actions";
import { ConversionTracker } from "@/components/conversion-tracker";
import { z } from "zod";
export const metadata: Metadata = { title: "Betalningen avbröts – Textback", robots: { index: false, follow: false } };
export default function Page({ searchParams }: { searchParams: { lead_id?: string; reason?: string } }) {
  const leadId = z.string().uuid().safeParse(searchParams.lead_id);
  return <main className="section"><section className="shell narrow success-card standalone"><span className="eyebrow">Ingen färdig betalning</span><h1>Betalningen slutfördes inte.</h1>
    <p>Ingen färdig pilotbetalning har registrerats från detta försök. Ansökan finns kvar och kompatibiliteten är ännu inte godkänd.</p>
    {leadId.success && <form action={startCheckout}><input type="hidden" name="leadId" value={leadId.data}/><button className="button">Försök betala igen</button></form>}
    <p>Har du frågor? Kontakta <a className="text-link" href="mailto:[KONTAKTMEJL]">[KONTAKTMEJL]</a>.</p><a className="button secondary" href="/">Tillbaka till Textback</a>
    <ConversionTracker event={searchParams.reason === "unavailable" ? "pilot_payment_failed" : "pilot_checkout_cancelled"}/>
  </section></main>;
}
