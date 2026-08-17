"use client";

import { useState } from "react";
import { ArrowRight, BarChart3, Info, TrendingUp } from "lucide-react";
import { calculateMonthlyValue } from "@/lib/calculator";
import { track } from "@/lib/analytics";

const fields = [
  ["missed", "Missade samtal per vecka", 0, 100],
  ["relevant", "Andel relevanta kundförfrågningar (%)", 0, 100],
  ["margin", "Täckningsbidrag per bokat jobb (kr)", 0, 20000],
  ["recovered", "Andel leads Textback kan hjälpa fånga (%)", 0, 100],
] as const;

export function Calculator() {
  const [values, setValues] = useState({
    missed: 15,
    relevant: 50,
    margin: 2000,
    recovered: 15,
  });

  function update(key: keyof typeof values, value: number) {
    setValues((current) => ({ ...current, [key]: value }));
    track("calculator_changed", { field: key, value });
  }

  const monthlyValue = calculateMonthlyValue(values).toLocaleString("sv-SE");

  return (
    <section className="section overflow-hidden bg-gradient-to-b from-paper to-white">
      <div className="shell grid items-center gap-12 lg:grid-cols-[1.05fr_.95fr] lg:gap-20">
        <div className="max-w-[650px]">
          <span className="mb-5 inline-flex items-center gap-2 rounded-full border border-blue/15 bg-white px-4 py-2 text-xs font-extrabold uppercase tracking-[0.14em] text-blue shadow-sm">
            <BarChart3 size={15} aria-hidden="true" />
            Beräkna potentialen
          </span>

          <h2 className="max-w-[640px] text-[clamp(2.45rem,5vw,4.4rem)] leading-[1.02] tracking-[-0.055em]">
            Vad kan snabbare uppföljning vara värd för ert företag?
          </h2>

          <p className="mb-0 max-w-[590px] text-lg text-slate-600">
            Justera efter er vardag. Kalkylen antar 4,33 veckor per månad.
          </p>

          <div
            className="my-8 flex items-center gap-5 rounded-2xl border border-blue/15 bg-white p-5 shadow-soft sm:p-6"
            aria-live="polite"
          >
            <div className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-blue text-white shadow-md sm:h-16 sm:w-16">
              <TrendingUp size={30} aria-hidden="true" />
            </div>
            <div className="min-w-0">
              <span className="block text-sm font-medium text-slate-600">
                Uppskattat potentialvärde per månad
              </span>
              <strong className="mt-1 block break-words text-[clamp(2rem,5vw,3.55rem)] font-extrabold leading-none tracking-[-0.045em] text-navy">
                {monthlyValue} kr
              </strong>
            </div>
          </div>

          <div className="flex max-w-[610px] items-start gap-3 text-sm leading-6 text-slate-500">
            <Info className="mt-0.5 h-5 w-5 shrink-0 text-blue" aria-hidden="true" />
            <p className="mb-0">
              Detta är ett räkneexempel. Faktiskt utfall beror på samtalsvolym,
              kundbehov och hur ni följer upp.
            </p>
          </div>
        </div>

        <div className="rounded-[24px] border border-slate-200 bg-white p-5 shadow-[0_24px_70px_rgba(16,36,62,0.11)] sm:p-7 lg:p-8">
          <div className="mb-6 border-b border-slate-100 pb-5">
            <h3 className="mb-1 text-xl font-extrabold tracking-[-0.02em] text-navy">
              Räkna på er situation
            </h3>
            <p className="mb-0 text-sm text-slate-500">
              Dra i reglagen eller skriv in egna värden.
            </p>
          </div>

          <div>
            {fields.map(([key, label, min, max], index) => (
              <label
                key={key}
                className={`block py-4 ${index > 0 ? "border-t border-slate-100" : "pt-0"}`}
              >
                <span className="mb-3 block text-sm font-extrabold text-navy">
                  {label}
                </span>
                <div className="grid grid-cols-[minmax(0,1fr)_88px] items-center gap-4 sm:grid-cols-[minmax(0,1fr)_96px]">
                  <input
                    className="m-0 h-2 w-full cursor-pointer border-0 p-0 accent-blue"
                    type="range"
                    min={min}
                    max={max}
                    step={key === "margin" ? 100 : 1}
                    value={values[key]}
                    onChange={(event) => update(key, Number(event.target.value))}
                  />
                  <input
                    aria-label={label}
                    className="m-0 w-full rounded-xl border border-slate-300 px-3 py-2.5 text-center font-extrabold tabular-nums text-navy shadow-sm"
                    type="number"
                    min={min}
                    max={max}
                    step={key === "margin" ? 100 : 1}
                    value={values[key]}
                    onChange={(event) => update(key, Number(event.target.value))}
                  />
                </div>
              </label>
            ))}
          </div>

          <a
            href="#ansok"
            className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-blue px-5 py-4 text-center font-extrabold text-white shadow-md transition hover:-translate-y-0.5 hover:bg-[#10566e]"
            onClick={() => track("calculator_cta_clicked")}
          >
            Se hur Textback passar er verksamhet
            <ArrowRight size={18} aria-hidden="true" />
          </a>
        </div>
      </div>
    </section>
  );
}
