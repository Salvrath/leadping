"use client";
import { useEffect } from "react";
import { track } from "@/lib/analytics";

export function PageTracker() {
  useEffect(() => {
    const timer = window.setTimeout(() => track("page_view"), 0);
    return () => window.clearTimeout(timer);
  }, []);
  return null;
}