import {json, fail, auth, sha, limited, CODE_ABC, CODE_MINUTES} from "../_lib.js";

// codice di 8 caratteri per collegare un altro dispositivo (vale 10 minuti, una volta sola)
export async function onRequestPost({request, env}){
  const db = env.DB, who = await auth(request, db);
  if(!who) return fail("UNLINKED", 401);
  if(await limited(db, request, "code", 30)) return fail("RATE", 429);
  const code = Array.from(crypto.getRandomValues(new Uint8Array(8)), b => CODE_ABC[b & 31]).join("");
  const now = Date.now(), expires = now + CODE_MINUTES * 60000;
  await db.batch([
    db.prepare("DELETE FROM codes WHERE account = ? OR expires < ?").bind(who.account, now),
    db.prepare("INSERT INTO codes(hash, account, expires) VALUES(?, ?, ?)").bind(await sha("code:" + code), who.account, expires),
  ]);
  return json({code, expires});
}
