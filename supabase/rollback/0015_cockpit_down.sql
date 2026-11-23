-- Terugdraaien van 0015_cockpit.sql. LET OP: dit wist de gegevens in de nieuwe tabellen.
-- Maak eerst een export in de app (Instellingen, Je gegevens, Exporteren).
drop policy if exists foto_eigen_lezen on storage.objects;
drop policy if exists foto_eigen_schrijven on storage.objects;
drop policy if exists foto_eigen_wissen on storage.objects;
-- de opslag 'foto' leeg je via het Supabase-dashboard (Storage) voor je ze verwijdert
alter table public.saxo_link drop column if exists boekingen_ok, drop column if exists boekingen_fout, drop column if exists boekingen_van;
drop table if exists public.saxo_boekingen, public.saxo_historie, public.agenda_cache, public.agenda_bron,
  public.week_prioriteiten, public.plan_match, public.doelen, public.gevoel, public.sport_invoer,
  public.notities, public.taken, public.facturen, public.offertes, public.opdrachten, public.klanten, public.instellingen;
drop function if exists public.tg_taak_klaar(), public.tg_taak_dagprio(), public.tg_bijgewerkt();
