-- AD Omniserve: Saxo Bank (alleen lezen)
-- Tokens worden versleuteld (AES-GCM) bewaard; de sleutel staat in de Vault (saxo_enc_key) en is enkel voor de server.
-- De App Key staat in app_keys ('saxo_app_key_sim' / 'saxo_app_key_live'); de App Secret als Edge Function-geheim
-- (SAXO_APP_SECRET voor de testomgeving, SAXO_LIVE_APP_SECRET voor je echte rekening).
select vault.create_secret(encode(extensions.gen_random_bytes(32), 'base64'), 'saxo_enc_key', 'AES-sleutel voor Saxo-tokens')
where not exists (select 1 from vault.secrets where name = 'saxo_enc_key');

create or replace function public.saxo_key() returns text
language sql security definer set search_path = public as $$
  select decrypted_secret from vault.decrypted_secrets where name = 'saxo_enc_key'
$$;
revoke all on function public.saxo_key() from public, anon, authenticated;
grant execute on function public.saxo_key() to service_role;

-- koppeling (enkel voor de server)
create table if not exists public.saxo_link (
  user_id         uuid primary key references public.profiles(id) on delete cascade,
  env             text not null default 'sim' check (env in ('sim','live')),
  state           text,
  state_at        timestamptz,
  refresh_enc     text,
  refresh_until   timestamptz,
  last_ok         timestamptz,
  last_error      text,
  created_at      timestamptz not null default now()
);
alter table public.saxo_link enable row level security;
revoke all on public.saxo_link from anon, authenticated;

-- laatste stand van je rekening (cash, waarde, posities), enkel leesbaar voor jezelf
create table if not exists public.saxo_stand (
  user_id     uuid primary key references public.profiles(id) on delete cascade,
  env         text not null check (env in ('sim','live')),
  data        jsonb not null check (pg_column_size(data) < 300000),
  opgehaald   timestamptz not null default now()
);
alter table public.saxo_stand enable row level security;
create policy ss_select on public.saxo_stand for select to authenticated using (user_id = auth.uid());
revoke all on public.saxo_stand from anon, authenticated;
grant select on public.saxo_stand to authenticated;

create or replace function public.saxo_status() returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'app_sim', exists (select 1 from app_keys where name = 'saxo_app_key_sim'),
    'app_live', exists (select 1 from app_keys where name = 'saxo_app_key_live'),
    'gekoppeld', l.refresh_enc is not null and l.refresh_until > now(),
    'env', l.env, 'last_ok', l.last_ok, 'last_error', l.last_error, 'tot', l.refresh_until)
  from (select 1) x left join saxo_link l on l.user_id = auth.uid()
  where exists (select 1 from profiles where id = auth.uid() and is_admin)
$$;
revoke all on function public.saxo_status() from public, anon;
grant execute on function public.saxo_status() to authenticated;

-- elk kwartier vernieuwen (het vernieuwingstoken van Saxo is maar kort geldig)
select cron.schedule('saxo-kwartier', '3,18,33,48 * * * *', $job$
  select net.http_post(
    url := 'https://lqxcqibqkacctmdqghru.supabase.co/functions/v1/saxo/cron',
    headers := jsonb_build_object('Content-Type', 'application/json',
      'x-cron-key', (select decrypted_secret from vault.decrypted_secrets where name = 'garmin_cron_key')),
    body := '{}'::jsonb, timeout_milliseconds := 30000);
$job$);
