create table if not exists public.sales_leads (
  id uuid primary key default gen_random_uuid(),
  company_name text not null check (char_length(company_name) between 2 and 160),
  organization_number text,
  company_type text not null default 'unknown' check (company_type in ('aktiebolag','other_legal_entity','sole_trader','unknown')),
  industry text,
  city text,
  contact_name text,
  phone_number text not null,
  source_url text,
  source_notes text,
  verified_at timestamptz,
  fit_score integer not null default 50 check (fit_score between 0 and 100),
  fit_reason text,
  status text not null default 'review' check (status in ('review','approved','contacted','engaged','demo_tested','replied','interested','follow_up','converted','not_interested','invalid','blocked')),
  reply_classification text,
  tags text[] not null default '{}',
  notes text,
  do_not_contact boolean not null default false,
  outbound_count integer not null default 0 check (outbound_count >= 0),
  first_contacted_at timestamptz,
  last_contacted_at timestamptz,
  last_reply_at timestamptz,
  demo_called_at timestamptz,
  website_clicked_at timestamptz,
  next_follow_up_at timestamptz,
  stop_requested_at timestamptz,
  tracking_token uuid not null default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists sales_leads_phone_unique on public.sales_leads(phone_number);
create unique index if not exists sales_leads_tracking_token_unique on public.sales_leads(tracking_token);
create unique index if not exists sales_leads_org_unique on public.sales_leads(organization_number) where organization_number is not null and organization_number <> '';
create index if not exists sales_leads_status_idx on public.sales_leads(status, updated_at desc);
create index if not exists sales_leads_follow_up_idx on public.sales_leads(next_follow_up_at) where next_follow_up_at is not null and do_not_contact = false;

create table if not exists public.sales_campaigns (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 2 and 160),
  textback_number_id uuid not null references public.textback_numbers(id) on delete restrict,
  message_template text not null check (char_length(message_template) between 20 and 1000),
  status text not null default 'draft' check (status in ('draft','sending','completed','partially_failed','cancelled')),
  recipient_count integer not null default 0,
  sent_count integer not null default 0,
  delivered_count integer not null default 0,
  reply_count integer not null default 0,
  failed_count integer not null default 0,
  estimated_parts integer not null default 0,
  estimated_cost_ore integer not null default 0,
  created_at timestamptz not null default now(),
  sent_at timestamptz,
  completed_at timestamptz,
  updated_at timestamptz not null default now()
);

create table if not exists public.sales_campaign_recipients (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.sales_campaigns(id) on delete cascade,
  sales_lead_id uuid not null references public.sales_leads(id) on delete cascade,
  status text not null default 'queued' check (status in ('queued','sending','sent','delivered','replied','failed','skipped','blocked')),
  rendered_message text not null,
  estimated_parts integer not null default 1,
  estimated_cost_ore integer not null default 0,
  provider_message_id text,
  failure_reason text,
  sent_at timestamptz,
  delivered_at timestamptz,
  replied_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (campaign_id, sales_lead_id)
);

create index if not exists sales_campaign_recipients_lead_idx on public.sales_campaign_recipients(sales_lead_id, created_at desc);
create index if not exists sales_campaign_recipients_provider_idx on public.sales_campaign_recipients(provider_message_id) where provider_message_id is not null;

create table if not exists public.sales_messages (
  id uuid primary key default gen_random_uuid(),
  sales_lead_id uuid not null references public.sales_leads(id) on delete cascade,
  campaign_recipient_id uuid references public.sales_campaign_recipients(id) on delete set null,
  textback_number_id uuid not null references public.textback_numbers(id) on delete restrict,
  provider text not null default '46elks',
  provider_message_id text,
  direction text not null check (direction in ('inbound','outbound')),
  sender_number text not null,
  recipient_number text not null,
  body text not null check (char_length(body) between 1 and 4000),
  delivery_status text,
  classification text,
  suggested_reply text,
  client_request_id uuid,
  sms_parts integer,
  sms_cost integer,
  raw_event jsonb not null default '{}'::jsonb,
  provider_created_at timestamptz,
  sent_at timestamptz,
  delivered_at timestamptz,
  failed_at timestamptz,
  failure_reason text,
  created_at timestamptz not null default now()
);

create unique index if not exists sales_messages_provider_unique on public.sales_messages(provider, provider_message_id) where provider_message_id is not null;
create unique index if not exists sales_messages_request_unique on public.sales_messages(client_request_id) where client_request_id is not null;
create index if not exists sales_messages_lead_idx on public.sales_messages(sales_lead_id, created_at);

create table if not exists public.sales_suppressions (
  id uuid primary key default gen_random_uuid(),
  phone_number text not null unique,
  reason text not null,
  source text not null default 'reply',
  sales_lead_id uuid references public.sales_leads(id) on delete set null,
  created_at timestamptz not null default now()
);

alter table public.missed_call_events add column if not exists sales_lead_id uuid references public.sales_leads(id) on delete set null;
create index if not exists missed_call_events_sales_lead_idx on public.missed_call_events(sales_lead_id, created_at desc) where sales_lead_id is not null;

alter table public.sales_leads enable row level security;
alter table public.sales_campaigns enable row level security;
alter table public.sales_campaign_recipients enable row level security;
alter table public.sales_messages enable row level security;
alter table public.sales_suppressions enable row level security;

comment on table public.sales_leads is 'Prospective companies managed in the internal Textback Sales Hub.';
comment on table public.sales_suppressions is 'Central do-not-contact list for sales outreach.';
