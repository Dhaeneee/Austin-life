/* AD Omniserve – gezamenlijke agenda (alleen lezen): werk, privé en trainingen samen, dag- en weekoverzicht, overlappingen. */
"use strict";
const AGENDAFOUT = { link_niet_toegelaten: "deze link is niet toegelaten: enkel https-links van Google, iCloud of Outlook", link_ongeldig: "de link werkt niet (meer); maak een nieuwe geheime link",
  bron: "de agendadienst gaf een fout", time_out: "de agendadienst antwoordde niet op tijd", te_groot: "de agenda is te groot (meer dan 5 MB)", geen_agenda: "dit is geen agenda-link (geen iCal)",
  niet_geinstalleerd: "de agendafunctie staat nog niet op de server", net: "geen verbinding", niet_ingelogd: "niet ingelogd" };
const agendaFout = (c) => AGENDAFOUT[String(c || "").replace(/_\d+$/, "")] || String(c || "onbekende fout");
const AGENDA = { key: "", st: "leeg", items: [], bronnen: [], fout: null, tijd: null, van: null, tot: null };
let AGDAG = null, AGWEERGAVE = store.get("agweergave", "dag");

const buffer = () => Number(inst().agenda_buffer ?? 0);
const heeftBronnen = () => dat("agendaBron", []).some((b) => b.actief);
async function laadAgenda(van, tot, forceer) {
  const key = van + "|" + tot;
  if (!heeftBronnen()) return;
  if (!forceer && AGENDA.key === key && (AGENDA.st === "laden" || (AGENDA.tijd && Date.now() - new Date(AGENDA.tijd).getTime() < 5 * 60e3))) return;
  if (AGENDA.key !== key && !(AGENDA.van <= van && AGENDA.tot >= tot && AGENDA.st === "ok")) AGENDA.items = [];
  Object.assign(AGENDA, { key, st: "laden", van, tot });
  tekenStraks();
  try {
    const j = await fn("agenda", "", { van, tot });
    Object.assign(AGENDA, { st: "ok", items: j.items || [], bronnen: j.bronnen || [], fout: null, tijd: new Date().toISOString() });
    herlaad("agendaBron");
  } catch (e) { Object.assign(AGENDA, { st: "fout", fout: e?.code || "fout", tijd: AGENDA.tijd }); }
  tekenStraks();
}
// alle items van een dag: afspraken + trainingen uit het schema
function agendaItemsDag(d) {
  const it = AGENDA.items.filter((i) => R.dagenVan(i).includes(d)).map((i) => ({ ...i, kleur: i.soort }));
  const p = plan()[d];
  if (p && sportVanPlan(p) !== "rust") { const r = planRegel(p); it.push({ titel: r.titel + (r.extra ? " · " + r.extra : ""), heledag: true, start: d, eind: plusDag(d, 1), kleur: "sport", training: true }); }
  return it.sort((a, b) => (b.heledag - a.heledag) || a.start.localeCompare(b.start));
}
function agendaStatusRegel() {
  if (st("agendaBron") === "laden" && !D.agendaBron?.tijd) return '<p class="src"><span class="spin"></span> laden…</p>';
  if (st("agendaBron") === "fout") return actualiteit("agendaBron");
  if (!heeftBronnen()) return "";
  if (AGENDA.st === "laden" && !AGENDA.tijd) return '<p class="src"><span class="spin"></span> afspraken ophalen…</p>';
  if (AGENDA.st === "fout") return '<p class="src st-fout">⚠️ Ophalen mislukt: ' + esc(agendaFout(AGENDA.fout)) + (AGENDA.tijd ? " · laatst gelukt " + esc(sinds(AGENDA.tijd)) : "") + "</p>";
  const fout = AGENDA.bronnen.filter((b) => !b.ok);
  return fout.map((b) => '<p class="src st-fout">⚠️ ' + esc(b.naam) + ": " + esc(agendaFout(b.fout)) + (b.uitCache ? " · je ziet de versie van " + esc(sinds(b.opgehaald)) : " · geen afspraken van deze agenda") + "</p>").join("") +
    '<p class="src">Agenda opgehaald ' + esc(sinds(AGENDA.tijd)) + " · " + AGENDA.bronnen.filter((b) => b.ok).map((b) => esc(b.naam)).join(", ") + "</p>";
}
function agendaRij(i, conflict) {
  const kl = { werk: "var(--work)", prive: "var(--priv)", sport: "var(--sport)" }[i.kleur] || "var(--mut)";
  const tijd = i.heledag ? (i.training ? "training" : "hele dag") : uur(i.start) + "–" + uur(i.eind);
  return '<div class="agi' + (conflict ? " conflict" : "") + '"><i style="background:' + kl + '"></i><span class="agt">' + esc(tijd) + '</span><span class="agn"><b>' + esc(i.titel) + "</b>" + (i.locatie ? "<em>" + esc(i.locatie) + "</em>" : "") + "</span>" + (conflict ? '<span class="tag t-warn">overlap</span>' : "") + "</div>";
}
function agendaDagLijst(d, compact) {
  if (st("agendaBron") === "ok" && !heeftBronnen()) {
    const t = agendaItemsDag(d);
    return (t.length ? t.map((i) => agendaRij(i)).join("") : "") + '<p class="empty' + (t.length ? " sm" : "") + '" style="' + (t.length ? "margin-top:8px" : "") + '">Je agenda\'s zijn <b>nog niet gekoppeld</b>. <a href="#instellingen/agenda">Koppel Google of iCloud</a> (alleen lezen).</p>';
  }
  const items = agendaItemsDag(d);
  const ov = R.overlappingen(items, buffer()), inConflict = new Set(ov.flatMap((p) => [p.a, p.b]));
  let h = "";
  if (AGENDA.st === "laden" && !AGENDA.items.length && heeftBronnen()) h += '<p class="empty"><span class="spin"></span> Afspraken ophalen…</p>';
  else if (AGENDA.st === "fout" && !AGENDA.items.length) h += (items.length ? items.map((i) => agendaRij(i)).join("") : "") + '<p class="empty st-fout">Afspraken konden niet opgehaald worden.</p>';
  else h += items.length ? items.map((i) => agendaRij(i, inConflict.has(i))).join("") : '<p class="empty">Geen afspraken' + (compact ? " vandaag" : "") + ".</p>";
  if (ov.length) h += '<div class="alert a-gold" style="margin-top:10px"><span>⏱</span><span>' + ov.map((p) => "<b>" + esc(p.a.titel) + "</b> en <b>" + esc(p.b.titel) + "</b> " + (p.echt ? "overlappen" : "liggen minder dan " + buffer() + " min uit elkaar")).join("; ") + ".</span></div>";
  return h + agendaStatusRegel();
}

