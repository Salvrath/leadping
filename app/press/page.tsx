import type { Metadata } from "next";
import { siteUrl } from "@/lib/site";

export const metadata: Metadata = {
  title: "Press och logotyp",
  description: "Fakta, beskrivning och logotyp för Textback.",
  alternates: { canonical: "/press" },
};

export default function PressPage() {
  const schema={"@context":"https://schema.org","@type":"AboutPage",name:"Press och logotyp – Textback",url:`${siteUrl}/press`,about:{"@type":"Organization",name:"Textback",url:siteUrl,logo:`${siteUrl}/textback-logo.svg`}};
  return <main id="main" className="section"><script type="application/ld+json" dangerouslySetInnerHTML={{__html:JSON.stringify(schema)}}/><div className="shell narrow"><a href="/">← Till startsidan</a><div style={{marginTop:40,marginBottom:40}}><img src="/textback-logo.svg" width="360" height="90" alt="Textback logotyp"/></div><span className="eyebrow">Press och media</span><h1>Om Textback</h1><p className="lead">Textback är en svensk tjänst som hjälper företag att följa upp missade inkommande samtal med automatiska SMS. Kunden kan svara direkt och företaget får en tydlig förfrågan att följa upp.</p><h2>Kort beskrivning</h2><p>Textback skickar automatiskt ett SMS när ett företag missar ett samtal, så att kunden kan beskriva sitt ärende utan att behöva ringa igen.</p><h2>Logotyp</h2><p>Logotypen får användas vid redaktionell publicering om Textback. Ändra inte färger, proportioner eller ordmärke.</p><p><a className="button" href="/textback-logo.svg" download>Ladda ner logotyp som SVG</a></p><h2>Webbadress</h2><p><a href="https://textback.se">textback.se</a></p></div></main>;
}
