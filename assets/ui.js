import { $, $$, S, escapeHtml, fmtDateEU, parseSinotticoNameDate } from "./engine.js";

export function toast(title, msg){
  $("#toastTitle").textContent = title;
  $("#toastMsg").textContent = msg;
  const t = $("#toast");
  t.style.display = "block";
  clearTimeout(toast._t);
  toast._t = setTimeout(()=> t.style.display="none", 3600);
}

export function setDot(id, state){
  const el = $(id);
  el.className = "dot " + (state==="ok" ? "ok" : state==="warn" ? "warn" : state==="bad" ? "bad" : "");
}

export function setStatus(ok, text){
  $("#dotStatus").className = "dot " + (ok ? "ok" : "");
  $("#txtStatus").textContent = text;
}

export function showView(id){
  $$(".view").forEach(v=>v.classList.remove("active"));
  $(id).classList.add("active");
}

export function saveSession(sess){
  try{ localStorage.setItem(S.cacheKey, JSON.stringify(sess)); }catch(e){}
}
export function loadSession(){
  try{
    const raw = localStorage.getItem(S.cacheKey);
    if(!raw) return null;
    return JSON.parse(raw);
  }catch(e){ return null; }
}
export function clearSession(){
  try{ localStorage.removeItem(S.cacheKey); }catch(e){}
}

/* ===== Banner aggiornamento (ultimo sinottico) ===== */
export function updateBannerFromManifest(){
  const pill = $("#pillUpdate");
  const dot = $("#dotUpdate");
  const txt = $("#txtUpdate");

  const arr = S.manifest?.sinottici;
  if(!Array.isArray(arr) || arr.length===0){
    dot.className = "dot warn";
    txt.textContent = "Ultimo sinottico: manifest vuoto";
    return;
  }

  const lastName = arr[arr.length-1];
  const d = parseSinotticoNameDate(lastName);

  if(!d){
    dot.className = "dot warn";
    txt.textContent = `Ultimo sinottico: ${lastName}`;
    return;
  }

  const now = new Date();
  const sameDay = (d.getFullYear()===now.getFullYear() && d.getMonth()===now.getMonth() && d.getDate()===now.getDate());

  if(sameDay){
    dot.className = "dot ok";
    const hh = String(d.getHours()).padStart(2,"0");
    const mm = String(d.getMinutes()).padStart(2,"0");
    txt.textContent = `Aggiornato oggi alle ${hh}:${mm}`;
  }else{
    dot.className = "dot bad";
    txt.textContent = `Non aggiornato (ultimo: ${fmtDateEU(d)})`;
  }

  // Per viewExpired
  $("#expiredLast").textContent = fmtDateEU(d);
}
import { S, fmtDateEU, fmtMoneyInt } from "./engine.js";
import { machinePrediction, peerMachinesSameModel, modelProfile } from "./engine.js";

const $ = (s)=>document.querySelector(s);

export function bindMachineRowClicks(){
  const tbody = $("#tblMachines tbody");
  if(!tbody) return;
  tbody.addEventListener("click",(e)=>{
    const tr = e.target.closest("tr[data-codeid]");
    if(!tr) return;
    const codeid = tr.getAttribute("data-codeid");
    const m = S.machines.get(codeid);
    if(m) openMachineModal(m);
  });
}

