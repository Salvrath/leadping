"use client";
import { useEffect, useRef, useState } from "react";
import { useFormState, useFormStatus } from "react-dom";
import { submitPilot, type FormState } from "@/app/actions";
import { track } from "@/lib/analytics";
import { CheckCircle2 } from "lucide-react";

const initial: FormState = { success: false };
const attributionNames = ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term"] as const;
function SubmitButton({ ready }: { ready: boolean }) { const { pending } = useFormStatus(); return <button className="button large" disabled={pending || !ready}>{pending ? "Skickar…" : "Kontrollera kompatibilitet"}</button>; }

export function PilotForm() {
  const [state, action] = useFormState(submitPilot, initial);
  const [started, setStarted] = useState(false); const [meta, setMeta] = useState<Record<string,string>>({});
  const [submissionId, setSubmissionId] = useState(""); const [formStartedAt, setFormStartedAt] = useState(0);
  const statusRef = useRef<HTMLDivElement>(null);
  useEffect(() => { setSubmissionId(crypto.randomUUID()); setFormStartedAt(Date.now()); const q=new URLSearchParams(location.search); const landing=sessionStorage.getItem("textback_landing_path")||location.pathname; sessionStorage.setItem("textback_landing_path",landing); setMeta(Object.fromEntries([...attributionNames.map(k=>[k,(q.get(k)||"").slice(0,200)]),["landing_path",landing.slice(0,500)],["referrer",document.referrer?`${new URL(document.referrer).origin}${new URL(document.referrer).pathname}`.slice(0,500):""]])); },[]);
  useEffect(()=>{ if(state.success) track("launch_enquiry_submitted"); if(state.success||state.message||state.errors)statusRef.current?.focus(); },[state]);
  if(state.success) return <div className="success-card" role="status" tabIndex={-1} ref={statusRef}><CheckCircle2 size={42}/><span className="eyebrow">Uppgifterna är mottagna</span><h2>Vi kontrollerar er telefonilösning.</h2><p>Vi återkommer normalt inom en arbetsdag med besked om kompatibilitet, pris för ert antal telefonnummer och nästa steg. Ingen betalning sker innan ni har bekräftat beställningen.</p></div>;
  function begin(){if(!started){setStarted(true);track("launch_form_started");}}
  const fields = [["company","Företagsnamn *","text"],["contact","Kontaktperson *","text"],["email","E-post *","email"],["phone","Ditt telefonnummer *","tel"],["businessPhone","Företagets huvudsakliga telefonnummer *","tel"],["phoneNumbers","Hur många telefonnummer ska anslutas? *","number"],["telephony","Nuvarande operatör eller telefonilösning *","text"],["industry","Bransch (frivilligt)","text"],["missedCalls","Missade samtal per vecka (frivilligt)","number"]];
  return <form action={action} className="pilot-form" style={{color:"var(--navy)"}} onFocus={begin} noValidate>
    <div ref={statusRef} tabIndex={-1} role="alert" className={state.message||state.errors?"form-alert":"sr-only"}>{state.message||(state.errors?"Kontrollera de markerade fälten.":"")}</div>
    <input type="hidden" name="submissionId" value={submissionId}/><input type="hidden" name="formStartedAt" value={formStartedAt}/><div className="honeypot" aria-hidden="true"><input name="website" tabIndex={-1}/></div>
    {Object.entries(meta).map(([k,v])=><input key={k} type="hidden" name={k.replace(/_([a-z])/g,(_,c)=>c.toUpperCase())} value={v}/>)}
    <div className="form-grid">{fields.map(([name,label,type])=><Field key={name} name={name} label={label} type={type} error={state.errors?.[name]?.[0]} defaultValue={String(state.values?.[name as keyof typeof state.values]||"")}/>)}<label className="full">Meddelande (frivilligt)<textarea name="message" rows={4} maxLength={2000}/></label></div>
    <Check name="privacy" error={state.errors?.privacy?.[0]}>Jag godkänner <a href="/integritet">integritetspolicyn</a>. *</Check><Check name="authority" error={state.errors?.authority?.[0]}>Jag bekräftar att jag får företräda företaget. *</Check>
    <SubmitButton ready={Boolean(submissionId&&formStartedAt)}/><p className="fine" style={{color:"#64748b"}}>Kostnadsfri kontroll. Ingen bindningstid och ingen betalning innan beställningen bekräftas.</p>
  </form>;
}
function Field({name,label,type,error,defaultValue}:{name:string;label:string;type:string;error?:string;defaultValue:string}){return <label>{label}<input name={name} type={type} min={type==="number"?1:undefined} defaultValue={defaultValue}/>{error&&<span className="error">{error}</span>}</label>}
function Check({name,error,children}:{name:string;error?:string;children:React.ReactNode}){return <label className="check"><input name={name} type="checkbox"/><span>{children}{error&&<span className="error block">{error}</span>}</span></label>}
