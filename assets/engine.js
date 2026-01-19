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
