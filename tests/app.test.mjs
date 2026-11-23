// Eind-tot-eindtest van de app in een echte browser (Playwright), tegen de lokale testserver met echte RLS.
// Voorwaarden: lokale Postgres met testdatabase (mock/maak_db.sh). Start: node app.test.mjs
import { createRequire } from "node:module";
import { spawn } from "node:child_process";
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
const require = createRequire(import.meta.url);
const { chromium } = require("playwright");

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const SHOTS = path.join(ROOT, "tests", "shots"); fs.mkdirSync(SHOTS, { recursive: true });
const SUPA = "https://lqxcqibqkacctmdqghru.supabase.co", MOCK = "http://127.0.0.1:54321", UID = "11111111-1111-1111-1111-111111111111";
const resultaten = []; let fouten = 0;
async function stap(naam, f) { try { await f(); resultaten.push("ok   " + naam); } catch (e) { fouten++; resultaten.push("FOUT " + naam + ": " + String(e.message).replace(/\s+/g, " ").slice(0, 500)); } }

// statische website
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".png": "image/png", ".json": "application/json", ".webmanifest": "application/manifest+json" };
const web = http.createServer((q, r) => { const p = path.join(ROOT, decodeURIComponent(new URL(q.url, "http://x").pathname)); if (!p.startsWith(ROOT) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { r.writeHead(404); return r.end(); } r.writeHead(200, { "Content-Type": TYPES[path.extname(p)] || "application/octet-stream" }); fs.createReadStream(p).pipe(r); }).listen(8089);
const mock = spawn(process.execPath, ["--experimental-strip-types", "--no-warnings", path.join(ROOT, "tests/mock/server.mjs")], { stdio: ["ignore", "pipe", "inherit"], env: process.env });
await new Promise((ok) => mock.stdout.once("data", ok));
const sql = (q) => fetch(MOCK + "/__sql", { method: "POST", body: q }).then((r) => r.json());
const mockZet = (o) => fetch(MOCK + "/__mock", { method: "POST", body: JSON.stringify(o) });

const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
const jwt = b64({ alg: "HS256", typ: "JWT" }) + "." + b64({ sub: UID, role: "authenticated", exp: 4102444800, aud: "authenticated" }) + ".test";
const sessie = { access_token: jwt, refresh_token: "r", token_type: "bearer", expires_in: 3600, expires_at: 4102444800, user: { id: UID, email: "eigenaar@test", aud: "authenticated", role: "authenticated" } };

const browser = await chromium.launch();
async function nieuweContext(opt) {
  const ctx = await browser.newContext({ timezoneId: "Europe/Brussels", locale: "nl-BE", acceptDownloads: true, ...opt });
  await ctx.addInitScript((s) => { localStorage.setItem("sb-lqxcqibqkacctmdqghru-auth-token", JSON.stringify(s)); }, sessie);
  await ctx.route(SUPA + "/**", async (route) => {
    const req = route.request();
    const resp = await route.fetch({ url: req.url().replace(SUPA, MOCK) });
    await route.fulfill({ response: resp });
  });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => { fouten++; resultaten.push("FOUT javascript: " + e.message); });
  page.on("dialog", (d) => d.accept());
  return { ctx, page };
}
const geenToast = (page) => page.evaluate(() => document.querySelectorAll(".toast").forEach((t) => t.remove()));
const tekst = (page) => page.locator("#app").innerText();
const klaar = (page) => page.waitForFunction(() => !document.querySelector("#app .spin"), null, { timeout: 8000 }).catch(() => {});

const { ctx, page } = await nieuweContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
await page.goto("http://127.0.0.1:8089/index.html#home");
await page.waitForSelector("h1"); await klaar(page);

