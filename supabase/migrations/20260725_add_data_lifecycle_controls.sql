create table if not exists public.privacy_requests (
  id uuid primary key default gen_random_uuid(),
  request_type text not null check (request_type in ('access','correction','deletion','restriction','objection','portability')),
  status text not null default 'open' check (status in ('open','identity_verification','in_progress','completed','rejected')),
  textback_number_id uuid references public.textback_numbers(id) on delete set null,
  subject_phone text,
  subject_email text,
  requester_name text,
  notes text,
  due_at timestamptz not null default (now() + interval '30 days'),
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (subject_phone is not null or subject_email is not null),
  check (notes is null or char_length(notes) <= 4000)
);

create index if not exists privacy_requests_status_due_idx on public.privacy_requests(status, due_at);
create index if not exists privacy_requests_company_idx on public.privacy_requests(textback_number_id, created_at desc);

alter table public.privacy_requests enable row level security;
revoke all on public.privacy_requests from anon, authenticated;
grant all on public.privacy_requests to service_role;

create table if not exists public.data_retention_runs (
  id uuid primary key default gen_random_uuid(),
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  status text not null default 'running' check (status in ('running','completed','failed')),
  deleted_counts jsonb not null default '{}'::jsonb,
  error_code text
);

alter table public.data_retention_runs enable row level security;
revoke all on public.data_retention_runs from anon, authenticated;
grant all on public.data_retention_runs to service_role;

create or replace function public.run_textback_retention()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_run_id uuid;
  v_count integer;
  v_counts jsonb := '{}'::jsonb;
begin
  insert into public.data_retention_runs default values returning id into v_run_id;

  delete from public.rate_limit_buckets where updated_at < now() - interval '2 days';
  get diagnostics v_count = row_count;
  v_counts := v_counts || jsonb_build_object('rate_limit_buckets', v_count);

  delete from public.stripe_webhook_events where created_at < now() - interval '180 days';
  get diagnostics v_count = row_count;
  v_counts := v_counts || jsonb_build_object('stripe_webhook_events', v_count);

  delete from public.operational_incidents where resolved_at is not null and resolved_at < now() - interval '365 days';
  get diagnostics v_count = row_count;
  v_counts := v_counts || jsonb_build_object('operational_incidents', v_count);

  delete from public.audit_events where created_at < now() - interval '730 days';
  get diagnostics v_count = row_count;
  v_counts := v_counts || jsonb_build_object('audit_events', v_count);

  update public.data_retention_runs
    set status = 'completed', completed_at = now(), deleted_counts = v_counts
    where id = v_run_id;
  return jsonb_build_object('run_id', v_run_id, 'deleted', v_counts);
exception when others then
  update public.data_retention_runs
    set status = 'failed', completed_at = now(), error_code = left(sqlstate || ':' || sqlerrm, 300)
    where id = v_run_id;
  raise;
end;
$$;

revoke all on function public.run_textback_retention() from public, anon, authenticated;
grant execute on function public.run_textback_retention() to service_role;

comment on table public.privacy_requests is 'Controlled workflow for GDPR and other data-subject requests.';
comment on table public.data_retention_runs is 'Audit ledger for automated data-retention cleanup.';
