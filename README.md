# Textback – produktionsfunnel för pilotkunder

Next.js-funnel för Leadpings Textback-pilot: demo och kalkylator, servervaliderad ansökan, permanent Supabase-lagring, Stripe Checkout, signerad/idempotent webhook, valfria Resend-notifieringar och samtyckesstyrd GTM-mätning. Ingen telefoni eller SMS-infrastruktur ingår.

## Lokal start

Krav: Node.js 20+, npm och valfritt Supabase CLI/Stripe CLI.

```bash
npm install
cp .env.example .env.local
npm run dev
```

Utan Supabase används en minnesadapter **endast** i `development`/`test`. Produktion vägrar godkänna ansökningar om Supabase saknas. Notifieringar är avstängda om Resend-variablerna saknas.

## 1. Supabase

1. Skapa ett Supabase-projekt och öppna **Project Settings → API**.
2. Lägg projektets URL i `SUPABASE_URL` och service-role-nyckeln i `SUPABASE_SERVICE_ROLE_KEY`. Nyckeln är server-only och får aldrig heta `NEXT_PUBLIC_*`.
3. Kör `supabase/migrations/20260723_create_textback_pilot_funnel.sql` via SQL Editor, eller länka CLI:t och kör `supabase db push`.
4. Kontrollera att `pilot_leads` och `stripe_webhook_events` har RLS aktiverat och saknar anon/authenticated-policyer. Endast service role används från serverkoden.

Migrationen skapar statusconstraints, unik `submission_id`, Stripe-referenser och webhook-ledger för idempotens.

Kör migrationerna i ordning:

1. `supabase/migrations/20260723_create_textback_pilot_funnel.sql`
2. `supabase/migrations/20260723_harden_stripe_webhook_claim.sql`

Den andra migrationen skapar en service-role-only RPC som atomiskt claimar nya eller tidigare felade Stripe-event. Det förhindrar parallell behandling av samma retry.

## 2. Stripe Checkout och webhook

1. Skapa en produkt i Stripe Dashboard och en Price för pilotmånaden. Konfigurera belopp, valuta och tax behavior i Stripe – de hårdkodas inte i koden.
2. Sätt Price-id i `STRIPE_PILOT_PRICE_ID` och testnyckeln i `STRIPE_SECRET_KEY`.
3. Skapa webhook endpoint `https://DIN-DOMÄN/api/stripe/webhook` för `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `checkout.session.async_payment_failed`, `checkout.session.expired` och `charge.refunded`.
4. Lägg signing secret i `STRIPE_WEBHOOK_SECRET`.

Lokalt kan Stripe CLI användas:

```bash
stripe login
stripe listen --forward-to localhost:3000/api/stripe/webhook
```

Kopiera CLI:ts tillfälliga `whsec_…` till lokal `STRIPE_WEBHOOK_SECRET`. Genomför ett testköp via formuläret. Kontrollera att status, betalningsstatus, datum och Stripe-referenser uppdateras av webhooken samt att eventet har `processed_at` i ledgern. Success-sidan verifierar sessionen men markerar aldrig databasen som betald.

## 3. Resend

Verifiera en avsändardomän, sätt `RESEND_API_KEY`, `TEXTBACK_FROM_EMAIL` och `TEXTBACK_NOTIFICATION_EMAIL`, och testa både ansökan och betalning. Leveransfel loggas utan leadinnehåll och påverkar inte kärnflödet.

## 4. Consent, GTM och annonser

Sätt valfritt `NEXT_PUBLIC_GTM_ID`. GTM laddas först efter analyssamtycke. Sanitiserade events pushas till `dataLayer`; namn, e-post, telefon, organisationsnummer, fritext samt Stripe-/kund-/betalningsidentiteter filtreras bort. Utan GTM fungerar applikationen fortsatt.

Konfigurera GA4 och Google Ads som GTM-tags med centrala eventnamn. Meta och TikTok kan senare läggas som GTM-tags bakom marknadsföringssamtycke utan kodändringar. Verifiera consent-trigger och payload i GTM Preview.

## 5. Vercel, testköp och live mode

1. Importera repositoryt som Next.js-projekt i Vercel.
2. Lägg samtliga variabler från `.env.example` i rätt Preview/Production-miljö. Sätt `NEXT_PUBLIC_SITE_URL` till exakt HTTPS-origin.
3. Deploya och uppdatera Stripe-webhooken till Vercel-domänen.
4. Skicka en testansökan; verifiera databasrad, attribution och notifiering.
5. Betala med Stripe-testkort; verifiera success-route, webhook-ledger och `payment_status=paid`.
6. Kontrollera i privat fönster att GTM inte laddas före samtycke.
7. Följ `docs/PILOT_LAUNCH_CHECKLIST.md`.
8. Inför live: skapa live Price, byt till live secret/webhook secret i Vercel Production och gör ett kontrollerat liveköp. Återanvänd aldrig testnycklar eller test-Price.

## Miljövariabler

- Publika: `NEXT_PUBLIC_SITE_URL`, valfri `NEXT_PUBLIC_GTM_ID`.
- Server-only: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PILOT_PRICE_ID` och valfria Resend-variabler.

## Kontroller

```bash
npm run lint
npm run typecheck
npm test
npm run build
```

GitHub Actions kör samma kontroller med Node.js 20 vid pull requests mot `main` och push till `main`. CI använder mocks/testmiljö och kräver inga riktiga Supabase-, Stripe- eller Resend-hemligheter.

Juridiska sidor är utkast. Ersätt `[FÖRETAGSNAMN]`, `[ORGANISATIONSNUMMER]`, `[ADRESS]` och `[KONTAKTMEJL]`, stäm av landningssidans pris mot Stripe Price och genomför juridisk granskning före offentlig lansering.
