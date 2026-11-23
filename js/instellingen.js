/* AD Omniserve – instellingen, meldingen, export, back-up en herstel, sportassistent. */
"use strict";
SCHERMEN.instellingen = function () {
  const t = store.get("thema", "donker"), k = dat("kop") || {};
  const lg = gez().reduce((m, r) => (r.day > m ? r.day : m), "");
  const ok = k.legati_link && !k.legati_fout && k.legati_ok && Date.now() - new Date(k.legati_ok).getTime() < 2 * 3600e3;
  const ab = dat("agendaBron", []), x = dat("saxo") || {};
  const rij = (l, kleur, w) => '<div class="row"><span>' + l + '</span><b style="color:' + kleur + '">' + w + "</b></div>";
  let h = kop("Instellingen", "Alles over jouw app", ["#meer", "Meer"]) + alerts();
  h += '<div class="card"><div class="ch"><h2>Weergave</h2></div><div class="seg" id="thema">' + [["donker", "Donker"], ["licht", "Licht"], ["systeem", "Zoals iPhone"]].map(([v, l]) => '<button data-thema="' + v + '" class="' + (t === v ? "on" : "") + '">' + l + "</button>").join("") + "</div>" +
    '<label class="chk" style="margin-top:12px"><input type="checkbox" data-act="verberg-chk"' + (verberg() ? " checked" : "") + "><span>Bedragen standaard verbergen</span></label></div>";
  h += '<div class="card"><div class="ch"><h2>Koppelingen</h2></div>' +
    (st("kop") === "fout" ? actualiteit("kop") : "") +
    rij("Legati: trainingen", ok ? "var(--acc)" : "var(--warn)", "● " + (ok ? "Verbonden" : k.legati_link ? "Gestopt" : "Niet ingesteld")) +
    rij("Garmin (via Legati)", lg && lg >= plusDag(vandaag(), -2) ? "var(--acc)" : "var(--mut)", lg ? "laatste dag " + esc(korteDatum(lg)) : "nog niets binnen") +
    rij("Saxo Bank", x.gekoppeld ? "var(--acc)" : "var(--mut)", x.gekoppeld ? "● " + (x.env === "live" ? "Echte rekening" : "Testomgeving") : "Niet gekoppeld") +
    '<button class="row" data-go="#instellingen/agenda"><span>Agenda\'s</span><b style="color:' + (ab.some((b) => b.last_error) ? "var(--warn)" : ab.length ? "var(--acc)" : "var(--mut)") + '">' + (ab.length ? ab.length + " gekoppeld" + (ab.some((b) => b.last_error) ? ", fout" : "") : "Nog niet gekoppeld") + " ›</b></button>" +
    rij("Boekhouding", "var(--mut)", "Niet gekoppeld") +
    '<p class="src">Laatste ophaling uit Legati: ' + esc(sinds(k.legati_ok)) + ". Alles alleen lezen; deze app schrijft niets terug naar Legati, Saxo of je agenda. Voor de boekhouding is er nog geen koppeling: werk wordt hier enkel opgevolgd.</p></div>";
  h += '<div class="card"><div class="ch"><h2>Meldingen</h2></div><div id="meld"><p class="empty"><span class="spin"></span></p></div></div>';
  h += '<div class="card"><div class="ch"><h2>Sportassistent (AI)</h2></div><p class="empty">' + (S.aiFout === "geen_sleutel" ? "Staat nog uit: zet je Anthropic-sleutel als geheim <b>ANTHROPIC_API_KEY</b> in Supabase (project AD Omniserve, Edge Functions, Secrets)." : "Beantwoordt vragen over je trainingen en herstel, en schrijft na elke nieuwe training een analyse.") +
    " Krijgt enkel: je Legati-schema, Garmin-metingen, je eigen sportinvoer en je gevoelscheck. Nooit je taken, werk, agenda of beleggingen.</p></div>";
  h += '<div class="card"><div class="ch"><h2>Je gegevens</h2></div><p class="empty">Download al je gegevens, of zet een eerder gemaakte back-up terug. Terugzetten voegt enkel ontbrekende rijen toe: bestaande gegevens worden nooit overschreven.</p>' +
    '<button class="btn" data-act="export-json">Alles exporteren (JSON, back-up)</button>' +
    '<div class="grid" style="margin-top:0"><select id="csvTabel" class="selectknop">' + Object.entries(CSV_TABELLEN).map(([k, v]) => '<option value="' + k + '">' + v + "</option>").join("") + '</select><button class="btn btn2" data-act="export-csv">CSV (Excel)</button></div>' +
    '<label class="btn btn2">Back-up controleren en terugzetten<input type="file" accept="application/json,.json" id="herstelBestand" hidden></label><div id="herstelInfo">' + HERSTELBOX + '</div><p class="msg" id="exportMsg"></p>' +
    '<p class="src">Foto\'s staan in je privé-opslag; de export bevat hun bestandsnamen, niet de foto\'s zelf. Gegevens uit Garmin, Saxo en de AI-analyses staan in de export, maar worden niet teruggezet (die komen opnieuw van de bron).</p></div>';
  h += '<div class="card"><div class="ch"><h2>Account</h2></div><div class="row"><span>Naam</span><b>' + esc(dat("prof")?.naam || "–") + '</b></div><div class="row"><span>E-mail</span><b style="font-weight:500;font-size:14px">' + esc(S.user?.email || "") + "</b></div>" +
    '<button class="row" data-act="uitloggen"><span style="color:var(--warn)">Uitloggen</span><b class="mut">›</b></button></div>';
  h += '<div class="card"><div class="ch"><h2>Privacy</h2></div><p class="empty">Een app voor één persoon: niemand anders kan een account maken, en elke tabel laat enkel jouw eigen rijen zien. Niemand van de Legati-ploeg ziet deze app.</p><a class="lnk" href="privacy.html" style="display:inline-block;margin-top:8px">Privacyverklaring</a></div>';
  h += '<p class="src" style="text-align:center">Austin Life · versie 2</p>';
  return h;
};
TAB_VAN.instellingen = TAB_VAN["instellingen/agenda"] = "meer";
NA_TEKENEN.instellingen = () => meldR();

