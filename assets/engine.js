// Colonne REALI del tuo sinottico
const COL = {
  CODEID: "CODEID",
  MODEL_CODE: "CODICE MODELLO",
  MODEL_NAME: "MODELLO",
  PDA: "MACADDRESS PDA",
  LOCALE: "DENOMIN. SEDE",
  COMUNE: "COMUNE",
  PROV: "PROVINCIA",
  INDIR: "INDIRIZZO",
  LAST_READ: "DATA ULTIMA LETTURA VAL.",
  LAST_LINK: "DATA ULTIMO COLLEGAMENTO",
  NO_LINK_DAYS: "GG MANCATO COLLEGAMENTO",
  IN_TOT: "CNTTOTIN",
  OUT_TOT: "CNTTOTOT",
  STATO: "DESCR. STATO",
  WARNING: "WARNING"
};

export function parseExcelDate(v){
  if(v == null) return null;

  // Excel serial number
  if(typeof v === "number" && Number.isFinite(v)){
    const d = XLSX.SSF.parse_date_code(v);
    if(!d) return null;
    return new Date(d.y, d.m-1, d.d, d.H||0, d.M||0, d.S||0);
  }

  if(typeof v === "string"){
    const s = v.trim();

    // GG/MM/AAAA hh:mm:ss
    let m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})(?:\s+(\d{2}):(\d{2})(?::(\d{2}))?)?$/);
    if(m){
      return new Date(+m[3], +m[2]-1, +m[1], +(m[4]||0), +(m[5]||0), +(m[6]||0));
    }

    // GG-MM-AAAA hh:mm
    m = s.match(/^(\d{2})-(\d{2})-(\d{4})(?:\s+(\d{2}):(\d{2}))?$/);
    if(m){
      return new Date(+m[3], +m[2]-1, +m[1], +(m[4]||0), +(m[5]||0), 0);
    }

    // ISO-ish
    const d = new Date(s);
    if(!Number.isNaN(d.getTime())) return d;
  }

  return null;
}

export function parseDateFromFilename(name){
  // Accetta anche varianti realmente presenti nello storico:
  // Sinottico-YYYY-MM-DD-hhmm.xlsx
  // Sinottico-YYYY-MM-DD-hh:mm.xlsx
  // SinotticoYYYY-MM-DD-hhmm.xlsx
  // trattini Unicode e giorno/mese a 1 cifra.
  let base = String(name||"").replace(/\.xlsx$/i,"").trim();
  base = base.replace(/[–—−]/g,"-").replace(/\s+/g,"");
  const m = base.match(/^Sinottico-?(\d{4})-(\d{1,2})-(\d{1,2})(?:-(\d{2})(?::?(\d{2}))?)?$/i);
  if(!m) return null;

  const y=+m[1], mo=+m[2], d=+m[3], hh=+(m[4]||0), mm=+(m[5]||0);
  if(mo<1||mo>12||d<1||d>31||hh>23||mm>59) return null;
  const dt = new Date(y,mo-1,d,hh,mm,0);
  if(dt.getFullYear()!==y || dt.getMonth()!==mo-1 || dt.getDate()!==d) return null;
  return dt;
}

export function fmtItDate(dt){
  if(!dt) return "—";
  const d = new Date(dt);
  const dd = String(d.getDate()).padStart(2,"0");
  const mm = String(d.getMonth()+1).padStart(2,"0");
  const yy = d.getFullYear();
  const hh = String(d.getHours()).padStart(2,"0");
  const mi = String(d.getMinutes()).padStart(2,"0");
  return `${dd}/${mm}/${yy} ${hh}:${mi}`;
}

export function recencyStatus(dt){
  if(!dt) return { key:"bad", label:"Vecchio" };
  const now = new Date();
  const d = new Date(dt);
  const sameDay = d.toDateString() === now.toDateString();
  if(!sameDay) return { key:"bad", label:"Non oggi" };
  const hours = (now.getTime() - d.getTime())/3600000;
  if(hours <= 3) return { key:"good", label:"≤3h" };
  return { key:"warn", label:"Oggi" };
}

export async function loadManifest(){
  const r = await fetch("Dati/manifest.json", { cache:"no-store" });
  if(!r.ok) throw new Error("Impossibile leggere manifest.json");
  const j = await r.json();
  if(!j || !Array.isArray(j.sinottici)) throw new Error("manifest.json: sinottici non valido");
  return j.sinottici;
}

export function pickLatestFromManifest(list){
  // sceglie il più recente in base a data nel filename
  let best = null;
  for(const f of list){
    const dt = parseDateFromFilename(f);
    if(!dt) continue;
    if(!best || dt > best.dt) best = { file:f, dt };
  }
  // se nessuno con data, fallback all’ultimo elemento
  if(!best && list.length) best = { file:list[list.length-1], dt: parseDateFromFilename(list[list.length-1]) };
  return best;
}

