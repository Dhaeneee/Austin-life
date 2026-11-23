// AD Omniserve – agenda's uitlezen (ALLEEN LEZEN) via geheime iCal-links (Google "Geheim adres in iCal-indeling",
// iCloud "Openbare agenda"-link, Outlook "Agenda publiceren").
//   POST /agenda        (ingelogd, {van, tot})  -> afspraken uit alle actieve bronnen + status per bron
//   POST /agenda/test   (ingelogd, {url})       -> controleren of een link werkt, zonder iets te bewaren
// Veiligheid:
//   - De links staan in agenda_bron.url; de app kan ze invullen maar nooit teruglezen (kolomrechten). Enkel deze functie leest ze.
//   - Enkel https naar gekende agendadiensten (TOEGELATEN_HOSTS), max. 5 MB, 10 s.
//   - Schrijft nooit iets naar een agenda.
//   - Lukt ophalen niet, dan geeft de functie de laatst bewaarde afspraken terug met de fout erbij (nooit stil).
// Deploy zonder JWT-controle (de functie controleert zelf het account).
// deno-lint-ignore-file no-explicit-any
import { createClient } from "jsr:@supabase/supabase-js@2";
import ICAL from "npm:ical.js@2.1.0";
import { normaliseerLink, uitbreiden } from "./ics.ts";

function sbKey(): string {
  try { const j = JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") ?? "{}"); if (j && typeof j.default === "string" && j.default) return j.default; } catch { /* oud */ }
  return Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
}
const db = createClient(Deno.env.get("SUPABASE_URL") ?? "", sbKey(), { auth: { persistSession: false, autoRefreshToken: false } });
const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });
const DAG = /^\d{4}-\d{2}-\d{2}$/;

async function gebruiker(req: Request) {
  const tok = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!tok) return null;
  const { data: { user } } = await db.auth.getUser(tok);
  if (!user) return null;
  const { data: p } = await db.from("profiles").select("is_admin,status").eq("id", user.id).maybeSingle();
  return p?.is_admin && p.status === "actief" ? user : null;
}

async function haal(url: string): Promise<string> {
  const link = normaliseerLink(url);
  if (!link) throw new Error("link_niet_toegelaten");
  const ac = new AbortController(), t = setTimeout(() => ac.abort(), 10000);
  try {
    const r = await fetch(link, { headers: { Accept: "text/calendar, */*" }, redirect: "follow", signal: ac.signal });
    if (r.status === 401 || r.status === 403 || r.status === 404) throw new Error("link_ongeldig_" + r.status);
    if (!r.ok) throw new Error("bron_" + r.status);
    if (r.url && !normaliseerLink(r.url)) throw new Error("link_niet_toegelaten");
    const buf = new Uint8Array(await r.arrayBuffer());
    if (buf.length > 5 * 1024 * 1024) throw new Error("te_groot");
    const tekst = new TextDecoder().decode(buf);
    if (!/BEGIN:VCALENDAR/i.test(tekst)) throw new Error("geen_agenda");
    return tekst;
  } catch (e) {
    if ((e as Error).name === "AbortError") throw new Error("time_out");
    throw e;
  } finally { clearTimeout(t); }
}

if (typeof Deno !== "undefined" && Deno.serve) Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "methode" }, 405);
  const pad = new URL(req.url).pathname.replace(/\/+$/, "").split("/").pop();
  try {
    const user = await gebruiker(req);
    if (!user) return json({ error: "niet_ingelogd" }, 401);
    const body = await req.json().catch(() => ({}));

    if (pad === "test") {
      try {
        const tekst = await haal(String(body?.url ?? ""));
        const nu = Date.now(), r = uitbreiden(ICAL, tekst, nu - 7 * 864e5, nu + 42 * 864e5);
        return json({ ok: true, naam: r.naam, aantal: r.items.length });
      } catch (e) { return json({ ok: false, error: String((e as Error).message ?? e).slice(0, 60) }); }
    }

    // afspraken ophalen
    const van = DAG.test(body?.van) ? body.van : new Date().toISOString().slice(0, 10);
    const tot = DAG.test(body?.tot) ? body.tot : van;
    const vanMs = Date.parse(van + "T00:00:00Z") - 14 * 3600e3, totMs = Date.parse(tot + "T00:00:00Z") + 38 * 3600e3;
    if (!(totMs > vanMs) || totMs - vanMs > 70 * 864e5) return json({ error: "venster" }, 400);
    const { data: bronnen } = await db.from("agenda_bron").select("id, naam, soort, url, actief").eq("user_id", user.id).order("created_at");
    const res = await Promise.all((bronnen ?? []).filter((b: any) => b.actief).map(async (b: any) => {
      try {
        const tekst = await haal(b.url);
        const r = uitbreiden(ICAL, tekst, vanMs, totMs);
        const nu = new Date().toISOString();
        await db.from("agenda_bron").update({ last_ok: nu, last_error: null }).eq("id", b.id);
        await db.from("agenda_cache").upsert({ bron_id: b.id, user_id: user.id, items: r.items, van, tot, opgehaald: nu });
        return { bron: { id: b.id, naam: b.naam, soort: b.soort, ok: true, opgehaald: nu, uitCache: false }, items: r.items };
      } catch (e) {
        const fout = String((e as Error).message ?? e).slice(0, 60);
        console.error("agenda", b.id, fout);
        await db.from("agenda_bron").update({ last_error: fout }).eq("id", b.id);
        const { data: c } = await db.from("agenda_cache").select("items, van, tot, opgehaald").eq("bron_id", b.id).maybeSingle();
        const dekt = c && c.van <= van && c.tot >= tot;
        return { bron: { id: b.id, naam: b.naam, soort: b.soort, ok: false, fout, opgehaald: dekt ? c.opgehaald : null, uitCache: !!dekt }, items: dekt ? c.items : [] };
      }
    }));
    const items = res.flatMap((r) => r.items.map((i: any) => ({ ...i, bron_id: r.bron.id, soort: r.bron.soort })));
    return json({ van, tot, bronnen: res.map((r) => r.bron), items });
  } catch (e) {
    console.error(e);
    return json({ error: "fout" }, 500);
  }
});
