/* ============================================================
   DEMSY COUTURE — Espace de travail
   Application web (HTML + JavaScript) reliée à Firebase
   ============================================================ */
import { initializeApp, deleteApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getAuth, onAuthStateChanged, signInWithEmailAndPassword, signOut,
  createUserWithEmailAndPassword, updatePassword, reauthenticateWithCredential, EmailAuthProvider
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  getFirestore, collection, doc, addDoc, setDoc, getDoc, updateDoc, deleteDoc,
  onSnapshot, runTransaction, writeBatch, query, orderBy, limit
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { firebaseConfig, EMAIL_DOMAIN } from "./firebase-config.js";

/* ---------- Vérification de la configuration ---------- */
if (!firebaseConfig.apiKey || String(firebaseConfig.apiKey).startsWith("COLLE")) {
  document.getElementById("loader").innerHTML =
    "<p style='max-width:420px;text-align:center;padding:20px;font-family:sans-serif;color:#999'>" +
    "Configuration Firebase manquante.<br>Ouvre le fichier <b>js/firebase-config.js</b> et remplace les valeurs « COLLE_ICI ».</p>";
  throw new Error("Firebase non configuré");
}

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

/* ---------- État global ---------- */
let ME = null;
let unsubs = [];
let current = null;          // vue affichée
let detailId = null;         // commande ouverte dans la fenêtre « détails »
let detailEl = null;
let pendingLoginMsg = "";
const imgCache = {};
const S = { users: [], clients: [], orders: [], rdv: [], finance: {}, payments: [], logs: [], ordersReady: false };

/* ---------- Constantes métier ---------- */
const STATUSES = ["Coupe", "Couture", "Finitions", "Prêt pour essayage", "Livré"];
const ACTIVE_STATUSES = ["Coupe", "Couture", "Finitions"];
const RDV_STATUSES = ["Prévu", "Effectué", "Annulé"];
const TOP = [["epaule", "Épaule"], ["longueurManche", "Longueur manche"], ["tourManche", "Tour manche"], ["poitrine", "Poitrine"],
  ["ventre", "Ventre"], ["longueurHaut", "Longueur haut"], ["col", "Col"], ["dos", "Dos"]];
const BOTTOM = [["ceinture", "Ceinture"], ["bassin", "Bassin"], ["cuisse", "Cuisse"], ["longueurBas", "Longueur bas"],
  ["mollet", "Mollet"], ["bas", "Bas"], ["frappe", "Frappe"]];
const MONTHS = ["janv.", "févr.", "mars", "avr.", "mai", "juin", "juil.", "août", "sept.", "oct.", "nov.", "déc."];

/* ---------- Outils ---------- */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const fmt = n => new Intl.NumberFormat("fr-FR").format(Math.round(Number(n) || 0));
const fmtK = n => n >= 1e6 ? (n / 1e6).toFixed(1).replace(".0", "") + " M" : n >= 1000 ? Math.round(n / 1000) + " k" : String(Math.round(n));
const todayStr = () => { const d = new Date(); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 10); };
const fmtDate = s => s ? s.split("-").reverse().join("/") : "—";
const fmtDateTime = ts => { const d = new Date(ts); return d.toLocaleDateString("fr-FR") + " " + d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" }); };
const daysUntil = s => Math.round((new Date(s + "T00:00:00") - new Date(todayStr() + "T00:00:00")) / 86400000);
const isMgr = () => ME?.role === "manager";
const digits = s => String(s || "").replace(/\D/g, "");
const monthKey = ts => { const d = new Date(ts); return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0"); };
const toEmail = u => { u = String(u).trim().toLowerCase(); return u.includes("@") ? u : u.replace(/\s+/g, "") + "@" + EMAIL_DOMAIN; };

const ICONS = {
  lock: '<rect width="18" height="11" x="3" y="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>',
  user: '<path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>',
  users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
  eye: '<path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/>',
  chart: '<path d="M3 3v16a2 2 0 0 0 2 2h16"/><path d="M18 17V9"/><path d="M13 17V5"/><path d="M8 17v-3"/>',
  database: '<ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M3 5V19A9 3 0 0 0 21 19V5"/><path d="M3 12A9 3 0 0 0 21 12"/>',
  bag: '<path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z"/><path d="M3 6h18"/><path d="M16 10a4 4 0 0 1-8 0"/>',
  plus: '<path d="M5 12h14"/><path d="M12 5v14"/>',
  calendar: '<rect width="18" height="18" x="3" y="4" rx="2"/><path d="M16 2v4"/><path d="M8 2v4"/><path d="M3 10h18"/>',
  home: '<path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><path d="M9 22V12h6v10"/>',
  search: '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>',
  "arrow-left": '<path d="m12 19-7-7 7-7"/><path d="M19 12H5"/>',
  history: '<path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/><path d="M12 7v5l4 2"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2"/><path d="M12 20v2"/><path d="m4.93 4.93 1.41 1.41"/><path d="m17.66 17.66 1.41 1.41"/><path d="M2 12h2"/><path d="M20 12h2"/><path d="m6.34 17.66-1.41 1.41"/><path d="m19.07 4.93-1.41 1.41"/>',
  moon: '<path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/>',
  logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="m16 17 5-5-5-5"/><path d="M21 12H9"/>',
  mic: '<path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><path d="M12 19v3"/>',
  image: '<rect width="18" height="18" x="3" y="3" rx="2" ry="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/>',
  trash: '<path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>',
  pencil: '<path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/>',
  download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m7 10 5 5 5-5"/><path d="M12 15V3"/>',
  chat: '<path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z"/>',
  dollar: '<path d="M12 2v20"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>',
  trend: '<path d="m22 7-8.5 8.5-5-5L2 17"/><path d="M16 7h6v6"/>',
  menu: '<path d="M4 6h16"/><path d="M4 12h16"/><path d="M4 18h16"/>',
  x: '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
  alert: '<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3"/><path d="M12 9v4"/><path d="M12 17h.01"/>'
};
const icon = (n, s = 20) => `<svg class="ico" width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[n] || ""}</svg>`;
const hydrateIcons = (root = document) => $$("[data-icon]", root).forEach(el => { el.innerHTML = icon(el.dataset.icon, el.dataset.size || 20); });

/* ---------- Thème ---------- */
function applyTheme(t) {
  document.documentElement.dataset.theme = t;
  localStorage.setItem("demsy-theme", t);
  $$("[data-theme-toggle]").forEach(b => {
    b.innerHTML = t === "dark" ? icon("sun", 16) + "<span>Thème Bordeaux &amp; Crème</span>" : icon("moon", 16) + "<span>Thème sombre</span>";
  });
}
const toggleTheme = () => applyTheme(document.documentElement.dataset.theme === "dark" ? "light" : "dark");

/* ---------- Notifications, fenêtres, confirmation ---------- */
function toast(msg, type = "ok") {
  const t = document.createElement("div");
  t.className = "toast t-" + type;
  t.textContent = msg;
  $("#toasts").appendChild(t);
  setTimeout(() => t.classList.add("show"), 10);
  setTimeout(() => { t.classList.remove("show"); setTimeout(() => t.remove(), 300); }, type === "error" ? 5000 : 3200);
}

function openModal(html, { wide = false, onClose } = {}) {
  const el = document.createElement("div");
  el.className = "modal-back";
  el.innerHTML = `<div class="modal ${wide ? "wide" : ""}" role="dialog" aria-modal="true"><button class="modal-x" aria-label="Fermer" type="button">${icon("x")}</button><div class="modal-body">${html}</div></div>`;
  $("#modal-root").appendChild(el);
  const close = () => { el.remove(); if (onClose) onClose(); };
  el.addEventListener("mousedown", e => { if (e.target === el) close(); });
  $(".modal-x", el).onclick = close;
  el._close = close;
  return el;
}
document.addEventListener("keydown", e => {
  if (e.key === "Escape") { const m = $$(".modal-back").pop(); if (m) m._close(); }
});

function confirmBox(message, label = "Confirmer", danger = false) {
  return new Promise(resolve => {
    let done = false;
    const m = openModal(
      `<h3 class="modal-title">Confirmation</h3><p class="modal-text">${esc(message)}</p>
       <div class="modal-actions"><button class="btn btn-ghost" data-no type="button">Annuler</button>
       <button class="btn ${danger ? "btn-danger" : "btn-primary"}" data-yes type="button">${esc(label)}</button></div>`,
      { onClose: () => { if (!done) { done = true; resolve(false); } } });
    $("[data-no]", m).onclick = () => m._close();
    $("[data-yes]", m).onclick = () => { done = true; m.remove(); resolve(true); };
  });
}

function showImage(src) {
  openModal(`<div class="lightbox"><img src="${src}" alt="Image du modèle"></div>`, { wide: true });
}

/* ---------- Journal d'activité ---------- */
async function log(action, detail = "") {
  try { await addDoc(collection(db, "logs"), { at: Date.now(), uid: ME.uid, name: ME.name, action, detail }); }
  catch (e) { console.warn("Journal :", e); }
}

/* ---------- Calculs financiers ---------- */
const paidFor = id => S.payments.filter(p => p.orderId === id).reduce((a, p) => a + p.amount, 0);
const totalFor = id => S.finance[id]?.total ?? 0;
const resteFor = id => totalFor(id) - paidFor(id);

/* ---------- Statuts & échéances ---------- */
const statusClass = s => ({ "Coupe": "st-cut", "Couture": "st-sew", "Finitions": "st-fin", "Prêt pour essayage": "st-ready", "Livré": "st-done" }[s] || "");
function dueBadge(o) {
  if (o.status === "Livré") return "";
  const d = daysUntil(o.dueDate);
  if (d < 0) return `<span class="badge b-danger">Retard ${-d} j</span>`;
  if (d === 0) return `<span class="badge b-warn">Aujourd'hui</span>`;
  if (d <= 3) return `<span class="badge b-warn">Dans ${d} j</span>`;
  return "";
}
const sortedOrders = () => [...S.orders].sort((a, b) => {
  const da = a.status === "Livré", dbb = b.status === "Livré";
  if (da !== dbb) return da ? 1 : -1;
  return da ? b.dueDate.localeCompare(a.dueDate) : a.dueDate.localeCompare(b.dueDate);
});

/* ---------- WhatsApp ---------- */
function waLink(phone, text) {
  let n = digits(phone);
  if (n.startsWith("00")) n = n.slice(2);
  if (n.length === 10 && n.startsWith("0")) n = "225" + n;   // numéros ivoiriens à 10 chiffres
  return `https://wa.me/${n}?text=${encodeURIComponent(text)}`;
}
const WA_SIGN = "DEMSY COUTURE. Merci et à bientôt !";
function orderMessage(o) {
  const n = o.clientName, num = o.number;
  if (o.status === "Prêt pour essayage") return `Bonjour ${n}, votre commande ${num} est prête pour l'essayage. Merci de passer à l'atelier.\n${WA_SIGN}`;
  if (o.status === "Livré") return `Bonjour ${n}, merci pour votre confiance ! Votre commande ${num} a bien été livrée.\n${WA_SIGN}`;
  return `Bonjour ${n}, votre commande ${num} est en cours de confection (étape : ${o.status}). Livraison prévue le ${fmtDate(o.dueDate)}.\n${WA_SIGN}`;
}
const openWhatsApp = (phone, text) => window.open(waLink(phone, text), "_blank", "noopener");

/* ---------- Export Excel (CSV) ---------- */
function downloadCSV(filename, rows) {
  const csv = "\ufeff" + rows.map(r => r.map(v => `"${String(v ?? "").replace(/"/g, '""')}"`).join(";")).join("\r\n");
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1500);
}
function exportClients() {
  const head = ["Nom", "Téléphone", ...TOP.map(m => m[1]), ...BOTTOM.map(m => m[1]), "Créé le"];
  const rows = S.clients.map(c => [c.name, c.phone, ...TOP.map(m => c.measures?.[m[0]] ?? ""), ...BOTTOM.map(m => c.measures?.[m[0]] ?? ""),
    c.createdAt ? new Date(c.createdAt).toLocaleDateString("fr-FR") : ""]);
  downloadCSV(`clients-demsy-${todayStr()}.csv`, [head, ...rows]);
  log("Export clients", `${rows.length} clients`);
}
function exportOrders() {
  const head = ["N° commande", "Client", "Téléphone", "État", "Date prévue", "Couturier", "Prix total (CFA)", "Encaissé (CFA)", "Reste (CFA)", "Créée le", "Détails"];
  const rows = sortedOrders().map(o => [o.number, o.clientName, o.clientPhone, o.status, fmtDate(o.dueDate), o.assignedName || "",
    totalFor(o.id), paidFor(o.id), resteFor(o.id), new Date(o.createdAt).toLocaleDateString("fr-FR"), o.details || ""]);
  downloadCSV(`commandes-demsy-${todayStr()}.csv`, [head, ...rows]);
  log("Export commandes", `${rows.length} commandes`);
}

/* ---------- Images : compression avant stockage ---------- */
function compressImage(file, max = 900, quality = 0.65) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const r = Math.min(1, max / Math.max(img.width, img.height));
      const c = document.createElement("canvas");
      c.width = Math.round(img.width * r); c.height = Math.round(img.height * r);
      c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      let q = quality, out = c.toDataURL("image/jpeg", q);
      while (out.length > 200000 && q > 0.3) { q -= 0.1; out = c.toDataURL("image/jpeg", q); }
      resolve(out);
    };
    img.onerror = () => reject(new Error("Image illisible"));
    img.src = url;
  });
}

