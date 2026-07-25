create unique index if not exists textback_numbers_provider_number_unique_idx
  on public.textback_numbers (provider, provider_number);

alter table public.textback_numbers
  drop constraint if exists textback_numbers_business_name_length,
  add constraint textback_numbers_business_name_length check (char_length(business_name) between 2 and 120),
  drop constraint if exists textback_numbers_sms_template_length,
  add constraint textback_numbers_sms_template_length check (char_length(sms_template) between 10 and 1000),
  drop constraint if exists textback_numbers_business_phone_numbers_present,
  add constraint textback_numbers_business_phone_numbers_present check (cardinality(business_phone_numbers) > 0);
