// assets/app.js
import { login } from "./auth.js";
import {
  S,
  loadManifest,
  bannerStatusForToday,
  resetAll,
  analyzeOneFile,
  finalize
} from "./engine.js";

import {
  toast,
  setStatus,
  showView,
  renderBanner,
  progressShow,
  progressUpdate,
  progressHide,
  renderMachinesTable,
  bindMachineRowClicks
} from "./ui.js";

import { sibillaReply } from "./sibilla.js";

const $ = (s) => document.querySelector(s);

let SESSION = null;

// ---------- helpers ----------
function setDot(id, ok) {
  const el = document.getElementById(id);
  if (!el) return;
  el.style.background = ok ? "var(--good)" : "var(--bad)";
}

function safeText(id, txt) {
  const el = document.getElementById(id);
  if (el) el.textContent = txt;
}

function showLoginError(msg) {
  const el = $("#loginError");
  if (!el) return;
  el.style.display = "block";
  el.textContent = msg;
}

function hideLoginError() {
  const el = $("#loginError");
  if (!el) return;
  el.style.display = "none";
  el.textContent = "";
}

// ---------- chat ----------
function appendChat(who, text, targetId = "chatlog") {
  const log = document.getElementById(targetId);
  if (!log) return;

  const div = document.createElement("div");
  div.className = "msg " + (who === "user" ? "user" : "ai");
  div.innerHTML = `
    <div class="avatar">${who === "user" ? "U" : "S"}</div>
    <div class="bubble"></div>
  `;
  div.querySelector(".bubble").textContent = String(text || "");
  log.appendChild(div);
  log.scrollTop = log.scrollHeight;
}

function initChat() {
  const send = $("#chatSend");
  const inp = $("#chatInput");
  if (!send || !inp) return;

  send.addEventListener("click", () => {
    const text = (inp.value || "").trim();
    if (!text) return;
    appendChat("user", text, "chatlog");
    const ans = sibillaReply(text);
    appendChat("ai", ans, "chatlog");
    inp.value = "";
  });

  inp.addEventListener("keydown", (e) => {
    if (e.key === "Enter") send.click();
  });

  appendChat("ai", "Ciao, sono Sibilla. Prova: “top pagamenti”, “cerca <testo>”, “dettagli <CODEID>”, “modello <codice>”.", "chatlog");
}

// ---------- analysis ----------
async function analyzeFilesWithProgress(fileNames, labelBase) {
  progressShow(labelBase || "Analisi…");
  const total = fileNames.length;
  let done = 0;

  for (const f of fileNames) {
    progressUpdate(done, total, `Carico: ${f}`);
    await analyzeOneFile(f);
    done++;
    progressUpdate(done, total, `Analizzato: ${f}`);
    // lascia respirare il browser (mobile)
    await new Promise((r) => setTimeout(r, 0));
  }

  finalize();
  progressHide();
}

function getHistoryPointsCount() {
  let pts = 0;
  for (const h of S.history.values()) pts += h.length;
  return pts;
}

// ---------- filters + render ----------
function getFilteredMachines() {
  const q = ($("#qSearch")?.value || "").trim().toLowerCase();
  const filter = $("#qFilter")?.value || "all";

  let list = Array.from(S.machines.values());

  if (q) {
    list = list.filter((m) => {
      const hay = [
        m.locale, m.comune, m.provincia, m.indirizzo,
        m.modelName, m.modelCode, m.codeid, m.pda
      ].join(" ").toLowerCase();
      return hay.includes(q);
    });
  }

  if (filter === "active") {
    list = list.filter((m) => String(m.em || "").toUpperCase().includes("E"));
  } else if (filter === "stale") {
    list = list.filter((m) => (m.ggNoLink || 0) >= 7);
  } else if (filter === "likely") {
    // ordina per probabilità: qui delego a ui.js quando renderizza,
    // ma per “likely” la cosa più sensata è: remainingIn più basso.
    // Non voglio importare engine machinePrediction qui per evitare cicli.
    // Quindi faccio render normale ma limito la lista: si può raffinare dopo.
    // (Se vuoi, lo faccio con una cache in engine/ui.)
    list = list.slice(0, 200);
  }

  return list;
}

function renderAll() {
  const list = getFilteredMachines();
  renderMachinesTable(list);

  safeText("dataInfo", `Dati: ${S.machines.size} macchine`);
  safeText("histInfo", `Storico: ${getHistoryPointsCount()}`);

  // dots
  const pts = getHistoryPointsCount();
  const hasData = S.machines.size > 0;
  document.getElementById("dotData") && (document.getElementById("dotData").style.background = hasData ? "var(--good)" : "rgba(255,255,255,.22)");
  document.getElementById("dotHist") && (document.getElementById("dotHist").style.background = pts ? "var(--good)" : "rgba(255,255,255,.22)");
}