await stap("Vandaag: alle onderdelen laden onafhankelijk", async () => {
  const t = await tekst(page);
  for (const s of ["Agenda vandaag", "Prioriteiten", "Taken vandaag", "Werk: aandacht", "Training", "Beleggen", "Hoe voel je je?"]) assert.ok(t.includes(s), "mist " + s);
  assert.ok(t.includes("nog niet gekoppeld"), "agenda: niet gekoppeld");
  assert.ok(t.includes("Duurloop") && t.includes("Ochtendloop"), "training gepland + gemeten");
  assert.ok(/€ 11\.250,00/.test(t), "Saxo-waarde");
  assert.ok(/\+€ 750,00/.test(t), "resultaat = waarde - netto inleg (11.250 - 10.500)");
  assert.ok(t.includes("Nog geen prioriteiten"), "werkelijk leeg");
});
await page.screenshot({ path: path.join(SHOTS, "01-vandaag.png"), fullPage: true });

await stap("Bedragen verbergen", async () => {
  await page.click("[data-act=verberg]"); await klaar(page);
  const t = await tekst(page); assert.ok(!/11\.250/.test(t) && t.includes("•••"));
  await page.click("[data-act=verberg]");
});

await stap("Snel toevoegen: taak als prioriteit in weinig handelingen", async () => {
  await geenToast(page); await page.click("#fab");
  await page.fill("#snelT", "Offerte Janssens opvolgen");
  await page.click("[data-snel=cat][data-w=werk]");
  await page.click("[data-snel=dl] >> text=Vandaag");
  await page.check("#snelPrio");
  await page.press("#snelT", "Enter");
  await page.waitForSelector(".toast");
  await page.waitForFunction(() => document.querySelector("#app").innerText.includes("Offerte Janssens opvolgen"));
  const r = await sql("select titel, categorie, dagprioriteit is not null as prio from taken");
  assert.deepEqual(r, [{ titel: "Offerte Janssens opvolgen", categorie: "werk", prio: true }]);
});
await stap("Snel toevoegen: notitie met foto", async () => {
  await geenToast(page); await page.click("#fab");
  await page.click("[data-snel=soort][data-w=notitie]");
  await page.fill("#snelT", "Idee voor website");
  const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAFklEQVR42mP8z8DwnwEJMDIwMDAwAAAt8gP9b1kQdgAAAABJRU5ErkJggg==", "base64");
  await page.setInputFiles("#snelFoto", { name: "foto.png", mimeType: "image/png", buffer: png });
  await page.waitForSelector(".foto img");
  await page.click("[data-act=snel-ok]");
  await page.waitForSelector(".toast");
  const r = await sql("select n.tekst, n.foto like '" + UID + "/%.jpg' as pad, (select count(*) from storage.objects)::int as obj from notities n");
  assert.deepEqual(r, [{ tekst: "Idee voor website", pad: true, obj: 1 }]);
});
await stap("Maximaal drie dagprioriteiten (ook afgedwongen door de database)", async () => {
  for (const t of ["Taak twee", "Taak drie", "Taak vier"]) { await geenToast(page); await page.click("#fab"); await page.fill("#snelT", t); await page.click("[data-snel=soort][data-w=taak]").catch(() => {}); await page.press("#snelT", "Enter"); await page.waitForSelector(".toast"); await page.waitForTimeout(150); }
  await page.locator("[data-act=prio-kies]").first().click();
  const boxes = page.locator("[data-prio]");
  for (let i = 0; i < 4; i++) { const b = boxes.nth(i); if (!(await b.isChecked())) await b.click(); await page.waitForTimeout(300); }
  assert.ok((await page.locator("#prioMsg").innerText()).includes("Maximaal drie"));
  const n = await sql("select count(*)::int n from taken where dagprioriteit = current_date");
  assert.equal(n[0].n, 3);
  await page.click("[data-act=sheetdicht]");
});
await stap("Taak afvinken en terugkerende taak", async () => {
  await page.goto("http://127.0.0.1:8089/index.html#taken"); await klaar(page);
  await page.locator(".taak", { hasText: "Taak vier" }).locator(".tt").click();
  await page.selectOption("#f_herhaling", "wekelijks");
  await page.fill("#f_deadline", new Date().toISOString().slice(0, 10));
  await page.click("[data-act=formok]");
  await page.waitForTimeout(400);
  await page.locator(".taak", { hasText: "Taak vier" }).first().locator(".vink").click();
  await page.waitForTimeout(600);
  const r = await sql("select status, deadline - current_date as d from taken where titel = 'Taak vier' order by created_at");
  assert.deepEqual(r.map((x) => x.status).sort(), ["klaar", "open"]);
});
await page.screenshot({ path: path.join(SHOTS, "02-taken.png"), fullPage: true });

