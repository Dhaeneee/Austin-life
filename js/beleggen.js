/* AD Omniserve – beleggen (ALLEEN LEZEN). Vermogen en resultaat apart; stortingen tellen nooit als rendement. */
"use strict";
const SAXOFOUT = { niet_ingesteld: "Saxo is nog niet ingesteld: de App Key of de App Secret ontbreekt.", verlopen: "Je Saxo-aanmelding is verlopen. Koppel opnieuw.", net: "Geen verbinding.", niet_geinstalleerd: "De Saxo-functie staat nog niet op de server." };
const SOORTNAAM = { storting: "Stortingen", opname: "Opnames", dividend: "Dividenden", kosten: "Kosten", rente: "Rente", belasting: "Belastingen", transactie: "Aan- en verkopen", overig: "Niet ingedeeld" };

SCHERMEN.beleggen = function () {
  let h = kop("Beleggen", "Grip op je portefeuille · alleen lezen") + alerts();
  h += saxoKaart();
  const x = dat("saxo"), s = dat("stand"), bk = dat("saxoBoek", []), hist = dat("saxoHist", []);
  const env = s?.env || x?.env;

  // vermogensontwikkeling (waarde over de tijd: bevat ook je stortingen)
  const hh = hist.filter((r) => !env || r.env === env);
  h += '<div class="card"><div class="ch"><h2>Vermogensontwikkeling</h2><span class="tag t-a">uit Saxo</span></div>' +
    blok("saxoHist", hh.length >= 2 ? (verberg() ? '<p class="empty">Bedragen verborgen.</p>' : spark(hh.map((r) => ({ d: r.dag, v: r.totaal == null ? null : Number(r.totaal) })), "var(--acc)", hh[hh.length - 1].munt || "", (v) => getal(v))) +
      '<p class="src">Totale waarde per dag, van ' + esc(korteDatum(hh[0].dag)) + " tot " + esc(korteDatum(hh[hh.length - 1].dag)) + " (" + hh.length + " dagstanden). Dit is je vermogen, inclusief je eigen stortingen: een stijging is dus niet automatisch rendement.</p>" : "",
      x?.gekoppeld ? "Nog te weinig dagstanden. De app bewaart vanaf nu elke dag de stand; na twee dagen verschijnt hier een verloop." : "Komt zodra Saxo gekoppeld is.") + "</div>";

  // beleggingsresultaat
  const r = R.beleggingsResultaat(s, bk, x);
  h += '<div class="card"><div class="ch"><h2>Beleggingsresultaat</h2></div>';
  if (st("saxoBoek") === "fout" || st("saxo") === "fout") h += actualiteit(["saxoBoek", "saxo"]);
  else if (r.ok) {
    h += '<div class="grid"><div class="met"><div class="l">Resultaat</div><div class="v" style="color:' + (r.resultaat >= 0 ? "var(--acc)" : "var(--warn)") + '">' + (r.resultaat >= 0 ? "+" : "") + bedrag(r.resultaat) + " <small>" + esc(r.munt || "") + '</small></div></div><div class="met"><div class="l">Op netto inleg</div><div class="v">' + (r.pct == null || verberg() ? "–" : (r.pct >= 0 ? "+" : "") + getal(r.pct * 100, 1) + " %") + "</div></div></div>" +
      '<div class="row" style="margin-top:8px"><span>Huidige waarde</span><b>' + bedrag(r.waarde, r.munt) + '</b></div><div class="row"><span>Stortingen</span><b>' + bedrag(r.stortingen, r.munt) + '</b></div><div class="row"><span>Opnames</span><b>− ' + bedrag(r.opnames, r.munt) + '</b></div><div class="row"><span>Netto inleg</span><b>' + bedrag(r.netto, r.munt) + "</b></div>" +
      '<p class="src"><b>Methode:</b> ' + esc(r.methode) + " <b>Valuta:</b> " + esc(r.munt) + ". <b>Periode:</b> " + esc(korteDatum(r.van)) + " tot " + esc(korteDatum(r.tot)) + ". Kosten, dividenden en belastingen zitten al in de waarde." + (env !== "live" ? " Dit is de testomgeving (nepgeld)." : "") + (r.overig.length ? " Niet ingedeelde boekingstypes: " + esc(r.overig.join(", ")) + "; als daar stortingen tussen zitten, klopt het resultaat niet." : "") + "</p>";
  } else {
    h += '<p class="empty">Nog niet berekend, want de gegevens volstaan niet. Er ontbreekt:</p><ul class="lijst">' + r.ontbreekt.map((t) => "<li>" + esc(t) + "</li>").join("") + "</ul>" +
      '<p class="src">De app berekent pas een resultaat als de volledige historiek van stortingen en opnames bekend is. Zo telt een extra storting nooit als rendement.</p>';
  }
  h += "</div>";

  // historiek per soort
  const bkEnv = bk.filter((b) => !env || b.env === env);
  if (bkEnv.length || x?.boekingen_ok || x?.boekingen_fout) {
    const per = {};
    for (const b of bkEnv) { const p = (per[b.soort] = per[b.soort] || { n: 0, som: 0 }); p.n++; p.som += Number(b.bedrag) || 0; }
    h += '<div class="card"><div class="ch"><h2>Stortingen, kosten en dividenden</h2><span class="tag t-a">uit Saxo</span></div>' +
      (Object.keys(per).length ? ["storting", "opname", "dividend", "kosten", "belasting", "rente", "overig"].filter((k) => per[k]).map((k) => '<div class="row"><span>' + SOORTNAAM[k] + ' <span class="sm mut">' + per[k].n + "×</span></span><b>" + bedrag(per[k].som, s?.data?.munt) + "</b></div>").join("") : '<p class="empty">Geen boekingen gevonden.</p>') +
      '<button class="lnk" data-go="#beleggen/historiek" style="margin-top:10px">Alle boekingen</button>' +
      '<p class="src">' + (x?.boekingen_fout ? "⚠️ Laatste ophaling mislukt: " + esc(x.boekingen_fout) + ". " : "") + (x?.boekingen_ok ? "Opgehaald " + esc(sinds(x.boekingen_ok)) + ", vanaf " + esc(korteDatum(x.boekingen_van)) + ". " : "") + "Indeling volgens het boekingstype dat Saxo meegeeft; wat de app niet herkent, staat bij \"Niet ingedeeld\".</p></div>";
  }

  // inlegplan
  const il = R.inleg(inst());
  h += '<div class="card"><div class="ch"><h2>Mijn inlegplan</h2></div><div class="row"><span>Wekelijks</span><b>' + euro(il.week) + '</b></div><div class="row"><span>Maandelijks extra</span><b>' + euro(il.maand) + '</b></div><div class="row"><span>Per maand gemiddeld</span><b>' + euro(il.perMaand) + '</b></div><div class="row"><span>Per jaar</span><b>' + euro(il.jaar) + "</b></div>" +
    '<p class="src">Je vaste bedragen, zonder rendement. ' + (dat("inst")?.data?.inleg_week == null ? "Standaard €25 per week en €90 per maand; pas aan als dat niet meer klopt." : "Ingesteld door jou.") + '</p><button class="btn btn-out" data-act="inleg">✎ Aanpassen</button></div>';

  const b = dat("belegger");
  h += '<div class="card"><div class="ch"><h2>Beleggersprofiel</h2>' + (b?.profiel ? '<span class="sm mut">' + esc(sinds(b.updated_at)) + "</span>" : "") + "</div>" +
    (b?.profiel ? '<div class="big" style="text-transform:capitalize">' + esc(b.profiel) + "</div>" + (b.antwoorden?._uitleg ? '<p class="sm mut" style="margin-top:6px">' + esc(b.antwoorden._uitleg) + "</p>" : "") + '<button class="btn btn2" data-go="#vragenlijst">Vragenlijst opnieuw doen</button>'
      : blok("belegger", "", 'Met 8 korte vragen bepaal je je profiel: hoe lang je belegt, hoeveel schommeling je aankan en wat je doel is.') + '<button class="btn" data-go="#vragenlijst">Vragenlijst starten</button>') +
    '<p class="src">Hulpmiddel om keuzes te kaderen, geen persoonlijk beleggingsadvies.</p></div>';
  return h;
};
TAB_VAN.beleggen = "beleggen";

