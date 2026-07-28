"use client";

import { useEffect, useRef, useState } from "react";
import { useFormState, useFormStatus } from "react-dom";
import { BellRing, Check, LoaderCircle, LogOut, MessageSquareText, Send, Sparkles } from "lucide-react";
import {
  logoutCustomer,
  sendCustomerReply,
  updateCustomerConversationStatus,
  updateCustomerSettings,
} from "@/app/portal/actions";
import { conversationStatuses, statusLabel } from "@/lib/portal-status";
import { initialPortalActionState, type PortalActionState } from "@/lib/portal-action-state";

function useTransientSuccess(state: PortalActionState, duration = 3200) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (state.status !== "success" || !state.completedAt) return;
    setVisible(true);
    const timer = window.setTimeout(() => setVisible(false), duration);
    return () => window.clearTimeout(timer);
  }, [duration, state.completedAt, state.status]);

  return visible;
}

function SubmitButton({
  idleLabel,
  pendingLabel,
  successLabel,
  successVisible,
  disabled = false,
  compact = false,
  icon = "check",
}: {
  idleLabel: string;
  pendingLabel: string;
  successLabel: string;
  successVisible: boolean;
  disabled?: boolean;
  compact?: boolean;
  icon?: "send" | "check";
}) {
  const { pending } = useFormStatus();
  const isSuccess = successVisible && !pending;
  const Icon = icon === "send" ? Send : Check;

  return <button
    type="submit"
    disabled={disabled || pending}
    className={`portal-button primary portal-action-button${compact ? " compact" : ""}${pending ? " is-pending" : ""}${isSuccess ? " is-success" : ""}`}
    aria-live="polite"
  >
    {pending ? <LoaderCircle className="portal-spinner" size={16}/> : <Icon size={16}/>} 
    <span>{pending ? pendingLabel : isSuccess ? successLabel : idleLabel}</span>
  </button>;
}

function ActionFeedback({ state, successVisible }: { state: PortalActionState; successVisible: boolean }) {
  const { pending } = useFormStatus();
  if (pending) return <span className="portal-action-feedback pending" role="status">Bearbetar…</span>;
  if (state.status === "error") return <span className="portal-action-feedback error" role="alert">{state.message}</span>;
  if (state.status === "success" && successVisible) return <span className="portal-action-feedback success" role="status"><Check size={15}/>{state.message}</span>;
  return null;
}

export function StatusUpdateForm({ id, status }: { id: string; status: string }) {
  const [state, formAction] = useFormState(updateCustomerConversationStatus, initialPortalActionState);
  const successVisible = useTransientSuccess(state, 2200);

  return <form className="portal-status-form" action={formAction}>
    <input type="hidden" name="id" value={id}/>
    <select name="status" defaultValue={status} aria-label="Ärendestatus">
      {conversationStatuses.map((value) => <option value={value} key={value}>{statusLabel(value)}</option>)}
    </select>
    <SubmitButton
      idleLabel="Spara"
      pendingLabel="Sparar"
      successLabel="Sparat"
      successVisible={successVisible}
      compact
    />
    <span className="sr-only" aria-live="polite">{state.message}</span>
  </form>;
}

export function CustomerSettingsForm({
  notificationsEnabled,
  notificationEmail,
  smsTemplate,
  demoMode,
}: {
  notificationsEnabled: boolean;
  notificationEmail: string;
  smsTemplate: string;
  demoMode: boolean;
}) {
  const [state, formAction] = useFormState(updateCustomerSettings, initialPortalActionState);
  const successVisible = useTransientSuccess(state);

  return <form action={formAction} className="portal-card portal-panel portal-settings-form">
    <div className="portal-section-label"><BellRing size={14}/> E-postnotiser</div>
    <h2>Få ett mejl när ett nytt lead kommer in</h2>
    <label className="portal-toggle">
      <input type="checkbox" name="email_notifications_enabled" defaultChecked={notificationsEnabled}/>
      <span><strong>Skicka e-postnotis för nya kundärenden</strong><span className="portal-muted">Mejlet innehåller kundens telefonnummer, meddelande och en direktlänk till konversationen.</span></span>
    </label>
    <label className="portal-field">E-postadress för notiser
      <input type="email" name="notification_email" maxLength={320} defaultValue={notificationEmail} placeholder="namn@foretag.se"/>
      <span className="portal-help">Adressen används endast för notifieringar från Textback.</span>
    </label>

    <div className="portal-divider"/>

    <div className="portal-section-label"><MessageSquareText size={14}/> Automatiskt SMS</div>
    <h2>Meddelandet kunden får</h2>
    {demoMode && <div className="portal-alert info"><Sparkles size={19}/><p><strong>Demonumret använder en fast demotext.</strong><br/>Den publika demon skickar alltid Textbacks demonstrationsmeddelande och länk till webbplatsen.</p></div>}
    <label className="portal-field">SMS-mall
      <textarea name="sms_template" required minLength={10} maxLength={1000} defaultValue={smsTemplate} rows={7}/>
      <span className="portal-help">Använd {"{{businessName}}"} för att infoga företagsnamnet automatiskt.</span>
    </label>
    <div className="portal-save-row">
      <SubmitButton idleLabel="Spara inställningar" pendingLabel="Sparar…" successLabel="Sparat" successVisible={successVisible}/>
      <ActionFeedback state={state} successVisible={successVisible}/>
    </div>
  </form>;
}

export function CustomerReplyForm({
  conversationId,
  initialRequestId,
  canSend,
  testMode,
  helperText,
}: {
  conversationId: string;
  initialRequestId: string;
  canSend: boolean;
  testMode: boolean;
  helperText: string;
}) {
  const [state, formAction] = useFormState(sendCustomerReply, initialPortalActionState);
  const [requestId, setRequestId] = useState(initialRequestId);
  const successVisible = useTransientSuccess(state);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.status !== "success" || !state.completedAt) return;
    formRef.current?.reset();
    setRequestId(crypto.randomUUID());
  }, [state.completedAt, state.status]);

  return <form ref={formRef} action={formAction} className="portal-reply">
    <input type="hidden" name="conversation_id" value={conversationId}/>
    <input type="hidden" name="request_id" value={requestId}/>
    <label htmlFor="message" className="portal-field">{testMode ? "Testa svar via SMS" : "Svara kunden via SMS"}
      <textarea id="message" name="message" required maxLength={1600} disabled={!canSend} placeholder="Skriv ett kort och tydligt svar..."/>
    </label>
    <div className="portal-reply-footer">
      <div className="portal-reply-copy">
        <small className="portal-muted">{helperText}</small>
        <ActionFeedback state={state} successVisible={successVisible}/>
      </div>
      <SubmitButton
        idleLabel={testMode ? "Kör SMS-test" : "Skicka SMS"}
        pendingLabel={testMode ? "Kör test…" : "Skickar…"}
        successLabel={testMode ? "Test klart" : "SMS skickat"}
        successVisible={successVisible}
        disabled={!canSend}
        icon="send"
      />
    </div>
  </form>;
}

function LogoutButton() {
  const { pending } = useFormStatus();
  return <button type="submit" disabled={pending} aria-live="polite">
    {pending ? <LoaderCircle className="portal-spinner" size={16}/> : <LogOut size={16}/>} 
    <span>{pending ? "Loggar ut…" : "Logga ut"}</span>
  </button>;
}

export function CustomerLogoutForm() {
  return <form action={logoutCustomer}><LogoutButton/></form>;
}
