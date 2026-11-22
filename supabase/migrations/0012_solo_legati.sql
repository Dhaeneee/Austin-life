-- AD Omniserve dagboek: persoonlijke app (één gebruiker) en trainingen uit Legati
-- 1. Enkel het allereerste account kan bestaan; het is beheerder en zijn eigen coach (ziet het hele schema).
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform pg_advisory_xact_lock(4242);
  if exists(select 1 from public.profiles) then
    raise exception 'Dit is een persoonlijke app: nieuwe accounts zijn niet mogelijk';
  end if;
  insert into public.profiles(id, naam, rol, coach_id, status, is_admin, coach_ok, akkoord_at)
  values (new.id, left(coalesce(new.raw_user_meta_data->>'naam', ''), 60), 'coach', new.id, 'actief', true, true,
          case when (new.raw_user_meta_data->>'akkoord') = 'true' then now() end);
  return new;
end $$;
revoke all on function public.handle_new_user() from public, anon, authenticated;

-- 2. Welke dagen en weeknotities uit Legati komen (enkel voor de server)
create table if not exists public.legati_sync (
  id          int primary key default 1 check (id = 1),
  dagen       jsonb not null default '[]'::jsonb,
  weken       jsonb not null default '[]'::jsonb,
  last_ok     timestamptz,
  last_error  text
);
alter table public.legati_sync enable row level security;
revoke all on public.legati_sync from anon, authenticated;

-- 3. De persoonlijke schema-link van Legati staat in app_keys (naam 'legati_schema_url'), niet in de code.
--    insert into public.app_keys(name, value) values ('legati_schema_url', 'https://<legati>.supabase.co/functions/v1/schema/<sleutel>');

-- 4. Elk kwartier ophalen
select cron.schedule('legati-kwartier', '7,22,37,52 * * * *', $job$
  select net.http_post(
    url := 'https://lqxcqibqkacctmdqghru.supabase.co/functions/v1/legati',
    headers := jsonb_build_object('Content-Type', 'application/json',
      'x-cron-key', (select decrypted_secret from vault.decrypted_secrets where name = 'garmin_cron_key')),
    body := '{}'::jsonb,
    timeout_milliseconds := 30000);
$job$);
