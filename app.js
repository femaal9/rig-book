"use strict";
// Rig Book — inventario del gear. Tutti i dati restano su questo dispositivo (localStorage).

// ---------- costanti ----------
const CATS = [
  {k:"guitar", code:"GTR", label:"Chitarre", one:"Chitarra", strings:true},
  {k:"bass", code:"BAS", label:"Bassi", one:"Basso", strings:true},
  {k:"amp", code:"AMP", label:"Amplificatori", one:"Amplificatore"},
  {k:"fx", code:"FX", label:"Effetti e pedali", one:"Effetto / pedale"},
  {k:"interface", code:"I/O", label:"Schede audio", one:"Scheda audio"},
  {k:"monitor", code:"MON", label:"Monitor e cuffie", one:"Monitor / cuffie"},
  {k:"mic", code:"MIC", label:"Microfoni", one:"Microfono"},
  {k:"keys", code:"KEY", label:"Tastiere e synth", one:"Tastiera / synth"},
  {k:"computer", code:"CPU", label:"Computer", one:"Computer"},
  {k:"other", code:"MISC", label:"Altro", one:"Altro"},
];
// oggetti senza prototipo: chiavi come "constructor" o "__proto__" non risultano valide
const dict = o => Object.assign(Object.create(null), o);
const CAT = dict(Object.fromEntries(CATS.map(c => [c.k, c])));
const CAT_ORDER = dict(Object.fromEntries(CATS.map((c, n) => [c.k, n])));
const STATUS = dict({active:"In uso", lent:"In prestito", repair:"In riparazione", sold:"Venduto"});
const COND = dict({new:"Nuovo", used:"Usato", bstock:"B-stock"});
const FIELDS = ["cat","brand","model","finish","serial","year","status","gauge","sbrand","tuning","changed","setup","buyYear","price","where","cond","soldPrice","notes"];
const STRING_FIELDS = ["gauge","sbrand","tuning","changed","setup"];
const NUMS = new Set(["year","buyYear","price","soldPrice"]);
const YEARS = new Set(["year","buyYear"]);
const MAXLEN = {notes:20000};       // limite di sicurezza per dati importati; il modulo ha i suoi maxlength
const MAXLEN_DEFAULT = 1000;
const MIN_YEAR = 1800;
const OLD_DAYS = 120;
const MAX_PRICE = 10_000_000;
const MAX_IMPORT_BYTES = 5_000_000;
const MAX_IMPORT_ITEMS = 10_000;
const BACKUP_REMIND_DAYS = 30;

const $ = id => document.getElementById(id);

// icone per categoria (tratto, 24×24)
const ICONS = {
  guitar:'<path d="M14.5 9.5 20 4"/><path d="m18.5 2.5 3 3"/><path d="M10.2 9.8a3.6 3.6 0 0 0-5 1.3 3.1 3.1 0 0 0-2.3 3c0 3 4.4 7.5 7.4 7.4a3.1 3.1 0 0 0 3-2.3 3.6 3.6 0 0 0 1.3-5c-.6-1-.3-2.3.6-3.1"/><circle cx="9.3" cy="14.7" r="1.4"/>',
  bass:'<path d="M12.8 11.2 21 3"/><path d="m19.2 1.5 3.3 3.3"/><path d="M9 11a3.4 3.4 0 0 0-4.7 1.2A2.9 2.9 0 0 0 2.2 15c0 2.8 4.1 7 6.9 6.9a2.9 2.9 0 0 0 2.8-2.1 3.4 3.4 0 0 0 1.2-4.7c-.5-.9-.3-2.1.6-2.9"/><path d="m7.5 16.5 2-2"/>',
  amp:'<rect x="3" y="5" width="18" height="15" rx="2"/><path d="M3 9h18"/><circle cx="12" cy="14.5" r="3"/><path d="M6.5 7h.01M9.5 7h.01"/>',
  fx:'<rect x="6" y="2.5" width="12" height="19" rx="2"/><circle cx="9.5" cy="6.5" r="1.2"/><circle cx="14.5" cy="6.5" r="1.2"/><circle cx="12" cy="15.5" r="2.6"/>',
  interface:'<rect x="2" y="7" width="20" height="10" rx="2"/><circle cx="7" cy="12" r="2"/><circle cx="13" cy="12" r="2"/><path d="M17.5 10.5v3M19.5 10.5v3"/>',
  monitor:'<path d="M3 15v-3a9 9 0 0 1 18 0v3"/><rect x="2.5" y="14" width="4.5" height="7" rx="1.5"/><rect x="17" y="14" width="4.5" height="7" rx="1.5"/>',
  mic:'<rect x="9" y="2" width="6" height="12" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v4M8 22h8"/>',
  keys:'<rect x="2" y="6" width="20" height="12" rx="2"/><path d="M7 6v7M12 6v7M17 6v7M2 13h20"/>',
  computer:'<rect x="3" y="4" width="18" height="12" rx="2"/><path d="M8 20h8M12 16v4"/>',
  other:'<rect x="3" y="7" width="18" height="13" rx="2"/><path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M3 12h18"/>',
};
const icon = k => `<svg class="i" viewBox="0 0 24 24" aria-hidden="true">${ICONS[k] || ICONS.other}</svg>`;

