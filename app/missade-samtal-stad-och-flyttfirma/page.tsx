import type { Metadata } from "next";
import { IndustrySeoPage } from "@/components/industry-seo-page";

export const metadata: Metadata = {
  title: "Missade samtal för städ- och flyttfirma | Textback",
  description: "Textback skickar automatiskt SMS efter missade samtal så städ- och flyttföretag kan fånga offertförfrågningar även när personalen är ute på uppdrag.",
  alternates: { canonical: "/missade-samtal-stad-och-flyttfirma" },
  openGraph: {
    title: "Automatiskt SMS efter missat samtal för städ- och flyttföretag",
    description: "Fånga offertförfrågningar när ni är ute på uppdrag och inte kan svara.",
    url: "/missade-samtal-stad-och-flyttfirma",
    type: "website",
  },
};

const faq = [
  ["Kan kunden lämna uppgifter för en offert?", "Ja. Kunden kan svara med exempelvis adress, typ av tjänst, bostadens storlek och önskat datum."],
  ["Fungerar Textback även efter öppettid?", "När telefonilösningen stödjer upplägget kan ett missat samtal följas upp även när kontoret är stängt."],
  ["Behöver personalen installera en app?", "Exakt lösning beror på er telefoni. Vi kontrollerar kompatibiliteten innan beställningen slutförs."],
] as const;

export default function Page() {
  return <IndustrySeoPage
    eyebrow="Textback för städ- och flyttföretag"
    title="Fånga offertkunden medan teamet är ute på uppdrag."
    intro="När personalen städar, bär eller kör mellan uppdrag är det svårt att svara på varje samtal. Textback följer upp missade samtal med SMS så kunden kan lämna uppgifter för offert direkt."
    problems={[
      "Kontoret är obemannat medan teamet arbetar ute hos kund.",
      "Offertkunden kontaktar ofta flera företag under samma timme.",
      "En återuppringning utan uppgifter kräver extra tid och flera kontaktförsök.",
    ]}
    examples={[
      "Kunden kan ange adress, datum och vilken tjänst som behövs.",
      "Ni kan bedöma förfrågan innan ni ringer tillbaka.",
      "Offertunderlaget finns samlat när arbetsdagen lugnar ner sig.",
    ]}
    faq={faq}
  />;
}
