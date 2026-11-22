// AD Omniserve dagboek – trainingen uit Legati overnemen (eenrichting, alleen lezen)
//   POST /legati  (pg_cron elk kwartier, met x-cron-key)  -> haalt de persoonlijke schema-link van Legati op
// Regels:
//   - Een dag zonder training, of met een training die eerder uit Legati kwam, krijgt de Legati-training (bron: "legati").
//   - Een training die je zelf maakte of aanpaste (zonder bron "legati"), wordt nooit overschreven.
//   - Verdwijnt een training uit Legati, dan verdwijnt ze hier ook, maar enkel als ze nog ongewijzigd uit Legati kwam.
//   - Weeknotities idem.
//   - Garmin: je eigen Garmin-gegevens komen mee via dezelfde Legati-link (geen aparte Garmin-koppeling).
//     Nieuwe activiteit -> melding (trigger op garmin_data) en een eerlijke AI-analyse (tabel analyse).
// Deploy zonder JWT-controle.
// deno-lint-ignore-file no-explicit-any
import { createClient } from "jsr:@supabase/supabase-js@2";
import { analysePrompt, gezondheid, MODEL, SYSTEEM, vraag } from "./coach.ts";

const DAG = /^\d{4}-\d{2}-\d{2}$/;
const VELDEN = ["k", "sp", "s", "t", "min", "z", "km"];
const KINDS = ["daily", "sleep", "hrv", "stress", "metrics", "activity"];

// welke Garmin-rijen uit de feed nieuw of gewijzigd zijn
export function garminWijzigingen(feed: any, bestaand: { kind: string; ref: string; data: unknown }[]) {
  const oud = new Map(bestaand.map((r) => [r.kind + "|" + r.ref, JSON.stringify(r.data)]));
  const rows: any[] = [], nieuw: string[] = [];
  for (const g of Array.isArray(feed?.garmin) ? feed.garmin : []) {
    if (!g || !KINDS.includes(g.kind) || typeof g.ref !== "string" || !g.ref || g.ref.length > 80 || !g.data || typeof g.data !== "object") continue;
    if (g.day != null && !DAG.test(g.day)) continue;
    const k = g.kind + "|" + g.ref, d = JSON.stringify(g.data);
    if (oud.get(k) === d) continue;
    if (!oud.has(k) && g.kind === "activity") nieuw.push(g.ref);
    rows.push({ kind: g.kind, ref: g.ref, day: g.day ?? null, data: g.data });
  }
  return { rows, nieuw };
}

export function merge(cplan: Record<string, any>, cnote: Record<string, any>, feed: any, vorigeDagen: string[], vorigeWeken: string[], van: string) {
  const plan = { ...cplan }, note = { ...cnote }, dagen: string[] = [], weken: string[] = [];
  const eigen = (e: any) => e && e.bron !== "legati";
  const nieuw = new Map<string, any>();
  for (const t of feed?.trainingen ?? []) {
    if (!t || !DAG.test(t.datum)) continue;
    const e: Record<string, unknown> = { bron: "legati" };
    for (const k of VELDEN) if (t[k] !== undefined) e[k] = t[k];
    nieuw.set(t.datum, e);
  }
  for (const [d, e] of nieuw) {
    if (eigen(plan[d])) continue;
    plan[d] = e; dagen.push(d);
  }
  for (const d of vorigeDagen) if (!nieuw.has(d) && d >= van && plan[d]?.bron === "legati") delete plan[d];
  const notes = feed?.weeknotities ?? {};
  for (const [w, t] of Object.entries(notes)) {
    if (!DAG.test(w) || typeof t !== "string") continue;
    if (note[w] && !vorigeWeken.includes(w)) continue; // eigen notitie
    note[w] = t; weken.push(w);
  }
  for (const w of vorigeWeken) if (!(w in notes) && w >= van && !weken.includes(w)) delete note[w];
  // weken van vroeger dan het venster blijven bij Legati horen
  for (const d of vorigeDagen) if (d < van && plan[d]?.bron === "legati") dagen.push(d);
  for (const w of vorigeWeken) if (w < van && !weken.includes(w) && note[w]) weken.push(w);
  return { plan, note, dagen, weken };
}

