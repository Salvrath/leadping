"use client";
import { useEffect, useState } from "react";
import Script from "next/script";
import type { Consent } from "@/lib/consent";

declare global { interface Window { dataLayer?: Record<string, unknown>[] } }
const id = process.env.NEXT_PUBLIC_GTM_ID;

function analyticsAllowed() {
  try { return Boolean((JSON.parse(localStorage.getItem("textback_consent") || "{}") as Consent).analytics); } catch { return false; }
}

export function GoogleTagManager() {
  const [allowed, setAllowed] = useState(false);
  useEffect(() => {
    const refresh = (event?: Event) => { const consent = event instanceof CustomEvent ? event.detail as Consent : (() => { try { return JSON.parse(localStorage.getItem("textback_consent") || "{}") as Consent; } catch { return { necessary:true, analytics:false, marketing:false } as Consent; } })(); setAllowed(Boolean(consent.analytics)); if (id) { window.dataLayer = window.dataLayer || []; window.dataLayer.push({ event:"textback_consent_update", analytics_consent:consent.analytics?"granted":"denied", marketing_consent:consent.marketing?"granted":"denied" }); } }; refresh();
    const push = (event: Event) => { if (!analyticsAllowed() || !id) return; const detail = (event as CustomEvent<Record<string, unknown>>).detail; window.dataLayer = window.dataLayer || []; window.dataLayer.push(detail); };
    window.addEventListener("textback:consent", refresh); window.addEventListener("textback:analytics", push);
    return () => { window.removeEventListener("textback:consent", refresh); window.removeEventListener("textback:analytics", push); };
  }, []);
  if (!id || !allowed) return null;
  return <><Script id="textback-gtm-init" strategy="afterInteractive">{`window.dataLayer=window.dataLayer||[];window.dataLayer.push({'gtm.start':new Date().getTime(),event:'gtm.js'});`}</Script><Script src={`https://www.googletagmanager.com/gtm.js?id=${encodeURIComponent(id)}`} strategy="afterInteractive"/></>;
}
