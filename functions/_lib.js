// Rig Book, server di sincronizzazione (Cloudflare Pages Functions + database D1 collegato come DB).
// Nessun dato personale: un "conto" anonimo, i token dei dispositivi (solo l'impronta SHA-256) e i pezzi.

// siti da cui l'app può chiamare il server (oltre allo stesso indirizzo del server)
export const ORIGINS = ["https://femaal9.github.io"];
export const MAX_ITEMS = 5000;          // pezzi per conto
export const MAX_ITEM_BYTES = 100000;   // un pezzo, in JSON
export const CODE_MINUTES = 10;         // validità del codice per collegare un dispositivo
export const CODE_ABC = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // niente I, O, 0, 1: si leggono male
export const CODE_RE = /^[A-HJ-NP-Z2-9]{8}$/;
export const ID_RE = /^[A-Za-z0-9_\-.~:@+]{1,100}$/;

const SCHEMA = [
  "CREATE TABLE IF NOT EXISTS accounts(id TEXT PRIMARY KEY, created INTEGER NOT NULL)",
  "CREATE TABLE IF NOT EXISTS tokens(hash TEXT PRIMARY KEY, account TEXT NOT NULL, created INTEGER NOT NULL)",
  "CREATE INDEX IF NOT EXISTS tokens_account ON tokens(account)",
  "CREATE TABLE IF NOT EXISTS codes(hash TEXT PRIMARY KEY, account TEXT NOT NULL, expires INTEGER NOT NULL)",
  "CREATE TABLE IF NOT EXISTS items(account TEXT NOT NULL, id TEXT NOT NULL, t INTEGER NOT NULL, del INTEGER NOT NULL, d TEXT NOT NULL, rev INTEGER NOT NULL, PRIMARY KEY(account, id))",
  "CREATE INDEX IF NOT EXISTS items_rev ON items(account, rev)",
  "CREATE TABLE IF NOT EXISTS hits(key TEXT PRIMARY KEY, n INTEGER NOT NULL, hour INTEGER NOT NULL)",
];
let schemaReady = null;
export function ready(db){
  if(!schemaReady) schemaReady = db.batch(SCHEMA.map(s => db.prepare(s))).catch(e => { schemaReady = null; throw e; });
  return schemaReady;
}

export function cors(request){
  const o = request.headers.get("Origin"), h = {"Vary": "Origin"};
  if(o && (ORIGINS.includes(o) || o === new URL(request.url).origin)){
    h["Access-Control-Allow-Origin"] = o;
    h["Access-Control-Allow-Headers"] = "Content-Type, Authorization";
    h["Access-Control-Allow-Methods"] = "GET, POST, OPTIONS";
    h["Access-Control-Max-Age"] = "86400";
  }
  return h;
}
export const json = (obj, status = 200) => new Response(JSON.stringify(obj), {status, headers: {
  "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff"}});
export const fail = (code, status) => json({error: code}, status);

const hex = buf => Array.from(new Uint8Array(buf), b => b.toString(16).padStart(2, "0")).join("");
export const sha = async s => hex(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s)));
export function rand(bytes){
  const b = crypto.getRandomValues(new Uint8Array(bytes));
  return btoa(String.fromCharCode(...b)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

// corpo JSON con un limite di dimensione
export async function readBody(request, maxBytes){
  const len = Number(request.headers.get("Content-Length") || 0);
  if(len > maxBytes) throw fail("TOO_BIG", 413);
  const text = await request.text();
  if(text.length > maxBytes) throw fail("TOO_BIG", 413);
  let b;
  try{ b = text ? JSON.parse(text) : {}; }catch{ throw fail("BAD_JSON", 400); }
  if(!b || typeof b !== "object" || Array.isArray(b)) throw fail("BAD_JSON", 400);
  return b;
}

// dispositivo collegato: "Authorization: Bearer <token>"
export async function auth(request, db){
  const m = /^Bearer ([A-Za-z0-9_-]{32,128})$/.exec(request.headers.get("Authorization") || "");
  if(!m) return null;
  const hash = await sha("token:" + m[1]);
  const row = await db.prepare("SELECT account FROM tokens WHERE hash = ?").bind(hash).first();
  return row ? {account: row.account, hash} : null;
}
export async function newToken(db, account){
  const token = rand(32);
  await db.prepare("INSERT INTO tokens(hash, account, created) VALUES(?, ?, ?)").bind(await sha("token:" + token), account, Date.now()).run();
  return token;
}

// limite di richieste per rete e per ora; vero = troppe
export async function limited(db, request, action, max){
  const hour = Math.floor(Date.now() / 3600000);
  const key = await sha(`${action}:${request.headers.get("CF-Connecting-IP") || "?"}:${hour}`);
  const row = await db.prepare("INSERT INTO hits(key, n, hour) VALUES(?, 1, ?) ON CONFLICT(key) DO UPDATE SET n = n + 1 RETURNING n")
    .bind(key, hour).first();
  if(Math.random() < 0.02) await db.prepare("DELETE FROM hits WHERE hour < ?").bind(hour - 1).run();
  return (row?.n || 0) > max;
}

// cancella tutto quello che riguarda un conto
export function eraseStatements(db, account){
  return ["items", "codes", "tokens"].map(t => db.prepare(`DELETE FROM ${t} WHERE account = ?`).bind(account))
    .concat(db.prepare("DELETE FROM accounts WHERE id = ?").bind(account));
}
