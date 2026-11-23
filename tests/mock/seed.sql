-- Testgegevens voor de lokale app-test (NOOIT in het echte project). Alles relatief aan vandaag.
insert into auth.users(id, email, raw_user_meta_data) values ('11111111-1111-1111-1111-111111111111', 'eigenaar@test', '{"naam":"Test Eigenaar"}');
insert into app_keys(name, value) values ('legati_schema_url', 'https://voorbeeld.test/schema');
insert into legati_sync(id, last_ok) values (1, now() - interval '10 minutes');
insert into plans(athlete_id, cplan, cnote) values ('11111111-1111-1111-1111-111111111111', jsonb_build_object(
  to_char(current_date, 'YYYY-MM-DD'), '{"k":"run","s":"Duurloop","t":"45 min Z2","bron":"legati"}'::jsonb,
  to_char(current_date + 1, 'YYYY-MM-DD'), '{"k":"bike","s":"Fietsen intervallen","bron":"legati"}'::jsonb,
  to_char(current_date - 1, 'YYYY-MM-DD'), '{"k":"swim","s":"Zwemmen techniek","bron":"legati"}'::jsonb), '{}');
insert into garmin_data(user_id, kind, ref, day, data) values
 ('11111111-1111-1111-1111-111111111111', 'activity', 'a-loop', current_date, '{"summary":{"activityType":"RUNNING","activityName":"Ochtendloop","durationInSeconds":2700,"distanceInMeters":8200,"averageSpeedInMetersPerSecond":3.04,"averageHeartRateInBeatsPerMinute":142}}'),
 ('11111111-1111-1111-1111-111111111111', 'activity', 'a-padel', current_date - 1, '{"summary":{"activityType":"PADEL","activityName":"Padel","durationInSeconds":5400,"averageHeartRateInBeatsPerMinute":131}}'),
 ('11111111-1111-1111-1111-111111111111', 'sleep', 's1', current_date, '{"durationInSeconds":27000,"overallSleepScore":{"value":81}}'),
 ('11111111-1111-1111-1111-111111111111', 'hrv', 'h1', current_date, '{"lastNightAvg":58}'),
 ('11111111-1111-1111-1111-111111111111', 'daily', 'd1', current_date, '{"restingHeartRateInBeatsPerMinute":48}');
insert into saxo_link(user_id, env, refresh_enc, refresh_until, last_ok, boekingen_ok, boekingen_van) values ('11111111-1111-1111-1111-111111111111', 'live', 'x', now() + interval '1 hour', now() - interval '5 minutes', now() - interval '1 hour', '2010-01-01');
insert into saxo_stand(user_id, env, data, opgehaald) values ('11111111-1111-1111-1111-111111111111', 'live', '{"munt":"EUR","totaal":11250,"cash":250,"posities_waarde":11000,"posities":[{"naam":"Testfonds (testgegeven)","aantal":100,"koers":110,"munt":"EUR","waarde":11000,"winst":900}]}', now() - interval '5 minutes');
insert into saxo_historie(user_id, env, dag, totaal, cash, munt) select '11111111-1111-1111-1111-111111111111', 'live', current_date - g, 11250 - g * 40, 250, 'EUR' from generate_series(0, 9) g;
insert into saxo_boekingen(user_id, env, id, datum, soort, type_saxo, bedrag, munt, data) values
 ('11111111-1111-1111-1111-111111111111', 'live', 'b1', current_date - 300, 'storting', 'Cash Transfer', 6000, 'EUR', '{}'),
 ('11111111-1111-1111-1111-111111111111', 'live', 'b2', current_date - 100, 'storting', 'Cash Transfer', 4500, 'EUR', '{}'),
 ('11111111-1111-1111-1111-111111111111', 'live', 'b3', current_date - 50, 'kosten', 'Commission', -12, 'EUR', '{}'),
 ('11111111-1111-1111-1111-111111111111', 'live', 'b4', current_date - 20, 'dividend', 'Dividend', 35, 'EUR', '{}');
