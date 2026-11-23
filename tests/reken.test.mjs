// Rekenregels: node --experimental-strip-types reken.test.mjs
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { soortBoeking, boekingRij } from "../supabase/functions/saxo/boeking.ts";
const R = createRequire(import.meta.url)("../js/reken.js");
process.env.TZ = "Europe/Brussels";

// --- beleggen: stortingen zijn geen rendement
const stand = { env: "live", opgehaald: "2026-11-23T10:00:00Z", data: { totaal: 11000, munt: "EUR" } };
const bk = [
  { env: "live", soort: "storting", bedrag: 5000, munt: "EUR", datum: "2025-01-02" },
  { env: "live", soort: "storting", bedrag: 6000, munt: "EUR", datum: "2026-03-01" },
  { env: "live", soort: "opname", bedrag: -1000, munt: "EUR", datum: "2026-06-01" },
  { env: "live", soort: "kosten", bedrag: -12.5, munt: "EUR", datum: "2026-06-01" },
  { env: "live", soort: "dividend", bedrag: 40, munt: "EUR", datum: "2026-07-01" },
  { env: "sim", soort: "storting", bedrag: 99999, munt: "EUR", datum: "2026-07-01" },
];
let r = R.beleggingsResultaat(stand, bk, { boekingen_ok: "2026-11-23" });
assert.equal(r.ok, true); assert.equal(r.netto, 10000); assert.equal(r.resultaat, 1000); assert.equal(Math.round(r.pct * 1000), 100);
assert.equal(r.kosten, 12.5); assert.equal(r.dividend, 40); assert.equal(r.van, "2025-01-02");
// extra storting van 2000 bovenop: waarde stijgt mee, resultaat blijft gelijk
r = R.beleggingsResultaat({ ...stand, data: { totaal: 13000, munt: "EUR" } }, bk.concat({ env: "live", soort: "storting", bedrag: 2000, munt: "EUR", datum: "2026-11-01" }), { boekingen_ok: "x" });
assert.equal(r.resultaat, 1000, "extra storting verschijnt niet als rendement");
// onvoldoende gegevens: geen berekening
r = R.beleggingsResultaat(stand, [], { boekingen_ok: null, boekingen_fout: "lezen_403" });
assert.equal(r.ok, false); assert.ok(r.ontbreekt.join(" ").includes("lezen_403"));
r = R.beleggingsResultaat(stand, [{ env: "live", soort: "kosten", bedrag: -1, munt: "EUR" }], { boekingen_ok: "x" });
assert.equal(r.ok, false, "zonder herkende storting geen rendement");
r = R.beleggingsResultaat(null, bk, { boekingen_ok: "x" });
assert.equal(r.ok, false, "zonder stand geen rendement");
r = R.beleggingsResultaat(stand, bk.concat({ env: "live", soort: "storting", bedrag: 10, munt: "USD" }), { boekingen_ok: "x" });
assert.equal(r.ok, false, "gemengde munten: geen rendement");
// inleg
assert.deepEqual(R.inleg({}), { week: 25, maand: 90, perMaand: (25 * 52 + 90 * 12) / 12, jaar: 2380 });
assert.equal(R.inleg({ inleg_week: 50, inleg_maand: 0 }).jaar, 2600);

// --- Saxo-boekingen indelen
assert.equal(soortBoeking({ BkAmountType: "Dividend", Amount: 5 }), "dividend");
assert.equal(soortBoeking({ BkAmountType: "Withholding Tax", Amount: -1 }), "belasting");
assert.equal(soortBoeking({ BkAmountType: "Commission", Amount: -3 }), "kosten");
assert.equal(soortBoeking({ BkAmountType: "Interest", Amount: 1 }), "rente");
assert.equal(soortBoeking({ BkAmountType: "Cash Transfer", AmountAccountCurrency: 100 }), "storting");
assert.equal(soortBoeking({ BkAmountType: "Cash Transfer", AmountAccountCurrency: -100 }), "opname");
assert.equal(soortBoeking({ BkAmountType: "Share Amount", Amount: -500 }), "transactie");
assert.equal(soortBoeking({ BkAmountType: "Iets nieuws" }), "overig", "onbekend blijft overig");
const rij = boekingRij("u", "live", { BkAmountId: 123, BkAmountType: "Dividend", Date: "2026-07-01T00:00:00Z", AmountAccountCurrency: 4.2, AccountCurrency: "EUR", InstrumentDescription: "iShares" });
assert.equal(rij.id, "123"); assert.equal(rij.datum, "2026-07-01"); assert.equal(rij.bedrag, 4.2); assert.equal(rij.munt, "EUR");

