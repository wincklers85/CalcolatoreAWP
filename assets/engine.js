// engine.js
// Regola CRITICA: i contatori sono in centesimi -> EURO = /100 (scarto ultimi 2 zeri)

export const PATH = {
  manifest: "./Dati/manifest.json",
  sinottico: (name) => `./Dati/${encodeURIComponent(String(name||"").replace(/\\/g,"/").replace(/^\.?\/*Dati\//i,""))}`,
  cicloslot: "./Dati/cicloslot.json"
};

export const S = {
  manifest: null,
  filesSorted: [],     // [{name, date}]
  latestFile: null,
  latestFileDate: null,
  machines: new Map(), // codeid -> snapshot
  history: new Map(),  // codeid -> points [{ts,dIn,dOut,pct,file}]
  models: new Map(),   // modelKey -> Set(codeid)
  modelStats: new Map(),
  cicloslot: null
};

// ---------- utils ----------
const pad2 = (n)=>String(n).padStart(2,"0");
export const euro = (centsOrEuroLike)=>{
  // se è numerico: assumiamo che arrivi in centesimi
  const x = Number(centsOrEuroLike);
  if(!Number.isFinite(x)) return null;
  return x / 100;
};
export const toNum = (v)=>{
  if(v===null||v===undefined) return null;
  if(typeof v==="number" && Number.isFinite(v)) return v;
  const s = String(v).trim().replace(",",".");
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
};
export const fmtMoney = (valEuro)=>{
  if(valEuro===null||valEuro===undefined||!Number.isFinite(valEuro)) return "N/A";
  return new Intl.NumberFormat("it-IT", { style:"currency", currency:"EUR", maximumFractionDigits:0 }).format(valEuro);
};
export const fmtDateEU = (d)=>{
  const dt = (d instanceof Date) ? d : new Date(d);
  if(!isFinite(dt)) return "N/A";
  return `${pad2(dt.getDate())}-${pad2(dt.getMonth()+1)}-${dt.getFullYear()} ${pad2(dt.getHours())}:${pad2(dt.getMinutes())}`;
};

export async function fetchJSON(url){
  const r = await fetch(url, { cache:"no-store" });
  if(!r.ok) throw new Error(`HTTP ${r.status} su ${url}`);
  return await r.json();
}
async function fetchArrayBuffer(url){
  const r = await fetch(url, { cache:"no-store" });
  if(!r.ok) throw new Error(`HTTP ${r.status} su ${url}`);
  return await r.arrayBuffer();
}

// ---------- filename date parsing ----------
export function parseDateFromFilename(name){
  const s = String(name||"");
  // Sinottico-YYYY-MM-DD.xlsx
  // Sinottico-YYYY-MM-DD-hhmm.xlsx
  const m = s.match(/Sinottico-(\d{4})-(\d{2})-(\d{2})(?:-(\d{4}))?\.xlsx$/i);
  if(!m) return null;
  const y = Number(m[1]), mo = Number(m[2]), d = Number(m[3]);
  let hh=0, mm=0;
  if(m[4]){
    hh = Number(m[4].slice(0,2));
    mm = Number(m[4].slice(2,4));
  }
  const dt = new Date(y, mo-1, d, hh, mm, 0, 0);
  return isFinite(dt) ? dt : null;
}

// ---------- manifest + latest banner ----------
export async function loadManifest(){
  const js = await fetchJSON(PATH.manifest);
  if(!js || !Array.isArray(js.sinottici)) throw new Error("manifest.json: manca sinottici[]");
  S.manifest = js;

  // ordino per data estratta dal nome file
  const items = js.sinottici.map(n=>{
    const dt = parseDateFromFilename(n);
    return { name:n, date: dt || new Date(0) };
  }).sort((a,b)=>a.date-b.date);

  S.filesSorted = items;
  const last = items[items.length-1] || null;
  S.latestFile = last?.name || null;
  S.latestFileDate = last?.date || null;

  return js;
}

export function bannerStatusForToday(){
  const last = S.latestFileDate;
  if(!last || !(last instanceof Date) || !isFinite(last)) return { ok:false, text:"Nessun sinottico valido nel manifest" };

  const now = new Date();
  const sameDay =
    last.getFullYear()===now.getFullYear() &&
    last.getMonth()===now.getMonth() &&
    last.getDate()===now.getDate();

  if(sameDay){
    return { ok:true, text:`Aggiornato oggi alle ${pad2(last.getHours())}:${pad2(last.getMinutes())}` };
  }
  return { ok:false, text:`Non aggiornato (ultimo: ${fmtDateEU(last)})` };
}

