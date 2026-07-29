"use client";
import { useEffect, useRef, useState } from "react";
import { useFormState, useFormStatus } from "react-dom";
import { submitPilot, type FormState } from "@/app/actions";
import type { Lead } from "@/lib/lead-schema";
import { track } from "@/lib/analytics";
import { attributionFormFields, captureAttribution } from "@/lib/client-attribution";
import { CheckCircle2 } from "lucide-react";

const initial: FormState = { success: false };
type FieldName = "company" | "contact" | "email" | "phone" | "businessPhone" | "phoneNumbers" | "telephony" | "industry" | "missedCalls";
type FieldDefinition = readonly [FieldName, string, "text" | "email" | "tel" | "number"];

function SubmitButton({ ready, commerceEnabled }: { ready: boolean; commerceEnabled: boolean }) {
  const { pending } = useFormStatus();
  const label = commerceEnabled ? "Starta anslutningen" : "Anmäl intresse";
  const pendingLabel = commerceEnabled ? "Förbereder säker registrering…" : "Registrerar intresse…";
  return <button className="button large" disabled={pending || !ready}>{pending ? pendingLabel : label}</button>;
}

export function PilotForm({ commerceEnabled = false, variant = "default" }: { commerceEnabled?: boolean; variant?: "default" | "ads" }) {
  const [state, action] = useFormState(submitPilot, initial);
  const [started, setStarted] = useState(false);
  const [meta, setMeta] = useState<Record<string,string>>({});
  const [submissionId, setSubmissionId] = useState("");
  const [formStartedAt, setFormStartedAt] = useState(0);
  const statusRef = useRef<HTMLDivElement>(null);
  const trackedLeadRef = useRef<string | null>(null);

  useEffect(() => {
    setSubmissionId(crypto.randomUUID());
    setFormStartedAt(Date.now());
    setMeta(attributionFormFields(captureAttribution()));
  }, []);

  useEffect(() => {
    if (state.success && state.id && trackedLeadRef.current !== state.id) {
      trackedLeadRef.current = state.id;
      track("launch_enquiry_submitted", { lead_id: state.id });
      if (state.checkoutUrl) track("pilot_checkout_started", { lead_id: state.id });
    }
    if (state.success || state.message || state.errors) statusRef.current?.focus();
    if (state.success && state.checkoutUrl) {
      const timer = window.setTimeout(() => window.location.assign(state.checkoutUrl!), 150);
      return () => window.clearTimeout(timer);
    }
  }, [state]);

  if (state.success && state.checkoutUrl) {
    return <div className="success-card" role="status" tabIndex={-1} ref={statusRef}><CheckCircle2 size={42}/><span className="eyebrow">Anslutningen är förberedd</span><h2>Öppnar Stripe…</h2><p>Du registrerar en betalmetod säkert hos Stripe, men debiteras inte nu. Ett Textback-nummer reserveras automatiskt och abonnemanget startar först när telefonin har klarat anslutningstesterna.</p><a className="button large" href={state.checkoutUrl}>Registrera betalmetod</a></div>;
  }

  if (state.success) {
    return <div className="success-card" role="status" tabIndex={-1} ref={statusRef}><CheckCircle2 size={42}/><span className="eyebrow">Intresset är registrerat</span><h2>Tack för er intresseanmälan.</h2><p>Vi har registrerat era uppgifter och kontaktar er med nästa steg. Ingen beställning eller betalning har genomförts.</p></div>;
  }

  function begin() {
    if (!started) {
      setStarted(true);
      track("launch_form_started");
    }
  }

  const defaultFields: FieldDefinition[] = [
    ["company", "Företagsnamn *", "text"],
    ["contact", "Kontaktperson *", "text"],
    ["email", "E-post *", "email"],
    ["phone", "Ditt telefonnummer *", "tel"],
    ["businessPhone", "Företagets huvudsakliga telefonnummer *", "tel"],
    ["phoneNumbers", "Hur många telefonnummer skulle ni vilja ansluta? *", "number"],
    ["telephony", "Nuvarande operatör eller telefonilösning *", "text"],
    ["industry", "Bransch (frivilligt)", "text"],
    ["missedCalls", "Missade samtal per vecka (frivilligt)", "number"],
  ];
  const adFields: FieldDefinition[] = [
    ["company", "Företagsnamn *", "text"],
    ["contact", "Kontaktperson *", "text"],
    ["email", "E-post *", "email"],
    ["phone", "Ditt telefonnummer *", "tel"],
    ["businessPhone", "Företagets telefonnummer *", "tel"],
    ["telephony", "Operatör eller telefonilösning *", "text"],
  ];
  const fields = variant === "ads" ? adFields : defaultFields;

  return <form action={action} className={`pilot-form${variant === "ads" ? " pilot-form-compact" : ""}`} style={{color:"var(--navy)"}} onFocus={begin} noValidate>
    <div ref={statusRef} tabIndex={-1} role="alert" className={state.message || state.errors ? "form-alert" : "sr-only"}>{state.message || (state.errors ? "Kontrollera de markerade fälten." : "")}</div>
    <input type="hidden" name="submissionId" value={submissionId}/><input type="hidden" name="formStartedAt" value={formStartedAt}/><div className="honeypot" aria-hidden="true"><input name="website" tabIndex={-1}/></div>
    {variant === "ads" && <input type="hidden" name="phoneNumbers" value="1"/>}
    {Object.entries(meta).map(([key,value]) => <input key={key} type="hidden" name={key} value={value}/>) }
    <div className="form-grid">{fields.map(([name,label,type]) => <Field key={name} name={name} label={label} type={type} error={state.errors?.[name]?.[0]} defaultValue={String(state.values?.[name as keyof Lead] ?? "")}/>)}{variant === "default" && <label className="full">Meddelande (frivilligt)<textarea name="message" rows={4} maxLength={2000} defaultValue={state.values?.message ?? ""}/></label>}</div>
    <Check name="privacy" error={state.errors?.privacy?.[0]}>Jag godkänner <a href="/integritet">integritetspolicyn</a>. *</Check><Check name="authority" error={state.errors?.authority?.[0]}>Jag bekräftar att jag får företräda företaget. *</Check>
    <SubmitButton ready={Boolean(submissionId && formStartedAt)} commerceEnabled={commerceEnabled}/><p className="fine" style={{color:"#64748b"}}>{commerceEnabled ? "495 kr/mån i tre månader, därefter 995 kr/mån exklusive moms. Ingen bindningstid. Ingen debitering innan telefonin har verifierats och tjänsten aktiveras." : "Kostnadsfritt och utan beställning eller betalning."}</p>
  </form>;
}

function Field({name,label,type,error,defaultValue}:{name:FieldName;label:string;type:"text"|"email"|"tel"|"number";error?:string;defaultValue:string}) {
  return <label>{label}<input name={name} type={type} min={type === "number" ? (name === "phoneNumbers" ? 1 : 0) : undefined} defaultValue={defaultValue}/>{error && <span className="error">{error}</span>}</label>;
}

function Check({name,error,children}:{name:string;error?:string;children:React.ReactNode}) {
  return <label className="check"><input name={name} type="checkbox"/><span>{children}{error && <span className="error block">{error}</span>}</span></label>;
}