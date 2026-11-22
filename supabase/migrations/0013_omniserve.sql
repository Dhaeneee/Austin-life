-- AD Omniserve: AI-analyse per training, beleggersprofiel, status van koppelingen
-- Garmin komt voortaan via de Legati-link (geen eigen Garmin-koppeling meer).
select cron.unschedule('garmin-kwartier') where exists (select 1 from cron.job where jobname = 'garmin-kwartier');

-- 1. Eerlijke analyse per Garmin-activiteit (gemaakt door de server, enkel leesbaar voor jezelf)
create table if not exists public.analyse (
  user_id     uuid not null references public.profiles(id) on delete cascade,
  ref         text not null,
  tekst       text not null check (char_length(tekst) <= 8000),
  model       text,
  created_at  timestamptz not null default now(),
  primary key (user_id, ref)
);
alter table public.analyse enable row level security;
create policy an_select on public.analyse for select to authenticated using (user_id = auth.uid());
revoke all on public.analyse from anon, authenticated;
grant select on public.analyse to authenticated;

-- 2. Beleggersprofiel (vragenlijst). Apart van sport- en gezondheidsgegevens.
create table if not exists public.belegger (
  user_id     uuid primary key references public.profiles(id) on delete cascade,
  antwoorden  jsonb not null default '{}'::jsonb check (pg_column_size(antwoorden) < 20000),
  profiel     text check (profiel in ('voorzichtig','gematigd','evenwichtig','dynamisch','zeer dynamisch')),
  updated_at  timestamptz not null default now()
);
alter table public.belegger enable row level security;
create policy bel_all on public.belegger for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
revoke all on public.belegger from anon, authenticated;
grant select, insert, update, delete on public.belegger to authenticated;

-- 3. Status van de koppelingen, voor het eigen account
create or replace function public.koppelingen() returns jsonb
language sql stable security definer set search_path = public as $$
  select case when exists (select 1 from profiles where id = auth.uid() and is_admin) then jsonb_build_object(
    'legati_ok', (select last_ok from legati_sync where id = 1),
    'legati_fout', (select last_error from legati_sync where id = 1),
    'legati_link', exists (select 1 from app_keys where name = 'legati_schema_url'),
    'garmin_laatste', (select max(received_at) from garmin_data where user_id = auth.uid())
  ) end
$$;
revoke all on function public.koppelingen() from public, anon;
grant execute on function public.koppelingen() to authenticated;
