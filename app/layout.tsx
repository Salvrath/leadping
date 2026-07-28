import type { Metadata } from "next";
import "./globals.css";
import { CookieBanner } from "@/components/cookie-banner";
import { PageTracker } from "@/components/page-tracker";
import { GoogleTagManager } from "@/components/gtm";
import { GoogleAdsConversion } from "@/components/google-ads-conversion";
import { VercelAnalytics } from "@/components/vercel-analytics";
import { siteName, siteUrl } from "@/lib/site";

const title = "Automatiskt SMS vid missat samtal | Textback";
const description = "Textback skickar automatiskt SMS när ditt företag missar ett samtal. Fånga kundens ärende direkt, samla svar i en leadinkorg och följ upp i tid.";
const googleVerification = process.env.GOOGLE_SITE_VERIFICATION;

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: { default: title, template: "%s | Textback" },
  description,
  applicationName: "Textback",
  category: "business",
  keywords: ["automatiskt SMS vid missat samtal","missat samtal SMS","SMS efter missat samtal","missade samtal företag","automatisk kunduppföljning"],
  alternates: { canonical: "/" },
  icons: { icon: "/icon.svg" },
  manifest: "/manifest.webmanifest",
  openGraph: { title, description, type: "website", locale: "sv_SE", siteName, url: "/", images: [{ url: "/opengraph-image", width: 1200, height: 630, alt: "Textback – Missa samtalet, inte kunden" }] },
  twitter: { card: "summary_large_image", title, description, images: ["/opengraph-image"] },
  robots: { index: true, follow: true, googleBot: { index: true, follow: true, "max-image-preview": "large", "max-snippet": -1 } },
  verification: googleVerification ? { google: googleVerification } : undefined,
};

const organization = {"@context":"https://schema.org","@type":"Organization",name:"Textback",url:siteUrl,logo:`${siteUrl}/textback-logo.svg`,description:"Textback hjälper företag att följa upp missade samtal med automatiska SMS."};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="sv"><body><script type="application/ld+json" dangerouslySetInnerHTML={{__html:JSON.stringify(organization)}}/><a className="skip" href="#main">Hoppa till innehållet</a>{children}<CookieBanner/><PageTracker/><GoogleTagManager/><GoogleAdsConversion/><VercelAnalytics/></body></html>;
}
