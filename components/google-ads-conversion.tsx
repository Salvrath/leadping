"use client";

import Script from "next/script";
import { useEffect } from "react";
import type { Consent } from "@/lib/consent";

const adsId = process.env.NEXT_PUBLIC_GOOGLE_ADS_ID;
const leadLabel = process.env.NEXT_PUBLIC_GOOGLE_ADS_LEAD_LABEL;
const demoClickLabel = process.env.NEXT_PUBLIC_GOOGLE_ADS_DEMO_CLICK_LABEL;

declare global {
  interface Window {
    dataLayer?: Record<string, unknown>[];
    gtag?: (...args: unknown[]) => void;
  }
}

function marketingAllowed() {
  try {
    return Boolean((JSON.parse(localStorage.getItem("textback_consent") || "{}") as Consent).marketing);
  } catch {
    return false;
  }
}

export function GoogleAdsConversion() {
  useEffect(() => {
    if (!adsId) return;

    const handle = (event: Event) => {
      const detail = (event as CustomEvent<Record<string, unknown>>).detail;
      if (!marketingAllowed() || !window.gtag) return;
      if (detail.event === "launch_enquiry_submitted" && leadLabel) {
        window.gtag("event", "conversion", {
          send_to: `${adsId}/${leadLabel}`,
          value: 1,
          currency: "SEK",
          transaction_id: typeof detail.lead_id === "string" ? detail.lead_id : undefined,
        });
      }
      if (detail.event === "demo_phone_clicked" && demoClickLabel) {
        window.gtag("event", "conversion", {
          send_to: `${adsId}/${demoClickLabel}`,
          value: 0.25,
          currency: "SEK",
        });
      }
    };

    window.addEventListener("textback:analytics", handle);
    return () => window.removeEventListener("textback:analytics", handle);
  }, []);

  if (!adsId) return null;

  return <>
    <Script src={`https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(adsId)}`} strategy="afterInteractive" />
    <Script id="textback-google-ads" strategy="afterInteractive">{`
      window.dataLayer = window.dataLayer || [];
      window.gtag = window.gtag || function(){window.dataLayer.push(arguments);};
      window.gtag('js', new Date());
      window.gtag('config', '${adsId}', { send_page_view: false });
    `}</Script>
  </>;
}