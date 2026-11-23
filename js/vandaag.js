/* AD Omniserve – startscherm Vandaag: in één minuut weten wat er vandaag is. */
"use strict";
SCHERMEN.home = function () {
  const u = new Date().getHours(), groet = u < 6 ? "Goeienacht" : u < 12 ? "Goeiemorgen" : u < 18 ? "Goeiemiddag" : "Goeieavond";
  const naam = (dat("prof")?.naam || "").split(" ")[0], d = vandaag();
  let h = kop(groet + (naam ? ", " + naam : ""), langeDatum(d).replace(/^./, (c) => c.toUpperCase())) + alerts();

  // 1. agenda vandaag
  h += '<div class="card"><div class="ch"><h2>Agenda vandaag</h2><a href="#agenda">Week</a></div>' + agendaDagLijst(d, true) + "</div>";

  // 2. drie prioriteiten
  const tv = R.takenVandaag(dat("taken", []), d);
  h += '<div class="card"><div class="ch"><h2>Prioriteiten</h2><button class="lnk" data-act="prio-kies">' + (tv.prio.length ? "Wijzig" : "Kies") + "</button></div>" +
    blok("taken", tv.prio.length ? tv.prio.map((t) => taakRij(t, { prio: true })).join("") : "", "Nog geen prioriteiten gekozen voor vandaag. Kies er maximaal drie uit je taken.") +
    (tv.prio.length && tv.prio.length < 3 ? '<button class="lnk" data-act="prio-kies" style="margin-top:8px">+ Prioriteit toevoegen</button>' : "") + "</div>";

  // 3. taken die vandaag vervallen of te laat zijn
  const lijst = tv.teLaat.concat(tv.vandaag);
  h += '<div class="card"><div class="ch"><h2>Taken vandaag</h2><a href="#taken">Alle taken</a></div>' +
    blok("taken", lijst.length ? lijst.slice(0, 8).map((t) => taakRij(t)).join("") + (lijst.length > 8 ? '<p class="src">en nog ' + (lijst.length - 8) + " andere</p>" : "") : "", "Niets dat vandaag vervalt of te laat is.") + actualiteit("taken") + "</div>";

  // 4. werk dat aandacht vraagt
  const wa = R.werkAandacht(werk(), d);
  h += '<div class="card"><div class="ch"><h2>Werk: aandacht</h2><a href="#werk">AD Omniserve</a></div>' +
    blok(["opdrachten", "offertes", "facturen", "klanten"], wa.length ? wa.slice(0, 4).map(werkAandachtRij).join("") + (wa.length > 4 ? '<p class="src">en nog ' + (wa.length - 4) + ' andere · <a href="#werk">bekijk alles</a></p>' : "") : "", "Geen klanten of opdrachten die nu aandacht vragen.") +
    actualiteit(["opdrachten", "offertes", "facturen"]) + "</div>";

  // 5. training, herstel en gevoel
  const pv = plan()[d], g = gezDag(d), vActs = acts().filter((a) => a.day === d), vEigen = dat("eigen", []).filter((e) => e.dag === d);
  h += '<div class="card"><div class="ch"><h2>Training</h2><a href="#sport">Sport</a></div>' +
    blok("plan", pv ? planEv(d, pv) : "", "Niets gepland vandaag in Legati.") +
    (vActs.length || vEigen.length ? '<div style="margin-top:10px">' + vActs.map(actEv).join("") + vEigen.map(eigenEv).join("") + "</div>" : "") +
    (Object.keys(g).length ? '<p class="sm mut" style="margin:12px 0 6px">Herstel vannacht <span class="tag t-a lbl">gemeten</span></p>' + herstelGrid(g) : st("garmin") === "ok" ? '<p class="src">Nog geen herstelgegevens van vannacht binnen.</p>' : "") +
    actualiteit(["plan", "garmin"], "Legati en Garmin") + "</div>";
  h += gevoelKaart(true);

  // 6. beleggen compact
  h += '<div class="card"><div class="ch"><h2>Beleggen</h2><a href="#beleggen">Openen</a></div>' + beleggenKort() + "</div>";

  // assistent
  h += '<div class="card"><div class="ch"><h2>Sportassistent</h2><span class="tag t-g">AI</span></div><form class="ask" id="homeAsk"><input id="homeQ" placeholder="Vraag iets over je training…" autocomplete="off" enterkeyhint="send"><button aria-label="Vraag">↑</button></form>' +
    '<p class="src">Ziet enkel je sportgegevens, je eigen sportinvoer en je gevoelscheck. Geen werk, agenda of beleggingen.</p></div>';
  return h;
};

function beleggenKort() {
  const x = dat("saxo"), s = dat("stand");
  if (st("saxo") === "laden" && !D.saxo?.tijd) return '<p class="empty"><span class="spin"></span> Laden…</p>';
  if (st("saxo") === "fout" || st("stand") === "fout") return actualiteit(["saxo", "stand"]);
  if (!x?.gekoppeld && !s) return '<p class="empty">Saxo Bank is nog niet gekoppeld. Er staan dus geen bedragen of posities.</p>';
  if (!s?.data) return '<p class="empty">Gekoppeld, maar nog geen stand opgehaald.</p>';
  const r = R.beleggingsResultaat(s, dat("saxoBoek", []), x);
  return '<div class="grid"><div class="met"><div class="l">Totale waarde</div><div class="v" style="font-size:19px">' + (s.data.munt === "EUR" ? (verberg() ? "€ •••" : "€ " + bedrag(s.data.totaal)) : bedrag(s.data.totaal, s.data.munt)) + "</div></div>" +
    '<div class="met"><div class="l">Resultaat</div><div class="v" style="font-size:19px">' + (r.ok ? '<span style="color:' + (r.resultaat >= 0 ? "var(--acc)" : "var(--warn)") + '">' + (r.resultaat >= 0 ? "+€ " : "−€ ") + bedrag(Math.abs(r.resultaat)) + "</span>" : '<small>niet berekend</small>') + "</div></div></div>" +
    '<p class="src">Uit Saxo' + (s.env !== "live" ? " (testomgeving, nepgeld)" : "") + ", opgehaald " + esc(sinds(s.opgehaald)) + ". Tik op 👁 om bedragen te verbergen.</p>";
}
