// AD Omniserve dagboek – trainingen uit Legati overnemen (eenrichting, alleen lezen)
//   POST /legati  (pg_cron elk kwartier, met x-cron-key)  -> haalt de persoonlijke schema-link van Legati op
// Regels:
//   - Een dag zonder training, of met een training die eerder uit Legati kwam, krijgt de Legati-training (bron: "legati").
//   - Een training die je zelf maakte of aanpaste (zonder bron "legati"), wordt nooit overschreven.
//   - Verdwijnt een training uit Legati, dan verdwijnt ze hier ook, maar enkel als ze nog ongewijzigd uit Legati kwam.
//   - Weeknotities idem.
// Deploy zonder JWT-controle.
// deno-lint-ignore-file no-explicit-any
import { createClient } from "jsr:@supabase/supabase-js@2";

const DAG = /^\d{4}-\d{2}-\d{2}$/;
const VELDEN = ["k", "sp", "s", "t", "min", "z", "km"];

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
      await db.from("legati_sync").upsert({ id: 1, dagen: m.dagen, weken: m.weken, last_ok: new Date().toISOString(), last_error: null });
      return out({ ok: true, changed, trainingen: m.dagen.length });
    } catch (e) { console.error(e); return await fout("fout"); }
  });
}
