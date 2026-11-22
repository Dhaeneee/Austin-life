
create table if not exists public.garmin_links (
  user_id         uuid primary key references public.profiles(id) on delete cascade,
  garmin_user_id  text not null unique,
  access_token    text,
  refresh_token   text,
  expires_at      timestamptz,
  created_at      timestamptz not null default now()
);
alter table public.garmin_links enable row level security;

create table if not exists public.garmin_pkce (
  state       text primary key,
  user_id     uuid not null references public.profiles(id) on delete cascade,
  verifier    text not null,
  created_at  timestamptz not null default now()
);
alter table public.garmin_pkce enable row level security;

create table if not exists public.garmin_data (
  user_id      uuid not null references public.profiles(id) on delete cascade,
  kind         text not null check (kind in ('daily','sleep','hrv','stress','metrics','activity')),
  ref          text not null,
  day          date,
  data         jsonb not null check (pg_column_size(data) < 400000),
  received_at  timestamptz not null default now(),
  primary key (user_id, kind, ref)
);
create index if not exists garmin_data_day on public.garmin_data(user_id, day);
alter table public.garmin_data enable row level security;
create policy gd_select on public.garmin_data for select to authenticated
  using (user_id = auth.uid() or public.is_coach_of(user_id));
create policy gd_delete on public.garmin_data for delete to authenticated
  using (user_id = auth.uid());

-- garmin_status() wordt in 0004 aangemaakt


revoke all on public.garmin_links, public.garmin_pkce, public.garmin_data from anon, authenticated;
grant select, delete on public.garmin_data to authenticated;
