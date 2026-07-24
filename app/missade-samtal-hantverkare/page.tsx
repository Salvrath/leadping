import type { Metadata } from "next";
import { IndustrySeoPage } from "@/components/industry-seo-page";

export const metadata: Metadata = {
  title: "Missade samtal för hantverkare | Automatiskt SMS med Textback",
  description: "Textback skickar automatiskt SMS efter missade samtal så hantverkare kan fånga offertförfrågningar även när de arbetar ute hos kund.",
  alternates: { canonical: "/missade-samtal-hantverkare" },
  openGraph: {
    title: "Automatiskt SMS efter missat samtal för hantverkare",
    description: "Fånga kundens ärende direkt även när du inte kan svara i telefon.",
    url: "/missade-samtal-hantverkare",
    type: "website",
  },
};

const faq = [
  ["Behöver vi byta telefonnummer?", "I normalfallet är målet att ni ska behålla ert befintliga nummer. Exakt anslutning beror på operatör och telefonilösning."],
  ["Kan SMS:et anpassas för vår verksamhet?", "Ja. Meddelandet kan anpassas med företagets namn och en tydlig fråga om vad kunden behöver hjälp med."],
  ["Fungerar det när vi arbetar ute hos kund?", "Det är ett av de vanligaste användningsfallen. Kunden får en direkt kontaktväg även när ni inte kan avbryta arbetet för att svara."],
] as const;

export default function Page() {
  return <IndustrySeoPage
    eyebrow="Textback för hantverkare"
    title="Fånga offertförfrågan även när du missar samtalet."
    intro="Elektriker, VVS-företag, snickare och andra hantverkare kan sällan svara i telefon mitt under ett jobb. Textback följer upp missade samtal med SMS så kunden kan beskriva sitt ärende direkt."
    problems={[
      "Du arbetar med händerna och kan inte avbryta för varje samtal.",
      "Kunden vill ofta ha offert snabbt och ringer annars nästa företag.",
      "Återuppringning senare fungerar sämre när kundens behov redan har gått vidare.",
    ]}
    examples={[
      "Kunden kan skriva vilken typ av arbete som behövs.",
      "Du kan prioritera akuta ärenden och relevanta offerter.",
      "Förfrågan finns kvar när du får tid att följa upp.",
    ]}
    faq={faq}
  />;
}
