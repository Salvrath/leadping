alter table public.pilot_leads
  add column if not exists textback_number_id uuid references public.textback_numbers(id) on delete set null,
  add column if not exists provisioning_status text not null default 'not_started',
  add column if not exists provisioning_error text,
  add column if not exists provisioned_at timestamptz,
  add column if not exists onboarding_email_sent_at timestamptz,
  add column if not exists stripe_setup_intent_id text,
  add column if not exists stripe_payment_method_id text,
  add column if not exists billing_started_at timestamptz;

alter table public.pilot_leads drop constraint if exists pilot_leads_provisioning_status_check;
alter table public.pilot_leads add constraint pilot_leads_provisioning_status_check
  check (provisioning_status in (
    'not_started','awaiting_payment','awaiting_payment_method','awaiting_number','account_setup',
    'onboarding','ready_for_billing','billing_starting','billing_attention','active','failed'
  ));

create unique index if not exists pilot_leads_textback_number_id_key
  on public.pilot_leads(textback_number_id)
  where textback_number_id is not null;
create unique index if not exists pilot_leads_stripe_setup_intent_id_key
  on public.pilot_leads(stripe_setup_intent_id)
  where stripe_setup_intent_id is not null;

create table if not exists public.provider_number_inventory (
  id uuid primary key default gen_random_uuid(),
  provider text not null default '46elks' check (provider in ('46elks')),
  provider_number text not null,
  status text not null default 'available' check (status in ('available','assigned','disabled')),
  configured_at timestamptz,
  assigned_textback_number_id uuid unique references public.textback_numbers(id) on delete set null,
  assigned_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(provider, provider_number),
  check (provider_number ~ '^\+[1-9][0-9]{7,14}$'),
  check (status <> 'available' or configured_at is not null),
  check ((status = 'assigned') = (assigned_textback_number_id is not null))
);

insert into public.provider_number_inventory (
  provider, provider_number, status, configured_at, assigned_textback_number_id, assigned_at
)
select provider, provider_number, 'assigned', coalesce(provider_configured_at, created_at), id, coalesce(activated_at, created_at)
from public.textback_numbers
on conflict (provider, provider_number) do update set
  status = 'assigned',
  assigned_textback_number_id = excluded.assigned_textback_number_id,
  assigned_at = coalesce(public.provider_number_inventory.assigned_at, excluded.assigned_at),
  configured_at = coalesce(public.provider_number_inventory.configured_at, excluded.configured_at),
  updated_at = now();

create table if not exists public.customer_onboarding_tokens (
  id uuid primary key default gen_random_uuid(),
  pilot_lead_id uuid not null references public.pilot_leads(id) on delete cascade,
  textback_number_id uuid not null references public.textback_numbers(id) on delete cascade,
  token_hash text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now(),
  check (expires_at > created_at)
);

create index if not exists customer_onboarding_tokens_lead_idx
  on public.customer_onboarding_tokens(pilot_lead_id, created_at desc);
create index if not exists customer_onboarding_tokens_valid_idx
  on public.customer_onboarding_tokens(token_hash, expires_at)
  where used_at is null;

alter table public.provider_number_inventory enable row level security;
alter table public.customer_onboarding_tokens enable row level security;
revoke all on public.provider_number_inventory from anon, authenticated;
revoke all on public.customer_onboarding_tokens from anon, authenticated;
grant all on public.provider_number_inventory to service_role;
grant all on public.customer_onboarding_tokens to service_role;

