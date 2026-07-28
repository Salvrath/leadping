"use client";

import { useEffect, useState } from "react";
import { useFormState, useFormStatus } from "react-dom";
import { Check, FlaskConical, LoaderCircle, PauseCircle, PlayCircle, Settings2 } from "lucide-react";
import { initialAdminActionState, type AdminActionState } from "@/lib/admin-action-state";
import { runSalesAssistantWithFeedback, updateSalesAutomationSettingsWithFeedback } from "@/app/admin/sales/automation/actions";
import type { SalesAutomationSettings } from "@/lib/server/sales-assistant";

function useSuccess(state: AdminActionState) {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    if (state.status !== "success" || !state.completedAt) return;
    setVisible(true);
    const timer = window.setTimeout(() => setVisible(false), 5000);
    return () => window.clearTimeout(timer);
  }, [state.completedAt, state.status]);
  return visible;
}

function Feedback({ state, visible }: { state: AdminActionState; visible: boolean }) {
  if (state.status === "error") return <div className="admin-note error" role="alert">{state.message}</div>;
  if (state.status === "success" && visible) return <div className="admin-note success" role="status"><Check size={16}/>{state.message}</div>;
  return null;
}

function RunButton({ mode }: { mode: "simulate" | "apply" }) {
  const { pending } = useFormStatus();
  const simulation = mode === "simulate";
  return <button className={`admin-button ${simulation ? "neutral" : "primary"}`} type="submit" disabled={pending}>
    {pending ? <LoaderCircle className="admin-spinner" size={16}/> : simulation ? <FlaskConical size={16}/> : <PlayCircle size={16}/>}<span>{pending ? "Kör…" : simulation ? "Simulera nästa körning" : "Kör assisterat läge nu"}</span>
  </button>;
}

export function SalesAssistantRunForm({ mode }: { mode: "simulate" | "apply" }) {
  const [state, action] = useFormState(runSalesAssistantWithFeedback, initialAdminActionState);
  const visible = useSuccess(state);
  return <form action={action} className="sales-assistant-run">
    <input type="hidden" name="mode" value={mode}/>
    <RunButton mode={mode}/>
    <Feedback state={state} visible={visible}/>
  </form>;
}

function SettingsButton({ paused }: { paused: boolean }) {
  const { pending } = useFormStatus();
  return <button className={`admin-button ${paused ? "danger" : "primary"}`} type="submit" disabled={pending}>
    {pending ? <LoaderCircle className="admin-spinner" size={16}/> : paused ? <PauseCircle size={16}/> : <Settings2 size={16}/>}<span>{pending ? "Sparar…" : paused ? "Spara och pausa försäljning" : "Spara inställningar"}</span>
  </button>;
}

export function SalesAutomationSettingsForm({ settings }: { settings: SalesAutomationSettings }) {
  const [state, action] = useFormState(updateSalesAutomationSettingsWithFeedback, initialAdminActionState);
  const visible = useSuccess(state);
  return <form action={action} className="admin-card admin-section sales-form">
    <div className="admin-section-head"><div><h2>Styrning och säkerhet</h2><p>Automationen förbereder arbete. Den skickar aldrig kalla SMS på egen hand.</p></div></div>
    <div className="sales-toggle-grid">
      <label className="sales-toggle"><input type="checkbox" name="paused" value="true" defaultChecked={settings.paused}/><span><strong>Global paus</strong><small>Blockerar kampanjutskick och manuella säljsvar.</small></span></label>
      <label className="sales-toggle"><input type="checkbox" name="simulation_only" value="true" defaultChecked={settings.simulation_only}/><span><strong>Endast simulering</strong><small>Analyserar utan att uppdatera leads eller skapa utkast.</small></span></label>
      <label className="sales-toggle"><input type="checkbox" name="auto_approve_verified" value="true" defaultChecked={settings.auto_approve_verified}/><span><strong>Godkänn verifierade leads</strong><small>Flyttar endast leads som klarar samtliga fasta kontroller.</small></span></label>
      <label className="sales-toggle"><input type="checkbox" name="auto_create_drafts" value="true" defaultChecked={settings.auto_create_drafts}/><span><strong>Skapa kampanjutkast</strong><small>Skapar förhandsgranskning men skickar ingenting.</small></span></label>
    </div>
    <div className="sales-field-grid">
      <label className="sales-field">Max mottagare per utkast<input type="number" name="batch_size" min={1} max={50} defaultValue={settings.batch_size}/></label>
      <label className="sales-field">Minsta antal för nytt utkast<input type="number" name="min_draft_size" min={1} max={50} defaultValue={settings.min_draft_size}/></label>
      <label className="sales-field">Källa får vara högst dagar gammal<input type="number" name="verification_max_age_days" min={1} max={365} defaultValue={settings.verification_max_age_days}/></label>
      <label className="sales-field">Föreslå uppföljning efter dagar<input type="number" name="follow_up_after_days" min={1} max={30} defaultValue={settings.follow_up_after_days}/></label>
    </div>
    <div className="sales-form-footer"><SettingsButton paused={settings.paused}/></div>
    <Feedback state={state} visible={visible}/>
  </form>;
}