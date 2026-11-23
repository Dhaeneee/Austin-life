/* AD Omniserve – router, klikken, inloggen en opstarten. */
"use strict";
const TABS = [["home", "Home", '<path d="M3 11.5 12 4l9 7.5"/><path d="M5.5 10v9.5h13V10"/>'], ["beleggen", "Beleggen", '<path d="M5 20v-6M10 20V9M15 20v-8M20 20V5"/>'],
  ["sport", "Sport", '<circle cx="5.5" cy="16" r="3.5"/><circle cx="18.5" cy="16" r="3.5"/><path d="M5.5 16 9 9h6l3.5 7M9 9l3 7h-6.5M13 6h3"/>'], ["werk", "Mijn zaak", '<rect x="3" y="7" width="18" height="13" rx="2.5"/><path d="M8.5 7V5.5A1.5 1.5 0 0 1 10 4h4a1.5 1.5 0 0 1 1.5 1.5V7M3 12.5h18"/>'],
  ["meer", "Meer", '<circle cx="5" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="19" cy="12" r="1.6"/>']];
function huidigScherm() {
  const h = (location.hash || "#home").slice(1).split("?")[0], [a, b] = h.split("/");
  if (b && SCHERMEN[a + "/" + b]) return { naam: a + "/" + b, arg: null };
  if (b && SCHERMEN[a + "/"]) return { naam: a + "/", arg: decodeURIComponent(b) };
  return { naam: SCHERMEN[a] ? a : "home", arg: null };
}
function teken() {
  if (!S.geladen) return;
  const { naam, arg } = huidigScherm();
  let html; try { html = SCHERMEN[naam](arg); } catch (e) { console.error(e); html = kop("Oei", "") + '<div class="card"><p class="empty st-fout">Dit scherm kon niet getekend worden: ' + esc(e.message) + '</p><a class="btn btn2" href="#home" style="text-decoration:none">Naar Vandaag</a></div>'; }
  const y = window.scrollY;
  $("app").innerHTML = html;
  if (TEKEN_BEHOUD) window.scrollTo(0, y);
  const tab = TAB_VAN[naam] || (TABS.some((t) => t[0] === naam) ? naam : "home"), tb = $("tabbar");
  tb.classList.remove("hide"); $("fab").classList.remove("hide");
  tb.innerHTML = TABS.map(([id, l, ic]) => '<a href="#' + id + '" class="' + (id === tab ? "on" : "") + '"' + (id === tab ? ' aria-current="page"' : "") + '><svg viewBox="0 0 24 24">' + ic + "</svg>" + l + "</a>").join("");
  const na = NA_TEKENEN[naam.replace(/\/$/, "")]; if (na) na();
}
let TEKEN_BEHOUD = true, vorigeHash = location.hash;
window.addEventListener("hashchange", () => { const h = location.hash; TEKEN_BEHOUD = false; if (FORM || $("sheet").innerHTML) { $("sheet").innerHTML = ""; document.body.style.overflow = ""; FORM = null; } teken(); TEKEN_BEHOUD = true; if (h !== vorigeHash) window.scrollTo(0, 0); vorigeHash = h; });