/* ============================================================
   AUTHENTIFICATION
   ============================================================ */
function authMessage(e) {
  const c = e.code || "";
  if (["auth/invalid-credential", "auth/wrong-password", "auth/user-not-found", "auth/invalid-email"].includes(c)) return "Identifiant ou mot de passe incorrect. Réessayez.";
  if (c === "auth/too-many-requests") return "Trop de tentatives. Patientez quelques minutes puis réessayez.";
  if (c === "auth/network-request-failed") return "Pas de connexion internet.";
  if (c === "auth/user-disabled") return "Ce compte a été désactivé.";
  return "Connexion impossible (" + (c || e.message) + ").";
}
function showLogin() {
  $("#loader").classList.add("hidden");
  $("#app").classList.add("hidden");
  $("#login-screen").classList.remove("hidden");
  $("#login-pass").value = "";
  const err = $("#login-error");
  if (pendingLoginMsg) { err.textContent = pendingLoginMsg; err.classList.remove("hidden"); pendingLoginMsg = ""; }
  else err.classList.add("hidden");
  location.hash = "";
}

onAuthStateChanged(auth, async user => {
  if (!user) { stopListeners(); ME = null; showLogin(); return; }
  try {
    const snap = await getDoc(doc(db, "users", user.uid));
    if (!snap.exists() || snap.data().active !== true) {
      pendingLoginMsg = "Ce compte n'est pas autorisé ou a été désactivé. Contactez le responsable.";
      await signOut(auth); return;
    }
    ME = { uid: user.uid, ...snap.data() };
    startApp();
  } catch (e) {
    console.error(e);
    pendingLoginMsg = "Impossible de vérifier votre compte (" + (e.code || e.message) + ").";
    await signOut(auth);
  }
});

$("#login-form").addEventListener("submit", async e => {
  e.preventDefault();
  const btn = $("#login-btn");
  $("#login-error").classList.add("hidden");
  btn.disabled = true; btn.textContent = "VÉRIFICATION…";
  try {
    await signInWithEmailAndPassword(auth, toEmail($("#login-user").value), $("#login-pass").value);
  } catch (err) {
    const box = $("#login-error");
    box.textContent = authMessage(err); box.classList.remove("hidden");
    $("#login-pass").value = ""; $("#login-pass").focus();
  } finally {
    btn.disabled = false; btn.textContent = "S'AUTHENTIFIER";
  }
});
$("#toggle-pass").onclick = () => { const i = $("#login-pass"); i.type = i.type === "password" ? "text" : "password"; };

/* Déconnexion automatique après 30 minutes d'inactivité */
let idleTimer;
const resetIdle = () => {
  clearTimeout(idleTimer);
  if (ME) idleTimer = setTimeout(() => { pendingLoginMsg = "Session fermée après 30 minutes d'inactivité."; signOut(auth); }, 30 * 60 * 1000);
};
["click", "keydown", "mousemove", "touchstart"].forEach(ev => document.addEventListener(ev, resetIdle, { passive: true }));

/* ============================================================
   DÉMARRAGE DE L'APPLICATION
   ============================================================ */
function startApp() {
  $("#loader").classList.add("hidden");
  $("#login-screen").classList.add("hidden");
  $("#app").classList.remove("hidden");
  buildSidebar();
  listen();
  resetIdle();
  if (!location.hash || location.hash === "#") location.hash = "#/dashboard";
  route();
}

function buildSidebar() {
  const items = [
    ["dashboard", "home", "Tableau de bord"], ["finances", "chart", "Rapports & Finances", true],
    ["clients", "database", "Base de Données"], ["orders", "bag", "Commandes"],
    ["new-order", "plus", "Nouvelle Commande"], ["appointments", "calendar", "Rendez-vous"],
    ["team", "users", "Équipe & Accès", true], ["logs", "history", "Journal d'activité", true]
  ];
  $("#nav").innerHTML = items.filter(i => !i[3] || isMgr())
    .map(([k, ic, l]) => `<a class="nav-item" href="#/${k}" data-nav="${k}">${icon(ic)}<span>${l}</span></a>`).join("");
  $("#avatar").textContent = ME.name.split(/\s+/).slice(0, 2).map(w => w[0]).join("").toUpperCase();
  $("#p-name").textContent = ME.name.toUpperCase();
  $("#p-role").textContent = isMgr() ? "RESPONSABLE ATELIER" : "PERSONNEL ATELIER";
  $("#logout-btn").innerHTML = icon("logout", 16) + "<span>Déconnexion</span>";
  applyTheme(document.documentElement.dataset.theme);
}

/* Écoute temps réel de la base */
function stopListeners() { unsubs.forEach(u => u()); unsubs = []; S.users = []; S.clients = []; S.orders = []; S.rdv = []; S.finance = {}; S.payments = []; S.logs = []; S.ordersReady = false; }
let raf;
function refreshUI() {
  cancelAnimationFrame(raf);
  raf = requestAnimationFrame(() => { current?.update?.(); drawDetail(); });
}
function sub(q, handler) {
  unsubs.push(onSnapshot(q, snap => { handler(snap); refreshUI(); }, err => {
    console.error(err);
    if (err.code === "permission-denied") { toast("Accès refusé : votre compte n'a pas (ou plus) les droits nécessaires.", "error"); signOut(auth); }
  }));
}
const docsOf = s => s.docs.map(d => ({ id: d.id, ...d.data() }));
function listen() {
  stopListeners();
  sub(collection(db, "users"), s => S.users = docsOf(s));
  sub(collection(db, "clients"), s => S.clients = docsOf(s));
  sub(collection(db, "orders"), s => { S.orders = docsOf(s); S.ordersReady = true; });
  sub(collection(db, "rdv"), s => S.rdv = docsOf(s));
  if (isMgr()) {
    sub(collection(db, "finance"), s => { S.finance = {}; s.docs.forEach(d => S.finance[d.id] = d.data()); });
    sub(collection(db, "payments"), s => S.payments = docsOf(s));
    sub(query(collection(db, "logs"), orderBy("at", "desc"), limit(300)), s => S.logs = docsOf(s));
  }
}

