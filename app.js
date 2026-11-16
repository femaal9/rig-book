
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
const CAT = Object.fromEntries(CATS.map(c=>[c.k,c]));
const STATUS = {active:"In uso", lent:"In prestito", repair:"In riparazione", sold:"Venduto"};
const FIELDS = ["cat","brand","model","finish","serial","year","status","gauge","sbrand","tuning","changed","setup","buyYear","price","where","cond","soldPrice","notes"];
const NUMS = new Set(["year","buyYear","price","soldPrice"]);
const OLD_DAYS = 120;

const $ = id => document.getElementById(id);
const eur = n => new Intl.NumberFormat("it-IT",{style:"currency",currency:"EUR",maximumFractionDigits:0}).format(n||0);
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));

let items = [], filter = "all", editingId = null, loaded = false;
const canWrite = true;

// Schede d'esempio mostrate solo a chi ha il case vuoto: non vengono salvate.
const DEMO = [
  {id:"demo-1", example:true, cat:"guitar", brand:"Fender", model:"Telecaster", finish:"Butterscotch Blonde", year:2014, status:"active", gauge:"10-46", sbrand:"Ernie Ball Regular Slinky", tuning:"E standard", changed:"2026-06-02", buyYear:2019, price:1200, where:"Mercatino"},
  {id:"demo-2", example:true, cat:"bass", brand:"Squier", model:"Jazz Bass", year:2020, status:"lent", gauge:"45-105", sbrand:"D'Addario EXL165", tuning:"E standard", changed:"2026-10-20", buyYear:2021, price:380},
  {id:"demo-3", example:true, cat:"interface", brand:"Focusrite", model:"Scarlett 2i2", year:2022, status:"active", buyYear:2023, price:190, where:"Negozio"},
];

// ---------- storage: tutto resta su questo dispositivo ----------
const LS_KEY = "rigbook.items.v1";
const newId = () => (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2, 10));
const store = {
  mode: "local",
  read(){ try{ const o = JSON.parse(localStorage.getItem(LS_KEY) || "{}"); return o && typeof o === "object" ? o : {}; }catch{ return {}; } },
  write(o){ try{ localStorage.setItem(LS_KEY, JSON.stringify(o)); return true; }catch{ return false; } },
  load(){ items = Object.entries(this.read()).map(([id, d]) => ({id, ...d})); loaded = true; render(); },
  async save(id, data){ const o = this.read(); o[id] = data; if(!this.write(o)) throw {code:"local_failed"}; this.load(); },
  async remove(id){ const o = this.read(); delete o[id]; this.write(o); this.load(); },
};
// un'altra scheda aperta ha modificato i dati
window.addEventListener("storage", e => { if(e.key === LS_KEY) store.load(); });

function daysSince(d){ if(!d) return null; const t = Date.parse(d); if(isNaN(t)) return null; return Math.floor((Date.now()-t)/86400000); }
function ageText(days){
  if(days==null) return "";
  if(days < 1) return "cambiate oggi";
  if(days < 14) return `cambiate ${days} gg fa`;
  if(days < 60) return `cambiate ${Math.round(days/7)} sett. fa`;
  return `cambiate ${Math.round(days/30)} mesi fa`;
}

// filters
function renderChips(){
  const active = items.filter(i => i.status !== "sold");
  const counts = {}; active.forEach(i => counts[i.cat] = (counts[i.cat]||0)+1);
  const list = [{k:"all", code:"ALL", label:"Tutto", n:active.length}, ...CATS.filter(c=>counts[c.k]).map(c=>({...c, n:counts[c.k]}))];
  if(filter !== "all" && !items.some(i=>i.cat===filter)) filter = "all";
  $("chips").innerHTML = list.map(c =>
    `<button class="chip" data-k="${c.k}" aria-pressed="${filter===c.k}"><span class="code">${c.code}</span>${esc(c.label)} <span class="code">${c.n}</span></button>`).join("");
}
$("chips").addEventListener("click", e => { const b = e.target.closest(".chip"); if(!b) return; filter = b.dataset.k; render(); });
$("search").addEventListener("input", () => renderList());
$("showSold").addEventListener("change", () => renderList());

function renderStats(){
  const all = items.filter(i => i.status !== "sold");
  $("sCount").textContent = all.length;
  $("sSpent").textContent = eur(all.reduce((s,i)=>s+(Number(i.price)||0),0));
  const str = all.filter(i => CAT[i.cat]?.strings);
  $("sStrings").textContent = str.length;
  $("sOld").textContent = str.filter(i => { const d = daysSince(i.changed); return d!=null && d>OLD_DAYS; }).length;
  $("exampleNote").hidden = !(loaded && !items.length);
}