export async function loadCicloSlot(){
  const r = await fetch("Dati/cicloslot.json", { cache:"no-store" });
  if(!r.ok) throw new Error("Impossibile leggere cicloslot.json");
  const arr = await r.json();
  if(!Array.isArray(arr)) throw new Error("cicloslot.json non è un array");

  const map = new Map();
  for(const it of arr){
    if(!it || !it.codiceModello) continue;
    map.set(String(it.codiceModello), {
      codiceModello: String(it.codiceModello),
      nomeModello: it.nomeModello || "",
      ciclo: Number(it.ciclo) || null,     // euro IN
      payout: Number(it.payout) || null    // % (dato)
    });
  }
  return map;
}

export function parseSinotticoSheet(sheet){
  const rows = XLSX.utils.sheet_to_json(sheet, { defval:null });
  const out = [];

  for(const r of rows){
    const codeid = r[COL.CODEID];
    const inCents = Number(r[COL.IN_TOT]);
    const outCents = Number(r[COL.OUT_TOT]);
    if(!codeid || !Number.isFinite(inCents) || !Number.isFinite(outCents)) continue;

    const ts = parseExcelDate(r[COL.LAST_READ]) || null;

    out.push({
      codeid: String(codeid),
      modelCode: String(r[COL.MODEL_CODE] || ""),
      modelName: String(r[COL.MODEL_NAME] || ""),
      pda: String(r[COL.PDA] || ""),
      locale: String(r[COL.LOCALE] || ""),
      comune: String(r[COL.COMUNE] || ""),
      provincia: String(r[COL.PROV] || ""),
      indirizzo: String(r[COL.INDIR] || ""),
      stato: String(r[COL.STATO] || ""),
      warning: String(r[COL.WARNING] || ""),
      lastRead: ts,
      lastLink: parseExcelDate(r[COL.LAST_LINK]) || null,
      noLinkDays: Number(r[COL.NO_LINK_DAYS]) || 0,

      // contatori in EURO (centesimi rimossi)
      inTot: inCents / 100,
      outTot: outCents / 100
    });
  }

  return out;
}

export function createState(){
  return {
    machinesById: new Map(),
    historyById: new Map(),
    loadedFiles: [],
    loadErrors: [],
    cicloMap: new Map()
  };
}

export function mergeState(S, machines, fileDt, filename=""){
  const fileTs = fileDt ? new Date(fileDt).getTime() : null;

  for(const m of machines){
    if(!m.codeid) continue;

    // IMPORTANTE: il punto storico è il momento del SINOTTICO.
    // lastRead resta un attributo della macchina e non viene usato
    // per collassare sinottici diversi nello stesso timestamp.
    const snapshotTs = Number.isFinite(fileTs)
      ? fileTs
      : (m.lastRead ? new Date(m.lastRead).getTime() : null);
    if(!Number.isFinite(snapshotTs)) continue;

    const current = { ...m, snapshotTs, snapshotFile: filename || "" };
    const prev = S.machinesById.get(m.codeid);
    if(!prev || !Number.isFinite(prev.snapshotTs) || snapshotTs >= prev.snapshotTs){
      S.machinesById.set(m.codeid, current);
    }

    const arr = S.historyById.get(m.codeid) || [];
    const idx = arr.findIndex(p => p.ts === snapshotTs);
    const point = {
      ts: snapshotTs,
      file: filename || "",
      lastRead: m.lastRead ? new Date(m.lastRead).getTime() : null,
      inTot: Number(m.inTot),
      outTot: Number(m.outTot)
    };
    if(idx >= 0) arr[idx] = point;
    else arr.push(point);

    arr.sort((a,b)=>a.ts-b.ts);

    for(let i=0;i<arr.length;i++){
      const cur=arr[i];
      cur.dIn=null; cur.dOut=null; cur.hours=null; cur.counterReset=false;
      if(i===0) continue;
      const prevPoint=arr[i-1];
      const hours=(cur.ts-prevPoint.ts)/3600000;
      if(!Number.isFinite(hours)||hours<=0) continue;

      const dIn=cur.inTot-prevPoint.inTot;
      const dOut=cur.outTot-prevPoint.outTot;
      cur.hours=hours;

      // Se un contatore torna indietro trattiamo l'intervallo come reset/sostituzione,
      // non come incasso/pagamento negativo.
      if(dIn<0 || dOut<0){
        cur.counterReset=true;
        continue;
      }
      cur.dIn=dIn;
      cur.dOut=dOut;
    }

    S.historyById.set(m.codeid, arr);
  }
}

