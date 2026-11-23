/* AD Omniserve – sport: schema uit Legati, metingen van Garmin, eigen invoer (padel), gepland vs uitgevoerd, doelen, gevoelscheck.
   Onderscheid overal: "gemeten" (Garmin), "eigen invoer" (jij) en "AI-interpretatie". */
"use strict";
let SPORTDAG = null;
SCHERMEN.sport = function () {
  const d = vandaag(); SPORTDAG = SPORTDAG || d;
  const ma = maandagVan(SPORTDAG), zo = plusDag(ma, 6), P = plan(), A = acts(), E = dat("eigen", []), G = gedaan();
  let h = kop("Sport", "Train slim. Herstel goed.") + alerts();
  // vandaag: geplande training + wat al gedaan is
  const vp = P[d], vr = planRegel(vp), vA = A.filter((a) => a.day === d);
  h += '<div class="card"><span class="badge">Vandaag</span>' + blok("plan", vp ? '<div class="hero"><span class="hi">' + vr.x.e + "</span><span><b>" + esc(vr.titel) + "</b><span>" + esc([vr.x.n, vr.extra, vr.z].filter(Boolean).join(" · ")) + "</span></span></div>" : "", "Niets gepland vandaag in Legati.") +
    (vA.length ? '<button class="btn" data-go="#sport/' + esc(vA[0].ref) + '">Training bekijken ›</button>' : vp ? '<p class="src">Nog geen gemeten training vandaag.</p>' : "") + "</div>";
  // herstel en gevoel als tegels
  const g = gezDag(d), gv = dat("gevoel", []).find((x) => x.dag === d), tegels = [];
  if (g.slaap) tegels.push(["🛏", "Slaap", duur(g.slaap)]);
  if (g.hrv != null) tegels.push(["〰", "HRV", g.hrv + " ms"]);
  if (g.rp != null) tegels.push(["♡", "Rustpols", g.rp + " bpm"]);
  if (gv?.energie) tegels.push(["⚡", "Energie", gv.energie + "/5"]);
  if (tegels.length) h += '<div class="tiles">' + tegels.map(([i, l, v]) => '<div class="met tile"><span class="ti">' + i + '</span><span><span class="l" style="font-size:12px;color:var(--mut);display:block">' + l + '</span><b style="font-size:19px">' + v + "</b></span></div>").join("") + "</div>" +
    '<p class="src" style="margin:-4px 0 12px">Slaap, HRV en rustpols gemeten door Garmin' + (gv?.energie ? "; energie is je eigen invoer" : "") + ".</p>";
  // deze week per sport
  const wt0 = R.weekTotalen(G, ma, zo);
  h += '<div class="card"><div class="ch"><h2>Deze week</h2><span class="sm mut">' + esc(korteDatum(ma)) + " – " + esc(korteDatum(zo)) + "</span></div>" +
    blok(["garmin", "eigen"], wt0.map((x) => '<div class="row"><span style="color:var(--ink)">' + (SPORT[x.sport] || SPORT.andere).e + " " + esc((SPORT[x.sport] || SPORT.andere).n) + ' <span class="sm mut">' + x.n + "×</span></span><b>" + duur(x.min * 60) +
      (x.minEigen && x.minGarmin ? '<span class="sm mut" style="display:block;font-weight:500">' + duur(x.minGarmin * 60) + " gemeten · " + duur(x.minEigen * 60) + " eigen</span>" : x.minEigen ? '<span class="sm mut" style="display:block;font-weight:500">eigen invoer</span>' : "") + "</b></div>").join(""), "Nog geen trainingen deze week.") + "</div>";
  // volgend doel
  const volgend = dat("doelen", []).filter((x) => x.status === "actief" && x.streefdatum && x.streefdatum >= d).sort((a, b) => a.streefdatum.localeCompare(b.streefdatum))[0];
  if (volgend) { const n = Math.round((new Date(volgend.streefdatum + "T12:00:00") - new Date(d + "T12:00:00")) / 864e5);
    h += '<button class="card" style="display:block;width:100%;text-align:left;color:inherit;cursor:pointer" data-act="doel-bewerk" data-id="' + esc(volgend.id) + '"><span class="sm mut">Volgend doel</span><b style="display:block;font-size:19px;margin:2px 0">' + esc(volgend.titel) + '</b><span class="sm mut">' + (n === 0 ? "Vandaag" : n < 14 ? "Nog " + n + " dagen" : "Nog " + Math.round(n / 7) + " weken") + " · " + esc(langeDatum(volgend.streefdatum)) + "</span></button>"; }
  h += '<div class="grid" style="margin-bottom:12px"><button class="btn btn-out" style="margin:0" data-act="eigen-nieuw" data-sport="padel">+ Padel toevoegen</button><button class="btn btn-out" style="margin:0" data-act="eigen-nieuw" data-sport="andere">+ Andere training</button></div>';
  // week: dagstrook + dag
  h += '<div class="card"><div class="ch"><h2>Week van ' + esc(korteDatum(ma)) + '</h2><span><button class="lnk" data-week="-7" aria-label="Vorige week">‹</button> <button class="lnk" data-week="7" aria-label="Volgende week">›</button></span></div><div class="week">';
  for (let i = 0; i < 7; i++) {
    const dd = plusDag(ma, i), p = P[dd], has = G.some((a) => a.dag === dd), kl = p ? `var(--${{ lopen: "sport", fietsen: "work", zwemmen: "acc", rust: "line" }[sportVanPlan(p)] || "priv"})` : "transparent";
    h += '<button class="wd' + (dd === SPORTDAG ? " on" : "") + '" data-dag="' + dd + '">' + "mdwdvzz"[i].toUpperCase() + "<b>" + Number(dd.slice(8)) + '</b><i style="background:' + (has ? "var(--ink)" : kl) + '"></i></button>';
  }
  h += "</div>";
  const p = P[SPORTDAG], dA = A.filter((a) => a.day === SPORTDAG), dE = E.filter((e) => e.dag === SPORTDAG);
  h += '<p class="sm mut" style="margin-bottom:8px">' + esc(langeDatum(SPORTDAG)) + "</p>";
  h += blok("plan", p ? planEv(SPORTDAG, p) : "", "Niets gepland.");
  if (dA.length || dE.length) h += '<div style="margin-top:8px">' + dA.map(actEv).join("") + dE.map(eigenEv).join("") + "</div>";
  const wn = weeknote()[ma]; if (wn) h += '<p class="src">Weeknotitie uit Legati: ' + esc(wn) + "</p>";
  h += "</div>";

  // gepland vs uitgevoerd
  const k = R.koppelPlan(P, G, dat("match", []), ma, zo);
  const gedaanN = k.filter((x) => x.status === "gedaan").length;
  h += '<div class="card"><div class="ch"><h2>Gepland en uitgevoerd</h2><span class="sm mut">' + gedaanN + " van " + k.length + "</span></div>" +
    blok(["plan", "garmin", "eigen", "match"], k.map((x) => {
      const r = planRegel(x.plan), toek = x.dag > d;
      const status = x.status === "gedaan" ? '<span class="tag t-a">✓ uitgevoerd</span>' : x.status === "niet" ? '<span class="tag t-warn">niet uitgevoerd</span>' : toek ? '<span class="tag t-g">gepland</span>' : x.status === "onbekend" ? '<span class="tag t-warn">training niet gevonden</span>' : '<span class="tag t-g">geen match</span>';
      const actTekst = x.act ? (SPORT[x.act.sport] || SPORT.andere).n + " · " + x.act.min + " min · " + (x.act.bron === "garmin" ? "gemeten" : "eigen invoer") : "";
      return '<button class="ev" data-act="match" data-dag="' + x.dag + '"><div class="ic ' + r.x.c + '">' + r.x.e + '</div><div class="et"><b>' + esc(r.titel) + " " + status + "</b><span>" + esc(dagLabel(x.dag) + (actTekst ? " · " + actTekst : "")) + (x.gecorrigeerd ? " · met de hand" : "") + '</span></div><span class="chev">›</span></button>';
    }).join(""), "Geen trainingen gepland deze week.") + '<p class="src">Automatisch gekoppeld op dag en sport. Klopt een koppeling niet? Tik erop om ze te corrigeren.</p></div>';

  // doelen en evenementen
  const doelen = dat("doelen", []).filter((x) => x.status === "actief");
  h += '<div class="card"><div class="ch"><h2>Doelen en evenementen</h2><button class="lnk" data-act="doel-nieuw">+ Nieuw</button></div>' +
    blok("doelen", doelen.map(doelRij).join(""), "Nog geen doelen. Voeg een wedstrijd of doel toe met een streefdatum.") + "</div>";

  // gevoel
  h += gevoelKaart(false);

  // herstel trends (gemeten)
  h += '<div class="card"><div class="ch"><h2>Herstel, 14 dagen</h2><span class="tag t-a">gemeten</span></div><p class="sm mut">HRV (ms)</p>' + spark(reeks("hrv"), "var(--acc)", "ms") +
    '<p class="sm mut" style="margin-top:8px">Rustpols (bpm)</p>' + spark(reeks("rp"), "var(--warn)", "bpm") +
    '<p class="sm mut" style="margin-top:8px">Slaap (uren)</p>' + spark(reeks("slaap").map((q) => ({ d: q.d, v: q.v == null ? null : Math.round(q.v / 360) / 10 })), "var(--work)", "u", (x) => getal(x, 1));
  const gvl = dat("gevoel", []).slice().reverse();
  if (gvl.length >= 2) h += '<p class="sm mut" style="margin-top:8px">Energie (eigen invoer, 1–5)</p>' + spark(Array.from({ length: 14 }, (_, i) => { const dd = plusDag(d, i - 13); return { d: dd, v: gvl.find((x) => x.dag === dd)?.energie ?? null }; }), "var(--gold)", "");
  const vo2 = gez().find((r) => r.kind === "metrics" && r.data?.vo2Max != null);
  if (vo2) h += '<p class="src">VO2max volgens Garmin: <b style="color:var(--ink)">' + getal(vo2.data.vo2Max, 1) + "</b> (" + esc(korteDatum(vo2.day)) + ")</p>";
  h += actualiteit("garmin", "Garmin via Legati") + "</div>";

  // trainingen
  const lijst = A.map((a) => ({ dag: a.day, html: actEv(a) })).concat(E.map((e) => ({ dag: e.dag, html: eigenEv(e) }))).sort((a, b) => b.dag.localeCompare(a.dag)).slice(0, 40);
  h += '<div class="card"><div class="ch"><h2>Trainingen</h2><span class="sm mut">laatste 60 dagen</span></div>' + blok(["garmin", "eigen"], lijst.map((x) => x.html).join(""), "Nog geen trainingen binnen.") + "</div>";
  // komende trainingen
  const kom = Object.keys(P).filter((x) => x > d && x <= plusDag(d, 10)).sort();
  h += '<div class="card"><div class="ch"><h2>Komende trainingen</h2></div>' + blok("plan", kom.map((x) => planEv(x, P[x], true)).join(""), "Nog niets gepland voor de komende dagen. Plan je trainingen in de Legati-app; ze komen hier binnen een kwartier.") + actualiteit("plan", "Legati") + "</div>";
  h += '<p class="src" style="text-align:center">Trainingen plan je in de Legati-app. Niemand van de ploeg ziet deze app. Geen medisch advies.</p>';
  return h;
};
function doelRij(x) {
  const dagen = x.streefdatum ? Math.round((new Date(x.streefdatum + "T12:00:00") - new Date(vandaag() + "T12:00:00")) / 864e5) : null;
  const sp = SPORT[x.sport] || SPORT.andere;
  return '<button class="ev" data-act="doel-bewerk" data-id="' + esc(x.id) + '"><div class="ic ' + sp.c + '">' + (x.soort === "evenement" ? "🏁" : sp.e) + '</div><div class="et"><b>' + esc(x.titel) + "</b><span>" +
    esc([x.streefdatum ? langeDatum(x.streefdatum) : "geen datum", dagen != null ? (dagen > 0 ? "nog " + dagen + " dagen" : dagen === 0 ? "vandaag" : Math.abs(dagen) + " dagen geleden") : ""].filter(Boolean).join(" · ")) + "</span>" +
    (x.voortgang != null ? '<div class="bar"><i style="width:' + x.voortgang + '%"></i></div><span>voortgang ' + x.voortgang + "% (eigen inschatting)</span>" : "") + '</div><span class="chev">›</span></button>';
}

