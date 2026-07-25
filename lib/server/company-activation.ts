import "server-only";

export const activationStepFields = [
  "provider_configured_at",
  "forwarding_verified_at",
  "caller_id_verified_at",
  "inbound_sms_verified_at",
  "outbound_sms_verified_at",
  "portal_account_verified_at",
] as const;

export type ActivationStepField = typeof activationStepFields[number];
export type ActivationRecord = Partial<Record<ActivationStepField, string | null>>;

export const activationStepLabels: Record<ActivationStepField, string> = {
  provider_configured_at: "46elks-nummer och webhookar verifierade",
  forwarding_verified_at: "Vidarekoppling vid ej svar verifierad",
  caller_id_verified_at: "Ursprungligt uppringarnummer verifierat",
  inbound_sms_verified_at: "Inkommande SMS-svar verifierat",
  outbound_sms_verified_at: "Utgående SMS och leveransstatus verifierade",
  portal_account_verified_at: "Kundkonto och behörighet verifierade",
};

export function activationReadiness(record: ActivationRecord) {
  const missing = activationStepFields.filter((field) => !record[field]);
  return {
    ready: missing.length === 0,
    completed: activationStepFields.length - missing.length,
    total: activationStepFields.length,
    missing,
  };
}

export function assertActivationStep(value: string): asserts value is ActivationStepField {
  if (!activationStepFields.includes(value as ActivationStepField)) {
    throw new Error("INVALID_ACTIVATION_STEP");
  }
}
