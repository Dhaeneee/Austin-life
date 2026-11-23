#!/usr/bin/env bash
# Bouwt de lokale testdatabase voor de app-test: alle migraties + testgegevens.
set -euo pipefail
cd "$(dirname "$0")/.."
DB=${PGDATABASE:-omni_app}
psql -q -c "drop database if exists $DB" -c "create database $DB" postgres
grep -v '^create role' ../supabase/tests/supabase_stub.sql | psql -q -v ON_ERROR_STOP=1 -d $DB
for f in ../supabase/migrations/*.sql; do sed -E '/create extension if not exists pg_(cron|net)/d' "$f" | psql -q -v ON_ERROR_STOP=1 -d $DB >/dev/null 2>&1 || { echo "MIGRATIE FAALT: $f"; exit 1; }; done
psql -q -v ON_ERROR_STOP=1 -d $DB -f mock/seed.sql >/dev/null
echo "testdatabase $DB klaar"
