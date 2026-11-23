/* AD Omniserve – taken, dagprioriteiten, notities en "Snel toevoegen" (ook met foto). */
"use strict";
const PRIO = { 1: "Hoog", 2: "Normaal", 3: "Laag" };
const HERHAAL = [["geen", "Niet herhalen"], ["dagelijks", "Elke dag"], ["wekelijks", "Elke week"], ["maandelijks", "Elke maand"], ["jaarlijks", "Elk jaar"]];
const TAAK_SPEC = () => [
  { k: "titel", l: "Titel", req: true, max: 200 },
  { k: "categorie", l: "Categorie", t: "seg", o: [["prive", "Privé"], ["werk", "Werk"], ["sport", "Sport"]] },
  { k: "deadline", l: "Deadline", t: "date" },
  { k: "prioriteit", l: "Prioriteit", t: "seg", num: true, o: [["1", "Hoog"], ["2", "Normaal"], ["3", "Laag"]] },
  { k: "status", l: "Status", t: "seg", o: [["open", "Open"], ["bezig", "Bezig"], ["klaar", "Klaar"]] },
  { k: "herhaling", l: "Herhalen", t: "sel", o: HERHAAL },
  { k: "klant_id", l: "Klant", t: "klant" },
  { k: "opdracht_id", l: "Opdracht", t: "opdracht" },
  { k: "notitie", l: "Notitie", t: "area", max: 4000 },
  { k: "dagprio", l: "Prioriteit voor vandaag", t: "chk" },
];
function taakRij(t, o = {}) {
  const v = vandaag(), laat = t.status !== "klaar" && t.deadline && t.deadline < v;
  const k = t.klant_id ? dat("klanten", []).find((x) => x.id === t.klant_id) : null;
  const sub = [t.deadline ? (laat ? "te laat · " : "") + dagLabel(t.deadline) : "", t.herhaling !== "geen" ? "↻ " + (HERHAAL.find((h) => h[0] === t.herhaling)?.[1] || "").toLowerCase() : "", k ? k.naam : "", t.status === "bezig" ? "bezig" : "", t.foto ? "📷" : ""].filter(Boolean).join(" · ");
  return '<div class="taak' + (t.status === "klaar" ? " klaar" : "") + '"><button class="vink" data-act="taak-vink" data-id="' + esc(t.id) + '" aria-label="' + (t.status === "klaar" ? "Terug openzetten" : "Klaar") + '">' + (t.status === "klaar" ? "✓" : "") + "</button>" +
    '<button class="tt" data-act="taak-bewerk" data-id="' + esc(t.id) + '"><b>' + (t.prioriteit === 1 && !o.prio ? '<span class="prio1">!</span> ' : "") + esc(t.titel) + "</b>" +
    (sub ? '<span' + (laat ? ' style="color:var(--warn)"' : "") + ">" + esc(sub) + "</span>" : "") + '</button><span class="tag ' + CAT[t.categorie].c + '">' + CAT[t.categorie].n + "</span></div>";
}

