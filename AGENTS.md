# Textback – agentinstruktioner

## Produkt och fas
Textback är Leadpings B2B-validering för svenska bilverkstäder. Målet är att mäta verklig betalningsvilja innan full produkt byggs. Erbjudandet är automatisk SMS-uppföljning efter missade samtal: 495 kr exkl. moms första 30 dagarna, därefter 995 kr/månad, utan bindningstid och med återbetalning om aktivering inte fungerar.

## Stack och arkitektur
- Next.js App Router, React, TypeScript, Tailwind, Zod, Lucide; Vercel-kompatibelt.
- `app/` innehåller SSR-routes och server action. `components/` har isolerade klientöar. `lib/` har testbar domänlogik och adaptergränser.
- Formuläret valideras server-side med Zod och sparas via `LeadStorage`. Development-adaptern loggar strukturerad data enbart på servern. Ersätt adaptern med Supabase/annan databas före produktion.
- Efter godkänd ansökan visas checkout från `NEXT_PUBLIC_TEXTBACK_PILOT_CHECKOUT_URL`. Kortdata får aldrig passera applikationen.

## Analytics och consent
Tillåtna events: `page_view`, `hero_primary_cta_clicked`, `hero_secondary_cta_clicked`, `demo_started`, `demo_sms_sent`, `demo_customer_replied`, `demo_completed`, `calculator_changed`, `calculator_cta_clicked`, `pilot_form_started`, `pilot_form_submitted`, `checkout_clicked`, `faq_opened`, `final_cta_clicked`. Analys/marknadsföring kräver samtycke. Namn, e-post, telefon, organisationsnummer, verkstadsnummer och meddelanden får aldrig skickas till analytics.

## Säkerhet och GDPR
Minimera data, dokumentera syfte/lagring, använd leverantörsavtal och ge stöd för åtkomst/radering. Inga hemligheter eller checkoutlänkar i kod. Ingen localStorage för leads. Juridiska texter och placeholders måste verifieras före lansering. Skapa eller ändra inga binärfiler.

## Förbjudna genvägar
Bygg inte telefoni/SMS-infrastruktur, AI-agent, konton, verklig kunddashboard, boknings-/CRM-integration eller adminportal. Använd inte falska omdömen, logotyper, statistik, brådska eller resultatgarantier.

## Testkrav och definition of done
Kör `npm run lint`, `npm run typecheck`, `npm test` och `npm run build`. Kalkyl, validering, analyticsfiltrering, demo, checkoutfallback, consent och CTA ska testas. Klart betyder responsiv och tillgänglig sida, fungerande demo/kalkyl/form/serverflöde/checkout-abstraktion, juridiska utkast, consent och analytics utan persondata samt godkända kontroller.
