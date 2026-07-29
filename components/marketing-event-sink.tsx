"use client";

import { useEffect } from "react";
import type { Consent } from "@/lib/consent";
import { track } from "@/lib/analytics";

const persistedEvents = new Set(["page_view", "demo_phone_clicked", "launch_form_started", "launch_enquiry_submitted"]);

function analyticsAllowed() {
  try { return Boolean((JSON.parse(localStorage.getItem("textback_consent") || "{}") as Consent).analytics); }
  catch { return false; }
}

function send(detail: Record<string, unknown>) {
  if (!persistedEvents.has(String(detail.event)) || !analyticsAllowed()) return;
  const payload = JSON.stringify(detail);
  if (navigator.sendBeacon) {
    navigator.sendBeacon("/api/marketing/events", new Blob([payload], { type: "application/json" }));
    return;
  }
  void fetch("/api/marketing/events", { method: "POST", headers: { "Content-Type": "application/json" }, body: payload, keepalive: true });
}

export function MarketingEventSink() {
  useEffect(() => {
    const onAnalytics = (event: Event) => send((event as CustomEvent<Record<string, unknown>>).detail || {});
    const onConsent = (event: Event) => {
      const consent = (event as CustomEvent<Consent>).detail;
      if (consent.analytics) track("page_view");
    };
    window.addEventListener("textback:analytics", onAnalytics);
    window.addEventListener("textback:consent", onConsent);
    return () => {
      window.removeEventListener("textback:analytics", onAnalytics);
      window.removeEventListener("textback:consent", onConsent);
    };
  }, []);
  return null;
}