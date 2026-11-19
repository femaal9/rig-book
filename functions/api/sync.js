import {json, fail, auth, readBody, ID_RE, MAX_ITEMS, MAX_ITEM_BYTES} from "../_lib.js";

// Una sola richiesta: il dispositivo manda le sue modifiche e riceve quelle arrivate da "since" in poi.
// Vince la versione con updatedAt (t) più alto; le eliminazioni sono righe con del = 1.
export async function onRequestPost({request, env}){
  const db = env.DB, who = await auth(request, db);
  if(!who) return fail("UNLINKED", 401);
  const b = await readBody(request, 4000000);
  const since = Number.isSafeInteger(b.since) && b.since > 0 ? b.since : 0;
  const changes = b.changes == null ? [] : b.changes;
  if(!Array.isArray(changes)) return fail("BAD_JSON", 400);
  if(changes.length > 500) return fail("TOO_MANY", 413);

  const clean = new Map();
  for(const c of changes){
    if(!c || typeof c !== "object" || typeof c.id !== "string" || !ID_RE.test(c.id) || !Number.isSafeInteger(c.t) || c.t <= 0) return fail("BAD_ITEM", 400);
    const del = c.del === true;
    let d = "";
    if(!del){
      if(!c.d || typeof c.d !== "object" || Array.isArray(c.d)) return fail("BAD_ITEM", 400);
      d = JSON.stringify(c.d);
      if(d.length > MAX_ITEM_BYTES) return fail("TOO_BIG", 413);
    }
    const prev = clean.get(c.id);
    if(!prev || c.t > prev.t) clean.set(c.id, {id: c.id, t: c.t, del, d});
  }

  const now = Date.now(), lost = [];
  if(clean.size){
    const cur = new Map(), ids = [...clean.keys()];
    for(let i = 0; i < ids.length; i += 90){
      const part = ids.slice(i, i + 90);
      const {results} = await db.prepare(`SELECT id, t, del, d FROM items WHERE account = ? AND id IN (${part.map(() => "?").join(",")})`)
        .bind(who.account, ...part).all();
      for(const r of results) cur.set(r.id, r);
    }
    const fresh = ids.filter(id => !cur.has(id)).length;
    if(fresh){
      const n = (await db.prepare("SELECT COUNT(*) AS n FROM items WHERE account = ?").bind(who.account).first())?.n || 0;
      if(n + fresh > MAX_ITEMS) return fail("FULL", 413);
    }
    const stmts = [];
    for(const c of clean.values()){
      const old = cur.get(c.id);
      if(old && old.t >= c.t){ if(old.t > c.t) lost.push(old); continue; }   // sul server c'è già una versione più nuova
      stmts.push(db.prepare("INSERT INTO items(account, id, t, del, d, rev) VALUES(?, ?, ?, ?, ?, ?) ON CONFLICT(account, id) DO UPDATE SET t = excluded.t, del = excluded.del, d = excluded.d, rev = excluded.rev WHERE excluded.t > items.t")
        .bind(who.account, c.id, c.t, c.del ? 1 : 0, c.d, now));
    }
    for(let i = 0; i < stmts.length; i += 100) await db.batch(stmts.slice(i, i + 100));
  }

  const {results} = await db.prepare("SELECT id, t, del, d FROM items WHERE account = ? AND rev >= ?").bind(who.account, since).all();
  const out = r => r.del ? {id: r.id, t: r.t, del: true} : {id: r.id, t: r.t, d: JSON.parse(r.d)};
  // 10 secondi di margine: le scritture arrivate nello stesso momento da un altro dispositivo non si perdono
  return json({rows: results.concat(lost).map(out), cursor: now - 10000});
}