SCHERMEN.agenda = function () {
  const d = vandaag(); AGDAG = AGDAG || d;
  const ma = maandagVan(AGDAG);
  let h = kop("Agenda", "Werk, privé en trainingen · alleen lezen");
  h += '<div class="legend"><span><i style="background:var(--work)"></i>Werk</span><span><i style="background:var(--priv)"></i>Privé</span><span><i style="background:var(--sport)"></i>Training</span>' + (buffer() ? "<span>buffer " + buffer() + " min</span>" : "") + "</div>";
  h += '<div class="card"><div class="ch"><div class="seg" style="flex:1;max-width:200px"><button data-agw="dag" class="' + (AGWEERGAVE === "dag" ? "on" : "") + '">Dag</button><button data-agw="week" class="' + (AGWEERGAVE === "week" ? "on" : "") + '">Week</button></div>' +
    '<span><button class="lnk" data-agnav="-' + (AGWEERGAVE === "week" ? 7 : 1) + '" aria-label="Vorige">‹</button> <button class="lnk" data-agnav="0">Vandaag</button> <button class="lnk" data-agnav="' + (AGWEERGAVE === "week" ? 7 : 1) + '" aria-label="Volgende">›</button></span></div>';
  if (AGWEERGAVE === "dag") {
    h += '<div class="week">';
    for (let i = 0; i < 7; i++) { const dd = plusDag(ma, i), n = agendaItemsDag(dd).length; h += '<button class="wd' + (dd === AGDAG ? " on" : "") + '" data-agdag="' + dd + '">' + "mdwdvzz"[i].toUpperCase() + "<b>" + Number(dd.slice(8)) + '</b><i style="background:' + (n ? "var(--mut)" : "transparent") + '"></i></button>'; }
    h += '</div><p class="sm mut" style="margin-bottom:8px">' + esc(langeDatum(AGDAG)) + "</p>" + agendaDagLijst(AGDAG);
  } else {
    h += '<p class="sm mut" style="margin-bottom:4px">Week van ' + esc(korteDatum(ma)) + " tot " + esc(korteDatum(plusDag(ma, 6))) + "</p>";
    for (let i = 0; i < 7; i++) {
      const dd = plusDag(ma, i), items = agendaItemsDag(dd), ov = R.overlappingen(items, buffer()), c = new Set(ov.flatMap((p) => [p.a, p.b]));
      h += '<div class="wkdag' + (dd === d ? " nu" : "") + '"><button class="lnk" data-agdag="' + dd + '" data-agw2="dag">' + esc(langeDatum(dd)) + "</button>" + (items.length ? items.map((x) => agendaRij(x, c.has(x))).join("") : '<p class="empty sm">Niets.</p>') + "</div>";
    }
    h += agendaStatusRegel();
  }
  h += "</div>";
  h += '<p class="src" style="text-align:center">Tijden in de tijdzone van dit toestel (' + esc(Intl.DateTimeFormat().resolvedOptions().timeZone || "onbekend") + '). Trainingen komen uit Legati en hebben geen uur, dus ze tellen niet mee voor overlappingen. <a href="#instellingen/agenda">Agenda-instellingen</a></p>';
  return h;
};
function agendaVenster() {
  const r = (location.hash || "#home").slice(1).split("/")[0];
  if (r === "agenda") { const ma = maandagVan(AGDAG || vandaag()); return [ma, plusDag(ma, 6)]; }
  const v = vandaag(); return [maandagVan(v), plusDag(maandagVan(v), 13)];
}
NA_TEKENEN.home = NA_TEKENEN.agenda = NA_TEKENEN.week = () => { if (st("agendaBron") === "ok") { const [van, tot] = agendaVenster(); laadAgenda(van, tot); } };

