alter table public.textback_numbers
  add column if not exists onboarding_test_mode boolean not null default false;

update public.textback_numbers set onboarding_test_mode = false where active = true;

create or replace function public.sync_lead_provisioning_from_textback()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_status text;
begin
  if new.active then
    v_status := 'active';
  elsif new.onboarding_test_mode
    and new.provider_configured_at is not null
    and new.forwarding_verified_at is not null
    and new.caller_id_verified_at is not null
    and new.inbound_sms_verified_at is not null
    and new.outbound_sms_verified_at is not null
    and new.portal_account_verified_at is not null then
    v_status := 'ready_for_billing';
  else
    v_status := 'onboarding';
  end if;

  update public.pilot_leads set
    provisioning_status = v_status,
    provisioning_error = null,
    updated_at = now()
  where textback_number_id = new.id
    and provisioning_status not in ('billing_starting','billing_attention');
  return new;
end;
$$;

drop trigger if exists textback_auto_activate_onboarding_trigger on public.textback_numbers;
drop trigger if exists sync_lead_provisioning_from_textback_trigger on public.textback_numbers;
create trigger sync_lead_provisioning_from_textback_trigger
after update of active, forwarding_verified_at, caller_id_verified_at, inbound_sms_verified_at, outbound_sms_verified_at, portal_account_verified_at
on public.textback_numbers
for each row execute function public.sync_lead_provisioning_from_textback();

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
  if p_token_hash !~ '^[0-9a-f]{64}$' or p_token_expires_at <= now() then raise exception 'INVALID_ONBOARDING_TOKEN'; end if;
  select * into v_lead from public.pilot_leads where id=p_lead_id for update;
  if not found then raise exception 'LEAD_NOT_FOUND'; end if;
  if v_lead.stripe_customer_id is null or v_lead.stripe_setup_intent_id is null or v_lead.payment_status <> 'payment_method_saved' then
    raise exception 'PAYMENT_METHOD_NOT_READY';
  end if;

  if v_lead.textback_number_id is not null then
    v_number_id := v_lead.textback_number_id;
  else
    select * into v_inventory from public.provider_number_inventory
    where status='available' and configured_at is not null
    order by created_at for update skip locked limit 1;
    if not found then
      update public.pilot_leads set provisioning_status='awaiting_number',provisioning_error='NO_AVAILABLE_PROVIDER_NUMBER',updated_at=now() where id=p_lead_id;
      return jsonb_build_object('status','awaiting_number');
    end if;

    insert into public.textback_numbers (
      provider,provider_number,business_name,business_phone_numbers,sms_template,
      active,onboarding_test_mode,provider_configured_at,activation_notes
    ) values (
      v_inventory.provider,v_inventory.provider_number,left(v_lead.company,120),array[v_lead.workshop_phone],
      'Hej! Vi kunde inte svara just nu. Beskriv gärna vad du behöver hjälp med, så återkommer vi så snart vi kan. / {{businessName}}',
      false,true,v_inventory.configured_at,
      'Automatiskt reserverat efter sparad betalmetod. Lead: ' || v_lead.id::text
    ) returning id into v_number_id;

    update public.provider_number_inventory set
      status='assigned',assigned_textback_number_id=v_number_id,assigned_at=now(),updated_at=now()
    where id=v_inventory.id;
    update public.pilot_leads set
      textback_number_id=v_number_id,provisioning_status='account_setup',provisioning_error=null,
      provisioned_at=now(),updated_at=now()
    where id=p_lead_id;
  end if;

  delete from public.customer_onboarding_tokens where pilot_lead_id=p_lead_id and used_at is null;
  insert into public.customer_onboarding_tokens(pilot_lead_id,textback_number_id,token_hash,expires_at)
  values(p_lead_id,v_number_id,p_token_hash,p_token_expires_at);

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
  if p_password_hash not like 'scrypt$%$%' or length(p_password_hash)>400 then raise exception 'INVALID_PASSWORD_HASH'; end if;
  select * into v_existing from public.customer_users where email=lower(v_lead.email) for update;
  if found and v_existing.textback_number_id<>v_token.textback_number_id then raise exception 'CUSTOMER_EMAIL_ALREADY_EXISTS'; end if;

  insert into public.customer_users(textback_number_id,email,password_hash,active)
  values(v_token.textback_number_id,lower(v_lead.email),p_password_hash,true)
  on conflict(textback_number_id) do update set
    email=excluded.email,password_hash=excluded.password_hash,active=true,updated_at=now()
  returning id into v_user_id;

  update public.customer_onboarding_tokens set used_at=now() where pilot_lead_id=v_lead.id and used_at is null;
  update public.pilot_leads set provisioning_status='onboarding',provisioning_error=null,updated_at=now() where id=v_lead.id;
  return jsonb_build_object('user_id',v_user_id,'textback_number_id',v_token.textback_number_id,'email',lower(v_lead.email));