SCHERMEN["beleggen/historiek"] = function () {
  const s = dat("stand"), env = s?.env || dat("saxo")?.env, bk = dat("saxoBoek", []).filter((b) => !env || b.env === env).slice().reverse();
  let h = kop("Boekingen", "Uit Saxo, alleen lezen", ["#beleggen", "Beleggen"]);
  h += '<div class="card">' + blok("saxoBoek", bk.slice(0, 300).map((b) => '<div class="row"><span style="color:var(--ink);min-width:0"><b style="display:block;font-size:15px;text-align:left">' + esc(SOORTNAAM[b.soort] || b.soort) + '</b><span class="sm mut">' + esc([korteDatum(b.datum), b.type_saxo, b.instrument].filter(Boolean).join(" · ")) + "</span></span><b>" + bedrag(b.bedrag, b.munt) + "</b></div>").join(""), "Nog geen boekingen opgehaald.") +
    (bk.length > 300 ? '<p class="src">De oudste ' + (bk.length - 300) + " staan in je export.</p>" : "") + actualiteit("saxoBoek") + "</div>";
  return h;
};
TAB_VAN["beleggen/historiek"] = "beleggen";

function saxoKaart() {
  const x = dat("saxo") || {}, s = dat("stand"), d = s?.data, melding = S.saxoMelding ? '<div class="alert ' + (S.saxoMelding.ok ? "a-ok" : "a-warn") + '"><span>' + esc(S.saxoMelding.t) + "</span></div>" : "";
  if (st("saxo") === "laden" && !D.saxo?.tijd) return '<div class="card"><div class="ch"><h2>Saxo Bank</h2></div><p class="empty"><span class="spin"></span> Laden…</p></div>';
  if (st("saxo") === "fout") return '<div class="card"><div class="ch"><h2>Saxo Bank</h2></div>' + actualiteit("saxo") + "</div>";
  if (!x.gekoppeld) {
    const kan = x.app_sim || x.app_live;
    return '<div class="card"><div class="ch"><h2>Saxo Bank</h2><span class="tag t-g">Niet gekoppeld</span></div>' + melding +
      '<p class="empty">Na het koppelen zie je hier je posities, je cash en je resultaat, rechtstreeks uit je Saxo-rekening en alleen lezen. Je logt in op de pagina van Saxo zelf: je wachtwoord komt nooit in deze app. Tot dan staan hier geen bedragen.</p>' +
      (x.app_sim ? '<button class="btn" data-act="saxo-sim">Koppel Saxo (testomgeving)</button>' : "") +
      (x.app_live ? '<button class="btn' + (x.app_sim ? " btn2" : "") + '" data-act="saxo-live">Koppel Saxo (echte rekening)</button>' : "") +
      (kan ? "" : '<p class="src">Eerst moet de app bij Saxo geregistreerd zijn (App Key en App Secret). Zie de configuratiestappen.</p>') + '<p class="msg" id="saxoMsg"></p></div>';
  }
  const omg = '<span class="tag ' + (x.env === "live" ? "t-a" : "t-g") + '">' + (x.env === "live" ? "Saxo · echte rekening" : "Saxo · testomgeving") + "</span>";
  let h = '<div class="card"><div class="ch"><span class="sm mut">Totale portefeuille</span>' + omg + "</div>" + melding;
  if (!d) h += '<p class="empty">Gekoppeld. De eerste gegevens worden opgehaald.</p>';
  else {
    const r = R.beleggingsResultaat(s, dat("saxoBoek", []), x);
    h += '<div class="big" style="font-size:34px">' + (verberg() ? "€ •••" : "€ " + bedrag(d.totaal).replace(/ [A-Z]{3}$/, "")) + (d.munt && d.munt !== "EUR" ? " <small>" + esc(d.munt) + "</small>" : "") + "</div>" +
      '<div class="grid" style="margin-top:12px"><div class="met"><div class="l">Eigen inleg</div><div class="v" style="font-size:20px">' + (r.ok ? "€ " + bedrag(r.netto) : "<small>onbekend</small>") + '</div></div><div class="met"><div class="l">Resultaat</div><div class="v" style="font-size:20px;color:' + (r.ok ? (r.resultaat >= 0 ? "var(--acc)" : "var(--warn)") : "var(--mut)") + '">' + (r.ok ? (r.resultaat >= 0 ? "+€ " : "−€ ") + bedrag(Math.abs(r.resultaat)) : "<small>niet berekend</small>") + "</div></div></div>" +
      '<p class="src">Inleg en resultaat apart weergegeven' + (r.ok ? "" : ": het resultaat verschijnt zodra alle stortingen bekend zijn (zie hieronder)") + ". Opgehaald " + esc(sinds(s.opgehaald)) + ", elk kwartier vernieuwd." + (x.env !== "live" ? " Testomgeving met nepgeld." : "") + "</p></div>";
    const pos = d.posities || [];
    h += '<div class="card"><div class="ch"><h2>Mijn posities</h2></div>' + (pos.length ? pos.map((p) => '<div class="row"><span style="color:var(--ink);min-width:0"><b style="display:block;font-size:15px;font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;text-align:left">' + esc(p.naam) + '</b><span class="sm mut">' +
      esc([p.aantal != null ? getal(p.aantal, p.aantal % 1 ? 2 : 0) + " stuks" : "", p.koers != null && !verberg() ? "koers " + bedrag(p.koers, p.munt) : ""].filter(Boolean).join(" · ")) + "</span></span><b style='white-space:nowrap;flex:none'>" + bedrag(p.waarde, d.munt) +
      (p.winst != null ? '<span class="sm" style="display:block;font-weight:500;color:' + (p.winst >= 0 ? "var(--acc)" : "var(--warn)") + '">' + (p.winst >= 0 ? "+" : "") + bedrag(p.winst) + " koerswinst</span>" : "") + "</b></div>").join("") : '<p class="empty">Geen posities.</p>') +
      '<div class="row"><span style="color:var(--ink)">Cash</span><b>' + bedrag(d.cash, d.munt) + "</b></div>" +
      '<p class="src">Koersen kunnen vertraagd zijn. Koerswinst per positie volgens Saxo (t.o.v. je aankoopprijs).</p>';
  }
  h += '<div class="grid" style="margin-top:4px"><button class="btn btn2" data-act="saxo-nu">Nu vernieuwen</button><button class="btn btn2" data-act="saxo-stop">Ontkoppelen</button></div><p class="msg" id="saxoMsg"></p></div>';
  return h;
}
function openInleg() {
  const il = R.inleg(inst());
  openForm({ titel: "Inlegplan", waarden: { inleg_week: il.week, inleg_maand: il.maand },
    spec: [{ k: "inleg_week", l: "Elke week (€)", t: "num", min: 0, req: true }, { k: "inleg_maand", l: "Elke maand extra (€)", t: "num", min: 0, req: true }],
    opslaan: async (o) => { if (o.inleg_week < 0 || o.inleg_maand < 0) throw new Error("Bedragen kunnen niet negatief zijn."); await bewaarInst({ inleg_week: o.inleg_week, inleg_maand: o.inleg_maand }); } });
}

