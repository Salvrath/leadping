"use client";

import { useEffect, useState } from "react";
import { Check } from "lucide-react";
import { defaultConsent, type Consent } from "@/lib/consent";

type SavedChoice = "all" | "necessary" | "custom" | null;

export function CookieBanner() {
  const [open, setOpen] = useState(false);
  const [settings, setSettings] = useState(false);
  const [value, setValue] = useState<Consent>(defaultConsent);
  const [savedChoice, setSavedChoice] = useState<SavedChoice>(null);

  useEffect(() => setOpen(!localStorage.getItem("textback_consent")), []);
  useEffect(() => {
    const openSettings = () => {
      setSavedChoice(null);
      setOpen(true);
      setSettings(true);
    };
    window.addEventListener("textback:cookie-settings", openSettings);
    return () => window.removeEventListener("textback:cookie-settings", openSettings);
  }, []);

  function save(consent: Consent, choice: Exclude<SavedChoice, null>) {
    if (savedChoice) return;
    localStorage.setItem("textback_consent", JSON.stringify(consent));
    window.dispatchEvent(new CustomEvent("textback:consent", { detail: consent }));
    setSavedChoice(choice);
    window.setTimeout(() => {
      setOpen(false);
      setSavedChoice(null);
    }, 520);
  }

  if (!open) return null;
  const saved = Boolean(savedChoice);

  return <aside className="cookie" role="dialog" aria-label="Cookieinställningar" aria-modal="false">
    <h2>Du väljer hur sidan mäts</h2>
    <p>Nödvändiga funktioner är alltid aktiva. Analys och marknadsföring startar först efter ditt val.</p>
    {settings && <div className="cookie-options">
      <label><input type="checkbox" checked disabled/> Nödvändiga</label>
      <label><input type="checkbox" checked={value.analytics} disabled={saved} onChange={(event) => setValue({ ...value, analytics: event.target.checked })}/> Analys</label>
      <label><input type="checkbox" checked={value.marketing} disabled={saved} onChange={(event) => setValue({ ...value, marketing: event.target.checked })}/> Marknadsföring</label>
    </div>}
    <div className="flex flex-wrap gap-2 items-center">
      <button className={`button small${savedChoice === "all" ? " is-confirmed" : ""}`} disabled={saved} onClick={() => save({ necessary: true, analytics: true, marketing: true }, "all")}>
        {savedChoice === "all" && <Check size={16}/>} {savedChoice === "all" ? "Sparat" : "Godkänn alla"}
      </button>
      <button className={`button secondary small${savedChoice === "necessary" ? " is-confirmed" : ""}`} disabled={saved} onClick={() => save(defaultConsent, "necessary")}>
        {savedChoice === "necessary" && <Check size={16}/>} {savedChoice === "necessary" ? "Sparat" : "Endast nödvändiga"}
      </button>
      <button className={`text-link${savedChoice === "custom" ? " is-confirmed" : ""}`} disabled={saved} onClick={() => settings ? save(value, "custom") : setSettings(true)}>
        {savedChoice === "custom" && <Check size={16}/>} {savedChoice === "custom" ? "Val sparat" : settings ? "Spara val" : "Anpassa"}
      </button>
    </div>
    {saved && <div className="cookie-feedback" role="status"><Check size={15}/> Cookievalet är sparat.</div>}
  </aside>;
}

export function CookieSettings() {
  return <button className="footer-link" onClick={() => window.dispatchEvent(new Event("textback:cookie-settings"))}>Cookieinställningar</button>;
}
