"use client";

import { useEffect, useState } from "react";
import { useFormState, useFormStatus } from "react-dom";
import { Check, LoaderCircle, Mail, Upload } from "lucide-react";
import { initialAdminActionState, type AdminActionState } from "@/lib/admin-action-state";
import {
  importSalesEmailsWithFeedback,
  sendSalesEmailCampaignWithFeedback,
  updateSalesLeadEmailWithFeedback,
} from "@/app/admin/sales/email/actions";

function useSuccess(state: AdminActionState, duration = 4500) {
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

function Submit({ idle, pending, success, visible, icon = "mail", disabled = false }: { idle: string; pending: string; success: string; visible: boolean; icon?: "mail" | "upload"; disabled?: boolean }) {
  const { pending: isPending } = useFormStatus();
  const Icon = icon === "upload" ? Upload : Mail;
  const done = visible && !isPending;
  return <button type="submit" className={`admin-button primary sales-submit${done ? " is-success" : ""}`} disabled={disabled || isPending}>
    {isPending ? <LoaderCircle className="admin-spinner" size={16}/> : done ? <Check size={16}/> : <Icon size={16}/>}<span>{isPending ? pending : done ? success : idle}</span>
  </button>;
}

export function SalesEmailImportForm() {
  const [state, action] = useFormState(importSalesEmailsWithFeedback, initialAdminActionState);
  const visible = useSuccess(state, 6000);
  return <form action={action} className="admin-card admin-section sales-form" encType="multipart/form-data">
    <div className="admin-section-head"><div><h2>Importera e-postadresser</h2><p>Matcha mot befintliga leads via telefonnummer, organisationsnummer eller exakt företagsnamn.</p></div></div>
    <label className="sales-field">CSV-fil<input type="file" name="file" accept=".csv,text/csv"/></label>
    <label className="sales-field">Eller klistra in CSV<textarea name="csv" rows={11} placeholder="företagsnamn;epost;epostkälla;epostverifierad;telefonnummer;organisationsnummer"/></label>
    <div className="admin-note"><strong>Automatisk godkänning:</strong> endast generella företagsadresser som info@, kontakt@ och offert@ med HTTPS-källa och verifieringsdatum blir utskicksklara. Namngivna adresser sparas för manuell bedömning.</div>
    <div className="sales-form-footer"><Submit idle="Importera e-post" pending="Importerar…" success="Importen är klar" visible={visible} icon="upload"/><span className="muted">Max 500 rader. Inga mejl skickas.</span></div>
    <Feedback state={state} visible={visible}/>
  </form>;
}

export function SalesLeadEmailEditor({ lead }: { lead: { id: string; email_address?: string | null; email_source_url?: string | null; email_verified_at?: string | null } }) {
  const [state, action] = useFormState(updateSalesLeadEmailWithFeedback, initialAdminActionState);
  const visible = useSuccess(state);
  const verifiedDate = lead.email_verified_at ? new Date(lead.email_verified_at).toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10);
  return <form action={action} className="admin-card admin-section sales-form">
    <input type="hidden" name="lead_id" value={lead.id}/>
    <div className="admin-section-head"><div><h2>E-postuppgifter</h2><p>Adressen måste ha en sparad källa och aktuell verifiering.</p></div></div>
    <label className="sales-field">E-postadress<input type="email" name="email_address" required defaultValue={lead.email_address || ""} placeholder="info@foretag.se"/></label>
    <label className="sales-field">Källänk<input type="url" name="email_source_url" required defaultValue={lead.email_source_url || ""} placeholder="https://foretag.se/kontakt"/></label>
    <label className="sales-field">Verifierad datum<input type="date" name="email_verified_at" required defaultValue={verifiedDate}/></label>
    <div className="sales-form-footer"><Submit idle="Spara e-post" pending="Sparar…" success="Sparat" visible={visible}/></div>
    <Feedback state={state} visible={visible}/>
  </form>;
}

export function SendSalesEmailCampaignForm({ campaignId, disabled = false, disabledReason }: { campaignId: string; disabled?: boolean; disabledReason?: string }) {
  const [state, action] = useFormState(sendSalesEmailCampaignWithFeedback, initialAdminActionState);
  const visible = useSuccess(state, 6000);
  return <form action={action} className="sales-send-panel">
    <input type="hidden" name="campaign_id" value={campaignId}/>
    <Submit idle="Godkänn och skicka mejlen" pending="Skickar mejl…" success="E-postutskicket är klart" visible={visible} disabled={disabled}/>
    {disabled && <span className="admin-inline-feedback error">{disabledReason || "Kampanjen kan inte skickas."}</span>}
    <Feedback state={state} visible={visible}/>
  </form>;
}