let TAKENFILTER = store.get("takenfilter", "open");
SCHERMEN.taken = function () {
  const alle = dat("taken", []), v = vandaag();
  let h = kop("Taken", "Privé, werk en sport");
  h += '<div class="seg" style="margin-bottom:12px">' + [["open", "Open"], ["prive", "Privé"], ["werk", "Werk"], ["sport", "Sport"], ["klaar", "Klaar"]].map(([w, l]) => '<button data-takenfilter="' + w + '" class="' + (TAKENFILTER === w ? "on" : "") + '">' + l + "</button>").join("") + "</div>";
  let lijst = TAKENFILTER === "klaar" ? alle.filter((t) => t.status === "klaar").sort((a, b) => String(b.klaar_op).localeCompare(String(a.klaar_op))).slice(0, 60)
    : alle.filter((t) => t.status !== "klaar" && (TAKENFILTER === "open" || t.categorie === TAKENFILTER));
  if (TAKENFILTER !== "klaar") lijst.sort((a, b) => (a.deadline || "9999").localeCompare(b.deadline || "9999") || a.prioriteit - b.prioriteit);
  const groep = (titel, l) => l.length ? '<div class="card"><div class="ch"><h2>' + titel + '</h2><span class="sm mut">' + l.length + "</span></div>" + l.map((t) => taakRij(t)).join("") + "</div>" : "";
  if (st("taken") !== "ok") h += '<div class="card">' + blok("taken", "", "") + actualiteit("taken") + "</div>";
  else if (!lijst.length) h += '<div class="card"><p class="empty">' + (TAKENFILTER === "klaar" ? "Nog niets afgerond." : "Geen open taken. Tik op + om er een toe te voegen.") + "</p></div>";
  else if (TAKENFILTER === "klaar") h += groep("Afgerond", lijst);
  else {
    h += groep("Te laat", lijst.filter((t) => t.deadline && t.deadline < v));
    h += groep("Vandaag", lijst.filter((t) => t.deadline === v));
    h += groep("Deze week", lijst.filter((t) => t.deadline > v && t.deadline <= plusDag(v, 7)));
    h += groep("Later", lijst.filter((t) => t.deadline > plusDag(v, 7)));
    h += groep("Zonder deadline", lijst.filter((t) => !t.deadline));
  }
  const nt = dat("notities", []);
  h += '<div class="card"><div class="ch"><h2>Notities</h2><button class="lnk" data-act="snel" data-soort="notitie">+ Notitie</button></div>' +
    blok("notities", nt.slice(0, 15).map((n) => '<button class="ev" data-act="notitie-bewerk" data-id="' + esc(n.id) + '"><div class="ic ' + CAT[n.categorie].c + '">' + (n.foto ? "📷" : "✎") + '</div><div class="et"><b style="font-weight:500">' + esc((n.tekst || "(foto)").slice(0, 140)) + "</b><span>" + esc(sinds(n.created_at)) + '</span></div></button>').join(""), "Nog geen notities.") + "</div>";
  h += actualiteit(["taken", "notities"]);
  return h;
};

/* ---------- taak bewerken ---------- */
function openTaak(t, standaard) {
  const w = t ? { ...t, dagprio: t.dagprioriteit === vandaag() } : { categorie: "prive", prioriteit: 2, status: "open", herhaling: "geen", ...(standaard || {}) };
  openForm({
    titel: t ? "Taak" : "Nieuwe taak", spec: TAAK_SPEC(), waarden: w, geenFocus: !!t,
    extra: t?.foto ? '<div class="foto" id="taakFoto" data-pad="' + esc(t.foto) + '"><span class="spin"></span></div>' : "",
    opslaan: async (o) => {
      const rij = { titel: o.titel, categorie: o.categorie || "prive", deadline: o.deadline, prioriteit: o.prioriteit || 2, status: o.status || "open", herhaling: o.herhaling, klant_id: o.klant_id, opdracht_id: o.opdracht_id, notitie: o.notitie,
        dagprioriteit: o.dagprio ? vandaag() : (t?.dagprioriteit && t.dagprioriteit !== vandaag() ? t.dagprioriteit : null) };
      await opslaanRij("taken", rij, t?.id); await herlaad("taken");
    },
    verwijderen: t ? async () => { await verwijderRij("taken", t.id); await herlaad("taken"); } : null,
  });
  if (t?.foto) toonFoto(t.foto, "taakFoto");
}
async function toonFoto(padNaam, elId) {
  const el = $(elId); if (!el) return;
  const { data, error } = await sb.storage.from("foto").createSignedUrl(padNaam, 3600);
  el.innerHTML = error || !data?.signedUrl ? '<p class="empty st-fout">Foto kon niet geladen worden.</p>' : '<img src="' + esc(data.signedUrl) + '" alt="Foto">';
}
async function taakVink(id) {
  const t = dat("taken", []).find((x) => x.id === id); if (!t) return;
  const nieuw = t.status === "klaar" ? "open" : "klaar";
  t.status = nieuw; teken();
  const { error } = await sb.from("taken").update({ status: nieuw }).eq("id", id);
  if (error) { alert("Bewaren lukte niet: " + vertaalDbFout(error)); }
  await herlaad("taken");
}

