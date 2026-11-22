// AD Omniserve – gedeelde AI-hulp (Anthropic Messages API) voor de eerlijke analyse en de assistent.
// Dezelfde code staat in functions/legati/coach.ts en functions/ai/coach.ts.
// deno-lint-ignore-file no-explicit-any
export const MODEL = Deno.env.get("AI_MODEL") ?? "claude-opus-5-5";

const SPORT: Record<string, string> = {
  RUNNING: "lopen", TRAIL_RUNNING: "traillopen", TREADMILL_RUNNING: "lopen (loopband)", CYCLING: "fietsen", ROAD_BIKING: "fietsen",
  INDOOR_CYCLING: "fietsen (binnen)", VIRTUAL_RIDE: "fietsen (virtueel)", MOUNTAIN_BIKING: "mountainbike", GRAVEL_CYCLING: "gravel",
  LAP_SWIMMING: "zwemmen (bad)", OPEN_WATER_SWIMMING: "zwemmen (open water)", SWIMMING: "zwemmen", STRENGTH_TRAINING: "kracht",
  HIKING: "wandelen", WALKING: "wandelen", SQUASH: "squash", MULTI_SPORT: "multisport",
};
export const sportNaam = (t: string) => SPORT[String(t ?? "").toUpperCase()] ?? String(t ?? "andere").toLowerCase().replace(/_/g, " ");

const r1 = (x: number) => Math.round(x * 10) / 10;
// beknopte, feitelijke samenvatting van één activiteit (alleen wat Garmin echt meet)
export function feiten(a: any) {
  const s = a?.summary ?? {}, out: Record<string, unknown> = { sport: sportNaam(s.activityType), naam: s.activityName };
  const sec = Number(s.durationInSeconds ?? 0), m = Number(s.distanceInMeters ?? 0), v = Number(s.averageSpeedInMetersPerSecond ?? 0);
  if (s.startTimeInSeconds) out.start = new Date((Number(s.startTimeInSeconds) + Number(s.startTimeOffsetInSeconds ?? 0)) * 1000).toISOString().slice(0, 16).replace("T", " ");
  if (sec) out.duur_min = Math.round(sec / 60);
  if (m > 100) out.afstand_km = r1(m / 1000);
  const sp = sportNaam(s.activityType);
  if (v > 0 && /lopen/.test(sp)) { const p = 1000 / v; out.tempo_per_km = `${Math.floor(p / 60)}:${String(Math.round(p % 60)).padStart(2, "0")}`; }
  if (v > 0 && /fiets|gravel|mountain/.test(sp)) out.snelheid_kmu = r1(v * 3.6);
  if (v > 0 && /zwem/.test(sp)) { const p = 100 / v; out.tempo_per_100m = `${Math.floor(p / 60)}:${String(Math.round(p % 60)).padStart(2, "0")}`; }
  if (s.averageHeartRateInBeatsPerMinute) out.hartslag_gem = s.averageHeartRateInBeatsPerMinute;
  if (s.maxHeartRateInBeatsPerMinute) out.hartslag_max = s.maxHeartRateInBeatsPerMinute;
  if (s.averagePowerInWatts) out.vermogen_gem_w = s.averagePowerInWatts;
  if (s.totalElevationGainInMeters) out.hoogtemeters = Math.round(s.totalElevationGainInMeters);
  if (s.averageRunCadenceInStepsPerMinute && /lopen/.test(sp)) out.cadans = Math.round(s.averageRunCadenceInStepsPerMinute * (s.averageRunCadenceInStepsPerMinute < 120 ? 2 : 1));
  if (s.movingDurationInSeconds && sec && s.movingDurationInSeconds < sec * 0.8) out.beweegtijd_min = Math.round(s.movingDurationInSeconds / 60);
  const laps = Array.isArray(a?.laps) ? a.laps : [];
  if (laps.length > 1) out.ronden = laps.slice(0, 30).map((l: any) => ({ min: r1(Number(l.dur ?? 0) / 60), hr: l.hr ?? null, w: l.w ?? null }));
  // hartslagverloop in vier stukken (als het er is)
  const hr = (a?.st?.hr ?? []).filter((x: any) => typeof x === "number");
  if (hr.length >= 8) { const q = Math.floor(hr.length / 4); out.hartslag_per_kwart = [0, 1, 2, 3].map((i) => Math.round(hr.slice(i * q, (i + 1) * q).reduce((x: number, y: number) => x + y, 0) / q)); }
  return out;
}

