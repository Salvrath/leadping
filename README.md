# Textback för bilverkstäder

Produktionsinriktad valideringssida för Leadpings produkt Textback. Den demonstrerar SMS-flödet utan verklig telefoni, räknar på ett försiktigt värde, samlar pilotansökningar via server action och länkar vidare till extern checkout.

## Lokal utveckling
1. Installera Node.js 20+ och kör `npm install`.
2. Kopiera miljöfilen: `cp .env.example .env.local`.
3. Sätt `NEXT_PUBLIC_SITE_URL=http://localhost:3000`.
4. Sätt valfritt en HTTPS-checkout i `NEXT_PUBLIC_TEXTBACK_PILOT_CHECKOUT_URL`. Utan den visas ett tydligt utvecklingsmeddelande.
5. Starta med `npm run dev` och öppna http://localhost:3000.

Kontroller: `npm run lint`, `npm run typecheck`, `npm test`, `npm run build`.

## Lead storage
`lib/lead-storage.ts` definierar `LeadStorage`. Development-adaptern skriver strukturerad JSON i serverloggen. För Supabase: skapa en server-only adapter som implementerar `save`, använd serverns hemliga miljövariabler, mappa validerad `Lead` till en skyddad tabell, aktivera RLS och byt exporten `leadStorage`. Lägg aldrig service-nyckeln i en `NEXT_PUBLIC_`-variabel och lagra aldrig leads i webbläsaren.

## Analytics och samtycke
`lib/analytics.ts` skapar ett anonymt sessions-id, UTM-kontext och filtrerar personuppgiftsnycklar. Den inbyggda leverantören skickar inget externt. Lägg senare adapterlyssnare på `textback:analytics`: GA4/Google Ads endast vid analyssamtycke, Meta/TikTok vid marknadsföringssamtycke. Lägg server-side conversions bakom en serverroute som återvaliderar payload, respekterar samtycke och aldrig tar emot formulärdata. Dokumentera cookies och databehandling innan aktivering.

## Vercel
Importera repositoryt i Vercel, välj Next.js, lägg in `NEXT_PUBLIC_SITE_URL` med produktionsdomänen och `NEXT_PUBLIC_TEXTBACK_PILOT_CHECKOUT_URL` med betalningsleverantörens HTTPS-länk, och deploya. Byt development storage till persistent adapter före annonsering. Verifiera alla juridiska placeholders, policyer, operatörsstöd och checkoutvillkor före offentlig lansering.

## Avgränsningar
Demo och dashboard använder tydligt märkt exempeldata. Ingen telefoni, SMS-leverans, betalningshantering, automatisk bokning, diagnos eller resultatgaranti finns i applikationen.
