/* AD Omniserve – basis: hulpfuncties, thema, gegevenslaag (elk onderdeel laadt apart), formulieren, router-register. */
"use strict";
const CFG = window.TD_CONFIG || {};
const sb = window.supabase && CFG.url && CFG.key ? supabase.createClient(CFG.url, CFG.key) : null;
const R = window.REKEN;
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const store = { get(k, d) { try { const v = localStorage.getItem("omni." + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem("omni." + k, JSON.stringify(v)); } catch (e) { /* privévenster */ } } };
const { pad, isoDag, plusDag, maandagVan } = R;
const vandaag = () => isoDag(new Date());
const DAGEN = ["zondag", "maandag", "dinsdag", "woensdag", "donderdag", "vrijdag", "zaterdag"];
const MAANDEN = ["januari", "februari", "maart", "april", "mei", "juni", "juli", "augustus", "september", "oktober", "november", "december"];
const langeDatum = (iso) => { const d = new Date(iso + "T12:00:00"); return DAGEN[d.getDay()] + " " + d.getDate() + " " + MAANDEN[d.getMonth()]; };
const korteDatum = (iso) => { if (!iso) return ""; const d = new Date(String(iso).slice(0, 10) + "T12:00:00"); if (isNaN(d)) return ""; return d.getDate() + " " + MAANDEN[d.getMonth()].slice(0, 3); };
const dagLabel = (iso) => { const v = vandaag(); return iso === v ? "vandaag" : iso === plusDag(v, 1) ? "morgen" : iso === plusDag(v, -1) ? "gisteren" : korteDatum(iso); };
const getal = (x, dec = 0) => Number(x).toLocaleString("nl-BE", { minimumFractionDigits: dec, maximumFractionDigits: dec });
const euro = (x) => verberg() ? "€ •••" : "€ " + Number(x).toLocaleString("nl-BE", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
const bedrag = (x, m) => x == null ? "–" : verberg() ? "•••" + (m ? " " + m : "") : Number(x).toLocaleString("nl-BE", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + (m ? " " + m : "");
const duur = (sec) => { const m = Math.round(sec / 60); return m >= 60 ? Math.floor(m / 60) + "u" + pad(m % 60) : m + " min"; };
const uur = (iso) => new Date(iso).toLocaleTimeString("nl-BE", { hour: "2-digit", minute: "2-digit" });
const sinds = (ts) => { if (!ts) return "nog nooit"; const m = Math.round((Date.now() - new Date(ts).getTime()) / 60000);
  if (m < 2) return "net nu"; if (m < 60) return m + " min geleden"; const u = Math.round(m / 60); if (u < 24) return u + " uur geleden";
  const d = Math.round(u / 24); return d === 1 ? "gisteren" : d + " dagen geleden"; };
const tekstAlinea = (t) => String(t || "").split(/\n{2,}|\n/).filter((x) => x.trim()).map((x) => "<p>" + esc(x.replace(/^\s*[-*]\s+/, "")).replace(/\*\*(.+?)\*\*/g, "<b>$1</b>") + "</p>").join("");

/* ---------- thema ---------- */
function zetThema() {
  const t = store.get("thema", "donker");
  const licht = t === "licht" || (t === "systeem" && window.matchMedia && matchMedia("(prefers-color-scheme: light)").matches);
  document.documentElement.classList.toggle("licht", licht);
  const m = document.querySelector('meta[name="theme-color"]'); if (m) m.content = licht ? "#F3F4F6" : "#0E1116";
}
zetThema();
if (window.matchMedia) matchMedia("(prefers-color-scheme: light)").addEventListener?.("change", zetThema);

/* ---------- sporten ---------- */
const SPORT = {
  lopen: { n: "Lopen", e: "🏃", c: "t-s" }, fietsen: { n: "Fietsen", e: "🚴", c: "t-w" }, zwemmen: { n: "Zwemmen", e: "🏊", c: "t-a" },
  padel: { n: "Padel", e: "🎾", c: "t-g" }, kracht: { n: "Kracht", e: "💪", c: "t-p" }, wandelen: { n: "Wandelen", e: "🥾", c: "t-g" },
  squash: { n: "Squash", e: "🏸", c: "t-p" }, triatlon: { n: "Triatlon", e: "🏅", c: "t-s" }, rust: { n: "Rust", e: "🌙", c: "t-g" }, andere: { n: "Andere", e: "⏱️", c: "t-g" },
};
const sportVanAct = R.sportVanAct, sportVanPlan = R.sportVanPlan;
const CAT = { prive: { n: "Privé", c: "t-p" }, werk: { n: "Werk", c: "t-w" }, sport: { n: "Sport", c: "t-s" } };

/* ================= gegevenslaag =================
   Elk onderdeel heeft een eigen status: "laden", "ok" of "fout" (+ tijd en foutmelding).
   Eén onderdeel dat faalt, blokkeert de andere niet. */
const D = {};
const BRONNEN = {
  prof: (u) => sb.from("profiles").select("naam").eq("id", u).maybeSingle(),
  plan: (u) => sb.from("plans").select("cplan,cnote,updated_at").eq("athlete_id", u).maybeSingle(),
  garmin: (u) => sb.from("garmin_data").select("kind,ref,day,data,received_at").eq("user_id", u).gte("day", plusDag(vandaag(), -60)).order("day", { ascending: false }).limit(1000),
  analyse: (u) => sb.from("analyse").select("ref,tekst,created_at").eq("user_id", u),
  belegger: (u) => sb.from("belegger").select("antwoorden,profiel,updated_at").eq("user_id", u).maybeSingle(),
  kop: () => sb.rpc("koppelingen"),
  saxo: () => sb.rpc("saxo_status"),
  stand: (u) => sb.from("saxo_stand").select("env,data,opgehaald").eq("user_id", u).maybeSingle(),
  saxoHist: (u) => sb.from("saxo_historie").select("env,dag,totaal,cash,munt").eq("user_id", u).order("dag").limit(4000),
  saxoBoek: (u) => sb.from("saxo_boekingen").select("env,id,datum,soort,type_saxo,bedrag,munt,instrument").eq("user_id", u).order("datum").limit(10000),
  inst: (u) => sb.from("instellingen").select("data,updated_at").eq("user_id", u).maybeSingle(),
  taken: (u) => sb.from("taken").select("*").eq("user_id", u).order("created_at", { ascending: false }).limit(2000),
  notities: (u) => sb.from("notities").select("*").eq("user_id", u).order("created_at", { ascending: false }).limit(300),
  klanten: (u) => sb.from("klanten").select("*").eq("user_id", u).order("naam").limit(2000),
  opdrachten: (u) => sb.from("opdrachten").select("*").eq("user_id", u).order("created_at", { ascending: false }).limit(2000),
  offertes: (u) => sb.from("offertes").select("*").eq("user_id", u).order("created_at", { ascending: false }).limit(2000),
  facturen: (u) => sb.from("facturen").select("*").eq("user_id", u).order("created_at", { ascending: false }).limit(2000),
  eigen: (u) => sb.from("sport_invoer").select("*").eq("user_id", u).order("dag", { ascending: false }).limit(2000),
  gevoel: (u) => sb.from("gevoel").select("*").eq("user_id", u).gte("dag", plusDag(vandaag(), -60)).order("dag", { ascending: false }),
  doelen: (u) => sb.from("doelen").select("*").eq("user_id", u).order("streefdatum", { ascending: true }),
  match: (u) => sb.from("plan_match").select("dag,act_ref,status").eq("user_id", u),
  weekprio: (u) => sb.from("week_prioriteiten").select("*").eq("user_id", u).gte("week", plusDag(vandaag(), -120)).order("week"),
  agendaBron: (u) => sb.from("agenda_bron").select("id,naam,soort,actief,last_ok,last_error,created_at").eq("user_id", u).order("created_at"),
};
const st = (k) => D[k]?.st || "laden";
const dat = (k, d) => (D[k] && D[k].st === "ok" ? D[k].data : d);
let tekenTimer = null;
const tekenStraks = () => { clearTimeout(tekenTimer); tekenTimer = setTimeout(() => { if (!document.querySelector(".sheet") && !bezigMetInvoer()) teken(); }, 60); };
const bezigMetInvoer = () => { const f = document.activeElement; return f && /INPUT|TEXTAREA|SELECT/.test(f.tagName) && $("app").contains(f); };
function foutTekst(e) {
  const m = String(e?.message || e?.code || e || "");
  if (/relation .* does not exist|Could not find the table|PGRST205|42P01/i.test(m)) return "deze tabel bestaat nog niet in de database (migratie nog niet uitgevoerd)";
  if (/Failed to fetch|NetworkError|net/i.test(m)) return "geen verbinding";
  if (/JWT|401|niet_ingelogd/i.test(m)) return "niet (meer) ingelogd";
  return m.slice(0, 120) || "onbekende fout";
}
async function laadBron(k) {
  if (!S.user) return;
  D[k] = { ...(D[k] || {}), st: D[k]?.data !== undefined ? D[k].st : "laden" };
  try {
    const { data, error } = await BRONNEN[k](S.user.id);
    if (error) throw error;
    D[k] = { st: "ok", data, tijd: new Date().toISOString() };
  } catch (e) { console.error("laden", k, e); D[k] = { ...(D[k] || {}), st: "fout", fout: foutTekst(e), tijd: D[k]?.tijd }; }
  tekenStraks();
}
const laadAlles = () => Promise.all(Object.keys(BRONNEN).map(laadBron));
const herlaad = (...ks) => Promise.all(ks.map(laadBron));

/* afgeleide gegevens (oude namen behouden voor de sportschermen) */
const S = { user: null, aiFout: null, saxoMelding: null, geladen: false };
const plan = () => dat("plan")?.cplan || {};
const weeknote = () => dat("plan")?.cnote || {};
const garminRows = () => dat("garmin", []);
const acts = () => garminRows().filter((r) => r.kind === "activity").sort((a, b) => (b.data?.summary?.startTimeInSeconds || 0) - (a.data?.summary?.startTimeInSeconds || 0));
const gez = () => garminRows().filter((r) => r.kind !== "activity");
const ana = () => Object.fromEntries(dat("analyse", []).map((r) => [r.ref, r]));
const inst = () => dat("inst")?.data || {};
const verberg = () => !!store.get("verberg", false);
const werk = () => ({ klanten: dat("klanten", []), opdrachten: dat("opdrachten", []), offertes: dat("offertes", []), facturen: dat("facturen", []) });
const gedaan = () => R.uitgevoerd(acts(), dat("eigen", []));

async function bewaarInst(patch) {
  const data = { ...inst(), ...patch };
  const { error } = await sb.from("instellingen").upsert({ user_id: S.user.id, data });
  if (error) throw error;
  D.inst = { st: "ok", data: { data, updated_at: new Date().toISOString() }, tijd: new Date().toISOString() };
}

/* ---------- statusregels per onderdeel ---------- */
// Toont "laden", "ophalen mislukt" of de actualiteit. keys = onderdelen waarop de kaart steunt.
function actualiteit(keys, bron) {
  keys = [].concat(keys);
  if (keys.some((k) => st(k) === "laden" && !D[k]?.tijd)) return '<p class="src"><span class="spin"></span> laden…</p>';
  const fout = keys.filter((k) => st(k) === "fout");
  if (fout.length) return '<p class="src st-fout">⚠️ Ophalen mislukt: ' + esc(D[fout[0]].fout) + (D[fout[0]].tijd ? " · laatst gelukt " + esc(sinds(D[fout[0]].tijd)) : "") + "</p>";
  const t = keys.map((k) => D[k]?.tijd).filter(Boolean).sort()[0];
  return '<p class="src">' + (bron ? esc(bron) + " · " : "") + "opgehaald " + esc(sinds(t)) + "</p>";
}
// inhoud van een kaart volgens de status; leeg = werkelijk leeg (geen fout)
function blok(keys, vol, leeg) {
  keys = [].concat(keys);
  if (keys.some((k) => st(k) === "laden" && !D[k]?.tijd)) return '<p class="empty"><span class="spin"></span> Laden…</p>';
  if (keys.some((k) => st(k) === "fout" && D[k]?.data === undefined)) return '<p class="empty st-fout">Kon niet geladen worden.</p>';
  return vol || '<p class="empty">' + leeg + "</p>";
}

/* ---------- functies op de server ---------- */
async function fn(naam, pad, body, method) {
  const { data: { session } } = await sb.auth.getSession();
  let r; try { r = await fetch(CFG.url + "/functions/v1/" + naam + (pad ? "/" + pad : ""), { method: method || "POST", headers: { "Content-Type": "application/json", Authorization: "Bearer " + (session ? session.access_token : ""), apikey: CFG.key }, body: method === "GET" ? undefined : JSON.stringify(body || {}) }); }
  catch (e) { throw { code: "net" }; }
  if (r.status === 404 && !r.headers.get("content-type")?.includes("json")) throw { code: "niet_geinstalleerd" };
  const j = await r.json().catch(() => ({})); if (!r.ok) throw { code: j.error || (r.status === 404 ? "niet_geinstalleerd" : "fout_" + r.status) }; return j;
}

/* ---------- formulieren (één generiek invulscherm voor alle onderdelen) ---------- */
// spec: [{k, l, t: text|area|date|num|sel|chk|klant|opdracht, o:[[waarde,label]], req, ph, max}]
let FORM = null;
function veldHtml(f, v) {
  const id = "f_" + f.k, req = f.req ? " required" : "", ph = f.ph ? ' placeholder="' + esc(f.ph) + '"' : "", max = f.max ? ' maxlength="' + f.max + '"' : "";
  if (f.t === "area") return '<label class="field"><span>' + esc(f.l) + '</span><textarea id="' + id + '" rows="3"' + req + ph + max + ">" + esc(v ?? "") + "</textarea></label>";
  if (f.t === "chk") return '<label class="chk"><input type="checkbox" id="' + id + '"' + (v ? " checked" : "") + "><span>" + esc(f.l) + "</span></label>";
  if (f.t === "sel" || f.t === "klant" || f.t === "opdracht") {
    const o = f.t === "klant" ? [["", "Geen klant"]].concat(dat("klanten", []).filter((k) => k.actief || k.id === v).map((k) => [k.id, k.naam]))
      : f.t === "opdracht" ? [["", "Geen opdracht"]].concat(dat("opdrachten", []).filter((o) => !["afgerond", "geannuleerd"].includes(o.status) || o.id === v).map((o) => [o.id, o.titel])) : f.o;
    return '<label class="field"><span>' + esc(f.l) + '</span><select id="' + id + '">' + o.map(([w, l]) => '<option value="' + esc(w) + '"' + (String(v ?? "") === String(w) ? " selected" : "") + ">" + esc(l) + "</option>").join("") + "</select></label>";
  }
  if (f.t === "seg") return '<div class="field"><span>' + esc(f.l) + '</span><div class="seg' + (f.o.length > 5 ? " seg10" : "") + '" id="' + id + '"' + (f.leeg ? ' data-leeg="1"' : "") + ' data-waarde="' + esc(v ?? "") + '">' + f.o.map(([w, l]) => '<button type="button" data-seg="' + esc(w) + '" class="' + (String(v ?? "") === String(w) ? "on" : "") + '">' + esc(l) + "</button>").join("") + "</div></div>";
  const type = f.t === "date" ? "date" : f.t === "num" ? "number" : f.t === "email" ? "email" : f.t === "tel" ? "tel" : f.t === "url" ? "url" : "text";
  return '<label class="field"><span>' + esc(f.l) + '</span><input id="' + id + '" type="' + type + '"' + (f.t === "num" ? ' inputmode="decimal" step="' + (f.step || "any") + '"' + (f.min != null ? ' min="' + f.min + '"' : "") + (f.maxv != null ? ' max="' + f.maxv + '"' : "") : "") + ' value="' + esc(v ?? "") + '"' + req + ph + max + (f.auto ? ' autocomplete="' + f.auto + '"' : ' autocomplete="off"') + "></label>";
}
function leesForm(spec) {
  const o = {};
  for (const f of spec) {
    const el = $("f_" + f.k); if (!el) continue;
    if (f.t === "chk") o[f.k] = el.checked;
    else if (f.t === "seg") o[f.k] = el.dataset.waarde === "" ? null : (f.num ? Number(el.dataset.waarde) : el.dataset.waarde);
    else if (f.t === "num") o[f.k] = el.value === "" ? null : Number(String(el.value).replace(",", "."));
    else if (["date", "klant", "opdracht"].includes(f.t)) o[f.k] = el.value || null;
    else o[f.k] = el.value.trim();
  }
  return o;
}
// opties: titel, spec, waarden, opslaan(o) -> Promise, verwijderen() -> Promise, knop, extra (html onder het formulier)
function openForm(opt) {
  FORM = opt;
  $("sheet").innerHTML = '<div class="sheet" role="dialog" aria-label="' + esc(opt.titel) + '"><header><button class="lnk" data-act="formdicht">Annuleren</button><b>' + esc(opt.titel) + '</b><button class="lnk" data-act="formok" style="font-weight:650">' + esc(opt.knop || "Bewaar") + "</button></header>" +
    '<form class="sheetbody" id="formulier" novalidate>' + opt.spec.map((f) => veldHtml(f, opt.waarden?.[f.k])).join("") + (opt.extra || "") +
    '<p class="msg" id="formMsg"></p><button class="btn">' + esc(opt.knop || "Bewaar") + "</button>" +
    (opt.verwijderen ? '<button type="button" class="btn btn-weg" data-act="formweg">Verwijderen</button>' : "") + "</form></div>";
  document.body.style.overflow = "hidden";
  const eerste = $("formulier").querySelector("input:not([type=checkbox]),textarea");
  if (eerste && !opt.geenFocus) setTimeout(() => eerste.focus(), 60);
}
function sluitSheet() { $("sheet").innerHTML = ""; document.body.style.overflow = ""; FORM = null; teken(); }
async function formOpslaan() {
  if (!FORM) return;
  const msg = $("formMsg"), o = leesForm(FORM.spec);
  const mist = FORM.spec.filter((f) => f.req && (o[f.k] == null || o[f.k] === ""));
  if (mist.length) { msg.textContent = "Vul in: " + mist.map((f) => f.l.toLowerCase()).join(", ") + "."; return; }
  msg.innerHTML = '<span class="spin"></span>';
  try { await FORM.opslaan(o); sluitSheet(); }
  catch (e) { console.error(e); msg.textContent = "Bewaren lukte niet: " + vertaalDbFout(e); }
}
function vertaalDbFout(e) {
  const m = String(e?.message || e?.code || e || "");
  if (/Maximaal drie prioriteiten/i.test(m)) return "je hebt al drie prioriteiten voor die dag.";
  if (/check constraint|violates/i.test(m)) return "een van de velden is niet geldig.";
  return foutTekst(e);
}
// eenvoudige bewaar-helpers
async function opslaanRij(tabel, rij, id) {
  const r = id ? await sb.from(tabel).update(rij).eq("id", id) : await sb.from(tabel).insert(rij);
  if (r.error) throw r.error;
}
async function verwijderRij(tabel, id) { const r = await sb.from(tabel).delete().eq("id", id); if (r.error) throw r.error; }

/* ---------- router-register ---------- */
const SCHERMEN = {};   // naam -> functie(arg) die html teruggeeft
const NA_TEKENEN = {}; // naam -> functie die na het tekenen loopt (bv. agenda ophalen)
const TAB_VAN = {};    // scherm -> tab die oplicht
