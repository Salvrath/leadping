alter table public.pilot_leads
  add column if not exists phone_numbers integer not null default 1 check (phone_numbers between 1 and 100),
  add column if not exists industry text;

comment on column public.pilot_leads.phone_numbers is
'Number of business phone numbers requested for Textback.';

comment on column public.pilot_leads.industry is
'Optional customer industry.';
