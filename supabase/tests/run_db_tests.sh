#!/usr/bin/env bash
# Lokale databasetest: bouwt een lege testdatabase op met alle migraties en controleert de afscherming.
# Gebruik: PGHOST=/tmp/pgtest PGPORT=54329 PGUSER=postgres ./run_db_tests.sh
set -euo pipefail
cd "$(dirname "$0")"
DB=omni_test
psql -q -c "drop database if exists $DB" -c "create database $DB" postgres
for r in anon authenticated service_role; do psql -q -d $DB -c "do \$\$ begin if not exists (select 1 from pg_roles where rolname='$r') then execute 'create role $r nologin'; end if; end \$\$" ; done
grep -v '^create role' supabase_stub.sql | psql -q -v ON_ERROR_STOP=1 -d $DB
psql -q -d $DB -c "alter role service_role bypassrls"
for f in ../migrations/*.sql; do
  sed -E '/create extension if not exists pg_(cron|net)/d' "$f" | psql -q -v ON_ERROR_STOP=1 -d $DB >/dev/null || { echo "MIGRATIE FAALT: $f"; exit 1; }
done
echo "migraties: ok"
psql -qtA -v ON_ERROR_STOP=1 -d $DB -f rls_test.sql 2>&1 | sed -nE "s/.*NOTICE:  //p;/GESLAAGD|ERROR|FOUT/p"
