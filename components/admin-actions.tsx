"use client";

import { useEffect, useState } from "react";
import { useFormState, useFormStatus } from "react-dom";
import { Check, LoaderCircle, LogOut, Pause, Play, Save } from "lucide-react";
import {
  logoutAdmin,
  setTextbackNumberActiveWithFeedback,
  updateConversationStatusWithFeedback,
} from "@/app/admin/actions";
import { initialAdminActionState, type AdminActionState } from "@/lib/admin-action-state";

function useTransientSuccess(state: AdminActionState, duration = 2400) {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    if (state.status !== "success" || !state.completedAt) return;
    setVisible(true);
    const timer = window.setTimeout(() => setVisible(false), duration);
    return () => window.clearTimeout(timer);
  }, [duration, state.completedAt, state.status]);
  return visible;
}

function ActionButton({ idle, pending, success, successVisible, tone = "primary", icon = "save" }: {
  idle: string;
  pending: string;
  success: string;
  successVisible: boolean;
  tone?: "primary" | "danger" | "neutral";
  icon?: "save" | "play" | "pause";
}) {
  const { pending: isPending } = useFormStatus();
  const Icon = icon === "play" ? Play : icon === "pause" ? Pause : Save;
  const isSuccess = successVisible && !isPending;
  return <button type="submit" disabled={isPending} className={`admin-button ${tone} admin-action-button${isPending ? " is-pending" : ""}${isSuccess ? " is-success" : ""}`}>
    {isPending ? <LoaderCircle className="admin-spinner" size={15}/> : isSuccess ? <Check size={15}/> : <Icon size={15}/>} 
    <span>{isPending ? pending : isSuccess ? success : idle}</span>
  </button>;
}

function Feedback({ state, visible }: { state: AdminActionState; visible: boolean }) {
  if (state.status === "error") return <span className="admin-inline-feedback error" role="alert">{state.message}</span>;
  if (state.status === "success" && visible) return <span className="admin-inline-feedback success" role="status"><Check size={14}/>{state.message}</span>;
  return null;
}

export function AdminConversationStatusForm({ id, status }: { id: string; status: string }) {
  const [state, action] = useFormState(updateConversationStatusWithFeedback, initialAdminActionState);
  const visible = useTransientSuccess(state);
  return <form action={action} className="admin-inline-form">
    <input type="hidden" name="id" value={id}/>
    <select name="status" defaultValue={status} aria-label="Konversationsstatus">
      <option value="new">Nytt</option>
      <option value="open">Pågående</option>
      <option value="contacted">Kontaktad</option>
      <option value="closed">Avslutad</option>
      <option value="blocked">Blockerad</option>
    </select>
    <ActionButton idle="Spara" pending="Sparar" success="Sparat" successVisible={visible}/>
    <Feedback state={state} visible={visible}/>
  </form>;
}

export function AdminCompanyStateForm({ id, active }: { id: string; active: boolean }) {
  const [state, action] = useFormState(setTextbackNumberActiveWithFeedback, initialAdminActionState);
  const visible = useTransientSuccess(state);
  return <form action={action} className="admin-inline-form">
    <input type="hidden" name="id" value={id}/>
    <input type="hidden" name="active" value={String(!active)}/>
    <ActionButton
      idle={active ? "Pausa" : "Aktivera"}
      pending={active ? "Pausar" : "Aktiverar"}
      success={active ? "Pausad" : "Aktiverad"}
      successVisible={visible}
      tone={active ? "danger" : "primary"}
      icon={active ? "pause" : "play"}
    />
    <Feedback state={state} visible={visible}/>
  </form>;
}

function LogoutButton() {
  const { pending } = useFormStatus();
  return <button className="admin-button neutral" type="submit" disabled={pending}>
    {pending ? <LoaderCircle className="admin-spinner" size={15}/> : <LogOut size={15}/>} 
    <span>{pending ? "Loggar ut" : "Logga ut"}</span>
  </button>;
}

export function AdminLogoutForm() {
  return <form action={logoutAdmin}><LogoutButton/></form>;
}
