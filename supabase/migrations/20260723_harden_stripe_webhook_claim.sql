-- Atomically claims a new or previously failed Stripe event. Only the service
-- role may execute this function; no browser-facing role receives access.
create or replace function public.claim_stripe_webhook_event(
  p_event_id text,
  p_event_type text
) returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  inserted_count integer;
  reclaimed_id text;
begin
  insert into public.stripe_webhook_events (stripe_event_id, event_type)
  values (p_event_id, p_event_type)
  on conflict (stripe_event_id) do nothing;

  get diagnostics inserted_count = row_count;
  if inserted_count = 1 then
    return true;
  end if;

  update public.stripe_webhook_events
  set processing_error = null
  where stripe_event_id = p_event_id
    and processed_at is null
    and processing_error is not null
  returning stripe_event_id into reclaimed_id;

  return reclaimed_id is not null;
end;
$$;

revoke all on function public.claim_stripe_webhook_event(text, text) from public;
revoke all on function public.claim_stripe_webhook_event(text, text) from anon;
revoke all on function public.claim_stripe_webhook_event(text, text) from authenticated;
grant execute on function public.claim_stripe_webhook_event(text, text) to service_role;
