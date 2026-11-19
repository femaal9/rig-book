import {json, fail, sha, limited, readBody, newToken, CODE_RE} from "../_lib.js";

// nuovo dispositivo: scambia il codice con un token suo, legato allo stesso conto
export async function onRequestPost({request, env}){
  const db = env.DB;
  if(await limited(db, request, "join", 20)) return fail("RATE", 429);
  const b = await readBody(request, 1000);
  const code = String(b.code ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  if(!CODE_RE.test(code)) return fail("BAD_CODE", 400);
  const row = await db.prepare("DELETE FROM codes WHERE hash = ? AND expires > ? RETURNING account").bind(await sha("code:" + code), Date.now()).first();
  if(!row) return fail("BAD_CODE", 400);
  return json({acct: row.account, token: await newToken(db, row.account)});
}