/* ---------- agenda-instellingen: bronnen beheren ---------- */
SCHERMEN["instellingen/agenda"] = function () {
  const b = dat("agendaBron", []);
  let h = kop("Agenda koppelen", "Alleen lezen, via een geheime iCal-link", ["#instellingen", "Instellingen"]);
  h += '<div class="card"><div class="ch"><h2>Gekoppelde agenda\'s</h2></div>' + blok("agendaBron", b.map((x) => '<button class="row" data-act="agbron" data-id="' + esc(x.id) + '"><span style="color:var(--ink)"><b style="font-weight:600;display:block;text-align:left">' + esc(x.naam) + ' <span class="tag ' + (x.soort === "werk" ? "t-w" : "t-p") + '">' + (x.soort === "werk" ? "Werk" : "Privé") + "</span></b>" +
    '<span class="sm" style="color:' + (x.last_error ? "var(--warn)" : "var(--mut)") + '">' + (!x.actief ? "Uitgeschakeld" : x.last_error ? "Fout: " + esc(agendaFout(x.last_error)) : x.last_ok ? "Werkt · " + esc(sinds(x.last_ok)) : "Nog niet opgehaald") + '</span></span><b class="mut">›</b></button>').join(""),
    "<b>Nog niet gekoppeld.</b> Voeg hieronder je Google- of iCloud-agenda toe.") +
    '<button class="btn" data-act="agbron-nieuw">Agenda toevoegen</button></div>';
  h += '<div class="card"><div class="ch"><h2>Tijdsbuffer</h2></div><p class="sm mut">Waarschuw ook als afspraken minder dan zoveel minuten uit elkaar liggen.</p><div class="seg" style="margin-top:8px">' +
    [0, 10, 15, 30, 60].map((m) => '<button data-buffer="' + m + '" class="' + (buffer() === m ? "on" : "") + '">' + (m ? m + " min" : "Geen") + "</button>").join("") + "</div></div>";
  h += '<div class="card hulp"><div class="ch"><h2>Zo vind je de link</h2></div>' +
    "<p><b>Google Agenda (Gmail):</b> open calendar.google.com op een computer, ga naar Instellingen, kies links je agenda, scroll naar <i>Agenda integreren</i> en kopieer <b>Geheim adres in iCal-indeling</b>. Deze link geeft enkel leestoegang.</p>" +
    "<p><b>iCloud (AD Omniserve-agenda):</b> open de app Agenda op je iPhone, tik op Agenda's, tik op ⓘ naast de agenda, zet <b>Openbare agenda</b> aan en tik op Deel link, Kopieer. De link begint met webcal://; dat mag zo.</p>" +
    '<p class="sm mut">Let op: wie zo\'n link heeft, kan de agenda lezen. Daarom bewaart de app ze enkel op de server: je kunt de link vervangen, maar de app toont hem nooit opnieuw. Wil je ze intrekken, maak dan in Google een nieuwe geheime link, of zet in iCloud Openbare agenda uit.</p></div>';
  return h;
};
function openAgendaBron(b) {
  openForm({
    titel: b ? "Agenda" : "Agenda toevoegen", waarden: b ? { ...b, url: "" } : { soort: "prive", actief: true },
    spec: [{ k: "naam", l: "Naam", req: true, max: 60, ph: "bv. Gmail werk" }, { k: "soort", l: "Soort", t: "seg", o: [["werk", "Werk"], ["prive", "Privé"]] },
      { k: "url", l: b ? "Nieuwe geheime link (leeg laten = huidige behouden)" : "Geheime iCal-link", t: "url", req: !b, ph: "https://calendar.google.com/… of webcal://…" }, { k: "actief", l: "Actief", t: "chk" }],
    knop: b ? "Bewaar" : "Controleer en bewaar",
    opslaan: async (o) => {
      let url = (o.url || "").trim().replace(/^webcals?:\/\//i, "https://");
      if (url) {
        if (!/^https:\/\//.test(url)) throw new Error("De link moet met https:// of webcal:// beginnen.");
        $("formMsg").innerHTML = '<span class="spin"></span> Link controleren…';
        let t; try { t = await fn("agenda", "test", { url }); } catch (e) { throw new Error(agendaFout(e?.code)); }
        if (!t.ok) throw new Error(agendaFout(t.error));
      }
      const rij = { naam: o.naam, soort: o.soort || "prive", actief: o.actief !== false };
      if (url) rij.url = url;
      const r = b ? await sb.from("agenda_bron").update(rij).eq("id", b.id) : await sb.from("agenda_bron").insert(rij);
      if (r.error) throw r.error;
      AGENDA.key = ""; await herlaad("agendaBron");
    },
    verwijderen: b ? async () => { await verwijderRij("agenda_bron", b.id); AGENDA.key = ""; AGENDA.items = []; await herlaad("agendaBron"); } : null,
  });
}
