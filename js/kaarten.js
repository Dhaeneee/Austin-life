/* AD Omniserve – gedeelde bouwstenen: kop, meldingen over koppelingen, trainingsregels, grafieken. */
"use strict";
const kop = (titel, ondertitel, terug) => '<div class="top">' + (terug ? '<button class="lnk" data-go="' + terug[0] + '">‹ ' + esc(terug[1]) + "</button>" : '<div class="brand">Austin Life</div>') +
  '<span class="topr"><button class="oog" data-act="verberg" aria-label="' + (verberg() ? "Bedragen tonen" : "Bedragen verbergen") + '" title="Bedragen ' + (verberg() ? "tonen" : "verbergen") + '">' + (verberg() ? "🙈" : "👁") + '</button><button class="av" data-go="#instellingen" aria-label="Instellingen">' +
  esc((dat("prof")?.naam || "A").trim().charAt(0).toUpperCase() || "A") + "</button></span></div><h1>" + esc(titel) + '</h1><div class="sub">' + esc(ondertitel || "") + "</div>";

/* ---------- meldingen over koppelingen (enkel wat echt aandacht vraagt) ---------- */
function waarschuwingen() {
  const w = [], k = dat("kop");
  if (k) {
    if (!k.legati_link) w.push(["De koppeling met Legati is nog niet ingesteld. Trainingen en Garmin-gegevens komen dan niet binnen.", "#instellingen"]);
    else if (k.legati_fout) w.push(["De koppeling met Legati gaf een fout (" + esc(k.legati_fout) + "). Laatste keer gelukt: " + sinds(k.legati_ok) + ".", "#instellingen"]);
    else if (!k.legati_ok || Date.now() - new Date(k.legati_ok).getTime() > 2 * 3600e3) w.push(["De koppeling met Legati is gestopt: laatste keer gelukt " + sinds(k.legati_ok) + ".", "#instellingen"]);
    const lg = gez().reduce((m, r) => (r.day > m ? r.day : m), "");
    if (k.legati_ok && lg && lg < plusDag(vandaag(), -2)) w.push(["Er komen geen nieuwe Garmin-gegevens meer binnen sinds " + langeDatum(lg) + ". Kijk of je horloge nog synchroniseert en of Garmin nog gekoppeld is in de Legati-app.", "#sport"]);
  }
  const x = dat("saxo");
  if (x && x.env && x.last_error && !x.gekoppeld) w.push(["De koppeling met Saxo is gestopt. Koppel opnieuw bij Beleggen.", "#beleggen"]);
  else if (x && x.gekoppeld && x.last_ok && Date.now() - new Date(x.last_ok).getTime() > 2 * 3600e3) w.push(["Saxo gaf geen nieuwe gegevens meer sinds " + sinds(x.last_ok) + ".", "#beleggen"]);
  for (const b of dat("agendaBron", [])) if (b.actief && b.last_error) w.push(["Agenda \"" + esc(b.naam) + "\" kon niet opgehaald worden (" + esc(AGENDAFOUT[b.last_error.replace(/_\d+$/, "")] || b.last_error) + ").", "#instellingen/agenda"]);
  if (AGENDA.fout === "niet_geinstalleerd" && dat("agendaBron", []).length) w.push(["De agendafunctie staat nog niet op de server, dus je afspraken kunnen niet opgehaald worden.", "#instellingen/agenda"]);
  const foutBronnen = Object.keys(D).filter((k) => D[k]?.st === "fout");
  if (foutBronnen.length >= 3) w.push(["Een deel van je gegevens kon niet geladen worden (" + foutBronnen.length + " onderdelen). " + esc(D[foutBronnen[0]].fout) + ".", null]);
  return w;
}
const alerts = () => waarschuwingen().map(([t, go]) => '<div class="alert a-warn"' + (go ? ' data-go="' + go + '" role="button"' : "") + "><span>⚠️</span><span>" + t + "</span></div>").join("");

