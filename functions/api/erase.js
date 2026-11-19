import {json, fail, auth, eraseStatements} from "../_lib.js";

// cancella i pezzi online e scollega tutti i dispositivi (ognuno tiene la sua copia locale)
export async function onRequestPost({request, env}){
  const db = env.DB, who = await auth(request, db);
  if(!who) return fail("UNLINKED", 401);
  await db.batch(eraseStatements(db, who.account));
  return json({ok: true});
}
