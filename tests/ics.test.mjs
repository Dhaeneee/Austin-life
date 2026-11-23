// Test van de iCal-verwerking (node --experimental-strip-types tests/ics.test.mjs, met ical.js geïnstalleerd)
import assert from "node:assert/strict";
import ICAL from "ical.js";
import { uitbreiden, normaliseerLink, wandklokNaarUtc } from "../supabase/functions/agenda/ics.ts";

const VTZ = `BEGIN:VTIMEZONE
TZID:Europe/Brussels
BEGIN:DAYLIGHT
TZOFFSETFROM:+0100
TZOFFSETTO:+0200
TZNAME:CEST
DTSTART:19700329T020000
RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU
END:DAYLIGHT
BEGIN:STANDARD
TZOFFSETFROM:+0200
TZOFFSETTO:+0100
TZNAME:CET
DTSTART:19701025T030000
RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU
END:STANDARD
END:VTIMEZONE`;
const cal = (body) => `BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:test\r\nX-WR-CALNAME:Werk\r\n${VTZ}\r\n${body}\r\nEND:VCALENDAR`.replace(/\r?\n/g, "\r\n");

const ics = cal(`BEGIN:VEVENT
UID:wekelijks@test
SUMMARY:Teamoverleg
DTSTART;TZID=Europe/Brussels:20261013T090000
DTEND;TZID=Europe/Brussels:20261013T100000
RRULE:FREQ=WEEKLY;COUNT=5
EXDATE;TZID=Europe/Brussels:20261020T090000
END:VEVENT
BEGIN:VEVENT
UID:wekelijks@test
RECURRENCE-ID;TZID=Europe/Brussels:20261103T090000
SUMMARY:Teamoverleg (verplaatst)
DTSTART;TZID=Europe/Brussels:20261103T140000
DTEND;TZID=Europe/Brussels:20261103T150000
END:VEVENT
BEGIN:VEVENT
UID:heledag@test
SUMMARY:Verlof
DTSTART;VALUE=DATE:20261030
DTEND;VALUE=DATE:20261031
END:VEVENT
BEGIN:VEVENT
UID:geannuleerd@test
SUMMARY:Gaat niet door
STATUS:CANCELLED
DTSTART:20261028T120000Z
DTEND:20261028T130000Z
END:VEVENT
BEGIN:VEVENT
UID:zwevend@test
SUMMARY:Zwevend
DTSTART:20261201T080000
DTEND:20261201T083000
END:VEVENT
BEGIN:VEVENT
UID:utc@test
SUMMARY:UTC
DTSTART:20261201T080000Z
DTEND:20261201T090000Z
END:VEVENT
BEGIN:VEVENT
UID:ny@test
SUMMARY:New York zonder VTIMEZONE
DTSTART;TZID=America/New_York:20261201T090000
DTEND;TZID=America/New_York:20261201T100000
END:VEVENT`);

const r = uitbreiden(ICAL, ics, Date.parse("2026-10-01T00:00:00Z"), Date.parse("2026-12-31T00:00:00Z"));
const by = (t) => r.items.filter((i) => i.titel === t);
assert.equal(r.naam, "Werk");
const team = by("Teamoverleg").map((i) => i.start);
// 13/10 zomertijd (UTC+2) -> 07:00Z; 20/10 uitgezonderd; 27/10 wintertijd (UTC+1) -> 08:00Z; 3/11 verplaatst; 10/11 -> 08:00Z
assert.deepEqual(team, ["2026-10-13T07:00:00.000Z", "2026-10-27T08:00:00.000Z", "2026-11-10T08:00:00.000Z"]);
assert.deepEqual(by("Teamoverleg (verplaatst)").map((i) => i.start), ["2026-11-03T13:00:00.000Z"]);
assert.deepEqual(by("Verlof").map((i) => [i.start, i.eind, i.heledag]), [["2026-10-30", "2026-10-31", true]]);
assert.equal(by("Gaat niet door").length, 0, "geannuleerd wordt overgeslagen");
assert.equal(by("Zwevend")[0].start, "2026-12-01T07:00:00.000Z", "zwevend = Brusselse tijd (winter UTC+1)");
assert.equal(by("UTC")[0].start, "2026-12-01T08:00:00.000Z");
assert.equal(by("New York zonder VTIMEZONE")[0].start, "2026-12-01T14:00:00.000Z");
// venster: niets buiten het venster
const r2 = uitbreiden(ICAL, ics, Date.parse("2026-11-05T00:00:00Z"), Date.parse("2026-11-20T00:00:00Z"));
assert.deepEqual(r2.items.map((i) => i.titel), ["Teamoverleg"]);
// omschakeling: 29 maart 2026 02:30 bestaat niet; 25 oktober 2026 02:30 bestaat twee keer -> geen crash, plausibel resultaat
assert.equal(new Date(wandklokNaarUtc(2026, 3, 29, 12, 0, 0, "Europe/Brussels")).toISOString(), "2026-03-29T10:00:00.000Z");
assert.equal(new Date(wandklokNaarUtc(2026, 3, 28, 12, 0, 0, "Europe/Brussels")).toISOString(), "2026-03-28T11:00:00.000Z");
// links
assert.equal(normaliseerLink("webcal://p57-caldav.icloud.com/published/2/abc"), "https://p57-caldav.icloud.com/published/2/abc");
assert.ok(normaliseerLink("https://calendar.google.com/calendar/ical/x%40gmail.com/private-abc/basic.ics"));
assert.equal(normaliseerLink("http://calendar.google.com/x"), null, "geen http");
assert.equal(normaliseerLink("https://evil.example.com/x.ics"), null, "geen willekeurige servers");
assert.equal(normaliseerLink("https://user:pw@calendar.google.com/x"), null);
assert.equal(normaliseerLink("https://calendar.google.com:8443/x"), null);
console.log("iCal-tests geslaagd:", r.items.length, "afspraken uitgerold");
