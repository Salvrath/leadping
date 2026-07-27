alter table public.textback_numbers
  add column if not exists onboarding_test_mode boolean not null default false;

update public.textback_numbers set onboarding_test_mode = false where active = true;

create or replace function public.textback_auto_activate_onboarding()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.onboarding_test_mode
    and new.provider_configured_at is not null
    and new.forwarding_verified_at is not null
    and new.caller_id_verified_at is not null
    and new.inbound_sms_verified_at is not null
    and new.outbound_sms_verified_at is not null
    and new.portal_account_verified_at is not null then
      new.active := true;
      new.activated_at := coalesce(new.activated_at, now());
      new.onboarding_test_mode := false;
  end if;
  return new;
end;
$$;

drop trigger if exists textback_auto_activate_onboarding_trigger on public.textback_numbers;
create trigger textback_auto_activate_onboarding_trigger
before insert or update on public.textback_numbers
for each row execute function public.textback_auto_activate_onboarding();

create or replace function public.sync_lead_provisioning_from_textback()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  update public.pilot_leads set
    provisioning_status = case when new.active then 'active' else 'onboarding' end,
    provisioning_error = null,
    updated_at = now()
  where textback_number_id = new.id;
  return new;
end;
$$;

drop trigger if exists sync_lead_provisioning_from_textback_trigger on public.textback_numbers;
create trigger sync_lead_provisioning_from_textback_trigger
after update of active, forwarding_verified_at, caller_id_verified_at, inbound_sms_verified_at, outbound_sms_verified_at, portal_account_verified_at
on public.textback_numbers
for each row execute function public.sync_lead_provisioning_from_textback();

-- New self-service companies are paused but may run provider dry-runs while global SMS mode remains live.
create or replace function public.reserve_textback_number_for_paid_lead(
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
  if p_token_hash !~ '^[0-9a-f]{64}$' or p_token_expires_at <= now() then raise exception 'INVALID_ONBOARDING_TOKEN'; end if;
  select * into v_lead from public.pilot_leads where id = p_lead_id for update;
  if not found then raise exception 'LEAD_NOT_FOUND'; end if;
  if v_lead.paid_at is null or coalesce(v_lead.subscription_status, '') not in ('active','trialing') then raise exception 'LEAD_NOT_PAID'; end if;

  if v_lead.textback_number_id is not null then
    v_number_id := v_lead.textback_number_id;
  else
    select * into v_inventory from public.provider_number_inventory
    where status = 'available' and configured_at is not null
    order by created_at for update skip locked limit 1;
    if not found then
      update public.pilot_leads set provisioning_status='awaiting_number', provisioning_error='NO_AVAILABLE_PROVIDER_NUMBER', updated_at=now() where id=p_lead_id;
      return jsonb_build_object('status','awaiting_number');
    end if;

    insert into public.textback_numbers (
      provider, provider_number, business_name, business_phone_numbers, sms_template,
      active, onboarding_test_mode, provider_configured_at, activation_notes
    ) values (
      v_inventory.provider, v_inventory.provider_number, left(v_lead.company,120), array[v_lead.workshop_phone],
      'Hej! Vi kunde inte svara just nu. Beskriv gärna vad du behöver hjälp med, så återkommer vi så snart vi kan. / {{businessName}}',
      false, true, v_inventory.configured_at,
      'Automatiskt reserverat efter Stripe-betalning. Lead: ' || v_lead.id::text
    ) returning id into v_number_id;

    update public.provider_number_inventory set status='assigned', assigned_textback_number_id=v_number_id, assigned_at=now(), updated_at=now() where id=v_inventory.id;
    update public.pilot_leads set textback_number_id=v_number_id, provisioning_status='account_setup', provisioning_error=null, provisioned_at=now(), updated_at=now() where id=p_lead_id;
  end if;

  insert into public.customer_onboarding_tokens (pilot_lead_id,textback_number_id,token_hash,expires_at)
  values (p_lead_id,v_number_id,p_token_hash,p_token_expires_at);

  return jsonb_build_object(
    'status','account_setup','textback_number_id',v_number_id,
    'provider_number',(select provider_number from public.textback_numbers where id=v_number_id),
    'email',v_lead.email,'company',v_lead.company
  );
end;
$$;

create or replace function public.complete_customer_onboarding(p_token_hash text,p_password_hash text)
returns jsonb
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
  select * into v_token from public.customer_onboarding_tokens where token_hash=p_token_hash for update;
  if not found or v_token.used_at is not null or v_token.expires_at <= now() then raise exception 'ONBOARDING_TOKEN_INVALID'; end if;
  select * into v_lead from public.pilot_leads where id=v_token.pilot_lead_id for update;
  if not found then raise exception 'LEAD_NOT_FOUND'; end if;
  if p_password_hash not like 'scrypt$%$%' or length(p_password_hash) > 400 then raise exception 'INVALID_PASSWORD_HASH'; end if;
  select * into v_existing from public.customer_users where email=lower(v_lead.email) for update;
  if found and v_existing.textback_number_id <> v_token.textback_number_id then raise exception 'CUSTOMER_EMAIL_ALREADY_EXISTS'; end if;

  insert into public.customer_users(textback_number_id,email,password_hash,active)
  values(v_token.textback_number_id,lower(v_lead.email),p_password_hash,true)
  on conflict(textback_number_id) do update set email=excluded.email,password_hash=excluded.password_hash,active=true,updated_at=now()
  returning id into v_user_id;

  update public.customer_onboarding_tokens set used_at=now() where pilot_lead_id=v_lead.id and used_at is null;
  update public.pilot_leads set provisioning_status='onboarding',provisioning_error=null,updated_at=now() where id=v_lead.id;
  return jsonb_build_object('user_id',v_user_id,'textback_number_id',v_token.textback_number_id,'email',lower(v_lead.email));
end;
$$;
