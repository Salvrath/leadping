export type IncomingCall = {
  provider: "46elks";
  providerCallId: string;
  callerNumber: string | null;
  destinationNumber: string | null;
  createdAt?: string;
  raw: Record<string, string>;
};

export type TextbackNumber = {
  id: string;
  provider: string;
  provider_number: string;
  business_name: string;
  business_phone_numbers: string[];
  sms_template: string;
  sms_sender: string | null;
  active: boolean;
};

export type SmsMode = "log" | "dryrun" | "live";

export type SmsResult = {
  mode: SmsMode;
  providerId?: string;
  status: "logged" | "created";
  providerStatus?: string;
  parts?: number;
  cost?: number;
};