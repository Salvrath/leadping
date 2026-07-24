import type { Metadata } from "next";
import { Check, MessageSquareText, PhoneCall, ArrowRight } from "lucide-react";
import { Nav } from "@/components/nav";
import { FAQ } from "@/components/faq";
import { siteUrl } from "@/lib/site";

const title = "Automatiskt SMS vid missat samtal för företag";
const description = "Skicka automatiskt SMS när ditt företag missar ett samtal. Textback fångar kundens ärende direkt och samlar svaren för snabb uppföljning.";

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: "/automatiskt-sms-vid-missat-samtal" },
  openGraph: { title, description, url: "/automatiskt-sms-vid-missat-samtal", locale: "sv_SE", type: "website" },
};

const faq: [string, string][] = [
  ["Vad är ett automatiskt SMS vid missat samtal?", "Det är ett SMS som skickas till den som ringde när företaget inte kunde svara. Kunden kan då beskriva sitt ärende direkt i stället för att ringa nästa företag."],
  ["Kan kunden svara på meddelandet?", "Ja. Med Textback kan kundens svar samlas som en förfrågan som företaget kan följa upp."],
  ["Behöver vi byta telefonnummer?", "Målet är att ni ska kunna behålla era befintliga nummer. Exakt anslutning beror på operatör och telefonilösning och kontrolleras före beställning."],
  ["Fungerar tjänsten för flera telefonnummer?", "Ja. Ange hur många nummer ni vill ansluta så går vi igenom rätt upplägg för er telefoni."],
  ["Finns det bindningstid?", "Nej. Textback löper månadsvis och kan avslutas inför nästa betalningsperiod."],
];

const jsonLd = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "SoftwareApplication",
      name: "Textback",
      applicationCategory: "BusinessApplication",
      operatingSystem: "Web",
      description,
      url: `${siteUrl}/automatiskt-sms-vid-missat-samtal`,
      offers: { "@type": "Offer", price: "495", priceCurrency: "SEK", description: "Lanseringspris per månad under de första tre månaderna, exklusive moms." },
    },
    {
      "@type": "FAQPage",
      mainEntity: faq.map(([question, answer]) => ({ "@type": "Question", name: question, acceptedAnswer: { "@type": "Answer", text: answer } })),
    },
  ],
};

export default function Page() {
  return <><Nav/><main id="main">
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
    <section id="top" className="hero"><div className="shell hero-grid"><div><span className="eyebrow">Automatiskt SMS vid missat samtal</span><h1>Fånga kunden även när du inte kan svara.</h1><p className="lead">Textback skickar ett automatiskt SMS efter ett missat samtal. Kunden kan beskriva sitt ärende direkt och ni får en konkret förfrågan att följa upp.</p><div className="cta-row"><a className="button large" href="/#ansok">Kontrollera min telefoni <ArrowRight/></a><a className="button secondary large" href="/">Se hela Textback</a></div><ul className="trust"><li><Check/>495 kr/mån i tre månader</li><li><Check/>Ingen bindningstid</li><li><Check/>Kostnadsfri kompatibilitetskontroll</li></ul></div><div className="phone hero-phone"><div className="phone-top">Missat samtal · nu</div><div className="avatar">TB</div><b>Ditt företag</b><div className="bubble outgoing">Hej! Vi missade ditt samtal. Vad behöver du hjälp med?</div><div className="bubble incoming">Jag vill få en offert och bli kontaktad i eftermiddag.</div></div></div></section>
    <section className="section"><div className="shell"><div className="section-head"><span className="eyebrow">Så fungerar det</span><h2>Från missat samtal till kundärende i tre steg.</h2></div><div className="three-grid">{[[PhoneCall,"Samtalet missas","Ni är upptagna, sitter i möte eller har stängt."],[MessageSquareText,"SMS skickas automatiskt","Kunden får en direkt och professionell väg vidare."],[Check,"Ni följer upp","Kundens svar blir en förfrågan som går att ta hand om."]].map(([Icon,heading,text]:any)=><article className="step-card" key={heading}><Icon/><h3>{heading}</h3><p>{text}</p></article>)}</div></div></section>
    <section className="section bg-paper"><div className="shell two-col"><div><span className="eyebrow">För företag med inkommande samtal</span><h2>Minska risken att kunden ringer vidare.</h2><p>Ett automatiskt SMS vid missat samtal passar företag där telefonen ofta ringer samtidigt som arbetet pågår. Det kan vara hantverk, verkstad, klinik, salong, fastighetsservice, restaurang eller rådgivning.</p></div><div className="list-card"><ul>{["Behåll kundkontakten när ni är upptagna","Låt kunden beskriva sitt ärende direkt","Samla svar för strukturerad uppföljning","Använd företagets befintliga telefonnummer när lösningen är kompatibel"].map(item=><li key={item}><Check/>{item}</li>)}</ul></div></div></section>
    <section className="section"><div className="shell narrow"><div className="section-head"><span className="eyebrow">Vanliga frågor</span><h2>Om automatiska SMS efter missade samtal.</h2></div><FAQ items={faq}/></div></section>
    <section className="final-cta"><div className="shell"><h2>Se om Textback fungerar med er telefoni.</h2><p>Vi kontrollerar kompatibiliteten kostnadsfritt innan ni beställer.</p><div className="cta-row center"><a className="button large" href="/#ansok">Kontrollera min telefoni</a></div></div></section>
  </main></>;
}