// Pagina e script di versioni diverse (cache del vecchio service worker): ripara e ricarica una volta.
if(!$("sort") || !$("notes") || !$("toast") || !$("sBars") || !$("topbar")){
  let tried = false;
  try{ tried = sessionStorage.getItem("rigbook.repair") === "1"; sessionStorage.setItem("rigbook.repair", "1"); }catch{}
  const msg = document.createElement("p");
  msg.style.cssText = "padding:16px;font:16px system-ui";
  msg.textContent = tried ? "Rig Book si sta aggiornando. Chiudi l'app e riaprila: i tuoi dati sono al sicuro." : "Aggiorno Rig Book…";
  document.body.prepend(msg);
  if(!tried){
    Promise.resolve()
      .then(() => window.caches ? caches.keys().then(ks => Promise.all(ks.filter(k => k.startsWith("rigbook-")).map(k => caches.delete(k)))) : 0)
      .then(() => navigator.serviceWorker?.getRegistration().then(r => r?.waiting?.postMessage("SKIP_WAITING")))
      .catch(() => {})
      .finally(() => setTimeout(() => location.reload(), 600));
  }
  throw new Error("Rig Book: versione della pagina non allineata");
}
try{ sessionStorage.removeItem("rigbook.repair"); }catch{}
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const has = (o, k) => typeof k === "string" && Object.prototype.hasOwnProperty.call(o, k);

// formattazione importi: senza decimali se interi, altrimenti due
const EUR = (() => {
  const make = d => { try{ return new Intl.NumberFormat("it-IT", {style:"currency", currency:"EUR", minimumFractionDigits:d, maximumFractionDigits:d}); }catch{ return null; } };
  const f0 = make(0), f2 = make(2);
  return n => {
    n = Number(n) || 0;
    const whole = Math.abs(n - Math.round(n)) < 0.005;
    const f = whole ? f0 : f2;
    return f ? f.format(whole ? Math.round(n) : n) : (whole ? Math.round(n) : n.toFixed(2).replace(".", ",")) + " €";
  };
})();

// "1.450", "1450,50", "89,90", "€ 1 200" → numero; testo non valido → NaN; vuoto → null
function parseNum(v){
  if(typeof v === "number") return Number.isFinite(v) ? v : NaN;
  let s = String(v ?? "").trim().replace(/[€\s '’]/g, "");
  if(s === "") return null;
  if(/^\d{1,3}(\.\d{3})+(,\d+)?$/.test(s)) s = s.replace(/\./g, "").replace(",", ".");      // 1.200,50
  else if(/^\d{1,3}(,\d{3})+\.\d+$/.test(s)) s = s.replace(/,/g, "");                       // 1,200.50
  else s = s.replace(",", ".");
  return /^\d+(\.\d+)?$/.test(s) ? Number(s) : NaN;
}
const thisYear = () => new Date().getFullYear();
function validNum(f, n){
  if(!Number.isFinite(n) || n < 0) return false;
  if(YEARS.has(f)) return Number.isInteger(n) && n >= MIN_YEAR && n <= thisYear() + 1;
  return n <= MAX_PRICE;
}
const isDate = s => typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s) && !isNaN(localDate(s));
function localDate(s){ const [y, m, d] = s.split("-").map(Number); const t = new Date(y, m - 1, d); return t.getMonth() === m - 1 ? t : NaN; }
function todayISO(){ const t = new Date(); return `${t.getFullYear()}-${String(t.getMonth()+1).padStart(2,"0")}-${String(t.getDate()).padStart(2,"0")}`; }

// Porta qualunque oggetto (salvato o importato) in una forma valida e sicura.
// Non taglia né scarta dati dell'utente: corregge solo tipi e valori non ammessi.
const keepNum = n => Number.isFinite(n) && n >= 0 && n < 1e12;
function normalize(raw){
  if(!raw || typeof raw !== "object") return null;
  const d = {};
  for(const k of FIELDS){
    const v = raw[k];
    if(v == null || v === "") continue;
    if(NUMS.has(k)){
      const n = parseNum(v);
      if(n != null && keepNum(n)) d[k] = YEARS.has(k) ? Math.round(n) : Math.round(n * 100) / 100;
    } else {
      const s = (typeof v === "string" ? v : String(v)).trim().slice(0, MAXLEN[k] || MAXLEN_DEFAULT);
      if(s) d[k] = s;
    }
  }
  if(!has(CAT, d.cat)) d.cat = "other";
  if(!has(STATUS, d.status)) d.status = "active";
  if(d.cond && !has(COND, d.cond)) delete d.cond;
  if(d.changed && !isDate(d.changed)) delete d.changed;
  if(!CAT[d.cat].strings) STRING_FIELDS.forEach(f => delete d[f]);
  if(d.status !== "sold") delete d.soldPrice;
  const now = Date.now(), ok = t => Number.isFinite(t) && t > 946684800000 && t <= now + 86400000;
  const c = Number(raw.createdAt), u = Number(raw.updatedAt);
  d.createdAt = ok(c) ? c : now;
  d.updatedAt = ok(u) ? u : d.createdAt;
  return d;
}

// ---------- preferenze (comodità: se il browser non le salva, si usano i valori predefiniti) ----------
const PREF_KEY = "rigbook.prefs.v1";
const prefs = (() => { try{ const p = JSON.parse(localStorage.getItem(PREF_KEY) || "{}"); return p && typeof p === "object" ? p : {}; }catch{ return {}; } })();
function savePref(k, v){ prefs[k] = v; try{ localStorage.setItem(PREF_KEY, JSON.stringify(prefs)); }catch{} }

// ---------- archivio locale ----------
const LS_KEY = "rigbook.items.v1";
const newId = () => (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2, 10));
const okId = s => typeof s === "string" && /^[A-Za-z0-9_\-.~:@+]{1,100}$/.test(s) && !s.startsWith("demo") && !(s in Object.prototype);

