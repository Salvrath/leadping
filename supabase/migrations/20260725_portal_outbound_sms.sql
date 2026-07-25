alter table public.sms_messages
  add column if not exists client_request_id uuid,
  add column if not exists sms_parts integer,
  add column if not exists sms_cost integer,
  add column if not exists sent_at timestamptz,
  add column if not exists delivered_at timestamptz,
  add column if not exists failed_at timestamptz,
  add column if not exists failure_reason text;

create unique index if not exists sms_messages_client_request_id_idx
  on public.sms_messages(client_request_id)
  where client_request_id is not null;

create index if not exists sms_messages_delivery_status_idx
  on public.sms_messages(textback_number_id, delivery_status, created_at desc);

comment on column public.sms_messages.client_request_id is 'Idempotency key for portal initiated outbound messages.';
comment on column public.sms_messages.sms_cost is 'Provider cost in the smallest provider-reported unit.';
