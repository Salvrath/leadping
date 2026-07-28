import Script from "next/script";

export function VercelAnalytics() {
  return <Script src="/_vercel/insights/script.js" strategy="afterInteractive" />;
}