/* ================= klikken ================= */
document.addEventListener("click", async (e) => {
  const t = e.target.closest("[data-go],[data-dag],[data-week],[data-thema],[data-vraag],[data-q],[data-act],[data-seg],[data-snel],[data-takenfilter],[data-werktab],[data-agw],[data-agnav],[data-agdag],[data-buffer],[data-wk],#heranalyse,#vlBewaar");
  if (!t) return;
  if (t.matches("input[type=checkbox],input[type=radio]") && !t.dataset.act) return;
  if (t.dataset.go) { e.preventDefault(); location.hash = t.dataset.go; return; }
  if (t.dataset.seg !== undefined) { const p = t.parentElement; p.dataset.waarde = p.dataset.leeg && p.dataset.waarde === t.dataset.seg ? "" : t.dataset.seg; p.querySelectorAll("button").forEach((b) => b.classList.toggle("on", b.dataset.seg === p.dataset.waarde)); return; }
  if (t.dataset.snel) { snelKlik(t); return; }
  if (t.dataset.takenfilter) { TAKENFILTER = t.dataset.takenfilter; store.set("takenfilter", TAKENFILTER); teken(); return; }
  if (t.dataset.werktab) { WERKTAB = t.dataset.werktab; store.set("werktab", WERKTAB); teken(); return; }
  if (t.dataset.agw) { AGWEERGAVE = t.dataset.agw; store.set("agweergave", AGWEERGAVE); teken(); return; }
  if (t.dataset.agnav !== undefined) { const n = Number(t.dataset.agnav); AGDAG = n === 0 ? vandaag() : plusDag(AGDAG || vandaag(), n); teken(); return; }
  if (t.dataset.agdag) { AGDAG = t.dataset.agdag; if (t.dataset.agw2) { AGWEERGAVE = "dag"; store.set("agweergave", "dag"); } teken(); return; }
  if (t.dataset.buffer !== undefined) { try { await bewaarInst({ agenda_buffer: Number(t.dataset.buffer) }); } catch (err) { alert("Bewaren lukte niet: " + foutTekst(err)); } teken(); return; }
  if (t.dataset.wk !== undefined) { const n = Number(t.dataset.wk); WEEK = n === 0 ? maandagVan(vandaag()) : plusDag(WEEK || maandagVan(vandaag()), n); teken(); return; }
  if (t.dataset.dag && !t.dataset.act) { SPORTDAG = t.dataset.dag; teken(); return; }
  if (t.dataset.week) { SPORTDAG = plusDag(SPORTDAG || vandaag(), Number(t.dataset.week)); teken(); return; }
  if (t.dataset.thema) { store.set("thema", t.dataset.thema); zetThema(); teken(); return; }
  if (t.dataset.vraag) { openChat(t.dataset.vraag); return; }
  if (t.dataset.q) { VL[t.dataset.q] = Number(t.dataset.i); t.parentElement.querySelectorAll(".opt").forEach((b) => b.classList.toggle("on", b === t)); return; }
  const act = t.dataset.act, id = t.dataset.id;
  switch (act) {
    case "formdicht": case "sheetdicht": return sluitSheet();
    case "formok": return formOpslaan();
    case "formweg": { if (!FORM?.verwijderen || !confirm(FORM.bevestig || "Verwijderen?")) return; try { await FORM.verwijderen(); sluitSheet(); } catch (err) { $("formMsg").textContent = "Verwijderen lukte niet: " + vertaalDbFout(err); } return; }
    case "verberg": store.set("verberg", !verberg()); teken(); return;
    case "verberg-chk": store.set("verberg", t.checked); return;
    case "snel": { const metPrio = !!t.dataset.prio; sluitSheetStil(); openSnel(t.dataset.soort, metPrio); return; }
    case "snel-ok": return snelBewaar();
    case "taak-vink": return taakVink(id);
    case "taak-bewerk": return openTaak(dat("taken", []).find((x) => x.id === id));
    case "prio-kies": return openPrioKiezer();
    case "notitie-bewerk": return openNotitie(dat("notities", []).find((x) => x.id === id));
    case "notitie-taak": { const n = dat("notities", []).find((x) => x.id === id); sluitSheetStil(); return openTaak(null, { titel: (n?.tekst || "").split("\n")[0].slice(0, 200), notitie: n?.tekst || "", categorie: n?.categorie || "prive", klant_id: n?.klant_id }); }
    case "werk-open": return openWerk(t.dataset.soort, id);
    case "werk-kies": return openWerkKiezer();
    case "werk-nieuw": { if (t.dataset.klant) WERK_STANDAARD = { klant_id: t.dataset.klant }; sluitSheetStil(); return openWerk(t.dataset.soort); }
    case "taak-van-opdracht": { const o = dat("opdrachten", []).find((x) => x.id === id); sluitSheetStil(); return openTaak(null, { categorie: "werk", opdracht_id: id, klant_id: o?.klant_id, titel: o?.volgende_actie || "" }); }
    case "factuur-betaald": { const r = await sb.from("facturen").update({ betaald_op: vandaag() }).eq("id", id); if (r.error) { $("formMsg").textContent = vertaalDbFout(r.error); return; } await herlaad("facturen"); return sluitSheet(); }
    case "eigen-nieuw": return openEigen(null, t.dataset.sport);
    case "eigen-bewerk": return openEigen(dat("eigen", []).find((x) => x.id === id));
    case "doel-nieuw": return openDoel(null);
    case "doel-bewerk": return openDoel(dat("doelen", []).find((x) => x.id === id));
    case "match": return openMatch(t.dataset.dag);
    case "match-ok": return bewaarMatch(t.dataset.dag);
    case "gevoel": t.parentElement.querySelectorAll("button").forEach((b) => b.classList.toggle("on", b === t)); return bewaarGevoel(t.dataset.veld, Number(t.dataset.n));
    case "wp-klaar": { const r = await sb.from("week_prioriteiten").update({ klaar: t.checked }).eq("id", id); if (r.error) { t.checked = !t.checked; alert(vertaalDbFout(r.error)); } herlaad("weekprio"); return; }
    case "agbron-nieuw": return openAgendaBron(null);
    case "agbron": return openAgendaBron(dat("agendaBron", []).find((x) => x.id === id));
    case "inleg": return openInleg();
    case "export-json": return exportJson().catch((err) => { $("exportMsg").textContent = "Export lukte niet: " + foutTekst(err); });
    case "export-csv": return exportCsv();
    case "herstel-ok": return herstelUitvoeren();
    case "chatdicht": return sluitChat();
    case "chatleeg": CHAT = []; bewaarChat(); tekenChat(); return;
    case "uitloggen": await sb.auth.signOut(); location.hash = ""; location.reload(); return;
    case "maan": case "mtest": case "muit": return meldActie(act, t);
  }
  if (act && act.startsWith("saxo-")) {
    const m = $("saxoMsg"), zeg = (x) => { if (m) m.textContent = x; }; t.disabled = true;
    try {
      if (act === "saxo-sim" || act === "saxo-live") { zeg("Je gaat naar Saxo om in te loggen…"); const j = await fn("saxo", "start", { env: act === "saxo-live" ? "live" : "sim" }); location.href = j.url; return; }
      if (act === "saxo-stop") { if (!confirm("Saxo ontkoppelen? De app haalt dan niets meer op. Je huidige stand verdwijnt uit de app; je opgeslagen dagstanden en boekingen blijven bewaard.")) { t.disabled = false; return; } await fn("saxo", "stop"); }
      if (act === "saxo-nu") { zeg("Bezig…"); const j = await fn("saxo", "nu"); if (j.error) throw { code: j.error }; }
      S.saxoMelding = null; await herlaad("saxo", "stand", "saxoHist", "saxoBoek");
    } catch (err) { zeg(SAXOFOUT[err && err.code] || "Dat lukte niet (" + ((err && err.code) || "fout") + ")."); t.disabled = false; }
    return;
  }
  if (t.id === "heranalyse") {
    const m = $("anaMsg"); t.disabled = true; m.innerHTML = '<span class="spin"></span> De analyse wordt geschreven…';
    try { await fn("ai", "", { kind: "analyse", ref: t.dataset.ref }); S.aiFout = null; await herlaad("analyse"); }
    catch (err) { const c = err && err.code; if (c === "geen_sleutel") S.aiFout = c; m.textContent = AIFOUT[c] || "Dat lukte niet. Probeer opnieuw."; t.disabled = false; }
    return;
  }
  if (t.id === "vlBewaar") {
    const m = $("vlMsg"), mist = VRAGEN.filter((v) => VL[v.k] == null);
    if (mist.length) { m.textContent = "Beantwoord nog " + (mist.length === 1 ? "vraag " : "de vragen ") + mist.map((v) => VRAGEN.indexOf(v) + 1).join(", ") + "."; return; }
    const r = berekenProfiel(VL); t.disabled = true;
    const { error } = await sb.from("belegger").upsert({ user_id: S.user.id, antwoorden: { ...VL, _uitleg: r.uitleg }, profiel: r.profiel, updated_at: new Date().toISOString() });
    if (error) { m.textContent = "Bewaren lukte niet. Probeer opnieuw."; t.disabled = false; return; }
    VL = {}; await herlaad("belegger"); location.hash = "#beleggen";
  }
});
function sluitSheetStil() { $("sheet").innerHTML = ""; FORM = null; }
function snelKlik(t) {
  const k = t.dataset.snel, w = t.dataset.w;
  if (k === "soort") SNEL.soort = w; else if (k === "cat") SNEL.cat = w; else if (k === "dl") SNEL.dl = w; else if (k === "foto-weg") SNEL.foto = null;
  SNEL.prio = $("snelPrio")?.checked ?? SNEL.prio;
  tekenSnel();
}
document.addEventListener("change", async (e) => {
  const t = e.target;
  if (t.dataset.prio) return prioWissel(t);
  if (t.id === "snelFoto" && t.files?.[0]) { const m = $("snelMsg"); m.innerHTML = '<span class="spin"></span> Foto verkleinen…'; try { SNEL.foto = await verklein(t.files[0]); SNEL.prio = $("snelPrio")?.checked ?? SNEL.prio; tekenSnel(); } catch (err) { m.textContent = "Deze foto kon niet gelezen worden."; } return; }
  if (t.id === "herstelBestand" && t.files?.[0]) { const f = t.files[0]; t.value = ""; return herstelControle(f); }
  if (t.id === "gvKlacht") return bewaarGevoel(null);
});
document.addEventListener("submit", (e) => {
  const id = e.target.id;
  if (id === "homeAsk") { e.preventDefault(); const q = $("homeQ").value; if (q.trim()) openChat(q); }
  if (id === "chatForm") { e.preventDefault(); const i = $("chatQ"); const q = i.value; i.value = ""; stuurChat(q); }
  if (id === "formulier") { e.preventDefault(); formOpslaan(); }
  if (id === "snelForm") { e.preventDefault(); snelBewaar(); }
  if (id === "wpForm") { e.preventDefault(); bewaarWeekPrio(); }
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && e.target.id === "snelT" && SNEL.soort === "taak" && !e.shiftKey) { e.preventDefault(); snelBewaar(); }
  if (e.key === "Escape" && $("sheet").innerHTML) sluitSheet();
});
$("fab").addEventListener("click", () => openSnel());