SCHERMEN["sport/"] = function (ref) {
  const a = acts().find((x) => x.ref === ref);
  if (!a) return kop("Training", "", ["#sport", "Sport"]) + '<div class="card">' + blok("garmin", "", "Deze training staat er (nog) niet in.") + '<a class="btn btn2" href="#sport" style="text-decoration:none">Terug naar Sport</a></div>';
  const r = actSamenvatting(a), s = r.s, an = ana()[ref], p = plan()[a.day];
  let h = kop(r.titel, langeDatum(a.day) + " · " + r.x.n, ["#sport", "Sport"]);
  const m = [];
  if (s.durationInSeconds) m.push(["Duur", duur(s.durationInSeconds)]);
  if (Number(s.distanceInMeters) >= 300 && !["squash", "kracht", "padel"].includes(r.sp)) m.push(["Afstand", r.sp === "zwemmen" ? getal(s.distanceInMeters) + " <small>m</small>" : getal(s.distanceInMeters / 1000, 2) + " <small>km</small>"]);
  const v = Number(s.averageSpeedInMetersPerSecond || 0);
  if (v > 0 && r.sp === "lopen") { const q = 1000 / v; m.push(["Tempo", Math.floor(q / 60) + ":" + pad(Math.round(q % 60)) + " <small>/km</small>"]); }
  if (v > 0 && r.sp === "fietsen") m.push(["Snelheid", getal(v * 3.6, 1) + " <small>km/u</small>"]);
  if (v > 0 && r.sp === "zwemmen") { const q = 100 / v; m.push(["Tempo", Math.floor(q / 60) + ":" + pad(Math.round(q % 60)) + " <small>/100m</small>"]); }
  if (s.averageHeartRateInBeatsPerMinute) m.push(["Hartslag gem.", s.averageHeartRateInBeatsPerMinute + " <small>bpm</small>"]);
  if (s.maxHeartRateInBeatsPerMinute) m.push(["Hartslag max.", s.maxHeartRateInBeatsPerMinute + " <small>bpm</small>"]);
  if (s.averagePowerInWatts) m.push(["Vermogen gem.", s.averagePowerInWatts + " <small>W</small>"]);
  if (s.totalElevationGainInMeters) m.push(["Hoogtemeters", Math.round(s.totalElevationGainInMeters) + " <small>m</small>"]);
  h += '<div class="card"><div class="ch"><h2>Metingen</h2><span class="tag t-a">gemeten door Garmin</span></div><div class="grid">' + m.map(([l, x]) => '<div class="met"><div class="l">' + l + '</div><div class="v">' + x + "</div></div>").join("") + "</div>" +
    (p ? '<p class="src">Gepland: ' + esc(planRegel(p).titel) + (planRegel(p).extra ? " · " + esc(planRegel(p).extra) : "") + "</p>" : '<p class="src">Niets gepland op deze dag.</p>') + "</div>";
  h += '<div class="card ana"><div class="ch"><h2>Analyse</h2><span class="tag t-g">AI-interpretatie</span></div>' +
    (an ? tekstAlinea(an.tekst) + '<p class="src">Geschreven door AI ' + esc(sinds(an.created_at)) + " op basis van bovenstaande metingen. Kan fouten bevatten; geen medisch advies.</p>" : '<p class="empty">' + (S.aiFout === "geen_sleutel" ? "De AI staat nog niet aan: de Anthropic-sleutel moet nog in Supabase gezet worden (zie Instellingen)." : "Nog geen analyse voor deze training.") + "</p>") +
    '<button class="btn btn2" id="heranalyse" data-ref="' + esc(ref) + '">' + (an ? "Opnieuw analyseren" : "Analyse maken") + '</button><p class="msg" id="anaMsg"></p></div>';
  h += hrGrafiek(a);
  return h;
};
TAB_VAN["sport/"] = "sport";

