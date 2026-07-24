"use client";
import { useEffect, useRef, useState } from "react";
import { useFormState, useFormStatus } from "react-dom";
import { submitPilot, startCheckout, type FormState } from "@/app/actions";
import { track } from "@/lib/analytics";
import { CheckCircle2 } from "lucide-react";

const initial: FormState = { success: false };
const attributionNames = ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term"] as const;

function SubmitButton({ ready }: { ready: boolean }) {
  const { pending } = useFormStatus();
  return <button className="button large" disabled={pending || !ready} aria-disabled={pending || !ready}>{pending ? "Skickar…" : "Skicka pilotansökan"}</button>;
}

function CheckoutButton() {
  const { pending } = useFormStatus();
  return <button className="button" disabled={pending}>{pending ? "Öppnar säker betalning…" : "Betala pilotmånad"}</button>;
}

export function PilotForm() {
  const [state, action] = useFormState(submitPilot, initial);
  const [started, setStarted] = useState(false);
  const [meta, setMeta] = useState<Record<string, string>>({});
  const [submissionId, setSubmissionId] = useState("");
  const [formStartedAt, setFormStartedAt] = useState(0);
  const statusRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setSubmissionId(crypto.randomUUID()); setFormStartedAt(Date.now());
    const query = new URLSearchParams(location.search);
    const landing = sessionStorage.getItem("textback_landing_path") || location.pathname;
    sessionStorage.setItem("textback_landing_path", landing);
    setMeta(Object.fromEntries([
      ...attributionNames.map((key) => [key, (query.get(key) || "").slice(0, 200)]),
      ["landing_path", landing.slice(0, 500)], ["referrer", document.referrer ? `${new URL(document.referrer).origin}${new URL(document.referrer).pathname}`.slice(0, 500) : ""],
    ]));
  }, []);
  useEffect(() => {
    if (state.success) { track("pilot_form_submitted"); track("pilot_application_saved", { product: "textback" }); }
    if (state.success || state.message || state.errors) statusRef.current?.focus();
  }, [state]);

  if (state.success && state.id) return <div className="success-card" role="status" aria-live="polite" tabIndex={-1} ref={statusRef}>
    <CheckCircle2 size={42}/><span className="eyebrow">Ansökan mottagen</span>
    <h2>Tack! Nästa steg är kompatibilitetskontroll.</h2>
    <p>Ansökan är sparad. Ni kan betala pilotmånaden nu, men betalningen innebär inte att kompatibiliteten är godkänd. Leadping kontrollerar er telefonilösning och kontaktar er.</p>
    <form action={startCheckout} onSubmit={() => { track("checkout_clicked"); track("pilot_checkout_started", { product: "textback" }); }}>
      <input type="hidden" name="leadId" value={state.id}/><CheckoutButton/>
    </form>
    <p className="fine">Betalningen sker i Stripe Checkout. Textback hanterar inga kortuppgifter på denna sida. Om tjänsten inte kan aktiveras hanteras återbetalning enligt pilotvillkoren.</p>
  </div>;

  function begin() { if (!started) { setStarted(true); track("pilot_form_started"); } }
  return <form action={action} className="pilot-form" onFocus={begin} noValidate>
    <div ref={statusRef} tabIndex={-1} role="alert" aria-live="assertive" className={state.message || state.errors ? "form-alert" : "sr-only"}>
      {state.message || (state.errors ? "Kontrollera de markerade fälten och försök igen." : "")}
    </div>
    <input type="hidden" name="submissionId" value={submissionId}/>
    <input type="hidden" name="formStartedAt" value={formStartedAt}/>
    <div className="honeypot" aria-hidden="true"><label>Webbplats<input name="website" tabIndex={-1} autoComplete="off"/></label></div>
    {Object.entries(meta).map(([key, value]) => <input key={key} type="hidden" name={key.replace(/_([a-z])/g, (_, c) => c.toUpperCase())} value={value}/>)}
    <div className="form-grid">
      {[["company","Företagsnamn *","text"],["orgNumber","Organisationsnummer (frivilligt)","text"],["contact","Kontaktperson *","text"],["email","E-post *","email"],["phone","Telefonnummer *","tel"],["workshopPhone","Verkstadens telefonnummer *","tel"],["telephony","Nuvarande operatör eller telefonilösning *","text"],["missedCalls","Ungefärligt antal missade samtal per vecka *","number"],["employees","Antal anställda *","number"]].map(([name,label,type]) =>
        <Field key={name} name={name} label={label} type={type} error={state.errors?.[name]?.[0]} defaultValue={String(state.values?.[name as keyof typeof state.values] || "")}/>) }
      <label className="full">Meddelande (frivilligt)<textarea name="message" rows={4} maxLength={2000} defaultValue={state.values?.message || ""}/></label>
    </div>
    <Check name="privacy" error={state.errors?.privacy?.[0]}>Jag godkänner <a href="/integritet">integritetspolicyn</a>. *</Check>
    <Check name="authority" error={state.errors?.authority?.[0]}>Jag bekräftar att jag får företräda företaget. *</Check>
    <SubmitButton ready={Boolean(submissionId && formStartedAt)}/><p className="fine">Vi använder uppgifterna för pilotansökan – aldrig som kortuppgifter eller i analytics.</p>
  </form>;
}

function Field({name,label,type,error,defaultValue}:{name:string;label:string;type:string;error?:string;defaultValue:string}) {
  return <label>{label}<input name={name} type={type} defaultValue={defaultValue} aria-invalid={!!error} aria-describedby={error ? `${name}-error` : undefined}/>{error && <span className="error" id={`${name}-error`}>{error}</span>}</label>;
}
function Check({name,error,children}:{name:string;error?:string;children:React.ReactNode}) {
  return <label className="check"><input name={name} type="checkbox"/><span>{children}{error && <span className="error block">{error}</span>}</span></label>;
}
