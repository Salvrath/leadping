# Textback – checklista inför pilotlansering

## Infrastruktur och betalning
- [ ] Supabase-migrationerna `20260723_create_textback_pilot_funnel.sql` och `20260723_harden_stripe_webhook_claim.sql` är körda i ordning.
- [ ] RLS är verifierad på båda tabellerna och inga anon/authenticated-policyer finns.
- [ ] Stripe test mode är testat från ansökan till verifierad webhook.
- [ ] Stripe live-produkt och live Price är skapade med korrekt skatt, valuta och belopp.
- [ ] Stripe-webhookens signatur, idempotens och samtliga eventtyper är verifierade.
- [ ] Resend-notifieringsmejl är testat för både ansökan och betalning.

## Juridik och mätning
- [ ] Företagsuppgifter och kontaktuppgifter är ifyllda.
- [ ] Pilotvillkor är juridiskt granskade.
- [ ] Integritets- och cookieutkast är granskade och leverantörslistan är aktuell.
- [ ] GTM-konfiguration och consent mode är testade utan personuppgifter.

## Slutlig kvalitet
- [ ] En testansökan är genomförd och syns korrekt i `pilot_leads`.
- [ ] En testbetalning är genomförd och status/Stripe-referenser har uppdaterats av webhooken.
- [ ] Mobiltest från 320 px och desktoptest är genomförda utan horisontell scroll.
- [ ] Vercel-produktionsdomän, success/cancel-routes, robots och sitemap är testade.
- [ ] Inga utvecklingsplaceholders, testnycklar eller test-Prices finns kvar i live-konfigurationen.
