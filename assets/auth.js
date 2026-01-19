const PATH_USERS = "./Dati/users.json";

export async function loadUsers() {
  const res = await fetch(PATH_USERS, { cache: "no-store" });
  if (!res.ok) throw new Error("users.json non disponibile");
  const users = await res.json();
  if (!Array.isArray(users)) throw new Error("Formato users.json non valido (deve essere un array)");
  return users;
}

export function validateUsers(users){
  const bad = [];
  for(const u of users){
    if(!u || typeof u !== "object") { bad.push("record non oggetto"); continue; }
    if(!u.user || !/^[A-Za-z][A-Za-z0-9 _-]{1,30}$/.test(String(u.user))) bad.push(`user invalido: ${u.user}`);
    if(!u.pin  || !/^\d{4}$/.test(String(u.pin))) bad.push(`pin invalido per: ${u.user}`);
    if(!u.level || !["admin","Abbonato"].includes(String(u.level))) bad.push(`level invalido per: ${u.user}`);
    if(!u.expires || !/^\d{4}-\d{2}-\d{2}$/.test(String(u.expires))) bad.push(`expires invalido per: ${u.user}`);
  }
  if(bad.length) throw new Error("users.json: " + bad[0]);
}

export function isExpired(expiresISO) {
  const today = new Date().toISOString().slice(0, 10);
  return String(expiresISO) < today;
}

export async function login(username, pin) {
  const users = await loadUsers();
  validateUsers(users);

  const u = users.find(x => String(x.user) === String(username) && String(x.pin) === String(pin));
  if(!u) throw new Error("Credenziali non valide");

  const expired = isExpired(u.expires);
  return { user: u.user, level: u.level, expires: u.expires, expired, allUsers: users };
}
