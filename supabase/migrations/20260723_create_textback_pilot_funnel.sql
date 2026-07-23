-- Textback pilot funnel. Apply with Supabase CLI or SQL editor.
-- RLS is deliberately enabled without anon/authenticated policies: only the
-- server-side service role may access these records.
create extension if not exists pgcrypto;

create table public.pilot_leads (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  company text not null,
  org_number text,
  contact_name text not null,
  email text not null,
  phone text not null,
  workshop_phone text not null,
  telephony text not null,
  missed_calls_per_week integer not null check (missed_calls_per_week between 0 and 10000),
  employees integer not null check (employees between 1 and 10000),
  message text,
  privacy_accepted_at timestamptz not null,
  authority_confirmed_at timestamptz not null,
  submission_id uuid not null unique,
  status text not null default 'application_submitted' check (status in ('application_submitted','checkout_started','pilot_paid','compatibility_review','accepted','rejected','cancelled')),
  payment_status text not null default 'not_started' check (payment_status in ('not_started','checkout_created','paid','failed','expired','refunded')),
  stripe_checkout_session_id text unique,
  stripe_customer_id text,
  stripe_payment_intent_id text,
  paid_at timestamptz,
  refunded_at timestamptz,
  utm_source text,
  utm_medium text,
  utm_campaign text,
  utm_content text,
  utm_term text,
  landing_path text,
  referrer text
);

create table public.stripe_webhook_events (
  stripe_event_id text primary key,
  event_type text not null,
  created_at timestamptz not null default now(),
  processed_at timestamptz,
  processing_error text
);

alter table public.pilot_leads enable row level security;
alter table public.stripe_webhook_events enable row level security;

create function public.set_textback_updated_at() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end; $$;
create trigger pilot_leads_updated_at before update on public.pilot_leads
for each row execute function public.set_textback_updated_at();

comment on table public.pilot_leads is 'Service-role-only Textback pilot applications; RLS has no client policies.';
comment on table public.stripe_webhook_events is 'Service-role-only Stripe webhook idempotency ledger; RLS has no client policies.';
