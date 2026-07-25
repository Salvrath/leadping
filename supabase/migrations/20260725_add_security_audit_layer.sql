create table if not exists public.audit_events (
  id uuid primary key default gen_random_uuid(),
  actor_type text not null check (actor_type in ('admin','customer','system')),
  actor_id text,
  action text not null,
  target_type text not null,
  target_id text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists audit_events_created_at_idx on public.audit_events (created_at desc);
create index if not exists audit_events_target_idx on public.audit_events (target_type, target_id, created_at desc);

alter table public.audit_events enable row level security;
revoke all on public.audit_events from anon, authenticated;

create table if not exists public.rate_limit_buckets (
  key text primary key,
  window_started_at timestamptz not null,
  attempts integer not null default 0,
  blocked_until timestamptz,
  updated_at timestamptz not null default now()
);

alter table public.rate_limit_buckets enable row level security;
revoke all on public.rate_limit_buckets from anon, authenticated;

create or replace function public.consume_rate_limit(
  p_key text,
  p_limit integer,
  p_window_seconds integer,
  p_block_seconds integer
) returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now timestamptz := now();
  v_row public.rate_limit_buckets%rowtype;
begin
  if p_key is null or length(p_key) < 3 or p_limit < 1 or p_window_seconds < 1 or p_block_seconds < 1 then
    raise exception 'INVALID_RATE_LIMIT_ARGUMENTS';
  end if;

  select * into v_row from public.rate_limit_buckets where key = p_key for update;

  if not found then
    insert into public.rate_limit_buckets(key, window_started_at, attempts, updated_at)
    values (p_key, v_now, 1, v_now);
    return true;
  end if;

  if v_row.blocked_until is not null and v_row.blocked_until > v_now then
    return false;
  end if;

  if v_row.window_started_at <= v_now - make_interval(secs => p_window_seconds) then
    update public.rate_limit_buckets
      set window_started_at = v_now, attempts = 1, blocked_until = null, updated_at = v_now
      where key = p_key;
    return true;
  end if;

  if v_row.attempts + 1 > p_limit then
    update public.rate_limit_buckets
      set attempts = attempts + 1, blocked_until = v_now + make_interval(secs => p_block_seconds), updated_at = v_now
      where key = p_key;
    return false;
  end if;

  update public.rate_limit_buckets set attempts = attempts + 1, updated_at = v_now where key = p_key;
  return true;
end;
$$;

revoke all on function public.consume_rate_limit(text, integer, integer, integer) from public, anon, authenticated;
grant execute on function public.consume_rate_limit(text, integer, integer, integer) to service_role;
