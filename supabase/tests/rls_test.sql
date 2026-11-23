-- Afschermingstest (lokaal). Elke controle die faalt, stopt het script met een duidelijke melding.
\set QUIET on
create or replace function public.t(ok boolean, wat text) returns void language plpgsql as $$
begin if ok is not true then raise exception 'FOUT: %', wat; end if; raise notice 'ok  %', wat; end $$;
grant execute on function public.t(boolean, text) to anon, authenticated;
create or replace function public.faalt(q text) returns boolean language plpgsql as $$
begin execute q; return false; exception when others then return true; end $$;
grant execute on function public.faalt(text) to anon, authenticated;

-- 1. registratie: eerste account ok, tweede geweigerd
insert into auth.users(id, email, raw_user_meta_data) values ('11111111-1111-1111-1111-111111111111', 'eigenaar@test', '{"naam":"Eigenaar"}');
select t((select is_admin and status = 'actief' from profiles where id = '11111111-1111-1111-1111-111111111111'), 'eerste account wordt beheerder');
select t(faalt($q$insert into auth.users(id, email) values ('22222222-2222-2222-2222-222222222222', 'indringer@test')$q$), 'tweede account wordt geweigerd');
select t((select count(*) from profiles) = 1, 'er bestaat precies één profiel');

-- een "indringer"-profiel forceren (buiten de regels om) om de afscherming tussen accounts te testen
set session_replication_role = replica;
insert into auth.users(id, email) values ('33333333-3333-3333-3333-333333333333', 'indringer@test');
insert into profiles(id, naam, status) values ('33333333-3333-3333-3333-333333333333', 'Indringer', 'actief');
set session_replication_role = origin;

-- 2. als eigenaar: gegevens maken
set role authenticated; set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
insert into klanten(naam, email) values ('Klant A', 'a@klant.test');
insert into opdrachten(titel, klant_id, deadline) select 'Website', id, current_date + 3 from klanten;
insert into offertes(referentie, bedrag, verzonden, opvolgen) values ('OF-1', 1200, current_date - 10, current_date - 1);
insert into facturen(referentie, bedrag, vervaldatum) values ('F-1', 500, current_date - 2);
insert into taken(titel, categorie, deadline, dagprioriteit) values ('Taak 1', 'werk', current_date, current_date), ('Taak 2', 'prive', current_date, current_date), ('Taak 3', 'sport', current_date, current_date);
select t(faalt($q$insert into taken(titel, dagprioriteit) values ('Taak 4', current_date)$q$), 'maximaal drie dagprioriteiten');
insert into taken(titel, deadline, herhaling) values ('Wekelijks', '2026-11-23', 'wekelijks');
update taken set status = 'klaar' where titel = 'Wekelijks';
select t((select count(*) from taken where titel = 'Wekelijks' and status = 'open' and deadline = '2026-11-30') = 1, 'terugkerende taak maakt de volgende aan (+7 dagen)');
update taken set status = 'open' where titel = 'Wekelijks' and status = 'klaar';
update taken set status = 'klaar' where titel = 'Wekelijks' and deadline = '2026-11-23';
select t((select count(*) from taken where titel = 'Wekelijks') = 2, 'opnieuw klaar zetten maakt geen dubbele herhaling');
select t((select klaar_op is not null from taken where titel = 'Wekelijks' and deadline = '2026-11-23'), 'klaar_op wordt ingevuld');
insert into sport_invoer(dag, sport, duur_min, intensiteit, notitie) values (current_date, 'padel', 90, 7, 'dubbel');
insert into gevoel(dag, energie, vermoeidheid, klachten) values (current_date, 4, 2, '');
insert into doelen(titel, soort, sport, streefdatum) values ('Triatlon Brugge', 'evenement', 'triatlon', '2027-06-01');
insert into plan_match(dag, status) values (current_date, 'niet_uitgevoerd');
select t(faalt($q$insert into plan_match(dag, status) values (current_date + 1, 'match')$q$), 'match zonder activiteit wordt geweigerd');
insert into week_prioriteiten(week, positie, tekst) values ('2026-11-30', 1, 'Offerte X afwerken');
select t(faalt($q$insert into week_prioriteiten(week, positie, tekst) values ('2026-12-01', 1, 'geen maandag')$q$), 'weekprioriteit enkel op een maandag');
insert into notities(tekst) values ('Snelle notitie');
insert into instellingen(data) values ('{"inleg_week":25}');
insert into agenda_bron(naam, soort, url) values ('Google', 'werk', 'https://calendar.google.com/calendar/ical/x/private-geheim/basic.ics');
select t((select count(*) from agenda_bron) = 1, 'agenda-bron bewaard');
select t(faalt('select url from agenda_bron'), 'geheime agenda-link is niet terug te lezen');
select t(faalt($q$update agenda_bron set last_ok = now()$q$), 'status van de agenda kan de app niet zelf zetten');
select t(faalt($q$insert into saxo_boekingen(user_id, env, id, soort, data) values (auth.uid(), 'sim', 'x', 'storting', '{}')$q$), 'Saxo-boekingen enkel door de server');
select t(faalt($q$insert into saxo_historie(user_id, env, dag) values (auth.uid(), 'sim', current_date)$q$), 'Saxo-historiek enkel door de server');
select t(faalt($q$insert into klanten(user_id, naam) values ('33333333-3333-3333-3333-333333333333', 'onder andere naam')$q$), 'geen rijen aanmaken voor een ander account');
select t(faalt('select * from chat'), 'clubtabel chat niet meer toegankelijk');
select t(faalt('select * from events'), 'clubtabel events niet meer toegankelijk');
select t(faalt('select * from app_keys'), 'app_keys (geheimen) niet leesbaar');
select t(faalt('select * from saxo_link'), 'saxo_link (token) niet leesbaar');
select t(faalt('select * from legati_sync'), 'legati_sync niet leesbaar');
select t((select (solo_controle()->>'profielen')::int) = 2, 'solo_controle werkt voor de beheerder (2 door de test geforceerd)');
-- herstel uit back-up: bestaande rijen worden nooit overschreven
insert into klanten(id, naam) select id, 'OVERSCHREVEN' from klanten on conflict (id) do nothing;
select t((select naam from klanten limit 1) = 'Klant A', 'herstel overschrijft geen bestaande gegevens');
-- foto-opslag: enkel in de eigen map
insert into storage.objects(bucket_id, name) values ('foto', '11111111-1111-1111-1111-111111111111/a.jpg');
select t(faalt($q$insert into storage.objects(bucket_id, name) values ('foto', '33333333-3333-3333-3333-333333333333/b.jpg')$q$), 'foto niet in de map van een ander');
reset role;