await stap("Agenda koppelen: link controleren, nooit teruglezen", async () => {
  await page.goto("http://127.0.0.1:8089/index.html#instellingen/agenda"); await klaar(page);
  assert.ok((await tekst(page)).includes("Nog niet gekoppeld"));
  for (const [naam, soort, url] of [["Gmail", "werk", "https://calendar.google.com/calendar/ical/x/private-abc/basic.ics"], ["iCloud", "prive", "webcal://p57-caldav.icloud.com/published/2/abc"]]) {
    await page.click("[data-act=agbron-nieuw]");
    await page.fill("#f_naam", naam); await page.click("#f_soort [data-seg=" + soort + "]"); await page.fill("#f_url", url);
    await page.click("[data-act=formok]"); await page.waitForSelector(".sheet", { state: "detached" });
  }
  const r = await sql("select naam, soort, url from agenda_bron order by created_at");
  assert.equal(r.length, 2); assert.equal(r[1].url, "https://p57-caldav.icloud.com/published/2/abc", "webcal wordt https");
  await page.click("[data-act=agbron-nieuw]"); await page.fill("#f_naam", "Fout"); await page.fill("#f_url", "https://evil.example.com/x.ics"); await page.click("[data-act=formok]");
  await page.waitForTimeout(300); assert.ok((await page.locator("#formMsg").innerText()).includes("niet toegelaten")); await page.click("[data-act=formdicht]");
});
await stap("Vandaag: afspraken uit beide agenda's, met overlap en training", async () => {
  await page.goto("http://127.0.0.1:8089/index.html#home"); await page.waitForFunction(() => document.querySelector("#app").innerText.includes("Klantgesprek"), null, { timeout: 8000 });
  const t = await tekst(page);
  assert.ok(t.includes("09:00–10:00") && t.includes("09:45–10:30"), "tijden in Brusselse tijd");
  assert.ok(t.includes("Verjaardag") && t.includes("hele dag"));
  assert.ok(/overlappen/.test(t), "overlap gesignaleerd");
  assert.ok(t.includes("Duurloop"), "training in de agenda");
});
await page.screenshot({ path: path.join(SHOTS, "03-vandaag-agenda.png"), fullPage: true });
await stap("Agenda: weekoverzicht en buffer", async () => {
  await page.goto("http://127.0.0.1:8089/index.html#agenda"); await klaar(page);
  await page.click("[data-agw=week]"); await page.waitForTimeout(500);
  const t = await tekst(page); assert.ok((t.match(/Wekelijks overleg/g) || []).length >= 5, "terugkerende afspraak elke werkdag");
  await page.screenshot({ path: path.join(SHOTS, "04-agenda-week.png"), fullPage: true });
  await page.click("[data-agw=dag]");
});
await stap("Agenda: mislukte ophaling wordt eerlijk getoond", async () => {
  await mockZet({ agendaFout: true });
  await page.goto("http://127.0.0.1:8089/index.html#home"); await page.reload(); await page.waitForTimeout(1500);
  assert.ok((await tekst(page)).includes("Ophalen mislukt"));
  await mockZet({ agendaFout: false });
});

