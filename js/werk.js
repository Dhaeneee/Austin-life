/* AD Omniserve – werkmodule: klanten, opdrachten, offertes en facturen opvolgen (geen boekhouding). */
"use strict";
let WERKTAB = store.get("werktab", "aandacht");
const OPDR_STATUS = [["aanvraag", "Aanvraag"], ["lopend", "Lopend"], ["wacht", "Wacht op klant"], ["afgerond", "Afgerond"], ["geannuleerd", "Geannuleerd"]];
const OFF_STATUS = [["concept", "Concept"], ["verzonden", "Verzonden"], ["aanvaard", "Aanvaard"], ["geweigerd", "Geweigerd"], ["verlopen", "Verlopen"]];
const klantNaam = (id) => dat("klanten", []).find((k) => k.id === id)?.naam || "";
const WERKKEYS = ["klanten", "opdrachten", "offertes", "facturen"];

function werkAandachtRij(a) {
  const ic = { opdracht: "💼", offerte: "📨", factuur: "🧾" }[a.soort], v = vandaag();
  const pill = a.u === 0 ? '<span class="pill laat">' + (a.soort === "factuur" ? "Vervallen" : "Te laat") + "</span>" : a.datum === v ? '<span class="pill nu">Vandaag</span>' : '<span class="pill">' + esc(dagLabel(a.datum).replace(/^./, (c) => c.toUpperCase())) + "</span>";
  return '<button class="ev" data-act="werk-open" data-soort="' + a.soort + '" data-id="' + esc(a.id) + '"><div class="ic t-w">' + ic + '</div><div class="et"><b>' + esc(a.klant || a.titel) + "</b><span>" +
    esc([a.klant ? a.titel : "", a.reden, a.bedrag != null ? euro(a.bedrag) : ""].filter(Boolean).join(" · ")) + "</span></div>" + pill + '<span class="chev">›</span></button>';
}
SCHERMEN.werk = function () {
  const w = werk(), v = vandaag();
  let h = kop("AD Omniserve", "Wat vraagt vandaag aandacht?");
  h += '<div class="seg scroll" style="margin-bottom:12px">' + [["aandacht", "Aandacht"], ["opdrachten", "Opdrachten"], ["offertes", "Offertes"], ["facturen", "Facturen"], ["klanten", "Klanten"]].map(([k, l]) => '<button data-werktab="' + k + '" class="' + (WERKTAB === k ? "on" : "") + '">' + l + "</button>").join("") + "</div>";
  if (WERKTAB === "aandacht") {
    const wa = R.werkAandacht(w, v), tk = dat("taken", []).filter((t) => t.categorie === "werk" && t.status !== "klaar" && t.deadline && t.deadline <= v);
    const open = w.facturen.filter((f) => !f.betaald_op), som = open.reduce((t, f) => t + (Number(f.bedrag) || 0), 0), offOpen = w.offertes.filter((o) => ["verzonden", "concept"].includes(o.status));
    h += '<div class="tiles"><div class="met"><div class="l">Open offertes</div><div class="v">' + (st("offertes") === "ok" ? offOpen.length : "–") + '</div></div><div class="met"><div class="l">Openstaand</div><div class="v">' + (st("facturen") === "ok" ? euro(som) : "–") + "</div></div></div>";
    h += '<div class="card"><div class="ch"><h2>Op te volgen</h2><span class="sm mut">' + wa.length + "</span></div>" + blok(WERKKEYS, wa.map(werkAandachtRij).join(""), "Niets dat nu aandacht vraagt.") + "</div>";
    const lopend = w.opdrachten.filter((o) => ["aanvraag", "lopend", "wacht"].includes(o.status));
    h += '<div class="card"><div class="ch"><h2>Lopende opdrachten</h2></div>' + blok("opdrachten", lopend.map((o) => '<button class="ev" data-act="werk-open" data-soort="opdracht" data-id="' + esc(o.id) + '"><div class="ic t-w">💼</div><div class="et"><b>' + esc(o.titel) + "</b><span>" + esc([klantNaam(o.klant_id), o.deadline ? "deadline " + dagLabel(o.deadline) : ""].filter(Boolean).join(" · ")) + '</span></div><span class="sm mut" style="align-self:center">' + esc(OPDR_STATUS.find((x) => x[0] === o.status)[1]) + '</span><span class="chev">›</span></button>').join(""), "Geen lopende opdrachten.") + "</div>";
    if (tk.length) h += '<div class="card"><div class="ch"><h2>Werktaken vandaag of te laat</h2></div>' + tk.map((t) => taakRij(t)).join("") + "</div>";
    h += '<button class="btn" data-act="werk-kies" style="margin-bottom:12px">+ Nieuwe opvolging</button>';
  } else if (WERKTAB === "klanten") {
    h += '<div class="card"><div class="ch"><h2>Klanten</h2><button class="lnk" data-act="werk-nieuw" data-soort="klant">+ Klant</button></div>' +
      blok("klanten", w.klanten.map((k) => { const n = w.opdrachten.filter((o) => o.klant_id === k.id && !["afgerond", "geannuleerd"].includes(o.status)).length;
        return '<button class="ev" data-act="werk-open" data-soort="klant" data-id="' + esc(k.id) + '"><div class="ic t-w">' + esc(k.naam.charAt(0).toUpperCase()) + '</div><div class="et"><b>' + esc(k.naam) + (k.actief ? "" : ' <span class="tag t-g">inactief</span>') + "</b><span>" + esc([k.contact, k.email, k.telefoon].filter(Boolean).join(" · ") || "geen contactgegevens") + (n ? " · " + n + " lopende opdracht" + (n > 1 ? "en" : "") : "") + '</span></div><span class="chev">›</span></button>'; }).join(""), "Nog geen klanten.") + "</div>";
  } else if (WERKTAB === "opdrachten") {
    const l = [...w.opdrachten].sort((a, b) => ["afgerond", "geannuleerd"].includes(a.status) - ["afgerond", "geannuleerd"].includes(b.status) || (a.deadline || "9999").localeCompare(b.deadline || "9999"));
    h += '<div class="card"><div class="ch"><h2>Opdrachten</h2><button class="lnk" data-act="werk-nieuw" data-soort="opdracht">+ Opdracht</button></div>' +
      blok("opdrachten", l.map((o) => '<button class="ev" data-act="werk-open" data-soort="opdracht" data-id="' + esc(o.id) + '"><div class="ic t-w">📁</div><div class="et"><b>' + esc(o.titel) + ' <span class="tag ' + (o.status === "lopend" ? "t-a" : o.status === "wacht" ? "t-g" : "t-p") + '">' + esc(OPDR_STATUS.find((s) => s[0] === o.status)[1]) + "</span></b><span>" +
        esc([klantNaam(o.klant_id), o.deadline ? "deadline " + dagLabel(o.deadline) : "", o.volgende_actie ? "→ " + o.volgende_actie + (o.volgende_actie_op ? " (" + dagLabel(o.volgende_actie_op) + ")" : "") : ""].filter(Boolean).join(" · ")) + '</span></div><span class="chev">›</span></button>').join(""), "Nog geen opdrachten.") + "</div>";
  } else if (WERKTAB === "offertes") {
    h += '<div class="card"><div class="ch"><h2>Offertes</h2><button class="lnk" data-act="werk-nieuw" data-soort="offerte">+ Offerte</button></div>' +
      blok("offertes", w.offertes.map((o) => '<button class="ev" data-act="werk-open" data-soort="offerte" data-id="' + esc(o.id) + '"><div class="ic t-w">📨</div><div class="et"><b>' + esc(o.referentie) + (o.bedrag != null ? ' <span class="mut" style="display:inline;font-weight:500">· ' + euro(o.bedrag) + "</span>" : "") + ' <span class="tag t-p">' + esc(OFF_STATUS.find((s) => s[0] === o.status)[1]) + "</span></b><span" + (o.status === "verzonden" && o.opvolgen && o.opvolgen <= v ? ' style="color:var(--warn)"' : "") + ">" +
        esc([klantNaam(o.klant_id), o.verzonden ? "verzonden " + korteDatum(o.verzonden) : "", o.opvolgen && o.status === "verzonden" ? "opvolgen " + dagLabel(o.opvolgen) : ""].filter(Boolean).join(" · ")) + '</span></div><span class="chev">›</span></button>').join(""), "Nog geen offertes.") + "</div>";
  } else {
    const l = [...w.facturen].sort((a, b) => !!a.betaald_op - !!b.betaald_op || (a.vervaldatum || "").localeCompare(b.vervaldatum || ""));
    h += '<div class="card"><div class="ch"><h2>Facturen</h2><button class="lnk" data-act="werk-nieuw" data-soort="factuur">+ Factuur</button></div>' +
      blok("facturen", l.map((f) => { const laat = !f.betaald_op && f.vervaldatum && f.vervaldatum < v;
        return '<button class="ev" data-act="werk-open" data-soort="factuur" data-id="' + esc(f.id) + '"><div class="ic ' + (laat ? "t-warn" : "t-w") + '">🧾</div><div class="et"><b>' + esc(f.referentie) + (f.bedrag != null ? ' <span class="mut" style="display:inline;font-weight:500">· ' + euro(f.bedrag) + "</span>" : "") + ' <span class="tag ' + (f.betaald_op ? "t-a" : laat ? "t-warn" : "t-g") + '">' + (f.betaald_op ? "betaald" : laat ? "te laat" : "openstaand") + "</span></b><span>" +
          esc([klantNaam(f.klant_id), f.betaald_op ? "betaald " + korteDatum(f.betaald_op) : f.vervaldatum ? "vervalt " + dagLabel(f.vervaldatum) : ""].filter(Boolean).join(" · ")) + '</span></div><span class="chev">›</span></button>'; }).join(""), "Nog geen facturen.") + "</div>";
  }
  h += actualiteit(WERKKEYS);
  h += '<p class="src" style="text-align:center">Dit is een opvolglijst, geen boekhouding. Er is (nog) geen koppeling met een boekhoudpakket: zie Instellingen.</p>';
  return h;
};

