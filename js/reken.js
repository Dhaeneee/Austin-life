/* AD Omniserve – rekenregels zonder schermcode (ook lokaal getest met Node: tests/reken.test.mjs).
   Alles hier is puur: geen database, geen DOM. */
(function (g) {
  "use strict";
  const pad = (n) => String(n).padStart(2, "0");
  const isoDag = (d) => d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());
  const plusDag = (iso, n) => { const d = new Date(iso + "T12:00:00"); d.setDate(d.getDate() + n); return isoDag(d); };
  const maandagVan = (iso) => { const d = new Date(iso + "T12:00:00"); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return isoDag(d); };

  /* ---------- agenda ---------- */
  // lokale kalenderdag(en) waarop een afspraak valt (tijden in de tijdzone van het toestel)
  function dagenVan(it) {
    if (it.heledag) { const out = []; for (let d = it.start; d < it.eind && out.length < 62; d = plusDag(d, 1)) out.push(d); return out.length ? out : [it.start]; }
    const s = new Date(it.start), e = new Date(it.eind), out = [];
    let d = isoDag(s); const laatste = isoDag(new Date(Math.max(s.getTime(), e.getTime() - 1)));
    while (d <= laatste && out.length < 62) { out.push(d); d = plusDag(d, 1); }
    return out;
  }
  // overlappingen tussen afspraken met een tijd (hele-dag-afspraken tellen niet), met buffer in minuten
  function overlappingen(items, bufferMin) {
    const b = Math.max(0, Number(bufferMin) || 0) * 60e3;
    const t = items.filter((i) => !i.heledag).map((i) => ({ i, s: Date.parse(i.start), e: Date.parse(i.eind) })).sort((x, y) => x.s - y.s);
    const paren = [];
    for (let a = 0; a < t.length; a++) for (let c = a + 1; c < t.length; c++) {
      if (t[c].s >= t[a].e + b) break;
      if (t[c].s < t[a].e + b && t[a].s < t[c].e + b) paren.push({ a: t[a].i, b: t[c].i, echt: t[c].s < t[a].e && t[a].s < t[c].e });
    }
    return paren;
  }

  /* ---------- sport ---------- */
  const GTYPE = { RUNNING: "lopen", TRAIL_RUNNING: "lopen", TREADMILL_RUNNING: "lopen", INDOOR_RUNNING: "lopen", CYCLING: "fietsen", ROAD_BIKING: "fietsen",
    INDOOR_CYCLING: "fietsen", VIRTUAL_RIDE: "fietsen", MOUNTAIN_BIKING: "fietsen", GRAVEL_CYCLING: "fietsen", LAP_SWIMMING: "zwemmen",
    OPEN_WATER_SWIMMING: "zwemmen", SWIMMING: "zwemmen", STRENGTH_TRAINING: "kracht", HIKING: "wandelen", WALKING: "wandelen", SQUASH: "squash",
    PADEL: "padel", PADDLE_TENNIS: "padel", PADDELBALL: "padel" };
  // sport van een Garmin-activiteit; padel ook herkend aan de naam (als Garmin geen eigen type doorgeeft)
  function sportVanAct(s) {
    const t = String(s?.activityType || "").toUpperCase();
    if (GTYPE[t]) return GTYPE[t];
    if (/padel/i.test(String(s?.activityName || "")) || /PADEL/.test(t)) return "padel";
    return "andere";
  }
  function sportVanPlan(p) {
    if (!p) return "andere";
    if (p.k === "rust") return "rust";
    const sp = { lopen: 1, fietsen: 1, zwemmen: 1, kracht: 1, wandelen: 1, squash: 1, padel: 1 };
    if (sp[p.sp]) return p.sp;
    return { run: "lopen", bike: "fietsen", swim: "zwemmen", kracht: "kracht" }[p.k] || "andere";
  }
  // uniforme lijst uitgevoerde trainingen: Garmin (gemeten) + eigen invoer
  function uitgevoerd(acts, eigen) {
    const a = (acts || []).map((x) => { const s = x.data?.summary || {}; return { ref: x.ref, dag: x.day, sport: sportVanAct(s), min: Math.round(Number(s.durationInSeconds || 0) / 60), bron: "garmin", titel: s.activityName || "" }; });
    const e = (eigen || []).map((x) => ({ ref: "eigen:" + x.id, dag: x.dag, sport: x.sport, min: Number(x.duur_min || 0), bron: "eigen", titel: x.notitie || "", rpe: x.intensiteit }));
    return a.concat(e);
  }
  // per dag van het schema: welke training hoort erbij (automatisch, tenzij gecorrigeerd)
  function koppelPlan(plan, gedaan, correcties, van, tot) {
    const corr = Object.fromEntries((correcties || []).map((c) => [c.dag, c]));
    const gebruikt = new Set(), out = [];
    const dagen = Object.keys(plan || {}).filter((d) => d >= van && d <= tot && plan[d] && sportVanPlan(plan[d]) !== "rust").sort();
    // eerst de correcties vastleggen
    for (const d of dagen) { const c = corr[d]; if (c && c.status === "match" && c.act_ref) gebruikt.add(c.act_ref); }
    for (const d of dagen) {
      const p = plan[d], sp = sportVanPlan(p), c = corr[d];
      if (c) {
        if (c.status === "niet_uitgevoerd") { out.push({ dag: d, plan: p, sport: sp, act: null, status: "niet", gecorrigeerd: true }); continue; }
        const act = gedaan.find((x) => x.ref === c.act_ref) || null;
        out.push({ dag: d, plan: p, sport: sp, act, status: act ? "gedaan" : "onbekend", gecorrigeerd: true }); continue;
      }
      const kand = gedaan.filter((x) => x.dag === d && !gebruikt.has(x.ref));
      const act = kand.find((x) => x.sport === sp) || null;
      if (act) gebruikt.add(act.ref);
      out.push({ dag: d, plan: p, sport: sp, act, status: act ? "gedaan" : "open", gecorrigeerd: false });
    }
    return out;
  }
  // weektotalen per sport (minuten en aantal), apart voor gemeten en eigen invoer
  function weekTotalen(gedaan, van, tot) {
    const per = {};
    for (const x of gedaan) {
      if (x.dag < van || x.dag > tot) continue;
      const p = (per[x.sport] = per[x.sport] || { sport: x.sport, min: 0, n: 0, minGarmin: 0, minEigen: 0 });
      p.min += x.min; p.n += 1; if (x.bron === "garmin") p.minGarmin += x.min; else p.minEigen += x.min;
    }
    return Object.values(per).sort((a, b) => b.min - a.min);
  }

  /* ---------- taken en werk ---------- */
  function takenVandaag(taken, dag) {
    const open = (taken || []).filter((t) => t.status !== "klaar");
    return {
      prio: (taken || []).filter((t) => t.dagprioriteit === dag),
      teLaat: open.filter((t) => t.deadline && t.deadline < dag && t.dagprioriteit !== dag),
      vandaag: open.filter((t) => t.deadline === dag && t.dagprioriteit !== dag),
    };
  }
  // wat in de werkmodule aandacht vraagt, met reden en urgentie (0 = te laat, 1 = vandaag, 2 = binnenkort)
  function werkAandacht(w, dag) {
    const out = [], binnen = plusDag(dag, 3), naam = (id) => (w.klanten || []).find((k) => k.id === id)?.naam || "";
    for (const o of w.opdrachten || []) {
      if (["afgerond", "geannuleerd"].includes(o.status)) continue;
      if (o.volgende_actie_op && o.volgende_actie_op <= dag) out.push({ soort: "opdracht", id: o.id, titel: o.titel, klant: naam(o.klant_id), reden: "Volgende actie" + (o.volgende_actie ? ": " + o.volgende_actie : ""), datum: o.volgende_actie_op, u: o.volgende_actie_op < dag ? 0 : 1 });
      else if (o.deadline && o.deadline <= binnen) out.push({ soort: "opdracht", id: o.id, titel: o.titel, klant: naam(o.klant_id), reden: o.deadline < dag ? "Deadline voorbij" : "Deadline", datum: o.deadline, u: o.deadline < dag ? 0 : o.deadline === dag ? 1 : 2 });
    }
    for (const o of w.offertes || []) {
      if (!["verzonden", "concept"].includes(o.status)) continue;
      if (o.opvolgen && o.opvolgen <= dag) out.push({ soort: "offerte", id: o.id, titel: "Offerte " + o.referentie, klant: naam(o.klant_id), reden: "Opvolgen", datum: o.opvolgen, u: o.opvolgen < dag ? 0 : 1, bedrag: o.bedrag });
    }
    for (const f of w.facturen || []) {
      if (f.betaald_op) continue;
      if (f.vervaldatum && f.vervaldatum < dag) out.push({ soort: "factuur", id: f.id, titel: "Factuur " + f.referentie, klant: naam(f.klant_id), reden: "Vervallen, nog niet betaald", datum: f.vervaldatum, u: 0, bedrag: f.bedrag });
      else if (f.vervaldatum && f.vervaldatum <= binnen) out.push({ soort: "factuur", id: f.id, titel: "Factuur " + f.referentie, klant: naam(f.klant_id), reden: "Vervalt binnenkort", datum: f.vervaldatum, u: f.vervaldatum === dag ? 1 : 2, bedrag: f.bedrag });
    }
    return out.sort((a, b) => a.u - b.u || String(a.datum).localeCompare(String(b.datum)));
  }

  /* ---------- beleggen ---------- */
  // Beleggingsresultaat = huidige waarde - netto inleg (stortingen - opnames). Wordt enkel berekend als de gegevens volstaan;
  // anders: { ok:false, ontbreekt:[...] }. Stortingen tellen nooit als rendement.
  function beleggingsResultaat(stand, boekingen, status) {
    const ontbreekt = [];
    const d = stand?.data;
    if (!d || typeof d.totaal !== "number") ontbreekt.push("de huidige waarde van je rekening (Saxo-stand)");
    if (!status?.boekingen_ok) ontbreekt.push("de historiek van stortingen en opnames (Saxo-boekingen nog niet opgehaald" + (status?.boekingen_fout ? ": " + status.boekingen_fout : "") + ")");
    const env = stand?.env;
    const bk = (boekingen || []).filter((b) => !env || b.env === env);
    const st = bk.filter((b) => b.soort === "storting"), op = bk.filter((b) => b.soort === "opname");
    if (status?.boekingen_ok && !st.length) ontbreekt.push("minstens één herkende storting in de boekingen");
    const munten = new Set(bk.filter((b) => ["storting", "opname"].includes(b.soort)).map((b) => b.munt).filter(Boolean));
    if (d?.munt && [...munten].some((m) => m !== d.munt)) ontbreekt.push("stortingen in één munt (er zijn stortingen in " + [...munten].join(", ") + ")");
    const som = (l) => l.reduce((t, b) => t + Math.abs(Number(b.bedrag) || 0), 0);
    const stortingen = som(st), opnames = som(op);
    const datums = bk.map((b) => b.datum).filter(Boolean).sort();
    const basis = { stortingen, opnames, netto: stortingen - opnames, munt: d?.munt || null, van: datums[0] || null, tot: (stand?.opgehaald || "").slice(0, 10) || null,
      kosten: som(bk.filter((b) => b.soort === "kosten")), dividend: bk.filter((b) => b.soort === "dividend").reduce((t, b) => t + (Number(b.bedrag) || 0), 0),
      belasting: som(bk.filter((b) => b.soort === "belasting")), overig: [...new Set(bk.filter((b) => b.soort === "overig").map((b) => b.type_saxo || "onbekend"))] };
    if (ontbreekt.length) return { ok: false, ontbreekt, ...basis };
    const resultaat = d.totaal - basis.netto;
    return { ok: true, ...basis, waarde: d.totaal, resultaat, pct: basis.netto > 0 ? resultaat / basis.netto : null,
      methode: "Resultaat = huidige totale waarde min netto inleg (alle stortingen min alle opnames). Het percentage is het eenvoudige resultaat op je netto inleg, niet tijdgewogen en niet per jaar." };
  }
  // inlegplan uit de instellingen
  function inleg(inst) {
    const w = Number(inst?.inleg_week ?? 25), m = Number(inst?.inleg_maand ?? 90);
    const jaar = w * 52 + m * 12;
    return { week: w, maand: m, perMaand: jaar / 12, jaar };
  }

  const R = { pad, isoDag, plusDag, maandagVan, dagenVan, overlappingen, sportVanAct, sportVanPlan, uitgevoerd, koppelPlan, weekTotalen, takenVandaag, werkAandacht, beleggingsResultaat, inleg, GTYPE };
  if (typeof module !== "undefined" && module.exports) module.exports = R; else g.REKEN = R;
})(typeof window !== "undefined" ? window : globalThis);
