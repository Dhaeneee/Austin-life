// AD Omniserve – Saxo Bank, ALLEEN LEZEN
//   POST /saxo/start    (ingelogd, {env})  -> adres om in te loggen bij Saxo (OAuth Authorization Code)
//   GET  /saxo/callback (Saxo)             -> code inruilen, token versleuteld bewaren, eerste stand ophalen
//   POST /saxo/nu       (ingelogd)         -> stand nu vernieuwen
//   POST /saxo/stop     (ingelogd)         -> koppeling verwijderen
//   POST /saxo/cron     (pg_cron)          -> elk kwartier token vernieuwen en stand ophalen
// Veiligheid:
//   - Je Saxo-wachtwoord komt nooit in deze app: je logt in op de pagina van Saxo zelf.
//   - Deze functie doet enkel GET-verzoeken naar een vaste lijst leesadressen (LEES). Er is geen code om orders te plaatsen.
//   - Het vernieuwingstoken staat versleuteld (AES-GCM) in de database; de sleutel staat in de Vault.
// Deploy zonder JWT-controle.
// deno-lint-ignore-file no-explicit-any
import { createClient } from "jsr:@supabase/supabase-js@2";

const SITE = Deno.env.get("SITE_URL") ?? "https://dhaeneee.github.io/Austin-life/";
const SELF = (Deno.env.get("SUPABASE_URL") ?? "") + "/functions/v1/saxo/callback";
const ENV = {
  sim: { auth: "https://sim.logonvalidation.net", api: "https://gateway.saxobank.com/sim/openapi", key: "saxo_app_key_sim", secret: "SAXO_APP_SECRET" },
  live: { auth: "https://live.logonvalidation.net", api: "https://gateway.saxobank.com/openapi", key: "saxo_app_key_live", secret: "SAXO_LIVE_APP_SECRET" },
} as const;
type Env = keyof typeof ENV;
// de enige adressen die deze app bij Saxo opvraagt (alleen lezen)
const LEES = {
  balans: "/port/v1/balances/me",
  posities: "/port/v1/netpositions/me?FieldGroups=NetPositionBase,NetPositionView,DisplayAndFormat&$top=200",
} as const;

function sbKey(): string {
  try { const j = JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") ?? "{}"); if (j && typeof j.default === "string" && j.default) return j.default; } catch { /* oud */ }
  return Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
}
const db = createClient(Deno.env.get("SUPABASE_URL") ?? "", sbKey(), { auth: { persistSession: false, autoRefreshToken: false } });
const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });
const terug = (q: string) => new Response(null, { status: 302, headers: { Location: SITE + "#beleggen?" + q } });

// ---------- versleuteling ----------
const b64 = (u: Uint8Array) => btoa(String.fromCharCode(...u));
const unb64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
let KEY: CryptoKey | null = null;
async function sleutel() {
  if (KEY) return KEY;
  const { data } = await db.rpc("saxo_key");
  if (!data) throw new Error("geen_sleutel");
  return (KEY = await crypto.subtle.importKey("raw", unb64(String(data)), "AES-GCM", false, ["encrypt", "decrypt"]));
}
export async function versleutel(t: string) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await sleutel(), new TextEncoder().encode(t)));
  return b64(iv) + "." + b64(ct);
}
async function ontsleutel(s: string) {
  const [iv, ct] = s.split(".");
  return new TextDecoder().decode(await crypto.subtle.decrypt({ name: "AES-GCM", iv: unb64(iv) }, await sleutel(), unb64(ct)));
}

// ---------- OAuth ----------
async function appKey(env: Env) {
  const { data } = await db.from("app_keys").select("value").eq("name", ENV[env].key).maybeSingle();
  return (data?.value as string | undefined) ?? "";
}
async function token(env: Env, form: Record<string, string>) {
  const id = await appKey(env), secret = Deno.env.get(ENV[env].secret) ?? "";
  if (!id || !secret) throw new Error("niet_ingesteld");
  const r = await fetch(ENV[env].auth + "/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Authorization: "Basic " + btoa(id + ":" + secret) },
    body: new URLSearchParams({ ...form, redirect_uri: SELF }),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j.access_token) { console.error("saxo token", r.status, JSON.stringify(j).slice(0, 200)); throw new Error(r.status === 400 || r.status === 401 ? "verlopen" : "saxo_" + r.status); }
  return j as { access_token: string; refresh_token: string; expires_in: number; refresh_token_expires_in: number };
}
async function bewaar(uid: string, env: Env, t: { refresh_token: string; refresh_token_expires_in: number }) {
  await db.from("saxo_link").upsert({ user_id: uid, env, refresh_enc: await versleutel(t.refresh_token), refresh_until: new Date(Date.now() + (Number(t.refresh_token_expires_in) || 2400) * 1000).toISOString(), state: null, state_at: null, last_error: null });
}