let items = [], filter = "all", editingId = null, loaded = false, storageBroken = false, readOnly = false;

const store = {
  read(){
    let raw;
    try{ raw = localStorage.getItem(LS_KEY); }catch{ return dict({}); }
    if(!raw) return dict({});
    try{
      const o = JSON.parse(raw);
      if(o && typeof o === "object" && !Array.isArray(o)) return dict(o);
      throw new Error("formato");
    }catch{
      // dati illeggibili: li metto da parte invece di sovrascriverli
      try{ localStorage.setItem(LS_KEY + ".corrotto-" + Date.now(), raw); localStorage.removeItem(LS_KEY); }
      catch{
        readOnly = true;
        showNote("corrupt", "I dati salvati sono illeggibili e non c'è spazio per metterli da parte: per non cancellarli, Rig Book non salverà modifiche.");
        return dict({});
      }
      showNote("corrupt", "Alcuni dati salvati erano illeggibili e sono stati messi da parte. Se hai un backup, importalo.", [], true);
      return dict({});
    }
  },
  write(o){
    if(readOnly) return "readonly";
    try{ localStorage.setItem(LS_KEY, JSON.stringify(o)); return true; }
    catch(e){ return (e && (e.name === "QuotaExceededError" || e.code === 22 || e.name === "NS_ERROR_DOM_QUOTA_REACHED")) ? "quota" : "fail"; }
  },
  check(r){ if(r !== true) throw {code: r === "quota" ? "quota_exceeded" : r === "readonly" ? "readonly" : "local_failed"}; },
  load(){
    const o = this.read();
    items = Object.keys(o).filter(okId).map(id => { const d = normalize(o[id]); return d && {id, ...d}; }).filter(Boolean);
    loaded = true; render();
  },
  save(id, data){ const o = this.read(); o[id] = data; this.check(this.write(o)); this.load(); },
  remove(id){ const o = this.read(); delete o[id]; this.check(this.write(o)); this.load(); },
};
const errText = err => err?.code === "readonly" ? "Salvataggio bloccato per proteggere i dati illeggibili già presenti."
  : err?.code === "quota_exceeded" ? "Spazio esaurito sul dispositivo: elimina qualche pezzo ed esporta un backup."
  : err?.code === "local_failed" ? "Questo browser non permette di salvare (forse sei in navigazione privata)."
  : "Operazione non riuscita. Riprova.";

// un'altra scheda o finestra ha modificato i dati
window.addEventListener("storage", e => { if(e.key === LS_KEY || e.key === null) store.load(); });

// ---------- date ----------
function daysSince(s){
  if(!isDate(s)) return null;
  const now = new Date(); now.setHours(0, 0, 0, 0);
  return Math.round((now - localDate(s)) / 86400000);
}
function ageText(days){
  if(days == null) return "";
  if(days < 0) return "data nel futuro";
  if(days === 0) return "cambiate oggi";
  if(days === 1) return "cambiate ieri";
  if(days < 14) return `cambiate ${days} giorni fa`;
  if(days < 60) return `cambiate ${Math.round(days / 7)} settimane fa`;
  if(days < 365) return `cambiate ${Math.floor(days / 30)} mesi fa`;
  const y = Math.floor(days / 365);
  return y === 1 ? "cambiate più di un anno fa" : `cambiate ${y} anni fa`;
}
const isOld = i => { const d = daysSince(i.changed); return d != null && d > OLD_DAYS; };

// ---------- avvisi persistenti e toast ----------
// costruiti con textContent: nessun testo finisce mai in innerHTML
const notes = new Map();
function showNote(id, text, actions = [], dismissible = false, cls = ""){
  notes.set(id, {text, actions, dismissible, cls});
  drawNotes();
}
function hideNote(id){ if(notes.delete(id)) drawNotes(); }
function drawNotes(){
  const box = $("notes"); box.replaceChildren();
  for(const [id, n] of notes){
    const el = document.createElement("div"); el.className = "note " + n.cls;
    const span = document.createElement("span"); span.textContent = n.text; el.append(span);
    const acts = document.createElement("div"); acts.className = "note-actions";
    for(const a of n.actions){
      const b = document.createElement("button"); b.type = "button"; b.className = "btn small" + (a.primary ? " primary" : "");
      b.textContent = a.label; b.addEventListener("click", a.run); acts.append(b);
    }
    if(n.dismissible){
      const b = document.createElement("button"); b.type = "button"; b.className = "close"; b.textContent = "×";
      b.setAttribute("aria-label", "Chiudi avviso"); b.addEventListener("click", () => { hideNote(id); n.onDismiss?.(); });
      acts.append(b);
    }
    if(acts.childElementCount) el.append(acts);
    box.append(el);
  }
}
let toastTimer = 0;
function toast(msg, action, ms = 4000){
  clearTimeout(toastTimer);
  $("toastMsg").textContent = msg;
  const b = $("toastBtn");
  b.hidden = !action;
  b.onclick = action ? () => { hideToast(); action.run(); } : null;
  if(action) b.textContent = action.label;
  $("toast").hidden = false;
  toastTimer = setTimeout(hideToast, ms);
}
function hideToast(){ clearTimeout(toastTimer); $("toast").hidden = true; }