/* ---------- invoer ---------- */
const SPORTKEUZE = ["padel", "lopen", "fietsen", "zwemmen", "kracht", "wandelen", "squash", "andere"].map((k) => [k, SPORT[k].n]);
function openEigen(e, sport) {
  openForm({
    titel: e ? "Eigen training" : (sport === "padel" ? "Padel registreren" : "Training registreren"), geenFocus: true,
    waarden: e || { dag: vandaag(), sport: sport || "andere", duur_min: sport === "padel" ? 90 : 60, intensiteit: null },
    spec: [{ k: "sport", l: "Sport", t: "sel", o: SPORTKEUZE }, { k: "dag", l: "Datum", t: "date", req: true }, { k: "duur_min", l: "Duur (minuten)", t: "num", req: true, min: 1, maxv: 1440, step: 1 },
      { k: "intensiteit", l: "Ervaren inspanning (1 heel licht – 10 maximaal)", t: "seg", num: true, leeg: true, o: Array.from({ length: 10 }, (_, i) => [String(i + 1), String(i + 1)]) },
      { k: "notitie", l: "Notitie", t: "area", max: 1000, ph: "bv. dubbel, 3 sets, linkerknie voelde stijf" }],
    extra: '<p class="src">Eigen invoer: niet gemeten. Komt in je weekoverzicht en (als je de assistent iets vraagt) bij de sportassistent.</p>',
    opslaan: async (o) => { if (!(o.duur_min >= 1 && o.duur_min <= 1440)) throw new Error("De duur moet tussen 1 en 1440 minuten liggen."); await opslaanRij("sport_invoer", { dag: o.dag, sport: o.sport, duur_min: Math.round(o.duur_min), intensiteit: o.intensiteit, notitie: o.notitie }, e?.id); await herlaad("eigen"); },
    verwijderen: e ? async () => { await verwijderRij("sport_invoer", e.id); await herlaad("eigen"); } : null,
  });
}
function openDoel(x) {
  openForm({
    titel: x ? "Doel" : "Nieuw doel of evenement", waarden: x || { soort: "evenement", sport: "triatlon", status: "actief" }, geenFocus: !!x,
    spec: [{ k: "titel", l: "Titel", req: true, max: 120, ph: "bv. Triatlon Brugge (olympisch)" }, { k: "soort", l: "Soort", t: "seg", o: [["evenement", "Evenement"], ["doel", "Doel"]] },
      { k: "sport", l: "Sport", t: "sel", o: ["triatlon", "padel", "lopen", "fietsen", "zwemmen", "kracht", "wandelen", "squash", "andere"].map((k) => [k, SPORT[k].n]) },
      { k: "streefdatum", l: "Streefdatum", t: "date" }, { k: "voortgang", l: "Voortgang in % (eigen inschatting, optioneel)", t: "num", min: 0, maxv: 100, step: 1 },
      { k: "status", l: "Status", t: "seg", o: [["actief", "Actief"], ["gehaald", "Gehaald"], ["gestopt", "Gestopt"]] }, { k: "notitie", l: "Notitie", t: "area", max: 2000 }],
    opslaan: async (o) => { if (o.voortgang != null && (o.voortgang < 0 || o.voortgang > 100)) throw new Error("Voortgang tussen 0 en 100."); await opslaanRij("doelen", { ...o, voortgang: o.voortgang == null ? null : Math.round(o.voortgang) }, x?.id); await herlaad("doelen"); },
    verwijderen: x ? async () => { await verwijderRij("doelen", x.id); await herlaad("doelen"); } : null,
  });
}
// gepland <-> uitgevoerd corrigeren
function openMatch(dag) {
  const p = plan()[dag]; if (!p) return;
  const r = planRegel(p), kand = gedaan().filter((x) => x.dag >= plusDag(dag, -1) && x.dag <= plusDag(dag, 1)), huidig = dat("match", []).find((m) => m.dag === dag);
  const opt = (w, l, sub, on) => '<label class="kies"><input type="radio" name="match" value="' + esc(w) + '"' + (on ? " checked" : "") + "><span><b>" + esc(l) + "</b><i>" + esc(sub) + "</i></span></label>";
  $("sheet").innerHTML = '<div class="sheet" role="dialog" aria-label="Koppeling corrigeren"><header><button class="lnk" data-act="sheetdicht">Annuleren</button><b>Koppeling</b><button class="lnk" data-act="match-ok" data-dag="' + dag + '" style="font-weight:650">Bewaar</button></header><div class="sheetbody">' +
    '<p class="sm mut" style="margin-bottom:10px">Gepland op ' + esc(langeDatum(dag)) + ": <b style=\"color:var(--ink)\">" + esc(r.titel) + "</b></p>" +
    opt("auto", "Automatisch", "op dag en sport", !huidig) + opt("niet", "Niet uitgevoerd", "telt als gemist", huidig?.status === "niet_uitgevoerd") +
    kand.map((x) => opt(x.ref, (SPORT[x.sport] || SPORT.andere).n + " · " + x.min + " min", dagLabel(x.dag) + " · " + (x.bron === "garmin" ? "gemeten" : "eigen invoer") + (x.titel ? " · " + x.titel : ""), huidig?.act_ref === x.ref)).join("") +
    (kand.length ? "" : '<p class="empty" style="margin-top:8px">Geen trainingen rond deze dag gevonden.</p>') + '<p class="msg" id="matchMsg"></p><button class="btn" data-act="match-ok" data-dag="' + dag + '">Bewaar</button></div></div>';
  document.body.style.overflow = "hidden";
}
async function bewaarMatch(dag) {
  const k = document.querySelector('input[name="match"]:checked')?.value || "auto", m = $("matchMsg");
  const r = k === "auto" ? await sb.from("plan_match").delete().eq("dag", dag).eq("user_id", S.user.id)
    : await sb.from("plan_match").upsert({ user_id: S.user.id, dag, status: k === "niet" ? "niet_uitgevoerd" : "match", act_ref: k === "niet" ? null : k });
  if (r.error) { m.textContent = "Bewaren lukte niet: " + vertaalDbFout(r.error); return; }
  await herlaad("match"); sluitSheet();
}
async function bewaarGevoel(veld, n) {
  const d = vandaag(), g = dat("gevoel", []).find((x) => x.dag === d) || {};
  const rij = { user_id: S.user.id, dag: d, energie: g.energie ?? null, vermoeidheid: g.vermoeidheid ?? null, klachten: ($("gvKlacht")?.value ?? g.klachten ?? "").slice(0, 500) };
  if (veld) rij[veld] = n;
  const r = await sb.from("gevoel").upsert(rij);
  if (r.error) { alert("Bewaren lukte niet: " + vertaalDbFout(r.error)); return; }
  await herlaad("gevoel");
}