/* ---------- export ---------- */
const EXPORT_TABELLEN = { profiles: "id", instellingen: "user_id", taken: "user_id", notities: "user_id", klanten: "user_id", opdrachten: "user_id", offertes: "user_id", facturen: "user_id",
  sport_invoer: "user_id", gevoel: "user_id", doelen: "user_id", plan_match: "user_id", week_prioriteiten: "user_id", plans: "athlete_id", garmin_data: "user_id", analyse: "user_id",
  belegger: "user_id", saxo_stand: "user_id", saxo_historie: "user_id", saxo_boekingen: "user_id" };
const KOLOMMEN = { agenda_bron: "id,user_id,naam,soort,actief,last_ok,last_error,created_at,updated_at", profiles: "id,naam,created_at" };
// wat bij herstel teruggezet wordt, in volgorde (eerst klanten, dan wat ernaar verwijst), met de sleutel per tabel
const HERSTEL = [["instellingen", "user_id"], ["klanten", "id"], ["opdrachten", "id"], ["offertes", "id"], ["facturen", "id"], ["taken", "id"], ["notities", "id"],
  ["sport_invoer", "id"], ["gevoel", "user_id,dag"], ["doelen", "id"], ["plan_match", "user_id,dag"], ["week_prioriteiten", "id"]];
