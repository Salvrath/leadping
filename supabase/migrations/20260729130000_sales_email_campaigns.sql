alter table public.sales_leads add column if not exists email_address text;
alter table public.sales_leads add column if not exists email_type text not null default 'unknown' check (email_type in ('generic','personal','unknown'));
alter table public.sales_leads add column if not exists email_source_url text;
alter table public.sales_leads add column if not exists email_verified_at timestamptz;
alter table public.sales_leads add column if not exists email_status text not null default 'missing' check (email_status in ('missing','pending','verified','invalid','bounced','complained','unsubscribed'));
alter table public.sales_leads add column if not exists email_outbound_count integer not null default 0 check (email_outbound_count >= 0);
alter table public.sales_leads add column if not exists email_first_contacted_at timestamptz;
alter table public.sales_leads add column if not exists email_last_contacted_at timestamptz;
alter table public.sales_leads add column if not exists email_unsubscribe_token uuid not null default gen_random_uuid();

create unique index if not exists sales_leads_email_unsubscribe_unique on public.sales_leads(email_unsubscribe_token);
create index if not exists sales_leads_email_ready_idx on public.sales_leads(email_status, email_type, automation_score desc) where email_address is not null;

create table if not exists public.sales_email_campaigns (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 2 and 160),
  subject_template text not null check (char_length(subject_template) between 2 and 200),
  body_template text not null check (char_length(body_template) between 20 and 10000),
  status text not null default 'draft' check (status in ('draft','sending','completed','partially_failed','cancelled')),
  recipient_count integer not null default 0,
  sent_count integer not null default 0,
  delivered_count integer not null default 0,
  clicked_count integer not null default 0,
  replied_count integer not null default 0,
  bounced_count integer not null default 0,
  failed_count integer not null default 0,
  created_at timestamptz not null default now(),
  sent_at timestamptz,
  completed_at timestamptz,
  updated_at timestamptz not null default now()
);

create table if not exists public.sales_email_campaign_recipients (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.sales_email_campaigns(id) on delete cascade,
  sales_lead_id uuid not null references public.sales_leads(id) on delete cascade,
  tracking_token uuid not null default gen_random_uuid(),
  email_address text not null,
  status text not null default 'queued' check (status in ('queued','sending','sent','delivered','clicked','replied','bounced','complained','failed','skipped','blocked')),
  rendered_subject text not null,
  rendered_text text not null,
  rendered_html text not null,
  provider_message_id text,
  failure_reason text,
  sent_at timestamptz,
  delivered_at timestamptz,
  clicked_at timestamptz,
  replied_at timestamptz,
  bounced_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (campaign_id, sales_lead_id)
);

create unique index if not exists sales_email_recipients_tracking_unique on public.sales_email_campaign_recipients(tracking_token);
create unique index if not exists sales_email_recipients_provider_unique on public.sales_email_campaign_recipients(provider_message_id) where provider_message_id is not null;
create index if not exists sales_email_recipients_lead_idx on public.sales_email_campaign_recipients(sales_lead_id, created_at desc);

create table if not exists public.sales_email_suppressions (
  id uuid primary key default gen_random_uuid(),
  email_address text not null unique,
  reason text not null,
  source text not null default 'unsubscribe',
  sales_lead_id uuid references public.sales_leads(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.sales_email_events (
  id uuid primary key default gen_random_uuid(),
  provider_event_id text not null unique,
  provider_message_id text,
  event_type text not null,
  sales_email_campaign_recipient_id uuid references public.sales_email_campaign_recipients(id) on delete set null,
  raw_event jsonb not null default '{}'::jsonb,
  provider_created_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists sales_email_events_message_idx on public.sales_email_events(provider_message_id, created_at desc);

alter table public.sales_tracking_events add column if not exists sales_email_campaign_recipient_id uuid references public.sales_email_campaign_recipients(id) on delete set null;

alter table public.sales_email_campaigns enable row level security;
alter table public.sales_email_campaign_recipients enable row level security;
alter table public.sales_email_suppressions enable row level security;
alter table public.sales_email_events enable row level security;

comment on table public.sales_email_campaigns is 'Manually approved email campaigns sent from Textback Sales Hub.';
comment on table public.sales_email_suppressions is 'Email-only suppression list for unsubscribe, bounce and complaint handling.';
comment on table public.sales_email_events is 'Idempotent Resend webhook event journal.';