// ---------- filtri, ricerca, ordinamento ----------
const SORTS = {
  cat: (a, b) => (CAT_ORDER[a.cat] ?? 99) - (CAT_ORDER[b.cat] ?? 99) || (b.buyYear || 0) - (a.buyYear || 0) || byName(a, b),
  recent: (a, b) => (b.updatedAt || 0) - (a.updatedAt || 0) || byName(a, b),
  brand: (a, b) => byName(a, b),
  price: (a, b) => (b.price ?? -1) - (a.price ?? -1) || byName(a, b),
  strings: (a, b) => (daysSince(b.changed) ?? -1e9) - (daysSince(a.changed) ?? -1e9) || byName(a, b),
};
const coll = (() => { try{ return new Intl.Collator("it", {sensitivity:"base", numeric:true}); }catch{ return {compare:(x, y) => x < y ? -1 : x > y ? 1 : 0}; } })();
function byName(a, b){ return coll.compare(a.brand || a.model || "", b.brand || b.model || "") || coll.compare(a.model || "", b.model || ""); }
let sortKey = has(SORTS, prefs.sort) ? prefs.sort : "cat";
$("sort").value = sortKey;
$("sort").addEventListener("change", e => { sortKey = has(SORTS, e.target.value) ? e.target.value : "cat"; savePref("sort", sortKey); renderList(); });

function haystack(i){
  const c = CAT[i.cat] || CAT.other;
  return [i.brand, i.model, i.finish, i.serial, i.year, i.gauge, i.sbrand, i.tuning, i.setup, i.buyYear, i.price, i.where, i.notes, i.soldPrice,
    c.label, c.one, c.code, STATUS[i.status], COND[i.cond]].filter(v => v != null).join(" ").toLocaleLowerCase("it");
}
const visibleBase = () => $("showSold").checked ? items : items.filter(i => i.status !== "sold");

function renderChips(){
  const base = visibleBase();
  const counts = {}; base.forEach(i => counts[i.cat] = (counts[i.cat] || 0) + 1);
  if(filter !== "all" && !counts[filter]) filter = "all";
  const list = [{k:"all", code:"ALL", label:"Tutto", n:base.length}, ...CATS.filter(c => counts[c.k]).map(c => ({...c, n:counts[c.k]}))];
  $("chips").innerHTML = list.map(c =>
    `<button type="button" class="chip ${c.k === "all" ? "" : "cat-" + esc(c.k)}" data-k="${esc(c.k)}" aria-pressed="${filter === c.k}">${c.k === "all" ? "" : `<span class="dotc" aria-hidden="true"></span>`}${esc(c.label)} <span class="code"><span class="sr-only">, </span>${c.n}</span></button>`).join("");
}
$("chips").addEventListener("click", e => { const b = e.target.closest(".chip"); if(!b) return; filter = b.dataset.k; render(); b.isConnected || document.querySelector(`.chip[data-k="${CSS.escape(filter)}"]`)?.focus(); });
$("search").addEventListener("input", () => renderList());
$("showSold").addEventListener("change", () => render());

function renderStats(){
  const owned = items.filter(i => i.status !== "sold");
  const sold = items.filter(i => i.status === "sold");
  $("sCount").textContent = owned.length;
  $("sSpent").textContent = EUR(owned.reduce((s, i) => s + (i.price || 0), 0));
  const str = owned.filter(i => CAT[i.cat]?.strings);
  $("sStrings").textContent = str.length;
  $("sOld").textContent = str.filter(isOld).length;
  const got = sold.reduce((s, i) => s + (i.soldPrice || 0), 0);
  $("sSoldWrap").hidden = !sold.some(i => i.soldPrice != null);
  $("sSold").textContent = EUR(got);
  $("sOldTile").classList.toggle("warn", str.some(isOld));
  // spesa per categoria (barre)
  const byCat = {}; owned.forEach(i => { if(i.price) byCat[i.cat] = (byCat[i.cat] || 0) + i.price; });
  const top = Object.entries(byCat).sort((a, b) => b[1] - a[1]).slice(0, 4);
  const max = top[0]?.[1] || 1;
  $("sBars").innerHTML = top.map(([k, v]) => `<div class="bar cat-${esc(k)}"><span>${esc(CAT[k]?.label || "Altro")}</span><i><span style="width:${Math.max(2, Math.round(v / max * 100))}%"></span></i><em>${esc(EUR(v))}</em></div>`).join("");
  $("sBars").hidden = !top.length;
  const last = Number(prefs.lastBackup) || 0;
  const bd = last ? Math.floor((Date.now() - last) / 86400000) : null;
  $("sBackup").textContent = bd == null ? "mai" : bd === 0 ? "oggi" : bd === 1 ? "ieri" : `${bd} gg fa`;
  const empty = loaded && !items.length;
  $("exampleNote").hidden = !empty;
  $("exampleBanner").hidden = !empty;
  document.body.classList.toggle("is-empty", empty);
  document.body.classList.toggle("has-items", loaded && items.length > 0);
}

