-- Terugdraaien van 0016_afscherming.sql: de rechten zoals ze in 0001/0008/0011 stonden.
grant select, insert, update, delete on public.athletes, public.cmsg, public.chat, public.events, public.rsvp,
  public.shares, public.kudos, public.polls, public.poll_votes to authenticated;
grant select, insert, delete on public.agenda_feed to authenticated;
grant execute on function public.garmin_status() to authenticated;
alter function public.tg_event_versie() reset search_path;
drop function if exists public.solo_controle();