function card(i){
  const c = CAT[i.cat] || CAT.other;
  const title = [i.brand, i.model].filter(Boolean).join(" ") || c.one;
  const sub = [i.finish, i.year && `del ${i.year}`].filter(Boolean).join(" · ");
  const pills = [];
  if(i.example) pills.push(`<span class="pill example">Esempio</span>`);
  if(i.status && i.status!=="active") pills.push(`<span class="pill ${i.status}">${STATUS[i.status]}</span>`);
  let gauge = "";
  if(c.strings && (i.gauge || i.sbrand || i.tuning)){
    const d = daysSince(i.changed);
    gauge = `<div class="gauge"><b>${esc(i.gauge || "—")}</b><span>${esc([i.sbrand, i.tuning].filter(Boolean).join(" · "))}</span>${d!=null?`<span class="age ${d>OLD_DAYS?"old":""}">${ageText(d)}</span>`:""}</div>`;
  }
  const rows = [];
  if(i.buyYear) rows.push(["Acquistato", i.buyYear]);
  if(i.price!=null && i.price!=="") rows.push(["Pagato", eur(i.price)]);
  if(i.where) rows.push(["Da", i.where]);
  if(i.status==="sold" && i.soldPrice!=null && i.soldPrice!=="") rows.push(["Venduto a", eur(i.soldPrice)]);
  if(i.serial) rows.push(["S/N", i.serial]);
  return `<button class="card ${i.status==="sold"?"sold":""}" data-id="${esc(i.id)}" aria-label="${i.example?"Aggiungi un pezzo":"Apri "+esc(title)}">
    <div class="card-top"><span class="stencil">${c.code} · ${esc(c.one)}</span><span style="display:flex;gap:4px">${pills.join("")}</span></div>
    <h3 class="name">${esc(title)}${sub?`<small>${esc(sub)}</small>`:""}</h3>
    ${gauge}
    ${rows.length?`<dl class="specs">${rows.map(([k,v])=>`<dt>${k}</dt><dd>${esc(v)}</dd>`).join("")}</dl>`:""}
  </button>`;
}

function renderList(){
  const list = $("list");
  if(!loaded) return;
  if(!items.length){
    list.innerHTML = `<div class="grid">${DEMO.map(card).join("")}</div>`;
    return;
  }
  const q = $("search").value.trim().toLowerCase();
  const showSold = $("showSold").checked;
  const order = Object.fromEntries(CATS.map((c,n)=>[c.k,n]));
  const shown = items
    .filter(i => filter==="all" || i.cat===filter)
    .filter(i => showSold || i.status!=="sold")
    .filter(i => !q || FIELDS.some(f => String(i[f]??"").toLowerCase().includes(q)))
    .sort((a,b) => (order[a.cat]??99)-(order[b.cat]??99) || (b.buyYear||0)-(a.buyYear||0) || String(a.brand).localeCompare(String(b.brand)));
  list.innerHTML = shown.length
    ? `<div class="grid">${shown.map(card).join("")}</div>`
    : `<div class="empty"><h2>Niente qui</h2><p>Nessun pezzo corrisponde a filtro e ricerca.</p></div>`;
}
$("list").addEventListener("click", e => {
  const c = e.target.closest(".card"); if(!c) return;
  const demo = DEMO.find(d => d.id === c.dataset.id);
  demo ? openForm(null, demo.cat) : openForm(c.dataset.id);
});

function render(){ renderChips(); renderStats(); renderList(); }

// form
$("f_cat").innerHTML = CATS.map(c=>`<option value="${c.k}">${c.code} · ${esc(c.one)}</option>`).join("");
function syncForm(){
  $("stringsSet").hidden = !CAT[$("f_cat").value]?.strings;
  $("soldWrap").hidden = $("f_status").value !== "sold";
}
$("f_cat").addEventListener("change", syncForm);
$("f_status").addEventListener("change", syncForm);

let delArmed = false;
function openForm(id, cat){
  editingId = id || null;
  const i = id ? items.find(x=>x.id===id) : null;
  $("form").reset();
  FIELDS.forEach(f => { const el = $("f_"+f); if(el) el.value = i && i[f]!=null ? i[f] : ""; });
  if(!i){ $("f_cat").value = cat || (filter!=="all" ? filter : "guitar"); $("f_status").value = "active"; }
  if(i && !i.status) $("f_status").value = "active";
  $("dlgTitle").textContent = i ? ([i.brand,i.model].filter(Boolean).join(" ") || "Modifica") : "Nuovo pezzo";
  $("delBtn").hidden = !i;
  delArmed = false; $("delBtn").textContent = "Elimina";
  $("formErr").hidden = true;
  syncForm();
  $("dlg").showModal();
}
const closeDlg = () => $("dlg").close();
$("dlgClose").addEventListener("click", closeDlg);
$("cancelBtn").addEventListener("click", closeDlg);
$("addBtn").addEventListener("click", () => openForm());
$("firstBtn").addEventListener("click", () => openForm());

