import { fmtItDate, recencyStatus, payoutWindowMetrics, operationalForecast } from "./engine.js";

let chart = null;

export function renderDashboard(S, session){
  const tbody = document.querySelector("#tblMachines tbody");
  const filter = document.getElementById("filterText").value.trim().toLowerCase();
  const sortBy = document.getElementById("sortBy").value;
  const statusOut = document.getElementById("statusOut")?.value || "all";

  const items = [];
  let outActiveCount = 0;

  for(const m of S.machinesById.values()){
    const hist = S.historyById.get(m.codeid) || [];
    const forecast = operationalForecast(S,m);
    const cyc = forecast.cyc;
    const out = payoutWindowMetrics(hist, cyc.payout || 65);
    const rec = recencyStatus(m.lastRead);

    if(out.statusKey === "good" && Number(out.lastOut) > 0) outActiveCount++;

    const rowText = `${m.locale} ${m.comune} ${m.modelName} ${m.codeid} ${m.pda}`.toLowerCase();
    if(filter && !rowText.includes(filter)) continue;

    if(statusOut === "active" && !(out.statusKey === "good" && Number(out.lastOut) > 0)) continue;
    if(statusOut === "observed" && !(Number(out.lastOut) > 0)) continue;
    if(statusOut === "none" && !(out.lastOut === 0)) continue;

    items.push({ m, hist, forecast, cyc, out, rec });
  }

  items.sort((a,b)=>{
    if(sortBy==="phaseDesc") return (b.cyc.phasePct||-1) - (a.cyc.phasePct||-1);
    if(sortBy==="outRecent") return (b.out.lastOut||0) - (a.out.lastOut||0);
    if(sortBy==="windowPayout") return (b.out.windowPayout||-1) - (a.out.windowPayout||-1);
    if(sortBy==="etaAsc"){
      const av=Number.isFinite(a.forecast.etaHours)?a.forecast.etaHours:Number.POSITIVE_INFINITY;
      const bv=Number.isFinite(b.forecast.etaHours)?b.forecast.etaHours:Number.POSITIVE_INFINITY;
      return av-bv;
    }
    if(sortBy==="confidenceDesc") return b.forecast.confidence-a.forecast.confidence;
    if(sortBy==="locale") return (a.m.locale||"").localeCompare(b.m.locale||"");
    if(sortBy==="recency"){
      const rank = k => k==="good"?2:k==="warn"?1:0;
      return rank(b.rec.key) - rank(a.rec.key);
    }
    return 0;
  });

  tbody.innerHTML = "";
  for(const it of items){
    const tr = document.createElement("tr");
    tr.dataset.codeid = it.m.codeid;

    const outBadge = badge(it.out.statusKey, it.out.statusLabel);
    const phaseTxt = it.cyc.ok ? `${it.cyc.phasePct}%` : "—";
    const leftIn = it.cyc.ok ? fmtEuro(it.cyc.leftEur) : "—";
    const eta = formatEta(it.forecast.etaHours,it.forecast.etaDate);
    const projectedOut = it.forecast.projectedOutToCycleEnd!=null ? fmtEuro(it.forecast.projectedOutToCycleEnd) : "—";
    const payout = it.out.windowPayout!=null ? `${it.out.windowPayout.toFixed(1)}%` : "—";
    const conf = `${it.forecast.confidence}%`;

    tr.innerHTML = `
      <td>${outBadge}</td>
      <td>${esc(it.m.locale)}</td>
      <td>${esc(it.m.modelName)}</td>
      <td class="mono">${esc(it.m.codeid)}</td>
      <td>${esc(phaseTxt)}</td>
      <td><strong>${esc(leftIn)}</strong></td>
      <td>${esc(eta)}</td>
      <td>${esc(projectedOut)}</td>
      <td><strong>${esc(conf)}</strong></td>
      <td>${esc(payout)}</td>
    `;
    tbody.appendChild(tr);
  }

  document.getElementById("kpiMachines").textContent = String(S.machinesById.size);
  document.getElementById("kpiLocales").textContent = String(new Set([...S.machinesById.values()].map(x=>x.locale)).size);
  const kpiOut = document.getElementById("kpiOutActive");
  if(kpiOut) kpiOut.textContent = String(outActiveCount);

  let match = 0;
  for(const m of S.machinesById.values()){
    if(S.cicloMap.has(String(m.modelCode||""))) match++;
  }
  document.getElementById("kpiCycleMatch").textContent = `${match}/${S.machinesById.size}`;

  const onlyDashboard = session && session.level === "abbonato" && session.expired;
  document.getElementById("dataHint").textContent = onlyDashboard
    ? "Abbonamento scaduto: puoi vedere solo stato aggiornamento + profilo."
    : `Visualizzate ${items.length} macchine. I buchi nello storico vengono interpolati solo tra due letture reali coerenti. ETA e OUT stimato sono forecast operativi di flusso, non indicano l'esito di una giocata.`;
}

