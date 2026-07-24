"use client";
import { useState } from "react";
import { Menu, X } from "lucide-react";
import { TrackedLink } from "./tracked-link";

export function Nav() {
  const [open, setOpen] = useState(false);
  return (
    <header className="sticky top-0 z-40 border-b border-slate-200/80 bg-white/95 backdrop-blur">
      <nav className="shell flex h-18 items-center justify-between" aria-label="Huvudmeny">
        <a href="#top" aria-label="Textback startsida" className="flex items-center">
          <img src="/textback-logo.svg" width="180" height="45" alt="Textback" />
        </a>
        <button className="md:hidden" aria-expanded={open} aria-label="Öppna meny" onClick={() => setOpen(!open)}>{open ? <X/> : <Menu/>}</button>
        <div className={`${open ? "flex" : "hidden"} absolute left-0 top-18 w-full flex-col gap-4 border-b bg-white p-6 md:static md:flex md:w-auto md:flex-row md:items-center md:border-0 md:p-0`}>
          <a href="#sa-fungerar">Så fungerar det</a><a href="#pris">Pris</a><a href="#faq">FAQ</a><TrackedLink href="#ansok" event="hero_secondary_cta_clicked" className="button small">Kom igång</TrackedLink>
        </div>
      </nav>
    </header>
  );
}
