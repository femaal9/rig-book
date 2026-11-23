// Rig Book — Check-up DAW per Mac (Logic Pro).
// Uso (Terminale):  curl -fsSL https://femaal9.github.io/rig-book/checkup.js | osascript -l JavaScript
// SOLO LETTURA: non cambia, non sposta e non cancella niente, e non manda niente su internet.
// Legge: versione di macOS e del Mac, spazio libero, Logic Pro, plugin Audio Unit, driver audio/MIDI,
// estensioni di sistema, dispositivi audio e i crash recenti di Logic. Il risultato va negli appunti
// e in un file sulla Scrivania (checkup-logic.json): incollalo in Rig Book > Check-up.
ObjC.import("Foundation");
ObjC.import("AppKit");

function run(){
  const sa = Application.currentApplication();
  sa.includeStandardAdditions = true;
  const fm = $.NSFileManager.defaultManager;
  const HOME = ObjC.unwrap($.NSHomeDirectory());
  const q = s => "'" + String(s).replace(/'/g, "'\\''") + "'";
  const sh = cmd => { try{ return sa.doShellScript(cmd + " 2>&1", {alteringLineEndings: false}).replace(/\s+$/, ""); }catch(e){ return ""; } };
  const tilde = p => p && p.startsWith(HOME + "/") ? "~" + p.slice(HOME.length) : p;
  const exists = p => fm.fileExistsAtPath(p);
  const ls = dir => { const a = fm.contentsOfDirectoryAtPathError(dir, null); return a.isNil() ? [] : ObjC.deepUnwrap(a); };
  const readPlist = p => { const d = $.NSDictionary.dictionaryWithContentsOfFile(p); return d.isNil() ? null : ObjC.deepUnwrap(d); };
  const mtime = p => { const a = fm.attributesOfItemAtPathError(p, null); if(a.isNil()) return null; const d = a.objectForKey("NSFileModificationDate"); return d.isNil() ? null : ObjC.unwrap(d.description).slice(0, 10); };
  const archs = exe => {
    const f = sh("/usr/bin/file -b " + q(exe));
    const out = [];
    if(/arm64/.test(f)) out.push("arm64");
    if(/x86_64/.test(f)) out.push("x86_64");
    if(/\bi386\b/.test(f)) out.push("i386");
    return out;
  };
  const sign = path => {
    const t = sh("/usr/bin/codesign -dv --verbose=2 " + q(path));
    if(/not signed at all/.test(t)) return {signed: "no"};
    const team = (t.match(/TeamIdentifier=(\S+)/) || [])[1];
    const auth = (t.match(/Authority=Developer ID Application: ([^\n]+)/) || [])[1];
    const adhoc = /Signature=adhoc/.test(t);
    return {signed: adhoc ? "adhoc" : (team && team !== "not" ? "yes" : (t ? "yes" : "?")), team: team === "not" ? undefined : team, dev: auth};
  };
  const quarantined = path => sh("/usr/bin/xattr -p com.apple.quarantine " + q(path) + " >/dev/null && echo Q") === "Q";

  // bundle generico (plugin, driver): nome, id, versione, architetture, firma
  function bundle(path, where){
    const info = readPlist(path + "/Contents/Info.plist") || {};
    const exeName = info.CFBundleExecutable;
    const exe = exeName ? path + "/Contents/MacOS/" + exeName : "";
    const b = {
      file: path.split("/").pop(), where,
      id: info.CFBundleIdentifier || "", ver: info.CFBundleShortVersionString || info.CFBundleVersion || "",
    };
    if(!exe || !exists(exe)){ b.broken = true; return b; }
    b.arch = archs(exe);
    b.date = mtime(exe);
    Object.assign(b, sign(path));
    if(quarantined(path)) b.quar = true;
    return b;
  }

  // ---------- sistema ----------
  const sys = {
    macos: sh("/usr/bin/sw_vers -productVersion"), build: sh("/usr/bin/sw_vers -buildVersion"),
    model: sh("/usr/sbin/sysctl -n hw.model"),
    cpu: sh("/usr/sbin/sysctl -n machdep.cpu.brand_string"),
    arm: sh("/usr/sbin/sysctl -n hw.optional.arm64") === "1",
    ramGB: Math.round(Number(sh("/usr/sbin/sysctl -n hw.memsize")) / 1073741824),
  };
  const df = sh("/bin/df -k /System/Volumes/Data || /bin/df -k /").split("\n").pop().trim().split(/\s+/);
  if(df.length > 3){ sys.diskGB = Math.round(Number(df[1]) / 1048576); sys.freeGB = Math.round(Number(df[3]) / 1048576); }
  const sip = sh("/usr/bin/csrutil status");
  if(sip) sys.sip = /enabled/.test(sip) ? "on" : "off";

  // ---------- Logic Pro ----------
  const logicPaths = new Set();
  ls("/Applications").filter(n => /^Logic Pro.*\.app$/.test(n)).forEach(n => logicPaths.add("/Applications/" + n));
  sh("/usr/bin/mdfind \"kMDItemCFBundleIdentifier == 'com.apple.logic10'\"").split("\n").filter(p => p.endsWith(".app")).forEach(p => logicPaths.add(p));
  const lsPrefs = sh("/usr/bin/defaults read " + q(HOME + "/Library/Preferences/com.apple.LaunchServices/com.apple.LaunchServices") + " 'Architectures for arm64'");
  const rosetta = /com\.apple\.logic10"?\s*=\s*\([^)]*x86_64/.test(lsPrefs);
  const logic = [...logicPaths].map(p => {
    const info = readPlist(p + "/Contents/Info.plist") || {};
    const exe = p + "/Contents/MacOS/" + (info.CFBundleExecutable || "");
    return {path: tilde(p), ver: info.CFBundleShortVersionString || "", arch: exists(exe) ? archs(exe) : [], rosetta: info.CFBundleIdentifier === "com.apple.logic10" && rosetta};
  });

  // ---------- plugin Audio Unit ----------
  const plugins = [];
  for(const [dir, where] of [["/Library/Audio/Plug-Ins/Components", "sys"], [HOME + "/Library/Audio/Plug-Ins/Components", "user"]]){
    for(const n of ls(dir)){
      if(!/\.component$/i.test(n)) continue;
      const p = dir + "/" + n;
      const b = bundle(p, where);
      const info = readPlist(p + "/Contents/Info.plist") || {};
      const comps = Array.isArray(info.AudioComponents) ? info.AudioComponents : [];
      b.names = comps.map(c => c && c.name).filter(Boolean).slice(0, 6);
      plugins.push(b);
    }
  }
  const count = dir => ls(dir).filter(n => !n.startsWith(".")).length;
  const other = {
    vst: count("/Library/Audio/Plug-Ins/VST") + count(HOME + "/Library/Audio/Plug-Ins/VST"),
    vst3: count("/Library/Audio/Plug-Ins/VST3") + count(HOME + "/Library/Audio/Plug-Ins/VST3"),
  };

  // ---------- driver audio (HAL), MIDI, estensioni ----------
  const hal = [], midi = [], kext = [];
  for(const [dir, where] of [["/Library/Audio/Plug-Ins/HAL", "sys"], [HOME + "/Library/Audio/Plug-Ins/HAL", "user"]])
    ls(dir).filter(n => /\.(driver|plugin|bundle)$/i.test(n)).forEach(n => hal.push(bundle(dir + "/" + n, where)));
  ls("/Library/Audio/MIDI Drivers").filter(n => /\.plugin$/i.test(n)).forEach(n => midi.push(bundle("/Library/Audio/MIDI Drivers/" + n, "sys")));
  ls("/Library/Extensions").filter(n => /\.kext$/i.test(n)).forEach(n => {
    const info = readPlist("/Library/Extensions/" + n + "/Contents/Info.plist") || {};
    if(!String(info.CFBundleIdentifier || "").startsWith("com.apple.")) kext.push({file: n, id: info.CFBundleIdentifier || "", ver: info.CFBundleShortVersionString || ""});
  });

  // ---------- dispositivi audio ----------
  const devices = [];
  try{
    const j = JSON.parse(sh("/usr/sbin/system_profiler -json SPAudioDataType"));
    for(const grp of j.SPAudioDataType || []) for(const d of grp._items || []) devices.push({
      name: d._name || "", maker: d.coreaudio_device_manufacturer || "",
      transport: String(d.coreaudio_device_transport || "").replace("coreaudio_device_type_", ""),
      rate: Number(d.coreaudio_device_srate) || undefined,
      ins: Number(d.coreaudio_device_input) || 0, outs: Number(d.coreaudio_device_output) || 0,
      defIn: d.coreaudio_default_audio_input_device === "spaudio_yes",
      defOut: d.coreaudio_default_audio_output_device === "spaudio_yes",
    });
  }catch(e){}

  // ---------- crash e blocchi di Logic (ultimi 180 giorni) ----------
  const LIMIT = Date.now() - 180 * 864e5;
  const isOurs = n => /^(Logic Pro|AUHosting|AUHostingService|AudioComponentRegistrar)/i.test(n) && /\.(ips|crash|hang|spin|diag)$/i.test(n);
  const isSystem = p => !p || /^\/(System|usr\/lib|usr\/libexec)\//.test(p) || /\/Logic Pro[^/]*\.app\//.test(p);
  const plugOf = p => (String(p).match(/([^/]+\.(component|vst3|vst|driver|plugin|bundle|framework|dylib))(\/|$)/i) || [])[1] || String(p).split("/").pop();
  const crashes = [];
  const seen = new Set();
  for(const dir of [HOME + "/Library/Logs/DiagnosticReports", HOME + "/Library/Logs/DiagnosticReports/Retired", "/Library/Logs/DiagnosticReports", "/Library/Logs/DiagnosticReports/Retired"]){
    for(const n of ls(dir)){
      if(!isOurs(n) || seen.has(n)) continue;
      const p = dir + "/" + n;
      const m = mtime(p);
      if(!m || Date.parse(m) < LIMIT) continue;
      seen.add(n);
      const c = {file: n, date: m, kind: /\.(hang|spin)$/i.test(n) ? "hang" : "crash", app: n.replace(/[-_]\d{4}-\d\d-\d\d.*$/, "")};
      const txt = ObjC.unwrap($.NSString.stringWithContentsOfFileEncodingError(p, $.NSUTF8StringEncoding, null)) || "";
      if(/\.ips$/i.test(n)){
        const nl = txt.indexOf("\n");
        try{
          const head = JSON.parse(txt.slice(0, nl));
          const body = JSON.parse(txt.slice(nl + 1));
          if(head.bug_type === "288" || head.bug_type === "298") c.kind = "hang";
          const imgs = body.usedImages || [];
          c.exc = [body.exception && body.exception.type, body.exception && body.exception.signal].filter(Boolean).join(" ");
          const th = (body.threads || [])[body.faultingThread];
          if(th && th.frames){
            for(const f of th.frames){
              const im = imgs[f.imageIndex];
              if(im && !isSystem(im.path)){ c.suspect = plugOf(im.path || im.name); break; }
            }
          }
          c.loaded = [...new Set(imgs.map(i => i.path).filter(p => p && /\/Audio\/Plug-Ins\/|\.component\//.test(p)).map(plugOf))].slice(0, 60);
        }catch(e){}
      }else{
        // vecchio formato di testo: il primo modulo non di sistema nel thread andato in crash
        const m2 = txt.match(/Thread \d+ Crashed[^\n]*\n([\s\S]*?)\n\n/);
        if(m2) for(const line of m2[1].split("\n")){
          const mod = (line.match(/^\d+\s+(\S+)/) || [])[1];
          if(mod && !/^(libsystem|libc|libobjc|libdispatch|CoreFoundation|Foundation|AppKit|CoreAudio|AudioToolbox|Logic|MAFiles|MAToolKit|MADSP|dyld|\?\?\?)/i.test(mod)){ c.suspect = mod; break; }
        }
        c.loaded = [...new Set((txt.match(/[^/\s]+\.component(?=\/)/g) || []))].slice(0, 60);
      }
      crashes.push(c);
    }
  }
  crashes.sort((a, b) => a.date < b.date ? 1 : -1);

  const report = {rigbook: "checkup", v: 1, made: new Date().toISOString(), sys, logic, plugins, other, hal, midi, kext, devices, crashes: crashes.slice(0, 80)};
  const json = JSON.stringify(report);

  // negli appunti e sulla Scrivania
  const pb = $.NSPasteboard.generalPasteboard;
  pb.clearContents;
  pb.setStringForType($(json), $.NSPasteboardTypeString);
  const out = HOME + "/Desktop/checkup-logic.json";
  const saved = $(json).writeToFileAtomicallyEncodingError(out, true, $.NSUTF8StringEncoding, null);

  const red = plugins.filter(p => p.broken || p.signed === "no").length;
  return [
    "",
    "Check-up fatto. Niente è stato modificato.",
    "  macOS " + sys.macos + " · " + (sys.arm ? "Apple Silicon" : "Intel") + " · " + sys.ramGB + " GB RAM · " + (sys.freeGB ?? "?") + " GB liberi",
    "  Logic: " + (logic.length ? logic.map(l => l.ver).join(", ") : "non trovato"),
    "  Plugin Audio Unit: " + plugins.length + (red ? " (" + red + " da controllare)" : ""),
    "  Crash/blocchi di Logic negli ultimi 6 mesi: " + crashes.length,
    "",
    "Il risultato è già negli appunti" + (saved ? " (e in " + tilde(out) + ")." : "."),
    "Ora apri Rig Book > Check-up e incollalo.",
    "",
  ].join("\n");
}
