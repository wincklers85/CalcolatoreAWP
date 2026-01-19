export const PATH = {
  users: "./Dati/users.json",
  manifest: "./Dati/manifest.json",
  cicloslot: "./Dati/cicloslot.json",
  sinottico: (name) => `./Dati/${encodeURIComponent(name)}`
};

export const S = {
  users: [],
  manifest: null,
  ciclos: [],
  session: null, // {user, level, expires, expired:boolean}
  machines: new Map(),
  history: new Map(),
  locals: new Map(),
  pdas: new Map(),
  provinces: new Map(),
  comunes: new Map(),
  models: new Map(),
  modelStats: new Map(),
  cacheKey: "awp_session_v2"
};

export const $ = (q)=>document.querySelector(q);
export const $$ = (q)=>Array.from(document.querySelectorAll(q));

export function safeStr(v){ return (v===null||v===undefined) ? "" : String(v).trim(); }

export function normalizeUser(u){ return safeStr(u).toLowerCase(); }
export function normalizePin(p){
  const s = safeStr(p);
  if(/^\d+$/.test(s)) return String(parseInt(s,10));
  return s;
}

export function escapeHtml(s){
  return String(s||"").replace(/[&<>"']/g, m=>({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;" }[m]));
}

/* ========= DATE PARSER (fix 2026) =========
   Accetta:
   - Date object
   - Excel serial (numero)
   - "GG-MM-AAAA HH:MM" / "GG/MM/AAAA HH:MM" (+ opz. :SS)
   - "AAAA-MM-GG HH:MM"
   - "GG-MM-AAAA" ecc.
*/
export function parseAnyDateTime(val){
  if(val === null || val === undefined || val === "") return null;

  // Already Date
  if(val instanceof Date && isFinite(val)) return val;

  // Excel serial number
  if(typeof val === "number" && isFinite(val)){
    // Excel epoch 1899-12-30
    const ms = Math.round((val - 25569) * 86400 * 1000);
    const d = new Date(ms);
    return isFinite(d) ? d : null;
  }

  const str = String(val).trim();
  if(!str) return null;

  // Try native parse (ISO)
  const d1 = new Date(str);
  if(isFinite(d1)) return d1;

  // dd-mm-yyyy [hh:mm[:ss]] OR dd/mm/yyyy
  let m = str.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/);
  if(m){
    const dd = parseInt(m[1],10);
    const mm = parseInt(m[2],10)-1;
    let yy = parseInt(m[3],10);
    if(yy < 100) yy = 2000 + yy;
    const hh = parseInt(m[4]||"0",10);
    const mi = parseInt(m[5]||"0",10);
    const ss = parseInt(m[6]||"0",10);
    const d = new Date(yy,mm,dd,hh,mi,ss);
    return isFinite(d) ? d : null;
  }

  // yyyy-mm-dd [hh:mm[:ss]]
  m = str.match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/);
  if(m){
    const yy = parseInt(m[1],10);
    const mm = parseInt(m[2],10)-1;
    const dd = parseInt(m[3],10);
    const hh = parseInt(m[4]||"0",10);
    const mi = parseInt(m[5]||"0",10);
    const ss = parseInt(m[6]||"0",10);
    const d = new Date(yy,mm,dd,hh,mi,ss);
    return isFinite(d) ? d : null;
  }

  return null;
}

/* ========= Parse sinottico filename =========
   Accetta:
   - Sinottico-YYYY-MM-DD.xlsx
   - Sinottico-YYYY-MM-DD-hhmm.xlsx
   - Sinottico-YYYY-MM-DD-hh:mm.xlsx
   - Anche con mese/giorno 1 cifra
*/
export function parseSinotticoNameDate(filename){
  const name = safeStr(filename);
  const m = name.match(/Sinottico-(\d{4})-(\d{1,2})-(\d{1,2})(?:-(\d{1,2})(?::?(\d{2}))?)?\.xlsx$/i);
  if(!m) return null;
  const yy = parseInt(m[1],10);
  const mo = parseInt(m[2],10)-1;
  const dd = parseInt(m[3],10);
  const hh = parseInt(m[4]||"0",10);
  const mi = parseInt(m[5]||"0",10);
  const d = new Date(yy,mo,dd,hh,mi,0);
  return isFinite(d) ? d : null;
}

