// Lokale testserver (enkel voor tests): bootst het kleine deel van Supabase na dat de app gebruikt,
// bovenop een ECHTE lokale Postgres met alle migraties en privacyregels (RLS). Elke vraag loopt als rol
// "authenticated" met het account uit het token, zodat de afscherming echt getest wordt.
//   /rest/v1/<tabel>  GET/POST/PATCH/DELETE (filters eq, neq, gt, gte, lt, lte, is, in; select, order, limit, offset; upsert)
//   /rest/v1/rpc/<f>  POST
//   /auth/v1/user     GET
//   /functions/v1/agenda[/test]  met de echte iCal-code (fixtures), /functions/v1/ai -> geen_sleutel
//   /storage/v1/...   uploaden, ondertekende link, wissen (met de RLS-regels op storage.objects)
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import pg from "pg";
import ICAL from "ical.js";
import { uitbreiden } from "../../supabase/functions/agenda/ics.ts";

// zoals PostgREST: datums als "JJJJ-MM-DD", numeric als getal
pg.types.setTypeParser(1082, (v) => v);
pg.types.setTypeParser(1700, (v) => (v == null ? null : Number(v)));
const DIR = path.dirname(new URL(import.meta.url).pathname);
const pool = new pg.Pool({ host: process.env.PGHOST || "/tmp/pgtest", port: Number(process.env.PGPORT || 54329), user: "postgres", database: process.env.PGDATABASE || "omni_app" });
const MOCK = { agendaFout: false };
const FOTO = new Map();
const id = (s) => { if (!/^[a-z_][a-z0-9_]*$/i.test(s)) throw new Error("ongeldige naam " + s); return '"' + s + '"'; };

