-- AD Omniserve: afscherming nakijken (persoonlijke app, één account)
-- Niets wordt verwijderd: enkel rechten op ongebruikte clubtabellen worden ingetrokken.
-- Terugdraaien: supabase/rollback/0016_afscherming_down.sql

-- 1. Clubtabellen uit de Legati-kopie worden door deze app niet gebruikt: geen toegang meer vanuit de app.
--    (De tabellen en hun lege inhoud blijven bestaan; de server kan er nog bij.)
revoke all on public.cmsg, public.chat, public.events, public.rsvp, public.shares, public.kudos,
  public.polls, public.poll_votes, public.agenda_feed, public.athletes from anon, authenticated;

-- 2. Ongebruikte statusfunctie van de oude Garmin-koppeling
revoke all on function public.garmin_status() from public, anon, authenticated;

-- 3. Vaste zoekpad voor de laatste functie zonder (advies van de Supabase-linter)
alter function public.tg_event_versie() set search_path = public;

-- 4. Een profiel kan enkel zijn eigen naam wijzigen; nieuwe accounts blijven geblokkeerd door handle_new_user (0012).
--    Ter controle: deze functie geeft true als er precies één account bestaat en het het beheerdersaccount is.
create or replace function public.solo_controle() returns jsonb
language sql stable security definer set search_path = public as $$
  select case when exists (select 1 from profiles where id = auth.uid() and is_admin) then jsonb_build_object(
    'profielen', (select count(*) from profiles),
    'accounts', (select count(*) from auth.users),
    'ik_beheerder', true
  ) end
$$;
revoke all on function public.solo_controle() from public, anon;
grant execute on function public.solo_controle() to authenticated;
