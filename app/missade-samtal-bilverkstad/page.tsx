import type { Metadata } from "next";
import { IndustrySeoPage } from "@/components/industry-seo-page";

export const metadata: Metadata = {
  title: "Missade samtal på bilverkstad | Automatiskt SMS med Textback",
  description: "Textback skickar automatiskt SMS efter missade samtal så bilverkstäder kan fånga boknings- och serviceförfrågningar även när personalen är upptagen.",
  alternates: { canonical: "/missade-samtal-bilverkstad" },
  openGraph: {
    title: "Automatiskt SMS efter missat samtal för bilverkstäder",
    description: "Fånga service- och bokningsförfrågningar när verkstaden inte hinner svara.",
    url: "/missade-samtal-bilverkstad",
    type: "website",
  },
};

const faq = [
  ["Kan kunden beskriva bilens problem i svaret?", "Ja. Kunden kan svara med exempelvis registreringsnummer, symptom och önskad tid för kontakt."],
  ["Kan flera verkstadsnummer anslutas?", "Ange hur många nummer ni använder i formuläret så går vi igenom ett lämpligt upplägg för er telefoni."],
  ["Ersätter Textback vårt bokningssystem?", "Nej. Textback fångar upp kundens ärende efter ett missat samtal. Bokning och verkstadsplanering hanteras fortsatt i era ordinarie system."],
] as const;

export default function Page() {
  return <IndustrySeoPage
    eyebrow="Textback för bilverkstäder"
    title="Fånga servicekunden när verkstaden inte hinner svara."
    intro="Telefonen ringer ofta samtidigt som personalen tar emot bilar, hjälper kunder på plats eller arbetar i verkstaden. Textback skickar ett automatiskt SMS efter det missade samtalet så kunden kan beskriva sitt ärende."
    problems={[
      "Kundmottagningen hjälper redan en kund när nästa samtal kommer.",
      "Mekaniker och tekniker kan inte lämna arbetet för att svara.",
      "Kunden ringer flera verkstäder och väljer ofta den som svarar först.",
    ]}
    examples={[
      "Kunden kan skicka registreringsnummer och beskriva felet.",
      "Ni får en tydlig serviceförfrågan att prioritera och följa upp.",
      "Färre samtal behöver återringas utan sammanhang.",
    ]}
    faq={faq}
  />;
}
