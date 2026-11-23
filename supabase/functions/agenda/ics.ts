// AD Omniserve – iCal-agenda uitlezen (alleen lezen). Pure functies, zodat ze ook lokaal getest kunnen worden.
// ICAL = de bibliotheek ical.js (wordt meegegeven, zodat dit bestand zowel in Deno als in Node werkt).
// Regels:
//   - Terugkerende afspraken (RRULE, RDATE, EXDATE en aangepaste exemplaren) worden uitgerold binnen het venster.
//   - Tijden met een tijdzone (VTIMEZONE of een gekende IANA-naam) worden juist omgerekend naar UTC, ook rond zomer-/wintertijd.
//   - "Zwevende" tijden (zonder tijdzone) gelden als tijd in VASTE_TZ.
//   - Hele-dag-afspraken blijven datums (YYYY-MM-DD, einde exclusief), zonder tijdzone-omrekening.
//   - Geannuleerde afspraken (STATUS:CANCELLED) worden overgeslagen.
// deno-lint-ignore-file no-explicit-any

export const VASTE_TZ = "Europe/Brussels";
export const TOEGELATEN_HOSTS = [/^calendar\.google\.com$/, /^p\d+-caldav\.icloud\.com$/, /^p\d+-calendars\.icloud\.com$/, /(^|\.)icloud\.com$/,
  /^outlook\.office365\.com$/, /^outlook\.live\.com$/];

export type Item = { uid: string; titel: string; start: string; eind: string; heledag: boolean; locatie: string };

