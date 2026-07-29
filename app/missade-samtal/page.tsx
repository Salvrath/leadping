import type { Metadata } from "next";
import Link from "next/link";
import { Check, MessageSquareText, PhoneCall, ShieldCheck, Sparkles } from "lucide-react";
import { PilotForm } from "@/components/pilot-form";
import { TrackedLink } from "@/components/tracked-link";
import { isCommerceEnabled } from "@/lib/launch-mode";
import { hasMerchantIdentity } from "@/lib/legal";
import "./ads.css";

export const metadata: Metadata = {
  title: "Missade kundsamtal? Skicka SMS automatiskt",
  description: "Textback skickar automatiskt ett SMS när företaget inte kan svara. Testa med ett riktigt samtal och se hur missade samtal blir kundförfrågningar.",
  alternates: { canonical: "/missade-samtal" },
  robots: { index: true, follow: true },
};

export default function MissadeSamtalPage() {
  const commerceEnabled = isCommerceEnabled() && hasMerchantIdentity();
  const demoNumber = process.env.NEXT_PUBLIC_TEXTBACK_DEMO_NUMBER || "+46766867723";
  const displayNumber = "076-686 77 23";

  return <div className="ads-page">
    <header className="ads-shell ads-header">
      <Link href="/" aria-label="Textbacks startsida"><img src="/textback-logo.svg" alt="Textback" width="170" height="43"/></Link>
      <span className="ads-header-note">Automatisk uppföljning av missade kundsamtal</span>
    </header>

    <main id="main">
      <section className="ads-hero">
        <div className="ads-shell ads-hero-grid">
          <div>
            <span className="ads-kicker"><Sparkles size={15}/> Automatiskt SMS vid missat samtal</span>
            <h1>Missar ni samtalet?<br/><em>Behåll kunden.</em></h1>
            <p className="ads-lead">Textback skickar automatiskt ett SMS när företaget inte kan svara. Kunden kan beskriva sitt ärende direkt och ni får en konkret förfrågan att följa upp.</p>
            <div className="ads-cta">
              <TrackedLink href={`tel:${demoNumber}`} event="demo_phone_clicked" className="button large"><PhoneCall/> Ring och testa</TrackedLink>
              <a href="#ansok" className="button secondary large">Få Textback till företaget</a>
            </div>
            <ul className="ads-proof">
              <li><Check size={17}/> Testa med ett riktigt samtal</li>
              <li><Check size={17}/> Ingen bindningstid</li>
              <li><Check size={17}/> Från 495 kr/mån exkl. moms</li>
            </ul>
          </div>

          <aside className="ads-demo-card">
            <span className="ads-kicker" style={{color:"#7ee0c7"}}><PhoneCall size={15}/> Live-demo</span>
            <h2>Upplev kundens sida på under en minut.</h2>
            <TrackedLink className="ads-demo-number" href={`tel:${demoNumber}`} event="demo_phone_clicked">{displayNumber}</TrackedLink>
            <ol><li>Ring från mobilen.</li><li>Vänta tills samtalet avslutas.</li><li>Öppna SMS:et som Textback skickar tillbaka.</li></ol>
            <div className="bubble">Hej! Du har testat Textback. Fånga missade samtal automatiskt och få fler kundärenden.</div>
          </aside>
        </div>
      </section>

      <section className="ads-section white">
        <div className="ads-shell">
          <div className="ads-section-head"><span className="ads-kicker">Så fungerar det</span><h2>Tre steg från missat samtal till kundärende.</h2></div>
          <div className="ads-steps">
            <article className="ads-step"><span>1</span><h3>Kunden ringer ert vanliga nummer</h3><p>Ni behöver inte byta det nummer som kunderna redan använder.</p></article>
            <article className="ads-step"><span>2</span><h3>Textback fångar upp ej svar</h3><p>När samtalet vidarekopplas registreras det som missat.</p></article>
            <article className="ads-step"><span>3</span><h3>Kunden får ett SMS</h3><p>Kunden svarar med sitt ärende och svaret samlas i er leadinkorg.</p></article>
          </div>
        </div>
      </section>

      <section className="ads-section">
        <div className="ads-shell ads-value-grid">
          <article className="ads-value-card"><MessageSquareText size={28}/><h3>Fånga kunden medan behovet är aktuellt</h3><p>Kunden får en väg vidare direkt i stället för att ringa nästa företag på listan.</p></article>
          <article className="ads-value-card"><ShieldCheck size={28}/><h3>Enkel uppföljning i samma inkorg</h3><p>Se kundens nummer, meddelande och status och svara via SMS från Textback.</p></article>
          <article className="ads-value-card"><PhoneCall size={28}/><h3>Passar företag som arbetar med händerna</h3><p>VVS, el, bygg, verkstad, städ, flytt och andra verksamheter där telefonen ofta ringer mitt i arbetet.</p></article>
          <article className="ads-value-card"><span className="ads-kicker">Pris</span><div className="ads-price"><strong>495 kr</strong><span>/månad i 3 månader</span></div><p>Därefter 995 kr/mån exklusive moms. Ingen bindningstid.</p></article>
        </div>
      </section>

      <section id="ansok" className="ads-section navy">
        <div className="ads-shell ads-form-grid">
          <div className="ads-form-copy">
            <span className="ads-kicker" style={{color:"#7ee0c7"}}>Nästa steg</span>
            <h2>Få Textback anslutet till ert företag.</h2>
            <p>Skicka företagsuppgifterna så går vi igenom telefonilösningen och nästa steg för anslutningen.</p>
            <ul><li><Check size={18}/> Kostnadsfri intresseanmälan</li><li><Check size={18}/> Ingen beställning eller betalning i formuläret</li><li><Check size={18}/> Ni behåller företagets vanliga telefonnummer</li></ul>
          </div>
          <PilotForm commerceEnabled={commerceEnabled} variant="ads"/>
        </div>
      </section>
    </main>

    <footer className="ads-shell ads-footer"><div className="ads-footer-inner"><span>© 2026 Textback</span><span><a href="/integritet">Integritet</a> · <a href="/villkor">Villkor</a> · info@textback.se</span></div></footer>
    <div className="ads-mobile-bar"><TrackedLink href={`tel:${demoNumber}`} event="demo_phone_clicked" className="button"><PhoneCall size={16}/> Testa</TrackedLink><a href="#ansok" className="button secondary">Anmäl intresse</a></div>
  </div>;
}