/* ---------- trainingen ---------- */
function planRegel(p) {
  if (!p) return null;
  const sp = sportVanPlan(p), x = SPORT[sp] || SPORT.andere;
  const extra = [p.t, p.km ? (sp === "zwemmen" ? getal(p.km * 1000) + " m" : getal(p.km, 1) + " km") : ""].filter(Boolean).join(" · ");
  return { sp, x, titel: p.s || x.n, extra, z: p.z || "" };
}
function planEv(dag, p, metDatum) {
  const r = planRegel(p); if (!r) return "";
  return '<div class="ev"><div class="ic ' + r.x.c + '">' + r.x.e + '</div><div class="et"><b>' + esc(r.titel) + (r.extra ? ' <span class="mut" style="display:inline;font-weight:500">· ' + esc(r.extra) + "</span>" : "") + "</b>" +
    (metDatum ? "<span>" + esc(langeDatum(dag)) + "</span>" : "") + (r.z ? "<span>" + esc(r.z) + "</span>" : "") + "</div></div>";
}
function actSamenvatting(a) {
  const s = a.data?.summary || {}, sp = sportVanAct(s), m = Number(s.distanceInMeters || 0), v = Number(s.averageSpeedInMetersPerSecond || 0), sec = Number(s.durationInSeconds || 0);
  const bits = [];
  if (sec) bits.push(duur(sec));
  if (m >= 300 && !["squash", "kracht", "padel"].includes(sp)) bits.push(sp === "zwemmen" ? getal(m) + " m" : getal(m / 1000, 1) + " km");
  if (v > 0 && sp === "lopen") { const p = 1000 / v; bits.push(Math.floor(p / 60) + ":" + pad(Math.round(p % 60)) + " /km"); }
  if (v > 0 && sp === "fietsen") bits.push(getal(v * 3.6, 1) + " km/u");
  if (v > 0 && sp === "zwemmen") { const p = 100 / v; bits.push(Math.floor(p / 60) + ":" + pad(Math.round(p % 60)) + " /100m"); }
  if (s.averageHeartRateInBeatsPerMinute) bits.push("♥ " + s.averageHeartRateInBeatsPerMinute);
  return { s, sp, x: SPORT[sp] || SPORT.andere, bits, titel: s.activityName || (SPORT[sp] || SPORT.andere).n };
}
function actEv(a) {
  const r = actSamenvatting(a), an = ana()[a.ref];
  return '<button class="ev" data-go="#sport/' + esc(a.ref) + '"><div class="ic ' + r.x.c + '">' + r.x.e + '</div><div class="et"><b>' + esc(r.titel) + ' <span class="tag t-a lbl">gemeten</span></b><span>' +
    esc(korteDatum(a.day) + " · " + r.bits.join(" · ")) + "</span>" + (an ? '<span style="color:var(--acc)">AI-analyse klaar</span>' : "") + '</div><span class="chev">›</span></button>';
}
function eigenEv(e) {
  const x = SPORT[e.sport] || SPORT.andere;
  return '<button class="ev" data-act="eigen-bewerk" data-id="' + esc(e.id) + '"><div class="ic ' + x.c + '">' + x.e + '</div><div class="et"><b>' + esc(x.n) + ' <span class="tag t-g lbl">eigen invoer</span></b><span>' +
    esc(korteDatum(e.dag) + " · " + e.duur_min + " min" + (e.intensiteit ? " · inspanning " + e.intensiteit + "/10" : "") + (e.notitie ? " · " + e.notitie : "")) + '</span></div><span class="chev">›</span></button>';
}
function spark(punten, kleur, eenheid, fmt) {
  const vals = punten.map((p) => p.v).filter((v) => v != null);
  if (vals.length < 2) return '<p class="empty">Nog te weinig gegevens.</p>';
  const f = fmt || ((x) => getal(x));
  const W = 320, H = 84, lo = Math.min(...vals), hi = Math.max(...vals), sp = hi - lo || 1, n = punten.length;
  const xy = punten.map((p, i) => p.v == null ? null : [8 + (i * (W - 16)) / (n - 1 || 1), 10 + (H - 26) * (1 - (p.v - lo) / sp)]);
  let d = "", pen = false; xy.forEach((q) => { if (!q) { pen = false; return; } d += (pen ? "L" : "M") + q[0].toFixed(1) + " " + q[1].toFixed(1); pen = true; });
  const last = [...xy].reverse().find(Boolean);
  return '<svg class="spark" viewBox="0 0 ' + W + " " + H + '" role="img" aria-label="Verloop"><path d="' + d + '" fill="none" stroke="' + kleur + '" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>' +
    (last ? '<circle cx="' + last[0] + '" cy="' + last[1] + '" r="3.5" fill="' + kleur + '"/>' : "") +
    '<text x="8" y="' + (H - 2) + '" font-size="11" fill="var(--mut)">' + esc(korteDatum(punten[0].d)) + '</text><text x="' + (W - 8) + '" y="' + (H - 2) + '" font-size="11" fill="var(--mut)" text-anchor="end">laag ' + esc(f(lo)) + " · hoog " + esc(f(hi)) + (eenheid ? " " + eenheid : "") + "</text></svg>";
}
function hrGrafiek(a) {
  const hr = a.data?.st?.hr || [], t = a.data?.st?.t || [];
  const pts = hr.map((v, i) => ({ v: typeof v === "number" ? v : null, x: t[i] ?? i })).filter((p) => p.v != null);
  if (pts.length < 5) return "";
  const W = 320, H = 110, lo = Math.min(...pts.map((p) => p.v)) - 5, hi = Math.max(...pts.map((p) => p.v)) + 5, x0 = pts[0].x, x1 = pts[pts.length - 1].x || 1;
  const d = pts.map((p, i) => (i ? "L" : "M") + (8 + ((p.x - x0) / (x1 - x0 || 1)) * (W - 16)).toFixed(1) + " " + (8 + (H - 28) * (1 - (p.v - lo) / (hi - lo))).toFixed(1)).join("");
  return '<div class="card"><div class="ch"><h2>Hartslag</h2><span class="sm mut">' + Math.round(lo + 5) + "–" + Math.round(hi - 5) + ' bpm</span></div><svg class="spark" style="height:110px" viewBox="0 0 ' + W + " " + H + '"><path d="' + d + '" fill="none" stroke="var(--warn)" stroke-width="1.8" stroke-linejoin="round"/><text x="8" y="' + (H - 4) + '" font-size="11" fill="var(--mut)">start</text><text x="' + (W - 8) + '" y="' + (H - 4) + '" font-size="11" fill="var(--mut)" text-anchor="end">' + Math.round(x1) + ' min</text></svg></div>';
}
// gezondheid per dag (gemeten door Garmin)
function gezDag(dag) {
  const o = {};
  for (const r of gez()) if (r.day === dag) {
    const g = r.data || {};
    if (r.kind === "sleep") { if (g.durationInSeconds) o.slaap = g.durationInSeconds; const sc = g.overallSleepScore?.value ?? g.sleepScores?.overall?.value; if (sc != null) o.score = sc; }
    if (r.kind === "hrv" && g.lastNightAvg != null) o.hrv = g.lastNightAvg;
    if (r.kind === "daily" && g.restingHeartRateInBeatsPerMinute != null) o.rp = g.restingHeartRateInBeatsPerMinute;
    if (r.kind === "stress") { if (g.bbMax != null) o.bb = g.bbMax; }
    if (r.kind === "metrics" && g.vo2Max != null) o.vo2 = g.vo2Max;
  }
  return o;
}
function reeks(veld, n = 14) { const out = []; for (let i = n - 1; i >= 0; i--) { const d = plusDag(vandaag(), -i); out.push({ d, v: gezDag(d)[veld] ?? null }); } return out; }
function herstelGrid(g) {
  return '<div class="grid">' +
    (g.slaap ? '<div class="met"><div class="l">Slaap</div><div class="v">' + duur(g.slaap) + (g.score != null ? " <small>score " + g.score + "</small>" : "") + "</div></div>" : "") +
    (g.hrv != null ? '<div class="met"><div class="l">HRV</div><div class="v">' + g.hrv + " <small>ms</small></div></div>" : "") +
    (g.rp != null ? '<div class="met"><div class="l">Rustpols</div><div class="v">' + g.rp + " <small>bpm</small></div></div>" : "") +
    (g.bb != null ? '<div class="met"><div class="l">Body Battery</div><div class="v">' + g.bb + "</div></div>" : "") + "</div>";
}