// gezondheid per dag: slaap, HRV, rustpols, Body Battery, VO2max
export function gezondheid(rows: any[]) {
  const d: Record<string, any> = {};
  for (const r of rows ?? []) {
    if (!r?.day || r.kind === "activity") continue;
    const x = (d[r.day] ??= { dag: r.day }), g = r.data ?? {};
    if (r.kind === "sleep") { if (g.durationInSeconds) x.slaap_u = r1(g.durationInSeconds / 3600); const sc = g.overallSleepScore?.value ?? g.sleepScores?.overall?.value; if (sc != null) x.slaapscore = sc; }
    if (r.kind === "hrv" && g.lastNightAvg != null) x.hrv = g.lastNightAvg;
    if (r.kind === "daily" && g.restingHeartRateInBeatsPerMinute != null) x.rustpols = g.restingHeartRateInBeatsPerMinute;
    if (r.kind === "stress") { if (g.bbMax != null) x.body_battery_max = g.bbMax; }
    if (r.kind === "metrics" && g.vo2Max != null) x.vo2max = g.vo2Max;
  }
  return Object.values(d).sort((a: any, b: any) => a.dag.localeCompare(b.dag));
}

export const SYSTEEM = `Je bent de persoonlijke sportcoach in de app "AD Omniserve" van Austin, een triatleet uit België.
Schrijf in het Nederlands (Vlaams mag), kort en concreet, in gewone zinnen. Geen opsommingstekens met emoji.
Wees eerlijk: zeg ook wat minder goed ging. Gebruik enkel de cijfers die je krijgt; verzin niets en zeg het als iets ontbreekt.
Je bent geen arts: bij pijn, ziekte of rare waarden raad je aan rust te nemen of een arts te raadplegen.`;

// één aanroep van de Messages API; geeft tekst of gooit een fout met een korte code
export async function vraag(system: string, messages: { role: "user" | "assistant"; content: string }[], maxTokens = 2000): Promise<string> {
  const key = Deno.env.get("ANTHROPIC_API_KEY") ?? "";
  if (!key) throw new Error("geen_sleutel");
  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "anthropic-beta": "server-side-fallback-2026-07-01", "content-type": "application/json" },
    body: JSON.stringify({ model: MODEL, max_tokens: maxTokens, output_config: { effort: "low" }, fallbacks: "default", system, messages }),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) { console.error("anthropic", r.status, JSON.stringify(j).slice(0, 400)); throw new Error(r.status === 429 || r.status === 529 ? "druk" : "ai_fout"); }
  if (j.stop_reason === "refusal") throw new Error("geweigerd");
  return (j.content ?? []).filter((c: any) => c.type === "text").map((c: any) => c.text).join("").trim();
}

// prompt voor de analyse van één training
export function analysePrompt(act: any, plan: any, health: any[], vorige: any[]) {
  return `Analyseer deze training eerlijk in 4 tot 7 zinnen: wat ging goed, wat kan beter, en wat betekent het voor de komende dagen.
Vergelijk met wat gepland was (als er een plan is) en met de recente trainingen. Houd rekening met slaap, HRV en rustpols van die ochtend.

Training (Garmin):
${JSON.stringify(feiten(act))}

Gepland voor die dag (uit het Legati-schema): ${plan ? JSON.stringify(plan) : "niets gepland"}

Gezondheid laatste dagen:
${JSON.stringify(health.slice(-7))}

Vorige trainingen (kort):
${JSON.stringify(vorige.slice(0, 6).map(feiten).map((f: any) => ({ sport: f.sport, start: f.start, duur_min: f.duur_min, afstand_km: f.afstand_km, hartslag_gem: f.hartslag_gem })))}`;
}