function sbKey(): string {
  try { const j = JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") ?? "{}"); if (j && typeof j.default === "string" && j.default) return j.default; } catch { /* oude sleutel */ }
  return Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
}

if (typeof Deno !== "undefined" && Deno.serve) {
  const db = createClient(Deno.env.get("SUPABASE_URL") ?? "", sbKey(), { auth: { persistSession: false, autoRefreshToken: false } });
  const out = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { "Content-Type": "application/json" } });
  Deno.serve(async (req) => {
    if (req.method !== "POST") return out({ error: "methode" }, 405);
    const { data: ok } = await db.rpc("garmin_cron_ok", { k: req.headers.get("x-cron-key") ?? "" });
    if (!ok) return out({ error: "sleutel" }, 401);
    const fout = async (e: string) => { await db.from("legati_sync").upsert({ id: 1, last_error: e }); return out({ error: e }, 502); };
    try {
      const { data: key } = await db.from("app_keys").select("value").eq("name", "legati_schema_url").maybeSingle();
      if (!key?.value) return out({ ok: true, skip: "geen_link" });
      const { data: me } = await db.from("profiles").select("id").eq("is_admin", true).order("created_at").limit(1).maybeSingle();
      if (!me) return out({ ok: true, skip: "geen_account" });
      const r = await fetch(key.value, { headers: { Accept: "application/json" } });
      if (!r.ok) return await fout("legati_" + r.status);
      const feed = await r.json();
      if (feed?.bron !== "Legati Tri Dagboek" || !Array.isArray(feed?.trainingen)) return await fout("formaat");
      const { data: st } = await db.from("legati_sync").select("dagen, weken").eq("id", 1).maybeSingle();
      const { data: p } = await db.from("plans").select("cplan, cnote").eq("athlete_id", me.id).maybeSingle();
      const van = new Date(Date.now() - 60 * 864e5).toISOString().slice(0, 10);
      const m = merge(p?.cplan ?? {}, p?.cnote ?? {}, feed, st?.dagen ?? [], st?.weken ?? [], van);
      const changed = JSON.stringify(m.plan) !== JSON.stringify(p?.cplan ?? {}) || JSON.stringify(m.note) !== JSON.stringify(p?.cnote ?? {});
      if (changed) {
        const { error } = await db.from("plans").upsert({ athlete_id: me.id, cplan: m.plan, cnote: m.note, updated_at: new Date().toISOString(), updated_by: me.id });
        if (error) return await fout("opslaan");
      }
      // Garmin via Legati
      const { data: bestaand } = await db.from("garmin_data").select("kind, ref, data").eq("user_id", me.id).gte("day", van);
      const gw = garminWijzigingen(feed, bestaand ?? []);
      if (gw.rows.length) {
        const { error } = await db.from("garmin_data").upsert(gw.rows.map((r) => ({ ...r, user_id: me.id, received_at: new Date().toISOString() })));
        if (error) { console.error(error); return await fout("garmin_opslaan"); }
      }
      await db.from("legati_sync").upsert({ id: 1, dagen: m.dagen, weken: m.weken, last_ok: new Date().toISOString(), last_error: null });
      // eerlijke analyse voor recente trainingen zonder analyse (max. 2 per keer)
      let analyses = 0;
      if (Deno.env.get("ANTHROPIC_API_KEY")) {
        const sinds = new Date(Date.now() - 3 * 864e5).toISOString().slice(0, 10);
        const { data: acts } = await db.from("garmin_data").select("ref, day, data").eq("user_id", me.id).eq("kind", "activity").gte("day", van).order("day", { ascending: false });
        const { data: klaar } = await db.from("analyse").select("ref").eq("user_id", me.id);
        const gedaan = new Set((klaar ?? []).map((r: any) => r.ref));
        const todo = (acts ?? []).filter((a: any) => a.day >= sinds && !gedaan.has(a.ref)).slice(0, 2);
        if (todo.length) {
          const { data: gez } = await db.from("garmin_data").select("kind, day, data").eq("user_id", me.id).neq("kind", "activity").gte("day", new Date(Date.now() - 14 * 864e5).toISOString().slice(0, 10));
          for (const a of todo) {
            try {
              const vorige = (acts ?? []).filter((x: any) => x.ref !== a.ref && x.day <= a.day).map((x: any) => x.data);
              const h = gezondheid((gez ?? []).filter((r: any) => r.day <= a.day));
              const tekst = await vraag(SYSTEEM, [{ role: "user", content: analysePrompt(a.data, m.plan[a.day] ?? null, h, vorige) }], 1500);
              if (tekst) { await db.from("analyse").upsert({ user_id: me.id, ref: a.ref, tekst: tekst.slice(0, 8000), model: MODEL }); analyses++; }
            } catch (e) { console.error("analyse", a.ref, String(e)); break; }
          }
        }
      }
      return out({ ok: true, changed, trainingen: m.dagen.length, garmin: gw.rows.length, nieuw: gw.nieuw.length, analyses });
    } catch (e) { console.error(e); return await fout("fout"); }
  });
}