export function bindRowClicks(S, onOpen){
  const tbody = document.querySelector("#tblMachines tbody");
  tbody.onclick = (e)=>{
    const tr = e.target.closest("tr");
    if(!tr) return;
    const codeid = tr.dataset.codeid;
    if(!codeid) return;
    onOpen(codeid);
  };
}

export function openSlotModal(S, codeid){
  const m = S.machinesById.get(codeid);
  const hist = S.historyById.get(codeid) || [];
  if(!m) return;

  document.getElementById("modalTitle").textContent = `${m.modelName || "Slot"} • ${m.locale || ""}`;
  const snap = m.snapshotTs ? fmtItDate(new Date(m.snapshotTs)) : "—";
  document.getElementById("modalSubtitle").textContent =
    `CODEID ${m.codeid} • Sinottico: ${snap} • Ultima lettura macchina: ${fmtItDate(m.lastRead)}`;

  const forecast = operationalForecast(S,m);
  const cyc = forecast.cyc;
  const rec = recencyStatus(m.lastRead);
  const out = payoutWindowMetrics(hist, cyc.payout || 65);
  const profile = forecast.modelProfile;
  const currentBin = cyc.ok && profile.ok
    ? profile.bins[Math.min(profile.bins.length-1,Math.max(0,Math.floor((cyc.phasePct||0)/10)))]
    : null;

  document.getElementById("kvTech").innerHTML = kv([
    ["Locale", m.locale],
    ["Comune", `${m.comune || ""} (${m.provincia || ""})`],
    ["Indirizzo", m.indirizzo],
    ["Modello", m.modelName],
    ["Codice Modello", m.modelCode],
    ["PDA", m.pda],
    ["Stato", m.stato],
    ["Warning", m.warning || "—"],
    ["Sinottico più recente", snap],
    ["Ultima lettura valida", fmtItDate(m.lastRead)],
    ["Ultimo collegamento", fmtItDate(m.lastLink)],
    ["Mancato collegamento (gg)", String(m.noLinkDays || 0)]
  ]);

  document.getElementById("kvAnalysis").innerHTML = kv([
    ["Aggiornamento macchina", rec.label],
    ["Stato OUT osservato", out.statusLabel],
    ["Trend OUT", out.trend],
    ["ΔIN ultimo intervallo", out.lastIn!=null ? fmtEuro(out.lastIn) : "—"],
    ["ΔOUT ultimo intervallo", out.lastOut!=null ? fmtEuro(out.lastOut) : "—"],
    ["Velocità IN recente", forecast.inRate>0 ? `${fmtEuro(forecast.inRate)}/h` : "—"],
    ["Velocità OUT recente", forecast.outRate>0 ? `${fmtEuro(forecast.outRate)}/h` : "—"],
    ["Ciclo modello", cyc.ok ? `${fmtEuro(cyc.cicloEur)} IN` : "—"],
    ["Fase ciclo", cyc.ok ? `${cyc.phasePct}%` : "—"],
    ["IN residuo al fine ciclo", cyc.ok ? fmtEuro(cyc.leftEur) : "—"],
    ["ETA fine ciclo", formatEta(forecast.etaHours,forecast.etaDate)],
    ["OUT operativo stimato sul residuo", forecast.projectedOutToCycleEnd!=null ? fmtEuro(forecast.projectedOutToCycleEnd) : "—"],
    ["Payout finestra recente", out.windowPayout!=null ? `${out.windowPayout.toFixed(1)}%` : "—"],
    ["Target modello", `${forecast.targetPayoutPct}%`],
    ["Payout storico modello in questa fascia", currentBin?.payout!=null ? `${currentBin.payout.toFixed(1)}%` : "—"],
    ["Campioni modello", profile.ok ? `${profile.segments} intervalli / ${profile.machines} macchine` : "—"],
    ["Punti reali", String(forecast.rebuilt.actual)],
    ["Punti ricostruiti", String(forecast.rebuilt.estimated)],
    ["Passo storico tipico", forecast.rebuilt.medianHours!=null ? `${forecast.rebuilt.medianHours.toFixed(1)} h` : "—"],
    ["Affidabilità forecast", `${forecast.confidence}%`],
    ["Accuratezza backtest OUT", forecast.backtest.accuracy!=null ? `${forecast.backtest.accuracy}% su ${forecast.backtest.tests} test` : "Storico insufficiente"]
  ]);

  const tail=forecast.rebuilt.points.slice(-40);
  const labels = tail.map(p => {
    const d = new Date(p.ts);
    return `${String(d.getDate()).padStart(2,"0")}/${String(d.getMonth()+1).padStart(2,"0")} ${String(d.getHours()).padStart(2,"0")}:${String(d.getMinutes()).padStart(2,"0")}`;
  });
  const outValues = tail.map(p => Number.isFinite(p.dOut) ? p.dOut : null);
  const inValues = tail.map(p => Number.isFinite(p.dIn) ? p.dIn : null);

  const canvas = document.getElementById("chartOut");
  if(chart) { chart.destroy(); chart = null; }

  chart = new Chart(canvas, {
    type: "line",
    data: { labels, datasets: [
      {
        label:"ΔOUT (€)", data:outValues, tension:0.25,
        pointRadius: tail.map(p=>p.estimated?2:4),
        segment:{ borderDash:ctx => tail[ctx.p1DataIndex]?.estimated ? [5,4] : undefined }
      },
      {
        label:"ΔIN (€)", data:inValues, tension:0.25,
        pointRadius: tail.map(p=>p.estimated?2:4),
        segment:{ borderDash:ctx => tail[ctx.p1DataIndex]?.estimated ? [5,4] : undefined }
      }
    ]},
    options: {
      responsive:true,
      interaction:{mode:"index",intersect:false},
      plugins:{ legend:{ display:true } },
      scales:{ y:{ beginAtZero:true } }
    }
  });

  document.getElementById("chartHint").textContent = hist.length
    ? `Storico reale: ${forecast.rebuilt.actual} punti · ricostruiti: ${forecast.rebuilt.estimated}. I tratti stimati sono interpolazioni lineari tra letture reali; non vengono creati oltre reset contatori o buchi anomali. Il forecast serve per analisi di flusso e ciclo, non per prevedere l'esito della prossima giocata.`
    : "Nessuno storico disponibile.";

  showModal(true);
}