const CSV_TABELLEN = { taken: "Taken", klanten: "Klanten", opdrachten: "Opdrachten", offertes: "Offertes", facturen: "Facturen", sport_invoer: "Eigen trainingen", gevoel: "Gevoelscheck", doelen: "Doelen", saxo_boekingen: "Saxo-boekingen", notities: "Notities" };
async function haalTabel(t) {
  const kol = KOLOMMEN[t] || "*", out = [];
  for (let van = 0; van < 100000; van += 1000) {
    const { data, error } = await sb.from(t).select(kol).eq(EXPORT_TABELLEN[t] || "user_id", S.user.id).range(van, van + 999);
    if (error) throw error;
    out.push(...data); if (data.length < 1000) break;
  }
  return out;
}
function download(naam, inhoud, type) {
  const blob = new Blob([inhoud], { type }), a = document.createElement("a");
  a.href = URL.createObjectURL(blob); a.download = naam; document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
}
async function exportJson() {
  const m = $("exportMsg"); m.innerHTML = '<span class="spin"></span> Exporteren…';
  const tabellen = {}, fouten = [];
  for (const t of Object.keys(EXPORT_TABELLEN).concat("agenda_bron")) { try { tabellen[t] = await haalTabel(t); } catch (e) { fouten.push(t + ": " + foutTekst(e)); } }
  const doc = { app: "AD Omniserve", formaat: 1, gemaakt: new Date().toISOString(), user_id: S.user.id, tabellen, fouten };
  download("ad-omniserve-" + vandaag() + ".json", JSON.stringify(doc, null, 1), "application/json");
  m.textContent = "Export klaar: " + Object.values(tabellen).reduce((n, l) => n + l.length, 0) + " rijen" + (fouten.length ? ". Niet gelukt: " + fouten.join("; ") : ".");
}
const csvCel = (v) => { if (v == null) return ""; const s = typeof v === "object" ? JSON.stringify(v) : String(v); return /[;"\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
function naarCsv(rijen) {
  if (!rijen.length) return "";
  const kol = [...new Set(rijen.flatMap((r) => Object.keys(r)))].filter((k) => k !== "data" && k !== "user_id");
  return "﻿" + [kol.join(";")].concat(rijen.map((r) => kol.map((k) => csvCel(r[k])).join(";"))).join("\r\n");
}
async function exportCsv() {
  const t = $("csvTabel").value, m = $("exportMsg");
  try { const rijen = await haalTabel(t); if (!rijen.length) { m.textContent = "Geen gegevens in " + CSV_TABELLEN[t].toLowerCase() + "."; return; } download("ad-omniserve-" + t + "-" + vandaag() + ".csv", naarCsv(rijen), "text/csv;charset=utf-8"); m.textContent = rijen.length + " rijen geëxporteerd."; }
  catch (e) { m.textContent = "Export lukte niet: " + foutTekst(e); }
}

/* ---------- herstel: eerst controleren (droogloop), dan enkel ontbrekende rijen toevoegen ---------- */
let HERSTELDOC = null, HERSTELBOX = "";
const zetHerstel = (html) => { HERSTELBOX = html; const b = $("herstelInfo"); if (b) b.innerHTML = html; };
const sleutelVan = (r, k) => k.split(",").map((x) => r[x]).join("|");
async function herstelControle(file) {
  zetHerstel('<p class="empty"><span class="spin"></span> Back-up controleren…</p>'); HERSTELDOC = null;
  let doc; try { doc = JSON.parse(await file.text()); } catch (e) { zetHerstel('<p class="empty st-fout">Dit is geen geldig back-upbestand (geen JSON).</p>'); return; }
  if (doc?.app !== "AD Omniserve" || doc?.formaat !== 1 || typeof doc.tabellen !== "object") { zetHerstel('<p class="empty st-fout">Dit is geen back-up van AD Omniserve.</p>'); return; }
  if (doc.user_id !== S.user.id) { zetHerstel('<p class="empty st-fout">Deze back-up hoort bij een ander account en kan niet teruggezet worden.</p>'); return; }
  const plan = [];
  for (const [t, k] of HERSTEL) {
    const rijen = (doc.tabellen[t] || []).filter((r) => r && r.user_id === S.user.id);
    if (!rijen.length) continue;
    let bestaand; try { bestaand = new Set((await haalTabel(t)).map((r) => sleutelVan(r, k))); } catch (e) { plan.push({ t, k, fout: foutTekst(e), nieuw: [], al: 0 }); continue; }
    const nieuw = rijen.filter((r) => !bestaand.has(sleutelVan(r, k)));
    plan.push({ t, k, nieuw, al: rijen.length - nieuw.length });
  }
  HERSTELDOC = plan;
  const totaal = plan.reduce((n, p) => n + p.nieuw.length, 0);
  zetHerstel('<div class="herstel"><p class="sm"><b>Back-up van ' + esc(new Date(doc.gemaakt).toLocaleString("nl-BE")) + "</b></p>" +
    (plan.length ? plan.map((p) => '<div class="row"><span>' + esc(p.t) + "</span><b>" + (p.fout ? '<span style="color:var(--warn)">' + esc(p.fout) + "</span>" : p.nieuw.length + " nieuw · " + p.al + " al aanwezig") + "</b></div>").join("") : '<p class="empty">De back-up bevat geen terug te zetten gegevens.</p>') +
    '<p class="src">Bestaande rijen blijven ongewijzigd. Er wordt niets verwijderd.</p>' + (totaal ? '<button class="btn" data-act="herstel-ok">' + totaal + " rijen toevoegen</button>" : '<p class="empty">Niets toe te voegen: alles uit deze back-up staat er al.</p>') + "</div>");
}
async function herstelUitvoeren() {
  if (!HERSTELDOC) return;
  if (!confirm("Ontbrekende rijen uit de back-up toevoegen? Bestaande gegevens blijven ongewijzigd.")) return;
  const res = [];
  for (const p of HERSTELDOC) {
    if (!p.nieuw.length) continue;
    const rijen = p.nieuw.map((r) => { const o = { ...r }; if (p.t === "taken") o.dagprioriteit = null; return o; }); // dagprioriteiten niet terugzetten (max. 3 per dag)
    const { error } = await sb.from(p.t).upsert(rijen, { onConflict: p.k, ignoreDuplicates: true });
    res.push(p.t + ": " + (error ? "mislukt (" + vertaalDbFout(error) + ")" : rijen.length + " toegevoegd"));
  }
  HERSTELDOC = null;
  zetHerstel('<div class="alert a-ok"><span>Klaar. ' + esc(res.join("; ")) + ".</span></div>");
  laadAlles();
}

/* ---------- meldingen (push) ---------- */
const PUSH_OK = () => "serviceWorker" in navigator && "PushManager" in window && "Notification" in window && location.protocol !== "file:";
const IOS = /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
const STANDALONE = () => (window.matchMedia && matchMedia("(display-mode: standalone)").matches) || navigator.standalone === true;
const u8key = (k) => { const t = k.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (k.length % 4)) % 4), b = atob(t), o = new Uint8Array(b.length); for (let i = 0; i < b.length; i++) o[i] = b.charCodeAt(i); return o; };
async function meldSub() { if (!PUSH_OK()) return null; const r = await navigator.serviceWorker.getRegistration(); return r ? await r.pushManager.getSubscription() : null; }
async function meldR() {
  const box = $("meld"); if (!box) return;
  if (!PUSH_OK()) { box.innerHTML = '<p class="empty">' + (IOS && !STANDALONE() ? "Op je iPhone werken meldingen alleen vanuit het icoon op je beginscherm. Open deze pagina in Safari, tik op Deel en kies <b>Zet op beginscherm</b>. Open de app via dat icoon en kom hier terug." : "Deze browser ondersteunt geen meldingen.") + "</p>"; return; }
  if (Notification.permission === "denied") { box.innerHTML = '<p class="empty">Meldingen zijn geweigerd. Zet ze aan via Instellingen, Meldingen, Austin Life (of AD Omniserve) op je iPhone.</p>'; return; }
  const sub = await meldSub().catch(() => null);
  box.innerHTML = '<p class="empty">Je krijgt enkel een melding als er een nieuwe training binnen is, met de analyse erbij. Verder niets.</p>' +
    (sub ? '<div class="row" style="margin-top:8px"><span>Op dit toestel</span><b style="color:var(--acc)">Aan</b></div><div class="grid" style="margin-top:6px"><button class="btn btn2" data-act="mtest">Testmelding</button><button class="btn btn2" data-act="muit">Uitzetten</button></div>'
      : '<button class="btn" data-act="maan">Meldingen aanzetten</button>') + '<p class="msg" id="mmsg"></p>';
}
async function meldActie(act, knop) {
  const msg = (x) => { const m = $("mmsg"); if (m) m.textContent = x; };
  knop.disabled = true;
  try {
    if (act === "maan") {
      const perm = await Notification.requestPermission(); if (perm !== "granted") { await meldR(); return; }
      const reg = await navigator.serviceWorker.register("sw.js"); await navigator.serviceWorker.ready;
      const { key } = await fn("push", "key", null, "GET");
      let sub = await reg.pushManager.getSubscription(); if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: u8key(key) });
      const j = sub.toJSON(); await fn("push", "subscribe", { endpoint: j.endpoint, keys: j.keys, ua: IOS ? "iPhone" : "Browser" });
      await meldR(); msg("Meldingen staan aan.");
    } else if (act === "mtest") { const j = await fn("push", "test"); msg(j.sent ? "Testmelding verstuurd." : "Er kon geen melding verstuurd worden."); knop.disabled = false; }
    else if (act === "muit") { const sub = await meldSub(); if (sub) { await fn("push", "unsubscribe", { endpoint: sub.endpoint }).catch(() => {}); await sub.unsubscribe(); } await meldR(); }
  } catch (e) { console.error(e); knop.disabled = false; msg(e && e.code === "net" ? "Geen verbinding." : "Dat lukte niet. Probeer opnieuw."); }
}

