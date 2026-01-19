import { S, fmtDateEU, fmtMoney, getModelKey, machinePrediction, peerMachinesSameModel } from "./engine.js";

const $ = (s)=>document.querySelector(s);

export function toast(title, msg){
  const t = $("#toast");
  if(!t) return;
  $("#toastTitle").textContent = title;
  $("#toastMsg").textContent = msg;
  t.style.display = "block";
  clearTimeout(toast._tm);
  toast._tm = setTimeout(()=>t.style.display="none", 3200);
}

export function setStatus(text, ok){
  $("#txtStatus").textContent = text;
  $("#dotStatus").style.background = ok ? "var(--good)" : "rgba(255,255,255,.22)";
}

export function showView(id){
  for(const v of document.querySelectorAll(".view")) v.classList.remove("active");
  $(id).classList.add("active");
}

export function progressShow(label){
  const w = $("#progressWrap");
  if(!w) return;
  w.style.display = "block";
  $("#progressText").textContent = label || "Caricamento…";
  $("#progressPct").textContent = "0%";
  $("#progressFill").style.width = "0%";
}
export function progressUpdate(done, total, label){
  const pct = total ? Math.round((done/total)*100) : 0;
  if(label) $("#progressText").textContent = label;
  $("#progressPct").textContent = `${pct}%`;
  $("#progressFill").style.width = `${pct}%`;
}
export function progressHide(){
  const w = $("#progressWrap");
  if(w) w.style.display = "none";
}

export function renderBanner(latestFileName, statusObj){
  $("#cardBanner").style.display = "block";
  $("#bannerFile").textContent = latestFileName || "—";
  $("#bannerTitle").textContent = statusObj.ok ? statusObj.text : statusObj.text;
  $("#bannerDot").style.background = statusObj.ok ? "var(--good)" : "var(--bad)";
  $("#bannerSub").textContent = "Basato su manifest.json (ultimo sinottico per data dal nome file).";
}

export function renderMachinesTable(list){
  const tbody = $("#tblMachines tbody");
  tbody.innerHTML = "";

  for(const m of list){
    const pred = machinePrediction(m);
    const predTxt = pred.ok
      ? `Rimanente ${fmtMoney(pred.remainingIn)} • ETA ${pred.etaHours!=null ? pred.etaHours.toFixed(1)+"h" : "N/A"}`
      : "Storico insufficiente";

    const tr = document.createElement("tr");
    tr.setAttribute("data-codeid", m.codeid); // <-- QUI, SEMPRE QUI

    tr.innerHTML = `
      <td>${m.locale || "N/A"}</td>
      <td>${m.comune || "—"}</td>
      <td>${(m.modelName || m.modelCode || "UNKNOWN")}</td>
      <td class="mono">${m.codeid}</td>
      <td>${m.pda || "—"}</td>
      <td>${m.em || "—"}</td>
      <td>${predTxt}</td>
    `;
    tbody.appendChild(tr);
  }

  $("#countMachines").textContent = String(S.machines.size);
  $("#countLocals").textContent = String(new Set(Array.from(S.machines.values()).map(x=>x.locale||"")).size);
  $("#countModels").textContent = String(S.models.size);
  $("#countFiles").textContent = String(S.manifest?.sinottici?.length || 0);
}

export function bindMachineRowClicks(){
  const tbody = $("#tblMachines tbody");
  tbody.addEventListener("click",(e)=>{
    const tr = e.target.closest("tr[data-codeid]");
    if(!tr) return;
    const codeid = tr.getAttribute("data-codeid");
    const snap = S.machines.get(codeid);
    if(snap) openMachineModal(snap);
  });
}

