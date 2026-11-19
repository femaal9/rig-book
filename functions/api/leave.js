import {json, fail, auth, eraseStatements} from "../_lib.js";

// scollega questo dispositivo; se era l'ultimo, la copia online non serve più e si cancella
export async function onRequestPost({request, env}){
  const db = env.DB, who = await auth(request, db);
  if(!who) return fail("UNLINKED", 401);
  await db.prepare("DELETE FROM tokens WHERE hash = ?").bind(who.hash).run();
  const left = await db.prepare("SELECT COUNT(*) AS n FROM tokens WHERE account = ?").bind(who.account).first();
  if(!left?.n) await db.batch(eraseStatements(db, who.account));
  return json({ok: true});
}
