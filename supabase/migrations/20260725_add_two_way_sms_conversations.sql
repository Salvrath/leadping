create table if not exists public.conversations (
  id uuid primary key default gen_random_uuid(),
  textback_number_id uuid not null references public.textback_numbers(id) on delete cascade,
  customer_number text not null,
  status text not null default 'new' check (status in ('new','open','contacted','closed','blocked')),
  latest_inbound_preview text,
  last_message_at timestamptz not null default now(),
  assigned_to uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (textback_number_id, customer_number)
);

create table if not exists public.sms_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  missed_call_event_id uuid references public.missed_call_events(id) on delete set null,
  textback_number_id uuid not null references public.textback_numbers(id) on delete cascade,
  provider text not null,
  provider_message_id text,
  direction text not null check (direction in ('inbound','outbound')),
  sender_number text not null,
  recipient_number text not null,
  body text not null,
  delivery_status text,
  provider_created_at timestamptz,
  raw_event jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create unique index if not exists sms_messages_provider_id_idx
  on public.sms_messages(provider, provider_message_id)
  where provider_message_id is not null;
create index if not exists conversations_last_message_idx
  on public.conversations(textback_number_id, last_message_at desc);
create index if not exists sms_messages_conversation_idx
  on public.sms_messages(conversation_id, created_at);

alter table public.missed_call_events
  add column if not exists conversation_id uuid references public.conversations(id) on delete set null,
  add column if not exists customer_replied_at timestamptz;

alter table public.conversations enable row level security;
alter table public.sms_messages enable row level security;

comment on table public.conversations is 'Customer conversations created from missed calls and inbound SMS replies.';
comment on table public.sms_messages is 'Immutable inbound and outbound SMS message history for Textback conversations.';
