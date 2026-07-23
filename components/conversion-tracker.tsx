"use client";
import { useEffect } from "react";
import { track, type EventName } from "@/lib/analytics";
export function ConversionTracker({ event }: { event: EventName }) { useEffect(() => track(event, { product: "textback" }), [event]); return null; }
