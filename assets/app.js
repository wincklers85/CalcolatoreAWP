import { login, logout, getSession, loadUsers } from "./auth.js";
import {
  createState, loadManifest, pickLatestFromManifest,
  parseDateFromFilename, fmtItDate,
  loadCicloSlot, parseSinotticoSheet, mergeState,
  recencyStatus
} from "./engine.js";
import { renderDashboard, bindRowClicks, openSlotModal, showModal } from "./ui.js";
import { createAssistant } from "./ai.js";

const S = createState();
const assistant = createAssistant();

let selectedCodeId = null;

function $(id){ return document.getElementById(id); }

function setView(id){
  document.querySelectorAll(".view").forEach(v=>v.classList.remove("active"));
  $(id).classList.add("active");
  document.querySelectorAll(".menubtn").forEach(b=>b.classList.toggle("active", b.dataset.view===id));
}

function menu(open){
  const sm = $("sidemenu");
  const bd = $("backdrop");
  if(open){ sm.classList.add("open"); bd.classList.add("show"); sm.setAttribute("aria-hidden","false"); }
  else { sm.classList.remove("open"); bd.classList.remove("show"); sm.setAttribute("aria-hidden","true"); }
}

function setBubble(dt){
  const r = recencyStatus(dt);
  const dot = $("bubbleDot");
  const txt = $("bubbleText");
  if(r.key==="good"){ dot.style.background = "var(--good)"; }
  else if(r.key==="warn"){ dot.style.background = "var(--warn)"; }
  else { dot.style.background = "var(--bad)"; }

  txt.textContent = dt ? `Ultimo aggiornamento: ${fmtItDate(dt)}` : `Ultimo aggiornamento: —`;
}

function setProgress(i, n){
  const pct = n ? Math.round((i/n)*100) : 0;
  $("progressFill").style.width = `${pct}%`;
  $("progressText").textContent = n ? `Caricamento ${i}/${n} (${pct}%)` : "—";
}

async function fetchXlsx(file){
  const r = await fetch("Dati/" + file, { cache:"no-store" });
  if(!r.ok) throw new Error(`Errore download: ${file}`);
  const b = await r.arrayBuffer();
  const wb = XLSX.read(b, { type:"array" });
  const sh = wb.Sheets[wb.SheetNames[0]];
  return sh;
}

async function loadFiles(files){
  let i = 0;
  for(const f of files){
    i++;
    setProgress(i, files.length);
    const sh = await fetchXlsx(f);
    const machines = parseSinotticoSheet(sh);
    const dtFile = parseDateFromFilename(f);
    mergeState(S, machines, dtFile);
    S.loadedFiles.push(f);
  }
  setProgress(0,0);
}

function renderAll(session){
  // se abbonato scaduto: limita le viste
  const expiredLimited = session && session.level === "abbonato" && session.expired;

  if(expiredLimited){
    // mostra solo profilo e bubble (dashboard come banner informativo)
    setView("viewProfile");
  }else{
    setView("viewDashboard");
  }

  renderDashboard(S, session);
  renderModels();
  renderAdmin(session);
  renderProfile(session);

  $("menuHint").textContent = expiredLimited
    ? "Abbonamento scaduto: funzioni limitate."
    : "Pronto.";
}

function renderModels(){
  const tbody = document.querySelector("#tblModels tbody");
  tbody.innerHTML = "";
  const counts = new Map();
  for(const m of S.machinesById.values()){
    const k = String(m.modelCode||"");
    counts.set(k, (counts.get(k)||0)+1);
  }

  for(const [k,cfg] of S.cicloMap.entries()){
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td class="mono">${k}</td>
      <td>${cfg.nomeModello || ""}</td>
      <td>${cfg.ciclo ?? "—"}</td>
      <td>${cfg.payout ? cfg.payout+"%" : "—"}</td>
      <td>${counts.get(k)||0}</td>
    `;
    tbody.appendChild(tr);
  }
}

async function renderAdmin(session){
  const isAdmin = session && session.level === "admin" && !session.expired;
  $("btnAdminView").style.display = isAdmin ? "block" : "none";

  if(!isAdmin) return;

  // Users table
  const users = await loadUsers();
  const tb = document.querySelector("#tblUsers tbody");
  tb.innerHTML = "";
  for(const u of users){
    const exp = u.expires ? new Date(u.expires+"T23:59:59") : null;
    const ok = exp ? (Date.now() <= exp.getTime()) : false;
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${u.user||""}</td>
      <td>${u.level||""}</td>
      <td>${u.expires||"—"}</td>
      <td>${ok ? "ATTIVO" : "SCADUTO"}</td>
    `;
    tb.appendChild(tr);
  }

  // Diagnostics
  $("diagBox").textContent =
    `Macchine: ${S.machinesById.size}\n` +
    `Storici: ${S.historyById.size}\n` +
    `File caricati: ${S.loadedFiles.length}\n` +
    `Modelli in cicloslot: ${S.cicloMap.size}\n`;
}

