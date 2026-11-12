/* Slowpoke League — servidor.
   Sin dependencias: solo necesita Node.js 18 o superior.
   Arranque:  node server.js   (puerto 3000 por defecto)
   Variables opcionales: PORT, ADMIN_PASSWORD */
const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const L = require("./public/logic.js");

/* alwaysdata indica la dirección con ALWAYSDATA_HTTPD_IP y ALWAYSDATA_HTTPD_PORT */
const PORT = Number(process.env.PORT || process.env.ALWAYSDATA_HTTPD_PORT) || 3000;
const HOST = process.env.IP || process.env.ALWAYSDATA_HTTPD_IP || undefined;
const ROOT = __dirname;
const PUBLIC = path.join(ROOT, "public");
/* DATA_DIR: dónde se guarda la partida. En un hosting, apúntalo a un disco persistente. */
const DATA = process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : path.join(ROOT, "data");
const STATE_FILE = path.join(DATA, "state.json");
const PASS_FILE = path.join(DATA, "admin-password.txt");
const BANK_FILE = path.join(ROOT, "data", "banco_pokemon.json");
const DEX_FILE = path.join(ROOT, "data", "pokedex.json");
fs.mkdirSync(DATA, { recursive: true });

/* ---------- contraseña de la organización ---------- */
let ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
if (!ADMIN_PASSWORD) {
  if (fs.existsSync(PASS_FILE)) ADMIN_PASSWORD = fs.readFileSync(PASS_FILE, "utf8").trim();
  else { ADMIN_PASSWORD = "admin-" + crypto.randomBytes(4).toString("hex"); fs.writeFileSync(PASS_FILE, ADMIN_PASSWORD + "\n"); }
}

/* ---------- estado ---------- */
let state;
if (fs.existsSync(STATE_FILE)) {
  state = JSON.parse(fs.readFileSync(STATE_FILE, "utf8"));
} else {
  let bank = [];
  if (fs.existsSync(BANK_FILE)) {
    try { bank = L.assignIds(L.parseBankText(fs.readFileSync(BANK_FILE, "utf8")), []); }
    catch (e) { console.error("No se pudo leer el banco inicial:", e.message); }
  }
  state = L.initState(null, bank);
}
if (!state.streamKey) state.streamKey = L.code4().slice(5) + L.code4().slice(5) + L.code4().slice(5);

/* ---------- imágenes y tipos (PokéAPI) ---------- */
let DEX = {};
try { DEX = JSON.parse(fs.readFileSync(DEX_FILE, "utf8")); } catch (e) { console.error("No se pudo leer data/pokedex.json:", e.message); }
const triedLive = new Set();
async function liveLookup(name) {
  const key = L.dexKey(name);
  for (const url of [`https://pokeapi.co/api/v2/pokemon/${key}`, `https://pokeapi.co/api/v2/pokemon-species/${key}`]) {
    try {
      const r = await fetch(url, { signal: AbortSignal.timeout(8000) });
      if (!r.ok) continue;
      let j = await r.json();
      if (j.varieties) { const def = j.varieties.find(v => v.is_default) || j.varieties[0]; const r2 = await fetch(def.pokemon.url, { signal: AbortSignal.timeout(8000) }); if (!r2.ok) continue; j = await r2.json(); }
      const types = (j.types || []).sort((a, b) => a.slot - b.slot).map(t => t.type.name[0].toUpperCase() + t.type.name.slice(1));
      return [j.id, types.join("/")];
    } catch (e) { /* sin conexión o nombre desconocido */ }
  }
  return null;
}
function allSets() { return [...(state.bank || []), ...Object.values(state.teams || {}).flat()]; }
let enriching = false;
async function enrich() {
  if (enriching) return; enriching = true;
  try {
    const missing = L.enrichSets(allSets(), DEX);
    for (const s of missing) {
      const k = L.dexKey(s.species); if (triedLive.has(k)) continue; triedLive.add(k);
      const r = await liveLookup(s.species);
      if (r) { DEX[k] = r; } else console.log(`  Sin imagen para "${s.species}". Revisa que el nombre sea como en Showdown.`);
    }
    if (missing.length) L.enrichSets(allSets(), DEX);
  } finally { enriching = false; }
  save(); broadcast();
}

let saveTimer = null;
function save() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    const tmp = STATE_FILE + ".tmp";
    fs.writeFileSync(tmp, JSON.stringify(state));
    fs.renameSync(tmp, STATE_FILE);
  }, 200);
}
save();

/* ---------- tiempo real (Server-Sent Events) ---------- */
const clients = new Set();
function sessionOf(sid) { return sid && state.sessions[sid] ? state.sessions[sid] : null; }
function payloadFor(sid, isStream) {
  const s = sessionOf(sid);
  const role = s ? s.role : (isStream ? "stream" : "public");
  return JSON.stringify({
    you: s ? { role, pairId: s.pairId || null, name: s.name || "" } : { role: "public" },
    state: L.publicView(state, role, s && s.pairId),
  });
}
function broadcast() { for (const c of clients) c.res.write(`data: ${payloadFor(c.sid, c.stream)}\n\n`); }
setInterval(() => { for (const c of clients) c.res.write(": ping\n\n"); }, 25000);

