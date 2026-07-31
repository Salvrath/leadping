create or replace function public.sales_short_code_from_tracking_token(p_tracking_token uuid)
returns text
language plpgsql
immutable
strict
set search_path = public
as $$
declare
  alphabet constant text := '23456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
  numeric_value bigint := ((('x' || substring(replace(p_tracking_token::text, '-', '') from 1 for 10))::bit(40))::bigint);
  result text := '';
  index_value integer;
begin
  for index_value in 1..7 loop
    result := substr(alphabet, ((numeric_value % 57) + 1)::integer, 1) || result;
    numeric_value := numeric_value / 57;
  end loop;
  return result;
end;
$$;

alter table public.sales_leads add column if not exists short_code text;

update public.sales_leads
set short_code = public.sales_short_code_from_tracking_token(tracking_token)
where short_code is null;

alter table public.sales_leads alter column short_code set not null;

create unique index if not exists sales_leads_short_code_unique
  on public.sales_leads(short_code);

create index if not exists sales_leads_short_code_lookup
  on public.sales_leads(short_code, id);

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'sales_leads_short_code_format'
      and conrelid = 'public.sales_leads'::regclass
  ) then
    alter table public.sales_leads
      add constraint sales_leads_short_code_format
      check (short_code ~ '^[23456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz]{7}$');
  end if;
end;
$$;

create or replace function public.assign_sales_short_code()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'INSERT' or new.short_code is null or new.tracking_token is distinct from old.tracking_token then
    new.short_code := public.sales_short_code_from_tracking_token(new.tracking_token);
  end if;
  return new;
end;
$$;

drop trigger if exists sales_leads_assign_short_code on public.sales_leads;
create trigger sales_leads_assign_short_code
before insert or update of tracking_token on public.sales_leads
for each row execute function public.assign_sales_short_code();

update public.sales_campaigns
set message_template = 'Hej! Textback skickar automatiskt SMS när ni missar samtal. Testa: ring {{demoNumber}} och lägg på. Info: {{link}} /Textback. Svara STOPP.',
    updated_at = now()
where status = 'draft'
  and coalesce(automation_type, '') <> 'follow_up';

update public.sales_campaign_recipients as recipient
set rendered_message = 'Hej! Textback skickar automatiskt SMS när ni missar samtal. Testa: ring ' ||
  case
    when number.provider_number ~ '^\+467[0-9]{8}$'
      then '0' || substr(number.provider_number, 4, 2) || '-' || substr(number.provider_number, 6, 3) || ' ' || substr(number.provider_number, 9, 2) || ' ' || substr(number.provider_number, 11, 2)
    else number.provider_number
  end ||
  ' och lägg på. Info: https://textback.se/x/' || lead.short_code || ' /Textback. Svara STOPP.',
    estimated_parts = 1,
    estimated_cost_ore = 52,
    updated_at = now()
from public.sales_campaigns as campaign
join public.sales_leads as lead on true
join public.textback_numbers as number on number.id = campaign.textback_number_id
where recipient.campaign_id = campaign.id
  and recipient.sales_lead_id = lead.id
  and campaign.status = 'draft'
  and coalesce(campaign.automation_type, '') <> 'follow_up'
  and recipient.status = 'queued';

revoke all on function public.sales_short_code_from_tracking_token(uuid) from public;
revoke all on function public.assign_sales_short_code() from public;
