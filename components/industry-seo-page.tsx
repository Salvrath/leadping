import Link from "next/link";
import { Check, PhoneCall, MessageSquareText, ArrowRight } from "lucide-react";

type FAQ = readonly [string, string];

type Props = {
  eyebrow: string;
  title: string;
  intro: string;
  problems: readonly string[];
  examples: readonly string[];
  faq: readonly FAQ[];
};

export function IndustrySeoPage({ eyebrow, title, intro, problems, examples, faq }: Props) {
  const structuredData = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faq.map(([name, text]) => ({
      "@type": "Question",
      name,
      acceptedAnswer: { "@type": "Answer", text },
    })),
  };

  return <>
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }} />
    <main id="main">
      <section className="hero"><div className="shell narrow">
        <span className="eyebrow">{eyebrow}</span>
        <h1>{title}</h1>
        <p className="lead">{intro}</p>
        <div className="cta-row"><Link href="/#ansok" className="button large">Kontrollera er telefoni <ArrowRight /></Link><Link href="/automatiskt-sms-vid-missat-samtal" className="button secondary large">Så fungerar Textback</Link></div>
        <ul className="trust"><li><Check />495 kr/mån i tre månader</li><li><Check />Ingen bindningstid</li><li><Check />Kontroll före beställning</li></ul>
      </div></section>

      <section className="section"><div className="shell"><div className="section-head"><span className="eyebrow">Problemet</span><h2>När telefonen ringer mitt i arbetet</h2></div><div className="three-grid">{problems.map((problem) => <article className="step-card" key={problem}><PhoneCall /><p>{problem}</p></article>)}</div></div></section>

      <section className="section bg-paper"><div className="shell"><div className="section-head"><span className="eyebrow">Automatisk uppföljning</span><h2>Ett SMS håller kundkontakten vid liv</h2><p>När ett samtal registreras som missat kan Textback skicka ett anpassat SMS. Kunden kan svara med sitt ärende och företaget får en konkret förfrågan att följa upp.</p></div><div className="three-grid">{examples.map((example) => <article className="step-card" key={example}><MessageSquareText /><p>{example}</p></article>)}</div></div></section>

      <section className="section"><div className="shell narrow"><div className="section-head"><span className="eyebrow">Vanliga frågor</span><h2>Det praktiska</h2></div>{faq.map(([question, answer]) => <article className="list-card" key={question}><h3>{question}</h3><p>{answer}</p></article>)}</div></section>

      <section className="final-cta"><div className="shell"><h2>Se om Textback fungerar med er nuvarande telefoni.</h2><p>Kompatibilitetskontrollen är kostnadsfri. Ingen betalning sker innan ni har fått besked och bekräftat beställningen.</p><div className="cta-row center"><Link href="/#ansok" className="button large">Kontrollera er telefoni</Link></div></div></section>
    </main>
  </>;
}