export function showModal(on){
  const mb = document.getElementById("modalBackdrop");
  const modal = document.getElementById("slotModal");
  if(on){
    mb.classList.add("show");
    modal.classList.add("show");
    modal.setAttribute("aria-hidden","false");
  }else{
    mb.classList.remove("show");
    modal.classList.remove("show");
    modal.setAttribute("aria-hidden","true");
  }
}

function badge(key, text){
  const cls = key==="good" ? "badge good" : key==="warn" ? "badge warn" : "badge bad";
  const dot = key==="good" ? "var(--good)" : key==="warn" ? "var(--warn)" : "var(--bad)";
  return `<span class="${cls}"><span class="bDot" style="background:${dot}"></span>${esc(text)}</span>`;
}

function kv(rows){
  return rows.map(([k,v])=>`
    <div class="k">${esc(k)}</div><div class="v">${esc(v ?? "—")}</div>
  `).join("");
}

function fmtEuro(v){
  const n=Number(v);
  if(!Number.isFinite(n)) return "—";
  return new Intl.NumberFormat("it-IT",{style:"currency",currency:"EUR",maximumFractionDigits:2}).format(n);
}

function formatEta(hours,date){
  if(!Number.isFinite(hours)||hours<0) return "—";
  let span;
  if(hours<24) span=`${hours.toFixed(1)} h`;
  else span=`${(hours/24).toFixed(1)} gg`;
  return date ? `${span} · ~${fmtItDate(date)}` : span;
}

function esc(s){
  return String(s ?? "").replace(/[&<>"']/g, c=>({
    "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"
  }[c]));
}