// ---------- schede ----------
const DEMO = [
  {id:"demo-1", example:true, cat:"guitar", brand:"Fender", model:"Telecaster", finish:"Butterscotch Blonde", year:2014, status:"active", gauge:"10-46", sbrand:"Ernie Ball Regular Slinky", tuning:"E standard", changed:"2026-06-02", buyYear:2019, price:1200, where:"Mercatino"},
  {id:"demo-2", example:true, cat:"bass", brand:"Squier", model:"Jazz Bass", year:2020, status:"lent", gauge:"45-105", sbrand:"D'Addario EXL165", tuning:"E standard", changed:"2026-10-20", buyYear:2021, price:380},
  {id:"demo-3", example:true, cat:"interface", brand:"Focusrite", model:"Scarlett 2i2", year:2022, status:"active", buyYear:2023, price:190, where:"Negozio"},
];
const titleOf = i => [i.brand, i.model].filter(Boolean).join(" ") || (CAT[i.cat] || CAT.other).one;

// corde disegnate: spessore proporzionale alla scalatura ("10-46", "45-105")
function wires(i){
  const bass = i.cat === "bass";
  const m = /(\d+(?:[.,]\d+)?)\s*[-–\/]\s*(\d+(?:[.,]\d+)?)/.exec(i.gauge || "");
  let lo = m ? parseFloat(m[1].replace(",", ".")) : (bass ? 45 : 10), hi = m ? parseFloat(m[2].replace(",", ".")) : (bass ? 105 : 46);
  if(lo < 1) lo *= 1000; if(hi < 1) hi *= 1000;          // ".010-.046"
  if(!(lo > 0 && hi > lo && hi < 200)){ lo = bass ? 45 : 10; hi = bass ? 105 : 46; }
  const n = bass ? 4 : 6, h = 58, gap = h / (n + 1);
  let out = "";
  for(let k = 0; k < n; k++){
    const g = lo * Math.pow(hi / lo, k / (n - 1));          // progressione geometrica come i set reali
    const w = (0.6 + (g / hi) * (bass ? 3 : 2.6)).toFixed(2);
    const wound = bass || g >= 17;
    out += `<line x1="0" y1="${(gap * (k + 1)).toFixed(1)}" x2="300" y2="${(gap * (k + 1)).toFixed(1)}" stroke="${wound ? "var(--c)" : "currentColor"}" stroke-opacity="${wound ? 1 : .6}" stroke-width="${w}" stroke-linecap="round"/>`;
  }
  return `<svg class="wire" viewBox="0 0 300 ${h}" preserveAspectRatio="none" aria-hidden="true">${out}</svg>`;
}

function card(i, n = 0){
  const c = CAT[i.cat] || CAT.other;
  const title = titleOf(i);
  const sub = [i.finish, i.year && `del ${i.year}`].filter(Boolean).join(" · ");
  const pills = [];
  if(i.example) pills.push(`<span class="pill example">Esempio</span>`);
  if(has(STATUS, i.status) && i.status !== "active") pills.push(`<span class="pill ${esc(i.status)}">${esc(STATUS[i.status])}</span>`);
  let gauge = "";
  if(c.strings && (i.gauge || i.sbrand || i.tuning || i.changed)){
    const d = daysSince(i.changed);
    const lvl = d == null || d < 0 ? "" : d > OLD_DAYS ? "old" : d > OLD_DAYS / 2 ? "mid" : "";
    const pct = d == null || d < 0 ? 0 : Math.max(3, Math.min(100, Math.round(d / OLD_DAYS * 100)));
    gauge = `<div class="strings">
      <div class="strings-head"><b>${esc(i.gauge || "—")}</b><span>${esc([i.sbrand, i.tuning].filter(Boolean).join(" · "))}</span></div>
      ${wires(i)}
      ${d != null ? `<div class="age ${lvl}"><span>${esc(ageText(d))}${d > OLD_DAYS ? " · da cambiare" : ""}</span>${d >= 0 ? `<div class="track"><span style="width:${pct}%"></span></div>` : ""}</div>` : ""}
    </div>`;
  }
  const rows = [];
  if(i.buyYear) rows.push(["Anno di acquisto", i.buyYear]);
  if(i.price != null) rows.push(["Pagato", EUR(i.price)]);
  if(i.where) rows.push(["Provenienza", i.where]);
  if(i.cond) rows.push(["Condizioni", COND[i.cond]]);
  if(i.status === "sold" && i.soldPrice != null) rows.push(["Venduto per", EUR(i.soldPrice)]);
  if(i.serial) rows.push(["N/S", i.serial]);
  return `<article class="card cat-${esc(c.k)}${i.status === "sold" ? " sold" : ""}${i.example ? " example" : ""}" style="--n:${Math.min(n, 12)}">
    <div class="card-top"><div class="cat"><span class="ic">${icon(c.k)}</span><span class="stencil">${esc(c.code)} · ${esc(c.one)}</span></div><span class="pills">${pills.join("")}</span></div>
    <h3 class="name"><button type="button" class="card-open" data-id="${esc(i.id)}">${esc(title)}${i.example ? `<span class="sr-only"> (esempio: tocca per aggiungere un pezzo)</span>` : ""}</button>${sub ? `<small>${esc(sub)}</small>` : ""}</h3>
    ${gauge}
    ${rows.length ? `<dl class="specs">${rows.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join("")}</dl>` : ""}
  </article>`;
}

