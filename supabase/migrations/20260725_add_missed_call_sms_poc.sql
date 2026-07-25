create table if not exists public.textback_numbers (
  id uuid primary key default gen_random_uuid(),
  provider text not null check (provider in ('46elks')),
  provider_number text not null,
  business_name text not null,
  business_phone_numbers text[] not null default '{}',
  sms_template text not null default 'Hej! Vi kunde inte svara just nu. Beskriv gärna vad du behöver hjälp med, så återkommer vi så snart vi kan. / {{businessName}}',
  sms_sender text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (provider, provider_number)
);

create table if not exists public.missed_call_events (
  id uuid primary key default gen_random_uuid(),
  provider text not null,
  provider_call_id text not null,
  textback_number_id uuid references public.textback_numbers(id) on delete set null,
  caller_number text,
  destination_number text,
  status text not null check (status in ('ignored','deduplicated','sms_queued','sms_logged','sms_sent','sms_delivered','sms_failed')),
  reason text,
  sms_provider_id text,
  raw_event jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  sms_sent_at timestamptz,
  sms_delivered_at timestamptz,
  unique (provider, provider_call_id)
);

create index if not exists missed_call_events_dedupe_idx
  on public.missed_call_events (textback_number_id, caller_number, created_at desc);
create index if not exists missed_call_events_sms_provider_idx
  on public.missed_call_events (sms_provider_id) where sms_provider_id is not null;

alter table public.textback_numbers enable row level security;
alter table public.missed_call_events enable row level security;

revoke all on public.textback_numbers from anon, authenticated;
revoke all on public.missed_call_events from anon, authenticated;
grant all on public.textback_numbers to service_role;
grant all on public.missed_call_events to service_role;

comment on table public.textback_numbers is 'Maps provider-controlled Textback numbers to customer SMS configuration.';
comment on table public.missed_call_events is 'Idempotent audit log for missed calls, deduplication and SMS delivery.';
