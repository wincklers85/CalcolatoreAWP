import { fmtItDate, recencyStatus, cycleMetrics, activityScore, heatLabel } from "./engine.js";

let chart = null;

export function renderDashboard(S, session){
  const tbody = document.querySelector("#tblMachines tbody");
  const filter = document.getElementById("filterText").value.trim().toLowerCase();
  const sortBy = document.getElementById("sortBy").value;

  const items = [];
  for(const m of S.machinesById.values()){
    const hist = S.historyById.get(m.codeid) || [];
    const act = activityScore(hist);
    const heat = heatLabel(act.score);
    const rec = recencyStatus(m.lastRead);
    const cyc = cycleMetrics(m, S.cicloMap);

    const rowText = `${m.locale} ${m.comune} ${m.modelName} ${m.codeid} ${m.pda}`.toLowerCase();
    if(filter && !rowText.includes(filter)) continue;

    items.push({ m, hist, act, heat, rec, cyc });
  }

  // sort
  items.sort((a,b)=>{
    if(sortBy==="activityDesc") return b.act.score - a.act.score;
    if(sortBy==="phaseDesc")   return (b.cyc.phasePct||-1) - (a.cyc.phasePct||-1);
    if(sortBy==="locale")      return (a.m.locale||"").localeCompare(b.m.locale||"");
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

    const recBadge = badge(it.rec.key, it.rec.label);
    const heatBadge = badge(it.heat.key, `${it.act.score}%`);
    const phaseTxt = it.cyc.ok ? `${it.cyc.phasePct}%` : "—";

    tr.innerHTML = `
      <td>${recBadge}</td>
      <td>${esc(it.m.locale)}</td>
      <td>${esc(it.m.comune)}</td>
      <td>${esc(it.m.modelName)}</td>
      <td class="mono">${esc(it.m.codeid)}</td>
      <td class="mono">${esc(it.m.pda)}</td>
      <td>${esc(phaseTxt)}</td>
      <td>${heatBadge}</td>
    `;
    tbody.appendChild(tr);
  }

  // KPI
  document.getElementById("kpiMachines").textContent = String(S.machinesById.size);
  document.getElementById("kpiLocales").textContent = String(new Set([...S.machinesById.values()].map(x=>x.locale)).size);

  // match ciclo
  let match = 0;
  for(const m of S.machinesById.values()){
    if(S.cicloMap.has(String(m.modelCode||""))) match++;
  }
  document.getElementById("kpiCycleMatch").textContent = `${match}/${S.machinesById.size}`;

  // hint
  const onlyDashboard = session && session.level === "abbonato" && session.expired;
  document.getElementById("dataHint").textContent = onlyDashboard
    ? "Abbonamento scaduto: puoi vedere solo stato aggiornamento + profilo."
    : `File caricati: ${S.loadedFiles.length}`;
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
  document.getElementById("modalSubtitle").textContent = `CODEID ${m.codeid} • Ultima lettura: ${fmtItDate(m.lastRead)}`;

  // scheda tecnica + PDA
  const cyc = cycleMetrics(m, S.cicloMap);
  const act = activityScore(hist);
  const rec = recencyStatus(m.lastRead);

  document.getElementById("kvTech").innerHTML = kv([
    ["Locale", m.locale],
    ["Comune", `${m.comune || ""} (${m.provincia || ""})`],
    ["Indirizzo", m.indirizzo],
    ["Modello", m.modelName],
    ["Codice Modello", m.modelCode],
    ["PDA", m.pda],
    ["Stato", m.stato],
    ["Warning", m.warning || "—"],
    ["Ultimo collegamento", fmtItDate(m.lastLink)],
    ["Mancato collegamento (gg)", String(m.noLinkDays || 0)]
  ]);

  document.getElementById("kvAnalysis").innerHTML = kv([
    ["Aggiornamento", `${rec.label}`],
    ["Attività", `${act.score}% (conf. ${act.confidence}%)`],
    ["Nota", act.note],
    ["Ciclo", cyc.ok ? `${cyc.cicloEur}€ IN` : "—"],
    ["Fase ciclo", cyc.ok ? `${cyc.phasePct}%` : "—"],
    ["Residuo ciclo", cyc.ok ? `${cyc.leftEur}€` : "—"],
    ["Payout (dato modello)", cyc.payout ? `${cyc.payout}%` : "—"]
  ]);

  // grafico ΔOUT
  const labels = hist.slice(-20).map(p => {
    const d = new Date(p.ts);
    return `${String(d.getDate()).padStart(2,"0")}/${String(d.getMonth()+1).padStart(2,"0")} ${String(d.getHours()).padStart(2,"0")}:${String(d.getMinutes()).padStart(2,"0")}`;
  });
  const values = hist.slice(-20).map(p => Math.max(0, Number(p.dOut || 0)));

  const canvas = document.getElementById("chartOut");
  if(chart) { chart.destroy(); chart = null; }

  chart = new Chart(canvas, {
    type: "line",
    data: { labels, datasets: [{ label:"ΔOUT (€)", data: values, tension:0.25 }] },
    options: {
      responsive:true,
      plugins:{ legend:{ display:true } },
      scales:{ y:{ beginAtZero:true } }
    }
  });

  document.getElementById("chartHint").textContent = hist.length
    ? `Punti storico: ${hist.length} (mostrati ultimi ${Math.min(20,hist.length)})`
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

function esc(s){
  return String(s ?? "").replace(/[&<>"']/g, c=>({
    "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"
  }[c]));
}
