// AD Omniserve – pushmeldingen (web push) naar de app op het beginscherm
//   GET  /push/key          (iedereen)      -> publieke VAPID-sleutel (de server maakt ze zelf de eerste keer)
//   POST /push/subscribe    (ingelogd)      -> dit toestel inschrijven en een bevestiging sturen
//   POST /push/unsubscribe  (ingelogd)      -> dit toestel uitschrijven
//   POST /push/test         (ingelogd)      -> testmelding naar al je toestellen
//   POST /push/event        (database)      -> enkel: nieuwe training binnen (met de sleutel uit de Vault)
// Austin wil enkel een melding bij een nieuwe training, met de analyse. Andere gebeurtenissen worden genegeerd.
// Deploy zonder JWT-controle.
import { createClient } from "jsr:@supabase/supabase-js@2";
import { newVapid, okEndpoint, sendPush, unb64u, type Sub, type Vapid } from "./webpush.ts";
import { sportOf } from "./sports.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
function sbKey(): string {
  try {
    const j = JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") ?? "{}");
    if (j && typeof j.default === "string" && j.default) return j.default;
  } catch { /* oude sleutel gebruiken */ }
  return Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
}
const db = createClient(SUPABASE_URL, sbKey(), { auth: { persistSession: false, autoRefreshToken: false } });
const CONTACT = Deno.env.get("PUSH_CONTACT") ?? "https://dhaeneee.github.io/Austin-life";
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });

let VAPID: Vapid | null = null;
async function vapid(): Promise<Vapid> {
  if (VAPID) return VAPID;
  const read = async () => (await db.from("app_keys").select("value").eq("name", "vapid").maybeSingle()).data?.value as string | undefined;
  let v = await read();
  if (!v) {
    await db.from("app_keys").upsert({ name: "vapid", value: JSON.stringify(await newVapid()) }, { onConflict: "name", ignoreDuplicates: true });
    v = await read();
  }
  if (!v) throw new Error("geen vapid");
  return (VAPID = JSON.parse(v) as Vapid);
}

async function member(req: Request) {
  const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!token) return null;
  const { data: { user } } = await db.auth.getUser(token);
  if (!user) return null;
  const { data: p } = await db.from("profiles").select("id,status").eq("id", user.id).maybeSingle();
  return p?.status === "actief" ? user : null;
}

type Msg = { title: string; body: string; url: string; tag?: string };
type SubRow = Sub & { fails: number | null };

async function deliver(rows: SubRow[], m: Msg) {
  let sent = 0;
  for (const s of rows) {
    let st = 0;
    try { st = await sendPush(s, m, await vapid(), CONTACT); } catch (e) { console.error("push", String(e)); }
    if (st >= 200 && st < 300) { sent++; await db.from("push_subs").update({ last_ok: new Date().toISOString(), fails: 0 }).eq("endpoint", s.endpoint); }
    else if (st === 404 || st === 410 || (st === 400 && !okEndpoint(s.endpoint))) await db.from("push_subs").delete().eq("endpoint", s.endpoint);
    else {
      const fails = (s.fails ?? 0) + 1;
      console.error("push status", st, new URL(s.endpoint).hostname);
      if (fails >= 10) await db.from("push_subs").delete().eq("endpoint", s.endpoint);
      else await db.from("push_subs").update({ fails }).eq("endpoint", s.endpoint);
    }
  }
  return sent;
}
async function toUser(uid: string, m: Msg) {
  const { data } = await db.from("push_subs").select("endpoint,p256dh,auth,fails").eq("user_id", uid);
  return deliver((data ?? []) as SubRow[], m);
}

const trunc = (t: unknown, n = 140) => { const s = String(t ?? "").replace(/\s+/g, " ").trim(); return s.length > n ? s.slice(0, n - 1) + "…" : s; };
// deno-lint-ignore no-explicit-any
export function actLine(s: any): string | null {
  const so = sportOf(s?.activityType); if (!so) return null;
  const [cat, name] = so, parts = [name], m = Number(s.distanceInMeters ?? 0), sec = Number(s.durationInSeconds ?? 0);
  if (m >= 300 && cat !== "kracht" && cat !== "andere") parts.push(cat === "zwemmen" ? `${Math.round(m)} m` : `${(m / 1000).toFixed(1).replace(".", ",")} km`);
  if (sec > 0) { const min = Math.round(sec / 60); parts.push(min >= 60 ? `${Math.floor(min / 60)}u${String(min % 60).padStart(2, "0")}` : `${min} min`); }
  return parts.join(" · ");
}

