export const conversationStatuses = ["new", "open", "contacted", "closed"] as const;
export type ConversationStatus = typeof conversationStatuses[number];

export function statusLabel(status: string) {
  return ({ new: "Nytt", open: "Pågående", contacted: "Kontaktad", closed: "Avslutad" } as Record<string, string>)[status] || status;
}
