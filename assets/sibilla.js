import { S, fmtMoney, fmtDateEU, machinePrediction, getModelKey } from "./engine.js";

function norm(s){ return String(s||"").trim().toLowerCase(); }

function topLikely(limit=10){
  const arr = [];
  for(const m of S.machines.values()){
    const pred = machinePrediction(m);
    if(!pred.ok) continue;
    // score: remainingIn basso + noLink basso + attiva
    const stale = (m.ggNoLink||0);
    const active = String(m.em||"").toUpperCase().includes("E");
    let score = 0;
    score += Math.max(0, 400 - pred.remainingIn);     // 0..400
    score += active ? 80 : -40;
    score += Math.max(-120, 40 - stale*6);
    arr.push({m, pred, score});
  }
  arr.sort((a,b)=>b.score-a.score);
  return arr.slice(0,limit);
}

function find(q){
  const s = norm(q);
  const out = [];
  for(const m of S.machines.values()){
    const hay = [
      m.locale,m.comune,m.provincia,m.indirizzo,
      m.modelName,m.modelCode,m.codeid,m.pda
    ].join(" ").toLowerCase();
    if(hay.includes(s)) out.push(m);
  }
  return out.slice(0,30);
}

export function sibillaReply(text){
  const q = norm(text);

  if(!q) return "Scrivi qualcosa 🙂";
  if(q==="aiuto" || q==="help"){
    return `Comandi:
- top pagamenti
- cerca <testo>
- dettagli <CODEID>
- modello <codice> (fingerprint)
- stato`;
  }

  if(q.includes("stato")){
    let pts=0; for(const h of S.history.values()) pts += h.length;
    return `Stato:
- macchine: ${S.machines.size}
- modelli: ${S.models.size}
- punti storico: ${pts}
- ultimo sinottico: ${S.latestFile || "N/A"}`;
  }

  if(q.includes("top") && q.includes("pag")){
    const top = topLikely(10);
    if(!top.length) return "Non ho abbastanza storico. Premi “Analizza tutti i sinottici”.";
    return `Top 10 (stima):
${top.map((x,i)=>`${i+1}) ${x.m.locale||"N/A"} | ${getModelKey(x.m)} | CODEID ${x.m.codeid} | rimanente ${fmtMoney(x.pred.remainingIn)} | ETA ${x.pred.etaHours!=null?x.pred.etaHours.toFixed(1)+"h":"N/A"}`).join("\n")}`;
  }

  if(q.startsWith("cerca ")){
    const term = text.slice(6);
    const f = find(term);
    if(!f.length) return `Nessun risultato per: "${term}"`;
    return `Trovate ${f.length} (prime 10):
${f.slice(0,10).map(m=>`- ${m.locale||"N/A"} | ${getModelKey(m)} | CODEID ${m.codeid}`).join("\n")}`;
  }

  if(q.startsWith("dettagli ")){
    const codeid = text.slice(9).trim();
    const m = S.machines.get(codeid);
    if(!m) return `CODEID non trovato: ${codeid}`;
    const pred = machinePrediction(m);
    return `Scheda rapida:
Locale: ${m.locale||"N/A"} (${m.comune||"—"})
Modello: ${getModelKey(m)}
Ultima lettura: ${m.ts?fmtDateEU(m.ts):"N/A"}
NoLink: ${m.ggNoLink||0} gg
Predizione: ${pred.ok ? `rimanente ${fmtMoney(pred.remainingIn)} • ETA ${pred.etaHours!=null?pred.etaHours.toFixed(1)+"h":"N/A"} • payout med ${pred.expectedPayoutMed?fmtMoney(pred.expectedPayoutMed):"N/A"}` : pred.reason}`;
  }

  if(q.startsWith("modello ")){
    const mk = text.slice(7).trim();
    const st = S.modelStats.get(mk);
    if(!st) return `Modello non trovato: ${mk}`;
    return `Fingerprint ${mk}:
- ciclo IN stimato: ${st.cycleIn!=null?fmtMoney(st.cycleIn):"N/A"}
- payout mediano: ${st.payoutMed!=null?fmtMoney(st.payoutMed):"N/A"}
- payout medio: ${st.payoutAvg!=null?fmtMoney(st.payoutAvg):"N/A"}
- volatilità: ${st.volatility!=null?st.volatility.toFixed(2):"N/A"}
- campioni payout: ${st.samplePayouts}`;
  }

  // fallback: ricerca
  const f = find(text);
  if(f.length){
    return `Ho interpretato come ricerca. Prime 5:
${f.slice(0,5).map(m=>`- ${m.locale||"N/A"} | ${getModelKey(m)} | CODEID ${m.codeid}`).join("\n")}
Scrivi: "dettagli <CODEID>"`;
  }

  return `Non ho capito. Scrivi "aiuto" per i comandi.`;
}