// ---------- robust date parsing from sheet ----------
function parseDateCell(v){
  // support:
  // 1) Date object
  if(v instanceof Date && isFinite(v)) return v;

  // 2) Excel serial date
  if(typeof v === "number" && Number.isFinite(v)){
    // XLSX.SSF.parse_date_code expects serial days; for timestamps often days+fraction
    const o = XLSX.SSF.parse_date_code(v);
    if(o){
      return new Date(o.y, o.m-1, o.d, o.H||0, o.M||0, o.S||0);
    }
  }

  // 3) string "GG-MM-AAAA hh:mm" or "GG/MM/AAAA hh:mm"
  const s = String(v||"").trim();
  let m = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})(?:\s+(\d{1,2}):(\d{2}))?$/);
  if(m){
    const dd=Number(m[1]), mo=Number(m[2]), yy=Number(m[3]);
    const hh= m[4]?Number(m[4]):0;
    const mm= m[5]?Number(m[5]):0;
    const dt = new Date(yy, mo-1, dd, hh, mm, 0, 0);
    return isFinite(dt)?dt:null;
  }
  // 4) ISO fallback
  const dt = new Date(s);
  return isFinite(dt) ? dt : null;
}

// ---------- normalize headers ----------
const ALIASES = {
  codeid: ["CODEID","CODICEID","CODICE ID","ID","ID MACCHINA","IDMACCHINA"],
  pda: ["PDA","CODICE PDA","PDA CODE"],
  model: ["MODELLO","MODEL","MODEL CODE","CODICE MODELLO","TIPO","GIOCO","GAME"],
  modelName: ["NOME MODELLO","DESCRIZIONE","DESCRIZIONE MODELLO","DENOMINAZIONE"],
  locale: ["LOCALE","ESERCENTE","RAGIONE SOCIALE","NOME LOCALE"],
  comune: ["COMUNE","CITTA","CITTÀ"],
  provincia: ["PROVINCIA","PR"],
  indirizzo: ["INDIRIZZO","VIA"],
  em: ["E/M","EM","STATO","E M"],
  ggNoLink: ["GG MANCATO COLLEGAMENTO","GG NO LINK","GGMANCATOCOLLEGAMENTO","NO LINK"],
  cntIn: ["CNTTOTIN","CNT TOT IN","TOT IN","CONTATORE IN","IN"],
  cntOut: ["CNTTOTOT","CNTTOTOUT","CNT TOT OUT","TOT OUT","CONTATORE OUT","OUT"],
  pctOut: ["% OUT","PCT OUT","PERC OUT","PAYOUT","%OUT","PERCENTUALE OUT"],
  ts: ["DATA","DATA ORA","DATA/ORA","DATA ORA LETTURA","TIMESTAMP","DATALETTURA"]
};

function normalizeKey(k){
  return String(k||"").trim().toUpperCase().replace(/\s+/g," ");
}
function pickField(row, wanted){
  for(const name of wanted){
    const nk = normalizeKey(name);
    for(const rk of Object.keys(row)){
      if(normalizeKey(rk)===nk) return row[rk];
    }
  }
  return undefined;
}

// ---------- read sinottico file into normalized records ----------
async function readSinotticoXLSX(fileName){
  const ab = await fetchArrayBuffer(PATH.sinottico(fileName));
  const wb = XLSX.read(ab, { type:"array", cellDates:true });
  const sheetName = wb.SheetNames[0];
  const ws = wb.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json(ws, { defval:"" });

  const recs = [];
  for(const r of rows){
    const codeid = String(pickField(r, ALIASES.codeid) ?? "").trim();
    if(!codeid) continue;

    const tsRaw = pickField(r, ALIASES.ts);
    const ts = parseDateCell(tsRaw) || parseDateFromFilename(fileName) || null;

    const cntInRaw  = pickField(r, ALIASES.cntIn);
    const cntOutRaw = pickField(r, ALIASES.cntOut);

    const cntInCents  = toNum(cntInRaw);
    const cntOutCents = toNum(cntOutRaw);

    const rec = {
      file: fileName,
      ts,
      codeid,
      pda: String(pickField(r, ALIASES.pda) ?? "").trim() || null,
      modelCode: String(pickField(r, ALIASES.model) ?? "").trim() || null,
      modelName: String(pickField(r, ALIASES.modelName) ?? "").trim() || null,
      locale: String(pickField(r, ALIASES.locale) ?? "").trim() || null,
      comune: String(pickField(r, ALIASES.comune) ?? "").trim() || null,
      provincia: String(pickField(r, ALIASES.provincia) ?? "").trim() || null,
      indirizzo: String(pickField(r, ALIASES.indirizzo) ?? "").trim() || null,
      em: String(pickField(r, ALIASES.em) ?? "").trim() || null,
      ggNoLink: toNum(pickField(r, ALIASES.ggNoLink)) ?? 0,
      // contatori IN/OUT: CENTESIMI -> li salviamo in centesimi e convertiamo quando servono
      cntInCents: Number.isFinite(cntInCents) ? cntInCents : null,
      cntOutCents: Number.isFinite(cntOutCents) ? cntOutCents : null,
      pctOut: toNum(pickField(r, ALIASES.pctOut))
    };

    recs.push(rec);
  }
  return recs;
}