await stap("Werk: klant, opdracht, offerte en vervallen factuur vragen aandacht", async () => {
  await page.goto("http://127.0.0.1:8089/index.html#werk"); await klaar(page);
  await page.click("[data-werktab=klanten]"); await page.click("[data-act=werk-nieuw][data-soort=klant]");
  await page.fill("#f_naam", "Janssens BV (test)"); await page.fill("#f_email", "info@janssens.test"); await page.click("[data-act=formok]"); await page.waitForTimeout(400);
  await page.click("[data-werktab=facturen]"); await page.click("[data-act=werk-nieuw][data-soort=factuur]");
  await page.fill("#f_referentie", "F-2026-001"); await page.fill("#f_bedrag", "1250"); await page.selectOption("#f_klant_id", { label: "Janssens BV (test)" });
  const gisteren = new Date(Date.now() - 864e5).toISOString().slice(0, 10); await page.fill("#f_vervaldatum", gisteren);
  await page.click("[data-act=formok]"); await page.waitForTimeout(400);
  await page.click("[data-werktab=offertes]"); await page.click("[data-act=werk-nieuw][data-soort=offerte]");
  await page.fill("#f_referentie", "OF-7"); await page.fill("#f_bedrag", "3400"); await page.fill("#f_opvolgen", gisteren); await page.click("[data-act=formok]"); await page.waitForTimeout(400);
  await page.click("[data-werktab=opdrachten]"); await page.click("[data-act=werk-nieuw][data-soort=opdracht]");
  await page.fill("#f_titel", "Website Janssens"); await page.selectOption("#f_klant_id", { label: "Janssens BV (test)" }); await page.fill("#f_volgende_actie", "Teksten ontvangen"); await page.fill("#f_volgende_actie_op", new Date().toISOString().slice(0, 10));
  await page.click("[data-act=formok]"); await page.waitForTimeout(400);
  await page.click("[data-werktab=aandacht]"); await page.waitForTimeout(200);
  const t = await tekst(page);
  assert.ok(t.includes("Factuur F-2026-001") && t.includes("Vervallen"), "vervallen factuur");
  assert.ok(t.includes("Open offertes") && t.includes("Lopende opdrachten"));
  assert.ok(t.includes("Offerte OF-7") && t.includes("Opvolgen"));
  assert.ok(t.includes("Website Janssens") && t.includes("Teksten ontvangen"));
  await page.screenshot({ path: path.join(SHOTS, "05-werk.png"), fullPage: true });
});

await stap("Sport: padel herkend, eigen padel, weektotalen, gevoelscheck en correctie", async () => {
  await page.goto("http://127.0.0.1:8089/index.html#sport"); await klaar(page);
  let t = await tekst(page); assert.ok(t.includes("Padel"), "Garmin-activiteit PADEL herkend");
  await page.click("[data-act=eigen-nieuw][data-sport=padel]");
  await page.fill("#f_duur_min", "75"); await page.click("#f_intensiteit [data-seg='7']"); await page.fill("#f_notitie", "dubbel"); await page.click("[data-act=formok]"); await page.waitForTimeout(500);
  const r = await sql("select sport, duur_min, intensiteit from sport_invoer"); assert.deepEqual(r, [{ sport: "padel", duur_min: 75, intensiteit: 7 }]);
  await page.locator("[data-act=gevoel][data-veld=energie][data-n='4']").first().click(); await page.waitForTimeout(400);
  assert.equal((await sql("select energie from gevoel"))[0].energie, 4);
  t = await tekst(page); assert.ok(/eigen invoer/.test(t) && /gemeten/.test(t), "onderscheid gemeten / eigen invoer");
  // gisteren: zwemmen gepland, padel gedaan -> geen automatische match; corrigeer naar "niet uitgevoerd"
  await page.click("[data-week='-7']").catch(() => {}); await page.click("[data-week='7']").catch(() => {});
  const zwem = page.locator("[data-act=match]", { hasText: "Zwemmen techniek" });
  if (await zwem.count()) { await zwem.click(); await page.check("input[name=match][value=niet]"); await page.locator("[data-act=match-ok]").last().click(); await page.waitForTimeout(400);
    assert.equal((await sql("select status from plan_match"))[0].status, "niet_uitgevoerd"); }
  await page.screenshot({ path: path.join(SHOTS, "06-sport.png"), fullPage: true });
});