export function openMachineModal(m){
  const modal = $("#machineModal");
  if(!modal) return;

  $("#mmTitle").textContent = `${m.locale || "Locale N/A"} — ${(m.modelName || m.modelCode || "UNKNOWN")}`;
  $("#mmSub").textContent = `CODEID ${m.codeid} • PDA ${m.pda||"N/A"} • Ultima lettura: ${m.ts ? fmtDateEU(m.ts) : "N/A"}`;

  const inTot = (m.cntInCents!=null) ? fmtMoney(m.cntInCents/100) : "N/A";
  const outTot= (m.cntOutCents!=null)? fmtMoney(m.cntOutCents/100) : "N/A";

  $("#mmKpis").innerHTML = `
    <div class="kpi"><div class="label">IN tot</div><div class="value">${inTot}</div><div class="hint">contatore (centesimi→€)</div></div>
    <div class="kpi"><div class="label">OUT tot</div><div class="value">${outTot}</div><div class="hint">contatore (centesimi→€)</div></div>
    <div class="kpi"><div class="label">% OUT</div><div class="value">${(typeof m.pctOut==="number")?m.pctOut.toFixed(2)+"%":"N/A"}</div><div class="hint">sinottico</div></div>
    <div class="kpi"><div class="label">NoLink</div><div class="value">${m.ggNoLink||0} gg</div><div class="hint">mancato collegamento</div></div>
  `;

  // storico
  const h = (S.history.get(m.codeid)||[]).slice().sort((a,b)=>b.ts-a.ts).slice(0,80);
  const tb = $("#mmHist tbody");
  tb.innerHTML = h.map(p=>{
    const note = (p.dOut && p.dOut>0) ? (p.dOut>=50 ? "PAYOUT alto" : "Payout") : "";
    return `<tr>
      <td>${fmtDateEU(p.ts)}</td>
      <td>${fmtMoney(p.dIn||0)}</td>
      <td>${fmtMoney(p.dOut||0)}</td>
      <td>${(typeof p.pct==="number")?p.pct.toFixed(2)+"%":"—"}</td>
      <td>${note}</td>
    </tr>`;
  }).join("");

  // predizione
  const pred = machinePrediction(m);
  $("#mmPredict").innerHTML = pred.ok ? `
    <div><b>Modello:</b> ${pred.modelKey}</div>
    <div><b>Progress IN (da ultimo payout):</b> ${fmtMoney(pred.progressIn)}</div>
    <div><b>IN stimato rimanente:</b> <b>${fmtMoney(pred.remainingIn)}</b></div>
    <div><b>Velocità stimata:</b> ${pred.rateEuroPerHour ? pred.rateEuroPerHour.toFixed(1)+" €/h" : "N/A"}</div>
    <div><b>ETA:</b> ${pred.etaHours!=null ? pred.etaHours.toFixed(1)+" ore" : "N/A"}</div>
    <hr style="border:none;border-top:1px solid rgba(255,255,255,.12);margin:10px 0">
    <div><b>Quanto potrebbe pagare:</b> mediana ${pred.expectedPayoutMed?fmtMoney(pred.expectedPayoutMed):"N/A"} • media ${pred.expectedPayoutAvg?fmtMoney(pred.expectedPayoutAvg):"N/A"}</div>
    <div class="muted" style="margin-top:6px">Stima statistica, non certezza. Migliora con più storico.</div>
  ` : `<div class="muted">${pred.reason}</div>`;

  // peers
  const peers = peerMachinesSameModel(m, 8);
  $("#mmPeers").innerHTML = peers.length ? peers.map(x=>{
    const p = x.pred;
    const eta = p.ok && p.etaHours!=null ? `${p.etaHours.toFixed(1)}h` : "N/A";
    const rem = p.ok ? fmtMoney(p.remainingIn) : "N/A";
    return `<div style="padding:8px 0;border-bottom:1px dashed rgba(255,255,255,.12)">
      <div><b>${x.snap.locale||"N/A"}</b> • CODEID ${x.snap.codeid}</div>
      <div class="muted">Rimanente: ${rem} • ETA: ${eta} • NoLink: ${x.snap.ggNoLink||0}gg</div>
    </div>`;
  }).join("") : `<div class="muted">Nessuna macchina uguale trovata (stesso modello) nello snapshot.</div>`;

  // fingerprint
  const prof = pred.prof;
  $("#mmAlgo").innerHTML = `
    <div><b>Soglia payout (stimata):</b> ${prof.payoutThreshold!=null?fmtMoney(prof.payoutThreshold):"N/A"}</div>
    <div><b>Ciclo stimato (IN tra payout):</b> ${prof.cycleIn!=null?fmtMoney(prof.cycleIn):"N/A"}</div>
    <div><b>Payout mediano:</b> ${prof.payoutMed!=null?fmtMoney(prof.payoutMed):"N/A"}</div>
    <div><b>Payout medio:</b> ${prof.payoutAvg!=null?fmtMoney(prof.payoutAvg):"N/A"}</div>
    <div><b>Volatilità (p90/med):</b> ${prof.volatility!=null?prof.volatility.toFixed(2):"N/A"}</div>
  `;

  modal.style.display = "block";
  $("#mmClose").onclick = closeMachineModal;
  modal.querySelector(".modal-backdrop").onclick = closeMachineModal;
}

export function closeMachineModal(){
  $("#machineModal").style.display = "none";
}
