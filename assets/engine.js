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
  // Sinottico-YYYY-MM-DD-hhmm.xlsx
  // Sinottico-YYYY-MM-DD-hh:mm.xlsx
  // Sinottico-YYYY-MM-DD.xlsx
  const base = String(name||"").replace(/\.xlsx$/i,"");
  const m = base.match(/Sinottico-(\d{4})-(\d{1,2})-(\d{1,2})(?:-(\d{2})(?::?(\d{2}))?)?/i);
  if(!m) return null;
  const y = +m[1], mo = +m[2], d = +m[3];
  const hh = +(m[4]||0), mm = +(m[5]||0);
  return new Date(y, mo-1, d, hh, mm, 0);
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
    cicloMap: new Map()
  };
}

export function mergeState(S, machines, fileDt){
  for(const m of machines){
    if(!m.codeid) continue;

    // timestamp: preferisci lastRead, altrimenti data dal filename
    const ts = m.lastRead || fileDt || null;
    const tsn = ts ? new Date(ts).getTime() : null;

    // snapshot più recente
    const prev = S.machinesById.get(m.codeid);
    const prevT = prev?.lastRead ? new Date(prev.lastRead).getTime() : null;

    if(!prev || (tsn && (!prevT || tsn > prevT))){
      S.machinesById.set(m.codeid, { ...m, lastRead: ts });
    }

    // storico
    const arr = S.historyById.get(m.codeid) || [];
    if(tsn && !arr.some(p => p.ts === tsn)){
      arr.push({ ts: tsn, inTot: m.inTot, outTot: m.outTot });
      arr.sort((a,b)=>a.ts-b.ts);
      for(let i=1;i<arr.length;i++){
        arr[i].dIn  = arr[i].inTot  - arr[i-1].inTot;
        arr[i].dOut = arr[i].outTot - arr[i-1].outTot;
      }
      S.historyById.set(m.codeid, arr);
    }
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
  // indice attività 0..100 basato sugli ultimi delta OUT (robusto, non “magico”)
  if(!history || history.length < 3) return { score: 30, confidence: 30, note:"Storico scarso" };

  const tail = history.slice(-6);
  const deltas = tail.map(x => Number(x.dOut || 0)).filter(x => Number.isFinite(x) && x >= 0);

  if(deltas.length < 3) return { score: 35, confidence: 35, note:"Delta insufficienti" };

  const avg = deltas.reduce((s,x)=>s+x,0) / deltas.length;
  const max = Math.max(...deltas);
  const volatility = max ? (max - avg) / max : 0;

  // scala: 0..100
  // più OUT recente = più “attiva”
  let score = 40 + (avg * 2.2);
  score = Math.max(0, Math.min(100, Math.round(score)));

  // confidenza: più punti + meno volatilità
  let conf = 40 + deltas.length*6 - volatility*30;
  conf = Math.max(10, Math.min(100, Math.round(conf)));

  return { score, confidence: conf, note: `avgΔOUT=${avg.toFixed(0)}€` };
}

export function heatLabel(score){
  if(score >= 70) return { key:"good", label:"Calda" };
  if(score >= 40) return { key:"warn", label:"Neutra" };
  return { key:"bad", label:"Fredda" };
}