// ---------- RAM reset ----------
export function resetAll(){
  S.machines.clear();
  S.history.clear();
  S.models.clear();
  S.modelStats.clear();
}

// ---------- incremental analyze one file ----------
export async function analyzeOneFile(fileName){
  const recs = await readSinotticoXLSX(fileName);

  // group per codeid -> snapshot per file
  for(const rec of recs){
    const prevSnap = S.machines.get(rec.codeid) || null;

    // update models map
    const modelKey = getModelKey(rec);
    if(!S.models.has(modelKey)) S.models.set(modelKey, new Set());
    S.models.get(modelKey).add(rec.codeid);

    // update snapshot (keep latest ts)
    const newSnap = {
      codeid: rec.codeid,
      pda: rec.pda,
      modelCode: rec.modelCode,
      modelName: rec.modelName,
      locale: rec.locale,
      comune: rec.comune,
      provincia: rec.provincia,
      indirizzo: rec.indirizzo,
      em: rec.em,
      ggNoLink: rec.ggNoLink,
      pctOut: rec.pctOut,
      ts: rec.ts,
      file: rec.file,
      cntInCents: rec.cntInCents,
      cntOutCents: rec.cntOutCents
    };

    // history point requires delta vs previous known point
    const hist = S.history.get(rec.codeid) || [];
    const lastPoint = hist.length ? hist[hist.length-1] : null;

    // find last known counters (from lastPoint snapshot, stored)
    const lastInC = lastPoint?.cntInCents ?? prevSnap?.cntInCents ?? null;
    const lastOutC= lastPoint?.cntOutCents ?? prevSnap?.cntOutCents ?? null;

    const curInC = rec.cntInCents;
    const curOutC= rec.cntOutCents;

    // delta in EURO (cent -> euro)
    let dIn = null, dOut = null;
    if(Number.isFinite(curInC) && Number.isFinite(lastInC))  dIn  = euro(curInC - lastInC);
    if(Number.isFinite(curOutC)&& Number.isFinite(lastOutC)) dOut = euro(curOutC - lastOutC);

    // Accept only if timestamp valid and deltas non-negative (avoid wrap weirdness)
    if(rec.ts && dIn !== null && dOut !== null){
      if(dIn >= 0 && dOut >= 0){
        hist.push({
          ts: rec.ts.getTime(),
          dIn,
          dOut,
          pct: (typeof rec.pctOut==="number") ? rec.pctOut : null,
          file: rec.file,
          cntInCents: curInC,
          cntOutCents: curOutC
        });
        S.history.set(rec.codeid, hist);
      }
    }

    // keep latest snapshot by ts
    const prevTs = prevSnap?.ts ? prevSnap.ts.getTime() : -1;
    const curTs = rec.ts ? rec.ts.getTime() : -1;
    if(curTs >= prevTs) S.machines.set(rec.codeid, newSnap);
  }
}

// ---------- finalize: sort history + compute model stats ----------
export function finalize(){
  for(const [codeid, hist] of S.history.entries()){
    hist.sort((a,b)=>a.ts-b.ts);
  }

  // compute model stats (fingerprint)
  S.modelStats.clear();
  for(const [modelKey] of S.models.entries()){
    S.modelStats.set(modelKey, modelProfile(modelKey));
  }
}

// ---------- model helpers + prediction ----------
export function getModelKey(m){
  return String(m.modelCode || m.modelName || "UNKNOWN").trim() || "UNKNOWN";
}