// ---------- lezen (enkel GET) ----------
async function lees(env: Env, access: string, pad: string) {
  const r = await fetch(ENV[env].api + pad, { method: "GET", headers: { Authorization: "Bearer " + access, Accept: "application/json" } });
  if (!r.ok) { console.error("saxo lees", pad.split("?")[0], r.status); throw new Error("lezen_" + r.status); }
  return await r.json();
}
const num = (x: unknown) => (typeof x === "number" && isFinite(x) ? x : null);
export function stand(bal: any, pos: any) {
  const posities = (Array.isArray(pos?.Data) ? pos.Data : []).map((p: any) => {
    const b = p.NetPositionBase ?? {}, v = p.NetPositionView ?? {}, d = p.DisplayAndFormat ?? {};
    return {
      naam: d.Description ?? d.Symbol ?? String(b.Uic ?? ""), symbool: d.Symbol ?? null, type: b.AssetType ?? null, munt: d.Currency ?? v.ExposureCurrency ?? null,
      aantal: num(b.Amount), aankoop: num(v.AverageOpenPrice), koers: num(v.CurrentPrice), koersType: v.CurrentPriceType ?? null,
      waarde: num(v.MarketValueInBaseCurrency) ?? num(v.ExposureInBaseCurrency) ?? num(v.MarketValue), winst: num(v.ProfitLossOnTradeInBaseCurrency) ?? num(v.ProfitLossOnTrade),
      kosten: num(v.TradeCostsTotalInBaseCurrency), betrouwbaar: v.CalculationReliability ?? null,
    };
  });
  return {
    munt: bal?.Currency ?? null, cash: num(bal?.CashBalance), totaal: num(bal?.TotalValue), posities_waarde: num(bal?.UnrealizedPositionsValue),
    kost_sluiten: num(bal?.CostToClosePositions), betrouwbaar: bal?.CalculationReliability ?? null, posities,
  };
}
async function vernieuw(uid: string) {
  const { data: l } = await db.from("saxo_link").select("env, refresh_enc, refresh_until").eq("user_id", uid).maybeSingle();
  if (!l?.refresh_enc) return { skip: "niet_gekoppeld" };
  const env = l.env as Env;
  try {
    if (new Date(l.refresh_until).getTime() < Date.now()) throw new Error("verlopen");
    const t = await token(env, { grant_type: "refresh_token", refresh_token: await ontsleutel(l.refresh_enc) });
    await bewaar(uid, env, t);
    const [bal, pos] = await Promise.all([lees(env, t.access_token, LEES.balans), lees(env, t.access_token, LEES.posities)]);
    await db.from("saxo_stand").upsert({ user_id: uid, env, data: stand(bal, pos), opgehaald: new Date().toISOString() });
    await db.from("saxo_link").update({ last_ok: new Date().toISOString(), last_error: null }).eq("user_id", uid);
    return { ok: true };
  } catch (e) {
    const c = String((e as Error).message ?? e);
    await db.from("saxo_link").update(c === "verlopen" ? { last_error: c, refresh_enc: null } : { last_error: c }).eq("user_id", uid);
    return { error: c };
  }
}

async function gebruiker(req: Request) {
  const tok = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!tok) return null;
  const { data: { user } } = await db.auth.getUser(tok);
  if (!user) return null;
  const { data: p } = await db.from("profiles").select("is_admin,status").eq("id", user.id).maybeSingle();
  return p?.is_admin && p.status === "actief" ? user : null;
}

if (typeof Deno !== "undefined" && Deno.serve) Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const url = new URL(req.url), pad = url.pathname.replace(/\/+$/, "").split("/").pop();
  try {
    if (pad === "callback" && req.method === "GET") {
      const code = url.searchParams.get("code") ?? "", state = url.searchParams.get("state") ?? "";
      if (!code || !/^[a-f0-9]{32}$/.test(state)) return terug("saxo=fout");
      const { data: l } = await db.from("saxo_link").select("user_id, env, state_at").eq("state", state).maybeSingle();
      if (!l || Date.now() - new Date(l.state_at).getTime() > 15 * 60e3) return terug("saxo=verlopen");
      const t = await token(l.env as Env, { grant_type: "authorization_code", code });
      await bewaar(l.user_id, l.env as Env, t);
      const r = await vernieuw(l.user_id);
      return terug("saxo=" + ("ok" in r ? "ok" : "deels"));
    }
    if (pad === "cron" && req.method === "POST") {
      const { data: ok } = await db.rpc("garmin_cron_ok", { k: req.headers.get("x-cron-key") ?? "" });
      if (!ok) return json({ error: "sleutel" }, 401);
      const { data: links } = await db.from("saxo_link").select("user_id").not("refresh_enc", "is", null);
      const res = [];
      for (const l of links ?? []) res.push(await vernieuw(l.user_id));
      return json({ ok: true, res });
    }
    const user = await gebruiker(req);
    if (!user) return json({ error: "niet_ingelogd" }, 401);
    const body = await req.json().catch(() => ({}));
    if (pad === "start") {
      const env: Env = body?.env === "live" ? "live" : "sim";
      const id = await appKey(env);
      if (!id || !Deno.env.get(ENV[env].secret)) return json({ error: "niet_ingesteld" }, 400);
      const state = Array.from(crypto.getRandomValues(new Uint8Array(16)), (b) => b.toString(16).padStart(2, "0")).join("");
      await db.from("saxo_link").upsert({ user_id: user.id, env, state, state_at: new Date().toISOString() });
      const q = new URLSearchParams({ response_type: "code", client_id: id, state, redirect_uri: SELF });
      return json({ url: ENV[env].auth + "/authorize?" + q.toString() });
    }
    if (pad === "nu") return json(await vernieuw(user.id));
    if (pad === "stop") {
      await db.from("saxo_link").delete().eq("user_id", user.id);
      await db.from("saxo_stand").delete().eq("user_id", user.id);
      return json({ ok: true });
    }
    return json({ error: "onbekend" }, 404);
  } catch (e) {
    console.error(e);
    if (pad === "callback") return terug("saxo=fout");
    return json({ error: String((e as Error).message ?? "fout") }, 500);
  }
});