export function fmtDateEU(d){
  if(!d || !(d instanceof Date) || !isFinite(d)) return "N/A";
  const pad=(n)=>String(n).padStart(2,"0");
  return `${pad(d.getDate())}/${pad(d.getMonth()+1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function fmtMoneyInt(n){
  if(!isFinite(n)) return "0";
  return Math.round(n).toLocaleString("it-IT");
}

export function pctFromCell(raw){
  if(raw === null || raw === undefined || raw === "") return null;
  const s = String(raw).trim().replace(",",".");
  let n = Number(s.replace(/[^\d.-]/g,""));
  if(!isFinite(n)) return null;
  if(n > 1.5) return n;
  return n*100;
}

export function moneyFromCounter(raw){
  if(raw === null || raw === undefined || raw === "") return null;
  const s = String(raw).trim();
  if(!s) return null;
  let n = Number(s.replace(/[^\d.-]/g,""));
  if(!isFinite(n)) return null;
  return Math.floor(n / 100);
}

export async function fetchJSON(url){
  const r = await fetch(url, {cache:"no-store"});
  if(!r.ok) throw new Error(`HTTP ${r.status} su ${url}`);
  return await r.json();
}
export async function fetchArrayBuffer(url){
  const r = await fetch(url, {cache:"no-store"});
  if(!r.ok) throw new Error(`HTTP ${r.status} su ${url}`);
  return await r.arrayBuffer();
}

/* ========= XLSX parsing ========= */
function normalizeHeader(h){
  return safeStr(h).toUpperCase().replace(/\s+/g," ").trim();
}
function rowToObj(headers, row){
  const o={};
  for(let i=0;i<headers.length;i++){
    const key = headers[i];
    o[key] = row[i];
  }
  return o;
}
function pick(o, ...keys){
  for(const k of keys){
    if(o[k] !== undefined) return o[k];
  }
  return undefined;
}

export function parseSinottico(buffer, fileName){
  const wb = XLSX.read(buffer, {type:"array"});
  const sheetName = wb.SheetNames[0];
  const ws = wb.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json(ws, {header:1, raw:true});
  if(!rows || rows.length < 2) return [];

  // header row = first row containing CODEID
  let headerRowIndex = 0;
  for(let i=0;i<Math.min(30, rows.length);i++){
    const r = rows[i] || [];
    const has = r.some(c => normalizeHeader(c) === "CODEID");
    if(has){ headerRowIndex = i; break; }
  }

  const headers = (rows[headerRowIndex]||[]).map(normalizeHeader);
  const dataRows = rows.slice(headerRowIndex+1).filter(r=>r && r.length);

  const out = [];
  for(const r of dataRows){
    const o = rowToObj(headers, r);
    const codeid = safeStr(pick(o,"CODEID"));
    if(!codeid) continue;

    const modelCode = safeStr(pick(o,"CODICE MODELLO"));
    const modelName = safeStr(pick(o,"MODELLO"));
    const locale = safeStr(pick(o,"DENOMIN. SEDE","DENOMIN SEDE","DENOMINAZIONE SEDE"));
    const pda = safeStr(pick(o,"MACADDRESS PDA","MACADDRESS  PDA","MACADDRESS"));
    const provincia = safeStr(pick(o,"PROVINCIA"));
    const comune = safeStr(pick(o,"COMUNE"));
    const indirizzo = safeStr(pick(o,"INDIRIZZO"));
    const codeSede = safeStr(pick(o,"CODICE SEDE"));
    const pdv = safeStr(pick(o,"CODICE PDV AAMS","CODICE PDV","PDV AAMS"));
    const stato = safeStr(pick(o,"DESCR. STATO","DESCR STATO","STATO"));
    const em = safeStr(pick(o,"E/M","E M"));
    const pctOut = pctFromCell(pick(o,"% OUT","%OUT")) ?? null;

    const ts = parseAnyDateTime(pick(o,"DATA ULTIMA LETTURA VAL.","DATA ULTIMA LETTURA VAL", "DATA ULTIMA LETTURA"));
    const cntIn = moneyFromCounter(pick(o,"CNTTOTIN"));
    const cntOut = moneyFromCounter(pick(o,"CNTTOTOT"));

    const ggNoLinkRaw = pick(o,"GG MANCATO COLLEGAMENTO");
    const ggNoLink = (ggNoLinkRaw===null||ggNoLinkRaw===undefined||ggNoLinkRaw==="") ? 0 : Number(ggNoLinkRaw) || 0;

    out.push({
      codeid,
      modelCode, modelName,
      locale, pda, provincia, comune, indirizzo, codeSede, pdv,
      stato, em,
      pctOut,
      ts,
      cntIn, cntOut,
      ggNoLink,
      raw:o,
      file:fileName
    });
  }
  return out;
}

/* ========= Index helpers ========= */
export function ensureSetMap(map, key){
  if(!map.has(key)) map.set(key, new Set());
  return map.get(key);
}
export function ensureLocal(name){
  const key = (name||"").trim() || "N/A";
  if(!S.locals.has(key)){
    S.locals.set(key, {name:key, codeSede:"", provincia:"", comune:"", address:"", pdv:"", pdaSet:new Set(), codeids:new Set()});
  }
  return S.locals.get(key);
}

export function addHistoryPoint(codeid, point){
  if(!S.history.has(codeid)) S.history.set(codeid, []);
  const arr = S.history.get(codeid);
  const ts = point.ts?.getTime?.();
  if(!ts) return;
  const last = arr[arr.length-1];
  if(last && last.ts && last.ts.getTime() === ts) return;
  arr.push(point);
}
export function sortAllHistories(){
  for(const [codeid, arr] of S.history.entries()){
    arr.sort((a,b)=>a.ts-b.ts);
    const out=[];
    let prevTs=null;
    for(const p of arr){
      const t=p.ts.getTime();
      if(prevTs===t) continue;
      out.push(p);
      prevTs=t;
    }
    S.history.set(codeid,out);
  }
}

export function countAllHistoryPoints(){
  let n=0;
  for(const arr of S.history.values()) n += arr.length;
  return n;
}
// --- Predizione payout (statistica) ---
// Definizione evento payout: ΔOUT alto (soglia dinamica per modello)
function payoutThresholdForSeries(deltasOut){
  // soglia = max( 20€, percentile 85% )
  const arr = deltasOut.filter(x=>Number.isFinite(x) && x>0).sort((a,b)=>a-b);
  if(arr.length<6) return 20;
  const p = arr[Math.floor(arr.length*0.85)];
  return Math.max(20, p);
}

export function getModelKey(m){ return (m.modelCode || m.modelName || "UNKNOWN").toString().trim(); }

export function modelProfile(modelKey){
  // costruisce un profilo usando TUTTE le macchine di quel modello che hanno storico
  const points = [];
  for(const m of S.machines.values()){
    if(getModelKey(m)!==modelKey) continue;
    const h = S.history.get(m.codeid) || [];
    for(const p of h){
      // p: {ts, dIn, dOut, pct}
      points.push(p);
    }
  }
  const dOuts = points.map(p=>p.dOut||0);
  const thr = payoutThresholdForSeries(dOuts);

  // costruisco "distanze" tra payout in termini di IN accumulato
  let inSince = 0;
  const gaps = [];
  const payouts = [];
  for(const p of points.sort((a,b)=>a.ts-b.ts)){
    inSince += (p.dIn||0);
    if((p.dOut||0) >= thr){
      gaps.push(inSince);
      payouts.push(p.dOut||0);
      inSince = 0;
    }
  }

  const median = (arr)=>{
    const a = arr.filter(x=>Number.isFinite(x)&&x>0).sort((x,y)=>x-y);
    if(!a.length) return null;
    const mid = Math.floor(a.length/2);
    return a.length%2 ? a[mid] : (a[mid-1]+a[mid])/2;
  };
  const avg = (arr)=>{
    const a = arr.filter(x=>Number.isFinite(x));
    if(!a.length) return null;
    return a.reduce((s,x)=>s+x,0)/a.length;
  };

  const cycleIn = median(gaps);       // €IN tra payout (mediana)
  const payoutAvg = avg(payouts);     // €OUT payout medio
  const payoutMed = median(payouts);

  // volatilità: rapporto tra p90 e mediana payout (grezzo ma utile)
  const p90 = (arr)=>{
    const a = arr.filter(x=>Number.isFinite(x)&&x>0).sort((x,y)=>x-y);
    if(!a.length) return null;
    return a[Math.floor(a.length*0.90)];
  };
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
  // stima €/ora da deltaIN/deltaTempo sugli ultimi punti
  const h = (S.history.get(codeid)||[]).slice().sort((a,b)=>a.ts-b.ts);
  if(h.length<3) return null;
  const last = h.slice(-12);
  let sumIn=0, sumH=0;
  for(let i=1;i<last.length;i++){
    const dt = (last[i].ts - last[i-1].ts) / 3600000; // ore
    if(dt<=0 || dt>48) continue;
    const din = last[i].dIn || 0;
    if(din<=0) continue;
    sumIn += din;
    sumH  += dt;
  }
  if(sumH<=0) return null;
  return sumIn / sumH;
}

export function machinePrediction(m){
  const modelKey = getModelKey(m);
  const prof = modelProfile(modelKey);

  const h = (S.history.get(m.codeid)||[]).slice().sort((a,b)=>a.ts-b.ts);
  if(!h.length || !prof.cycleIn){
    return { ok:false, reason:"Storico insufficiente per stimare ciclo/predizione.", prof };
  }

  // progress = IN accumulato dall’ultimo payout-event
  const thr = prof.payoutThreshold ?? 20;
  let progressIn = 0;
  for(let i=h.length-1;i>=0;i--){
    progressIn += (h[i].dIn||0);
    if((h[i].dOut||0) >= thr) break;
  }

  const remainingIn = Math.max(0, prof.cycleIn - progressIn);
  const rate = estimatePlayRateEuroPerHour(m.codeid); // €/ora
  const hours = (rate && rate>0) ? (remainingIn / rate) : null;

  // “quanto potrebbe pagare”: uso payoutMed e payoutAvg (range)
  return {
    ok:true,
    modelKey,
    prof,
    progressIn,
    remainingIn,
    rateEuroPerHour: rate,
    etaHours: hours,
    expectedPayoutMed: prof.payoutMed,
    expectedPayoutAvg: prof.payoutAvg
  };
}

export function peerMachinesSameModel(m, limit=8){
  const key = getModelKey(m);
  const peers = [];
  for(const x of S.machines.values()){
    if(x.codeid===m.codeid) continue;
    if(getModelKey(x)!==key) continue;
    const pred = machinePrediction(x);
    peers.push({m:x, pred});
  }
  // ordino: più vicine al payout (remainingIn basso) prima
  peers.sort((a,b)=>{
    const ra = a.pred.ok ? a.pred.remainingIn : 1e9;
    const rb = b.pred.ok ? b.pred.remainingIn : 1e9;
    return ra - rb;
  });
  return peers.slice(0,limit);
}
