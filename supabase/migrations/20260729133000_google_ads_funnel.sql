alter table public.pilot_leads add column if not exists gclid text;
alter table public.pilot_leads add column if not exists gbraid text;
alter table public.pilot_leads add column if not exists wbraid text;

create index if not exists pilot_leads_gclid_idx on public.pilot_leads(gclid) where gclid is not null;
create index if not exists pilot_leads_created_at_idx on public.pilot_leads(created_at desc);

create table if not exists public.marketing_events (
  id uuid primary key default gen_random_uuid(),
  event_name text not null check (event_name in ('page_view','demo_phone_clicked','launch_form_started','launch_enquiry_submitted')),
  session_id uuid not null,
  lead_id uuid references public.pilot_leads(id) on delete set null,
  path text not null check (char_length(path) between 1 and 500),
  landing_path text,
  utm_source text,
  utm_medium text,
  utm_campaign text,
  utm_content text,
  utm_term text,
  gclid text,
  gbraid text,
  wbraid text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists marketing_events_created_idx on public.marketing_events(created_at desc);
create index if not exists marketing_events_event_idx on public.marketing_events(event_name, created_at desc);
create index if not exists marketing_events_session_idx on public.marketing_events(session_id, created_at);
create index if not exists marketing_events_campaign_idx on public.marketing_events(utm_campaign, created_at desc) where utm_campaign is not null;
create unique index if not exists marketing_events_lead_submit_unique on public.marketing_events(lead_id, event_name) where lead_id is not null and event_name = 'launch_enquiry_submitted';

alter table public.marketing_events enable row level security;

comment on table public.marketing_events is 'Consent-aware first-party marketing funnel events without contact details or message content.';