/* ---------- dagprioriteiten kiezen (max. 3) ---------- */
function openPrioKiezer() {
  const v = vandaag(), open = dat("taken", []).filter((t) => t.status !== "klaar" || t.dagprioriteit === v)
    .sort((a, b) => (b.dagprioriteit === v) - (a.dagprioriteit === v) || (a.deadline || "9999").localeCompare(b.deadline || "9999") || a.prioriteit - b.prioriteit);
  $("sheet").innerHTML = '<div class="sheet" role="dialog" aria-label="Prioriteiten"><header><button class="lnk" data-act="sheetdicht">Klaar</button><b>Prioriteiten vandaag</b><span style="width:50px"></span></header><div class="sheetbody">' +
    '<p class="sm mut" style="margin-bottom:10px">Kies maximaal drie taken. <span id="prioTel"></span></p>' +
    (open.length ? open.map((t) => '<label class="kies"><input type="checkbox" data-prio="' + esc(t.id) + '"' + (t.dagprioriteit === v ? " checked" : "") + '><span><b>' + esc(t.titel) + "</b><i>" + esc([CAT[t.categorie].n, t.deadline ? dagLabel(t.deadline) : ""].filter(Boolean).join(" · ")) + "</i></span></label>").join("")
      : '<p class="empty">Je hebt geen open taken. Voeg er eerst een toe met +.</p>') +
    '<p class="msg" id="prioMsg"></p><button class="btn btn2" data-act="snel" data-soort="taak" data-prio="1">+ Nieuwe taak als prioriteit</button></div></div>';
  document.body.style.overflow = "hidden";
  prioTeller();
}
function prioTeller() { const n = document.querySelectorAll("[data-prio]:checked").length; const el = $("prioTel"); if (el) el.textContent = n + " van 3 gekozen."; }
async function prioWissel(cb) {
  const v = vandaag(), n = document.querySelectorAll("[data-prio]:checked").length, m = $("prioMsg");
  if (cb.checked && n > 3) { cb.checked = false; m.textContent = "Maximaal drie prioriteiten. Haal er eerst een weg."; return; }
  m.textContent = "";
  const { error } = await sb.from("taken").update({ dagprioriteit: cb.checked ? v : null }).eq("id", cb.dataset.prio);
  if (error) { cb.checked = !cb.checked; m.textContent = "Bewaren lukte niet: " + vertaalDbFout(error); }
  prioTeller(); herlaad("taken");
}

