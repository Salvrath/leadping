"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { useFormState, useFormStatus } from "react-dom";
import { Check, LoaderCircle, Send, ShieldCheck, Upload } from "lucide-react";
import { initialAdminActionState, type AdminActionState } from "@/lib/admin-action-state";
import { salesLeadStatuses, salesLeadStatusLabel } from "@/lib/sales";
import {
  approveSalesLeadsWithFeedback,
  importSalesLeadsWithFeedback,
  sendSalesCampaignWithFeedback,
  sendSalesReplyWithFeedback,
  updateSalesLeadWithFeedback,
} from "@/app/admin/sales/actions";

function useSuccess(state: AdminActionState, duration = 3500) {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    if (state.status !== "success" || !state.completedAt) return;
    setVisible(true);
    const timer = window.setTimeout(() => setVisible(false), duration);
    return () => window.clearTimeout(timer);
  }, [duration, state.completedAt, state.status]);
  return visible;
}

function Feedback({ state, visible }: { state: AdminActionState; visible: boolean }) {
  if (state.status === "error") return <div className="admin-note error" role="alert">{state.message}</div>;
  if (state.status === "success" && visible) return <div className="admin-note success" role="status"><Check size={16}/>{state.message}</div>;
  return null;
}

function Submit({ idle, pending, success, successVisible, icon = "send", tone = "primary" }: { idle: string; pending: string; success: string; successVisible: boolean; icon?: "send" | "upload" | "check"; tone?: "primary" | "neutral" | "danger" }) {
  const { pending: isPending } = useFormStatus();
  const Icon = icon === "upload" ? Upload : icon === "check" ? ShieldCheck : Send;
  const done = successVisible && !isPending;
  return <button className={`admin-button ${tone} sales-submit${done ? " is-success" : ""}`} type="submit" disabled={isPending}>
    {isPending ? <LoaderCircle className="admin-spinner" size={16}/> : done ? <Check size={16}/> : <Icon size={16}/>}<span>{isPending ? pending : done ? success : idle}</span>
  </button>;
}

export function SalesImportForm() {
  const [state, action] = useFormState(importSalesLeadsWithFeedback, initialAdminActionState);
  const visible = useSuccess(state);
  return <form action={action} className="admin-card admin-section sales-form" encType="multipart/form-data">
    <div className="admin-section-head"><div><h2>Importera leads</h2><p>Ladda upp CSV eller klistra in data. Dubbletter matchas på telefonnummer.</p></div></div>
    <label className="sales-field">CSV-fil<input type="file" name="file" accept=".csv,text/csv"/></label>
    <label className="sales-field">Eller klistra in CSV<textarea name="csv" rows={12} placeholder="företagsnamn;mobilnummer;bolagsform;källa;verifierad;fitscore"/></label>
    <div className="sales-form-footer"><Submit idle="Importera leads" pending="Importerar…" success="Importerade" successVisible={visible} icon="upload"/><span className="muted">Max 500 rader per import.</span></div>
    <Feedback state={state} visible={visible}/>
  </form>;
}

export function SalesApprovalForm({ children }: { children: ReactNode }) {
  const [state, action] = useFormState(approveSalesLeadsWithFeedback, initialAdminActionState);
  const visible = useSuccess(state);
  return <form action={action}>
    {children}
    <div className="sales-selection-bar"><Submit idle="Godkänn valda" pending="Godkänner…" success="Godkända" successVisible={visible} icon="check"/><span className="muted">Endast verifierade aktiebolag med sparad källa godkänns.</span></div>
    <Feedback state={state} visible={visible}/>
  </form>;
}

export function SendSalesCampaignForm({ campaignId, disabled = false }: { campaignId: string; disabled?: boolean }) {
  const [state, action] = useFormState(sendSalesCampaignWithFeedback, initialAdminActionState);
  const visible = useSuccess(state, 5000);
  return <form action={action} className="sales-send-panel">
    <input type="hidden" name="campaign_id" value={campaignId}/>
    <Submit idle="Godkänn och skicka" pending="Skickar…" success="Utskicket är klart" successVisible={visible}/>
    {disabled && <span className="admin-inline-feedback error">Kampanjen kan inte skickas i nuvarande status.</span>}
    <Feedback state={state} visible={visible}/>
  </form>;
}

export function SalesLeadEditor({ lead }: { lead: { id: string; status: string; fit_score: number; notes?: string | null; next_follow_up_at?: string | null } }) {
  const [state, action] = useFormState(updateSalesLeadWithFeedback, initialAdminActionState);
  const visible = useSuccess(state);
  const localDate = lead.next_follow_up_at ? new Date(lead.next_follow_up_at).toISOString().slice(0, 16) : "";
  return <form action={action} className="admin-card admin-section sales-form">
    <input type="hidden" name="lead_id" value={lead.id}/>
    <div className="admin-section-head"><div><h2>Bedömning och nästa steg</h2><p>Status, prioritet och planerad uppföljning.</p></div></div>
    <div className="sales-field-grid">
      <label className="sales-field">Status<select name="status" defaultValue={lead.status}>{salesLeadStatuses.map((status) => <option key={status} value={status}>{salesLeadStatusLabel(status)}</option>)}</select></label>
      <label className="sales-field">Produktpassning, 0–100<input type="number" name="fit_score" min={0} max={100} defaultValue={lead.fit_score}/></label>
      <label className="sales-field">Nästa uppföljning<input type="datetime-local" name="next_follow_up_at" defaultValue={localDate}/></label>
    </div>
    <label className="sales-field">Anteckningar<textarea name="notes" rows={5} maxLength={4000} defaultValue={lead.notes || ""}/></label>
    <div className="sales-form-footer"><Submit idle="Spara lead" pending="Sparar…" success="Sparat" successVisible={visible} icon="check"/></div>
    <Feedback state={state} visible={visible}/>
  </form>;
}

export function SalesReplyForm({ leadId, suggestion, disabled = false }: { leadId: string; suggestion: string; disabled?: boolean }) {
  const [state, action] = useFormState(sendSalesReplyWithFeedback, initialAdminActionState);
  const visible = useSuccess(state);
  const [requestId, setRequestId] = useState(() => crypto.randomUUID());
  const formRef = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state.status !== "success" || !state.completedAt) return;
    formRef.current?.reset();
    setRequestId(crypto.randomUUID());
  }, [state.completedAt, state.status]);
  return <form ref={formRef} action={action} className="admin-card admin-section sales-form">
    <input type="hidden" name="lead_id" value={leadId}/><input type="hidden" name="request_id" value={requestId}/>
    <div className="admin-section-head"><div><h2>Svara via SMS</h2><p>Förslaget är redigerbart och skickas först när du godkänner.</p></div></div>
    <label className="sales-field">Meddelande<textarea name="message" rows={5} required maxLength={1000} defaultValue={suggestion} disabled={disabled}/></label>
    <div className="sales-form-footer"><Submit idle="Skicka SMS" pending="Skickar…" success="SMS skickat" successVisible={visible}/>{disabled && <span className="admin-inline-feedback error">Kontakten är spärrad.</span>}</div>
    <Feedback state={state} visible={visible}/>
  </form>;
}