/* ================= inloggen ================= */
let AUM = "in";
function schermLogin(melding) {
  $("tabbar").classList.add("hide"); $("fab").classList.add("hide");
  $("app").innerHTML = '<div class="login"><div class="logo">AL</div><h1>Austin Life</h1><p class="sub">Je persoonlijke cockpit.</p><div class="card"><form id="auForm">' +
    '<label class="field"><span>E-mail</span><input id="auMail" type="email" autocomplete="email" required></label><label class="field"><span>Wachtwoord</span><input id="auPw" type="password" autocomplete="current-password" required minlength="8"></label>' +
    '<button class="btn" id="auGo">Inloggen</button></form><button class="lnk" id="auVergeten" style="margin-top:12px">Wachtwoord vergeten?</button>' +
    '<p class="src">Persoonlijke app: er kan geen nieuw account aangemaakt worden.</p><p class="msg" id="auMsg">' + esc(melding || "") + "</p></div></div>";
}
document.addEventListener("click", async (e) => {
  if (!e.target.closest("#auVergeten")) return;
  const mail = $("auMail").value.trim(); if (!mail) { $("auMsg").textContent = "Vul eerst je e-mailadres in."; return; }
  await sb.auth.resetPasswordForEmail(mail, { redirectTo: location.origin + location.pathname });
  $("auMsg").textContent = "Als dit adres bekend is, kreeg je een mail om een nieuw wachtwoord te kiezen.";
});
document.addEventListener("submit", async (e) => {
  if (e.target.id !== "auForm") return; e.preventDefault();
  const go = $("auGo"), msg = $("auMsg"); go.disabled = true; msg.textContent = "";
  const r = await sb.auth.signInWithPassword({ email: $("auMail").value.trim(), password: $("auPw").value });
  if (r.error) { const t = String(r.error.message || ""); msg.textContent = /Invalid login/i.test(t) ? "E-mail of wachtwoord klopt niet." : /confirm/i.test(t) ? "Bevestig eerst je e-mailadres via de mail die je kreeg." : "Dat lukte niet: " + t; go.disabled = false; }
});
async function nieuwWachtwoord() {
  $("tabbar").classList.add("hide"); $("fab").classList.add("hide");
  $("app").innerHTML = '<div class="login"><div class="logo">AL</div><h1>Nieuw wachtwoord</h1><div class="card"><form id="pwForm"><label class="field"><span>Nieuw wachtwoord</span><input id="pwNieuw" type="password" minlength="8" required autocomplete="new-password"></label><button class="btn">Bewaren</button></form><p class="msg" id="pwMsg"></p></div></div>';
  $("pwForm").addEventListener("submit", async (e) => { e.preventDefault(); const { error } = await sb.auth.updateUser({ password: $("pwNieuw").value }); if (error) $("pwMsg").textContent = "Dat lukte niet: " + error.message; else { $("pwMsg").textContent = "Bewaard."; setTimeout(() => location.replace(location.pathname), 800); } });
}