/* ---------- Navigation ---------- */
const routes = () => ({
  dashboard: viewDashboard, finances: viewFinances, clients: viewClients, orders: viewOrders,
  "new-order": viewOrderForm, appointments: viewAppointments, team: viewTeam, logs: viewLogs
});
function route() {
  if (!ME) return;
  const [name, arg] = location.hash.replace(/^#\/?/, "").split("/");
  let key = routes()[name] ? name : "dashboard";
  if (["finances", "team", "logs"].includes(key) && !isMgr()) { location.hash = "#/dashboard"; return; }
  closeSidebar();
  $$("[data-nav]").forEach(a => a.classList.toggle("active", a.dataset.nav === (key === "new-order" && arg?.startsWith("edit-") ? "orders" : key)));
  const view = $("#view");
  view.innerHTML = "";
  current = routes()[key](arg) || null;
  $$("[data-go]", view).forEach(b => b.onclick = () => { location.hash = "#/" + b.dataset.go; });
  const backEl = $("#go-back", view);
  if (backEl) backEl.onclick = goBack;
  window.scrollTo(0, 0);
}
/* Historique de navigation, pour que le bouton RETOUR revienne à la page précédente */
let navStack = [];
let curHash = location.hash || "#/dashboard";
function onHashChange() {
  const h = location.hash;
  if (h !== curHash) { navStack.push(curHash); curHash = h; }
  route();
}
function goBack() {
  const prev = navStack.pop();
  if (prev && prev !== location.hash) location.hash = prev;
  else location.hash = "#/dashboard";
}
window.addEventListener("hashchange", onHashChange);

const backBtn = () => `<button class="btn btn-ghost btn-sm back" id="go-back" type="button">${icon("arrow-left", 16)} RETOUR</button>`;
const loadingHtml = `<div class="empty">Chargement…</div>`;

/* Menu mobile */
const closeSidebar = () => { $("#sidebar").classList.remove("open"); $("#side-backdrop").classList.remove("show"); };
$("#menu-btn").onclick = () => { $("#sidebar").classList.add("open"); $("#side-backdrop").classList.add("show"); };
$("#side-backdrop").onclick = closeSidebar;
$("#logout-btn").onclick = () => signOut(auth);
$("#profile-card").onclick = openAccount;
document.addEventListener("click", e => { if (e.target.closest("[data-theme-toggle]")) toggleTheme(); });
hydrateIcons();
applyTheme(localStorage.getItem("demsy-theme") || "dark");

/* ---------- Mon compte (changer son mot de passe) ---------- */
function openAccount() {
  const m = openModal(`
    <h3 class="modal-title">Mon compte</h3>
    <p class="modal-text"><b>${esc(ME.name)}</b> — identifiant : ${esc(ME.username || ME.email)}<br>Rôle : ${isMgr() ? "Responsable" : "Personnel"}</p>
    <form id="pw-form" class="stack">
      <div class="field"><label>Mot de passe actuel</label><input id="pw-cur" type="password" autocomplete="current-password" required></div>
      <div class="field"><label>Nouveau mot de passe (6 caractères minimum)</label><input id="pw-new" type="password" autocomplete="new-password" minlength="6" required></div>
      <div class="field"><label>Confirmer le nouveau mot de passe</label><input id="pw-new2" type="password" autocomplete="new-password" minlength="6" required></div>
      <div class="modal-actions"><button class="btn btn-primary" type="submit">Changer le mot de passe</button></div>
    </form>`);
  $("#pw-form", m).onsubmit = async e => {
    e.preventDefault();
    const cur = $("#pw-cur", m).value, n1 = $("#pw-new", m).value, n2 = $("#pw-new2", m).value;
    if (n1 !== n2) return toast("Les deux nouveaux mots de passe sont différents.", "error");
    try {
      const user = auth.currentUser;
      await reauthenticateWithCredential(user, EmailAuthProvider.credential(user.email, cur));
      await updatePassword(user, n1);
      log("Mot de passe modifié", ME.name);
      toast("Mot de passe modifié."); m._close();
    } catch (err) {
      toast(["auth/invalid-credential", "auth/wrong-password"].includes(err.code) ? "Mot de passe actuel incorrect." : "Échec : " + (err.code || err.message), "error");
    }
  };
}

/* ============================================================
   VUE : TABLEAU DE BORD
   ============================================================ */
function viewDashboard() {
  const mgr = isMgr();
  const card = (ic, title, desc, go) => `<article class="card dash-card"><div class="ico-box">${icon(ic, 22)}</div><h3>${title}</h3><p>${desc}</p>
    <button class="btn btn-ghost btn-block" data-go="${go}" type="button">Accéder au module</button></article>`;
  $("#view").innerHTML = `
    <h1 class="page-title">Tableau de bord Demsy Couture</h1>
    <p class="page-sub">Gérez vos clients, suivez la confection en atelier et analysez vos performances financières.</p>
    <div class="cards">
      ${mgr ? card("chart", "FINANCES & RAPPORTS", "Chiffre d'affaires et suivi des encaissements", "finances")
            : card("plus", "NOUVELLE COMMANDE", "Prise de mesures et enregistrement d'une commande", "new-order")}
      ${card("database", "BASE DE DONNÉES", "Répertoire clients et mensurations détaillées", "clients")}
      ${card("bag", "LES COMMANDES", "Suivi des étapes d'atelier et statuts de livraison", "orders")}
      ${card("calendar", "RENDEZ-VOUS", "Planning des essayages et permanences", "appointments")}
      ${mgr ? card("users", "ÉQUIPE & ACCÈS", "Comptes du personnel et droits d'accès", "team") + card("history", "JOURNAL D'ACTIVITÉ", "Qui a fait quoi, et quand", "logs") : ""}
    </div>
    <div class="two-col" id="dash-panels"></div>`;

  const update = () => {
    const today = todayStr();
    const rdvs = S.rdv.filter(r => r.date === today && r.status === "Prévu").sort((a, b) => a.time.localeCompare(b.time));
    const alerts = S.orders.filter(o => o.status !== "Livré").map(o => ({ o, d: daysUntil(o.dueDate) })).filter(x => x.d <= 3).sort((a, b) => a.d - b.d);
    $("#dash-panels").innerHTML = `
      <section class="card"><h3 class="panel-title">Rendez-vous du jour (${rdvs.length})</h3>
        ${rdvs.length ? rdvs.map(r => `<div class="row-item"><div class="r-main"><b>${esc(r.time)} — ${esc(r.clientName)}</b><span>${esc(r.object)}</span></div></div>`).join("")
          : `<div class="empty">Aucun rendez-vous prévu aujourd'hui.</div>`}
      </section>
      <section class="card"><h3 class="panel-title">Commandes à surveiller (${alerts.length})</h3>
        ${alerts.length ? alerts.map(({ o, d }) => `<button class="row-item alert-line ${d < 0 ? "late" : ""}" data-open="${o.id}" type="button">
            <div class="r-main"><b>${esc(o.clientName)}</b><span>${esc(o.number)} · ${esc(o.status)} · ${fmtDate(o.dueDate)}</span></div>${dueBadge(o)}</button>`).join("")
          : `<div class="empty">Aucune commande en retard ou à livrer sous 3 jours.</div>`}
      </section>`;
    $$("[data-open]", $("#dash-panels")).forEach(b => b.onclick = () => openOrderDetails(b.dataset.open));
  };
  update();
  return { update };
}

/* ============================================================
   VUE : FINANCES & RAPPORTS (responsable)
   ============================================================ */
function viewFinances() {
  $("#view").innerHTML = `
    ${backBtn()}
    <div class="page-head"><div><h1 class="page-title">Rapports financiers &amp; Performance de l'Atelier</h1>
      <p class="page-sub">Vue d'ensemble consolidée des flux financiers et de l'activité.</p></div>
      <div class="head-actions"><button class="btn btn-ghost btn-sm" id="exp-orders" type="button">${icon("download", 16)} Exporter les commandes</button>
      <button class="btn btn-ghost btn-sm" id="exp-clients" type="button">${icon("download", 16)} Exporter les clients</button></div></div>
    <div id="fin-body"></div>`;
  $("#exp-orders").onclick = exportOrders;
  $("#exp-clients").onclick = exportClients;

  const update = () => {
    const ids = new Set(S.orders.map(o => o.id));
    const ca = S.orders.reduce((a, o) => a + totalFor(o.id), 0);
    const enc = S.payments.filter(p => ids.has(p.orderId)).reduce((a, p) => a + p.amount, 0);
    const reste = ca - enc;
    const cnt = {
      cours: S.orders.filter(o => ACTIVE_STATUSES.includes(o.status)).length,
      pret: S.orders.filter(o => o.status === "Prêt pour essayage").length,
      livre: S.orders.filter(o => o.status === "Livré").length,
      retard: S.orders.filter(o => o.status !== "Livré" && daysUntil(o.dueDate) < 0).length
    };
    // Statistiques mensuelles (6 derniers mois)
    const months = [];
    const base = new Date(); base.setDate(1);
    for (let i = 5; i >= 0; i--) { const x = new Date(base.getFullYear(), base.getMonth() - i, 1); months.push({ key: x.getFullYear() + "-" + String(x.getMonth() + 1).padStart(2, "0"), label: MONTHS[x.getMonth()] }); }
    const caM = {}, encM = {};
    S.orders.forEach(o => { const f = S.finance[o.id]; if (f) { const k = monthKey(o.createdAt); caM[k] = (caM[k] || 0) + f.total; } });
    S.payments.forEach(p => { const k = monthKey(p.at); encM[k] = (encM[k] || 0) + p.amount; });
    const max = Math.max(1, ...months.map(m => Math.max(caM[m.key] || 0, encM[m.key] || 0)));
    // Meilleurs clients
    const byClient = {};
    S.orders.forEach(o => { const k = o.clientId || o.clientName; byClient[k] = byClient[k] || { name: o.clientName, total: 0, n: 0 }; byClient[k].total += totalFor(o.id); byClient[k].n++; });
    const top = Object.values(byClient).sort((a, b) => b.total - a.total).slice(0, 5);

    $("#fin-body").innerHTML = `
      <div class="kpis">
        <div class="card"><div class="kpi-top">Chiffre d'affaires total<span class="kpi-ico kpi-ico-text" style="color:var(--gold)">CFA</span></div><div class="kpi-val">${fmt(ca)}<small>CFA</small></div></div>
        <div class="card"><div class="kpi-top">Total encaissé (avances)<span class="kpi-ico" style="color:var(--ok)">${icon("trend")}</span></div><div class="kpi-val">${fmt(enc)}<small>CFA</small></div></div>
        <div class="card"><div class="kpi-top">Restes à percevoir<span class="kpi-ico" style="color:var(--warn)">${icon("bag")}</span></div><div class="kpi-val">${fmt(reste)}<small>CFA</small></div></div>
      </div>
      <div class="two-col" style="margin-top:0">
        <section class="card"><h3 class="panel-title">État global des commandes</h3>
          <div class="stat-row"><span>Commandes en cours de confection</span><span class="count c-warn">${cnt.cours}</span></div>
          <div class="stat-row"><span>Commandes prêtes pour essayage / livraison</span><span class="count c-ok">${cnt.pret}</span></div>
          <div class="stat-row"><span>Commandes livrées</span><span class="count">${cnt.livre}</span></div>
          <div class="stat-row"><span>Commandes en retard</span><span class="count ${cnt.retard ? "c-danger" : ""}">${cnt.retard}</span></div>
          <div class="stat-row"><span>Nombre total de clients enregistrés</span><span class="count" style="color:var(--info)">${S.clients.length}</span></div>
        </section>
        <section class="card"><h3 class="panel-title">Activité récente &amp; productivité</h3>
          ${S.logs.slice(0, 6).map(l => `<div class="row-item"><div class="r-main"><b>${esc(l.action)}</b><span>${esc(l.name)} — ${esc(l.detail)}</span></div><span class="muted" style="font-size:12px">${fmtDateTime(l.at)}</span></div>`).join("") || `<div class="empty">Aucune activité pour le moment.</div>`}
          <div class="sync-box"><b>Responsable d'atelier : ${esc(ME.name)}</b>Synchronisation cloud Firebase temps réel active</div>
        </section>
      </div>
      <div class="two-col">
        <section class="card"><h3 class="panel-title">Revenus des 6 derniers mois</h3>
          <div class="chart">${months.map(m => `<div class="bar-group"><div class="bars">
            <div class="bar b-ca" style="height:${(caM[m.key] || 0) / max * 100}%" title="Commandes : ${fmt(caM[m.key] || 0)} CFA"></div>
            <div class="bar b-enc" style="height:${(encM[m.key] || 0) / max * 100}%" title="Encaissé : ${fmt(encM[m.key] || 0)} CFA"></div></div>
            <span class="bar-label">${m.label}</span><span class="bar-val">${fmtK(encM[m.key] || 0)}</span></div>`).join("")}</div>
          <div class="legend"><span><i style="background:var(--gold)"></i>Valeur des commandes</span><span><i style="background:var(--ok)"></i>Encaissé</span></div>
        </section>
        <section class="card"><h3 class="panel-title">Meilleurs clients</h3>
          ${top.length ? top.map((c, i) => `<div class="row-item"><div class="r-main"><b>${i + 1}. ${esc(c.name)}</b><span>${c.n} commande${c.n > 1 ? "s" : ""}</span></div><b>${fmt(c.total)} CFA</b></div>`).join("") : `<div class="empty">Pas encore de données.</div>`}
        </section>
      </div>`;
  };
  update();
  return { update };
}

/* ============================================================
   COMMANDES : actions communes (statut, versements, suppression)
   ============================================================ */
async function changeStatus(id, status) {
  const o = S.orders.find(x => x.id === id);
  if (!o || o.status === status) return false;
  if (status === "Livré" && isMgr()) {
    const r = resteFor(id);
    if (r > 0 && !(await confirmBox(`Il reste ${fmt(r)} CFA à payer sur la commande ${o.number}. La marquer comme livrée quand même ?`, "Marquer livrée"))) return false;
  }
  try {
    await updateDoc(doc(db, "orders", id), { status, updatedAt: Date.now() });
    log("Statut modifié", `${o.number} (${o.clientName}) : ${o.status} → ${status}`);
    toast("Statut mis à jour : " + status);
    return true;
  } catch (e) { toast("Erreur : " + (e.code || e.message), "error"); return false; }
}

async function addPayment(orderId, amount, note) {
  const o = S.orders.find(x => x.id === orderId);
  if (!(amount > 0)) return toast("Indiquez un montant supérieur à 0.", "error");
  if (isMgr()) {
    const r = resteFor(orderId);
    if (amount > r && !(await confirmBox(`Ce versement (${fmt(amount)} CFA) dépasse le reste à payer (${fmt(r)} CFA). L'enregistrer quand même ?`, "Enregistrer"))) return;
  }
  try {
    await addDoc(collection(db, "payments"), { orderId, amount, at: Date.now(), by: ME.uid, byName: ME.name, note: note || "" });
    log("Versement enregistré", `${o.number} (${o.clientName}) : ${fmt(amount)} CFA`);
    toast("Versement enregistré.");
  } catch (e) { toast("Erreur : " + (e.code || e.message), "error"); }
}

async function deletePayment(p) {
  const o = S.orders.find(x => x.id === p.orderId);
  if (!(await confirmBox(`Supprimer le versement de ${fmt(p.amount)} CFA ?`, "Supprimer", true))) return;
  await deleteDoc(doc(db, "payments", p.id));
  log("Versement supprimé", `${o?.number || ""} : ${fmt(p.amount)} CFA`);
  toast("Versement supprimé.");
}

async function deleteOrder(id) {
  const o = S.orders.find(x => x.id === id);
  if (!o) return;
  if (!(await confirmBox(`Supprimer définitivement la commande ${o.number} de ${o.clientName} (avec ses versements et images) ?`, "Supprimer", true))) return;
  try {
    const b = writeBatch(db);
    b.delete(doc(db, "orders", id));
    b.delete(doc(db, "finance", id));
    b.delete(doc(db, "orderImages", id));
    S.payments.filter(p => p.orderId === id).forEach(p => b.delete(doc(db, "payments", p.id)));
    if (o.rdvId) b.delete(doc(db, "rdv", o.rdvId));
    await b.commit();
    log("Commande supprimée", `${o.number} (${o.clientName})`);
    toast("Commande supprimée.");
    if (detailEl) detailEl._close();
  } catch (e) { toast("Erreur : " + (e.code || e.message), "error"); }
}

/* ---------- Fenêtre « détails d'une commande » ---------- */
async function openOrderDetails(id) {
  if (detailEl) detailEl._close();
  detailId = id;
  detailEl = openModal(`<div id="detail-body">${loadingHtml}</div>`, { wide: true, onClose: () => { detailId = null; detailEl = null; } });
  drawDetail();
  if (!imgCache[id]) {
    try { const s = await getDoc(doc(db, "orderImages", id)); imgCache[id] = s.exists() ? (s.data().images || []) : []; }
    catch { imgCache[id] = []; }
    drawDetail();
  }
}

function drawDetail() {
  if (!detailId || !detailEl) return;
  const o = S.orders.find(x => x.id === detailId);
  if (!o) { detailEl._close(); return; }
  const body = $("#detail-body", detailEl);
  const m = o.measures || {};
  const meas = list => list.map(([k, l]) => `<div><span>${l}</span><b>${m[k] !== undefined ? m[k] + " cm" : "—"}</b></div>`).join("");
  const imgs = imgCache[o.id] || [];
  const mgr = isMgr();
  const pays = S.payments.filter(p => p.orderId === o.id).sort((a, b) => b.at - a.at);
  const keepAmount = $("#pay-amount", body)?.value || "", keepNote = $("#pay-note", body)?.value || "";

  body.innerHTML = `
    <h3 class="modal-title">${esc(o.number)} — ${esc(o.clientName)}</h3>
    <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center">
      <select id="d-status" class="status-select ${statusClass(o.status)}">${STATUSES.map(s => `<option ${s === o.status ? "selected" : ""}>${s}</option>`).join("")}</select>
      ${dueBadge(o)}
    </div>
    <div class="info-grid">
      <div><small>Téléphone</small>${esc(o.clientPhone)}</div>
      <div><small>Date prévue</small>${fmtDate(o.dueDate)}</div>
      <div><small>Couturier</small>${esc(o.assignedName || "Non assigné")}</div>
      <div><small>Créée par</small>${esc(o.createdByName || "—")} le ${new Date(o.createdAt).toLocaleDateString("fr-FR")}</div>
    </div>
    <div class="detail-actions">
      <button class="btn btn-ghost btn-sm" id="d-edit" type="button">${icon("pencil", 15)} Modifier</button>
      <button class="btn btn-ghost btn-sm" id="d-wa" type="button">${icon("chat", 15)} WhatsApp</button>
      ${mgr ? `<button class="btn btn-ghost btn-sm" id="d-del" type="button" style="color:var(--danger)">${icon("trash", 15)} Supprimer</button>` : ""}
    </div>
    <div class="mini-title">Description de la commande</div>
    <div class="pre">${o.details ? esc(o.details) : '<span class="muted">Aucune description.</span>'}</div>
    ${imgs.length ? `<div class="mini-title">Images de modèles</div><div class="d-images">${imgs.map(s => `<div class="thumb"><img src="${s}" alt="Modèle" data-zoom></div>`).join("")}</div>` : ""}
    <div class="mini-title">Mesures</div>
    <div class="grid-2"><div><div class="field-label">Haut</div><div class="meas-grid">${meas(TOP)}</div></div><div><div class="field-label">Bas</div><div class="meas-grid">${meas(BOTTOM)}</div></div></div>
    <div class="mini-title">${mgr ? "Finances & versements" : "Enregistrer un versement reçu"}</div>
    ${mgr ? `<div class="info-grid">
        <div><small>Prix total</small><b>${fmt(totalFor(o.id))} CFA</b></div>
        <div><small>Encaissé</small><b class="c-ok">${fmt(paidFor(o.id))} CFA</b></div>
        <div><small>Reste à payer</small><b class="${resteFor(o.id) > 0 ? "c-warn" : "c-ok"}">${fmt(resteFor(o.id))} CFA</b></div></div>
      ${pays.length ? `<div class="table-wrap"><table style="min-width:0"><thead><tr><th>Date</th><th>Montant</th><th>Note</th><th>Par</th><th></th></tr></thead><tbody>
        ${pays.map(p => `<tr><td>${fmtDateTime(p.at)}</td><td><b>${fmt(p.amount)} CFA</b></td><td>${esc(p.note)}</td><td>${esc(p.byName)}</td>
          <td><button class="icon-sq danger" data-delpay="${p.id}" title="Supprimer" type="button">${icon("trash", 15)}</button></td></tr>`).join("")}</tbody></table></div>`
        : `<div class="empty">Aucun versement enregistré.</div>`}` : ""}
    <form id="pay-form" class="pay-form">
      <div class="field"><label>Montant (CFA)</label><input id="pay-amount" type="number" min="1" step="1" value="${esc(keepAmount)}" required></div>
      <div class="field"><label>Note (facultatif)</label><input id="pay-note" type="text" placeholder="Ex : solde, avance 2" value="${esc(keepNote)}"></div>
      <button class="btn btn-primary" type="submit">Ajouter</button>
    </form>`;

  $("#d-status", body).onchange = async e => { const ok = await changeStatus(o.id, e.target.value); if (!ok) drawDetail(); };
  $("#d-edit", body).onclick = () => { detailEl._close(); location.hash = "#/new-order/edit-" + o.id; };
  $("#d-wa", body).onclick = () => openWhatsApp(o.clientPhone, orderMessage(o));
  if (mgr) $("#d-del", body).onclick = () => deleteOrder(o.id);
  $$("[data-zoom]", body).forEach(i => i.onclick = () => showImage(i.src));
  $$("[data-delpay]", body).forEach(b => b.onclick = () => deletePayment(pays.find(p => p.id === b.dataset.delpay)));
  $("#pay-form", body).onsubmit = async e => {
    e.preventDefault();
    await addPayment(o.id, Number($("#pay-amount", body).value), $("#pay-note", body).value.trim());
    $("#pay-amount", body).value = ""; $("#pay-note", body).value = "";
  };
}

/* ============================================================
   VUE : LISTE DES COMMANDES
   ============================================================ */
let orderQuery = "", orderFilter = "";
function viewOrders() {
  const mgr = isMgr();
  $("#view").innerHTML = `
    ${backBtn()}
    <div class="page-head"><div><h1 class="page-title">Liste des Commandes &amp; États</h1>
      <p class="page-sub">Suivi des confections triées par date d'échéance.</p></div>
      <div class="head-actions">${mgr ? `<button class="btn btn-ghost btn-sm" id="o-exp" type="button">${icon("download", 16)} Exporter (Excel)</button>` : ""}
      <button class="btn btn-primary btn-sm" data-go="new-order" type="button">${icon("plus", 16)} Nouvelle commande</button></div></div>
    <div class="toolbar">
      <div class="search"><span>${icon("search")}</span><input id="o-search" type="search" placeholder="Rechercher par client, téléphone ou n° de commande..." value="${esc(orderQuery)}"></div>
      <select id="o-filter"><option value="">Tous les états</option><option value="__late">En retard</option>${STATUSES.map(s => `<option ${orderFilter === s ? "selected" : ""}>${s}</option>`).join("")}</select>
    </div>
    <div class="table-wrap"><table><thead><tr><th>Client</th><th>Date prévue</th>${mgr ? "<th>Finance (reste)</th>" : ""}<th>État</th><th>Actions</th></tr></thead><tbody id="o-body"></tbody></table></div>`;
  $("#o-filter").value = orderFilter;
  $("#o-search").oninput = e => { orderQuery = e.target.value; update(); };
  $("#o-filter").onchange = e => { orderFilter = e.target.value; update(); };
  if (mgr) $("#o-exp").onclick = exportOrders;

  const update = () => {
    const q = orderQuery.trim().toLowerCase(), qd = digits(orderQuery);
    const list = sortedOrders().filter(o => {
      if (orderFilter === "__late" && !(o.status !== "Livré" && daysUntil(o.dueDate) < 0)) return false;
      if (orderFilter && orderFilter !== "__late" && o.status !== orderFilter) return false;
      if (!q) return true;
      return o.clientName.toLowerCase().includes(q) || o.number.toLowerCase().includes(q) || (qd && digits(o.clientPhone).includes(qd));
    });
    const cols = mgr ? 5 : 4;
    $("#o-body").innerHTML = list.length ? list.map(o => {
      const r = mgr ? resteFor(o.id) : 0;
      return `<tr data-id="${o.id}">
        <td><div class="cell-main"><b>${esc(o.clientName)}</b><span>${esc(o.number)}${o.assignedName ? " · " + esc(o.assignedName) : ""}</span></div></td>
        <td>${fmtDate(o.dueDate)} ${dueBadge(o)}</td>
        ${mgr ? `<td class="${r > 0 ? "c-warn" : "c-ok"}">${fmt(r)} CFA</td>` : ""}
        <td><select class="status-select ${statusClass(o.status)}" data-status>${STATUSES.map(s => `<option ${s === o.status ? "selected" : ""}>${s}</option>`).join("")}</select></td>
        <td><div class="actions">
          <button class="icon-sq" data-act="view" title="Voir les détails" type="button">${icon("eye", 16)}</button>
          <button class="icon-sq" data-act="edit" title="Modifier" type="button">${icon("pencil", 16)}</button>
          <button class="icon-sq" data-act="wa" title="Écrire au client sur WhatsApp" type="button">${icon("chat", 16)}</button>
          ${mgr ? `<button class="icon-sq danger" data-act="del" title="Supprimer" type="button">${icon("trash", 16)}</button>` : ""}
        </div></td></tr>`;
    }).join("") : `<tr><td colspan="${cols}"><div class="empty">${S.orders.length ? "Aucune commande ne correspond à la recherche." : "Aucune commande enregistrée pour le moment."}</div></td></tr>`;
  };
  $("#o-body").addEventListener("click", e => {
    const btn = e.target.closest("[data-act]"); if (!btn) return;
    const id = btn.closest("tr").dataset.id, o = S.orders.find(x => x.id === id);
    ({ view: () => openOrderDetails(id), edit: () => { location.hash = "#/new-order/edit-" + id; }, wa: () => openWhatsApp(o.clientPhone, orderMessage(o)), del: () => deleteOrder(id) })[btn.dataset.act]();
  });
  $("#o-body").addEventListener("change", async e => {
    if (!e.target.matches("[data-status]")) return;
    const ok = await changeStatus(e.target.closest("tr").dataset.id, e.target.value);
    if (!ok) update();
  });
  update();
  return { update };
}

/* ============================================================
   VUE : BASE DE DONNÉES CLIENTS
   ============================================================ */
let selClient = null, clientQuery = "";
function viewClients() {
  const mgr = isMgr();
  $("#view").innerHTML = `
    ${backBtn()}
    <div class="split"><div>
      <div class="page-head"><div><h1 class="page-title">Base de Données Clients</h1>
        <p class="page-sub">Répertoire unifié des fiches clients et mensurations.</p></div>
        ${mgr ? `<button class="btn btn-ghost btn-sm" id="c-exp" type="button">${icon("download", 16)} Exporter (Excel)</button>` : ""}</div>
      <div class="search"><span>${icon("search")}</span><input id="c-search" type="search" placeholder="Rechercher par nom ou numéro de téléphone..." value="${esc(clientQuery)}"></div>
      <div id="c-list"></div></div>
      <aside id="c-detail" class="detail-panel"></aside></div>`;
  $("#c-search").oninput = e => { clientQuery = e.target.value; update(); };
  if (mgr) $("#c-exp").onclick = exportClients;

  const update = () => {
    const q = clientQuery.trim().toLowerCase(), qd = digits(clientQuery);
    const list = S.clients.filter(c => !q || c.name.toLowerCase().includes(q) || (qd && digits(c.phone).includes(qd)))
      .sort((a, b) => a.name.localeCompare(b.name, "fr"));
    $("#c-list").innerHTML = list.length ? list.map(c => {
      const n = S.orders.filter(o => o.clientId === c.id).length;
      return `<button class="row-item list-item ${c.id === selClient ? "sel" : ""}" data-cid="${c.id}" type="button">
        <div class="r-main"><b>${esc(c.name)}</b><span>${esc(c.phone)}</span></div><span class="badge">${n} commande${n > 1 ? "s" : ""}</span></button>`;
    }).join("") : `<div class="empty">Aucun client trouvé.</div>`;
    $$("[data-cid]", $("#c-list")).forEach(b => b.onclick = () => { selClient = b.dataset.cid; update(); if (innerWidth < 1000) $("#c-detail").scrollIntoView({ behavior: "smooth" }); });
    drawClient();
  };

  const drawClient = () => {
    const box = $("#c-detail");
    const c = S.clients.find(x => x.id === selClient);
    if (!c) { box.innerHTML = `<div class="detail-empty">Sélectionnez un client dans la liste pour consulter ses mensurations détaillées.</div>`; return; }
    const m = c.measures || {};
    const meas = list => list.map(([k, l]) => `<div><span>${l}</span><b>${m[k] !== undefined ? m[k] + " cm" : "—"}</b></div>`).join("");
    const orders = S.orders.filter(o => o.clientId === c.id).sort((a, b) => b.createdAt - a.createdAt);
    box.innerHTML = `<div class="card detail-card">
      <h3>${esc(c.name)}</h3><div class="muted">${esc(c.phone)}</div>
      <div class="detail-actions">
        <button class="btn btn-primary btn-sm" id="cd-new" type="button">${icon("plus", 15)} Commande</button>
        <button class="btn btn-ghost btn-sm" id="cd-edit" type="button">${icon("pencil", 15)} Modifier</button>
        <button class="btn btn-ghost btn-sm" id="cd-wa" type="button">${icon("chat", 15)} WhatsApp</button>
        ${mgr ? `<button class="btn btn-ghost btn-sm" id="cd-del" type="button" style="color:var(--danger)">${icon("trash", 15)}</button>` : ""}
      </div>
      <div class="meas-title">Mesures du haut</div><div class="meas-grid">${meas(TOP)}</div>
      <div class="meas-title">Mesures du bas</div><div class="meas-grid">${meas(BOTTOM)}</div>
      <div class="meas-title">Historique des commandes</div>
      ${orders.length ? orders.map(o => `<button class="row-item" data-oid="${o.id}" type="button"><div class="r-main"><b>${esc(o.number)}</b><span>${fmtDate(o.dueDate)}</span></div><span class="badge ${statusClass(o.status)}">${esc(o.status)}</span></button>`).join("") : `<div class="empty">Aucune commande.</div>`}
    </div>`;
    $("#cd-new").onclick = () => { location.hash = "#/new-order/for-" + c.id; };
    $("#cd-edit").onclick = () => editClient(c);
    $("#cd-wa").onclick = () => openWhatsApp(c.phone, `Bonjour ${c.name}, ici DEMSY COUTURE. `);
    if (mgr) $("#cd-del").onclick = () => deleteClient(c);
    $$("[data-oid]", box).forEach(b => b.onclick = () => openOrderDetails(b.dataset.oid));
  };
  update();
  return { update };
}

function editClient(c) {
  const m = c.measures || {};
  const inputs = list => list.map(([k, l]) => `<label class="mrow"><span>${l}:</span><input type="number" step="0.1" min="0" inputmode="decimal" data-m="${k}" value="${esc(m[k] ?? "")}"></label>`).join("");
  const el = openModal(`
    <h3 class="modal-title">Modifier la fiche client</h3>
    <form id="ec-form" class="stack">
      <div class="grid-2"><div class="field"><label>Nom complet</label><input id="ec-name" value="${esc(c.name)}" required></div>
      <div class="field"><label>Téléphone</label><input id="ec-phone" value="${esc(c.phone)}" required></div></div>
      <div class="meas-box"><h4>Mesures du haut (cm)</h4><div class="m-grid">${inputs(TOP)}</div></div>
      <div class="meas-box"><h4>Mesures du bas (cm)</h4><div class="m-grid">${inputs(BOTTOM)}</div></div>
      <div class="modal-actions"><button class="btn btn-ghost" type="button" data-no>Annuler</button><button class="btn btn-primary" type="submit">Enregistrer</button></div>
    </form>`, { wide: true });
  $("[data-no]", el).onclick = () => el._close();
  $("#ec-form", el).onsubmit = async e => {
    e.preventDefault();
    const name = $("#ec-name", el).value.trim(), phone = $("#ec-phone", el).value.trim();
    if (digits(phone).length < 8) return toast("Numéro de contact invalide.", "error");
    const measures = {};
    $$("[data-m]", el).forEach(i => { if (i.value !== "") measures[i.dataset.m] = Number(i.value); });
    try {
      const b = writeBatch(db);
      b.update(doc(db, "clients", c.id), { name, phone, measures, updatedAt: Date.now() });
      S.orders.filter(o => o.clientId === c.id).forEach(o => b.update(doc(db, "orders", o.id), { clientName: name, clientPhone: phone }));
      await b.commit();
      log("Client modifié", name);
      toast("Fiche client mise à jour."); el._close();
    } catch (err) { toast("Erreur : " + (err.code || err.message), "error"); }
  };
}

async function deleteClient(c) {
  if (!(await confirmBox(`Supprimer la fiche de ${c.name} ? Ses commandes resteront dans la liste des commandes.`, "Supprimer", true))) return;
  try { await deleteDoc(doc(db, "clients", c.id)); selClient = null; log("Client supprimé", c.name); toast("Client supprimé."); }
  catch (e) { toast("Erreur : " + (e.code || e.message), "error"); }
}

/* ============================================================
   VUE : NOUVELLE COMMANDE / MODIFICATION
   ============================================================ */
async function nextNumber() {
  return runTransaction(db, async tx => {
    const ref = doc(db, "counters", "orders");
    const snap = await tx.get(ref);
    const next = (snap.exists() ? snap.data().value : 0) + 1;
    tx.set(ref, { value: next });
    return "DC-" + String(next).padStart(4, "0");
  });
}

let recognition = null;
function toggleDictation(textarea, btn) {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) return toast("La dictée vocale n'est pas disponible sur ce navigateur. Utilisez Google Chrome.", "error");
  if (recognition) { recognition.stop(); return; }
  recognition = new SR();
  recognition.lang = "fr-FR"; recognition.continuous = true; recognition.interimResults = false;
  recognition.onresult = e => {
    for (let i = e.resultIndex; i < e.results.length; i++) {
      if (e.results[i].isFinal) textarea.value += (textarea.value && !/\s$/.test(textarea.value) ? " " : "") + e.results[i][0].transcript.trim();
    }
  };
  recognition.onerror = ev => { if (ev.error === "not-allowed") toast("Autorisez le micro dans votre navigateur pour utiliser la dictée.", "error"); };
  recognition.onend = () => { recognition = null; btn.classList.remove("recording"); btn.innerHTML = icon("mic", 16) + " Dictée vocale"; };
  recognition.start();
  btn.classList.add("recording");
  btn.innerHTML = icon("mic", 16) + " Écoute… (cliquer pour arrêter)";
}