end;
$$;

create or replace function public.claim_self_service_billing(p_textback_number_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_lead public.pilot_leads%rowtype;
  v_number public.textback_numbers%rowtype;
begin
  select * into v_number from public.textback_numbers where id=p_textback_number_id for update;
  if not found or v_number.active or not v_number.onboarding_test_mode then return jsonb_build_object('status','not_ready'); end if;
  if v_number.provider_configured_at is null or v_number.forwarding_verified_at is null or v_number.caller_id_verified_at is null
    or v_number.inbound_sms_verified_at is null or v_number.outbound_sms_verified_at is null or v_number.portal_account_verified_at is null then
    return jsonb_build_object('status','not_ready');
  end if;

  select * into v_lead from public.pilot_leads where textback_number_id=p_textback_number_id for update;
  if not found then return jsonb_build_object('status','not_ready'); end if;
  if v_lead.stripe_subscription_id is not null then return jsonb_build_object('status','already_started','lead_id',v_lead.id); end if;
  if v_lead.provisioning_status='billing_starting' and v_lead.billing_started_at > now()-interval '15 minutes' then
    return jsonb_build_object('status','in_progress');
  end if;
  if v_lead.stripe_customer_id is null or v_lead.stripe_setup_intent_id is null or v_lead.payment_status<>'payment_method_saved' then
    return jsonb_build_object('status','not_ready');
  end if;

  update public.pilot_leads set provisioning_status='billing_starting',billing_started_at=now(),provisioning_error=null,updated_at=now() where id=v_lead.id;
  return jsonb_build_object(
    'status','claimed','lead_id',v_lead.id,'stripe_customer_id',v_lead.stripe_customer_id,
    'stripe_setup_intent_id',v_lead.stripe_setup_intent_id
  );
end;
$$;

create or replace function public.complete_self_service_billing(
  p_lead_id uuid,
  p_subscription_id text,
  p_subscription_status text,
  p_payment_method_id text
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_number_id uuid;
  v_activate boolean;
begin
  v_activate := p_subscription_status in ('active','trialing');
  update public.pilot_leads set
    stripe_subscription_id=p_subscription_id,
    stripe_payment_method_id=p_payment_method_id,
    subscription_status=p_subscription_status,
    payment_status=case when v_activate then 'subscription_started' else p_subscription_status end,
    provisioning_status=case when v_activate then 'active' else 'billing_attention' end,
    provisioning_error=case when v_activate then null else 'SUBSCRIPTION_' || upper(p_subscription_status) end,
    billing_started_at=coalesce(billing_started_at,now()),
    updated_at=now()
  where id=p_lead_id
  returning textback_number_id into v_number_id;
  if v_number_id is null then raise exception 'BILLING_LEAD_NOT_FOUND'; end if;

  if v_activate then
    update public.textback_numbers set active=true,onboarding_test_mode=false,activated_at=coalesce(activated_at,now()),updated_at=now()
    where id=v_number_id;
  end if;
  return jsonb_build_object('status',case when v_activate then 'active' else 'attention' end,'textback_number_id',v_number_id);
end;
$$;

create or replace function public.fail_self_service_billing(p_lead_id uuid,p_error text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.pilot_leads set
    provisioning_status='billing_attention',provisioning_error=left(coalesce(p_error,'UNKNOWN'),200),updated_at=now()
  where id=p_lead_id;
end;
$$;

revoke all on function public.reserve_textback_number_for_ready_lead(uuid,text,timestamptz) from public,anon,authenticated;
revoke all on function public.complete_customer_onboarding(text,text) from public,anon,authenticated;
revoke all on function public.claim_self_service_billing(uuid) from public,anon,authenticated;
revoke all on function public.complete_self_service_billing(uuid,text,text,text) from public,anon,authenticated;
revoke all on function public.fail_self_service_billing(uuid,text) from public,anon,authenticated;
grant execute on function public.reserve_textback_number_for_ready_lead(uuid,text,timestamptz) to service_role;
grant execute on function public.complete_customer_onboarding(text,text) to service_role;
grant execute on function public.claim_self_service_billing(uuid) to service_role;
grant execute on function public.complete_self_service_billing(uuid,text,text,text) to service_role;
grant execute on function public.fail_self_service_billing(uuid,text) to service_role;