const WERKSPEC = {
  klant: { tabel: "klanten", titel: "Klant", spec: [{ k: "naam", l: "Naam", req: true, max: 120 }, { k: "contact", l: "Contactpersoon", max: 120 }, { k: "email", l: "E-mail", t: "email", max: 200 }, { k: "telefoon", l: "Telefoon", t: "tel", max: 40 }, { k: "notitie", l: "Notities", t: "area", max: 4000 }, { k: "actief", l: "Actieve klant", t: "chk" }], nieuw: { actief: true } },
  opdracht: { tabel: "opdrachten", titel: "Opdracht", spec: [{ k: "titel", l: "Opdracht", req: true, max: 160 }, { k: "klant_id", l: "Klant", t: "klant" }, { k: "status", l: "Status", t: "sel", o: OPDR_STATUS }, { k: "deadline", l: "Deadline", t: "date" }, { k: "volgende_actie", l: "Volgende actie", max: 300 }, { k: "volgende_actie_op", l: "Volgende actie op", t: "date" }, { k: "omschrijving", l: "Omschrijving", t: "area", max: 4000 }], nieuw: { status: "lopend" } },
  offerte: { tabel: "offertes", titel: "Offerte", spec: [{ k: "referentie", l: "Referentie", req: true, max: 60 }, { k: "klant_id", l: "Klant", t: "klant" }, { k: "opdracht_id", l: "Opdracht", t: "opdracht" }, { k: "bedrag", l: "Bedrag (€, excl. btw)", t: "num", min: 0 }, { k: "verzonden", l: "Verzonden op", t: "date" }, { k: "status", l: "Status", t: "sel", o: OFF_STATUS }, { k: "opvolgen", l: "Opvolgen op", t: "date" }, { k: "notitie", l: "Notitie", t: "area", max: 2000 }], nieuw: () => ({ status: "verzonden", verzonden: vandaag(), opvolgen: plusDag(vandaag(), 7) }) },
  factuur: { tabel: "facturen", titel: "Factuur", spec: [{ k: "referentie", l: "Factuurnummer", req: true, max: 60 }, { k: "klant_id", l: "Klant", t: "klant" }, { k: "opdracht_id", l: "Opdracht", t: "opdracht" }, { k: "bedrag", l: "Bedrag (€)", t: "num", min: 0 }, { k: "factuurdatum", l: "Factuurdatum", t: "date" }, { k: "vervaldatum", l: "Vervaldatum", t: "date" }, { k: "betaald_op", l: "Betaald op (leeg = openstaand)", t: "date" }, { k: "notitie", l: "Notitie", t: "area", max: 2000 }], nieuw: () => ({ factuurdatum: vandaag(), vervaldatum: plusDag(vandaag(), 30) }) },
};
const TABEL_KEY = { klanten: "klanten", opdrachten: "opdrachten", offertes: "offertes", facturen: "facturen" };
function openWerk(soort, id) {
  const c = WERKSPEC[soort], rij = id ? dat(c.tabel, []).find((x) => x.id === id) : null;
  if (id && !rij) return;
  const nieuw = typeof c.nieuw === "function" ? c.nieuw() : c.nieuw;
  let extra = "";
  if (soort === "klant" && rij) {
    const op = dat("opdrachten", []).filter((o) => o.klant_id === id), fa = dat("facturen", []).filter((f) => f.klant_id === id && !f.betaald_op);
    extra = '<p class="sm mut" style="margin-top:12px">' + op.length + " opdracht(en), " + fa.length + " openstaande factu(u)r(en).</p>" + '<button type="button" class="btn btn2" data-act="werk-nieuw" data-soort="opdracht" data-klant="' + esc(id) + '">+ Opdracht voor deze klant</button>';
  }
  if (soort === "opdracht" && rij) extra = '<button type="button" class="btn btn2" data-act="taak-van-opdracht" data-id="' + esc(id) + '">+ Taak voor deze opdracht</button>';
  if (soort === "factuur" && rij && !rij.betaald_op) extra = '<button type="button" class="btn btn2" data-act="factuur-betaald" data-id="' + esc(id) + '">Vandaag betaald</button>';
  openForm({
    titel: (rij ? "" : "Nieuwe ") + c.titel.toLowerCase().replace(/^./, (x) => rij ? x.toUpperCase() : x), spec: c.spec, waarden: rij || { ...nieuw, ...(WERK_STANDAARD || {}) }, geenFocus: !!rij, extra,
    opslaan: async (o) => { await opslaanRij(c.tabel, o, rij?.id); await herlaad(c.tabel); },
    bevestig: c.titel + " verwijderen?" + (soort === "klant" ? " Opdrachten, offertes en facturen blijven bestaan, zonder klant." : ""),
    verwijderen: rij ? async () => { await verwijderRij(c.tabel, rij.id); await herlaad(...WERKKEYS, "taken"); } : null,
  });
  WERK_STANDAARD = null;
}
let WERK_STANDAARD = null;

