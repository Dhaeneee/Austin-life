// AD Omniserve AI-functie: assistent (kind "chat") en de analyse van een training opnieuw maken (kind "analyse").
// De Anthropic-sleutel staat als geheim ANTHROPIC_API_KEY in Supabase en komt nooit in de website.
import { createClient } from "jsr:@supabase/supabase-js@2";
import { analysePrompt, feiten, gezondheid, MODEL as AI_MODEL, SYSTEEM, vraag } from "./coach.ts";

const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY") ?? "";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
// Supabase-sleutels: eerst de nieuwe (sb_secret / sb_publishable), anders de oude JWT-sleutels.
function sbKey(kind: "secret" | "publishable"): string {
  try {
    const j = JSON.parse(Deno.env.get(kind === "secret" ? "SUPABASE_SECRET_KEYS" : "SUPABASE_PUBLISHABLE_KEYS") ?? "{}");
    if (j && typeof j.default === "string" && j.default) return j.default;
  } catch { /* oude sleutels gebruiken */ }
  return Deno.env.get(kind === "secret" ? "SUPABASE_SERVICE_ROLE_KEY" : "SUPABASE_ANON_KEY") ?? "";
}
const SERVICE_KEY = sbKey("secret");
const DAILY_LIMIT = Number(Deno.env.get("AI_DAILY_LIMIT") ?? "40");

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "methode" }, 405);
  if (!ANTHROPIC_API_KEY) return json({ error: "geen_sleutel" }, 503);
  try {
    const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
    if (!token) return json({ error: "niet_ingelogd" }, 401);
    const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data: { user } } = await admin.auth.getUser(token);
    if (!user) return json({ error: "niet_ingelogd" }, 401);

    const { data: prof } = await admin.from("profiles").select("status").eq("id", user.id).maybeSingle();
    if (!prof || prof.status !== "actief") return json({ error: "geen_lid" }, 403);

    const body = await req.json().catch(() => ({}));
    if (body.kind === "chat" || body.kind === "analyse") {
      const dag = new Date().toISOString().slice(0, 10);
      const { data: use } = await admin.from("ai_usage").select("n").eq("user_id", user.id).eq("dag", dag).maybeSingle();
      if ((use?.n ?? 0) >= DAILY_LIMIT) return json({ error: "limiet" }, 429);
      const iso = (n: number) => new Date(Date.now() + n * 864e5).toISOString().slice(0, 10);
      const [{ data: acts }, { data: gez }, { data: pl }, { data: eigen }, { data: gevoel }] = await Promise.all([
        admin.from("garmin_data").select("ref, day, data").eq("user_id", user.id).eq("kind", "activity").gte("day", iso(-30)).order("day", { ascending: false }),
        admin.from("garmin_data").select("kind, day, data").eq("user_id", user.id).neq("kind", "activity").gte("day", iso(-14)),
        admin.from("plans").select("cplan, cnote").eq("athlete_id", user.id).maybeSingle(),
        // enkel sportgegevens die je zelf invoerde; werk- en beleggingsgegevens gaan nooit naar de AI
        admin.from("sport_invoer").select("dag, sport, duur_min, intensiteit, notitie").eq("user_id", user.id).gte("dag", iso(-30)).order("dag"),
        admin.from("gevoel").select("dag, energie, vermoeidheid, klachten").eq("user_id", user.id).gte("dag", iso(-14)).order("dag"),
      ]);
      const cplan = pl?.cplan ?? {};
      try {
        if (body.kind === "analyse") {
          const ref = typeof body.ref === "string" ? body.ref : "";
          const a = (acts ?? []).find((x) => x.ref === ref);
          if (!a) return json({ error: "onbekend" }, 404);
          await admin.from("ai_usage").upsert({ user_id: user.id, dag, n: (use?.n ?? 0) + 1 });
          const vorige = (acts ?? []).filter((x) => x.ref !== ref && x.day <= a.day).map((x) => x.data);
          const tekst = await vraag(SYSTEEM, [{ role: "user", content: analysePrompt(a.data, cplan[a.day] ?? null, gezondheid((gez ?? []).filter((r) => r.day <= a.day)), vorige) }], 1500);
          await admin.from("analyse").upsert({ user_id: user.id, ref, tekst: tekst.slice(0, 8000), model: AI_MODEL });
          return json({ text: tekst });
        }
        const msgs = (Array.isArray(body.messages) ? body.messages : []).slice(-16)
          .filter((m: { role: string; content: unknown }) => (m.role === "user" || m.role === "assistant") && typeof m.content === "string" && m.content.length <= 4000)
          .map((m: { role: "user" | "assistant"; content: string }) => ({ role: m.role, content: m.content }));
        if (!msgs.length || msgs[msgs.length - 1].role !== "user" || msgs[0].role !== "user") return json({ error: "ongeldig" }, 400);
        await admin.from("ai_usage").upsert({ user_id: user.id, dag, n: (use?.n ?? 0) + 1 });
        const plan: Record<string, unknown> = {};
        for (const d of Object.keys(cplan).sort()) if (d >= iso(-14) && d <= iso(21)) plan[d] = cplan[d];
        const ctx = `Vandaag is het ${dag}.
Wat je weet (enkel sport en gezondheid; werk, agenda en beleggingen krijg je bewust niet, zeg dat eerlijk als ernaar gevraagd wordt). Maak altijd duidelijk wat gemeten is en wat zijn eigen invoer is, en trek geen medische conclusies:
Trainingsschema uit Legati (vorige 2 weken en komende 3 weken): ${JSON.stringify(plan)}
Garmin-trainingen laatste 30 dagen: ${JSON.stringify((acts ?? []).slice(0, 25).map((a) => ({ dag: a.day, ...feiten(a.data) })).map((f: Record<string, unknown>) => { delete f.hartslag_per_kwart; delete f.ronden; return f; }))}
Gezondheid laatste 14 dagen (gemeten door Garmin): ${JSON.stringify(gezondheid(gez ?? []))}
Zelf ingevoerde trainingen (bv. padel, eigen invoer, niet gemeten; intensiteit = ervaren inspanning 1-10): ${JSON.stringify(eigen ?? [])}
Dagelijkse gevoelscheck (eigen invoer; energie en vermoeidheid op 1-5): ${JSON.stringify(gevoel ?? [])}`;
        const tekst = await vraag(SYSTEEM + "\nJe bent ook zijn algemene assistent in de app. Beantwoord vragen kort. Je kunt niets wijzigen in de app of in Legati; trainingen plant hij zelf in Legati. Je geeft nooit beleggingsorders en geen persoonlijk beleggingsadvies als feit.\n\n" + ctx, msgs, 1500);
        return json({ text: tekst });
      } catch (e) {
        const c = String((e as Error).message ?? e);
        return json({ error: ["geen_sleutel", "druk", "geweigerd"].includes(c) ? c : "ai_fout" }, c === "geen_sleutel" ? 503 : 502);
      }
    }
    return json({ error: "ongeldig" }, 400);
  } catch (e) {
    console.error(e);
    return json({ error: "fout" }, 500);
  }
});
