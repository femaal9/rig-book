import {fail, limited} from "../_lib.js";

// Promemoria "cambia le corde" come evento di calendario (.ics), creato al volo: non salva niente.
// GET /api/ics?t=<nome>&d=<scadenza AAAA-MM-GG>&c=<ultimo cambio>&g=<scalatura>&b=<marca>&id=<id pezzo>
// Su iPhone Safari apre direttamente "Aggiungi al calendario"; altrove scarica il file.
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const clean = (s, max) => String(s ?? "").replace(/[\u0000-\u001f\u007f\u2028\u2029]/g, " ").trim().slice(0, max);
const icsText = s => s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,");
const itDate = s => s.split("-").reverse().join("/");
function okDate(s){
  if(!DATE_RE.test(s)) return false;
  const [y, m, d] = s.split("-").map(Number), t = new Date(Date.UTC(y, m - 1, d));
  return t.getUTCMonth() === m - 1 && y >= 2000 && y <= 2100;
}
// righe .ics al massimo di 75 byte, le successive iniziano con uno spazio
function fold(line){
  const enc = new TextEncoder(), out = [];
  let cur = "", n = 0;
  for(const ch of line){
    const b = enc.encode(ch).length;
    if(n + b > (out.length ? 74 : 75)){ out.push(cur); cur = ""; n = 0; }
    cur += ch; n += b;
  }
  out.push(cur);
  return out.join("\r\n ");
}

export async function onRequestGet({request, env}){
  if(await limited(env.DB, request, "ics", 120)) return fail("SLOW_DOWN", 429);
  const q = new URL(request.url).searchParams;
  const due = clean(q.get("d"), 10), changed = clean(q.get("c"), 10);
  if(!okDate(due) || (changed && !okDate(changed))) return fail("BAD_DATE", 400);
  const name = clean(q.get("t"), 80) || "la chitarra";
  const gauge = clean(q.get("g"), 30), brand = clean(q.get("b"), 40);
  const id = clean(q.get("id"), 100).replace(/[^A-Za-z0-9_\-.~:+]/g, "") || "pezzo";

  const day = due.replace(/-/g, ""), [y, m, d] = due.split("-").map(Number);
  const next = new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10).replace(/-/g, "");
  const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d+Z$/, "Z");
  const what = [gauge, brand].filter(Boolean).join(" ");
  const info = [
    changed && `Ultimo cambio: ${itDate(changed)}.`,
    what && `Corde: ${what}.`,
    "Quando le cambi, aggiorna la data in Rig Book: https://femaal9.github.io/rig-book/",
  ].filter(Boolean).map(icsText).join("\\n");

  const lines = [
    "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Rig Book//Promemoria corde//IT", "CALSCALE:GREGORIAN", "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:corde-${id}-${day}@rig-book`,
    `DTSTAMP:${stamp}`,
    `DTSTART;VALUE=DATE:${day}`,
    `DTEND;VALUE=DATE:${next}`,
    `SUMMARY:${icsText("Cambia le corde: " + name)}`,
    `DESCRIPTION:${info}`,
    "TRANSP:TRANSPARENT",
    "BEGIN:VALARM", "ACTION:DISPLAY", `DESCRIPTION:${icsText("Cambia le corde: " + name)}`, "TRIGGER:PT9H", "END:VALARM",
    "END:VEVENT", "END:VCALENDAR",
  ];
  return new Response(lines.map(fold).join("\r\n") + "\r\n", {headers: {
    "Content-Type": "text/calendar; charset=utf-8",
    "Content-Disposition": 'attachment; filename="cambia-corde.ics"',
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
  }});
}
