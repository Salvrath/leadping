alter table public.sales_leads alter column phone_number drop not null;

alter table public.sales_leads add column if not exists contact_role text;
alter table public.sales_leads add column if not exists phone_contact_type text not null default 'unknown'
  check (phone_contact_type in ('direct_decision_maker','direct_staff','general_company','unverified_public','none','unknown'));
alter table public.sales_leads add column if not exists phone_source_url text;
alter table public.sales_leads add column if not exists decision_maker_verified boolean not null default false;

update public.sales_leads
set phone_contact_type = 'unverified_public',
    phone_source_url = coalesce(phone_source_url, source_url),
    decision_maker_verified = false,
    next_follow_up_at = null,
    follow_up_template = null,
    follow_up_suggested_at = null,
    recommended_action = case when outbound_count > 0 then 'Ingen ytterligare SMS-kontakt' else recommended_action end,
    recommendation_reason = case when outbound_count > 0 then 'Numret är ett publikt företagsnummer utan verifierad beslutsfattare.' else recommendation_reason end,
    updated_at = now()
where phone_number is not null
  and decision_maker_verified = false;

-- Keep the one verified email contact, but remove its unverified public phone number.
update public.sales_leads
set phone_number = null,
    phone_contact_type = 'none',
    phone_source_url = null,
    decision_maker_verified = false,
    status = 'approved',
    updated_at = now()
where outbound_count = 0
  and lower(email_address) = 'kontakt@brodernaflytt.se';

-- Remove the remaining untouched register leads. Sent history is never deleted.
delete from public.sales_leads
where outbound_count = 0
  and email_address is null;

create unique index if not exists sales_leads_email_unique
  on public.sales_leads(lower(email_address))
  where email_address is not null;

alter table public.sales_leads drop constraint if exists sales_leads_contact_channel_required;
alter table public.sales_leads add constraint sales_leads_contact_channel_required
  check (phone_number is not null or email_address is not null);

alter table public.sales_leads drop constraint if exists sales_leads_decision_phone_consistency;
alter table public.sales_leads add constraint sales_leads_decision_phone_consistency
  check (
    not decision_maker_verified
    or (phone_number is not null and phone_contact_type = 'direct_decision_maker' and contact_name is not null and contact_role is not null)
  );

with qualified(company_name,organization_number,industry,city,contact_name,contact_role,phone_number,email_address,email_type,source_url,fit_score,fit_reason,tags) as (
  values
    ('Seveko VVS Konsult AB','556619-4360','VVS-konsult','Johanneshov','Henrik Sandén','VD, VVS, CE','+46730447479','henrik.sanden@seveko.se','personal','https://seveko.se/kontakt/',88,'Namngiven VD med direkt mobil och arbetsmejl på företagets egen webbplats.',array['beslutsfattare','direktnummer','vvs']),
    ('Elcab Installation AB','556433-2756','El','Göteborg','Christoffer Svensson','VD','+46703987787','christoffer.svensson@elcab.se','personal','https://elcab.se/kontakt/',90,'Namngiven VD med direkt mobil och arbetsmejl på företagets egen webbplats.',array['beslutsfattare','direktnummer','el']),
    ('Forslins El AB',null,'El','Stockholm','Ola Forslin','VD','+46708964700','ola@forslinselab.com','personal','https://www.forslinselab.com/kontakt/',88,'Namngiven VD med direkt mobil och arbetsmejl på företagets egen webbplats.',array['beslutsfattare','direktnummer','el']),
    ('Frikab Elinstallationer AB',null,'El','Arvika','Björn Karlsson','VD','+46761346970','bjorn@frikabel.se','personal','https://frikabel.se/kontakt/',88,'Namngiven VD med direkt mobil och arbetsmejl på företagets egen webbplats.',array['beslutsfattare','direktnummer','el']),
    ('Rylanders El i Skärhamn AB',null,'El','Skärhamn','Jonas Fosser','VD och ägare','+46706704965','jonas@rylandersel.se','personal','https://rylandersel.se/wp/kontakt/',92,'Namngiven VD och ägare med direkt mobil och arbetsmejl på företagets egen webbplats.',array['beslutsfattare','ägare','direktnummer','el']),
    ('Karlssons Rör',null,'VVS','Nyköping','Per Karlsson','VD','+46706714880','per.karlsson@karlssonsror.se','personal','https://karlssonsror.se/kontakt/',88,'Namngiven VD med direkt mobil och arbetsmejl på företagets egen webbplats.',array['beslutsfattare','direktnummer','vvs']),
    ('Rörtjänst i Fjälkinge AB',null,'VVS','Fjälkinge','Jerker Lindström','VD','+46703279974','jerker@rortjanstifjalkinge.se','personal','https://www.fjalkingerortjanst.se/kontakt-aktut',90,'Namngiven VD med direkt mobil och arbetsmejl på företagets egen webbplats.',array['beslutsfattare','direktnummer','vvs']),
    ('TakXperten Eskilstuna AB',null,'Tak','Eskilstuna','Christer Hoffström','VD och projektledare','+46709305666','christer@takxperten.se','personal','https://www.takxperten.se/kontakt',90,'Namngiven VD med direkt mobil och arbetsmejl på företagets egen webbplats.',array['beslutsfattare','direktnummer','tak']),
    ('Binné Sverige AB',null,'Takmaterial','Malmö','Bengt Widstrand','VD','+46736257411','bengt.widstrand@binne.se','personal','https://binne.se/kontakt/',82,'Namngiven VD med direkt mobil och arbetsmejl på företagets egen webbplats.',array['beslutsfattare','direktnummer','tak']),
    ('Antonsen Rör AB',null,'VVS','Stockholm','Martin Antonsen','VD och projektledare','+46765557348','martin@antonsenror.se','personal','https://www.antonsenror.se/om',90,'Namngiven VD med direkt mobil och arbetsmejl på företagets egen webbplats.',array['beslutsfattare','direktnummer','vvs']),
    ('Allvärmeteknik KVV AB','556424-3946','VVS och värmeteknik','Valdemarsvik','Peter Carlsson','VD','+46703238884','peter.carlsson@allvarmeteknik.se','personal','https://www.allvarmeteknik.se/kontakt/',87,'Namngiven VD med direkt mobil och arbetsmejl på företagets egen webbplats.',array['beslutsfattare','direktnummer','vvs']),
    ('Fårbo VVS AB','556594-1639','VVS','Fårbo','Hans','Ägare','+46705983635','info@farbovvs.se','generic','https://farbovvs.se/kontakta-oss/',92,'Namngiven ägare med direkt mobil; generellt företagsmejl finns på samma kontaktsida.',array['beslutsfattare','ägare','direktnummer','vvs']),
    ('NF:s Elservice i Värmland AB',null,'El','Karlstad','Nicolas Forsman','VD och serviceansvarig','+46761887277','nf.elservice@hotmail.com','personal','https://www.nfselservice.se/kontakt',87,'Namngiven VD med direkt mobil och arbetsmejl på företagets egen webbplats.',array['beslutsfattare','direktnummer','el']),
    ('STB Svenska Takbeläggningar AB','556380-3096','Tak','Stockholm','Jan-Erik Olsson','VD','+46706960619','janne@stb.se','personal','https://www.stb.se/kontakt/',90,'Namngiven VD med direkt mobil och arbetsmejl på företagets egen webbplats.',array['beslutsfattare','direktnummer','tak'])
)
insert into public.sales_leads (
  company_name,organization_number,company_type,industry,city,contact_name,contact_role,
  phone_number,phone_contact_type,phone_source_url,decision_maker_verified,
  email_address,email_type,email_source_url,email_verified_at,email_status,
  source_url,source_notes,verified_at,fit_score,fit_reason,tags,status,
  verification_status,verified_by_system_at,recommended_action,recommendation_reason
)
select
  q.company_name,q.organization_number,'aktiebolag',q.industry,q.city,q.contact_name,q.contact_role,
  q.phone_number,'direct_decision_maker',q.source_url,true,
  lower(q.email_address),q.email_type,q.source_url,now(),'verified',
  q.source_url,'Verifierad 2026-07-31 från företagets egen webbplats. Kontaktens namn, roll, direktnummer och mejl framgår av källan.',now(),q.fit_score,q.fit_reason,q.tags,'approved',
  'ready',now(),'Lägg i kampanjutkast','Direktnummer till verifierad beslutsfattare och verifierad arbetsmejl finns.'
