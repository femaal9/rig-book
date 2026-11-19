import {json, fail, rand, limited, newToken} from "../_lib.js";

// primo dispositivo: crea un conto anonimo e il suo token
export async function onRequestPost({request, env}){
  const db = env.DB;
  if(await limited(db, request, "account", 10)) return fail("RATE", 429);
  const acct = rand(18);
  await db.prepare("INSERT INTO accounts(id, created) VALUES(?, ?)").bind(acct, Date.now()).run();
  return json({acct, token: await newToken(db, acct)});
}
