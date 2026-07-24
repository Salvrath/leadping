import { z } from "zod";

const text = (label: string, max: number) =>
  z.string().trim().min(2, `Ange ${label}`).max(max, `${label} är för långt`);

const attribution = z
  .string()
  .trim()
  .max(200)
  .regex(/^[A-Za-zÀ-ž0-9_. +\-/]*$/, "Ogiltig attribution")
  .optional()
  .transform((value) => value || undefined);

export const leadSchema = z.object({
  company: text("företagsnamn", 160),
  contact: text("kontaktperson", 120),
  email: z.string().trim().email("Ange en giltig e-postadress").max(254),
  phone: text("ett giltigt telefonnummer", 40),
  businessPhone: text("företagets huvudsakliga telefonnummer", 40),
  phoneNumbers: z.coerce.number().int().min(1, "Ange minst ett telefonnummer").max(100),
  telephony: text("operatör eller telefonilösning", 160),
  industry: z.string().trim().max(120).optional(),
  missedCalls: z.coerce.number().int().min(0).max(10000).optional(),
  message: z.string().trim().max(2000, "Meddelandet får vara högst 2 000 tecken").optional(),
  privacy: z.literal(true, { error: "Du måste godkänna integritetspolicyn" }),
  authority: z.literal(true, { error: "Du måste bekräfta att du får företräda företaget" }),
  submissionId: z.string().uuid(),
  formStartedAt: z.coerce.number().int().positive(),
  website: z.string().max(0),
  utmSource: attribution,
  utmMedium: attribution,
  utmCampaign: attribution,
  utmContent: attribution,
  utmTerm: attribution,
  landingPath: z.string().trim().max(500).startsWith("/").optional(),
  referrer: z.string().trim().url().max(500).optional().or(z.literal("")),
});

export type Lead = z.infer<typeof leadSchema>;
