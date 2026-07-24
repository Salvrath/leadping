export function applicationErrorMessage(error: unknown) {
  if (error instanceof Error && error.message === "DUPLICATE_SUBMISSION") return "Ansökan har redan tagits emot.";
  return "Ansökan kunde inte sparas just nu. Försök igen eller kontakta oss.";
}