// --- agenda: overlap met buffer, dagen
const a = { start: "2026-11-23T08:00:00.000Z", eind: "2026-11-23T09:00:00.000Z" }, b = { start: "2026-11-23T09:10:00.000Z", eind: "2026-11-23T10:00:00.000Z" };
assert.equal(R.overlappingen([a, b], 0).length, 0);
assert.equal(R.overlappingen([a, b], 15).length, 1, "binnen de buffer");
assert.equal(R.overlappingen([a, b], 15)[0].echt, false);
assert.equal(R.overlappingen([a, { ...b, start: "2026-11-23T08:30:00.000Z" }], 0)[0].echt, true);
assert.equal(R.overlappingen([a, { heledag: true, start: "2026-11-23", eind: "2026-11-24" }], 30).length, 0, "hele dag telt niet");
assert.deepEqual(R.dagenVan({ heledag: true, start: "2026-11-23", eind: "2026-11-25" }), ["2026-11-23", "2026-11-24"]);
assert.deepEqual(R.dagenVan({ start: "2026-11-23T22:30:00.000Z", eind: "2026-11-24T00:30:00.000Z" }), ["2026-11-23", "2026-11-24"], "Brussel: 23:30 tot 01:30");
assert.deepEqual(R.dagenVan({ start: "2026-03-29T00:30:00.000Z", eind: "2026-03-29T01:30:00.000Z" }), ["2026-03-29"], "rond zomertijd");

// --- sport: padel, gepland vs uitgevoerd, correcties, weektotalen
assert.equal(R.sportVanAct({ activityType: "PADEL" }), "padel");
assert.equal(R.sportVanAct({ activityType: "OTHER", activityName: "Padel met Tom" }), "padel");
assert.equal(R.sportVanAct({ activityType: "RUNNING" }), "lopen");
const plan = { "2026-11-23": { k: "run" }, "2026-11-24": { k: "bike" }, "2026-11-25": { k: "rust" }, "2026-11-26": { k: "swim" } };
const gedaan = R.uitgevoerd(
  [{ ref: "g1", day: "2026-11-23", data: { summary: { activityType: "RUNNING", durationInSeconds: 3600 } } },
   { ref: "g2", day: "2026-11-24", data: { summary: { activityType: "RUNNING", durationInSeconds: 1800 } } }],
  [{ id: "p1", dag: "2026-11-24", sport: "padel", duur_min: 90, intensiteit: 7 }]);
let k = R.koppelPlan(plan, gedaan, [], "2026-11-23", "2026-11-29");
assert.deepEqual(k.map((x) => [x.dag, x.status]), [["2026-11-23", "gedaan"], ["2026-11-24", "open"], ["2026-11-26", "open"]], "fietsen wordt niet gekoppeld aan lopen; rust telt niet");
k = R.koppelPlan(plan, gedaan, [{ dag: "2026-11-24", status: "match", act_ref: "g2" }, { dag: "2026-11-26", status: "niet_uitgevoerd" }], "2026-11-23", "2026-11-29");
assert.deepEqual(k.map((x) => [x.dag, x.status, x.act?.ref || null]), [["2026-11-23", "gedaan", "g1"], ["2026-11-24", "gedaan", "g2"], ["2026-11-26", "niet", null]]);
k = R.koppelPlan(plan, gedaan, [{ dag: "2026-11-24", status: "match", act_ref: "g1" }], "2026-11-23", "2026-11-29");
assert.equal(k[0].act, null, "een met de hand gekoppelde training wordt niet dubbel gebruikt");
const wt = R.weekTotalen(gedaan, "2026-11-23", "2026-11-29");
assert.deepEqual(wt.map((x) => [x.sport, x.min, x.n]), [["lopen", 90, 2], ["padel", 90, 1]]);
assert.equal(wt[1].minEigen, 90);

// --- taken en werk
const tk = R.takenVandaag([{ id: 1, deadline: "2026-11-20", status: "open" }, { id: 2, deadline: "2026-11-23", status: "open" }, { id: 3, dagprioriteit: "2026-11-23", status: "klaar" }, { id: 4, deadline: "2026-11-20", status: "klaar" }], "2026-11-23");
assert.deepEqual([tk.prio.length, tk.teLaat.map((t) => t.id), tk.vandaag.map((t) => t.id)], [1, [1], [2]]);
const wa = R.werkAandacht({ klanten: [{ id: "k", naam: "Klant" }], opdrachten: [{ id: "o", titel: "Site", status: "lopend", deadline: "2026-11-25", klant_id: "k" }, { id: "o2", titel: "Oud", status: "afgerond", deadline: "2026-01-01" }],
  offertes: [{ id: "q", referentie: "OF1", status: "verzonden", opvolgen: "2026-11-22" }, { id: "q2", referentie: "OF2", status: "aanvaard", opvolgen: "2026-11-01" }],
  facturen: [{ id: "f", referentie: "F1", vervaldatum: "2026-11-01" }, { id: "f2", referentie: "F2", vervaldatum: "2026-11-01", betaald_op: "2026-11-02" }] }, "2026-11-23");
assert.deepEqual(wa.map((x) => x.id), ["f", "q", "o"]);
assert.equal(wa[2].klant, "Klant");
console.log("Rekentests geslaagd");