function viewOrderForm(arg) {
  let editId = null, prefClient = null;
  if (arg?.startsWith("edit-")) editId = arg.slice(5);
  if (arg?.startsWith("for-")) prefClient = S.clients.find(c => c.id === arg.slice(4));
  const order = editId ? S.orders.find(o => o.id === editId) : null;

  if (editId && !order) {
    $("#view").innerHTML = loadingHtml;
    return { update: () => {
      if (S.orders.find(o => o.id === editId)) route();
      else if (S.ordersReady) { toast("Commande introuvable.", "error"); location.hash = "#/orders"; }
    } };
  }

  const mgr = isMgr();
  const showFin = !editId || mgr;                 // les employés ne voient pas les finances d'une commande existante
  const st = { clientId: order?.clientId || prefClient?.id || null, images: [] };
  const m0 = order?.measures || prefClient?.measures || {};
  const paid = editId && mgr ? paidFor(editId) : 0;
  const inputs = list => list.map(([k, l]) => `<label class="mrow"><span>${l}:</span><input type="number" step="0.1" min="0" inputmode="decimal" data-m="${k}" value="${esc(m0[k] ?? "")}"></label>`).join("");

  $("#view").innerHTML = `
    ${backBtn()}
    <div class="page-head"><div><h1 class="page-title">${editId ? "Modifier la commande " + esc(order.number) : "Prise de Nouvelle Commande &amp; Mensurations"}</h1>
      <p class="page-sub">Enregistrez les informations client, prises de mesures et détails de confection.</p></div>
      <button class="btn btn-ghost btn-sm" data-go="orders" type="button">${icon("bag", 16)} Liste des commandes</button></div>
    <form id="order-form" novalidate>
      <section class="card form-card"><h3 class="sec-title"><span class="num">01</span> Information client</h3>
        <div class="grid-2">
          <div class="field"><label for="c-name">Nom complet :</label><input id="c-name" placeholder="Ex: Marie Dupuis" value="${esc(order?.clientName || prefClient?.name || "")}" autocomplete="off"></div>
          <div class="field"><label for="c-phone">Numéro de contact :</label><input id="c-phone" type="tel" placeholder="+225 00 00 00 00 00" value="${esc(order?.clientPhone || prefClient?.phone || "")}" autocomplete="off"></div>
        </div>
        <div id="c-found" class="found-box hidden"></div>
      </section>

      <section class="card form-card"><h3 class="sec-title"><span class="num">02</span> Mesures (en cm)</h3>
        <div class="grid-2">
          <div class="meas-box"><h4>Mesures du haut</h4><div class="m-grid">${inputs(TOP)}</div></div>
          <div class="meas-box"><h4>Mesures du bas</h4><div class="m-grid">${inputs(BOTTOM)}</div></div>
        </div>
      </section>

      <section class="card form-card"><h3 class="sec-title"><span class="num">03</span> Commande &amp; spécifications</h3>
        <div class="spec-grid">
          <div><textarea id="o-details" placeholder="Détails du modèle, type de tissu, broderies, finitions particulières...">${esc(order?.details || "")}</textarea>
            <div class="voice-row"><button class="btn btn-ghost btn-sm" id="voice-btn" type="button">${icon("mic", 16)} Dictée vocale</button></div></div>
          <div class="img-box"><div class="img-head"><span>Images de modèles</span><button class="btn btn-primary btn-sm" id="img-add" type="button">${icon("plus", 14)} Ajouter</button></div>
            <div class="img-grid" id="img-grid"></div><input id="img-input" type="file" accept="image/*" multiple hidden></div>
        </div>
      </section>

      <section class="card form-card"><h3 class="sec-title">Finances &amp; échéance</h3>
        <div class="fin-grid">
          ${showFin ? `<div class="field"><label for="f-total">Prix total (CFA) :</label><input id="f-total" type="number" min="0" step="1" inputmode="numeric" value="${editId ? totalFor(editId) || "" : ""}"></div>
          ${editId ? `<div class="field"><label>Déjà encaissé (CFA) :</label><input id="f-paid" readonly value="${fmt(paid)}"></div>`
                   : `<div class="field"><label for="f-adv">Avance (CFA) :</label><input id="f-adv" type="number" min="0" step="1" inputmode="numeric"></div>`}
          <div class="field"><label for="f-rest">Reste à payer :</label><input id="f-rest" readonly value="0 CFA"></div>` : ""}
          <div class="field"><label for="f-due">Date de RDV / livraison :</label><input id="f-due" type="date" value="${esc(order?.dueDate || "")}"></div>
          <div class="field"><label for="f-tailor">Couturier assigné :</label><select id="f-tailor"></select></div>
          <div class="field"><label for="f-status">État :</label><select id="f-status">${STATUSES.map(s => `<option ${s === (order?.status || "Coupe") ? "selected" : ""}>${s}</option>`).join("")}</select></div>
        </div>
      </section>
      <button class="btn btn-primary submit-btn" id="o-submit" type="submit">${editId ? "METTRE À JOUR LA COMMANDE" : "ENREGISTRER LA COMMANDE"}</button>
    </form>`;

  const form = $("#order-form");
  /* Couturiers */
  const fillTailors = () => {
    const sel = $("#f-tailor"); if (!sel) return;
    const keep = sel.value || order?.assignedTo || "";
    sel.innerHTML = `<option value="">— Non assigné —</option>` + S.users.filter(u => u.active).sort((a, b) => a.name.localeCompare(b.name, "fr"))
      .map(u => `<option value="${u.id}">${esc(u.name)}</option>`).join("");
    sel.value = keep;
  };
  fillTailors();

  /* Calcul du reste */
  const recalc = () => {
    if (!showFin) return;
    const t = Number($("#f-total").value) || 0;
    const a = editId ? paid : (Number($("#f-adv").value) || 0);
    const r = $("#f-rest"); r.value = fmt(t - a) + " CFA"; r.style.color = t - a < 0 ? "var(--danger)" : "";
  };
  if (showFin) { $("#f-total").oninput = recalc; if (!editId) $("#f-adv").oninput = recalc; recalc(); }

  /* Client existant */
  const fillClient = c => {
    st.clientId = c.id;
    $("#c-name").value = c.name; $("#c-phone").value = c.phone;
    $$("[data-m]", form).forEach(i => { i.value = c.measures?.[i.dataset.m] ?? ""; });
    $("#c-found").classList.add("hidden");
    toast("Fiche client chargée.");
  };
  const checkClient = () => {
    if (editId) return;
    const d = digits($("#c-phone").value);
    const found = d.length >= 8 && S.clients.find(c => digits(c.phone) === d);
    const box = $("#c-found");
    if (found && found.id !== st.clientId) {
      box.classList.remove("hidden");
      box.innerHTML = `<span>Client existant : <b>${esc(found.name)}</b></span><button type="button" class="btn btn-ghost btn-sm" id="load-client">Charger sa fiche et ses mesures</button>`;
      $("#load-client").onclick = () => fillClient(found);
    } else box.classList.add("hidden");
  };
  $("#c-phone").oninput = checkClient;
  checkClient();

  /* Images */
  const drawImgs = () => {
    $("#img-grid").innerHTML = st.images.length
      ? st.images.map((s, i) => `<div class="thumb"><img src="${s}" alt="Modèle ${i + 1}" data-zoom><button type="button" data-rm="${i}" aria-label="Retirer">${icon("x", 14)}</button></div>`).join("")
      : `<div class="empty-img">${icon("image", 36)}<span>Aucune image sélectionnée</span></div>`;
    $$("[data-rm]", form).forEach(b => b.onclick = () => { st.images.splice(Number(b.dataset.rm), 1); drawImgs(); });
    $$("[data-zoom]", form).forEach(i => i.onclick = () => showImage(i.src));
  };
  drawImgs();
  $("#img-add").onclick = () => $("#img-input").click();
  $("#img-input").onchange = async e => {
    for (const f of [...e.target.files]) {
      if (st.images.length >= 4) { toast("4 images maximum par commande.", "error"); break; }
      try { st.images.push(await compressImage(f)); } catch { toast("Image illisible : " + f.name, "error"); }
    }
    e.target.value = ""; drawImgs();
  };
  if (editId) {
    (async () => {
      if (!imgCache[editId]) { try { const s = await getDoc(doc(db, "orderImages", editId)); imgCache[editId] = s.exists() ? (s.data().images || []) : []; } catch { imgCache[editId] = []; } }
      if (!st.images.length) { st.images = [...imgCache[editId]]; drawImgs(); }
    })();
  }

  /* Dictée vocale */
  $("#voice-btn").onclick = () => toggleDictation($("#o-details"), $("#voice-btn"));

  /* Enregistrement */
  form.addEventListener("submit", async e => {
    e.preventDefault();
    const name = $("#c-name").value.trim(), phone = $("#c-phone").value.trim(), due = $("#f-due").value;
    if (!name) return toast("Indiquez le nom du client.", "error");
    if (digits(phone).length < 8) return toast("Indiquez un numéro de contact valide.", "error");
    if (!due) return toast("Indiquez la date de rendez-vous / livraison.", "error");
    let total = 0, adv = 0;
    if (showFin) {
      total = Number($("#f-total").value) || 0;
      adv = editId ? 0 : (Number($("#f-adv").value) || 0);
      if (adv > total) return toast("L'avance ne peut pas dépasser le prix total.", "error");
    }
    if (st.images.reduce((a, s) => a + s.length, 0) > 900000) return toast("Les images sont trop lourdes : retirez-en une.", "error");
    const measures = {};
    $$("[data-m]", form).forEach(i => { if (i.value !== "") measures[i.dataset.m] = Number(i.value); });
    const tailorId = $("#f-tailor").value, tailor = S.users.find(u => u.id === tailorId);
    const btn = $("#o-submit"); btn.disabled = true;
    try {
      let clientId = st.clientId;
      if (!clientId) { const ex = S.clients.find(c => digits(c.phone) === digits(phone)); if (ex) clientId = ex.id; }
      const cData = { name, phone, measures, updatedAt: Date.now() };
      if (clientId) await updateDoc(doc(db, "clients", clientId), cData);
      else { clientId = (await addDoc(collection(db, "clients"), { ...cData, createdAt: Date.now(), createdBy: ME.uid })).id; log("Client créé", name); }

      const common = {
        clientId, clientName: name, clientPhone: phone, measures, details: $("#o-details").value.trim(),
        dueDate: due, status: $("#f-status").value, assignedTo: tailorId || "", assignedName: tailor?.name || "", updatedAt: Date.now()
      };
      if (editId) {
        const b = writeBatch(db);
        let rdvId = order.rdvId;
        if (rdvId && S.rdv.some(r => r.id === rdvId)) {
          b.update(doc(db, "rdv", rdvId), { date: due, clientName: name, clientId });
        } else {
          const rdvRef = doc(collection(db, "rdv"));
          rdvId = rdvRef.id;
          b.set(rdvRef, { date: due, time: "09:00", clientName: name, clientId, object: "Livraison commande " + order.number, status: "Prévu", createdAt: Date.now(), createdByName: ME.name, orderId: editId });
        }
        b.update(doc(db, "orders", editId), { ...common, rdvId });
        b.set(doc(db, "orderImages", editId), { images: st.images });
        if (mgr) b.set(doc(db, "finance", editId), { total }, { merge: true });
        await b.commit();
        imgCache[editId] = st.images;
        log("Commande modifiée", `${order.number} (${name})`);
        toast("Commande mise à jour.");
      } else {
        const number = await nextNumber();
        const ref = doc(collection(db, "orders"));
        const rdvRef = doc(collection(db, "rdv"));
        const b = writeBatch(db);
        b.set(ref, { ...common, number, rdvId: rdvRef.id, createdAt: Date.now(), createdBy: ME.uid, createdByName: ME.name });
        b.set(rdvRef, { date: due, time: "09:00", clientName: name, clientId, object: "Livraison commande " + number, status: "Prévu", createdAt: Date.now(), createdByName: ME.name, orderId: ref.id });
        b.set(doc(db, "orderImages", ref.id), { images: st.images });
        b.set(doc(db, "finance", ref.id), { total, number, createdAt: Date.now() });
        if (adv > 0) b.set(doc(collection(db, "payments")), { orderId: ref.id, amount: adv, at: Date.now(), by: ME.uid, byName: ME.name, note: "Avance à la commande" });
        await b.commit();
        imgCache[ref.id] = st.images;
        log("Commande créée", `${number} — ${name}`);
        toast("Commande " + number + " enregistrée.");
      }
      location.hash = "#/orders";
    } catch (err) {
      console.error(err);
      toast("Erreur d'enregistrement : " + (err.code || err.message), "error");
      btn.disabled = false;
    }
  });

  return { update: fillTailors };
}

