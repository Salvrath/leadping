alter table public.pilot_leads
  add column if not exists stripe_subscription_id text,
  add column if not exists subscription_status text,
  add column if not exists cancel_at_period_end boolean not null default false,
  add column if not exists current_period_end timestamptz,
  add column if not exists canceled_at timestamptz,
  add column if not exists last_invoice_id text,
  add column if not exists last_invoice_status text,
  add column if not exists last_invoice_at timestamptz;

create unique index if not exists pilot_leads_stripe_subscription_id_idx
  on public.pilot_leads (stripe_subscription_id)
  where stripe_subscription_id is not null;

create index if not exists pilot_leads_subscription_status_idx
  on public.pilot_leads (subscription_status, current_period_end);

comment on column public.pilot_leads.subscription_status is 'Latest Stripe subscription lifecycle status.';
comment on column public.pilot_leads.current_period_end is 'Current Stripe billing period end used for access and cancellation handling.';