function payoutThresholdForSeries(deltasOut){
  // soglia in EURO: max(20€, percentile 85%)
  const arr = deltasOut.filter(x=>Number.isFinite(x) && x>0).sort((a,b)=>a-b);
  if(arr.length<6) return 20;
  const p = arr[Math.floor(arr.length*0.85)];
  return Math.max(20, p);
}

function median(arr){
  const a = arr.filter(x=>Number.isFinite(x)&&x>0).sort((x,y)=>x-y);
  if(!a.length) return null;
  const mid = Math.floor(a.length/2);
  return a.length%2 ? a[mid] : (a[mid-1]+a[mid])/2;
}
function avg(arr){
  const a = arr.filter(x=>Number.isFinite(x)&&x>0);
  if(!a.length) return null;
  return a.reduce((s,x)=>s+x,0)/a.length;
}
function p90(arr){
  const a = arr.filter(x=>Number.isFinite(x)&&x>0).sort((x,y)=>x-y);
  if(!a.length) return null;
  return a[Math.floor(a.length*0.90)];
}

export function modelProfile(modelKey){
  const points = [];
  for(const snap of S.machines.values()){
    if(getModelKey(snap)!==modelKey) continue;
    const h = S.history.get(snap.codeid) || [];
    for(const p of h) points.push(p);
  }
  const dOuts = points.map(p=>p.dOut||0);
  const thr = payoutThresholdForSeries(dOuts);

  // gaps in IN between payout events
  const sorted = points.slice().sort((a,b)=>a.ts-b.ts);
  let inSince = 0;
  const gaps = [];
  const payouts = [];
  for(const p of sorted){
    inSince += (p.dIn||0);
    if((p.dOut||0) >= thr){
      gaps.push(inSince);
      payouts.push(p.dOut||0);
      inSince = 0;
    }
  }

  const cycleIn = median(gaps);
  const payoutAvg = avg(payouts);
  const payoutMed = median(payouts);
  const vol = (payoutMed && p90(payouts)) ? (p90(payouts)/payoutMed) : null;

  return {
    modelKey,
    payoutThreshold: thr,
    cycleIn,
    payoutAvg,
    payoutMed,
    volatility: vol,
    samplePoints: points.length,
    samplePayouts: payouts.length
  };
}

export function estimatePlayRateEuroPerHour(codeid){
  const h = (S.history.get(codeid)||[]).slice().sort((a,b)=>a.ts-b.ts);
  if(h.length<3) return null;
  const last = h.slice(-12);
  let sumIn=0, sumH=0;
  for(let i=1;i<last.length;i++){
    const dt = (last[i].ts - last[i-1].ts)/3600000;
    if(dt<=0 || dt>48) continue;
    const din = last[i].dIn || 0;
    if(din<=0) continue;
    sumIn += din;
    sumH += dt;
  }
  if(sumH<=0) return null;
  return sumIn/sumH;
}

export function machinePrediction(snap){
  const modelKey = getModelKey(snap);
  const prof = S.modelStats.get(modelKey) || modelProfile(modelKey);

  const h = (S.history.get(snap.codeid)||[]).slice().sort((a,b)=>a.ts-b.ts);
  if(!h.length || !prof.cycleIn){
    return { ok:false, reason:"Storico insufficiente per stimare ciclo/predizione.", prof, modelKey };
  }

  const thr = prof.payoutThreshold ?? 20;
  let progressIn = 0;
  for(let i=h.length-1;i>=0;i--){
    progressIn += (h[i].dIn||0);
    if((h[i].dOut||0) >= thr) break;
  }

  const remainingIn = Math.max(0, prof.cycleIn - progressIn);
  const rate = estimatePlayRateEuroPerHour(snap.codeid);
  const etaHours = (rate && rate>0) ? (remainingIn / rate) : null;

  return {
    ok:true,
    modelKey,
    prof,
    progressIn,
    remainingIn,
    rateEuroPerHour: rate,
    etaHours,
    expectedPayoutMed: prof.payoutMed,
    expectedPayoutAvg: prof.payoutAvg
  };
}

export function peerMachinesSameModel(snap, limit=8){
  const key = getModelKey(snap);
  const peers = [];
  for(const other of S.machines.values()){
    if(other.codeid===snap.codeid) continue;
    if(getModelKey(other)!==key) continue;
    const pred = machinePrediction(other);
    peers.push({ snap: other, pred });
  }
  peers.sort((a,b)=>{
    const ra = a.pred.ok ? a.pred.remainingIn : 1e9;
    const rb = b.pred.ok ? b.pred.remainingIn : 1e9;
    return ra-rb;
  });
  return peers.slice(0,limit);
}