-- 3. als indringer: ziet en wijzigt niets
set role authenticated; set request.jwt.claim.sub = '33333333-3333-3333-3333-333333333333';
select t((select count(*) from klanten) + (select count(*) from opdrachten) + (select count(*) from offertes) + (select count(*) from facturen)
       + (select count(*) from taken) + (select count(*) from notities) + (select count(*) from sport_invoer) + (select count(*) from gevoel)
       + (select count(*) from doelen) + (select count(*) from plan_match) + (select count(*) from week_prioriteiten) + (select count(*) from instellingen)
       + (select count(*) from agenda_bron) + (select count(*) from saxo_boekingen) + (select count(*) from saxo_historie) + (select count(*) from storage.objects) = 0,
       'ander account ziet niets van de eigenaar');
update taken set titel = 'gehackt'; delete from klanten;
select t(solo_controle() is null, 'solo_controle geeft niets voor een niet-beheerder');
select t(faalt($q$insert into storage.objects(bucket_id, name) values ('foto', '33333333-3333-3333-3333-333333333333/c.jpg')$q$), 'enkel het beheerdersaccount kan foto''s opladen');
reset role;
select t((select count(*) from taken where titel = 'gehackt') = 0 and (select count(*) from klanten) = 1, 'wijzigen/wissen door ander account had geen effect');

-- 4. anoniem (niet ingelogd): niets
set role anon; set request.jwt.claim.sub = '';
select t(faalt('select * from taken'), 'anoniem: taken niet leesbaar');
select t(faalt('select * from klanten'), 'anoniem: klanten niet leesbaar');
select t(faalt('select * from garmin_data'), 'anoniem: Garmin niet leesbaar');
select t(faalt('select * from saxo_stand'), 'anoniem: Saxo niet leesbaar');
select t(faalt('select * from profiles'), 'anoniem: profielen niet leesbaar');
reset role;
\echo 'ALLE AFSCHERMINGSTESTS GESLAAGD'
