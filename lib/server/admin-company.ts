import "server-only";
import { z } from "zod";
import { normalizePhoneNumber } from "./telephony/number";

const DEFAULT_TEMPLATE = "Hej! Vi kunde inte svara just nu. Beskriv gärna vad du behöver hjälp med, så återkommer vi så snart vi kan. / {{businessName}}";

export const companyInputSchema = z.object({
  businessName: z.string().trim().min(2).max(120),
  providerNumber: z.string().trim().min(8).max(30),
  businessPhoneNumbers: z.string().trim().max(500),
  smsSender: z.string().trim().max(20).optional(),
  smsTemplate: z.string().trim().min(10).max(1000).default(DEFAULT_TEMPLATE),
  active: z.boolean().default(false),
});

export function parseCompanyForm(formData: FormData) {
  const parsed = companyInputSchema.parse({
    businessName: formData.get("businessName"),
    providerNumber: formData.get("providerNumber"),
    businessPhoneNumbers: formData.get("businessPhoneNumbers"),
    smsSender: formData.get("smsSender") || undefined,
    smsTemplate: formData.get("smsTemplate") || DEFAULT_TEMPLATE,
    active: String(formData.get("active")) === "true" || formData.get("active") === "on",
  });

  const providerNumber = normalizePhoneNumber(parsed.providerNumber);
  if (!providerNumber) throw new Error("INVALID_PROVIDER_NUMBER");

  const businessPhoneNumbers = parsed.businessPhoneNumbers
    .split(/[\n,;]/)
    .map((value) => normalizePhoneNumber(value))
    .filter((value): value is string => Boolean(value));

  if (!businessPhoneNumbers.length) throw new Error("INVALID_BUSINESS_PHONE_NUMBERS");
  if (new Set(businessPhoneNumbers).size !== businessPhoneNumbers.length) throw new Error("DUPLICATE_BUSINESS_PHONE_NUMBER");
  if (businessPhoneNumbers.includes(providerNumber)) throw new Error("PROVIDER_NUMBER_CANNOT_BE_BUSINESS_NUMBER");

  const sender = parsed.smsSender?.trim() || null;
  if (sender && !normalizePhoneNumber(sender) && !/^[A-Za-z0-9]{3,11}$/.test(sender)) throw new Error("INVALID_SMS_SENDER");

  return {
    provider: "46elks",
    business_name: parsed.businessName,
    provider_number: providerNumber,
    business_phone_numbers: businessPhoneNumbers,
    sms_sender: sender,
    sms_template: parsed.smsTemplate.replaceAll("{{businessName}}", "{{businessName}}"),
    active: parsed.active,
    updated_at: new Date().toISOString(),
  };
}

export const defaultSmsTemplate = DEFAULT_TEMPLATE;