/* ============================================================
   VUE : RENDEZ-VOUS
   ============================================================ */
function viewAppointments() {
  $("#view").innerHTML = `
    ${backBtn()}
    <h1 class="page-title">Planification des Rendez-vous</h1>
    <p class="page-sub">Gestion des essayages et permanences de l'atelier.</p>
    <section class="card" style="margin:22px 0">
      <h3 class="panel-title">Ajouter un rendez-vous</h3>
      <form id="rdv-form" class="fin-grid" style="align-items:end;grid-template-columns:repeat(auto-fit,minmax(150px,1fr))">
        <div class="field"><label for="r-date">Date</label><input id="r-date" type="date" required></div>
        <div class="field"><label for="r-time">Heure</label><input id="r-time" type="time" required></div>
        <div class="field"><label for="r-client">Client</label><input id="r-client" list="dl-clients" placeholder="Nom du client" autocomplete="off" required><datalist id="dl-clients"></datalist></div>
        <div class="field"><label for="r-obj">Objet</label><input id="r-obj" placeholder="Ex: Prise de mesure, Essayage..." required></div>
        <button class="btn btn-primary" type="submit">Ajouter</button>
      </form>
    </section>
    <div class="table-wrap"><table><thead><tr><th>Date &amp; heure</th><th>Client</th><th>Objet</th><th>Statut</th><th>Actions</th></tr></thead><tbody id="r-body"></tbody></table></div>`;

  $("#rdv-form").onsubmit = async e => {
    e.preventDefault();
    const name = $("#r-client").value.trim();
    const c = S.clients.find(x => x.name.toLowerCase() === name.toLowerCase());
    try {
      await addDoc(collection(db, "rdv"), {
        date: $("#r-date").value, time: $("#r-time").value, clientName: c?.name || name, clientId: c?.id || "",
        object: $("#r-obj").value.trim(), status: "Prévu", createdAt: Date.now(), createdByName: ME.name
      });
      log("Rendez-vous ajouté", `${name} le ${fmtDate($("#r-date").value)} à ${$("#r-time").value}`);
      toast("Rendez-vous ajouté.");
      e.target.reset();
    } catch (err) { toast("Erreur : " + (err.code || err.message), "error"); }
  };

  const phoneOf = r => (S.clients.find(c => c.id === r.clientId) || S.clients.find(c => c.name.toLowerCase() === r.clientName.toLowerCase()))?.phone;
  const update = () => {
    $("#dl-clients").innerHTML = S.clients.map(c => `<option value="${esc(c.name)}"></option>`).join("");
    const today = todayStr();
    const list = [...S.rdv].sort((a, b) => {
      const pa = a.status === "Prévu", pb = b.status === "Prévu";
      if (pa !== pb) return pa ? -1 : 1;
      const ka = a.date + a.time, kb = b.date + b.time;
      return pa ? ka.localeCompare(kb) : kb.localeCompare(ka);
    });
    $("#r-body").innerHTML = list.length ? list.map(r => {
      const late = r.status === "Prévu" && r.date < today;
      return `<tr data-id="${r.id}" class="${r.date === today && r.status === "Prévu" ? "row-today" : ""}">
        <td><b>${fmtDate(r.date)}</b> à ${esc(r.time)} ${r.date === today && r.status === "Prévu" ? '<span class="badge b-warn">Aujourd\'hui</span>' : ""}${late ? '<span class="badge b-danger">Passé</span>' : ""}</td>
        <td>${esc(r.clientName)}</td><td>${esc(r.object)}</td>
        <td><select class="status-select" data-st>${RDV_STATUSES.map(s => `<option ${s === r.status ? "selected" : ""}>${s}</option>`).join("")}</select></td>
        <td><div class="actions">
          ${phoneOf(r) ? `<button class="icon-sq" data-act="wa" title="Rappel WhatsApp" type="button">${icon("chat", 16)}</button>` : ""}
          <button class="icon-sq danger" data-act="del" title="Supprimer" type="button">${icon("trash", 16)}</button></div></td></tr>`;
    }).join("") : `<tr><td colspan="5"><div class="empty">Aucun rendez-vous prévu.</div></td></tr>`;
  };
  $("#r-body").addEventListener("click", async e => {
    const btn = e.target.closest("[data-act]"); if (!btn) return;
    const r = S.rdv.find(x => x.id === btn.closest("tr").dataset.id);
    if (btn.dataset.act === "wa") openWhatsApp(phoneOf(r), `Bonjour ${r.clientName}, rappel de votre rendez-vous le ${fmtDate(r.date)} à ${r.time} (${r.object}).\n${WA_SIGN}`);
    if (btn.dataset.act === "del" && await confirmBox(`Supprimer le rendez-vous de ${r.clientName} du ${fmtDate(r.date)} ?`, "Supprimer", true)) {
      await deleteDoc(doc(db, "rdv", r.id)); log("Rendez-vous supprimé", `${r.clientName} ${fmtDate(r.date)}`); toast("Rendez-vous supprimé.");
    }
  });
  $("#r-body").addEventListener("change", async e => {
    if (!e.target.matches("[data-st]")) return;
    const r = S.rdv.find(x => x.id === e.target.closest("tr").dataset.id);
    await updateDoc(doc(db, "rdv", r.id), { status: e.target.value });
    log("Rendez-vous " + e.target.value.toLowerCase(), `${r.clientName} ${fmtDate(r.date)}`);
  });
  update();
  return { update };
}