/* ---------- sportassistent ---------- */
let CHAT = (() => { try { return JSON.parse(sessionStorage.getItem("omni.chat") || "[]"); } catch (e) { return []; } })();
const bewaarChat = () => { try { sessionStorage.setItem("omni.chat", JSON.stringify(CHAT.slice(-30))); } catch (e) { /* */ } };
const AIFOUT = { geen_sleutel: "De AI staat nog niet aan: de Anthropic-sleutel moet nog in Supabase gezet worden (zie Instellingen).", druk: "De AI is even druk. Probeer het zo meteen opnieuw.", limiet: "Je hebt het maximum aantal vragen voor vandaag bereikt.", net: "Geen verbinding. Controleer je internet.", geweigerd: "Daar kan de assistent niet op antwoorden.", niet_geinstalleerd: "De AI-functie staat niet op de server." };
SCHERMEN.assistent = () => { setTimeout(() => openChat(), 0); return SCHERMEN.meer(); };
TAB_VAN.assistent = "meer";
function openChat(vraag) {
  $("sheet").innerHTML = '<div class="sheet" role="dialog" aria-label="Sportassistent"><header><button class="lnk" data-act="chatdicht">Sluiten</button><b>Sportassistent</b><button class="lnk" data-act="chatleeg">Wissen</button></header><div class="msgs" id="msgs"></div><footer><form class="ask" id="chatForm"><input id="chatQ" placeholder="Stel je vraag…" autocomplete="off" enterkeyhint="send"><button aria-label="Verstuur">↑</button></form></footer></div>';
  document.body.style.overflow = "hidden";
  tekenChat();
  if (vraag) stuurChat(vraag); else setTimeout(() => $("chatQ")?.focus(), 50);
}
function sluitChat() { $("sheet").innerHTML = ""; document.body.style.overflow = ""; if (location.hash === "#assistent") location.hash = "#meer"; else teken(); }
function tekenChat(bezig) {
  const box = $("msgs"); if (!box) return;
  box.innerHTML = (CHAT.length ? "" : '<div class="bub a">Hoi! Ik ken je Legati-schema, je Garmin-metingen, je eigen sportinvoer en je gevoelscheck. Je werk, agenda en beleggingen krijg ik bewust niet. Mijn antwoorden zijn AI-interpretaties, geen medisch advies.</div>') +
    CHAT.map((m) => '<div class="bub ' + (m.role === "user" ? "u" : m.err ? "e" : "a") + '">' + esc(m.content) + "</div>").join("") + (bezig ? '<div class="bub a"><span class="spin"></span></div>' : "");
  box.scrollTop = box.scrollHeight;
}
async function stuurChat(q) {
  q = String(q || "").trim().slice(0, 2000); if (!q) return;
  CHAT.push({ role: "user", content: q }); tekenChat(true);
  try {
    const msgs = CHAT.filter((m) => !m.err).map((m) => ({ role: m.role, content: m.content }));
    while (msgs.length && msgs[0].role !== "user") msgs.shift();
    const j = await fn("ai", "", { kind: "chat", messages: msgs });
    CHAT.push({ role: "assistant", content: j.text || "(geen antwoord)" }); S.aiFout = null;
  } catch (e) { const c = e && e.code; if (c === "geen_sleutel") S.aiFout = c; CHAT.push({ role: "assistant", err: true, content: AIFOUT[c] || "Er ging iets mis. Probeer opnieuw." }); }
  bewaarChat(); tekenChat();
}