export function openMachineModal(m){
  const modal = $("#machineModal");
  if(!modal) return;

  // header
  $("#mmTitle").textContent = `${m.locale || "Locale N/A"} — ${m.modelName || "Modello N/A"}`;
  $("#mmSub").textContent = `CODEID ${m.codeid} • PDA ${m.pda||"N/A"} • Ultima lettura: ${m.ts ? fmtDateEU(m.ts) : "N/A"}`;

  // KPI
  const kpis = $("#mmKpis");
  kpis.innerHTML = `
    <div class="kpi"><div class="label">IN tot</div><div class="value">${m.cntIn!=null?fmtMoneyInt(m.cntIn):"N/A"}</div><div class="hint">Contatore totale</div></div>
    <div class="kpi"><div class="label">OUT tot</div><div class="value">${m.cntOut!=null?fmtMoneyInt(m.cntOut):"N/A"}</div><div class="hint">Contatore totale</div></div>
    <div class="kpi"><div class="label">% OUT</div><div class="value">${(typeof m.pctOut==="number")?m.pctOut.toFixed(2)+"%":"N/A"}</div><div class="hint">Indicatore sinottico</div></div>
    <div class="kpi"><div class="label">NoLink</div><div class="value">${m.ggNoLink||0} gg</div><div class="hint">Mancato collegamento</div></div>
  `;

  // storico
  const h = (S.history.get(m.codeid)||[]).slice().sort((a,b)=>b.ts-a.ts).slice(0,80);
  const tb = $("#mmHist tbody");
  tb.innerHTML = h.map(p=>{
    const note = (p.dOut && p.dOut>0) ? (p.dOut>=50 ? "PAYOUT alto" : "Payout") : "";
    return `<tr>
      <td>${fmtDateEU(p.ts)}</td>
      <td>${fmtMoneyInt(p.dIn||0)}</td>
      <td>${fmtMoneyInt(p.dOut||0)}</td>
      <td>${(typeof p.pct==="number")?p.pct.toFixed(2)+"%":"—"}</td>
      <td>${note}</td>
    </tr>`;
  }).join("");

  // predizione
  const pred = machinePrediction(m);
  $("#mmPredict").innerHTML = pred.ok ? `
    <div><b>Modello:</b> ${pred.modelKey}</div>
    <div><b>Progress IN (da ultimo payout):</b> ${fmtMoneyInt(pred.progressIn)}</div>
    <div><b>IN stimato rimanente:</b> <b>${fmtMoneyInt(pred.remainingIn)}</b></div>
    <div><b>Velocità stimata:</b> ${pred.rateEuroPerHour ? pred.rateEuroPerHour.toFixed(1)+" €/h" : "N/A"}</div>
    <div><b>ETA:</b> ${pred.etaHours!=null ? pred.etaHours.toFixed(1)+" ore" : "N/A (storico insufficiente)"}</div>
    <hr style="border:none;border-top:1px solid var(--line);margin:10px 0">
    <div><b>Quanto potrebbe pagare:</b> mediana ${pred.expectedPayoutMed?fmtMoneyInt(pred.expectedPayoutMed):"N/A"} • media ${pred.expectedPayoutAvg?fmtMoneyInt(pred.expectedPayoutAvg):"N/A"}</div>
    <div class="muted" style="margin-top:6px">È una stima statistica: migliora con più storico e più macchine del modello.</div>
  ` : `<div class="muted">${pred.reason}</div>`;

  // peers (macchine uguali)
  const peers = peerMachinesSameModel(m, 8);
  $("#mmPeers").innerHTML = peers.length ? peers.map(x=>{
    const p = x.pred;
    const eta = p.ok && p.etaHours!=null ? `${p.etaHours.toFixed(1)}h` : "N/A";
    const rem = p.ok ? fmtMoneyInt(p.remainingIn) : "N/A";
    return `<div style="padding:8px 0;border-bottom:1px dashed var(--line)">
      <div><b>${x.m.locale||"N/A"}</b> • CODEID ${x.m.codeid}</div>
      <div class="muted">Rimanente: ${rem} • ETA: ${eta} • NoLink: ${x.m.ggNoLink||0}gg</div>
    </div>`;
  }).join("") : `<div class="muted">Nessuna macchina “uguale” trovata nello snapshot.</div>`;

  // fingerprint (modello)
  const prof = modelProfile((pred.modelKey || (m.modelCode||m.modelName||"UNKNOWN")));
  $("#mmAlgo").innerHTML = `
    <div><b>Soglia payout (stimata):</b> ${prof.payoutThreshold!=null?fmtMoneyInt(prof.payoutThreshold):"N/A"}</div>
    <div><b>Ciclo stimato (mediana IN tra payout):</b> ${prof.cycleIn!=null?fmtMoneyInt(prof.cycleIn):"N/A"}</div>
    <div><b>Payout mediano:</b> ${prof.payoutMed!=null?fmtMoneyInt(prof.payoutMed):"N/A"}</div>
    <div><b>Payout medio:</b> ${prof.payoutAvg!=null?fmtMoneyInt(prof.payoutAvg):"N/A"}</div>
    <div><b>Volatilità (p90/med):</b> ${prof.volatility!=null?prof.volatility.toFixed(2):"N/A"}</div>
    <div class="muted" style="margin-top:6px">Fingerprint = ciclo+volatilità+payout spikes (profilo statistico).</div>
  `;

  // open/close
  modal.style.display = "block";
  $("#mmClose").onclick = closeMachineModal;
  modal.querySelector(".modal-backdrop").onclick = closeMachineModal;
}

export function closeMachineModal(){
  const modal = $("#machineModal");
  if(modal) modal.style.display="none";
}