function renderList(){
  const list = $("list");
  if(!loaded) return;
  const head = `<h2 class="sr-only" id="listTitle">Inventario</h2>`;
  if(!items.length){ list.innerHTML = head + `<div class="grid">${DEMO.map(card).join("")}</div>`; $("listCount").textContent = "esempi"; return; }
  const q = $("search").value.trim().toLocaleLowerCase("it");
  const words = q ? q.split(/\s+/) : [];
  const shown = visibleBase()
    .filter(i => filter === "all" || i.cat === filter)
    .filter(i => { if(!words.length) return true; const h = haystack(i); return words.every(w => h.includes(w)); })
    .sort(SORTS[sortKey] || SORTS.cat);
  $("listCount").textContent = shown.length === 1 ? "1 pezzo" : `${shown.length} pezzi`;
  list.innerHTML = head + (shown.length
    ? `<div class="grid">${shown.map(card).join("")}</div>`
    : `<div class="empty"><h2>Niente qui</h2><p>Nessun pezzo corrisponde a filtro e ricerca.</p></div>`);
}
$("list").addEventListener("click", e => {
  const b = e.target.closest(".card-open"); if(!b) return;
  const demo = DEMO.find(d => d.id === b.dataset.id);
  demo ? openForm(null, demo.cat) : openForm(b.dataset.id);
});

function render(){ renderChips(); renderStats(); renderList(); checkBackupReminder(); }

// ---------- modulo ----------
$("f_cat").innerHTML = CATS.map(c => `<option value="${esc(c.k)}">${esc(c.code)} · ${esc(c.one)}</option>`).join("");
function syncForm(){
  $("stringsSet").hidden = !CAT[$("f_cat").value]?.strings;
  $("soldWrap").hidden = $("f_status").value !== "sold";
}
$("f_cat").addEventListener("change", syncForm);
$("f_status").addEventListener("change", syncForm);

const fmtField = (f, v) => NUMS.has(f) && !YEARS.has(f) && typeof v === "number" ? String(v).replace(".", ",") : String(v);
const formSnapshot = () => FIELDS.map(f => $("f_" + f).value).join("\u0001");
let delArmed = false, discardArmed = false, snapshot = "", returnFocusId = null, opener = null, saving = false;

function openForm(id, cat){
  editingId = id || null;
  const i = id ? items.find(x => x.id === id) : null;
  if(id && !i){ toast("Questo pezzo non esiste più."); return; }
  opener = document.activeElement;
  $("form").reset();
  FIELDS.forEach(f => { $("f_" + f).value = i && i[f] != null ? fmtField(f, i[f]) : ""; });
  if(!i){ $("f_cat").value = has(CAT, cat) ? cat : (filter !== "all" ? filter : "guitar"); $("f_status").value = "active"; }
  $("f_changed").max = todayISO();
  $("dlgTitle").textContent = i ? titleOf(i) : "Nuovo pezzo";
  $("delBtn").hidden = !i;
  delArmed = false; $("delBtn").textContent = "Elimina";
  discardArmed = false; $("cancelBtn").textContent = "Annulla";
  clearErr();
  syncForm();
  snapshot = formSnapshot();
  returnFocusId = id || null;
  $("dlg").showModal();
  $("f_brand").focus();
}

// chiusura con controllo delle modifiche non salvate
function requestClose(){
  if(formSnapshot() !== snapshot && !discardArmed){
    discardArmed = true;
    $("cancelBtn").textContent = "Scarta modifiche";
    showErr("Hai modifiche non salvate. Premi “Salva”, oppure “Scarta modifiche” per chiudere.", null);
    $("cancelBtn").focus();
    return false;
  }
  closeForm();
  return true;
}
$("dlg").addEventListener("cancel", e => { if(formSnapshot() !== snapshot && !discardArmed){ e.preventDefault(); requestClose(); } });
function restoreFocus(){
  const target = (returnFocusId && document.querySelector(`.card-open[data-id="${CSS.escape(returnFocusId)}"]`))
    || (opener && opener.isConnected ? opener : null) || $("addBtn");
  target.focus();
}
function closeForm(){ $("dlg").close(); restoreFocus(); }
$("dlg").addEventListener("close", () => { if(document.activeElement === document.body || $("dlg").contains(document.activeElement)) restoreFocus(); });
$("dlgClose").addEventListener("click", requestClose);
$("cancelBtn").addEventListener("click", requestClose);
$("addBtn").addEventListener("click", () => openForm());
$("firstBtn").addEventListener("click", () => openForm());
$("form").addEventListener("input", () => {
  if(discardArmed){ discardArmed = false; $("cancelBtn").textContent = "Annulla"; clearErr(); }
  if(delArmed){ delArmed = false; $("delBtn").textContent = "Elimina"; }
});