/* ---------- utilidades HTTP ---------- */
const MIME = { ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".json": "application/json; charset=utf-8", ".svg": "image/svg+xml", ".png": "image/png", ".ico": "image/x-icon", ".woff2": "font/woff2", ".txt": "text/plain; charset=utf-8" };
function send(res, code, obj) { res.writeHead(code, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" }); res.end(JSON.stringify(obj)); }
function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0; const chunks = [];
    req.on("data", c => { size += c.length; if (size > 3 * 1024 * 1024) { reject(new Error("too big")); req.destroy(); } else chunks.push(c); });
    req.on("end", () => { try { resolve(JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}")); } catch (e) { reject(e); } });
    req.on("error", reject);
  });
}
const loginFails = new Map();
function tooManyFails(ip) {
  const now = Date.now(); const list = (loginFails.get(ip) || []).filter(t => now - t < 60000);
  loginFails.set(ip, list); return list.length >= 10;
}

/* ---------- rutas ---------- */
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://x");
  try {
    if (req.method === "GET" && url.pathname === "/api/events") {
      res.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-cache, no-transform", Connection: "keep-alive", "X-Accel-Buffering": "no" });
      const key = url.searchParams.get("stream") || "";
      const c = { res, sid: url.searchParams.get("sid") || "", stream: !!key && key === state.streamKey };
      clients.add(c);
      res.write(`retry: 2000\ndata: ${payloadFor(c.sid, c.stream)}\n\n`);
      req.on("close", () => clients.delete(c));
      return;
    }
    /* Respaldo para túneles o proxies que no dejan pasar el tiempo real: el navegador pregunta cada poco */
    if (req.method === "GET" && url.pathname === "/api/state") {
      const key = url.searchParams.get("stream") || "";
      res.writeHead(200, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
      return res.end(payloadFor(url.searchParams.get("sid") || "", !!key && key === state.streamKey));
    }
    if (req.method === "POST" && url.pathname === "/api/login") {
      const ip = req.socket.remoteAddress || "";
      if (tooManyFails(ip)) return send(res, 429, { error: "Demasiados intentos. Espera un minuto." });
      const body = await readBody(req);
      const code = String(body.code || "").trim();
      const name = String(body.name || "").trim().slice(0, 30);
      let session = null;
      if (code && code === ADMIN_PASSWORD) session = { role: "admin", name: name || "Organización" };
      else {
        const pid = Object.keys(state.codes).find(k => state.codes[k] === code.toUpperCase());
        if (pid) {
          if (!name) return send(res, 400, { error: "Escribe tu nombre para que el resto sepa quién eres." });
          session = { role: "player", pairId: pid, name };
        }
      }
      if (!session) { loginFails.get(ip).push(Date.now()); return send(res, 401, { error: "Ese código no es válido." }); }
      const sid = crypto.randomBytes(18).toString("base64url");
      state.sessions[sid] = { ...session, at: Date.now() };
      if (session.role === "player") state.log.push({ t: Date.now(), r: state.round, kind: "info", text: `${name} entra en ${L.pairName(state, session.pairId)}.` });
      state.v++; save(); broadcast();
      return send(res, 200, { sid, role: session.role, pairId: session.pairId || null });
    }
    if (req.method === "POST" && url.pathname === "/api/logout") {
      const body = await readBody(req);
      if (state.sessions[body.sid]) { delete state.sessions[body.sid]; state.v++; save(); broadcast(); }
      return send(res, 200, { ok: true });
    }
    if (req.method === "POST" && url.pathname === "/api/action") {
      const body = await readBody(req);
      const s = sessionOf(body.sid);
      if (!s) return send(res, 401, { error: "Tu sesión ha caducado. Vuelve a entrar con tu código." });
      const draft = L.clone(state);
      try {
        if (s.role === "admin") L.adminAction(draft, String(body.action), body.data);
        else L.playerAction(draft, s.pairId, String(body.action), body.data);
      } catch (e) {
        if (e instanceof L.GameError) return send(res, 400, { error: e.message });
        throw e;
      }
      state = draft; state.v++; save(); broadcast();
      if (/^bank/.test(String(body.action)) || body.action === "editSet") enrich();
      return send(res, 200, { ok: true });
    }
    if (req.method === "GET") {
      let p = url.pathname === "/" ? "/index.html" : decodeURIComponent(url.pathname);
      const file = path.normalize(path.join(PUBLIC, p));
      if (!file.startsWith(PUBLIC + path.sep)) { res.writeHead(403); return res.end(); }
      fs.readFile(file, (err, buf) => {
        if (err) { res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" }); return res.end("No encontrado"); }
        res.writeHead(200, { "Content-Type": MIME[path.extname(file)] || "application/octet-stream", "Cache-Control": "no-cache" });
        res.end(buf);
      });
      return;
    }
    res.writeHead(405); res.end();
  } catch (e) {
    console.error(e);
    if (!res.headersSent) send(res, 500, { error: "Error del servidor." });
  }
});

enrich();
server.listen(PORT, HOST, () => {
  console.log(`\n  Slowpoke League en marcha: http://localhost:${PORT}`);
  console.log(`  Contraseña de la organización: ${ADMIN_PASSWORD}`);
  console.log(`  Códigos de las parejas:`);
  state.pairs.forEach(p => console.log(`    ${p.name.padEnd(14)} ${state.codes[p.id]}`));
  console.log(`  Vista para OBS: http://localhost:${PORT}/?stream=${state.streamKey}#stream`);
  console.log("");
});