/* ============================================================
   VUE : ÉQUIPE & ACCÈS (responsable)
   ============================================================ */
async function createStaffAccount(name, username, password, role) {
  const email = toEmail(username);
  const second = initializeApp(firebaseConfig, "secondary-" + Date.now());   // 2e connexion : le responsable reste connecté
  try {
    const sAuth = getAuth(second);
    const cred = await createUserWithEmailAndPassword(sAuth, email, password);
    await setDoc(doc(db, "users", cred.user.uid), { name, username: String(username).trim().toLowerCase(), email, role, active: true, createdAt: Date.now() });
    await signOut(sAuth);
  } finally { await deleteApp(second); }
}

function viewTeam() {
  $("#view").innerHTML = `
    ${backBtn()}
    <h1 class="page-title">Équipe &amp; Accès</h1>
    <p class="page-sub">Chaque membre du personnel a son propre compte. Désactivez un compte pour bloquer immédiatement son accès.</p>
    <section class="card" style="margin:22px 0">
      <h3 class="panel-title">Créer un compte</h3>
      <form id="team-form" class="fin-grid" style="align-items:end;grid-template-columns:repeat(auto-fit,minmax(170px,1fr))">
        <div class="field"><label for="t-name">Nom complet</label><input id="t-name" required placeholder="Ex: Awa Traoré"></div>
        <div class="field"><label for="t-user">Identifiant</label><input id="t-user" required placeholder="Ex: awa" autocapitalize="none" pattern="[A-Za-z0-9._@-]{3,}" title="3 caractères minimum, sans espace ni accent"></div>
        <div class="field"><label for="t-pass">Mot de passe (6 min.)</label><input id="t-pass" type="text" minlength="6" required autocomplete="off"></div>
        <div class="field"><label for="t-role">Rôle</label><select id="t-role"><option value="employee">Personnel (couturier, accueil)</option><option value="manager">Responsable (accès total)</option></select></div>
        <button class="btn btn-primary" id="t-btn" type="submit">Créer le compte</button>
      </form>
    </section>
    <div class="table-wrap"><table><thead><tr><th>Nom</th><th>Identifiant</th><th>Rôle</th><th>Statut</th><th>Action</th></tr></thead><tbody id="t-body"></tbody></table></div>`;

  $("#team-form").onsubmit = async e => {
    e.preventDefault();
    const btn = $("#t-btn"); btn.disabled = true;
    try {
      const name = $("#t-name").value.trim(), user = $("#t-user").value.trim();
      await createStaffAccount(name, user, $("#t-pass").value, $("#t-role").value);
      log("Compte créé", `${name} (${user})`);
      toast("Compte créé pour " + name + ". Transmettez-lui son identifiant et son mot de passe.");
      e.target.reset();
    } catch (err) {
      toast(err.code === "auth/email-already-in-use" ? "Cet identifiant existe déjà." : err.code === "auth/weak-password" ? "Mot de passe trop faible (6 caractères minimum)." : "Erreur : " + (err.code || err.message), "error");
    } finally { btn.disabled = false; }
  };

  const update = () => {
    $("#t-body").innerHTML = [...S.users].sort((a, b) => a.name.localeCompare(b.name, "fr")).map(u => `<tr data-id="${u.id}">
      <td><b>${esc(u.name)}</b>${u.id === ME.uid ? ' <span class="badge b-gold">vous</span>' : ""}</td>
      <td>${esc(u.username || u.email)}</td>
      <td><span class="badge ${u.role === "manager" ? "b-gold" : ""}">${u.role === "manager" ? "Responsable" : "Personnel"}</span></td>
      <td><span class="badge ${u.active ? "b-ok" : "b-danger"}">${u.active ? "Actif" : "Désactivé"}</span></td>
      <td>${u.id === ME.uid ? "" : `<button class="btn btn-ghost btn-sm" data-toggle type="button">${u.active ? "Désactiver" : "Réactiver"}</button>`}</td></tr>`).join("")
      || `<tr><td colspan="5"><div class="empty">Aucun compte.</div></td></tr>`;
  };
  $("#t-body").addEventListener("click", async e => {
    const b = e.target.closest("[data-toggle]"); if (!b) return;
    const u = S.users.find(x => x.id === b.closest("tr").dataset.id);
    const to = !u.active;
    if (!(await confirmBox(`${to ? "Réactiver" : "Désactiver"} le compte de ${u.name} ?`, to ? "Réactiver" : "Désactiver", !to))) return;
    await updateDoc(doc(db, "users", u.id), { active: to });
    log(to ? "Compte réactivé" : "Compte désactivé", u.name);
    toast(to ? "Compte réactivé." : "Compte désactivé.");
  });
  update();
  return { update };
}

