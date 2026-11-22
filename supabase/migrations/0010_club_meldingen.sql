create or replace function public.tg_push_club() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_table_name = 'events' then perform public.push_event(jsonb_build_object('type', 'event', 'id', new.id));
  elsif tg_table_name = 'polls' then perform public.push_event(jsonb_build_object('type', 'poll', 'id', new.id));
  elsif tg_table_name = 'chat' and not new.sys then perform public.push_event(jsonb_build_object('type', 'chat', 'id', new.id));
  end if;
  return new;
end $$;
create trigger push_event_nieuw after insert on public.events for each row execute function public.tg_push_club();
create trigger push_poll_nieuw after insert on public.polls for each row execute function public.tg_push_club();
create trigger push_chat_nieuw after insert on public.chat for each row execute function public.tg_push_club();
revoke all on function public.tg_push_club() from public, anon, authenticated;
