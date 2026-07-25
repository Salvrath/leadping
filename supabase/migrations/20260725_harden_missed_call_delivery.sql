alter table public.missed_call_events
  add column if not exists sms_attempts integer not null default 0 check (sms_attempts between 0 and 20),
  add column if not exists last_attempt_at timestamptz,
  add column if not exists next_attempt_at timestamptz,
  add column if not exists provider_status text,
  add column if not exists sms_parts integer,
  add column if not exists sms_cost integer;

alter table public.missed_call_events
  drop constraint if exists missed_call_events_status_check;

alter table public.missed_call_events
  add constraint missed_call_events_status_check check (
    status in (
      'ignored','deduplicated','sms_queued','sms_processing','sms_logged',
      'sms_sent','sms_delivered','sms_retry_pending','sms_failed','sms_dead_letter'
    )
  );

create index if not exists missed_call_events_retry_idx
  on public.missed_call_events (next_attempt_at, created_at)
  where status = 'sms_retry_pending';

comment on column public.missed_call_events.sms_attempts is 'Number of provider delivery attempts made by Textback.';
comment on column public.missed_call_events.next_attempt_at is 'Earliest time a failed SMS may be retried.';
comment on column public.missed_call_events.sms_cost is 'Provider cost in 1/10000 of account currency when supplied.';