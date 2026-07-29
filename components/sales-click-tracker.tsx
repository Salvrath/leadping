"use client";

import { useEffect } from "react";
import { isValidSalesTrackingToken } from "@/lib/sales-click-tracking";

export function SalesClickTracker({ token }: { token?: string | null }) {
  useEffect(() => {
    if (!token || !isValidSalesTrackingToken(token)) return;

    let completed = false;
    const cleanupUrl = () => {
      const url = new URL(window.location.href);
      url.searchParams.delete("tb");
      window.history.replaceState({}, "", `${url.pathname}${url.search}${url.hash}`);
    };
    const confirm = async (method: "interaction" | "visible_delay") => {
      if (completed || document.visibilityState !== "visible" || navigator.webdriver) return;
      completed = true;
      try {
        await fetch("/api/sales/track-click", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token, method }),
          credentials: "same-origin",
          keepalive: true,
        });
      } finally {
        cleanupUrl();
      }
    };
    const onInteraction = (event: Event) => {
      if (event.isTrusted) void confirm("interaction");
    };

    window.addEventListener("pointerdown", onInteraction, { once: true, passive: true });
    window.addEventListener("touchstart", onInteraction, { once: true, passive: true });
    window.addEventListener("keydown", onInteraction, { once: true });
    window.addEventListener("scroll", onInteraction, { once: true, passive: true });
    const timer = window.setTimeout(() => {
      if (document.hasFocus()) void confirm("visible_delay");
    }, 5000);

    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("pointerdown", onInteraction);
      window.removeEventListener("touchstart", onInteraction);
      window.removeEventListener("keydown", onInteraction);
      window.removeEventListener("scroll", onInteraction);
    };
  }, [token]);

  return null;
}