/* ================= start ================= */
function start(session) {
  if (!session) { S.user = null; S.geladen = false; schermLogin(); return; }
  if (S.user && S.user.id === session.user.id && S.geladen) return;
  S.user = session.user;
  const sq = new URLSearchParams(location.hash.split("?")[1] || "");
  if (sq.get("saxo")) { const v = sq.get("saxo"); S.saxoMelding = { ok: v === "ok", t: { ok: "Saxo is gekoppeld.", deels: "Saxo is gekoppeld, maar de gegevens konden nog niet opgehaald worden. Probeer Nu vernieuwen.", verlopen: "Het koppelen duurde te lang. Probeer opnieuw.", fout: "Het koppelen met Saxo lukte niet. Probeer opnieuw." }[v] || "Saxo: " + v }; history.replaceState(null, "", location.pathname + "#beleggen"); }
  S.geladen = true; teken();          // meteen tekenen: elk onderdeel toont zelf "laden"
  laadAlles();                         // elk onderdeel laadt apart en tekent opnieuw zodra het klaar is
}
function ververs() { if (!S.user || !S.geladen || bezigMetInvoer() || $("sheet").innerHTML) return; AGENDA.key = ""; laadAlles(); }
if (!sb) { $("app").innerHTML = '<div class="login"><div class="card"><p>De app is nog niet ingesteld (config.js).</p></div></div>'; }
else {
  sb.auth.onAuthStateChange((ev, session) => { if (ev === "PASSWORD_RECOVERY") { nieuwWachtwoord(); return; } if (ev === "SIGNED_OUT") { start(null); return; } if (ev === "INITIAL_SESSION" || ev === "SIGNED_IN") setTimeout(() => start(session), 0); });
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") ververs(); });
  setInterval(ververs, 5 * 60e3);
}
if (PUSH_OK()) {
  navigator.serviceWorker.register("sw.js").catch(() => {});
  navigator.serviceWorker.addEventListener("message", (e) => { const d = e.data || {}; if (d.type === "td-nav" && d.url) { try { location.hash = new URL(d.url).hash || "#home"; } catch (x) { /* */ } } if (d.type === "td-refresh") ververs(); });
}
