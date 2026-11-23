-- AD Omniserve cockpit: taken, notities, werk (klanten/opdrachten/offertes/facturen), sport (eigen invoer,
-- gevoelscheck, doelen, correcties gepland/uitgevoerd), weekprioriteiten, agenda-bronnen, Saxo-historiek, instellingen.
-- Enkel NIEUWE tabellen en functies: bestaande tabellen en gegevens worden niet gewijzigd.
-- Terugdraaien: supabase/rollback/0015_cockpit_down.sql
-- Regel overal: elke rij hoort bij één gebruiker (user_id = auth.uid()); enkel het eigen account ziet of wijzigt ze.

-- ---------- hulp ----------
create or replace function public.tg_bijgewerkt() returns trigger
language plpgsql set search_path = public as $$
begin new.updated_at := now(); return new; end $$;
revoke all on function public.tg_bijgewerkt() from public, anon, authenticated;

-- ---------- instellingen (inleg, agendabuffer, bedragen verbergen ...) ----------
create table if not exists public.instellingen (
  user_id     uuid primary key default auth.uid() references public.profiles(id) on delete cascade,
  data        jsonb not null default '{}'::jsonb check (jsonb_typeof(data) = 'object' and pg_column_size(data) < 20000),
  updated_at  timestamptz not null default now()
);

