import type { Metadata } from "next";
import "./globals.css";
import { CookieBanner } from "@/components/cookie-banner";
import { PageTracker } from "@/components/page-tracker";
import { GoogleTagManager } from "@/components/gtm";
import { siteName, siteUrl } from "@/lib/site";

const title = "Automatiskt SMS vid missat samtal | Textback";
const description = "Textback skickar automatiskt SMS när ditt företag missar ett samtal. Fånga kundens ärende direkt, samla svar i en leadinkorg och följ upp i tid.";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: { default: title, template: "%s | Textback" },
  description,
  applicationName: "Textback",
  category: "business",
  keywords: [
    "automatiskt SMS vid missat samtal",
    "missat samtal SMS",
    "SMS efter missat samtal",
    "missade samtal företag",
    "automatisk kunduppföljning",
  ],
  alternates: { canonical: "/" },
  openGraph: {
    title,
    description,
    type: "website",
    locale: "sv_SE",
    siteName,
    url: "/",
  },
  twitter: { card: "summary_large_image", title, description },
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true, "max-image-preview": "large", "max-snippet": -1 },
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="sv"><body><a className="skip" href="#main">Hoppa till innehållet</a>{children}<CookieBanner/><PageTracker/><GoogleTagManager/></body></html>;
}
