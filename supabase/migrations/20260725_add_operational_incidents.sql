create table if not exists public.operational_incidents (
  id uuid primary key default gen_random_uuid(),
  source text not null,
  severity text not null check (severity in ('warning','critical')),
  code text not null,
  summary text not null,
  context jsonb not null default '{}'::jsonb,
  fingerprint text not null,
  occurrence_count integer not null default 1,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  alerted_at timestamptz,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (fingerprint)
);

create index if not exists operational_incidents_open_idx
  on public.operational_incidents (resolved_at, severity, last_seen_at desc);

alter table public.operational_incidents enable row level security;
revoke all on table public.operational_incidents from anon, authenticated;

comment on table public.operational_incidents is 'Deduplicated operational failures from telephony, SMS, Stripe and webhook processing.';
