import { fmtItDate, recencyStatus, cycleMetrics, activityScore, heatLabel, payoutWindowMetrics } from "./engine.js";

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
    const act = activityScore(hist);
    const heat = heatLabel(act.score);
    const rec = recencyStatus(m.lastRead);
    const cyc = cycleMetrics(m, S.cicloMap);
    const out = payoutWindowMetrics(hist, cyc.payout || 65);
    const payoutTarget = Number(cyc.payout || 65);
    const theoreticalOut = cyc.ok ? cyc.cicloEur * (payoutTarget/100) : null;

    if(out.statusKey === "good" && Number(out.lastOut) > 0) outActiveCount++;

    const rowText = `${m.locale} ${m.comune} ${m.modelName} ${m.codeid} ${m.pda}`.toLowerCase();
    if(filter && !rowText.includes(filter)) continue;

    if(statusOut === "active" && !(out.statusKey === "good" && Number(out.lastOut) > 0)) continue;
    if(statusOut === "observed" && !(Number(out.lastOut) > 0)) continue;
    if(statusOut === "none" && !(out.lastOut === 0)) continue;

    items.push({ m, hist, act, heat, rec, cyc, out, theoreticalOut });
  }

  items.sort((a,b)=>{
    if(sortBy==="activityDesc") return b.act.score - a.act.score;
    if(sortBy==="phaseDesc") return (b.cyc.phasePct||-1) - (a.cyc.phasePct||-1);
    if(sortBy==="outRecent") return (b.out.lastOut||0) - (a.out.lastOut||0);
    if(sortBy==="windowPayout") return (b.out.windowPayout||-1) - (a.out.windowPayout||-1);
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
    const theoreticalOut = it.theoreticalOut!=null ? fmtEuro(it.theoreticalOut) : "—";
    const lastOut = it.out.lastOut!=null ? fmtEuro(it.out.lastOut) : "—";
    const payout = it.out.windowPayout!=null ? `${it.out.windowPayout.toFixed(1)}%` : "—";

    tr.innerHTML = `
      <td>${outBadge}</td>
      <td>${esc(it.m.locale)}</td>
      <td>${esc(it.m.modelName)}</td>
      <td class="mono">${esc(it.m.codeid)}</td>
      <td>${esc(phaseTxt)}</td>
      <td><strong>${esc(leftIn)}</strong></td>
      <td>${esc(theoreticalOut)}</td>
      <td><strong>${esc(lastOut)}</strong></td>
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
    : `Visualizzate ${items.length} macchine. “OUT attivo” significa che il contatore OUT è aumentato nell’ultimo intervallo osservato. “OUT teorico ciclo” = payout configurato × valore del ciclo; non è una previsione della prossima giocata.`;
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

  const cyc = cycleMetrics(m, S.cicloMap);
  const act = activityScore(hist);
  const rec = recencyStatus(m.lastRead);
  const out = payoutWindowMetrics(hist, cyc.payout || 65);

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
    ["Utilizzo", `${act.score}% (conf. ${act.confidence}%)`],
    ["Nota utilizzo", act.note],
    ["Stato OUT osservato", out.statusLabel],
    ["Trend OUT", out.trend],
    ["Ultimo intervallo", out.lastHours!=null ? `${out.lastHours.toFixed(1)} h` : "—"],
    ["ΔIN ultimo intervallo", out.lastIn!=null ? fmtEuro(out.lastIn) : "—"],
    ["ΔOUT ultimo intervallo", out.lastOut!=null ? fmtEuro(out.lastOut) : "—"],
    ["Velocità OUT finestra", `${fmtEuro(out.outRate)}/h`],
    ["Proiezione tecnica OUT 24h", out.projectionOut24!=null ? fmtEuro(out.projectionOut24) : "—"],
    ["Payout finestra recente", out.windowPayout!=null ? `${out.windowPayout.toFixed(1)}%` : "—"],
    ["Target modello", `${out.targetPayout}%`],
    ["Scarto payout finestra", out.payoutGap!=null ? signedPct(out.payoutGap) : "—"],
    ["Ciclo", cyc.ok ? `${cyc.cicloEur}€ IN` : "—"],
    ["Fase ciclo", cyc.ok ? `${cyc.phasePct}%` : "—"],
    ["Residuo ciclo", cyc.ok ? fmtEuro(cyc.leftEur) : "—"]
  ]);

  const tail=hist.slice(-30);
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
      { label:"ΔOUT (€)", data:outValues, tension:0.25 },
      { label:"ΔIN (€)", data:inValues, tension:0.25 }
    ]},
    options: {
      responsive:true,
      plugins:{ legend:{ display:true } },
      scales:{ y:{ beginAtZero:true } }
    }
  });

  document.getElementById("chartHint").textContent = hist.length
    ? `Punti storico: ${hist.length} (mostrati ultimi ${Math.min(30,hist.length)}). La proiezione 24h è una semplice estrapolazione del ritmo storico, non indica l'esito della prossima giocata.`
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

function signedPct(v){
  const n=Number(v);
  if(!Number.isFinite(n)) return "—";
  return `${n>0?"+":""}${n.toFixed(1)}%`;
}

function esc(s){
  return String(s ?? "").replace(/[&<>"']/g, c=>({
    "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"
  }[c]));
}
