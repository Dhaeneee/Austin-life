/* AD Omniserve – weekoverzicht (werkt volledig zonder AI) en het Meer-scherm. */
"use strict";
let WEEK = null;
SCHERMEN.week = function () {
  const v = vandaag(); WEEK = WEEK || maandagVan(v);
  const ma = WEEK, zo = plusDag(ma, 6), volgende = plusDag(ma, 7);
  let h = kop("Weekoverzicht", "Week van " + korteDatum(ma) + " tot " + korteDatum(zo), ["#meer", "Meer"]);
  h += '<div class="chips" style="margin-bottom:12px"><button class="chip" data-wk="-7">‹ Vorige</button><button class="chip' + (ma === maandagVan(v) ? " on" : "") + '" data-wk="0">Deze week</button><button class="chip" data-wk="7">Volgende ›</button></div>';

  // prioriteiten van deze week (vorige week gekozen) + dagprioriteiten
  const wp = dat("weekprio", []).filter((p) => p.week === ma).sort((a, b) => a.positie - b.positie);
  const dp = dat("taken", []).filter((t) => t.dagprioriteit && t.dagprioriteit >= ma && t.dagprioriteit <= zo);
  const klaar = dp.filter((t) => t.status === "klaar"), open = dp.filter((t) => t.status !== "klaar");
  h += '<div class="card"><div class="ch"><h2>Prioriteiten</h2><span class="sm mut">' + klaar.length + " van " + dp.length + " dagprioriteiten klaar</span></div>" +
    (wp.length ? '<p class="sm mut" style="margin-bottom:4px">Weekprioriteiten</p>' + wp.map((p) => '<label class="kies"><input type="checkbox" data-act="wp-klaar" data-id="' + esc(p.id) + '"' + (p.klaar ? " checked" : "") + "><span><b" + (p.klaar ? ' style="text-decoration:line-through;color:var(--mut)"' : "") + ">" + esc(p.tekst) + "</b></span></label>").join("") : "") +
    blok(["taken", "weekprio"], (klaar.length ? '<p class="sm mut" style="margin:8px 0 4px">Afgerond</p>' + klaar.map((t) => taakRij(t, { prio: true })).join("") : "") + (open.length ? '<p class="sm mut" style="margin:8px 0 4px">Nog open</p>' + open.map((t) => taakRij(t, { prio: true })).join("") : ""), wp.length ? "" : "Geen prioriteiten gekozen deze week.") + "</div>";

  // werk opvolgen
  const wa = R.werkAandacht(werk(), v > zo ? zo : v < ma ? ma : v);
  h += '<div class="card"><div class="ch"><h2>Klanten en opdrachten opvolgen</h2><a href="#werk">Werk</a></div>' + blok(["opdrachten", "offertes", "facturen"], wa.slice(0, 8).map(werkAandachtRij).join(""), "Niets om op te volgen.") + "</div>";

  // sport gepland vs uitgevoerd
  const k = R.koppelPlan(plan(), gedaan(), dat("match", []), ma, zo), wt = R.weekTotalen(gedaan(), ma, zo);
  h += '<div class="card"><div class="ch"><h2>Sport</h2><a href="#sport">Details</a></div>' +
    blok(["plan", "garmin", "eigen"], '<div class="grid"><div class="met"><div class="l">Gepland</div><div class="v">' + k.length + '</div></div><div class="met"><div class="l">Uitgevoerd volgens plan</div><div class="v">' + k.filter((x) => x.status === "gedaan").length + "</div></div></div>" +
      (wt.length ? '<div style="margin-top:8px">' + wt.map((x) => '<div class="row"><span>' + esc((SPORT[x.sport] || SPORT.andere).n) + " · " + x.n + "×</span><b>" + duur(x.min * 60) + "</b></div>").join("") + "</div>" : '<p class="empty" style="margin-top:8px">Geen trainingen deze week.</p>'), "") + "</div>";

  // doelen
  const doelen = dat("doelen", []).filter((x) => x.status === "actief");
  h += '<div class="card"><div class="ch"><h2>Doelen</h2></div>' + blok("doelen", doelen.map(doelRij).join(""), "Geen actieve doelen.") + "</div>";

  // drie prioriteiten voor volgende week
  const vp = dat("weekprio", []).filter((p) => p.week === volgende);
  h += '<div class="card"><div class="ch"><h2>Drie prioriteiten voor volgende week</h2></div><form id="wpForm">' +
    [1, 2, 3].map((n) => '<label class="field"><span>' + n + '.</span><input id="wp' + n + '" maxlength="200" autocomplete="off" value="' + esc(vp.find((p) => p.positie === n)?.tekst || "") + '"></label>').join("") +
    '<button class="btn">Bewaar voor de week van ' + esc(korteDatum(volgende)) + '</button><p class="msg" id="wpMsg"></p></form></div>';
  h += '<p class="src" style="text-align:center">Dit overzicht gebruikt enkel je eigen gegevens, zonder AI.</p>';
  return h;
};
TAB_VAN.week = "meer";
async function bewaarWeekPrio() {
  const volgende = plusDag(WEEK || maandagVan(vandaag()), 7), m = $("wpMsg"), bestaand = dat("weekprio", []).filter((p) => p.week === volgende);
  const teksten = [1, 2, 3].map((n) => $("wp" + n).value.trim());  // eerst alles lezen: het scherm kan intussen hertekenen
  m.innerHTML = '<span class="spin"></span>';
  try {
    for (const n of [1, 2, 3]) {
      const t = teksten[n - 1], b = bestaand.find((p) => p.positie === n);
      if (t && b) { if (b.tekst !== t) { const r = await sb.from("week_prioriteiten").update({ tekst: t }).eq("id", b.id); if (r.error) throw r.error; } }
      else if (t) { const r = await sb.from("week_prioriteiten").insert({ week: volgende, positie: n, tekst: t }); if (r.error) throw r.error; }
      else if (b) { const r = await sb.from("week_prioriteiten").delete().eq("id", b.id); if (r.error) throw r.error; }
    }
    await herlaad("weekprio"); m.textContent = "Bewaard."; toast("Weekprioriteiten bewaard");
  } catch (e) { m.textContent = "Bewaren lukte niet: " + vertaalDbFout(e); }
}

SCHERMEN.meer = function () {
  const tv = R.takenVandaag(dat("taken", []), vandaag()), nt = tv.teLaat.length + tv.vandaag.length;
  const item = (go, ic, t, sub) => '<button class="row" data-go="' + go + '"><span style="color:var(--ink);display:flex;gap:12px;align-items:center"><span class="mic">' + ic + '</span><span><b style="font-weight:600;display:block;text-align:left">' + t + '</b><span class="sm mut">' + sub + '</span></span></span><b class="mut">›</b></button>';
  return kop("Meer", "") + '<div class="card">' +
    item("#taken", "✓", "Taken", nt ? nt + " vandaag of te laat" : "Privé, werk en sport") +
    item("#agenda", "🗓", "Agenda", "Werk, privé en trainingen samen") +
    item("#week", "📋", "Weekoverzicht", "Terugblik en volgende week") +
    item("#assistent", "💬", "Sportassistent", "AI, enkel sportgegevens") +
    item("#instellingen", "⚙️", "Instellingen", "Koppelingen, export, privacy") + "</div>";
};
TAB_VAN.agenda = TAB_VAN.taken = "meer";