await stap("Beleggen: vermogen en resultaat apart, methode vermeld, inleg instelbaar", async () => {
  await page.goto("http://127.0.0.1:8089/index.html#beleggen"); await klaar(page);
  let t = await tekst(page);
  assert.ok(t.includes("Vermogensontwikkeling") && t.includes("Beleggingsresultaat"));
  assert.ok(/750,00/.test(t) && t.includes("Methode") && t.includes("EUR"), "resultaat met methode en valuta");
  assert.ok(t.includes("Netto inleg") && /10\.500,00/.test(t));
  await page.click("[data-act=inleg]"); await page.fill("#f_inleg_week", "30"); await page.click("[data-act=formok]"); await page.waitForTimeout(400);
  t = await tekst(page); assert.ok(t.includes("€ 30"));
  assert.equal((await sql("select (data->>'inleg_week')::int w from instellingen"))[0].w, 30);
  await page.screenshot({ path: path.join(SHOTS, "07-beleggen.png"), fullPage: true });
  // zonder boekingen: geen rendement
  await sql("update saxo_link set boekingen_ok = null, boekingen_fout = 'lezen_403'");
  await page.reload(); await klaar(page);
  t = await tekst(page); assert.ok(t.includes("Nog niet berekend") && t.includes("lezen_403"));
  await sql("update saxo_link set boekingen_ok = now(), boekingen_fout = null");
});

await stap("Weekoverzicht: prioriteiten voor volgende week", async () => {
  await page.goto("http://127.0.0.1:8089/index.html#week"); await klaar(page);
  await page.fill("#wp1", "Offertes afwerken"); await page.fill("#wp2", "3x trainen"); await page.click("#wpForm .btn"); await page.waitForTimeout(500);
  const r = await sql("select positie, tekst, extract(isodow from week)::int dow from week_prioriteiten order by positie");
  assert.deepEqual(r, [{ positie: 1, tekst: "Offertes afwerken", dow: 1 }, { positie: 2, tekst: "3x trainen", dow: 1 }]);
  const t = await tekst(page); assert.ok(t.includes("Gepland") && t.includes("Klanten en opdrachten opvolgen"));
  await page.screenshot({ path: path.join(SHOTS, "08-week.png"), fullPage: true });
});

let exportPad;
await stap("Export (JSON + CSV) en herstel zonder overschrijven", async () => {
  await page.goto("http://127.0.0.1:8089/index.html#instellingen"); await klaar(page);
  const [dl] = await Promise.all([page.waitForEvent("download"), page.click("[data-act=export-json]")]);
  exportPad = path.join(SHOTS, "export.json"); await dl.saveAs(exportPad);
  const doc = JSON.parse(fs.readFileSync(exportPad, "utf8"));
  assert.equal(doc.app, "AD Omniserve"); assert.equal(doc.tabellen.taken.length, 5); assert.equal(doc.tabellen.klanten.length, 1);
  assert.ok(doc.tabellen.agenda_bron.every((b) => !("url" in b)), "geheime agenda-links niet in de export");
  assert.deepEqual(doc.fouten, []);
  await page.selectOption("#csvTabel", "facturen");
  const [dl2] = await Promise.all([page.waitForEvent("download"), page.click("[data-act=export-csv]")]);
  const csv = fs.readFileSync(await dl2.path(), "utf8"); assert.ok(csv.includes("referentie") && csv.includes("F-2026-001"));
  // wijzig + wis iets, zet terug: gewiste rij komt terug, gewijzigde rij blijft zoals ze nu is
  await sql("update klanten set naam = 'Nieuwe naam (test)'; delete from facturen;");
  await page.setInputFiles("#herstelBestand", exportPad); await page.waitForSelector("[data-act=herstel-ok]");
  const info = await page.locator("#herstelInfo").innerText(); assert.ok(/facturen\s*1 nieuw · 0 al aanwezig/.test(info), info);
  await page.click("[data-act=herstel-ok]"); await page.waitForSelector("#herstelInfo .a-ok");
  const k = await sql("select (select naam from klanten) k, (select count(*)::int from facturen) f");
  assert.deepEqual(k, [{ k: "Nieuwe naam (test)", f: 1 }]);
  await page.setInputFiles("#herstelBestand", exportPad); await page.waitForTimeout(1200);
  const info2 = await page.locator("#herstelInfo").innerText(); assert.ok(info2.includes("Niets toe te voegen"), info2);
});