/* ---------- Snel toevoegen: taak of notitie, met optionele foto ---------- */
let SNEL = { soort: "taak", cat: "prive", dl: "", prio: false, foto: null };
function openSnel(soort, metPrio) {
  SNEL = { soort: soort || store.get("snelsoort", "taak"), cat: store.get("snelcat", "prive"), dl: "", prio: !!metPrio, foto: null };
  tekenSnel(); setTimeout(() => $("snelT")?.focus(), 60);
}
function tekenSnel() {
  const s = SNEL, v = vandaag(), tekst = $("snelT")?.value ?? "";
  $("sheet").innerHTML = '<div class="sheet snel" role="dialog" aria-label="Snel toevoegen"><header><button class="lnk" data-act="sheetdicht">Annuleren</button><b>Snel toevoegen</b><button class="lnk" data-act="snel-ok" style="font-weight:650">Bewaar</button></header><form class="sheetbody" id="snelForm">' +
    '<div class="seg" style="margin-bottom:10px"><button type="button" data-snel="soort" data-w="taak" class="' + (s.soort === "taak" ? "on" : "") + '">Taak</button><button type="button" data-snel="soort" data-w="notitie" class="' + (s.soort === "notitie" ? "on" : "") + '">Notitie</button></div>' +
    '<textarea id="snelT" rows="' + (s.soort === "taak" ? 2 : 4) + '" class="groot" placeholder="' + (s.soort === "taak" ? "Wat moet er gebeuren?" : "Schrijf je notitie…") + '" maxlength="' + (s.soort === "taak" ? 200 : 8000) + '" enterkeyhint="done">' + esc(tekst) + "</textarea>" +
    '<div class="chips">' + Object.entries(CAT).map(([k, c]) => '<button type="button" data-snel="cat" data-w="' + k + '" class="chip' + (s.cat === k ? " on" : "") + '">' + c.n + "</button>").join("") + "</div>" +
    (s.soort === "taak" ? '<div class="chips">' + [["", "Geen deadline"], [v, "Vandaag"], [plusDag(v, 1), "Morgen"], [plusDag(v, 7), "Over een week"]].map(([w, l]) => '<button type="button" data-snel="dl" data-w="' + w + '" class="chip' + (s.dl === w ? " on" : "") + '">' + l + "</button>").join("") + "</div>" +
      '<label class="chk"><input type="checkbox" id="snelPrio"' + (s.prio ? " checked" : "") + "><span>Prioriteit voor vandaag</span></label>" : "") +
    '<label class="btn btn2 fotoknop">📷 ' + (s.foto ? "Andere foto" : "Foto toevoegen") + '<input type="file" accept="image/*" id="snelFoto" hidden></label>' +
    (s.foto ? '<div class="foto"><img src="' + s.foto.url + '" alt="Gekozen foto"><button type="button" class="lnk" data-snel="foto-weg">Foto weghalen</button></div>' : "") +
    '<p class="msg" id="snelMsg"></p><button class="btn">Bewaar</button></form></div>';
  document.body.style.overflow = "hidden";
}
// foto verkleinen (max. 1600 px, JPEG) voor ze naar de privé-opslag gaat
async function verklein(file) {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((ok, nok) => { const i = new Image(); i.onload = () => ok(i); i.onerror = nok; i.src = url; });
    const f = Math.min(1, 1600 / Math.max(img.width, img.height)), c = document.createElement("canvas");
    c.width = Math.round(img.width * f); c.height = Math.round(img.height * f);
    c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
    const blob = await new Promise((ok) => c.toBlob(ok, "image/jpeg", 0.82));
    return { blob, url: c.toDataURL("image/jpeg", 0.6) };
  } finally { URL.revokeObjectURL(url); }
}
async function uploadFoto(blob) {
  const pad = S.user.id + "/" + (crypto.randomUUID ? crypto.randomUUID() : Date.now() + "-" + Math.random().toString(16).slice(2)) + ".jpg";
  const { error } = await sb.storage.from("foto").upload(pad, blob, { contentType: "image/jpeg", upsert: false });
  if (error) throw error;
  return pad;
}
async function snelBewaar() {
  const t = ($("snelT")?.value || "").trim(), m = $("snelMsg");
  if (!t && !(SNEL.soort === "notitie" && SNEL.foto)) { m.textContent = SNEL.soort === "taak" ? "Geef de taak een titel." : "Schrijf iets of voeg een foto toe."; return; }
  m.innerHTML = '<span class="spin"></span> Bewaren…';
  store.set("snelsoort", SNEL.soort); store.set("snelcat", SNEL.cat);
  try {
    let foto = null;
    if (SNEL.foto) { try { foto = await uploadFoto(SNEL.foto.blob); } catch (e) { throw new Error("de foto kon niet opgeladen worden (" + foutTekst(e) + ")"); } }
    if (SNEL.soort === "taak") {
      const prio = $("snelPrio")?.checked;
      const r = await sb.from("taken").insert({ titel: t.slice(0, 200), categorie: SNEL.cat, deadline: SNEL.dl || null, dagprioriteit: prio ? vandaag() : null, foto });
      if (r.error) throw r.error;
      await herlaad("taken");
    } else {
      const r = await sb.from("notities").insert({ tekst: t, categorie: SNEL.cat, foto });
      if (r.error) throw r.error;
      await herlaad("notities");
    }
    sluitSheet(); toast(SNEL.soort === "taak" ? "Taak bewaard" : "Notitie bewaard");
  } catch (e) { console.error(e); m.textContent = "Bewaren lukte niet: " + (e instanceof Error && /foto/.test(e.message) ? e.message : vertaalDbFout(e)); }
}
function openNotitie(n) {
  openForm({
    titel: "Notitie", geenFocus: true, waarden: n,
    spec: [{ k: "tekst", l: "Tekst", t: "area", max: 8000 }, { k: "categorie", l: "Categorie", t: "seg", o: [["prive", "Privé"], ["werk", "Werk"], ["sport", "Sport"]] }, { k: "klant_id", l: "Klant", t: "klant" }],
    extra: (n.foto ? '<div class="foto" id="notFoto"><span class="spin"></span></div>' : "") + '<button type="button" class="btn btn2" data-act="notitie-taak" data-id="' + esc(n.id) + '">Maak er een taak van</button>',
    opslaan: async (o) => { await opslaanRij("notities", { tekst: o.tekst, categorie: o.categorie, klant_id: o.klant_id }, n.id); await herlaad("notities"); },
    verwijderen: async () => { await verwijderRij("notities", n.id); if (n.foto) await sb.storage.from("foto").remove([n.foto]); await herlaad("notities"); },
  });
  if (n.foto) toonFoto(n.foto, "notFoto");
}
function toast(t) { const el = document.createElement("div"); el.className = "toast"; el.textContent = t; document.body.appendChild(el); setTimeout(() => el.remove(), 2200); }
