create table if not exists public.customer_users (
  id uuid primary key default gen_random_uuid(),
  textback_number_id uuid not null unique references public.textback_numbers(id) on delete cascade,
  email text not null unique,
  password_hash text not null,
  active boolean not null default true,
  last_login_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint customer_users_email_normalized check (email = lower(trim(email))),
  constraint customer_users_password_hash_valid check (length(password_hash) >= 80)
);

create index if not exists customer_users_active_idx on public.customer_users(active);
alter table public.customer_users enable row level security;
revoke all on public.customer_users from anon, authenticated;
comment on table public.customer_users is 'Internal customer portal credentials. Accessed only by the server service role.';