$("form").addEventListener("submit", async e => {
  e.preventDefault();
  const data = {};
  FIELDS.forEach(f => {
    const v = $("f_"+f).value.trim();
    if(v==="") return;
    data[f] = NUMS.has(f) ? Number(v) : v;
  });
  if(!CAT[data.cat]?.strings){ ["gauge","sbrand","tuning","changed","setup"].forEach(f=>delete data[f]); }
  if(data.status!=="sold") delete data.soldPrice;
  if(!data.brand && !data.model){ showErr("Scrivi almeno marca o modello."); return; }
  $("saveBtn").disabled = true;
  try{
    const prev = editingId ? (items.find(x=>x.id===editingId) || {}) : {};
    await store.save(editingId || newId(), {...data, createdAt: prev.createdAt || Date.now(), updatedAt: Date.now()});
    closeDlg();
  }catch(err){
    showErr(err?.code==="quota_exceeded" ? "Spazio esaurito: elimina qualche pezzo e riprova."
      : err?.code==="local_failed" ? "Questo browser non permette di salvare (forse sei in navigazione privata)."
      : "Salvataggio non riuscito. Riprova.");
  }
  finally{ $("saveBtn").disabled = false; }
});
function showErr(m){ $("formErr").textContent = m; $("formErr").hidden = false; }

$("delBtn").addEventListener("click", async () => {
  if(!delArmed){ delArmed = true; $("delBtn").textContent = "Conferma eliminazione"; return; }
  try{ await store.remove(editingId); closeDlg(); }catch{ showErr("Eliminazione non riuscita. Riprova."); }
});

function note(msg){ $("statusNote").textContent = msg; $("statusNote").hidden = !msg; }

// ---------- backup ----------
function backupJson(){ return JSON.stringify({app:"rig-book", version:1, exportedAt:new Date().toISOString(), items}, null, 2); }
$("exportBtn").addEventListener("click", () => {
  if(!items.length){ note("Non c'è ancora niente da esportare."); return; }
  const data = backupJson();
  const name = `rig-book-${new Date().toISOString().slice(0,10)}.json`;
  try{
    const file = new File([data], name, {type:"application/json"});
    // su telefono: foglio di condivisione (Salva su File, AirDrop, WhatsApp…)
    if(navigator.canShare && navigator.canShare({files:[file]}) && matchMedia("(pointer: coarse)").matches){
      navigator.share({files:[file], title:"Backup Rig Book"}).catch(() => {});
      return;
    }
    const url = URL.createObjectURL(file);
    const a = document.createElement("a"); a.href = url; a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }catch{
    $("bkText").value = data; $("bkCopy").textContent = "Copia"; $("bkDlg").showModal();
  }
});
$("bkClose").addEventListener("click", () => $("bkDlg").close());
$("bkCopy").addEventListener("click", () => {
  const t = $("bkText").value;
  navigator.clipboard?.writeText(t).then(() => { $("bkCopy").textContent = "Copiato"; })
    .catch(() => { $("bkText").focus(); $("bkText").select(); $("bkCopy").textContent = "Seleziona e copia"; });
});
$("importBtn").addEventListener("click", () => $("importFile").click());
$("importFile").addEventListener("change", async e => {
  const f = e.target.files?.[0]; e.target.value = "";
  if(!f) return;
  let list;
  try{ const j = JSON.parse(await f.text()); list = Array.isArray(j) ? j : j.items; if(!Array.isArray(list)) throw 0; }
  catch{ note("Il file non è un backup di Rig Book valido."); return; }
  let n = 0;
  for(const raw of list){
    if(!raw || typeof raw !== "object") continue;
    const d = {};
    FIELDS.forEach(k => { if(raw[k]!=null && raw[k]!=="") d[k] = NUMS.has(k) ? Number(raw[k]) : String(raw[k]); });
    if(!d.brand && !d.model) continue;
    if(!CAT[d.cat]) d.cat = "other";
    d.createdAt = Number(raw.createdAt) || Date.now(); d.updatedAt = Date.now();
    const id = typeof raw.id === "string" && /^[A-Za-z0-9_\-.~:@+]{1,100}$/.test(raw.id) && !raw.id.startsWith("demo") ? raw.id : newId();
    try{ await store.save(id, d); n++; }catch{}
  }
  note(n ? `Importati ${n} pezzi.` : "Nessun pezzo trovato nel file.");
});

// ---------- avvio ----------
store.load();
try{ localStorage.setItem("rigbook.test","1"); localStorage.removeItem("rigbook.test"); }catch{ note("Questo browser non permette di salvare i dati (forse sei in navigazione privata)."); }
try{ navigator.storage?.persist?.(); }catch{}
const standalone = matchMedia("(display-mode: standalone)").matches || navigator.standalone;
if(!standalone && !items.length){
  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
  note(ios ? "Per usarla come un'app: tocca Condividi e poi \"Aggiungi alla schermata Home\". I dati restano su questo dispositivo."
           : "Puoi installarla come app dal menu del browser (\"Installa app\" o \"Aggiungi a schermata Home\"). I dati restano su questo dispositivo.");
}
if("serviceWorker" in navigator){ window.addEventListener("load", () => navigator.serviceWorker.register("sw.js").catch(() => {})); }