export function cycleMetrics(machine, cicloMap){
  const cfg = cicloMap.get(String(machine.modelCode||""));
  if(!cfg || !cfg.ciclo || !Number.isFinite(cfg.ciclo) || cfg.ciclo <= 0){
    return { ok:false, phasePct:null, leftEur:null, cicloEur:null, payout:null };
  }
  const ciclo = cfg.ciclo;
  const inTot = Number(machine.inTot);
  if(!Number.isFinite(inTot)) return { ok:false, phasePct:null, leftEur:null, cicloEur:ciclo, payout:cfg.payout };

  const mod = ((inTot % ciclo) + ciclo) % ciclo;
  const phasePct = (mod / ciclo) * 100;
  const leftEur = ciclo - mod;

  return {
    ok:true,
    cicloEur: ciclo,
    payout: cfg.payout ?? null,
    phasePct: Math.round(phasePct * 10) / 10,
    leftEur: Math.round(leftEur)
  };
}

export function activityScore(history){
  // Indice di UTILIZZO, basato sull'IN per ora. Non è una previsione di vincita.
  if(!history || history.length < 2) return { score:25, confidence:20, note:"Storico insufficiente" };

  const seg = history.slice(-8).filter(x =>
    Number.isFinite(x.dIn) && Number.isFinite(x.hours) && x.hours>0 && !x.counterReset
  );
  if(!seg.length) return { score:25, confidence:25, note:"Delta IN insufficienti" };

  const rates=seg.map(x=>x.dIn/x.hours).filter(Number.isFinite);
  const avg=rates.reduce((a,b)=>a+b,0)/Math.max(1,rates.length);
  const recent=rates.at(-1) ?? avg;

  // Scala volutamente morbida: circa 0 €/h -> 10, 10 €/h -> 40, 30 €/h -> 75.
  let score=Math.round(10 + 65*(1-Math.exp(-Math.max(0,recent)/22)));
  score=Math.max(0,Math.min(100,score));

  const mean=avg||0;
  const variance=rates.length>1
    ? rates.reduce((s,x)=>s+Math.pow(x-mean,2),0)/rates.length
    : 0;
  const cv=mean>0 ? Math.sqrt(variance)/mean : 1;
  let confidence=Math.round(35 + Math.min(35,rates.length*6) - Math.min(25,cv*18));
  confidence=Math.max(10,Math.min(95,confidence));

  return {
    score,
    confidence,
    note:"IN recente " + recent.toFixed(1) + " €/h · media " + avg.toFixed(1) + " €/h"
  };
}

export function payoutWindowMetrics(history, targetPayout=65){
  const empty={
    statusKey:"bad",statusLabel:"Dati insufficienti",lastOut:null,lastIn:null,lastHours:null,
    outRate:0,inRate:0,windowPayout:null,targetPayout:Number(targetPayout)||65,
    payoutGap:null,projectionOut24:null,trend:"—",segments:0
  };
  if(!history || history.length<2) return empty;

  const seg=history.slice(-10).filter(x =>
    Number.isFinite(x.dIn) && Number.isFinite(x.dOut) &&
    Number.isFinite(x.hours) && x.hours>0 && !x.counterReset
  );
  if(!seg.length) return empty;

  const last=seg.at(-1);
  const sumHours=seg.reduce((s,x)=>s+x.hours,0);
  const sumIn=seg.reduce((s,x)=>s+x.dIn,0);
  const sumOut=seg.reduce((s,x)=>s+x.dOut,0);
  const inRate=sumHours>0?sumIn/sumHours:0;
  const outRate=sumHours>0?sumOut/sumHours:0;
  const windowPayout=sumIn>0?(sumOut/sumIn)*100:null;
  const target=Number(targetPayout)||65;
  const payoutGap=windowPayout!=null?windowPayout-target:null;

  const lastOutRate=last.hours>0?last.dOut/last.hours:0;
  const prev=seg.slice(0,-1);
  const prevOutRate=prev.length
    ? prev.reduce((s,x)=>s+(x.dOut/x.hours),0)/prev.length
    : 0;

  let trend="Stabile";
  if(prev.length){
    if(lastOutRate>prevOutRate*1.35 && last.dOut>0) trend="OUT in aumento";
    else if(lastOutRate<prevOutRate*0.65) trend="OUT in calo";
  }

  // Stato OSSERVATO nell'ultimo intervallo. Non indica cosa accadrà alla prossima giocata.
  let statusKey="bad", statusLabel="Nessun OUT nell'ultimo intervallo";
  if(last.dOut>0){
    if(last.hours<=8){
      statusKey="good";
      statusLabel="OUT attivo nell'ultimo intervallo";
    }else if(last.hours<=36){
      statusKey="warn";
      statusLabel="OUT rilevato nell'ultimo intervallo";
    }else{
      statusKey="warn";
      statusLabel="OUT rilevato (campione distante)";
    }
  }

  return {
    statusKey,statusLabel,
    lastOut:last.dOut,lastIn:last.dIn,lastHours:last.hours,
    outRate,inRate,windowPayout,targetPayout:target,payoutGap,
    projectionOut24:outRate*24,trend,segments:seg.length
  };
}

export function heatLabel(score){
  if(score >= 70) return { key:"good", label:"Calda" };
  if(score >= 40) return { key:"warn", label:"Neutra" };
  return { key:"bad", label:"Fredda" };
}
