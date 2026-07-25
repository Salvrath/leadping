import { describe, expect, it } from "vitest";
import { parseCompanyForm } from "@/lib/server/admin-company";

function form(values: Record<string, string>) {
  const data = new FormData();
  for (const [key, value] of Object.entries(values)) data.set(key, value);
  return data;
}

describe("admin company form", () => {
  it("normalizes Swedish company and provider numbers", () => {
    const result = parseCompanyForm(form({
      businessName: "Testverkstaden",
      providerNumber: "070 999 88 77",
      businessPhoneNumbers: "0243-12 34 56\n070-123 45 67",
      smsTemplate: "Hej! Vi återkommer snart. / {{businessName}}",
      smsSender: "Textback",
    }));
    expect(result.provider_number).toBe("+46709998877");
    expect(result.business_phone_numbers).toEqual(["+46243123456", "+46701234567"]);
    expect(result.active).toBe(false);
  });

  it("rejects a provider number reused as a business number", () => {
    expect(() => parseCompanyForm(form({
      businessName: "Testverkstaden",
      providerNumber: "+46709998877",
      businessPhoneNumbers: "+46709998877",
      smsTemplate: "Hej! Vi återkommer snart. / {{businessName}}",
    }))).toThrow("PROVIDER_NUMBER_CANNOT_BE_BUSINESS_NUMBER");
  });
});
