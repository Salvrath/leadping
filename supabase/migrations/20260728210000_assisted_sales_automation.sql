create table if not exists public.sales_automation_settings (
  id boolean primary key default true check (id),
  paused boolean not null default false,
  auto_approve_verified boolean not null default true,
  auto_create_drafts boolean not null default true,
  simulation_only boolean not null default false,
  batch_size integer not null default 20 check (batch_size between 1 and 50),
  min_draft_size integer not null default 5 check (min_draft_size between 1 and 50),
  verification_max_age_days integer not null default 60 check (verification_max_age_days between 1 and 365),
  follow_up_after_days integer not null default 4 check (follow_up_after_days between 1 and 30),
  updated_at timestamptz not null default now()
);

insert into public.sales_automation_settings (id)
values (true)
on conflict (id) do nothing;

create table if not exists public.sales_import_batches (
  id uuid primary key default gen_random_uuid(),
  source text not null default 'admin',
  source_query text,
  status text not null default 'processing' check (status in ('processing','completed','partially_completed','failed')),
  total_rows integer not null default 0,
  imported_count integer not null default 0,
  rejected_count integer not null default 0,
  duplicate_count integer not null default 0,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create table if not exists public.sales_automation_runs (
  id uuid primary key default gen_random_uuid(),
  source text not null check (source in ('admin','cron','import')),
  dry_run boolean not null default true,
  status text not null default 'running' check (status in ('running','completed','failed','paused')),
  summary jsonb not null default '{}'::jsonb,
  error_message text,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

alter table public.sales_leads add column if not exists import_batch_id uuid references public.sales_import_batches(id) on delete set null;
alter table public.sales_leads add column if not exists verification_status text not null default 'pending' check (verification_status in ('pending','ready','needs_review','rejected'));
alter table public.sales_leads add column if not exists verification_reasons text[] not null default '{}';
alter table public.sales_leads add column if not exists verified_by_system_at timestamptz;
alter table public.sales_leads add column if not exists recommended_action text;
alter table public.sales_leads add column if not exists recommendation_reason text;
alter table public.sales_leads add column if not exists automation_score integer not null default 0 check (automation_score between 0 and 100);
alter table public.sales_leads add column if not exists automation_updated_at timestamptz;
alter table public.sales_leads add column if not exists follow_up_template text;
alter table public.sales_leads add column if not exists follow_up_suggested_at timestamptz;

alter table public.sales_campaigns add column if not exists created_by_mode text not null default 'manual' check (created_by_mode in ('manual','assisted'));
alter table public.sales_campaigns add column if not exists automation_type text check (automation_type in ('cold_outreach','follow_up'));
alter table public.sales_campaigns add column if not exists automation_run_id uuid references public.sales_automation_runs(id) on delete set null;
alter table public.sales_campaigns add column if not exists simulation_snapshot jsonb not null default '{}'::jsonb;

create index if not exists sales_leads_verification_idx on public.sales_leads(verification_status, automation_score desc, updated_at desc);
create index if not exists sales_leads_import_batch_idx on public.sales_leads(import_batch_id) where import_batch_id is not null;
create index if not exists sales_automation_runs_created_idx on public.sales_automation_runs(created_at desc);
create index if not exists sales_import_batches_created_idx on public.sales_import_batches(created_at desc);
create index if not exists sales_campaigns_assisted_idx on public.sales_campaigns(created_by_mode, automation_type, status, created_at desc);

alter table public.sales_automation_settings enable row level security;
alter table public.sales_import_batches enable row level security;
alter table public.sales_automation_runs enable row level security;

update public.sales_leads
set verification_status = case
  when do_not_contact then 'rejected'
  when company_type = 'aktiebolag' and source_url is not null and verified_at is not null and phone_number like '+467%' then 'ready'
  else 'pending'
end,
verification_reasons = case
  when do_not_contact then array['Kontakten är spärrad.']::text[]
  when company_type = 'aktiebolag' and source_url is not null and verified_at is not null and phone_number like '+467%' then '{}'::text[]
  else array['Automatisk kontroll behöver köras.']::text[]
end,
automation_score = greatest(0, least(100, fit_score)),
recommended_action = case
  when do_not_contact then 'Ingen kontakt'
  when status in ('interested','replied','demo_tested','engaged') then 'Hantera signal'
  when status = 'approved' then 'Förbered kampanjutkast'
  else 'Verifiera lead'
end,
automation_updated_at = now()
where automation_updated_at is null;

comment on table public.sales_automation_settings is 'Singleton configuration for assisted Sales Hub automation. No outbound message is sent by the automation engine.';
comment on table public.sales_automation_runs is 'Audit log for simulations and assisted preparation runs.';
comment on table public.sales_import_batches is 'Traceable batches for lead imports and validation outcomes.';