function renderProfile(session){
  const box = $("profileBox");
  if(!session){
    box.innerHTML = `<p>Non autenticato.</p>`;
    return;
  }

  const exp = session.expires || "—";
  const expired = !!session.expired;

  if(session.level === "abbonato" && expired){
    box.innerHTML = `
      <p><b>Utente:</b> ${session.user}</p>
      <p><b>Stato:</b> SCADUTO (${exp})</p>
      <p>Puoi visualizzare solo lo stato dell’ultimo aggiornamento.</p>
      <p>
        Per rinnovare:
        <a href="mailto:wincklers85@googlemail.com?subject=Rinnovo%20abbonamento%20AWP%20Analyzer&body=Ciao,%20vorrei%20rinnovare%20l'abbonamento%20per%20l'utente%20${encodeURIComponent(session.user)}.">
          invia richiesta email
        </a>
      </p>
    `;
    return;
  }

  box.innerHTML = `
    <p><b>Utente:</b> ${session.user}</p>
    <p><b>Livello:</b> ${session.level}</p>
    <p><b>Scadenza:</b> ${exp}</p>
  `;
}

function setupChat(){
  const log = $("chatLog");
  const input = $("chatInput");

  const add = (who, text)=>{
    const div = document.createElement("div");
    div.className = `msg ${who==="me" ? "me" : "bot"}`;
    div.innerHTML = `<div class="bub">${text.replace(/\n/g,"<br>")}</div>`;
    log.appendChild(div);
    log.scrollTop = log.scrollHeight;
  };

  $("btnChatSend").onclick = ()=>{
    const q = input.value.trim();
    if(!q) return;
    add("me", q);
    input.value = "";

    const r = assistant.reply(q, S, selectedCodeId);
    add("bot", r.text);
  };

  add("bot", `Sono **${assistant.name}**. Posso aiutarti con: anomalie, confronto modello, spiegazione score, aggiornamento dati.`);
}

async function boot(){
  // menu bindings
  $("btnBurger").onclick = ()=>menu(true);
  $("btnCloseMenu").onclick = ()=>menu(false);
  $("backdrop").onclick = ()=>menu(false);

  document.querySelectorAll(".menubtn").forEach(btn=>{
    btn.onclick = ()=>{
      menu(false);
      setView(btn.dataset.view);
    };
  });

  // modal bindings
  $("modalBackdrop").onclick = ()=>showModal(false);
  $("btnCloseModal").onclick = ()=>showModal(false);

  // filter/sort
  $("filterText").oninput = ()=>renderDashboard(S, getSession());
  $("sortBy").onchange = ()=>renderDashboard(S, getSession());

  bindRowClicks(S, (codeid)=>{
    selectedCodeId = codeid;
    openSlotModal(S, codeid);
  });

  setupChat();

  // carica cicloslot subito
  S.cicloMap = await loadCicloSlot();

  // bubble da manifest
  const manifest = await loadManifest();
  const latest = pickLatestFromManifest(manifest);
  setBubble(latest?.dt || null);

  // session
  const session = getSession();
  if(session){
    $("viewLogin").classList.remove("active");
    $("userPill").style.display = "flex";
    $("userName").textContent = session.user;
    $("userLevel").textContent = session.level + (session.expired ? " (scaduto)" : "");
    renderAll(session);

    // auto-load ultimi 3 se non scaduto
    if(!(session.level === "abbonato" && session.expired)){
      await loadFiles(manifest.slice(-3));
      renderAll(session);
    }
  }else{
    setView("viewLogin");
  }

  // login
  $("btnLogin").onclick = async ()=>{
    $("loginMsg").textContent = "Accesso…";
    const u = $("loginUser").value;
    const p = $("loginPin").value;
    const res = await login(u,p);
    if(!res.ok){
      $("loginMsg").textContent = res.reason;
      return;
    }

    const session2 = res.session;
    $("userPill").style.display = "flex";
    $("userName").textContent = session2.user;
    $("userLevel").textContent = session2.level + (session2.expired ? " (scaduto)" : "");
    $("loginMsg").textContent = "OK";

    // se scaduto: solo profilo/bubble
    renderAll(session2);

    if(!(session2.level === "abbonato" && session2.expired)){
      const man = await loadManifest();
      await loadFiles(man.slice(-3));
      renderAll(session2);
    }
  };

  // logout
  $("btnLogout").onclick = ()=>{
    logout();
    location.reload();
  };

  // load buttons
  $("btnLoadLast3").onclick = async ()=>{
    const s = getSession();
    if(!s || (s.level==="abbonato" && s.expired)) return;
    S.machinesById.clear(); S.historyById.clear(); S.loadedFiles = [];
    const man = await loadManifest();
    await loadFiles(man.slice(-3));
    renderAll(s);
  };

  $("btnLoadAll").onclick = async ()=>{
    const s = getSession();
    if(!s || (s.level==="abbonato" && s.expired)) return;
    S.machinesById.clear(); S.historyById.clear(); S.loadedFiles = [];
    const man = await loadManifest();
    await loadFiles(man);
    renderAll(s);
  };
}

boot().catch(err=>{
  console.error(err);
  const s = $("bubbleText");
  if(s) s.textContent = "Errore avvio (console)";
});
