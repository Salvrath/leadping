create or replace function public.refresh_sales_campaign_rollup(p_campaign_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.sales_campaigns as campaign
  set
    recipient_count = stats.recipient_count,
    sent_count = stats.sent_count,
    delivered_count = stats.delivered_count,
    reply_count = stats.reply_count,
    failed_count = stats.failed_count,
    estimated_parts = stats.estimated_parts,
    estimated_cost_ore = stats.estimated_cost_ore,
    updated_at = now()
  from (
    select
      count(*)::integer as recipient_count,
      count(*) filter (where recipient.sent_at is not null)::integer as sent_count,
      count(*) filter (where recipient.delivered_at is not null or recipient.status in ('delivered', 'replied'))::integer as delivered_count,
      count(*) filter (where recipient.replied_at is not null or recipient.status = 'replied')::integer as reply_count,
      count(*) filter (where recipient.status in ('failed', 'blocked', 'skipped'))::integer as failed_count,
      coalesce(sum(recipient.estimated_parts), 0)::integer as estimated_parts,
      coalesce(sum(recipient.estimated_cost_ore), 0)::integer as estimated_cost_ore
    from public.sales_campaign_recipients as recipient
    where recipient.campaign_id = p_campaign_id
  ) as stats
  where campaign.id = p_campaign_id;
end;
$$;

create or replace function public.sync_sales_campaign_rollup()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    perform public.refresh_sales_campaign_rollup(old.campaign_id);
    return old;
  end if;

  perform public.refresh_sales_campaign_rollup(new.campaign_id);
  if tg_op = 'UPDATE' and old.campaign_id is distinct from new.campaign_id then
    perform public.refresh_sales_campaign_rollup(old.campaign_id);
  end if;
  return new;
end;
$$;

drop trigger if exists sales_campaign_recipients_rollup on public.sales_campaign_recipients;
create trigger sales_campaign_recipients_rollup
after insert or update or delete on public.sales_campaign_recipients
for each row execute function public.sync_sales_campaign_rollup();

create or replace function public.normalize_sales_follow_up_business_day()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  local_weekday integer;
begin
  if new.next_follow_up_at is null then
    return new;
  end if;

  local_weekday := extract(isodow from (new.next_follow_up_at at time zone 'Europe/Stockholm'));
  if local_weekday = 6 then
    new.next_follow_up_at := new.next_follow_up_at + interval '2 days';
  elsif local_weekday = 7 then
    new.next_follow_up_at := new.next_follow_up_at + interval '1 day';
  end if;
  return new;
end;
$$;

drop trigger if exists sales_leads_follow_up_business_day on public.sales_leads;
create trigger sales_leads_follow_up_business_day
before insert or update of next_follow_up_at on public.sales_leads
for each row execute function public.normalize_sales_follow_up_business_day();

create or replace function public.normalize_assisted_follow_up_campaign()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.automation_type = 'follow_up' then
    new.message_template := 'Hej igen! Kan automatiskt SMS vid missade samtal vara relevant för er? Testa kundupplevelsen: {{demoNumber}}. /Textback. Svara STOPP.';
  end if;
  return new;
end;
$$;

drop trigger if exists sales_campaigns_normalize_follow_up on public.sales_campaigns;
create trigger sales_campaigns_normalize_follow_up
before insert or update of message_template, automation_type on public.sales_campaigns
for each row execute function public.normalize_assisted_follow_up_campaign();

create or replace function public.normalize_assisted_follow_up_recipient()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  campaign_type text;
  provider_number text;
  display_number text;
begin
  select campaign.automation_type, number.provider_number
  into campaign_type, provider_number
  from public.sales_campaigns as campaign
  left join public.textback_numbers as number on number.id = campaign.textback_number_id
  where campaign.id = new.campaign_id;

  if campaign_type = 'follow_up' then
    if provider_number ~ '^\+467[0-9]{8}$' then
      display_number := '0' || substr(provider_number, 4, 2) || '-' || substr(provider_number, 6, 3) || ' ' || substr(provider_number, 9, 2) || ' ' || substr(provider_number, 11, 2);
    else
      display_number := coalesce(provider_number, '076-686 77 23');
    end if;
    new.rendered_message := 'Hej igen! Kan automatiskt SMS vid missade samtal vara relevant för er? Testa kundupplevelsen: ' || display_number || '. /Textback. Svara STOPP.';
    new.estimated_parts := 1;
    new.estimated_cost_ore := 52;
  end if;
  return new;
end;
$$;

drop trigger if exists sales_campaign_recipients_normalize_follow_up on public.sales_campaign_recipients;
create trigger sales_campaign_recipients_normalize_follow_up
before insert or update of rendered_message, campaign_id on public.sales_campaign_recipients
for each row execute function public.normalize_assisted_follow_up_recipient();

update public.sales_leads
set next_follow_up_at = case
  when extract(isodow from (next_follow_up_at at time zone 'Europe/Stockholm')) = 6 then next_follow_up_at + interval '2 days'
  when extract(isodow from (next_follow_up_at at time zone 'Europe/Stockholm')) = 7 then next_follow_up_at + interval '1 day'
  else next_follow_up_at
end,
follow_up_template = case
  when outbound_count = 1 and not do_not_contact then 'Hej igen! Kan automatiskt SMS vid missade samtal vara relevant för er? Testa kundupplevelsen: {{demoNumber}}. /Textback. Svara STOPP.'
  else follow_up_template
end,
updated_at = now()
where next_follow_up_at is not null;

do $$
declare
  campaign_row record;
begin
  for campaign_row in select id from public.sales_campaigns loop
    perform public.refresh_sales_campaign_rollup(campaign_row.id);
  end loop;
end;
$$;

revoke all on function public.refresh_sales_campaign_rollup(uuid) from public;
revoke all on function public.sync_sales_campaign_rollup() from public;
revoke all on function public.normalize_sales_follow_up_business_day() from public;
revoke all on function public.normalize_assisted_follow_up_campaign() from public;
revoke all on function public.normalize_assisted_follow_up_recipient() from public;