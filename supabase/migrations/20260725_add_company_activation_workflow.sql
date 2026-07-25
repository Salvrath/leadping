alter table public.textback_numbers
  add column if not exists provider_configured_at timestamptz,
  add column if not exists forwarding_verified_at timestamptz,
  add column if not exists caller_id_verified_at timestamptz,
  add column if not exists inbound_sms_verified_at timestamptz,
  add column if not exists outbound_sms_verified_at timestamptz,
  add column if not exists portal_account_verified_at timestamptz,
  add column if not exists activated_at timestamptz,
  add column if not exists activation_notes text;

alter table public.textback_numbers
  drop constraint if exists textback_numbers_activation_notes_length;
alter table public.textback_numbers
  add constraint textback_numbers_activation_notes_length
  check (activation_notes is null or char_length(activation_notes) <= 2000);

create index if not exists textback_numbers_activation_status_idx
  on public.textback_numbers (active, activated_at);

comment on column public.textback_numbers.provider_configured_at is '46elks number and webhook configuration verified by Textback.';
comment on column public.textback_numbers.forwarding_verified_at is 'Conditional call forwarding to the Textback number verified.';
comment on column public.textback_numbers.caller_id_verified_at is 'Original caller ID preservation verified through a real forwarded call.';
comment on column public.textback_numbers.inbound_sms_verified_at is 'Inbound customer SMS reply verified end to end.';
comment on column public.textback_numbers.outbound_sms_verified_at is 'Outbound SMS and delivery tracking verified end to end.';
comment on column public.textback_numbers.portal_account_verified_at is 'Customer portal account and tenant access verified.';
comment on column public.textback_numbers.activated_at is 'Timestamp when all activation requirements were met and the service was activated.';