const LABELS = {year:"Anno di fabbricazione", buyYear:"Anno di acquisto", price:"Prezzo pagato", soldPrice:"Prezzo di vendita"};
function readForm(){
  const data = {};
  for(const f of FIELDS){
    const el = $("f_" + f);
    if(el.closest("[hidden]")) continue; // campi nascosti (corde per un ampli, prezzo di vendita se non venduto)
    const v = el.value.trim();
    if(v === "") continue;
    if(NUMS.has(f)){
      const n = parseNum(v);
      const unchanged = editingId && fmtField(f, items.find(x => x.id === editingId)?.[f] ?? "") === v;
      if(!validNum(f, n) && !(unchanged && keepNum(n))){
        const msg = YEARS.has(f) ? `${LABELS[f]}: scrivi un anno tra ${MIN_YEAR} e ${thisYear() + 1}.` : `${LABELS[f]}: scrivi un importo valido, es. 1.450 o 89,90.`;
        return {error: msg, field: el};
      }
      data[f] = Math.round(n * 100) / 100;
    } else data[f] = v;
  }
  if(data.changed && (!isDate(data.changed) || daysSince(data.changed) < 0)) return {error:"Ultimo cambio corde: la data non può essere nel futuro.", field:$("f_changed")};
  if(!data.brand && !data.model) return {error:"Scrivi almeno marca o modello.", field:$("f_brand")};
  return {data};
}

$("form").addEventListener("submit", e => {
  e.preventDefault();
  if(saving) return;
  clearErr();
  const {data, error, field} = readForm();
  if(error){ showErr(error, field); return; }
  const id = editingId || newId();
  const prev = editingId ? items.find(x => x.id === editingId) : null;
  if(editingId && !has(store.read(), editingId)){
    editingId = null; $("delBtn").hidden = true;
    showErr("Questo pezzo è stato eliminato in un'altra finestra. Premi di nuovo “Salva” per ricrearlo.", null);
    return;
  }
  saving = true; $("saveBtn").disabled = true;
  try{
    const clean = normalize({...data, createdAt: prev?.createdAt || Date.now(), updatedAt: Date.now()});
    store.save(id, clean);
    returnFocusId = id;
    closeForm();
    toast(prev ? "Modifiche salvate." : "Pezzo aggiunto.");
  }catch(err){ showErr(errText(err), null); }
  finally{ saving = false; $("saveBtn").disabled = false; }
});
function showErr(m, field){
  $("formErr").textContent = m; $("formErr").hidden = false;
  if(field){ field.setAttribute("aria-invalid", "true"); field.setAttribute("aria-describedby", "formErr"); field.focus(); }
}
function clearErr(){
  $("formErr").hidden = true; $("formErr").textContent = "";
  document.querySelectorAll('#form [aria-invalid="true"]').forEach(el => el.removeAttribute("aria-invalid"));
}

$("delBtn").addEventListener("click", () => {
  if(!delArmed){ delArmed = true; $("delBtn").textContent = "Conferma eliminazione"; showErr("Premi di nuovo per eliminare questo pezzo.", null); return; }
  const removed = items.find(x => x.id === editingId);
  try{
    store.remove(editingId);
    returnFocusId = null; opener = $("addBtn");
    closeForm();
    if(removed){
      const {id, ...data} = removed;
      toast(`Eliminato: ${titleOf(removed)}`, {label:"Annulla", run(){
        try{ store.save(id, data); toast("Ripristinato."); }catch(err){ toast(errText(err)); }
      }}, 8000);
    }
  }catch(err){ showErr(errText(err), null); }
});

// ---------- backup ----------
function backupJson(){
  return JSON.stringify({app:"rig-book", version:1, exportedAt:new Date().toISOString(), items}, null, 2);
}
function markBackup(){ savePref("lastBackup", Date.now()); hideNote("backup"); renderStats(); }
function showBackupText(data){ $("bkText").value = data; $("bkCopy").textContent = "Copia"; $("bkDlg").showModal(); }
function exportBackup(){
  if(!items.length){ toast("Non c'è ancora niente da esportare."); return; }
  const data = backupJson();
  const name = `rig-book-${todayISO()}.json`;
  try{
    const file = new File([data], name, {type:"application/json"});
    // su telefono: foglio di condivisione (Salva su File, AirDrop, WhatsApp…)
    if(navigator.canShare && navigator.canShare({files:[file]}) && matchMedia("(pointer: coarse)").matches){
      navigator.share({files:[file], title:"Backup Rig Book"})
        .then(() => { markBackup(); toast("Backup condiviso."); })
        .catch(err => { if(err?.name !== "AbortError") showBackupText(data); });
      return;
    }
    const url = URL.createObjectURL(file);
    const a = document.createElement("a"); a.href = url; a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
    markBackup();
    toast(`Backup salvato: ${name}`);
  }catch{
    showBackupText(data);
  }
}
$("exportBtn").addEventListener("click", exportBackup);
$("bkClose").addEventListener("click", () => $("bkDlg").close());
$("bkCopy").addEventListener("click", () => {
  const t = $("bkText").value;
  const fallback = () => { $("bkText").focus(); $("bkText").select(); $("bkCopy").textContent = "Seleziona e copia"; };
  if(!navigator.clipboard?.writeText){ fallback(); return; }
  navigator.clipboard.writeText(t).then(() => { $("bkCopy").textContent = "Copiato"; markBackup(); }).catch(fallback);
});