// ---------- models panel render ----------
function renderModels() {
  const tbody = $("#tblModels tbody");
  if (!tbody) return;

  tbody.innerHTML = "";
  let payouts = 0;

  for (const [modelKey, setCodes] of S.models.entries()) {
    const st = S.modelStats.get(modelKey);
    if (st) payouts += (st.samplePayouts || 0);

    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td class="mono"></td>
      <td></td>
      <td></td>
      <td></td>
      <td></td>
      <td></td>
      <td></td>
    `;
    tr.children[0].textContent = modelKey;
    tr.children[1].textContent = String(setCodes.size);
    tr.children[2].textContent = st?.cycleIn != null ? `${Math.round(st.cycleIn)}€` : "N/A";
    tr.children[3].textContent = st?.payoutMed != null ? `${Math.round(st.payoutMed)}€` : "N/A";
    tr.children[4].textContent = st?.payoutAvg != null ? `${Math.round(st.payoutAvg)}€` : "N/A";
    tr.children[5].textContent = st?.volatility != null ? st.volatility.toFixed(2) : "N/A";
    tr.children[6].textContent = String(st?.samplePayouts || 0);

    tbody.appendChild(tr);
  }

  safeText("modelsCount", String(S.models.size));
  safeText("modelsPayouts", String(payouts));
}

// ---------- admin panel ----------
function showAdminPanel(allUsers) {
  const panel = $("#adminPanel");
  const box = $("#adminBox");
  if (!panel || !box) return;

  panel.style.display = "block";

  const pts = getHistoryPointsCount();
  box.innerHTML = `
    <div class="row" style="margin-bottom:10px">
      <span class="badge">Utenti: <b>${allUsers.length}</b></span>
      <span class="badge">Macchine: <b>${S.machines.size}</b></span>
      <span class="badge">Punti storico: <b>${pts}</b></span>
      <span class="badge mono">Ultimo: <b>${S.latestFile || "N/A"}</b></span>
    </div>

    <div style="max-height:260px; overflow:auto; border-radius:14px; border:1px solid rgba(255,255,255,.12)">
      <table class="table">
        <thead><tr><th>Utente</th><th>Ruolo</th><th>Scadenza</th></tr></thead>
        <tbody>
          ${allUsers.map(u => `<tr><td>${u.user}</td><td>${u.level}</td><td class="mono">${u.expires}</td></tr>`).join("")}
        </tbody>
      </table>
    </div>

    <div class="footer-note">
      Nota admin: contatori sono in centesimi → qui l’engine li converte in euro dividendo per 100.
    </div>
  `;
}

function hideAdminPanel() {
  const panel = $("#adminPanel");
  if (panel) panel.style.display = "none";
}

// ---------- expired view ----------
function showExpiredProfile(session) {
  const box = $("#expiredBox");
  if (!box) return;

  box.innerHTML = `
    <div class="row" style="margin-bottom:10px">
      <span class="badge">Utente: <b>${session.user}</b></span>
      <span class="badge">Ruolo: <b>${session.level}</b></span>
      <span class="badge mono">Scadenza: <b>${session.expires}</b></span>
    </div>

    <p class="muted">
      Il profilo è scaduto. Puoi vedere solo lo stato dell’ultimo sinottico e questa pagina profilo.
      Per riattivare, invia una richiesta via email.
    </p>

    <a class="btn primary"
       href="mailto:wincklers85@googlemail.com?subject=Richiesta%20rinnovo%20AWP%20Analyzer&body=Utente:%20${encodeURIComponent(session.user)}%0AScadenza:%20${encodeURIComponent(session.expires)}%0ARichiesta:%20Rinnovo%20abbonamento">
      Richiedi rinnovo via email
    </a>
  `;
}

// ---------- self test (login screen) ----------
async function selfTest() {
  try {
    hideLoginError();

    // XLSX presence
    const xlsxOk = typeof XLSX !== "undefined";
    setDot("dotXLSX", xlsxOk);
    safeText("xlsxInfo", `XLSX: ${xlsxOk ? "OK" : "MANCANTE"}`);

    // manifest
    await loadManifest();
    setDot("dotManifest", true);
    safeText("manifestInfo", `manifest.json: OK (${S.manifest.sinottici.length} file)`);

    // users fetch check
    const r = await fetch("./Dati/users.json", { cache: "no-store" });
    setDot("dotUsers", r.ok);
    safeText("usersInfo", `users.json: ${r.ok ? "OK" : "ERRORE"}`);

    // banner always
    renderBanner(S.latestFile, bannerStatusForToday());
    $("#cardBanner").style.display = "block";
  } catch (err) {
    setDot("dotManifest", false);
    safeText("manifestInfo", "manifest.json: ERRORE");
    showLoginError(String(err.message || err));
  }
}

// ---------- post login ----------
async function afterLogin(session) {
  SESSION = session;

  // banner always
  await loadManifest();
  renderBanner(S.latestFile, bannerStatusForToday());

  // status
  $("#btnLogout").style.display = "inline-flex";
  setStatus(`Autenticato: ${session.user} (${session.level})`, true);

  // expired logic
  if (session.expired) {
    showExpiredProfile(session);
    showView("#viewExpired");
    return;
  }

  // main view
  showView("#viewMain");
  hideAdminPanel();

  // bind UI
  bindMachineRowClicks();

  $("#qSearch")?.addEventListener("input", renderAll);
  $("#qFilter")?.addEventListener("change", renderAll);

  $("#btnToggleModels")?.addEventListener("click", () => {
    const p = $("#modelsPanel");
    if (!p) return;
    const open = p.style.display !== "none";
    p.style.display = open ? "none" : "block";
    $("#btnToggleModels").textContent = open ? "Apri" : "Chiudi";
    if (!open) renderModels();
  });

  $("#btnReset")?.addEventListener("click", () => {
    resetAll();
    renderAll();
    safeText("histInfo", "Storico: 0");
    toast("Reset", "Dati in RAM azzerati.");
  });

  // chat
  initChat();

  // load last 3
  const files = (S.filesSorted || []).map((x) => x.name);
  const last3 = files.slice(-3);

  safeText("subMain", "Carico gli ultimi 3 sinottici…");
  resetAll();
  await analyzeFilesWithProgress(last3, "Carico gli ultimi 3 sinottici…");
  safeText("subMain", "Pronto (storico parziale: usa 'Analizza tutti' per predizioni migliori)");

  renderAll();

  // admin panel if admin
  if (session.level === "admin") {
    showAdminPanel(session.allUsers);
  }

  // analyze all button (full)
  $("#btnAnalyzeAll")?.addEventListener("click", async () => {
    try {
      resetAll();
      const all = (S.filesSorted || []).map((x) => x.name);
      safeText("subMain", "Analisi completa in corso…");
      await analyzeFilesWithProgress(all, "Analisi completa: tutti i sinottici…");
      safeText("subMain", "Analisi completa terminata");
      renderAll();
      renderModels();
      toast("OK", "Analisi completa terminata.");
    } catch (err) {
      toast("Errore", String(err.message || err));
    }
  });
}

// ---------- login / logout ----------
async function doLogin() {
  const user = ($("#loginUser").value || "").trim();
  const pin = ($("#loginPin").value || "").trim();

  hideLoginError();

  if (!user || !pin) {
    showLoginError("Inserisci utente e PIN.");
    return;
  }

  try {
    const session = await login(user, pin);

    // security: clear input fields after any attempt
    $("#loginUser").value = "";
    $("#loginPin").value = "";

    await afterLogin(session);
  } catch {
    showLoginError("Credenziali non valide.");
    setStatus("Non autenticato", false);
  }
}

function doLogout() {
  SESSION = null;
  setStatus("Non autenticato", false);
  $("#btnLogout").style.display = "none";
  hideAdminPanel();
  showView("#viewLogin");
  toast("Logout", "Sessione terminata.");
}

// ---------- init ----------
window.addEventListener("load", async () => {
  // ensure no placeholders leak
  $("#loginUser").value = "";
  $("#loginPin").value = "";

  setStatus("Non autenticato", false);

  $("#btnLogin")?.addEventListener("click", doLogin);
  $("#btnSelfTest")?.addEventListener("click", selfTest);
  $("#btnLogout")?.addEventListener("click", doLogout);

  $("#btnReload")?.addEventListener("click", async () => {
    try {
      await loadManifest();
      renderBanner(S.latestFile, bannerStatusForToday());
      toast("Aggiornato", "Manifest ricaricato.");
    } catch (err) {
      toast("Errore", String(err.message || err));
    }
  });

  // run initial checks
  await selfTest();
});
