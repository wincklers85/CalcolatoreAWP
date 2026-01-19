const LS_KEY = "awp_session_v1";

export async function loadUsers(){
  const r = await fetch("Dati/users.json", { cache:"no-store" });
  if(!r.ok) throw new Error("Impossibile leggere users.json");
  const arr = await r.json();
  if(!Array.isArray(arr)) throw new Error("users.json non è un array");
  return arr;
}

export function isExpired(expires){
  if(!expires) return true;
  const d = new Date(expires + "T23:59:59");
  return Date.now() > d.getTime();
}

export function normalizeLevel(level){
  const s = String(level || "").toLowerCase();
  if(s === "admin") return "admin";
  if(s === "abbonato") return "abbonato";
  return s; // fallback
}

export async function login(username, pin){
  const users = await loadUsers();
  const u = users.find(x =>
    String(x.user||"").toLowerCase() === String(username||"").trim().toLowerCase()
    && String(x.pin||"") === String(pin||"").trim()
  );

  if(!u) return { ok:false, reason:"Credenziali non valide" };

  const level = normalizeLevel(u.level);
  const expired = isExpired(u.expires);

  const session = {
    user: u.user,
    level,
    expires: u.expires || null,
    expired,
    loginAt: Date.now()
  };

  localStorage.setItem(LS_KEY, JSON.stringify(session));
  return { ok:true, session };
}

export function logout(){
  localStorage.removeItem(LS_KEY);
}

export function getSession(){
  try{
    const raw = localStorage.getItem(LS_KEY);
    if(!raw) return null;
    const s = JSON.parse(raw);
    if(!s || !s.user) return null;
    // ricalcolo expired ogni volta
    return { ...s, expired: isExpired(s.expires) };
  }catch{ return null; }
}