function openWerkKiezer() {
  const k = (soort, ic, t, sub) => '<button class="row" data-act="werk-nieuw" data-soort="' + soort + '"><span style="color:var(--ink);display:flex;gap:12px;align-items:center"><span class="mic">' + ic + '</span><span><b style="font-weight:600;display:block;text-align:left">' + t + '</b><span class="sm mut">' + sub + '</span></span></span><b class="mut">›</b></button>';
  $("sheet").innerHTML = '<div class="sheet" role="dialog" aria-label="Nieuwe opvolging"><header><button class="lnk" data-act="sheetdicht">Annuleren</button><b>Nieuwe opvolging</b><span style="width:60px"></span></header><div class="sheetbody"><div class="card">' +
    k("opdracht", "💼", "Opdracht", "met deadline en volgende actie") + k("offerte", "📨", "Offerte", "met opvolgdatum") + k("factuur", "🧾", "Factuur", "met vervaldatum") + k("klant", "👤", "Klant", "naam, contact, notities") +
    '<button class="row" data-act="snel" data-soort="taak"><span style="color:var(--ink);display:flex;gap:12px;align-items:center"><span class="mic">✓</span><span><b style="font-weight:600;display:block;text-align:left">Werktaak</b><span class="sm mut">snel vastleggen</span></span></span><b class="mut">›</b></button></div></div></div>';
  document.body.style.overflow = "hidden";
}
