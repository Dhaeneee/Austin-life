# AD Omniserve

Persoonlijke app van Austin (één gebruiker): sport, beleggen en agenda. Statische website (GitHub Pages) met een eigen Supabase-project ("AD Omniserve").

## Wat staat waar

| Bestand | Wat |
|---|---|
| `index.html` | De app: Home (met AI-assistent), Sport, Beleggen, Agenda, Instellingen. Donker standaard, licht of "zoals iPhone" in Instellingen. |
| `config.js` | Projectlink en publishable key van Supabase (openbaar, geen geheimen) |
| `sw.js` | Service worker, enkel voor pushmeldingen |
| `supabase/migrations/` | Tabellen en privacyregels. `0012`: één account, Legati-overname. `0013`: analyse, beleggersprofiel, status van koppelingen. |
| `supabase/functions/legati` | Elk kwartier: trainingen én Garmin-gegevens overnemen via de persoonlijke schema-link van de Legati-app (eenrichting). Schrijft na een nieuwe training een eerlijke AI-analyse. |
| `supabase/functions/ai` | AI-assistent (`kind: "chat"`) en een analyse opnieuw maken (`kind: "analyse"`). |
| `supabase/functions/push` | Pushmelding bij een nieuwe training. |

## Regels

- Alles alleen lezen. De app plaatst nooit beleggingsorders en vraagt nooit je Saxo-wachtwoord.
- Garmin komt via je profiel in de Legati-app, niet via een eigen Garmin-koppeling.
- Geen verzonnen koersen of marktgegevens: zolang Saxo niet gekoppeld is, staat er niets.
- Sport/gezondheid en beleggen staan in aparte tabellen; de AI krijgt enkel sportgegevens.
- Enkel het allereerste account kan bestaan.

## Online zetten

1. **AI:** zet het geheim `ANTHROPIC_API_KEY` bij Edge Functions, Secrets (optioneel `AI_MODEL`, standaard `claude-opus-5-5`).
2. **GitHub Pages:** Settings, Pages: Deploy from a branch, `main`, map `/ (root)`.
3. **Account:** maak in de app het (enige) account aan.
4. **Legati-link:** staat in `app_keys` (`legati_schema_url`), nooit in de code.
