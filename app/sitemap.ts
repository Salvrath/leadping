import type { MetadataRoute } from "next";
import { siteUrl } from "@/lib/site";

export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date();
  return [
    { url: siteUrl, lastModified, changeFrequency: "weekly", priority: 1 },
    { url: `${siteUrl}/automatiskt-sms-vid-missat-samtal`, lastModified, changeFrequency: "monthly", priority: 0.9 },
    { url: `${siteUrl}/missade-samtal-hantverkare`, lastModified, changeFrequency: "monthly", priority: 0.8 },
    { url: `${siteUrl}/missade-samtal-bilverkstad`, lastModified, changeFrequency: "monthly", priority: 0.8 },
    { url: `${siteUrl}/missade-samtal-stad-och-flyttfirma`, lastModified, changeFrequency: "monthly", priority: 0.8 },
    { url: `${siteUrl}/integritet`, lastModified, changeFrequency: "yearly", priority: 0.2 },
    { url: `${siteUrl}/villkor`, lastModified, changeFrequency: "yearly", priority: 0.2 },
    { url: `${siteUrl}/pilotvillkor`, lastModified, changeFrequency: "yearly", priority: 0.2 },
    { url: `${siteUrl}/cookies`, lastModified, changeFrequency: "yearly", priority: 0.2 },
  ];
}