-- ---------- werk: klanten, opdrachten, offertes, facturen ----------
create table if not exists public.klanten (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  naam        text not null check (char_length(btrim(naam)) between 1 and 120),
  contact     text not null default '' check (char_length(contact) <= 120),
  email       text not null default '' check (char_length(email) <= 200),
  telefoon    text not null default '' check (char_length(telefoon) <= 40),
  notitie     text not null default '' check (char_length(notitie) <= 4000),
  actief      boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists klanten_user on public.klanten(user_id, naam);

create table if not exists public.opdrachten (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  klant_id            uuid references public.klanten(id) on delete set null,
  titel               text not null check (char_length(btrim(titel)) between 1 and 160),
  omschrijving        text not null default '' check (char_length(omschrijving) <= 4000),
  status              text not null default 'lopend' check (status in ('aanvraag','lopend','wacht','afgerond','geannuleerd')),
  deadline            date,
  volgende_actie      text not null default '' check (char_length(volgende_actie) <= 300),
  volgende_actie_op   date,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);
create index if not exists opdrachten_user on public.opdrachten(user_id, status);

create table if not exists public.offertes (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  klant_id     uuid references public.klanten(id) on delete set null,
  opdracht_id  uuid references public.opdrachten(id) on delete set null,
  referentie   text not null check (char_length(btrim(referentie)) between 1 and 60),
  bedrag       numeric(12,2) check (bedrag is null or bedrag >= 0),
  verzonden    date,
  status       text not null default 'verzonden' check (status in ('concept','verzonden','aanvaard','geweigerd','verlopen')),
  opvolgen     date,
  notitie      text not null default '' check (char_length(notitie) <= 2000),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index if not exists offertes_user on public.offertes(user_id, status);

create table if not exists public.facturen (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  klant_id     uuid references public.klanten(id) on delete set null,
  opdracht_id  uuid references public.opdrachten(id) on delete set null,
  referentie   text not null check (char_length(btrim(referentie)) between 1 and 60),
  bedrag       numeric(12,2) check (bedrag is null or bedrag >= 0),
  factuurdatum date,
  vervaldatum  date,
  betaald_op   date,
  notitie      text not null default '' check (char_length(notitie) <= 2000),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index if not exists facturen_user on public.facturen(user_id, vervaldatum);

-- ---------- taken en notities ----------
create table if not exists public.taken (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  titel          text not null check (char_length(btrim(titel)) between 1 and 200),
  notitie        text not null default '' check (char_length(notitie) <= 4000),
  categorie      text not null default 'prive' check (categorie in ('prive','werk','sport')),
  deadline       date,
  prioriteit     smallint not null default 2 check (prioriteit between 1 and 3),   -- 1 hoog, 2 normaal, 3 laag
  status         text not null default 'open' check (status in ('open','bezig','klaar')),
  klant_id       uuid references public.klanten(id) on delete set null,
  opdracht_id    uuid references public.opdrachten(id) on delete set null,
  herhaling      text not null default 'geen' check (herhaling in ('geen','dagelijks','wekelijks','maandelijks','jaarlijks')),
  dagprioriteit  date,                                     -- gekozen als een van de (max.) drie prioriteiten van die dag
  foto           text check (foto is null or char_length(foto) <= 300),   -- pad in de privé-opslag 'foto'
  klaar_op       timestamptz,
  vorige_id      uuid,                                     -- bij herhaling: de taak waaruit deze volgde
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index if not exists taken_user on public.taken(user_id, status, deadline);
create index if not exists taken_dagprio on public.taken(user_id, dagprioriteit) where dagprioriteit is not null;

create table if not exists public.notities (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  tekst       text not null default '' check (char_length(tekst) <= 8000),
  categorie   text not null default 'prive' check (categorie in ('prive','werk','sport')),
  klant_id    uuid references public.klanten(id) on delete set null,
  foto        text check (foto is null or char_length(foto) <= 300),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  check (char_length(btrim(tekst)) > 0 or foto is not null)
);
create index if not exists notities_user on public.notities(user_id, created_at desc);

-- maximaal drie dagprioriteiten per dag
create or replace function public.tg_taak_dagprio() returns trigger
language plpgsql set search_path = public as $$
begin
  if new.dagprioriteit is not null and (tg_op = 'INSERT' or new.dagprioriteit is distinct from old.dagprioriteit) then
    if (select count(*) from public.taken t where t.user_id = new.user_id and t.dagprioriteit = new.dagprioriteit and t.id <> new.id) >= 3 then
      raise exception 'Maximaal drie prioriteiten per dag' using errcode = 'P0001';
    end if;
  end if;
  return new;
end $$;

-- klaar zetten: tijdstip bewaren; terugkerende taak -> volgende taak aanmaken (één keer)
create or replace function public.tg_taak_klaar() returns trigger
language plpgsql set search_path = public as $$
declare basis date; volgende date;
begin
  if new.status = 'klaar' and (tg_op = 'INSERT' or old.status <> 'klaar') then
    new.klaar_op := coalesce(new.klaar_op, now());
    if new.herhaling <> 'geen' and tg_op = 'UPDATE' then
      basis := coalesce(new.deadline, current_date);
      volgende := case new.herhaling
        when 'dagelijks' then basis + 1
        when 'wekelijks' then basis + 7
        when 'maandelijks' then (basis + interval '1 month')::date
        else (basis + interval '1 year')::date end;
      if not exists (select 1 from public.taken t where t.vorige_id = new.id) then
        insert into public.taken(user_id, titel, notitie, categorie, deadline, prioriteit, klant_id, opdracht_id, herhaling, vorige_id)
        values (new.user_id, new.titel, new.notitie, new.categorie, volgende, new.prioriteit, new.klant_id, new.opdracht_id, new.herhaling, new.id);
      end if;
    end if;
  elsif new.status <> 'klaar' then
    new.klaar_op := null;
  end if;
  return new;
end $$;

-- ---------- sport ----------
create table if not exists public.sport_invoer (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  dag          date not null,
  sport        text not null check (sport in ('padel','lopen','fietsen','zwemmen','kracht','wandelen','squash','andere')),
  duur_min     integer not null check (duur_min between 1 and 1440),
  intensiteit  smallint check (intensiteit between 1 and 10),        -- ervaren inspanning (RPE 1-10)
  notitie      text not null default '' check (char_length(notitie) <= 1000),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index if not exists sport_invoer_user on public.sport_invoer(user_id, dag);

create table if not exists public.gevoel (
  user_id       uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  dag           date not null,
  energie       smallint check (energie between 1 and 5),
  vermoeidheid  smallint check (vermoeidheid between 1 and 5),
  klachten      text not null default '' check (char_length(klachten) <= 500),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  primary key (user_id, dag)
);

create table if not exists public.doelen (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  titel        text not null check (char_length(btrim(titel)) between 1 and 120),
  soort        text not null default 'evenement' check (soort in ('evenement','doel')),
  sport        text not null default 'andere' check (sport in ('triatlon','padel','lopen','fietsen','zwemmen','kracht','wandelen','squash','andere')),
  streefdatum  date,
  status       text not null default 'actief' check (status in ('actief','gehaald','gestopt')),
  voortgang    smallint check (voortgang between 0 and 100),     -- eigen inschatting, optioneel
  notitie      text not null default '' check (char_length(notitie) <= 2000),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- correctie van de automatische koppeling gepland <-> uitgevoerd (per dag van het schema)
create table if not exists public.plan_match (
  user_id     uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  dag         date not null,
  act_ref     text check (act_ref is null or char_length(act_ref) <= 120),  -- garmin-ref of 'eigen:<uuid>'
  status      text not null check (status in ('match','niet_uitgevoerd')),
  updated_at  timestamptz not null default now(),
  primary key (user_id, dag),
  check ((status = 'match') = (act_ref is not null))
);

-- ---------- weekoverzicht ----------
create table if not exists public.week_prioriteiten (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  week        date not null check (extract(isodow from week) = 1),   -- maandag
  positie     smallint not null check (positie between 1 and 3),
  tekst       text not null check (char_length(btrim(tekst)) between 1 and 200),
  klaar       boolean not null default false,
  updated_at  timestamptz not null default now(),
  unique (user_id, week, positie)
);

-- ---------- agenda (alleen lezen, via geheime iCal-links) ----------
-- De link zelf is een geheim: de app kan ze invullen of vervangen, maar nooit teruglezen (kolomrechten hieronder).
create table if not exists public.agenda_bron (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  naam         text not null check (char_length(btrim(naam)) between 1 and 60),
  soort        text not null check (soort in ('werk','prive')),
  url          text not null check (url ~ '^https://' and char_length(url) <= 2000),
  actief       boolean not null default true,
  last_ok      timestamptz,
  last_error   text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create table if not exists public.agenda_cache (
  bron_id     uuid primary key references public.agenda_bron(id) on delete cascade,
  user_id     uuid not null references public.profiles(id) on delete cascade,
  items       jsonb not null default '[]'::jsonb check (pg_column_size(items) < 2000000),
  van         date,
  tot         date,
  opgehaald   timestamptz not null default now()
);

-- ---------- Saxo: dagelijkse stand en boekingen (stortingen, opnames, kosten, dividenden) ----------
create table if not exists public.saxo_historie (
  user_id   uuid not null references public.profiles(id) on delete cascade,
  env       text not null check (env in ('sim','live')),
  dag       date not null,
  totaal    numeric,
  cash      numeric,
  munt      text,
  primary key (user_id, env, dag)
);
create table if not exists public.saxo_boekingen (
  user_id       uuid not null references public.profiles(id) on delete cascade,
  env           text not null check (env in ('sim','live')),
  id            text not null,                  -- BkAmountId van Saxo
  datum         date,
  soort         text not null check (soort in ('storting','opname','dividend','kosten','rente','belasting','transactie','overig')),
  type_saxo     text,                           -- BkAmountType zoals Saxo het noemt
  bedrag        numeric,                        -- in rekeningmunt
  munt          text,
  instrument    text,
  data          jsonb not null check (pg_column_size(data) < 20000),
  primary key (user_id, env, id)
);
create index if not exists saxo_boekingen_datum on public.saxo_boekingen(user_id, env, datum);
alter table public.saxo_link add column if not exists boekingen_ok timestamptz;
alter table public.saxo_link add column if not exists boekingen_fout text;
alter table public.saxo_link add column if not exists boekingen_van date;

-- ---------- triggers ----------
do $$ declare t text; begin
  foreach t in array array['instellingen','klanten','opdrachten','offertes','facturen','taken','notities','sport_invoer','gevoel','doelen','plan_match','week_prioriteiten','agenda_bron'] loop
    execute format('create trigger bijgewerkt before update on public.%I for each row execute function public.tg_bijgewerkt()', t);
  end loop;
end $$;
create trigger taak_dagprio before insert or update on public.taken for each row execute function public.tg_taak_dagprio();
create trigger taak_klaar before insert or update on public.taken for each row execute function public.tg_taak_klaar();
revoke all on function public.tg_taak_dagprio(), public.tg_taak_klaar() from public, anon, authenticated;

-- ---------- rechten: enkel je eigen rijen ----------
do $$ declare t text; begin
  foreach t in array array['instellingen','klanten','opdrachten','offertes','facturen','taken','notities','sport_invoer','gevoel','doelen','plan_match','week_prioriteiten'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy eigen on public.%I for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid())', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
  end loop;
end $$;

-- agenda_bron: alles behalve de link mag gelezen worden
alter table public.agenda_bron enable row level security;
create policy eigen on public.agenda_bron for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
revoke all on public.agenda_bron from anon, authenticated;
grant select (id, user_id, naam, soort, actief, last_ok, last_error, created_at, updated_at) on public.agenda_bron to authenticated;
grant insert (naam, soort, url, actief) on public.agenda_bron to authenticated;
grant update (naam, soort, url, actief) on public.agenda_bron to authenticated;
grant delete on public.agenda_bron to authenticated;

-- enkel door de server geschreven, door jezelf leesbaar
do $$ declare t text; begin
  foreach t in array array['agenda_cache','saxo_historie','saxo_boekingen'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy eigen_lezen on public.%I for select to authenticated using (user_id = auth.uid())', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
    execute format('grant select on public.%I to authenticated', t);
  end loop;
end $$;

-- ---------- privé-opslag voor foto's bij snel vastleggen ----------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('foto', 'foto', false, 5242880, array['image/jpeg','image/png','image/webp'])
on conflict (id) do nothing;
create policy foto_eigen_lezen on storage.objects for select to authenticated
  using (bucket_id = 'foto' and (storage.foldername(name))[1] = auth.uid()::text);
create policy foto_eigen_schrijven on storage.objects for insert to authenticated
  with check (bucket_id = 'foto' and (storage.foldername(name))[1] = auth.uid()::text
              and exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin));
create policy foto_eigen_wissen on storage.objects for delete to authenticated
  using (bucket_id = 'foto' and (storage.foldername(name))[1] = auth.uid()::text);

-- ---------- Saxo-status uitbreiden met de boekingen (zelfde functie, extra velden) ----------
create or replace function public.saxo_status() returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'app_sim', exists (select 1 from app_keys where name = 'saxo_app_key_sim'),
    'app_live', exists (select 1 from app_keys where name = 'saxo_app_key_live'),
    'gekoppeld', l.refresh_enc is not null and l.refresh_until > now(),
    'env', l.env, 'last_ok', l.last_ok, 'last_error', l.last_error, 'tot', l.refresh_until,
    'boekingen_ok', l.boekingen_ok, 'boekingen_fout', l.boekingen_fout, 'boekingen_van', l.boekingen_van)
  from (select 1) x left join saxo_link l on l.user_id = auth.uid()
  where exists (select 1 from profiles where id = auth.uid() and is_admin)
$$;
revoke all on function public.saxo_status() from public, anon;
grant execute on function public.saxo_status() to authenticated;