$("importBtn").addEventListener("click", () => $("importFile").click());
$("importFile").addEventListener("change", async e => {
  const f = e.target.files?.[0]; e.target.value = "";
  if(!f) return;
  if(f.size > MAX_IMPORT_BYTES){ toast("Il file è troppo grande per essere un backup di Rig Book."); return; }
  let list;
  try{
    const j = JSON.parse(await f.text());
    list = Array.isArray(j) ? j : j?.items;
    if(!Array.isArray(list)) throw 0;
    if(!Array.isArray(j) && Number(j.version) > 1){ toast("Questo backup viene da una versione più nuova di Rig Book: ricarica la pagina e riprova."); return; }
  }catch{ toast("Il file non è un backup di Rig Book valido."); return; }
  const o = store.read();
  let added = 0, updated = 0, skipped = 0;
  for(const raw of list.slice(0, MAX_IMPORT_ITEMS)){
    const d = normalize(raw);
    if(!d || (!d.brand && !d.model)){ skipped++; continue; }
    d.updatedAt = Date.now();
    const id = okId(raw.id) ? raw.id : newId();
    has(o, id) ? updated++ : added++;
    o[id] = d;
  }
  skipped += Math.max(0, list.length - MAX_IMPORT_ITEMS);
  if(!added && !updated){ toast("Nessun pezzo trovato nel file."); return; }
  try{ store.check(store.write(o)); }catch(err){ toast("Importazione annullata: " + errText(err)); return; }
  store.load();
  const parts = [];
  if(added) parts.push(added === 1 ? "1 pezzo nuovo" : `${added} pezzi nuovi`);
  if(updated) parts.push(updated === 1 ? "1 aggiornato" : `${updated} aggiornati`);
  if(skipped) parts.push(skipped === 1 ? "1 scartato" : `${skipped} scartati`);
  toast("Importati: " + parts.join(", ") + ".", null, 6000);
});

// promemoria backup: i dati esistono solo su questo dispositivo
function checkBackupReminder(){
  if(!items.length || storageBroken){ hideNote("backup"); return; }
  const last = Number(prefs.lastBackup) || 0, snoozed = Number(prefs.backupSnooze) || 0;
  const days = last ? Math.floor((Date.now() - last) / 86400000) : null;
  const due = (days == null && items.length >= 3) || (days != null && days >= BACKUP_REMIND_DAYS);
  if(!due || Date.now() - snoozed < 7 * 86400000){ hideNote("backup"); return; }
  if(notes.has("backup")) return;
  showNote("backup", days == null ? "Non hai ancora fatto un backup. I dati sono solo su questo dispositivo: esportane uno ogni tanto."
    : `Ultimo backup ${days} giorni fa. Esportane uno nuovo per non perdere le modifiche.`,
    [{label:"Esporta backup", primary:true, run: exportBackup}, {label:"Più tardi", run(){ savePref("backupSnooze", Date.now()); hideNote("backup"); }}]);
}

// barra in alto: bordo quando si scorre
{ const tb = $("topbar"); const onScroll = () => tb.classList.toggle("scrolled", scrollY > 8); addEventListener("scroll", onScroll, {passive:true}); onScroll(); }

// ---------- avvio ----------
try{ localStorage.setItem("rigbook.test", "1"); localStorage.removeItem("rigbook.test"); }
catch{ storageBroken = true; showNote("storage", "Questo browser non permette di salvare i dati (forse sei in navigazione privata). Quello che aggiungi andrà perso."); }
store.load();
try{ navigator.storage?.persisted?.().then(p => p || navigator.storage.persist()).catch(() => {}); }catch{}

const standalone = matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;
const ios = /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
if(!standalone && !storageBroken){
  const dismissed = Number(prefs.installHintDismissed) || 0;
  if(Date.now() - dismissed > 30 * 86400000){
    const text = !items.length
      ? (ios ? "Per usarla come un'app: tocca Condividi e poi “Aggiungi alla schermata Home”. I dati restano su questo dispositivo."
             : "Puoi installarla come app dal menu del browser (“Installa app” o “Aggiungi a schermata Home”). I dati restano su questo dispositivo.")
      : (ios ? "Stai usando Rig Book in Safari: se non la apri per 7 giorni Safari può cancellare i dati, e l'app installata sulla Home ha un archivio separato. Esporta un backup e importalo nell'app installata."
             : "");
    if(text){
      showNote("install", text, [], true);
      notes.get("install").onDismiss = () => savePref("installHintDismissed", Date.now());
    }
  }
}

// ---------- aggiornamenti dell'app ----------
if("serviceWorker" in navigator){
  window.addEventListener("load", async () => {
    try{
      const hadController = !!navigator.serviceWorker.controller;
      const reg = await navigator.serviceWorker.register("sw.js", {updateViaCache: "none"});
      const offer = w => {
        if(!w || !hadController) return;
        showNote("update", "È disponibile una nuova versione di Rig Book.", [{label:"Aggiorna", primary:true, run(){ w.state === "activated" || w.state === "redundant" ? location.reload() : w.postMessage("SKIP_WAITING"); }}], false, "update");
      };
      offer(reg.waiting);
      reg.addEventListener("updatefound", () => {
        const w = reg.installing;
        w?.addEventListener("statechange", () => { if(w.state === "installed") offer(w); });
      });
      document.addEventListener("visibilitychange", () => { if(document.visibilityState === "visible") reg.update().catch(() => {}); });
      let reloading = false;
      navigator.serviceWorker.addEventListener("controllerchange", () => {
        if(!hadController || reloading) return;
        if($("dlg").open && formSnapshot() !== snapshot){ // non perdere un modulo a metà
          showNote("update", "Nuova versione pronta: salva il pezzo, poi tocca Aggiorna.", [{label:"Aggiorna", primary:true, run(){ location.reload(); }}], false, "update");
          return;
        }
        reloading = true; location.reload();
      });
    }catch{}
  });
}
