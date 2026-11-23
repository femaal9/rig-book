"use strict";
// Rig Book — Check-up DAW (Logic Pro su Mac).
// Il Mac viene letto da checkup.js (lanciato nel Terminale, solo lettura); qui si incolla il risultato
// e l'app spiega cosa può far crashare o bloccare Logic. Niente va su internet: l'analisi è tutta qui.
(() => {
const CK_URL = "https://femaal9.github.io/rig-book/checkup.js";
const CK_CMD = `curl -fsSL ${CK_URL} | osascript -l JavaScript`;
const CK_KEY = "rigbook.checkup.v1";
const CK_MAX = 3_000_000;
const DAY = 864e5;

const arr = v => Array.isArray(v) ? v : [];
const str = (v, n = 300) => typeof v === "string" ? v.slice(0, n) : (typeof v === "number" ? String(v) : "");
const plain = f => str(f).replace(/\.(component|driver|plugin|bundle|kext|vst3?|framework|dylib)$/i, "");
const nice = p => {
  const n = arr(p.names).map(s => str(s, 120)).filter(Boolean)[0];
  return n ? n.replace(/^[^:]{1,40}:\s*/, "") : plain(p.file);
};
const maker = p => { const n = arr(p.names).map(s => str(s, 120))[0] || ""; const m = n.match(/^([^:]{1,40}):/); return m ? m[1].trim() : ""; };
const isApple = b => /^com\.apple\./.test(str(b.id));
const daysAgo = d => { const t = Date.parse(str(d)); return Number.isFinite(t) ? Math.floor((Date.now() - t) / DAY) : Infinity; };
const list = (names, max = 8) => { const u = [...new Set(names)]; return u.slice(0, max).join(", ") + (u.length > max ? ` e altri ${u.length - max}` : ""); };
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
const where = w => w === "user" ? "~/Libreria/Audio/Plug-Ins/Components" : "/Libreria/Audio/Plug-Ins/Components";

// ---------- lettura del report ----------
function parseReport(text){
  if(!text || text.length > CK_MAX) return null;
  const s = text.indexOf("{"), e = text.lastIndexOf("}");
  if(s < 0 || e < s) return null;
  let r;
  try{ r = JSON.parse(text.slice(s, e + 1)); }catch{ return null; }
  if(!r || typeof r !== "object" || r.rigbook !== "checkup") return null;
  return r;
}

// ---------- analisi ----------
// livelli: bad = da sistemare, warn = da controllare, info = buono a sapersi
function analyze(r){
  const sys = r.sys && typeof r.sys === "object" ? r.sys : {};
  const arm = sys.arm === true;
  const logic = arr(r.logic);
  const plugs = arr(r.plugins).filter(p => p && typeof p === "object");
  const third = plugs.filter(p => !isApple(p));
  const out = [];
  const flag = new Map();   // plugin -> etichette da mostrare nella lista
  const tag = (p, t, lvl) => { if(!flag.has(p)) flag.set(p, []); flag.get(p).push([t, lvl]); };
  const add = (lvl, title, text, fix) => out.push({lvl, title, text, fix});

  // crash e blocchi
  const recent = arr(r.crashes).filter(c => c && daysAgo(c.date) <= 90);
  const crashes = recent.filter(c => c.kind !== "hang");
  const hangs = recent.filter(c => c.kind === "hang");
  const sus = new Map();
  for(const c of crashes){ const s = str(c.suspect, 200); if(s) sus.set(s, (sus.get(s) || 0) + 1); }
  const byKey = new Map();
  for(const p of plugs){ byKey.set(str(p.file).toLowerCase(), p); if(str(p.id)) byKey.set(str(p.id).toLowerCase(), p); }
  for(const [s, n] of [...sus].sort((a, b) => b[1] - a[1])){
    const p = byKey.get(s.toLowerCase());
    const name = p ? nice(p) : plain(s);
    if(p) tag(p, `in ${plural(n, "crash", "crash")}`, "bad");
    add("bad", `${name}: c'è in ${plural(n, "crash", "crash")} di Logic`,
      `Quando Logic si è chiuso da solo, il punto in cui si è rotto era dentro “${p ? plain(p.file) : plain(s)}”. È il primo sospettato.`,
      p ? "Aggiornalo dal sito del produttore. Se continua, disattivalo in Gestione plug-in oppure spostalo fuori dalla cartella dei plugin (vedi i passi sotto)."
        : "Aggiorna il programma o il driver a cui appartiene; se non ti serve, disinstallalo.");
  }
  const noSus = crashes.filter(c => !str(c.suspect)).length;
  if(noSus) add("warn", `${plural(noSus, "crash", "crash")} senza un plugin colpevole chiaro`,
    "Logic si è chiuso dentro il suo codice o quello di macOS. Succede con preferenze rovinate, progetti danneggiati o versioni di Logic e macOS che non vanno d'accordo.",
    "Aggiorna Logic e macOS, reimposta le preferenze e prova con un progetto nuovo (passi sotto).");
  const auHost = crashes.filter(c => /^AUHosting/i.test(str(c.app))).length;
  if(auHost) add("warn", `${plural(auHost, "plugin è andato", "plugin sono andati")} in crash nel “modo compatibilità”`,
    "Sono plugin che macOS fa girare a parte (di solito quelli solo Intel su un Mac Apple Silicon). Logic di solito resta aperto ma il plugin smette di suonare.",
    "Cerca la versione Apple Silicon di quei plugin.");
  if(hangs.length) add("warn", `Logic si è bloccato ${plural(hangs.length, "volta", "volte")} (non rispondeva)`,
    "I blocchi vengono spesso da un plugin pesante o vecchio, dalla scheda audio (driver o frequenza diversa) o dal disco quasi pieno.",
    "Controlla i punti qui sopra e prova a raddoppiare il buffer in Impostazioni › Audio.");

  // plugin doppi
  const groups = new Map();
  for(const p of third){ const k = str(p.id).toLowerCase() || "file:" + str(p.file).toLowerCase(); if(!groups.has(k)) groups.set(k, []); groups.get(k).push(p); }
  for(const g of groups.values()) if(g.length > 1){
    g.forEach(p => tag(p, "doppio", "bad"));
    add("bad", `${nice(g[0])} è installato due volte`,
      `Ci sono ${g.length} copie (${g.map(p => `${str(p.ver, 30) || "versione ?"} in ${where(p.where)}`).join("; ")}). Logic può caricare quella sbagliata e andare in conflitto.`,
      "Tieni solo la più nuova: l'altra spostala in una cartella sul Desktop.");
  }

  // plugin rotti
  const broken = third.filter(p => p.broken);
  broken.forEach(p => tag(p, "incompleto", "bad"));
  if(broken.length) add("bad", `${plural(broken.length, "plugin incompleto", "plugin incompleti")}`,
    `Manca il file del programma dentro: ${list(broken.map(nice))}. Spesso resta così dopo una disinstallazione a metà.`,
    "Reinstallali dall'installer ufficiale, oppure toglili dalla cartella dei plugin.");

  // architettura
  const ok = third.filter(p => !p.broken && arr(p.arch).length);
  const rosetta = logic.some(l => l && l.rosetta === true);
  if(arm){
    const intel = ok.filter(p => !arr(p.arch).includes("arm64"));
    intel.forEach(p => tag(p, "solo Intel", rosetta ? "info" : "warn"));
    if(intel.length) add(rosetta ? "info" : "warn", `${plural(intel.length, "plugin funziona", "plugin funzionano")} solo su Mac Intel`,
      `${list(intel.map(nice))}. Su questo Mac (Apple Silicon) Logic non li carica oppure li fa girare in modo compatibilità: più lenti e tra le cause più comuni di crash e blocchi.`,
      "Scarica la versione “Apple Silicon” o “Universal” dal sito del produttore; se non esiste, valuta di toglierli.");
  }else{
    const armOnly = ok.filter(p => !arr(p.arch).includes("x86_64"));
    armOnly.forEach(p => tag(p, "non per Intel", "bad"));
    if(armOnly.length) add("bad", `${plural(armOnly.length, "plugin non è", "plugin non sono")} per Mac Intel`,
      `${list(armOnly.map(nice))} è fatto solo per Apple Silicon: su questo Mac non può funzionare.`, "Reinstalla la versione per Intel o Universal.");
  }
  if(arm && rosetta) add("warn", "Logic si apre con Rosetta",
    "È impostato per funzionare come su un Mac Intel: è più lento e consuma di più. Serve solo se usi plugin solo Intel.",
    "Finder › Applicazioni › Logic Pro › Ottieni informazioni: togli la spunta “Apri con Rosetta”, se tutti i plugin che usi sono Apple Silicon.");

  // firma e quarantena
  const unsigned = ok.filter(p => p.signed === "no" || p.signed === "adhoc");
  unsigned.forEach(p => tag(p, "senza firma", "warn"));
  if(unsigned.length) add("warn", `${plural(unsigned.length, "plugin senza", "plugin senza")} firma dello sviluppatore`,
    `${list(unsigned.map(nice))}. Succede con plugin gratuiti vecchi, fatti in casa o versioni modificate (craccate), che sono spesso instabili.`,
    "Se li hai presi da fonti non ufficiali, scaricali di nuovo dal sito del produttore.");
  const quar = third.filter(p => p.quar);
  quar.forEach(p => tag(p, "bloccato da macOS?", "warn"));
  if(quar.length) add("warn", `${plural(quar.length, "plugin è", "plugin sono")} ancora “scaricati da internet”`,
    `${list(quar.map(nice))}. macOS può bloccarli quando Logic li carica, e Logic resta fermo sulla convalida.`,
    "Reinstallali con l'installer ufficiale, poi in Logic: Gestione plug-in › Reimposta e riconvalida.");

  // Logic
  if(!logic.length) add("info", "Logic Pro non trovato in Applicazioni", "Se è in un'altra cartella va bene lo stesso: il resto del check-up vale comunque.", "");
  for(const l of logic) if(arm && arr(l.arch).length && !arr(l.arch).includes("arm64"))
    add("warn", `Logic ${str(l.ver, 20)} è una versione vecchia`, "Non è fatta per i Mac Apple Silicon.", "Aggiorna Logic dall'App Store.");

  // driver e sistema
  const hal = arr(r.hal).filter(b => b && !isApple(b));
  const halOld = arm ? hal.filter(b => arr(b.arch).length && !arr(b.arch).includes("arm64")) : [];
  if(halOld.length) add("bad", `Driver audio vecchi: ${list(halOld.map(b => plain(b.file)))}`,
    "Sono caricati da tutte le app audio e non sono fatti per questo Mac: possono bloccare Logic all'avvio o quando cambi scheda audio.",
    "Aggiornali o disinstallali (con il programma che li ha installati).");
  const halRest = hal.filter(b => !halOld.includes(b));
  if(halRest.length) add("info", `Driver audio aggiuntivi: ${list(halRest.map(b => plain(b.file)))}`,
    "Dispositivi audio virtuali o di altre app (videochiamate, registrazione schermo, routing). Di solito va bene, ma se Logic si blocca all'avvio sono tra i primi da provare a togliere.",
    "Tieni solo quelli che usi e aggiornati.");
  const midiOld = arm ? arr(r.midi).filter(b => b && arr(b.arch).length && !arr(b.arch).includes("arm64")) : [];
  if(midiOld.length) add("warn", `Driver MIDI vecchi: ${list(midiOld.map(b => plain(b.file)))}`,
    "Non sono fatti per questo Mac e possono rallentare l'avvio di Logic.", "Aggiornali o disinstallali.");
  const kext = arr(r.kext).filter(Boolean);
  if(kext.length) add(arm ? "warn" : "info", `Estensioni di sistema di terze parti: ${list(kext.map(k => plain(k.file)))}`,
    "Sono driver vecchio stile (di schede audio o altro hardware). Se sono di apparecchi che non usi più, meglio toglierle.",
    "Disinstallale con il loro programma, o aggiorna il driver dal sito del produttore.");

  const free = Number(sys.freeGB);
  if(Number.isFinite(free)){
    if(free < 15) add("bad", `Disco quasi pieno: ${free} GB liberi`, "Con così poco spazio macOS e Logic rallentano e possono bloccarsi (memoria, salvataggi automatici).", "Libera almeno 30–50 GB: vecchi progetti e librerie su un disco esterno.");
    else if(free < 40) add("warn", `Poco spazio libero: ${free} GB`, "Con librerie di suoni grandi e progetti lunghi lo spazio finisce in fretta.", "Tieni libero almeno il 15–20% del disco.");
  }
  const ram = Number(sys.ramGB);
  if(Number.isFinite(ram) && ram > 0 && ram <= 8) add("info", `${ram} GB di RAM`, "Bastano per progetti piccoli; con molti strumenti virtuali e campionatori Logic può bloccarsi.", "Congela le tracce pesanti (Freeze) o fai il bounce degli strumenti.");
  if(sys.sip === "off") add("info", "Protezione di sistema (SIP) disattivata", "Di solito si spegne per driver vecchi o software particolari.", "Se non sai perché è spenta, riattivala.");

  // dispositivi audio
  const dev = arr(r.devices).filter(d => d && typeof d === "object");
  const dOut = dev.find(d => d.defOut), dIn = dev.find(d => d.defIn);
  if(dOut && /bluetooth/i.test(str(dOut.transport))) add("warn", `L'uscita audio è Bluetooth (${str(dOut.name, 60)})`,
    "Le cuffie Bluetooth hanno molto ritardo e, se si attiva il loro microfono, cambiano frequenza: Logic può fermarsi o andare in errore.",
    "In Logic › Impostazioni › Audio scegli la scheda audio o gli altoparlanti del Mac.");
  if(dOut && dIn && dOut.name !== dIn.name && Number(dOut.rate) && Number(dIn.rate) && Number(dOut.rate) !== Number(dIn.rate))
    add("warn", "Ingresso e uscita a frequenze diverse",
      `${str(dIn.name, 60)} a ${Number(dIn.rate) / 1000} kHz e ${str(dOut.name, 60)} a ${Number(dOut.rate) / 1000} kHz: Logic deve unirli e può dare scatti o errori.`,
      "In Logic usa lo stesso dispositivo per ingresso e uscita, oppure mettili alla stessa frequenza in Configurazione MIDI Audio.");

  const other = r.other && typeof r.other === "object" ? r.other : {};
  const vst = (Number(other.vst) || 0) + (Number(other.vst3) || 0);
  if(vst) add("info", `${plural(vst, "plugin VST", "plugin VST")} installati`, "Logic usa solo gli Audio Unit: i VST non c'entrano con i suoi crash.", "");

  const rank = {bad:0, warn:1, info:2};
  out.sort((a, b) => rank[a.lvl] - rank[b.lvl]);
  return {issues: out, flag, plugs: third, crashes, hangs, arm, logic, sys, dev, dIn, dOut};
}

// ---------- disegno ----------
const LVL = {bad:"Da sistemare", warn:"Da controllare", info:"Buono a sapersi"};
const STEPS = [
  ["Prova senza plugin", "Chiudi Logic e riaprilo tenendo premuto il tasto Ctrl: scegli di avviarlo senza Audio Unit. Se così non crasha, il colpevole è un plugin."],
  ["Prova un progetto nuovo", "Se un progetto vuoto va bene e il tuo no, il problema è in un plugin o in una traccia di quel progetto."],
  ["Disattiva i sospetti", "Logic Pro › Impostazioni › Gestione plug-in: togli la spunta ai plugin segnalati qui sopra, poi “Reimposta e riconvalida”."],
  ["Togli un plugin per prova", "Finder › Vai › Vai alla cartella… e scrivi /Library/Audio/Plug-Ins/Components. Sposta il plugin sospetto in una cartella sul Desktop (lo rimetti quando vuoi), poi riapri Logic."],
  ["Reimposta le preferenze", "Logic Pro › Impostazioni › Reimposta le impostazioni (tranne i comandi da tastiera). I progetti non si toccano."],
  ["Buffer e scheda audio", "Impostazioni › Audio: buffer 128–256 quando registri, 1024 quando mixi. Driver della scheda audio aggiornato."],
  ["Aggiorna tutto", "Logic dall'App Store, macOS, e i plugin dal sito di ogni produttore."],
];

const el = (tag, cls, text) => { const e = document.createElement(tag); if(cls) e.className = cls; if(text != null) e.textContent = text; return e; };

function render(r){
  const a = analyze(r);
  const box = $("ckResult");
  box.replaceChildren();

  // il Mac
  const mac = el("div", "ck-mac");
  const devName = a.dev.find(d => d.defOut && !/builtin|bluetooth|hdmi|displayport|virtual/i.test(str(d.transport)))?.name || a.dev.find(d => /usb|thunderbolt|firewire|pci/i.test(str(d.transport)))?.name;
  const bits = [
    `macOS ${str(a.sys.macos, 20) || "?"}`, a.arm ? "Apple Silicon" : "Intel",
    Number(a.sys.ramGB) ? `${Number(a.sys.ramGB)} GB RAM` : "", Number.isFinite(Number(a.sys.freeGB)) ? `${Number(a.sys.freeGB)} GB liberi` : "",
    a.logic.length ? `Logic ${a.logic.map(l => str(l.ver, 20)).join(", ")}` : "Logic non trovato",
    `${a.plugs.length} plugin AU`, devName ? `Scheda: ${str(devName, 60)}` : "",
  ].filter(Boolean);
  mac.append(el("strong", "", str(a.sys.model, 40) || "Mac"), el("span", "", bits.join(" · ")));
  const when = Date.parse(str(r.made));
  if(Number.isFinite(when)) mac.append(el("small", "", "Check-up del " + new Date(when).toLocaleString("it-IT", {dateStyle:"medium", timeStyle:"short"})));
  box.append(mac);

  // verdetto
  const nb = a.issues.filter(i => i.lvl === "bad").length, nw = a.issues.filter(i => i.lvl === "warn").length;
  const v = el("p", "ck-verdict " + (nb ? "bad" : nw ? "warn" : "ok"));
  v.textContent = nb || nw
    ? [nb && plural(nb, "cosa da sistemare", "cose da sistemare"), nw && plural(nw, "da controllare", "da controllare")].filter(Boolean).join(" e ") + "."
    : "Niente di strano nel Mac. Se Logic crasha ancora, segui i passi qui sotto.";
  const crashLine = el("span", "", a.crashes.length || a.hangs.length
    ? ` Negli ultimi 3 mesi: ${plural(a.crashes.length, "crash", "crash")}, ${plural(a.hangs.length, "blocco", "blocchi")}.`
    : " Nessun crash di Logic registrato negli ultimi 3 mesi.");
  v.append(crashLine);
  box.append(v);

  // problemi
  if(a.issues.length){
    const ul = el("ul", "ck-issues");
    for(const i of a.issues){
      const li = el("li", "ck-issue " + i.lvl);
      li.append(el("span", "ck-badge", LVL[i.lvl]), el("h3", "", i.title), el("p", "", i.text));
      if(i.fix){ const f = el("p", "ck-fix"); f.append(el("b", "", "Cosa fare: "), document.createTextNode(i.fix)); li.append(f); }
      ul.append(li);
    }
    box.append(ul);
  }

  // passi
  const sh = el("h3", "ck-h", "Per trovare il colpevole");
  const ol = el("ol", "steps ck-steps");
  STEPS.forEach(([t, d], n) => {
    const li = el("li", ["cat-guitar","cat-fx","cat-interface","cat-amp","cat-outboard","cat-mic","cat-keys"][n % 7]);
    const div = el("div"); div.append(el("h3", "", t), el("p", "", d));
    li.append(el("span", "num", String(n + 1)), div);
    li.querySelector(".num").setAttribute("aria-hidden", "true");
    ol.append(li);
  });
  box.append(sh, ol);

  // tutti i plugin
  if(a.plugs.length){
    const det = el("details", "ck-all");
    det.append(el("summary", "", `Tutti i plugin Audio Unit (${a.plugs.length})`));
    const ul = el("ul", "ck-plugs");
    const sorted = [...a.plugs].sort((x, y) => (a.flag.has(y) - a.flag.has(x)) || nice(x).localeCompare(nice(y), "it"));
    for(const p of sorted){
      const li = el("li");
      const left = el("div");
      left.append(el("strong", "", nice(p)), el("small", "", [maker(p), str(p.ver, 30) && "v" + str(p.ver, 30), p.where === "user" ? "solo questo utente" : ""].filter(Boolean).join(" · ")));
      const tags = el("div", "ck-tags");
      const ar = arr(p.arch);
      if(!p.broken) tags.append(el("span", "ck-tag", ar.includes("arm64") && ar.includes("x86_64") ? "Universal" : ar.includes("arm64") ? "Apple Silicon" : ar.length ? "Intel" : "?"));
      for(const [t, lvl] of a.flag.get(p) || []) tags.append(el("span", "ck-tag " + lvl, t));
      li.append(left, tags);
      ul.append(li);
    }
    det.append(ul);
    box.append(det);
  }
  box.hidden = false;
  $("ckStart").hidden = true;
  $("ckAgain").hidden = false;
  $("ckCopy").hidden = false;
  $("ckCopy").textContent = "Copia riepilogo";
  box.dataset.summary = summary(a);
  $("ckDlg").querySelector(".dlg-body").scrollTop = 0;
}

function summary(a){
  const L = [`Check-up Logic — ${str(a.sys.model, 40)} · macOS ${str(a.sys.macos, 20)} · ${a.arm ? "Apple Silicon" : "Intel"} · ${Number(a.sys.ramGB) || "?"} GB RAM · ${Number(a.sys.freeGB) || "?"} GB liberi`,
    `Logic: ${a.logic.map(l => str(l.ver, 20)).join(", ") || "non trovato"} · ${a.plugs.length} plugin AU · ultimi 3 mesi: ${a.crashes.length} crash, ${a.hangs.length} blocchi`, ""];
  if(!a.issues.length) L.push("Niente di strano.");
  for(const i of a.issues) L.push(`[${LVL[i.lvl]}] ${i.title}`, `  ${i.text}`, ...(i.fix ? [`  → ${i.fix}`] : []), "");
  return L.join("\n");
}

function load(text, quiet){
  const r = parseReport(text);
  if(!r){ if(!quiet) showErr("Questo non sembra il risultato del check-up. Rilancia il comando nel Terminale e incolla di nuovo."); return false; }
  showErr("");
  try{ localStorage.setItem(CK_KEY, JSON.stringify(r)); }catch{}
  render(r);
  return true;
}
function showErr(t){ $("ckErr").textContent = t; $("ckErr").hidden = !t; }
function restart(){
  $("ckResult").hidden = true; $("ckStart").hidden = false; $("ckAgain").hidden = true; $("ckCopy").hidden = true;
  $("ckPaste").value = ""; showErr(""); $("ckCmdCopy").focus();
}

// ---------- eventi ----------
$("ckCmd").textContent = CK_CMD;
$("ckSrc").href = CK_URL;
function open(){
  if(!$("ckDlg").open) $("ckDlg").showModal();
  let saved = null;
  try{ saved = localStorage.getItem(CK_KEY); }catch{}
  if($("ckResult").hidden && saved) load(saved, true);
}
$("checkupBtn").addEventListener("click", open);
$("ckClose").addEventListener("click", () => $("ckDlg").close());
$("ckAgain").addEventListener("click", restart);
$("ckCmdCopy").addEventListener("click", () => {
  const b = $("ckCmdCopy");
  const fallback = () => { const s = getSelection(), rg = document.createRange(); rg.selectNodeContents($("ckCmd")); s.removeAllRanges(); s.addRange(rg); b.textContent = "Ora premi ⌘C"; };
  if(!navigator.clipboard?.writeText){ fallback(); return; }
  navigator.clipboard.writeText(CK_CMD).then(() => { b.textContent = "Copiato ✓"; }).catch(fallback);
});
$("ckFromClip").addEventListener("click", async () => {
  try{
    const t = await navigator.clipboard.readText();
    if(!load(t)) $("ckPaste").focus();
  }catch{ showErr("Non riesco a leggere gli appunti: clicca nel riquadro e premi ⌘V."); $("ckPaste").focus(); }
});
$("ckPaste").addEventListener("paste", () => setTimeout(() => { if($("ckPaste").value.trim()) load($("ckPaste").value); }, 0));
$("ckGo").addEventListener("click", () => load($("ckPaste").value));
$("ckFileBtn").addEventListener("click", () => $("ckFile").click());
$("ckFile").addEventListener("change", async e => {
  const f = e.target.files?.[0]; e.target.value = "";
  if(!f) return;
  if(f.size > CK_MAX){ showErr("Il file è troppo grande per essere un check-up."); return; }
  load(await f.text());
});
$("ckCopy").addEventListener("click", () => {
  const t = $("ckResult").dataset.summary || "";
  navigator.clipboard?.writeText(t).then(() => { $("ckCopy").textContent = "Copiato ✓"; }, () => toast("Non riesco a copiare: seleziona il testo a mano."));
});
if(new URLSearchParams(location.search).has("checkup")) open();
})();
