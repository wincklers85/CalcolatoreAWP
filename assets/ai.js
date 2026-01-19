import { activityScore, heatLabel, cycleMetrics, fmtItDate, recencyStatus } from "./engine.js";

export function createAssistant(){
  return {
    name: "Sibilla",
    reply: (text, S, selectedCodeId=null)=>{
      const t = String(text||"").trim().toLowerCase();
      if(!t) return msg("Scrivi una domanda sui dati caricati (es: anomalie / confronto modello / perché fredda?).");

      if(t.includes("anomal") || t.includes("warning") || t.includes("proble")){
        return anomalies(S);
      }

      if(t.includes("confront") || t.includes("stesso modello") || t.includes("coorte")){
        return compareModel(S, selectedCodeId);
      }

      if(t.includes("perché") || t.includes("perche") || t.includes("spiega") || t.includes("score")){
        return explainSelected(S, selectedCodeId);
      }

      if(t.includes("aggiorn") || t.includes("recente")){
        return freshness(S);
      }

      return msg("Posso aiutarti con: **anomalie**, **confronto modello**, **spiegazione score**, **aggiornamento dati**. Scrivi una di queste parole chiave.");
    }
  };
}

function explainSelected(S, codeid){
  if(!codeid) return msg("Apri una slot (clic in tabella) e poi chiedimi: “perché questa è calda/fredda?”.");

  const m = S.machinesById.get(codeid);
  const h = S.historyById.get(codeid) || [];
  if(!m) return msg("Slot non trovata.");

  const act = activityScore(h);
  const heat = heatLabel(act.score);
  const rec = recencyStatus(m.lastRead);
  const cyc = cycleMetrics(m, S.cicloMap);

  const lines = [];
  lines.push(`**${m.modelName}** @ ${m.locale}`);
  lines.push(`- Ultima lettura: **${fmtItDate(m.lastRead)}** (${rec.label})`);
  lines.push(`- Attività: **${act.score}%** (conf. ${act.confidence}%) → **${heat.label}**`);
  lines.push(`- Nota: ${act.note}`);
  if(cyc.ok){
    lines.push(`- Ciclo modello: ${cyc.cicloEur}€ IN • Fase: **${cyc.phasePct}%** • Residuo: ${cyc.leftEur}€`);
  }else{
    lines.push(`- Ciclo modello: non disponibile (manca match in cicloslot)`);
  }

  return msg(lines.join("\n"));
}

function compareModel(S, codeid){
  if(!codeid) return msg("Apri una slot e poi chiedimi “confronto modello” per compararla con le altre uguali.");

  const m = S.machinesById.get(codeid);
  if(!m) return msg("Slot non trovata.");

  const same = [...S.machinesById.values()].filter(x => String(x.modelCode||"") === String(m.modelCode||""));
  if(same.length <= 1) return msg("Non vedo altre macchine dello stesso codice modello nei sinottici caricati.");

  // ranking per attività
  const ranked = same.map(x=>{
    const h = S.historyById.get(x.codeid) || [];
    const act = activityScore(h);
    return { x, act };
  }).sort((a,b)=>b.act.score - a.act.score);

  const top = ranked.slice(0,5).map(r=>`- ${r.x.locale} • ${r.x.codeid} → ${r.act.score}%`).join("\n");
  return msg(`Confronto per codice modello **${m.modelCode}** (${same.length} macchine):\n${top}`);
}

function anomalies(S){
  const bad = [];
  for(const m of S.machinesById.values()){
    if(m.warning && m.warning !== "null" && m.warning !== "—" && m.warning.trim() !== ""){
      bad.push(`- ${m.locale} • ${m.codeid}: WARNING = ${m.warning}`);
    }
    if(Number(m.noLinkDays||0) >= 3){
      bad.push(`- ${m.locale} • ${m.codeid}: mancato collegamento ${m.noLinkDays} giorni`);
    }
  }
  if(!bad.length) return msg("Non vedo anomalie evidenti (warning / mancato collegamento) nei dati caricati.");
  return msg(`Anomalie trovate:\n${bad.slice(0,20).join("\n")}${bad.length>20 ? "\n…(altre omesse)" : ""}`);
}

function freshness(S){
  // riepilogo recency globale
  let good=0,warn=0,bad=0;
  for(const m of S.machinesById.values()){
    const r = recencyStatus(m.lastRead).key;
    if(r==="good") good++; else if(r==="warn") warn++; else bad++;
  }
  return msg(`Aggiornamento dati:\n- ≤3h: ${good}\n- Oggi: ${warn}\n- Non oggi: ${bad}`);
}

function msg(text){ return { text }; }
