export function applicationErrorMessage(error: unknown) {
  if (error instanceof Error && error.message === "DUPLICATE_SUBMISSION") return "Ansökan har redan tagits emot.";
  if (error instanceof Error && error.message === "MERCHANT_IDENTITY_NOT_CONFIGURED") return "Självbetjäningen öppnar när Textbacks fullständiga företagsuppgifter har publicerats. Ingen betalmetod har registrerats.";
  if (error instanceof Error && error.message === "PAYMENTS_NOT_CONFIGURED") return "Betalningsflödet är inte färdigkonfigurerat. Ingen betalmetod har registrerats.";
  return "Ansökan kunde inte behandlas just nu. Försök igen eller kontakta oss.";
}