from qualified q
on conflict (phone_number) do update set
  company_name = excluded.company_name,
  organization_number = coalesce(excluded.organization_number, public.sales_leads.organization_number),
  company_type = excluded.company_type,
  industry = excluded.industry,
  city = excluded.city,
  contact_name = excluded.contact_name,
  contact_role = excluded.contact_role,
  phone_contact_type = excluded.phone_contact_type,
  phone_source_url = excluded.phone_source_url,
  decision_maker_verified = excluded.decision_maker_verified,
  email_address = excluded.email_address,
  email_type = excluded.email_type,
  email_source_url = excluded.email_source_url,
  email_verified_at = excluded.email_verified_at,
  email_status = excluded.email_status,
  source_url = excluded.source_url,
  source_notes = excluded.source_notes,
  verified_at = excluded.verified_at,
  fit_score = excluded.fit_score,
  fit_reason = excluded.fit_reason,
  tags = excluded.tags,
  status = case when public.sales_leads.outbound_count = 0 then 'approved' else public.sales_leads.status end,
  updated_at = now();

-- Email-only decision-maker contact. The listed number is fixed-line/SMS-uncertain, so it is deliberately not used for SMS.
insert into public.sales_leads (
  company_name,company_type,industry,city,contact_name,contact_role,phone_number,phone_contact_type,decision_maker_verified,
  email_address,email_type,email_source_url,email_verified_at,email_status,source_url,source_notes,verified_at,
  fit_score,fit_reason,tags,status,verification_status,verified_by_system_at,recommended_action,recommendation_reason
)
select
  'Skånska Tak Entreprenad AB','aktiebolag','Tak','Sjöbo','Mårten Persson','VD',null,'none',false,
  'marten@skanska-tak.se','personal','https://skanska-tak.se/kontakta-oss/',now(),'verified','https://skanska-tak.se/kontakta-oss/',
  'Verifierad 2026-07-31 från företagets egen webbplats. Namngiven VD och arbetsmejl finns; inget verifierat personligt mobilnummer används.',now(),
  86,'Verifierad beslutsfattarmejl; endast e-postkanalen är tillåten.',array['beslutsfattare','email-only','tak'],'approved','ready',now(),
  'Lägg i e-postutkast','Verifierad beslutsfattarmejl finns, men inget verifierat direkt mobilnummer.'
where not exists (
  select 1 from public.sales_leads where lower(email_address) = 'marten@skanska-tak.se'
);

comment on column public.sales_leads.phone_contact_type is 'How the phone number is tied to the contact. SMS campaigns require direct_decision_maker.';
comment on column public.sales_leads.decision_maker_verified is 'True only when name, role and direct number are verified from a first-party source.';