// deno-lint-ignore no-explicit-any
export async function onEvent(e: any) {
  if (e?.type !== "activity" || typeof e.user_id !== "string" || typeof e.ref !== "string") return { skip: "enkel trainingen" };
  const { data: r } = await db.from("garmin_data").select("data,day").eq("user_id", e.user_id).eq("kind", "activity").eq("ref", e.ref).maybeSingle();
  const s = r?.data?.summary ?? {}, start = Number(s.startTimeInSeconds ?? 0);
  if (!start || Date.now() / 1000 - start > 36 * 3600) return { skip: "oud" };        // geen meldingen voor oude trainingen
  const line = actLine(s); if (!line) return { skip: "sport" };
  // even wachten op de analyse (die wordt meteen na het binnenkomen geschreven)
  let ana: string | null = null;
  for (let i = 0; i < 8 && !ana; i++) {
    const { data: a } = await db.from("analyse").select("tekst").eq("user_id", e.user_id).eq("ref", e.ref).maybeSingle();
    if (a?.tekst) ana = a.tekst; else await new Promise((res) => setTimeout(res, 3000));
  }
  const body = ana ? `${line}. ${trunc(ana, 150)}` : `${line}. Bekijk je training in de app.`;
  return { sent: await toUser(e.user_id, { title: "Nieuwe training binnen", body, url: `#sport/${e.ref}`, tag: `act-${e.ref}` }) };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const path = new URL(req.url).pathname.replace(/\/+$/, "").split("/").pop();
  try {
    if (path === "key") return json({ key: (await vapid()).publicKey });
    if (path === "event" && req.method === "POST") {
      const k = req.headers.get("x-cron-key") ?? "";
      const { data: ok } = k ? await db.rpc("garmin_cron_ok", { k }) : { data: false };
      if (ok !== true) return json({ error: "nee" }, 401);
      return json({ ok: true, ...(await onEvent(await req.json().catch(() => ({})))) });
    }
    const user = await member(req);
    if (!user) return json({ error: "niet_ingelogd" }, 401);
    const body = await req.json().catch(() => ({}));
    if (path === "subscribe" && req.method === "POST") {
      const endpoint = String(body?.endpoint ?? ""), p256dh = String(body?.keys?.p256dh ?? ""), auth = String(body?.keys?.auth ?? "");
      let good = okEndpoint(endpoint);
      try { good = good && unb64u(p256dh).length === 65 && unb64u(auth).length === 16; } catch { good = false; }
      if (!good) return json({ error: "ongeldig" }, 400);
      const ua = typeof body?.ua === "string" ? body.ua.slice(0, 60) : null;
      const { error } = await db.from("push_subs").upsert({ endpoint, user_id: user.id, p256dh, auth, ua, fails: 0 });
      if (error) { console.error("subscribe", error.message); return json({ error: "fout" }, 500); }
      const sent = await deliver([{ endpoint, p256dh, auth, fails: 0 }], { title: "Meldingen staan aan", body: "Je krijgt enkel een melding als er een nieuwe training binnen is, met de analyse erbij.", url: "#instellingen", tag: "welkom" });
      return json({ ok: true, sent });
    }
    if (path === "unsubscribe" && req.method === "POST") {
      await db.from("push_subs").delete().eq("endpoint", String(body?.endpoint ?? "")).eq("user_id", user.id);
      return json({ ok: true });
    }
    if (path === "test" && req.method === "POST") {
      const sent = await toUser(user.id, { title: "Testmelding", body: "Meldingen werken op dit toestel.", url: "#instellingen", tag: "test" });
      return json({ ok: true, sent });
    }
    return json({ error: "onbekend" }, 404);
  } catch (e) {
    console.error(e);
    return json({ error: "fout" }, 500);
  }
});