// "webcal://..." -> "https://..."; geeft null als de link niet toegelaten is
export function normaliseerLink(u: string): string | null {
  let s = String(u ?? "").trim();
  if (/^webcals?:\/\//i.test(s)) s = s.replace(/^webcals?:\/\//i, "https://");
  let url: URL;
  try { url = new URL(s); } catch { return null; }
  if (url.protocol !== "https:" || url.username || url.password || (url.port && url.port !== "443")) return null;
  if (!TOEGELATEN_HOSTS.some((r) => r.test(url.hostname))) return null;
  return url.toString();
}

// offset (ms) van een tijdzone op een bepaald UTC-moment
function offsetMs(tz: string, utcMs: number): number {
  const f = new Intl.DateTimeFormat("en-US", { timeZone: tz, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" });
  const p: Record<string, number> = {};
  for (const x of f.formatToParts(new Date(utcMs))) if (x.type !== "literal") p[x.type] = Number(x.value);
  return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - Math.floor(utcMs / 1000) * 1000;
}
export function geldigeTz(tz: string) { try { new Intl.DateTimeFormat("en-US", { timeZone: tz }); return true; } catch { return false; } }
// wandkloktijd in een tijdzone -> UTC-milliseconden (juist rond de omschakeling van zomer- naar wintertijd)
export function wandklokNaarUtc(y: number, mo: number, d: number, h: number, mi: number, s: number, tz: string): number {
  const naief = Date.UTC(y, mo - 1, d, h, mi, s);
  let t = naief - offsetMs(tz, naief);
  t = naief - offsetMs(tz, t);
  return t;
}

const datum = (t: any) => `${t.year}-${String(t.month).padStart(2, "0")}-${String(t.day).padStart(2, "0")}`;
function naarUtcMs(ICAL: any, t: any): number {
  const zone = t.zone;
  const tzid = t.timezone || (zone && zone.tzid) || "";
  if (zone === ICAL.Timezone.utcTimezone || tzid === "UTC" || tzid === "Z") return t.toUnixTime() * 1000;
  // tijdzone gekend via een VTIMEZONE-blok in het bestand
  if (zone && zone !== ICAL.Timezone.localTimezone && zone.tzid && zone.tzid !== "floating" && zone.component) return t.toUnixTime() * 1000;
  // anders: IANA-naam (bv. Europe/Brussels) of zwevend -> vaste tijdzone
  const tz = tzid && geldigeTz(tzid) ? tzid : VASTE_TZ;
  return wandklokNaarUtc(t.year, t.month, t.day, t.hour, t.minute, t.second, tz);
}

export function uitbreiden(ICAL: any, tekst: string, vanMs: number, totMs: number, max = 3000): { naam: string; items: Item[] } {
  const root = new ICAL.Component(ICAL.parse(tekst));
  for (const vtz of root.getAllSubcomponents("vtimezone")) {
    try { const tz = new ICAL.Timezone(vtz); if (tz.tzid && !ICAL.TimezoneService.has(tz.tzid)) ICAL.TimezoneService.register(tz.tzid, tz); } catch { /* onbruikbare tijdzone: val terug op naam */ }
  }
  const naam = String(root.getFirstPropertyValue("x-wr-calname") ?? "");
  const vevents = root.getAllSubcomponents("vevent");
  const uitzonderingen = new Map<string, any[]>();
  const hoofd: any[] = [];
  for (const v of vevents) {
    if (v.hasProperty("recurrence-id")) { const uid = String(v.getFirstPropertyValue("uid") ?? ""); (uitzonderingen.get(uid) ?? uitzonderingen.set(uid, []).get(uid))!.push(v); }
    else hoofd.push(v);
  }
  const items: Item[] = [];
  const voegToe = (uid: string, ev: any, start: any, eind: any, status: string) => {
    if (items.length >= max || /CANCELLED/i.test(status)) return;
    const heledag = !!start.isDate;
    let s: string, e: string, sMs: number, eMs: number;
    if (heledag) {
      s = datum(start); e = eind ? datum(eind) : s;
      if (e <= s) { const d = new Date(s + "T12:00:00Z"); d.setUTCDate(d.getUTCDate() + 1); e = d.toISOString().slice(0, 10); }
      sMs = Date.parse(s + "T00:00:00Z") - 14 * 3600e3; eMs = Date.parse(e + "T00:00:00Z") + 14 * 3600e3; // ruim, want datums hebben geen tijdzone
    } else {
      sMs = naarUtcMs(ICAL, start); eMs = eind ? naarUtcMs(ICAL, eind) : sMs;
      if (eMs < sMs) eMs = sMs;
      s = new Date(sMs).toISOString(); e = new Date(eMs).toISOString();
    }
    if (eMs < vanMs || sMs > totMs) return;
    if (eMs === sMs && sMs < vanMs) return;
    items.push({ uid, titel: String(ev.summary ?? "").slice(0, 200) || "(zonder titel)", start: s, eind: e, heledag, locatie: String(ev.location ?? "").slice(0, 200) });
  };
  for (const v of hoofd) {
    const ev = new ICAL.Event(v);
    const uid = String(ev.uid ?? "");
    for (const x of uitzonderingen.get(uid) ?? []) { try { ev.relateException(x); } catch { /* */ } }
    uitzonderingen.delete(uid);
    const status = String(v.getFirstPropertyValue("status") ?? "");
    if (ev.isRecurring()) {
      const it = ev.iterator();
      let n = 0, t;
      while ((t = it.next()) && n++ < 5000 && items.length < max) {
        if (t.toUnixTime() * 1000 > totMs + 86400e3) break;
        const det = ev.getOccurrenceDetails(t);
        const st = det.item?.component ? String(det.item.component.getFirstPropertyValue("status") ?? status) : status;
        voegToe(uid, det.item, det.startDate, det.endDate, st);
      }
    } else voegToe(uid, ev, ev.startDate, ev.endDate, status);
  }
  // losse aangepaste exemplaren zonder hoofdafspraak
  for (const [uid, lijst] of uitzonderingen) for (const v of lijst) { const ev = new ICAL.Event(v); voegToe(uid, ev, ev.startDate, ev.endDate, String(v.getFirstPropertyValue("status") ?? "")); }
  items.sort((a, b) => a.start.localeCompare(b.start));
  return { naam, items };
}
