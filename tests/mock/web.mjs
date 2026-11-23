// Statische server voor lokale tests (poort 8089)
import http from "node:http"; import fs from "node:fs"; import path from "node:path";
const R = path.resolve(path.dirname(new URL(import.meta.url).pathname), "../..");
const T = { ".html": "text/html", ".js": "text/javascript", ".png": "image/png", ".json": "application/json", ".webmanifest": "application/manifest+json" };
http.createServer((q, r) => { const p = path.join(R, decodeURIComponent(new URL(q.url, "http://x").pathname)); if (!p.startsWith(R) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { r.writeHead(404); return r.end(); } r.writeHead(200, { "Content-Type": T[path.extname(p)] || "application/octet-stream", "Cache-Control": "no-store" }); fs.createReadStream(p).pipe(r); }).listen(Number(process.env.WEBPORT || 8089));