/* ---------- vragenlijst beleggersprofiel (ongewijzigd) ---------- */
const VRAGEN = [
  { k: "horizon", q: "Hoe lang wil je dit geld laten staan?", o: ["Minder dan 3 jaar", "3 tot 5 jaar", "5 tot 10 jaar", "Meer dan 10 jaar"] },
  { k: "doel", q: "Wat is je belangrijkste doel?", o: ["Mijn geld vooral niet verliezen", "Een beetje meer dan op een spaarrekening", "Mijn vermogen laten groeien", "Zo veel mogelijk groei, ook met grote schommelingen"] },
  { k: "daling", q: "Je portefeuille staat op een jaar 20% lager. Wat doe je?", o: ["Alles verkopen", "Een deel verkopen", "Niets doen en wachten", "Extra bijkopen"] },
  { k: "verlies", q: "Welk verlies in een slecht jaar kan je aan zonder wakker te liggen?", o: ["Hoogstens 5%", "Hoogstens 10%", "Hoogstens 20%", "Meer dan 20%"] },
  { k: "ervaring", q: "Waarin heb je al belegd?", o: ["Nog nergens in", "Fondsen of ETF's", "Losse aandelen", "Ook opties, hefboom of crypto"] },
  { k: "buffer", q: "Heb je een noodbuffer van 3 tot 6 maanden uitgaven op een spaarrekening?", o: ["Nee", "Een deel", "Ja", "Ja, ruim meer"] },
  { k: "inkomen", q: "Hoe zeker is je inkomen de komende jaren?", o: ["Onzeker", "Redelijk zeker", "Zeker", "Zeker en het groeit"] },
  { k: "stijl", q: "Wat spreekt je het meest aan?", o: ["Alles gespreid in een paar brede ETF's", "Vooral ETF's, met een paar aandelen", "Half ETF's, half aandelen", "Vooral zelf aandelen kiezen"] },
];
const PROFIELEN = ["voorzichtig", "gematigd", "evenwichtig", "dynamisch", "zeer dynamisch"];
function berekenProfiel(a) {
  const score = VRAGEN.reduce((t, v) => t + (a[v.k] ?? 0), 0);
  let i = score <= 5 ? 0 : score <= 10 ? 1 : score <= 15 ? 2 : score <= 20 ? 3 : 4;
  const redenen = [];
  if ((a.horizon ?? 3) === 0) { i = Math.min(i, 1); redenen.push("je wil het geld binnen 3 jaar kunnen gebruiken"); }
  if ((a.buffer ?? 3) === 0) { i = Math.min(i, 1); redenen.push("je hebt nog geen noodbuffer"); }
  if ((a.daling ?? 3) === 0) { i = Math.min(i, 1); redenen.push("je zou bij een daling alles verkopen"); }
  return { profiel: PROFIELEN[i], uitleg: "Score " + score + " op 24." + (redenen.length ? " Begrensd omdat " + redenen.join(" en ") + "." : "") };
}
let VL = {};
SCHERMEN.vragenlijst = function () {
  const b = dat("belegger");
  if (!Object.keys(VL).length && b?.antwoorden) VL = Object.fromEntries(VRAGEN.map((v) => [v.k, b.antwoorden[v.k]]).filter((x) => x[1] != null));
  return kop("Beleggersprofiel", "8 vragen, eerlijk antwoorden", ["#beleggen", "Beleggen"]) + '<div class="card">' + VRAGEN.map((v, n) => '<div class="q"><h3>' + (n + 1) + ". " + esc(v.q) + "</h3>" + v.o.map((o, i) => '<button class="opt' + (VL[v.k] === i ? " on" : "") + '" data-q="' + v.k + '" data-i="' + i + '">' + esc(o) + "</button>").join("") + "</div>").join("") +
    '<button class="btn" id="vlBewaar">Profiel berekenen</button><p class="msg" id="vlMsg"></p><p class="src">Je antwoorden staan enkel in je eigen database, apart van je sport- en gezondheidsgegevens.</p></div>';
};
TAB_VAN.vragenlijst = "beleggen";
