create table if not exists public.agenda_feed (
  user_id     uuid primary key references public.profiles(id) on delete cascade,
  token       text not null unique check (token ~ '^[a-f0-9]{48}$'),
  created_at  timestamptz not null default now()
);
alter table public.agenda_feed enable row level security;
create policy af_select on public.agenda_feed for select to authenticated using (user_id = auth.uid());
create policy af_insert on public.agenda_feed for insert to authenticated with check (user_id = auth.uid() and public.is_member());
create policy af_delete on public.agenda_feed for delete to authenticated using (user_id = auth.uid());
revoke all on public.agenda_feed from anon;

alter table public.events add column if not exists updated_at timestamptz not null default now();
alter table public.events add column if not exists seq integer not null default 0;
create or replace function public.tg_event_versie() returns trigger
language plpgsql as $$
begin
  if (new.titel, new.type, new.datum, new.uur, new.plaats, new.info) is distinct from (old.titel, old.type, old.datum, old.uur, old.plaats, old.info) then
    new.updated_at := now(); new.seq := old.seq + 1;
  end if;
  return new;
end $$;
create trigger event_versie before update on public.events for each row execute function public.tg_event_versie();

create or replace function public.tg_push_event_wijzig() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'UPDATE' then
    if (new.titel, new.datum, new.uur, new.plaats) is distinct from (old.titel, old.datum, old.uur, old.plaats) then
      perform public.push_event(jsonb_build_object('type', 'evupd', 'id', new.id, 'door', auth.uid(),
        'oud', jsonb_build_object('titel', old.titel, 'datum', old.datum, 'uur', old.uur, 'plaats', old.plaats)));
    end if;
    return new;
  end if;
  perform public.push_event(jsonb_build_object('type', 'evweg', 'door', auth.uid(),
    'ev', jsonb_build_object('titel', old.titel, 'datum', old.datum, 'uur', old.uur, 'plaats', old.plaats),
    'naar', coalesce((select jsonb_agg(r.user_id) from public.rsvp r where r.event_id = old.id and r.antw = 'ja'), '[]'::jsonb)));
  return old;
end $$;
create trigger push_event_wijzig after update on public.events for each row execute function public.tg_push_event_wijzig();
create trigger push_event_weg before delete on public.events for each row execute function public.tg_push_event_wijzig();
revoke all on function public.tg_push_event_wijzig() from public, anon, authenticated;
