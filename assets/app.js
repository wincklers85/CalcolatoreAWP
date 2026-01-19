import {
  PATH, S, $, $$,
  fetchJSON,
  normalizeUser, normalizePin
} from "./engine.js";

import { toast, setDot, setStatus, showView, saveSession, loadSession, clearSession, updateBannerFromManifest } from "./ui.js";
import { initAppFeatures, setAdminVisibility, renderUsersTable, selfTest, afterDataLoaded } from "./app_features.js";

async function loadCore(){
  // XLSX check
  const hasXLSX = typeof XLSX !== "undefined" && XLSX.read;
  setDot("#dotXLSX", hasXLSX ? "ok" : "bad");
  $("#xlsxInfo").textContent = hasXLSX ? "XLSX: OK" : "XLSX: NON caricato (CDN bloccato?)";

  // users
  try{
    const users = await fetchJSON(PATH.users);
    S.users = Array.isArray(users) ? users : [];
    setDot("#dotUsers", S.users.length ? "ok" : "warn");
    $("#usersInfo").textContent = `users.json: ${S.users.length} utenti`;
  }catch(e){
    S.users = [];
    setDot("#dotUsers","bad");
    $("#usersInfo").textContent = `users.json: ${e.message}`;
  }

  // manifest
  try{
    const man = await fetchJSON(PATH.manifest);
    S.manifest = man;
    const n = (man && Array.isArray(man.sinottici)) ? man.sinottici.length : 0;
    setDot("#dotManifest", n ? "ok" : "warn");
    $("#manifestInfo").textContent = `manifest.json: ${n} sinottici`;
  }catch(e){
    S.manifest = null;
    setDot("#dotManifest","bad");
    $("#manifestInfo").textContent = `manifest.json: ${e.message}`;
  }

  // cicloslot (optional)
  try{
    const cyc = await fetchJSON(PATH.cicloslot);
    S.ciclos = Array.isArray(cyc) ? cyc : [];
  }catch(e){
    S.ciclos = [];
  }

  // banner update
  updateBannerFromManifest();

  // restore session
  const sess = loadSession();
  if(sess?.user){
    const u = S.users.find(x => normalizeUser(x.user) === normalizeUser(sess.user));
    if(u){
      S.session = buildSession(u);
      routeBySession();
    }
  }

  $("#loginStatus").textContent = "Pronto.";
}

function buildSession(userObj){
  const exp = userObj.expires ? new Date(userObj.expires + "T00:00:00") : null;
  const expired = exp ? (isFinite(exp) && exp < new Date()) : false;
  return {
    user: userObj.user,
    level: userObj.level,
    expires: userObj.expires || null,
    expired
  };
}

function routeBySession(){
  if(!S.session){
    setStatus(false, "Non autenticato");
    showView("#viewLogin");
    $("#btnLogout").style.display = "none";
    return;
  }

  $("#btnLogout").style.display = "inline-flex";

  if(S.session.expired){
    setStatus(true, `Accesso limitato: ${S.session.user} (SCADUTO)`);
    showExpired();
    return;
  }

  setStatus(true, `Connesso: ${S.session.user} (${S.session.level})`);
  showView("#viewMain");

  // admin visibility
  setAdminVisibility(S.session.level);
  renderUsersTable(); // if admin
}

function showExpired(){
  showView("#viewExpired");
  $("#expiredUser").textContent = S.session.user;
  $("#expiredHint").textContent = `Scadenza: ${S.session.expires || "N/A"}`;

  // mailto prefill
  const subject = encodeURIComponent(`Richiesta rinnovo AWP - ${S.session.user}`);
  const body = encodeURIComponent(
`Ciao,
vorrei rinnovare l’iscrizione per l’utente: ${S.session.user}

Scadenza attuale: ${S.session.expires || "N/A"}
Grazie!`
  );
  $("#btnRenewMail").href = `mailto:wincklers85@googlemail.com?subject=${subject}&body=${body}`;
}

function doLogin(){
  const userIn = normalizeUser($("#loginUser").value);
  const pinIn = normalizePin($("#loginPin").value);

  if(!S.users.length){
    toast("Login", "users.json non caricato o vuoto. Controlla /Dati/users.json (D maiuscola).");
    return;
  }
  if(!userIn || !pinIn){
    toast("Login", "Inserisci utente e PIN.");
    return;
  }

  const found = S.users.find(u =>
    normalizeUser(u.user) === userIn &&
    normalizePin(u.pin) === pinIn
  );

  if(!found){
    toast("Login", "Utente o PIN errati.");
    return;
  }

  S.session = buildSession(found);
  saveSession({user: found.user});
  routeBySession();
}

function logout(){
  S.session = null;
  clearSession();
  routeBySession();
}

function backToLogin(){
  logout();
}

function boot(){
  setStatus(false, "Non autenticato");
  initAppFeatures(); // hooks buttons for analysis etc.

  $("#btnLogin").addEventListener("click", doLogin);
  $("#btnLogout").addEventListener("click", logout);
  $("#btnBackLogin").addEventListener("click", backToLogin);

  $("#btnSelfTest").addEventListener("click", selfTest);

  loadCore().then(()=>{
    // after load core
    afterDataLoaded();
  });
}

boot();
