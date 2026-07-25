import { describe, expect, it } from "vitest";
import type { Lead } from "@/lib/lead-schema";
import { customerApplicationEmail, internalApplicationEmail } from "@/lib/server/notification-templates";

const lead = {
  company: "Exempelverkstaden AB",
  contact: "Anna Andersson",
  email: "anna@example.se",
  phone: "0701234567",
  businessPhone: "0243123456",
  phoneNumbers: 2,
  telephony: "Telia Företag",
  industry: "Bilverkstad",
  missedCalls: 12,
  message: "Vi vill ansluta två nummer.",
  privacy: true,
  authority: true,
  submissionId: "18d03f35-9dd3-4377-99f0-245d745f1a3b",
  formStartedAt: 1,
  website: "",
  utmSource: "google",
  landingPath: "/",
  referrer: "",
} as Lead;

describe("Textback application emails", () => {
  it("creates a useful customer confirmation in text and HTML", () => {
    const email = customerApplicationEmail(lead, "lead-123");
    expect(email.subject).toContain("tagit emot");
    expect(email.text).toContain("Hej Anna");
    expect(email.text).toContain("Exempelverkstaden AB");
    expect(email.text).toContain("Referens: lead-123");
    expect(email.text).toContain("info@textback.se");
    expect(email.html).toContain("Exempelverkstaden AB");
  });

  it("includes all operational fields in the internal notification", () => {
    const email = internalApplicationEmail(lead, "lead-123");
    expect(email.subject).toContain("Exempelverkstaden AB");
    expect(email.text).toContain("E-post: anna@example.se");
    expect(email.text).toContain("Antal nummer: 2");
    expect(email.text).toContain("Telefoni: Telia Företag");
    expect(email.text).toContain("Missade samtal/vecka: 12");
    expect(email.text).toContain("Attribution: google");
  });

  it("removes executable tags from customer HTML", () => {
    const email = customerApplicationEmail({ ...lead, company: '<script>alert("x")</script>' } as Lead, "lead-123");
    expect(email.html).not.toContain("<script>");
  });
});
