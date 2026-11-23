# Austin Life

Persoonlijke cockpit van Austin (één gebruiker): vandaag, taken, agenda, AD Omniserve (klanten en opdrachten), sport en beleggen. Statische website (GitHub Pages) met een eigen Supabase-project ("AD Omniserve"). Donker standaard, licht of "zoals iPhone" in Instellingen.

## Wat staat waar

| Bestand | Wat |
|---|---|
| `index.html` | Opmaak en laadvolgorde van de scripts. Tabbalk: Home, Beleggen, Sport, Mijn zaak, Meer. |
| `js/reken.js` | Pure rekenfuncties (geen DOM): overlap in de agenda, gepland tegenover uitgevoerd, weektotalen, werk-aandacht, beleggingsresultaat. Getest in `tests/reken.test.mjs`. |
| `js/basis.js` | Gegevenslaag: elke bron laadt apart met eigen status (laden, leeg, niet gekoppeld, fout) en tijd van ophalen. Formulieren, opslaan, foutvertaling. |
| `js/kaarten.js` | Gedeelde kaarten: kop, waarschuwingen, trainingen, herstel, gevoelscheck. |
| `js/vandaag.js` | Startscherm Vandaag. |
| `js/taken.js` | Taken, notities, dagprioriteiten (max. 3) en snel toevoegen met foto. |
| `js/agenda.js` | Agenda (dag en week, overlap met buffer) en agendabronnen. |
| `js/werk.js` | AD Omniserve: aandacht, opdrachten, offertes, facturen, klanten. |
| `js/sport.js` | Sport: week per sport, gepland en uitgevoerd, doelen, padel en eigen invoer, detail per training. |
| `js/beleggen.js` | Saxo (alleen lezen), vermogensontwikkeling, beleggingsresultaat, boekingen, inlegplan, beleggersprofiel. |
| `js/week.js` | Weekoverzicht zonder AI en het Meer-scherm. |
| `js/instellingen.js` | Weergave, koppelingen, meldingen, export (JSON/CSV) en veilig terugzetten. |
| `js/start.js` | Routering, klikken, aanmelden (geen registratie). |
| `privacy.html` | Privacyverklaring van de persoonlijke app. |
| `supabase/migrations/` | Schema en privacyregels. `0015`: cockpittabellen. `0016`: oude clubtabellen afgeschermd. |
| `supabase/rollback/` | Terugdraaiscripts voor `0015` en `0016` (niet automatisch uitgevoerd). |
| `supabase/functions/legati` | Elk kwartier: schema en Garmin-gegevens via de Legati-link (eenrichting) plus AI-analyse. |
| `supabase/functions/ai` | Sportassistent. Krijgt enkel sportgegevens, eigen sportinvoer en gevoelscheck. |
| `supabase/functions/saxo` | Saxo Bank alleen lezen: saldo, posities, dagstand en boekingen. |
| `supabase/functions/agenda` | Leest Google/iCloud via geheime iCal-links, met tijdzones en zomertijd. |
| `supabase/functions/push` | Pushmelding bij een nieuwe training. |

## Regels

- Alles alleen lezen. De app plaatst nooit beleggingsorders en vraagt nooit je Saxo-wachtwoord.
- Geen verzonnen gegevens: ontbreekt een koppeling, dan staat er "Nog niet gekoppeld".
- Stortingen tellen nooit als rendement. Resultaat = huidige waarde − (stortingen − opnames). Zonder volledige boekingen wordt geen resultaat berekend.
- Werk-, agenda- en beleggingsgegevens gaan nooit naar de AI.
- Geheimen staan alleen op de server. Agendalinks kunnen na bewaren niet meer worden uitgelezen.
- Enkel het allereerste account kan bestaan.

## Tests

Vereist: Node 20+, PostgreSQL 16 lokaal, Chromium (Playwright).

```sh
cd tests && npm install
npm run reken                     # rekenfuncties
npm run ics                       # iCal: herhalingen, uitzonderingen, tijdzones, zomertijd
../supabase/tests/run_db_tests.sh # RLS, solo-account, prioriteiten, herhaling, terugzetten (PG* env-variabelen)
./mock/maak_db.sh && node app.test.mjs   # app in de browser, mobiel en desktop, tegen een lokale mock met echte RLS
```

De browsertest gebruikt testgegevens uit `tests/mock/seed.sql` in een lokale database, nooit het echte project.

## Online zetten (na beoordeling)

1. **Migraties** `0015_cockpit.sql` en `0016_afscherming.sql` uitvoeren (alleen toevoegingen, geen bestaande gegevens gewijzigd). Terugdraaien: `supabase/rollback/`.
2. **Functies** deployen: `agenda` (nieuw), `saxo`, `ai` en `legati` (bijgewerkt). Alle met "Verify JWT" uit: ze controleren zelf de gebruiker.
3. **Secrets** bij Edge Functions: `ANTHROPIC_API_KEY` (optioneel `AI_MODEL`), `SAXO_LIVE_APP_SECRET` en/of `SAXO_APP_SECRET` (sim), `SITE_URL` = `https://dhaeneee.github.io/Austin-life/`.
4. **Saxo-app** (developer.saxobank.com): redirect-URL `https://<project>.supabase.co/functions/v1/saxo/callback`, toestemming "Personal: Read". App Key in `app_keys` (`saxo_app_key_live` / `saxo_app_key_sim`).
5. **Auth**: Site URL op de GitHub Pages-link; "Allow new users to sign up" uitzetten; "Leaked password protection" aanzetten.
6. **Agenda**: in de app, Meer, Agenda, Agendabronnen: Google "Geheim adres in iCal-indeling" en/of iCloud "Openbare agenda"-link plakken.
7. **GitHub Pages**: `main`, map `/ (root)`.