/* ---------- gevoelscheck (eigen invoer) ---------- */
function gevoelKaart(compact) {
  const d = vandaag(), g = dat("gevoel", []).find((x) => x.dag === d);
  if (st("gevoel") === "fout" && !D.gevoel?.data) return '<div class="card"><div class="ch"><h2>Hoe voel je je?</h2></div>' + actualiteit("gevoel") + "</div>";
  const knoppen = (veld, label, laag, hoog) => '<div class="gv"><span class="sm mut">' + label + '</span><div class="seg5">' + [1, 2, 3, 4, 5].map((n) => '<button data-act="gevoel" data-veld="' + veld + '" data-n="' + n + '" class="' + (g && g[veld] === n ? "on" : "") + '" aria-label="' + label + " " + n + '">' + n + "</button>").join("") + '</div><span class="sm mut gvl"><i>' + laag + "</i><i>" + hoog + "</i></span></div>";
  return '<div class="card"><div class="ch"><h2>Hoe voel je je?</h2><span class="tag t-g">eigen invoer</span></div>' +
    knoppen("energie", "Energie", "laag", "hoog") + knoppen("vermoeidheid", "Vermoeidheid", "fris", "erg moe") +
    '<label class="field" style="margin-top:8px"><span>Klachten (optioneel)</span><input id="gvKlacht" maxlength="500" value="' + esc(g?.klachten || "") + '" placeholder="bv. stijve kuit" autocomplete="off"></label>' +
    '<p class="src">' + (g ? "Ingevuld " + esc(sinds(g.updated_at)) + "." : "Nog niet ingevuld vandaag.") + " Dit is je eigen gevoel, geen meting en geen medisch oordeel." + (compact ? "" : " Bij aanhoudende klachten: neem rust of raadpleeg een arts.") + "</p></div>";
}