await stap("Eén defect onderdeel blokkeert de rest niet", async () => {
  await sql("revoke select on public.doelen from authenticated");
  await page.goto("http://127.0.0.1:8089/index.html#sport"); await page.reload(); await klaar(page); await page.waitForTimeout(800);
  const t = await tekst(page);
  assert.ok(t.includes("Kon niet geladen worden"), "doelen: fout getoond");
  assert.ok(t.includes("Gepland en uitgevoerd") && t.includes("Deze week") && t.includes("Ochtendloop"), "rest werkt");
  await page.goto("http://127.0.0.1:8089/index.html#home"); await klaar(page);
  assert.ok((await tekst(page)).includes("Offerte Janssens opvolgen"));
  await sql("grant select on public.doelen to authenticated");
});
await stap("Afscherming via de app-weg: een vreemd token ziet niets", async () => {
  const vreemd = b64({ alg: "HS256" }) + "." + b64({ sub: "99999999-9999-9999-9999-999999999999", role: "authenticated", exp: 4102444800 }) + ".x";
  const r = await fetch(MOCK + "/rest/v1/taken?select=*", { headers: { Authorization: "Bearer " + vreemd } }).then((x) => x.json());
  assert.deepEqual(r, []);
  const anon = await fetch(MOCK + "/rest/v1/klanten?select=*").then((x) => x.json());
  assert.ok(anon.message && /permission denied/i.test(anon.message), "anoniem geweigerd");
});

// licht thema en desktop
await page.goto("http://127.0.0.1:8089/index.html#home"); await klaar(page);
await page.evaluate(() => { localStorage.setItem("omni.thema", JSON.stringify("licht")); }); await page.reload(); await klaar(page); await page.waitForTimeout(800);
await page.screenshot({ path: path.join(SHOTS, "09-vandaag-licht.png"), fullPage: true });
await page.evaluate(() => { localStorage.setItem("omni.thema", JSON.stringify("donker")); });
await geenToast(page); await page.click("#fab"); await page.waitForSelector("#snelT"); await page.screenshot({ path: path.join(SHOTS, "10-snel-toevoegen.png") }); await page.click("[data-act=sheetdicht]");
await ctx.close();

const d = await nieuweContext({ viewport: { width: 1280, height: 900 } });
await stap("Desktop: Vandaag en Werk bruikbaar, geen horizontale scroll", async () => {
  await d.page.goto("http://127.0.0.1:8089/index.html#home"); await klaar(d.page); await d.page.waitForTimeout(1200);
  const w = await d.page.evaluate(() => [document.documentElement.scrollWidth, window.innerWidth]); assert.ok(w[0] <= w[1], "geen horizontale scroll");
  await d.page.screenshot({ path: path.join(SHOTS, "11-desktop-vandaag.png"), fullPage: true });
  await d.page.goto("http://127.0.0.1:8089/index.html#werk"); await klaar(d.page);
  await d.page.screenshot({ path: path.join(SHOTS, "12-desktop-werk.png"), fullPage: true });
});
await stap("Mobiel: geen horizontale scroll op elk scherm", async () => {
  const m = await nieuweContext({ viewport: { width: 375, height: 740 }, isMobile: true, hasTouch: true });
  for (const s of ["home", "agenda", "taken", "sport", "meer", "werk", "beleggen", "week", "instellingen", "instellingen/agenda"]) {
    await m.page.goto("http://127.0.0.1:8089/index.html#" + s); await klaar(m.page); await m.page.waitForTimeout(250);
    const w = await m.page.evaluate(() => [document.documentElement.scrollWidth, window.innerWidth]); assert.ok(w[0] <= w[1], s + ": " + w.join(" > "));
  }
  await m.ctx.close();
});
await d.ctx.close();
await browser.close(); mock.kill(); web.close();
console.log(resultaten.join("\n"));
console.log(fouten ? "\n" + fouten + " FOUT(EN)" : "\nALLE APP-TESTS GESLAAGD");
process.exit(fouten ? 1 : 0);