/* ============================================================
   VUE : JOURNAL D'ACTIVITÉ (responsable)
   ============================================================ */
let logQuery = "";
function viewLogs() {
  $("#view").innerHTML = `
    ${backBtn()}
    <h1 class="page-title">Journal d'activité</h1>
    <p class="page-sub">Les 300 dernières actions effectuées par l'équipe.</p>
    <div class="search" style="margin-top:18px"><span>${icon("search")}</span><input id="l-search" type="search" placeholder="Rechercher une personne ou une action..." value="${esc(logQuery)}"></div>
    <div class="table-wrap"><table><thead><tr><th>Date</th><th>Utilisateur</th><th>Action</th><th>Détail</th></tr></thead><tbody id="l-body"></tbody></table></div>`;
  $("#l-search").oninput = e => { logQuery = e.target.value; update(); };
  const update = () => {
    const q = logQuery.trim().toLowerCase();
    const list = S.logs.filter(l => !q || `${l.name} ${l.action} ${l.detail}`.toLowerCase().includes(q));
    $("#l-body").innerHTML = list.length ? list.map(l => `<tr><td>${fmtDateTime(l.at)}</td><td>${esc(l.name)}</td><td><b>${esc(l.action)}</b></td><td>${esc(l.detail)}</td></tr>`).join("")
      : `<tr><td colspan="4"><div class="empty">Aucune activité enregistrée.</div></td></tr>`;
  };
  update();
  return { update };
}