create or replace function public.reserve_textback_number_for_ready_lead(
  p_lead_id uuid,
  p_token_hash text,
  p_token_expires_at timestamptz
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_lead public.pilot_leads%rowtype;
  v_inventory public.provider_number_inventory%rowtype;
  v_number_id uuid;
begin
  if p_token_hash !~ '^[0-9a-f]{64}$' or p_token_expires_at <= now() then
    raise exception 'INVALID_ONBOARDING_TOKEN';
  end if;

  select * into v_lead from public.pilot_leads where id = p_lead_id for update;
  if not found then raise exception 'LEAD_NOT_FOUND'; end if;
  if v_lead.stripe_customer_id is null or v_lead.stripe_setup_intent_id is null or v_lead.payment_status <> 'payment_method_saved' then
    raise exception 'PAYMENT_METHOD_NOT_READY';
  end if;

  if v_lead.textback_number_id is not null then
    v_number_id := v_lead.textback_number_id;
  else
    select * into v_inventory
    from public.provider_number_inventory
    where status = 'available' and configured_at is not null
    order by created_at
    for update skip locked
    limit 1;

    if not found then
      update public.pilot_leads set
        provisioning_status = 'awaiting_number',
        provisioning_error = 'NO_AVAILABLE_PROVIDER_NUMBER',
        updated_at = now()
      where id = p_lead_id;
      return jsonb_build_object('status','awaiting_number');
    end if;

    insert into public.textback_numbers (
      provider, provider_number, business_name, business_phone_numbers,
      sms_template, active, provider_configured_at, activation_notes
    ) values (
      v_inventory.provider,
      v_inventory.provider_number,
      left(v_lead.company, 120),
      array[v_lead.workshop_phone],
      'Hej! Vi kunde inte svara just nu. Beskriv gärna vad du behöver hjälp med, så återkommer vi så snart vi kan. / {{businessName}}',
      false,
      v_inventory.configured_at,
      'Automatiskt reserverat efter sparad betalmetod. Lead: ' || v_lead.id::text
    ) returning id into v_number_id;

    update public.provider_number_inventory set
      status = 'assigned', assigned_textback_number_id = v_number_id,
      assigned_at = now(), updated_at = now()
    where id = v_inventory.id;

    update public.pilot_leads set
      textback_number_id = v_number_id, provisioning_status = 'account_setup',
      provisioning_error = null, provisioned_at = now(), updated_at = now()
    where id = p_lead_id;
  end if;

  delete from public.customer_onboarding_tokens where pilot_lead_id = p_lead_id and used_at is null;
  insert into public.customer_onboarding_tokens (pilot_lead_id,textback_number_id,token_hash,expires_at)
  values (p_lead_id,v_number_id,p_token_hash,p_token_expires_at);

  return jsonb_build_object(
    'status','account_setup','textback_number_id',v_number_id,
    'provider_number',(select provider_number from public.textback_numbers where id=v_number_id),
    'email',v_lead.email,'company',v_lead.company
  );
end;
$$;

create or replace function public.complete_customer_onboarding(
  p_token_hash text,
  p_password_hash text
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_token public.customer_onboarding_tokens%rowtype;
  v_lead public.pilot_leads%rowtype;
  v_existing public.customer_users%rowtype;
  v_user_id uuid;
begin
  select * into v_token from public.customer_onboarding_tokens where token_hash = p_token_hash for update;
  if not found or v_token.used_at is not null or v_token.expires_at <= now() then raise exception 'ONBOARDING_TOKEN_INVALID'; end if;
  select * into v_lead from public.pilot_leads where id = v_token.pilot_lead_id for update;
  if not found then raise exception 'LEAD_NOT_FOUND'; end if;
  if p_password_hash not like 'scrypt$%$%' or length(p_password_hash) > 400 then raise exception 'INVALID_PASSWORD_HASH'; end if;

  select * into v_existing from public.customer_users where email = lower(v_lead.email) for update;
  if found and v_existing.textback_number_id <> v_token.textback_number_id then raise exception 'CUSTOMER_EMAIL_ALREADY_EXISTS'; end if;

  insert into public.customer_users (textback_number_id,email,password_hash,active)
  values (v_token.textback_number_id,lower(v_lead.email),p_password_hash,true)
  on conflict (textback_number_id) do update set
    email=excluded.email,password_hash=excluded.password_hash,active=true,updated_at=now()
  returning id into v_user_id;

  update public.customer_onboarding_tokens set used_at=now() where id=v_token.id;
  update public.pilot_leads set provisioning_status='onboarding',provisioning_error=null,updated_at=now() where id=v_lead.id;

  return jsonb_build_object('user_id',v_user_id,'textback_number_id',v_token.textback_number_id,'email',lower(v_lead.email));
end;
$$;

revoke all on function public.reserve_textback_number_for_ready_lead(uuid,text,timestamptz) from public, anon, authenticated;
revoke all on function public.complete_customer_onboarding(text,text) from public, anon, authenticated;
grant execute on function public.reserve_textback_number_for_ready_lead(uuid,text,timestamptz) to service_role;
grant execute on function public.complete_customer_onboarding(text,text) to service_role;
