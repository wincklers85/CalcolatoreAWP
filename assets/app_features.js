import {
  PATH, S, $, $$,
  fetchJSON, fetchArrayBuffer,
  parseSinottico,
  ensureLocal, ensureSetMap,
  addHistoryPoint, sortAllHistories, countAllHistoryPoints,
  fmtDateEU, fmtMoneyInt, escapeHtml
} from "./engine.js";

import { toast, setDot, showView, updateBannerFromManifest } from "./ui.js";

let diag = [];
function logDiag(line){
  diag.push(`[${new Date().toLocaleTimeString("it-IT")}] ${line}`);
  const box = $("#diagLog");
  if(box) box.textContent = diag.slice(-200).join("\n");
}

export function setAdminVisibility(level){
  const isAdmin = String(level||"").toLowerCase()==="admin";
  $("#adminPanel").style.display = isAdmin ? "block" : "none";
}

export function renderUsersTable(){
  if($("#adminPanel").style.display==="none") return;
  $("#adminUsersCount").textContent = String(S.users.length);
  $("#adminManifestCount").textContent = String(S.manifest?.sinottici?.length || 0);
  $("#adminMachinesCount").textContent = String(S.machines.size);
  $("#adminHistoryCount").textContent = String(countAllHistoryPoints());

  const tbody = $("#tblUsers tbody");
  if(!tbody) return;
  tbody.innerHTML = "";

  const now = new Date();
  for(const u of S.users){
    const exp = u.expires ? new Date(u.expires+"T00:00:00") : null;
    const expired = exp ? (isFinite(exp) && exp < now) : false;

    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td><b>${escapeHtml(u.user||"")}</b></td>
      <td>${escapeHtml(u.level||"")}</td>
      <td>${escapeHtml(u.expires||"—")}</td>
      <td>${expired?`<span class="badge"><span class="dot bad"></span>Scaduto</span>`:`<span class="badge"><span class="dot ok"></span>Attivo</span>`}</td>
    `;
    tbody.appendChild(tr);
  }
}

export async function selfTest(){
  $("#loginStatus").textContent = "Self-test in corso…";
  setDot("#dotUsers",""); setDot("#dotManifest",""); setDot("#dotXLSX","");

  const hasXLSX = typeof XLSX !== "undefined" && XLSX.read;
  setDot("#dotXLSX", hasXLSX ? "ok" : "bad");
  $("#xlsxInfo").textContent = hasXLSX ? "XLSX: OK" : "XLSX: NON caricato";

  try{
    const users = await fetchJSON(PATH.users);
    if(Array.isArray(users) && users.length){
      setDot("#dotUsers","ok");
      $("#usersInfo").textContent = `users.json: ${users.length} utenti`;
    }else{
      setDot("#dotUsers","warn");
      $("#usersInfo").textContent = `users.json: formato non valido`;
    }
  }catch(e){
    setDot("#dotUsers","bad");
    $("#usersInfo").textContent = `users.json: ${e.message}`;
  }

  try{
    const man = await fetchJSON(PATH.manifest);
    const arr = man && Array.isArray(man.sinottici) ? man.sinottici : null;
    if(arr && arr.length){
      setDot("#dotManifest","ok");
      $("#manifestInfo").textContent = `manifest.json: ${arr.length} sinottici`;
    }else{
      setDot("#dotManifest","warn");
      $("#manifestInfo").textContent = `manifest.json: sinottici mancanti`;
    }
  }catch(e){
    setDot("#dotManifest","bad");
    $("#manifestInfo").textContent = `manifest.json: ${e.message}`;
  }

  $("#loginStatus").textContent = "Self-test completato.";
}

export function initAppFeatures(){
  // buttons
  $("#btnAnalyzeAll")?.addEventListener("click", analyzeAll);
  $("#btnClearCache")?.addEventListener("click", ()=>{
    localStorage.removeItem(S.cacheKey);
    toast("Cache", "Sessione resettata.");
  });

  // chart limit label
  $("#chartLimitLabel").textContent = $("#chartLimit").value;
  $("#chartLimit").addEventListener("change", ()=>{
    $("#chartLimitLabel").textContent = $("#chartLimit").value;
  });
}

export function afterDataLoaded(){
  updateBannerFromManifest();
  renderUsersTable();
}

/* ====== ANALISI SINOTTICI (core) ====== */
export async function analyzeAll(){
  if(!S.manifest || !Array.isArray(S.manifest.sinottici) || !S.manifest.sinottici.length){
    toast("Errore", "manifest.json non valido o vuoto.");
    return;
  }
  if(typeof XLSX === "undefined" || !XLSX.read){
    toast("Errore", "Libreria XLSX non disponibile (CDN bloccato).");
    return;
  }

  $("#subMain").textContent = "Analisi in corso…";
  setDot("#dotData","warn");

  // reset
  S.machines.clear();
  S.history.clear();
  S.locals.clear();
  S.pdas.clear();
  S.provinces.clear();
  S.comunes.clear();
  S.models.clear();
  S.modelStats.clear();

  const files = S.manifest.sinottici.slice();
  $("#countFiles").textContent = String(files.length);

  let ok=0, fail=0, totalRows=0;

  for(let i=0;i<files.length;i++){
    const f = files[i];
    try{
      const buf = await fetchArrayBuffer(PATH.sinottico(f));
      const rows = parseSinottico(buf, f);
      totalRows += rows.length;

      for(const r of rows){
        if(r.ts && isFinite(r.ts) && r.cntIn !== null && r.cntOut !== null){
          addHistoryPoint(r.codeid, {ts:r.ts, in:r.cntIn, out:r.cntOut, pctOut:r.pctOut, row:r, file:f});
        }
        const prev = S.machines.get(r.codeid);
        if(!prev){
          S.machines.set(r.codeid, r);
        }else{
          const t1 = prev.ts ? prev.ts.getTime() : -1;
          const t2 = r.ts ? r.ts.getTime() : -1;
          if(t2 > t1) S.machines.set(r.codeid, r);
        }
      }

      ok++;
      $("#subMain").textContent = `Analisi: ${i+1}/${files.length} (OK:${ok}, KO:${fail})`;
      await new Promise(res=>setTimeout(res,0));
    }catch(e){
      fail++;
      logDiag(`Errore file ${f}: ${e.message}`);
      $("#subMain").textContent = `Analisi: ${i+1}/${files.length} (OK:${ok}, KO:${fail})`;
    }
  }

  sortAllHistories();
  buildIndexes();

  setDot("#dotData", fail? "warn":"ok");
  $("#dataInfo").textContent = `Dati: macchine=${S.machines.size} | file OK=${ok} KO=${fail}`;
  $("#histInfo").textContent = `Storico: ${countAllHistoryPoints()} letture`;

  $("#countMachines").textContent = String(S.machines.size);
  $("#countLocals").textContent = String(S.locals.size);

  $("#subMain").textContent = `Analisi completata. Righe lette: ${totalRows.toLocaleString("it-IT")}`;

  renderMachinesTable();
  renderUsersTable(); // refresh admin diagnostics
  logDiag(`Analisi completata: macchine=${S.machines.size}, storico=${countAllHistoryPoints()}`);
}

/* ===== Index ===== */
function buildIndexes(){
  for(const [codeid, m] of S.machines.entries()){
    const loc = ensureLocal(m.locale);
    loc.codeSede = m.codeSede || loc.codeSede;
    loc.address = m.indirizzo || loc.address;
    loc.provincia = m.provincia || loc.provincia;
    loc.comune = m.comune || loc.comune;
    loc.pdv = m.pdv || loc.pdv;

    if(m.pda) loc.pdaSet.add(m.pda);
    loc.codeids.add(codeid);

    if(m.pda) ensureSetMap(S.pdas, m.pda).add(codeid);
    if(m.provincia) ensureSetMap(S.provinces, m.provincia).add(codeid);
    if(m.comune) ensureSetMap(S.comunes, m.comune).add(codeid);
    if(m.modelCode) ensureSetMap(S.models, m.modelCode).add(codeid);
  }
}

/* ===== Table (minimo) ===== */
function computeScoreDummy(codeid){
  // placeholder: qui ci mettiamo lo scoring serio dopo
  const hist = S.history.get(codeid) || [];
  const base = Math.min(90, 10 + hist.length);
  const score = Math.max(5, Math.min(95, base));
  const label = score>=75?"Alto":score<=40?"Basso":"Medio";
  const color = score>=75?"ok":score<=40?"bad":"warn";
  return {score,label,color};
}

function statusChip(m){
  const s = (m.em||"").toUpperCase().includes("E") ? "E" : (m.em||"").toUpperCase().includes("M") ? "M" : "";
  const stale = (m.ggNoLink||0) >= 3;
  let dot="ok", label="Attiva";
  if(s==="M"){ dot="warn"; label="Magazzino"; }
  if(stale){ dot="warn"; label = label + ` | ${m.ggNoLink}gg no link`; }
  if((m.stato||"").toLowerCase().includes("blocc")){ dot="bad"; label="Bloccata"; }
  return `<span class="badge"><span class="dot ${dot}"></span>${label}</span>`;
}

function renderMachinesTable(){
  const tbody = $("#tblMachines tbody");
  tbody.innerHTML = "";

  const q = ($("#qSearch").value||"").trim().toLowerCase();
  const mode = $("#qFilter").value;

  const list = Array.from(S.machines.values()).map(m=>{
    const sc = computeScoreDummy(m.codeid);
    return {m, sc};
  });

  list.sort((a,b)=> b.sc.score - a.sc.score);

  const filtered = list.filter(({m,sc})=>{
    if(q){
      const hay = [m.locale,m.modelName,m.modelCode,m.codeid,m.pda,m.comune,m.provincia,m.indirizzo,m.codeSede,m.pdv].join(" ").toLowerCase();
      if(!hay.includes(q)) return false;
    }
    if(mode==="likely") return sc.score >= 70;
    if(mode==="active") return String(m.em||"").toUpperCase().includes("E");
    if(mode==="stale") return (m.ggNoLink||0) >= 3;
    return true;
  });

  for(const {m, sc} of filtered){
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${escapeHtml(m.locale||"N/A")}<div class="muted" style="font-size:12px">${escapeHtml(m.comune||"")}${m.provincia?(" ("+escapeHtml(m.provincia)+")"):""}</div></td>
      <td><b>${escapeHtml(m.modelName||"N/A")}</b><div class="muted mono">${escapeHtml(m.modelCode||"")}</div></td>
      <td class="mono">${escapeHtml(m.codeid)}<div class="muted" style="font-size:12px">${m.ts?fmtDateEU(m.ts):"N/A"}</div></td>
      <td class="mono">${escapeHtml(m.pda||"N/A")}</td>
      <td>${statusChip(m)}</td>
      <td><span class="badge"><span class="dot ${sc.color}"></span><b>${sc.score}</b>/100 • ${sc.label}</span></td>
    `;
    tbody.appendChild(tr);
  }
}
