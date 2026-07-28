alter table public.textback_numbers
  add column if not exists demo_mode boolean not null default false,
  add column if not exists notification_email text,
  add column if not exists email_notifications_enabled boolean not null default false;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'textback_numbers_notification_email_length'
  ) then
    alter table public.textback_numbers
      add constraint textback_numbers_notification_email_length
      check (notification_email is null or char_length(notification_email) <= 320);
  end if;
end $$;

create index if not exists missed_call_events_number_created_idx
  on public.missed_call_events (textback_number_id, created_at desc);

update public.textback_numbers
set
  demo_mode = true,
  sms_template = 'Hej! Du har testat Textback. Fånga missade samtal automatiskt och få fler kundärenden. Skaffa Textback: https://textback.se',
  updated_at = now()
where provider = '46elks'
  and provider_number = '+46766867723';
