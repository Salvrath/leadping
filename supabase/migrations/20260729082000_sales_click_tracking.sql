create table if not exists public.sales_tracking_events (
  id uuid primary key default gen_random_uuid(),
  sales_lead_id uuid not null references public.sales_leads(id) on delete cascade,
  event_type text not null check (event_type in ('request','confirmed')),
  confirmation_method text check (confirmation_method in ('interaction','visible_delay')),
  suspected_scanner boolean not null default false,
  user_agent text,
  request_metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists sales_tracking_events_lead_created_idx
  on public.sales_tracking_events(sales_lead_id, created_at desc);
create index if not exists sales_tracking_events_type_created_idx
  on public.sales_tracking_events(event_type, created_at desc);

alter table public.sales_tracking_events enable row level security;

comment on table public.sales_tracking_events is 'Separates raw tracking URL requests from browser-confirmed human visits so link scanners do not count as engaged leads.';