function sub(req) {
  const t = (req.headers.authorization || "").replace(/^Bearer\s+/i, "");
  try { return JSON.parse(Buffer.from(t.split(".")[1], "base64url").toString()).sub || null; } catch { return null; }
}
async function alsGebruiker(uid, fn) {
  const c = await pool.connect();
  try {
    await c.query("begin");
    await c.query(uid ? "set local role authenticated" : "set local role anon");
    await c.query("select set_config('request.jwt.claim.sub', $1, true)", [uid || ""]);
    const r = await fn(c);
    await c.query("commit");
    return r;
  } catch (e) { await c.query("rollback").catch(() => {}); throw e; } finally { c.release(); }
}
function filters(q, vals) {
  const w = [];
  for (const [k, v] of q) {
    if (["select", "order", "limit", "offset", "on_conflict", "columns"].includes(k)) continue;
    const m = /^(not\.)?(eq|neq|gt|gte|lt|lte|is|in)\.(.*)$/s.exec(v);
    if (!m) throw new Error("filter niet ondersteund: " + k + "=" + v);
    const [, not, op, raw] = m, col = id(k);
    let sql;
    if (op === "is") sql = col + " is " + ({ null: "null", true: "true", false: "false" }[raw] || "null");
    else if (op === "in") { const l = raw.replace(/^\(|\)$/g, "").split(",").map((x) => x.replace(/^"|"$/g, "")); sql = col + " = any($" + (vals.push(l), vals.length) + ")"; }
    else sql = col + " " + { eq: "=", neq: "<>", gt: ">", gte: ">=", lt: "<", lte: "<=" }[op] + " $" + (vals.push(raw), vals.length);
    w.push(not ? "not (" + sql + ")" : sql);
  }
  return w.length ? " where " + w.join(" and ") : "";
}
const kolommen = (sel) => !sel || sel === "*" ? "*" : sel.split(",").map((c) => id(c.trim())).join(", ");
async function rest(req, res, url, body) {
  const uid = sub(req), q = url.searchParams, delen = url.pathname.split("/").filter(Boolean), tabel = delen[2];
  const prefer = req.headers.prefer || "", terug = /return=representation/.test(prefer);
  if (tabel === "rpc") {
    const f = delen[3];
    const r = await alsGebruiker(uid, (c) => c.query("select public." + id(f) + "() as r"));
    return [200, r.rows[0].r];
  }
  const t = "public." + id(tabel), vals = [];
  if (req.method === "GET") {
    let sql = "select " + kolommen(q.get("select")) + " from " + t + filters(q, vals);
    if (q.get("order")) sql += " order by " + q.get("order").split(",").map((o) => { const [c, d, n] = o.split("."); return id(c) + (d === "desc" ? " desc" : " asc") + (n === "nullsfirst" ? " nulls first" : n === "nullslast" ? " nulls last" : ""); }).join(", ");
    if (q.get("limit")) sql += " limit " + Number(q.get("limit"));
    if (q.get("offset")) sql += " offset " + Number(q.get("offset"));
    const r = await alsGebruiker(uid, (c) => c.query(sql, vals));
    return [200, r.rows];
  }
  if (req.method === "POST") {
    const rijen = Array.isArray(body) ? body : [body];
    const cols = [...new Set(rijen.flatMap((r) => Object.keys(r)))];
    const ph = rijen.map((r) => "(" + cols.map((c) => r[c] === undefined ? "default" : "$" + (vals.push(typeof r[c] === "object" && r[c] !== null && !Array.isArray(r[c]) ? JSON.stringify(r[c]) : Array.isArray(r[c]) ? JSON.stringify(r[c]) : r[c]), vals.length)).join(", ") + ")").join(", ");
    let sql = "insert into " + t + " (" + cols.map(id).join(", ") + ") values " + ph;
    if (/resolution=/.test(prefer)) {
      const oc = (q.get("on_conflict") || "").split(",").filter(Boolean);
      const pk = oc.length ? oc : (await pool.query("select a.attname from pg_index i join pg_attribute a on a.attrelid = i.indrelid and a.attnum = any(i.indkey) where i.indrelid = $1::regclass and i.indisprimary", [t])).rows.map((r) => r.attname);
      sql += " on conflict (" + pk.map(id).join(", ") + ") " + (/ignore-duplicates/.test(prefer) ? "do nothing" : "do update set " + cols.filter((c) => !pk.includes(c)).map((c) => id(c) + " = excluded." + id(c)).join(", "));
    }
    if (terug) sql += " returning *";
    const r = await alsGebruiker(uid, (c) => c.query(sql, vals));
    return [terug ? 201 : 201, terug ? r.rows : null];
  }
  if (req.method === "PATCH") {
    const set = Object.keys(body).map((c) => id(c) + " = $" + (vals.push(typeof body[c] === "object" && body[c] !== null ? JSON.stringify(body[c]) : body[c]), vals.length)).join(", ");
    const r = await alsGebruiker(uid, (c) => c.query("update " + t + " set " + set + filters(q, vals) + (terug ? " returning *" : ""), vals));
    return [terug ? 200 : 204, terug ? r.rows : null];
  }
  if (req.method === "DELETE") {
    await alsGebruiker(uid, (c) => c.query("delete from " + t + filters(q, vals), vals));
    return [204, null];
  }
  return [405, { message: "methode" }];
}
async function functies(req, url, body) {
  const uid = sub(req), naam = url.pathname.split("/")[3], pad = url.pathname.split("/")[4];
  if (!uid) return [401, { error: "niet_ingelogd" }];
  if (naam === "ai") return [503, { error: "geen_sleutel" }];
  if (naam === "push") return [503, { error: "niet_ingesteld" }];
  if (naam === "saxo") return [200, { ok: true }];
  if (naam === "agenda") {
    if (pad === "test") return [200, /calendar\.google\.com|icloud\.com/.test(body?.url || "") ? { ok: true, aantal: 3, naam: "Test" } : { ok: false, error: "link_niet_toegelaten" }];
    if (MOCK.agendaFout) return [500, { error: "fout" }];
    const bronnen = (await pool.query("select id, naam, soort from public.agenda_bron where user_id = $1 and actief order by created_at", [uid])).rows;
    const vanMs = Date.parse(body.van + "T00:00:00Z") - 14 * 3600e3, totMs = Date.parse(body.tot + "T00:00:00Z") + 38 * 3600e3, items = [], st = [];
    for (const b of bronnen) {
      const f = path.join(DIR, "..", "fixtures", b.soort + ".ics");
      const tekst = fs.readFileSync(f, "utf8").replaceAll("{{VANDAAG}}", body.van <= vandaagStr() && body.tot >= vandaagStr() ? vandaagStr().replaceAll("-", "") : body.van.replaceAll("-", ""));
      const r = uitbreiden(ICAL, tekst, vanMs, totMs);
      items.push(...r.items.map((i) => ({ ...i, bron_id: b.id, soort: b.soort })));
      st.push({ id: b.id, naam: b.naam, soort: b.soort, ok: true, opgehaald: new Date().toISOString(), uitCache: false });
      await pool.query("update public.agenda_bron set last_ok = now(), last_error = null where id = $1", [b.id]);
    }
    return [200, { van: body.van, tot: body.tot, bronnen: st, items }];
  }
  return [404, { error: "onbekend" }];
}
const vandaagStr = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Brussels" }).format(new Date());
async function opslag(req, res, url, raw) {
  const uid = sub(req), p = decodeURIComponent(url.pathname.replace(/^\/storage\/v1\/object\//, ""));
  if (req.method === "POST" && p.startsWith("sign/")) {
    const naam = p.slice("sign/foto/".length);
    const r = await alsGebruiker(uid, (c) => c.query("select 1 from storage.objects where bucket_id = 'foto' and name = $1", [naam]));
    if (!r.rows.length) return [400, { message: "Object not found" }];
    return [200, { signedURL: "/object/sign/foto/" + naam + "?token=test" }];
  }
  if (req.method === "GET" && p.startsWith("sign/foto/")) { const b = FOTO.get(p.slice("sign/foto/".length)); return b ? ["raw", b] : [404, {}]; }
  if (req.method === "POST" && p.startsWith("foto/")) {
    const naam = p.slice(5);
    await alsGebruiker(uid, (c) => c.query("insert into storage.objects(bucket_id, name) values ('foto', $1)", [naam]));
    FOTO.set(naam, raw);
    return [200, { Key: "foto/" + naam }];
  }
  if (req.method === "DELETE" && p === "foto") {
    const l = JSON.parse(raw.toString() || "{}").prefixes || [];
    await alsGebruiker(uid, (c) => c.query("delete from storage.objects where bucket_id = 'foto' and name = any($1)", [l]));
    return [200, []];
  }
  return [404, { message: "onbekend" }];
}
const server = http.createServer(async (req, res) => {
  const chunks = []; for await (const c of req) chunks.push(c);
  const raw = Buffer.concat(chunks), url = new URL(req.url, "http://x");
  const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "*", "Access-Control-Allow-Methods": "*" };
  if (req.method === "OPTIONS") { res.writeHead(200, cors); return res.end(); }
  try {
    let r;
    if (url.pathname === "/__mock") { Object.assign(MOCK, JSON.parse(raw.toString() || "{}")); r = [200, MOCK]; }
    else if (url.pathname === "/__sql") { const q = await pool.query(raw.toString()); r = [200, q.rows || []]; }
    else if (url.pathname.startsWith("/rest/v1/")) { const b = raw.length ? JSON.parse(raw.toString()) : {}; r = await rest(req, res, url, b); }
    else if (url.pathname.startsWith("/functions/v1/")) r = await functies(req, url, raw.length ? JSON.parse(raw.toString()) : {});
    else if (url.pathname.startsWith("/storage/v1/object/")) r = await opslag(req, res, url, raw);
    else if (url.pathname === "/auth/v1/user") { const u = sub(req); r = u ? [200, { id: u, email: "eigenaar@test", aud: "authenticated", role: "authenticated" }] : [401, { message: "geen sessie" }]; }
    else if (url.pathname.startsWith("/auth/v1/")) r = [200, {}];
    else r = [404, { message: "niet gevonden" }];
    if (r[0] === "raw") { res.writeHead(200, { ...cors, "Content-Type": "image/jpeg" }); return res.end(r[1]); }
    res.writeHead(r[0], { ...cors, "Content-Type": "application/json" });
    res.end(r[1] == null ? "" : JSON.stringify(r[1]));
  } catch (e) {
    res.writeHead(400, { ...cors, "Content-Type": "application/json" });
    res.end(JSON.stringify({ message: e.message, code: e.code || "fout", details: e.detail || null, hint: null }));
  }
});
server.listen(Number(process.env.MOCKPORT || 54321), () => console.log("mock op", server.address().port));
