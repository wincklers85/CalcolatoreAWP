import { $, $$, S, escapeHtml, fmtDateEU, parseSinotticoNameDate } from "./engine.js";

export function toast(title, msg){
  $("#toastTitle").textContent = title;
  $("#toastMsg").textContent = msg;
  const t = $("#toast");
  t.style.display = "block";
  clearTimeout(toast._t);
  toast._t = setTimeout(()=> t.style.display="none", 3600);
}

export function setDot(id, state){
  const el = $(id);
  el.className = "dot " + (state==="ok" ? "ok" : state==="warn" ? "warn" : state==="bad" ? "bad" : "");
}

export function setStatus(ok, text){
  $("#dotStatus").className = "dot " + (ok ? "ok" : "");
  $("#txtStatus").textContent = text;
}

export function showView(id){
  $$(".view").forEach(v=>v.classList.remove("active"));
  $(id).classList.add("active");
}

export function saveSession(sess){
  try{ localStorage.setItem(S.cacheKey, JSON.stringify(sess)); }catch(e){}
}
export function loadSession(){
  try{
    const raw = localStorage.getItem(S.cacheKey);
    if(!raw) return null;
    return JSON.parse(raw);
  }catch(e){ return null; }
}
export function clearSession(){
  try{ localStorage.removeItem(S.cacheKey); }catch(e){}
}

/* ===== Banner aggiornamento (ultimo sinottico) ===== */
export function updateBannerFromManifest(){
  const pill = $("#pillUpdate");
  const dot = $("#dotUpdate");
  const txt = $("#txtUpdate");

  const arr = S.manifest?.sinottici;
  if(!Array.isArray(arr) || arr.length===0){
    dot.className = "dot warn";
    txt.textContent = "Ultimo sinottico: manifest vuoto";
    return;
  }

  const lastName = arr[arr.length-1];
  const d = parseSinotticoNameDate(lastName);

  if(!d){
    dot.className = "dot warn";
    txt.textContent = `Ultimo sinottico: ${lastName}`;
    return;
  }

  const now = new Date();
  const sameDay = (d.getFullYear()===now.getFullYear() && d.getMonth()===now.getMonth() && d.getDate()===now.getDate());

  if(sameDay){
    dot.className = "dot ok";
    const hh = String(d.getHours()).padStart(2,"0");
    const mm = String(d.getMinutes()).padStart(2,"0");
    txt.textContent = `Aggiornato oggi alle ${hh}:${mm}`;
  }else{
    dot.className = "dot bad";
    txt.textContent = `Non aggiornato (ultimo: ${fmtDateEU(d)})`;
  }

  // Per viewExpired
  $("#expiredLast").textContent = fmtDateEU(d);
}
