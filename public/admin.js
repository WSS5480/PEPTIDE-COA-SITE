/* Store admin: dashboard, orders, products, lab reports, shipping, settings, staff, account. */
// what a discount code takes off (the server checks it again): percent, dollars, or the cheapest N vials free; minimum order / minimum vials
const codeOffFor = (code, sub, units) => {
  if (!code || !sub) return 0;
  const vials = units.reduce((t, u) => t + u.qty, 0);
  if ((code.minSubtotalCents && sub < code.minSubtotalCents) || (code.minVials && vials < code.minVials)) return 0;
  const free = () => units.flatMap((u) => Array(Math.max(0, u.qty)).fill(u.cents)).sort((a, b) => a - b).slice(0, code.value).reduce((t, c) => t + c, 0);
  return Math.max(0, Math.min(sub, code.kind === "percent" ? Math.round(sub * code.value / 100) : code.kind === "vials" ? free() : code.value));
};
(() => {
const app = document.getElementById("app");
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const money = (c) => (c === null || c === undefined ? "" : "$" + (c / 100).toFixed(2));
const dollars = (c) => (c === null || c === undefined ? "" : (c / 100).toFixed(2));
const when = (iso) => { if (!iso) return ""; const d = new Date(iso); return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }) + " " + d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" }); };
const STATUSES = ["new", "confirmed", "paid", "shipped", "delivered", "cancelled"];
const pill = (s) => `<span class="pill st-${esc(s)}">${esc(s)}</span>`;
function toast(msg) { const t = document.createElement("div"); t.className = "toast"; t.textContent = msg; document.body.appendChild(t); setTimeout(() => t.remove(), 1800); }

async function api(path, opts = {}) {
  const method = opts.method || "GET", send = method !== "GET";
  // every change (including deletes) goes as JSON; the server rejects anything else as a safety check
  const res = await fetch("/api/admin" + path, { method, headers: send ? { "Content-Type": "application/json" } : {}, body: send ? JSON.stringify(opts.body || {}) : undefined, credentials: "same-origin" });
  if (res.status === 401) { me = null; drawLogin(); throw new Error("signed out"); }
  const j = await res.json().catch(() => ({}));
  if (!res.ok) { toast(j.error || "That didn't work"); throw new Error(j.error || "error"); }
  return j;
}

let unsaved = false;
// Same rule the store uses: a report belongs to a product when name + size match, or the product code matches the report's Sample line.
const nrm = (x) => String(x ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
const szk = (x) => nrm(x).replace(/mg$/, "");
// the same peptide can come from several manufacturers: a COA only attaches to the matching maker
// (names compared loosely, so "XINT" matches "XINTpeptides"; a report or product with no maker matches any)
const mfrOk = (p, r) => { const a = nrm(p.manufacturer), b = nrm(r.manufacturer); return !a || !b || a.includes(b) || b.includes(a); };
const reportMatches = (p, r) => mfrOk(p, r) && nrm(p.name) === nrm(r.product) && szk(p.strength) === szk(r.strength);
addEventListener("beforeunload", (e) => { if (unsaved) { e.preventDefault(); e.returnValue = ""; } });
let me = null, view = "dashboard", orderId = null, stats = null, BUILD = null, HUB = { linked: false, trackerUrl: "", apps: {} };
const STANDALONE = !!(window.matchMedia && matchMedia("(display-mode: standalone)").matches) || navigator.standalone === true;
// the switch to the case tracker: when this admin is shown inside the tracker's window, switch the window itself; otherwise host the tracker
// inside this app's own address (/admin/tracker) so an installed app never leaves its site — except on iPhone/iPad, where a hosted sign-in can't keep cookies, so it navigates
const FRAMED = (() => { try { return window.top !== window; } catch (e) { return true; } })();
const HOSTABLE = !/iPhone|iPad|iPod/.test(navigator.userAgent) && /Chrome|Edg|Firefox/.test(navigator.userAgent);
const switchHref = (next) => FRAMED ? HUB.trackerUrl + next : (HOSTABLE ? "/admin/tracker?next=" : "/admin/go/tracker?next=") + encodeURIComponent(next);
const isOwner = () => me && me.role === "owner";
const isRep = () => me && me.role === "rep";

/* ---------- login ---------- */
let loginMode = localStorage.getItem("loginMode") || "email";
function drawLogin(msg) {
  if (!msg && window.__ssoMsg) { msg = window.__ssoMsg; window.__ssoMsg = ""; }
  const pinMode = loginMode === "pin";
  app.innerHTML = `<div class="login"><form id="lf">
    <img src="/site-logo?v=2" alt="360 Peptides" style="height:3.2rem;width:auto;max-width:16rem;object-fit:contain;justify-self:start">
    <h1>360 Medical · Admin</h1><p class="muted">One login for the peptide store and the surgical case tracker.</p>
    <div class="seg" style="justify-self:start"><button type="button" data-lmode="email"${pinMode ? "" : ' class="on"'}>Email + password</button><button type="button" data-lmode="pin"${pinMode ? ' class="on"' : ""}>Name + PIN</button></div>
    ${pinMode ? `<div class="field"><label class="eyebrow" for="ln">Your name</label><select id="ln" required><option value="">Loading…</option></select></div>
    <div class="field"><label class="eyebrow" for="lpin">PIN</label><input id="lpin" inputmode="numeric" autocomplete="one-time-code" maxlength="10" required style="font:600 1.3rem/1 var(--mono);letter-spacing:.3em"></div>`
    : `<div class="field"><label class="eyebrow" for="le">Email</label><input id="le" type="email" autocomplete="username" required></div>
    <div class="field"><label class="eyebrow" for="lp">Password</label><input id="lp" type="password" autocomplete="current-password" required></div>`}
    ${msg ? `<div class="err">${esc(msg)}</div>` : ""}
    <button class="btn solid wide">Sign in</button><button class="btn wide" type="button" data-install>Download admin app</button>
    <p class="muted" style="text-align:center;margin:0">Sales reps sign in at the <a href="/rep">rep app</a> (name + PIN there). A PIN is set under Team logins or My account.</p>
    <p class="muted" style="text-align:center;margin:.5rem 0 0">Customers: <a href="/?signin=1">sign in at the store</a> with the PIN we gave you.</p></form></div>`;
  document.querySelectorAll("[data-lmode]").forEach((b) => (b.onclick = () => { loginMode = b.dataset.lmode; localStorage.setItem("loginMode", loginMode); drawLogin(); }));
  if (pinMode) fetch("/api/admin/pin-names").then((r) => r.json()).then((j) => { const sel = document.getElementById("ln"); if (!sel) return; sel.innerHTML = `<option value="">Choose your name…</option>` + j.names.map((n) => `<option value="${n.id}"${String(n.id) === localStorage.getItem("loginName") ? " selected" : ""}>${esc(n.name)}</option>`).join(""); if (!j.names.length) sel.innerHTML = `<option value="">No PINs set yet — use email + password</option>`; }).catch(() => {});
  document.getElementById("lf").onsubmit = async (e) => {
    e.preventDefault();
    const res = pinMode
      ? await fetch("/api/admin/login-pin", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: +document.getElementById("ln").value, pin: document.getElementById("lpin").value }) })
      : await fetch("/api/admin/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: le.value, password: lp.value }) });
    const j = await res.json();
    if (!res.ok) return drawLogin(j.error);
    if (pinMode) localStorage.setItem("loginName", document.getElementById("ln").value);
    me = j.user; HUB = await api("/hub").catch(() => HUB); shell();
  };
}

/* ---------- shell ---------- */
// [key, label, who]: "all" = owner, staff and sales reps · "team" = owner and staff · "owner" · "ownerrep" = owner and reps. "line" draws the divider:
// sales reps only ever see what's above it (their own customers, orders and commissions) plus My account.
const NAV = [["dashboard", "Dashboard", "all"], ["orders", "Orders", "all"], ["neworder", "New order", "all"], ["fill", "Fill orders", "team"], ["customers", "Customers", "all"], ["reps", "Sales reps", "owner"], ["commissions", "Commissions", "ownerrep"], ["ar", "Invoices & AR", "all"], ["analytics", "Analytics", "all"], ["salescost", "Sales & cost", "owner"], ["pnl", "Profit / loss", "owner"], ["line"],
  ["products", "Products & prices", "team"], ["inventory", "Inventory", "team"], ["reports", "Lab reports", "team"], ["discounts", "Discount codes", "owner"], ["promo", "Promo banner", "team"], ["page", "Page setup", "team"], ["settings", "Site settings", "team"], ["line2"],
  // below the second line: the things you reach from either app (the case tracker links here too)
  ["staff", "Team logins", "owner"], ["setup", "Email & approvals", "owner"], ["geo", "Geofencing", "owner"], ["apps", "Apps & downloads", "all"], ["howto", "How to", "all"], ["account", "My account", "all"]];
const canSee = (who) => who === "all" || (who === "owner" && isOwner()) || (who === "team" && !isRep()) || (who === "ownerrep" && (isOwner() || isRep()));
function shell() {
  app.innerHTML = `<div class="mtop"><strong>360 Peptides Admin</strong><span><button type="button" data-refresh title="Refresh"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M20 12a8 8 0 1 1-2.3-5.7M20 4v5h-5"/></svg></button> <button type="button" id="mm">Menu</button></span></div>
  <div class="adm" id="adm"><aside class="side">
    <div class="logobox"><img src="/site-logo?v=2" alt="360 Peptides"></div><div class="logo"><small>Peptides admin</small><span class="ver" id="buildTop">v…</span>${HUB.linked && HUB.apps && HUB.apps.tracker ? `<div class="seg appswitch" style="display:flex;margin:.6rem 0 0"><button type="button" class="on" style="flex:1">Peptide store</button><a href="${switchHref(isRep() ? "/" : "/admin")}"${FRAMED ? ' target="_top"' : ""} style="flex:1;display:grid;place-items:center;text-decoration:none;color:inherit;font-weight:600;font-size:.86rem;background:var(--card)" title="Switch to the 360 Medical case tracker with this login">Case tracker ↗</a></div>` : ""}<div class="seg appswitch views" style="display:flex;margin:.35rem 0 0"><button type="button" class="on" style="flex:1" title="You are in the admin">Admin</button><a href="/" style="flex:1;display:grid;place-items:center;text-decoration:none;color:inherit;font-weight:600;font-size:.86rem;background:var(--card)" title="The store, signed in as the office">Store</a><a href="/rep" style="flex:1;display:grid;place-items:center;text-decoration:none;color:inherit;font-weight:600;font-size:.86rem;background:var(--card)" title="The rep app with this login">Rep</a>${HUB.linked && HUB.apps && HUB.apps.tracker ? `<a href="${switchHref("/")}"${FRAMED ? ' target="_top"' : ""} style="flex:1;display:grid;place-items:center;text-decoration:none;color:inherit;font-weight:600;font-size:.86rem;background:var(--card)" title="The case tracker with this login">Tracker</a>` : ""}</div></div>
    <div class="sref-row"><button type="button" class="sref" data-refresh title="Reload this screen"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" style="vertical-align:-2px"><path d="M20 12a8 8 0 1 1-2.3-5.7M20 4v5h-5"/></svg> Refresh</button></div>
    <nav id="nav"></nav>
    <div class="who"><span>${esc(me.name || me.email)} · ${esc(me.role)}</span><button type="button" data-install>Download admin app</button><button type="button" id="lo">Sign out</button></div>
  </aside><div class="pwrap"><nav class="jump" id="pills" aria-label="Pages"></nav><section class="pane" id="pane"></section></div></div>`;
  document.getElementById("lo").onclick = async () => { await fetch("/api/admin/logout", { method: "POST" }); me = null; drawLogin(); };
  fetch("/api/build").then((r) => r.json()).then((b) => { BUILD = b; const line = `v${b.version} · updated ${when(b.updated)}`; const bl = document.getElementById("buildLine"); if (bl) bl.textContent = line; document.getElementById("buildTop").textContent = line; const d = document.getElementById("dashBuild"); if (d) d.textContent = line; }).catch(() => {});
  document.getElementById("mm").onclick = () => document.getElementById("adm").classList.toggle("menu");
  go(view, orderId);
}
/* the menu is grouped Rep / Manager / Admin (each folds; tapping its name opens it and closes the others), plus pills on top like the tracker */
const NAV_GROUP = { orders: "Rep", neworder: "Rep", customers: "Rep", commissions: "Rep", ar: "Rep",
  fill: "Manager", products: "Manager", inventory: "Manager", reports: "Manager", promo: "Manager", page: "Manager", settings: "Manager", analytics: "Manager",
  reps: "Admin", discounts: "Admin", salescost: "Admin", pnl: "Admin", staff: "Admin", setup: "Admin", geo: "Admin" };
let navOpen = null;
async function drawNav() {
  try { stats = await api("/stats"); } catch (e) { return; }
  const n = stats.byStatus.new || 0;
  const items = NAV.filter(([k, , who]) => k !== "line" && k !== "line2" && (k !== "geo" || HUB.linked) && canSee(who));
  const badge = (k) => `${k === "orders" && n ? `<span class="badge">${n}</span>` : ""}${k === "fill" && stats.toFill ? `<span class="badge">${stats.toFill}</span>` : ""}${k === "customers" && stats.pinRequests ? `<span class="badge" title="PIN requests">${stats.pinRequests}</span>` : ""}`;
  const btn = ([k, label]) => `<button type="button" data-nav="${k}" class="${view === k ? "on" : ""}">${label}${badge(k)}</button>`;
  const grpOf = (k) => (isRep() ? "" : NAV_GROUP[k] || "");
  if (navOpen === null || (grpOf(view) && navOpen !== grpOf(view) && !drawNav.manual)) navOpen = grpOf(view) || "";
  drawNav.manual = false;
  const groups = ["Rep", "Manager", "Admin"].map((g) => [g, items.filter(([k]) => grpOf(k) === g)]).filter(([, l]) => l.length);
  const sum = (l) => l.reduce((t, [k]) => t + (k === "orders" ? n : k === "fill" ? stats.toFill || 0 : k === "customers" ? stats.pinRequests || 0 : 0), 0);
  document.getElementById("nav").innerHTML = items.filter(([k]) => k === "dashboard").map(btn).join("") +
    groups.map(([g, l]) => `<button type="button" class="navgrp-h${navOpen === g ? " open" : ""}" data-grp="${g}"><span>${navOpen === g ? "▾" : "▸"} ${g}</span>${navOpen !== g && sum(l) ? `<span class="badge">${sum(l)}</span>` : ""}</button><div class="navgrp-items"${navOpen === g ? "" : " hidden"}>${l.map(btn).join("")}</div>`).join("") +
    '<hr class="navline">' + items.filter(([k]) => k !== "dashboard" && !grpOf(k)).map(btn).join("");
  // pills on top: every page, the open one lit; tapping the lit pill goes back to the Dashboard
  const pills = document.getElementById("pills");
  if (pills) { pills.innerHTML = items.map(([k, label]) => `<a href="#${k}" data-pill="${k}" class="${view === k ? "on" : ""}">${label}${badge(k)}</a>`).join("");
    const on = pills.querySelector("a.on"); if (on && pills.scrollWidth > pills.clientWidth) pills.scrollLeft = Math.max(0, on.offsetLeft - 16); }
}
document.addEventListener("click", (e) => {
  const h = e.target.closest(".navgrp-h"); if (h) { navOpen = navOpen === h.dataset.grp ? "" : h.dataset.grp; drawNav.manual = true; drawNav(); return; }
  const p = e.target.closest("[data-pill]"); if (p) { e.preventDefault(); const k = p.dataset.pill; go(view === k && k !== "dashboard" ? "dashboard" : k); }
});
let paneDirty = false; // something typed on this screen and not saved yet
document.addEventListener("input", (e) => { if (e.target.closest("#pane")) paneDirty = true; });
async function go(v, id, opts = {}) {
  if (!opts.silent && unsaved && !confirm("You have unsaved product changes. Leave without saving?")) return;
  unsaved = false; paneDirty = false;
  const pn = document.getElementById("pane"); if (pn) { pn.onclick = null; pn.oninput = null; pn.onchange = null; } // drop the last screen's handlers
  const item = NAV.find(([k]) => k === v); if (item && !canSee(item[2])) v = "dashboard";
  view = v; orderId = id || null;
  const adm = document.getElementById("adm"); if (adm) adm.classList.remove("menu");
  drawNav();
  await ({ dashboard, orders, neworder, fill, promo, ar, analytics, salescost, pnl, customers, reps, commissions, products, inventory, reports, discounts, page, settings, staff, account, setup, apps, geo, howto }[v] || dashboard)();
  if (v === "dashboard" && document.getElementById("hubKpi")) fillHubKpi();
  if (!opts.keepScroll) window.scrollTo(0, 0);
}
const pane = () => document.getElementById("pane");
const ro = () => (isOwner() ? "" : " disabled");

/* ---------- dashboard ---------- */
async function dashboard() {
  const s = stats || (await api("/stats"));
  if (isRep()) {
    const b = s.byStatus, c = s.rep ? s.rep.commission : { pending: 0, earned: 0, paid: 0 };
    pane().innerHTML = `<header><h1>Dashboard</h1><span class="muted" id="dashBuild">${BUILD ? `v${BUILD.version} · updated ${when(BUILD.updated)}` : ""}</span></header>
      <p class="muted">Your customers, their orders and your commissions. The office handles pricing, stock and shipping.</p>
      <dl class="kpis">
        <div class="kpi" data-go="orders:new"><dt>New orders</dt><dd>${b.new || 0}</dd></div>
        <div class="kpi" data-go="orders:confirmed"><dt>Waiting for payment</dt><dd>${b.confirmed || 0}</dd></div>
        <div class="kpi" data-go="orders:paid"><dt>Paid, to ship</dt><dd>${b.paid || 0}</dd></div>
        <div class="kpi" data-go="orders:shipped"><dt>Shipped</dt><dd>${b.shipped || 0}</dd></div>
        <div class="kpi" data-go="customers"><dt>My customers</dt><dd>${s.rep ? s.rep.customers : 0}</dd></div>
        <div class="kpi"><dt>Paid this month</dt><dd>${money(s.month.paid_cents)}</dd></div>
      </dl>
      <dl class="kpis">
        <div class="kpi" data-go="commissions"><dt>Commission pending</dt><dd>${money(c.pending)}</dd></div>
        <div class="kpi" data-go="commissions"><dt>Commission earned, owed</dt><dd>${money(c.earned)}</dd></div>
        <div class="kpi" data-go="commissions"><dt>Commission paid out</dt><dd>${money(c.paid)}</dd></div>
        ${HUB.linked && HUB.apps && HUB.apps.tracker ? `<div class="kpi" data-go="commissions" id="hubKpi"><dt>Surgical commission this month</dt><dd>…</dd></div>` : ""}
      </dl>
      <div class="panel"><h2>How it works</h2><p class="muted">Every order from one of your customers earns you ${me.commission_rate !== null && me.commission_rate !== undefined ? esc(Number(me.commission_rate)) + "%" : "a commission"} of the product total (after any discount, before shipping), whether you enter it or they order on the store themselves. Commission is <strong>pending</strong> until the office marks the order paid, then <strong>earned</strong> until it's paid out to you.</p></div>`;
    return;
  }
  Promise.all([api("/reports"), api("/products")]).then(([{ reports: R }, { products: P }]) => {
    const box = document.getElementById("linkCheck"); if (!box) return;
    const lone = R.filter((r) => r.active && !P.some((p) => p.active && reportMatches(p, r)));
    box.innerHTML = lone.length ? `<div class="panel"><strong>${lone.length} lab report${lone.length === 1 ? " isn't" : "s aren't"} attached to a product:</strong><span class="muted">${lone.map((r) => esc(`${r.product} ${r.strength}${r.sample ? " (" + r.sample + ")" : ""}`)).join(", ")}</span><div><button class="btn" data-nav="reports">Open lab reports</button></div></div>` : "";
  }).catch(() => {});
  const b = s.byStatus;
  const apv = [["orders:new", "🆕", "New orders to confirm", b.new || 0, "Confirm"], ["fill", "📦", "Orders to fill / ship", s.toFill || 0, "Fill"], ["customers", "🔑", "Customer PIN requests", s.pinRequests || 0, "Review"],
    ["ar", "⏰", "Invoices past due" + (s.overdue && s.overdue.cents ? " · " + money(s.overdue.cents) : ""), (s.overdue && s.overdue.n) || 0, "Open AR"], ["inventory", "📉", "Low or out of stock", (s.lowStock || []).length, "Reorder"], ["products", "🏷", "Products without a price", s.unpriced || 0, "Set prices"]].filter((x) => x[3] > 0);
  pane().innerHTML = `<header><h1>Dashboard</h1><span class="muted" id="dashBuild">${BUILD ? `v${BUILD.version} · updated ${when(BUILD.updated)}` : ""}</span></header>
    ${apv.length ? `<div class="panel" data-nofold style="border:2px solid var(--amber,#d97706);background:#fff8eb"><h2 style="margin:0">⚠️ ${apv.reduce((t, x) => t + x[3], 0)} need your attention</h2>
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,15rem),1fr));gap:.5rem">${apv.map(([go, ic, lab, n, btn]) => `<div style="display:flex;justify-content:space-between;align-items:center;gap:.5rem;background:#fff;border:1px solid var(--line);border-radius:10px;padding:.5rem .7rem"><span>${ic} <strong>${n}</strong> ${esc(lab)}</span><button class="btn solid" type="button" style="white-space:nowrap;flex:none" ${go.includes(":") ? `data-go="${go}"` : `data-nav="${go}"`}>${btn}</button></div>`).join("")}</div></div>` : `<div class="panel" data-nofold style="border-color:var(--green,#0a7)"><strong>✓ Nothing waiting on you.</strong></div>`}
    <dl class="kpis">
      <div class="kpi" data-go="orders:new"><dt>New orders</dt><dd>${b.new || 0}</dd></div>
      <div class="kpi" data-go="orders:confirmed"><dt>Waiting for payment</dt><dd>${b.confirmed || 0}</dd></div>
      <div class="kpi" data-go="orders:paid"><dt>Paid, to ship</dt><dd>${b.paid || 0}</dd></div>
      <div class="kpi" data-go="orders:shipped"><dt>Shipped</dt><dd>${b.shipped || 0}</dd></div>
      <div class="kpi"><dt>Paid this month</dt><dd>${money(s.month.paid_cents)}</dd></div>
      ${s.stockValue ? `<div class="kpi" data-nav="inventory"><dt>Inventory at cost</dt><dd>${money(s.stockValue.cents)}</dd></div>` : ""}
      ${HUB.linked ? `<div class="kpi" data-go="commissions" id="hubKpi"><dt>Commissions this month, both apps</dt><dd>…</dd></div>` : ""}
    </dl>
    <div id="linkCheck"></div>
    ${s.count && countDue(s.count.lastAt, s.count.dueDays) ? `<div class="panel"><strong>Weekly inventory count is due.</strong><span class="muted">${s.count.lastAt ? `Last count ${when(s.count.lastAt)}, ${agoText(s.count.lastAt)}.` : "No physical count has been posted yet."} Count the shelf, type the numbers in, post — differences are corrected and logged.</span><div><button class="btn" data-nav="inventory:count">Open count sheet</button></div></div>` : ""}
    ${s.unpriced ? `<div class="panel"><strong>${s.unpriced} product${s.unpriced === 1 ? " has" : "s have"} no price.</strong><span class="muted">They show "Ask for price" and can't be added to the cart.</span><div><button class="btn" data-nav="products">Set prices</button></div></div>` : ""}
    ${s.lowStock.length ? `<div class="panel"><h2>Low stock</h2><div class="tblwrap"><table class="tbl"><tr><th>Product</th><th class="num">Left</th><th class="num">Reorder at</th></tr>${s.lowStock.map((p) => `<tr><td>${esc(p.name)} ${esc(p.strength)}${p.manufacturer ? ` · ${esc(p.manufacturer)}` : ""}</td><td class="num">${p.stock}</td><td class="num">${p.reorder_at}</td></tr>`).join("")}</table></div><div><button class="btn" data-nav="inventory">Open inventory</button></div></div>` : ""}
    <div class="panel"><h2>How orders flow</h2><p class="muted">New → Confirmed (you've sent the total and payment info) → Paid → Shipped (add carrier and tracking) or Delivered. Orders paid by card through Stripe arrive already <em>paid</em>. Cancelling puts the stock back. Every order is also emailed to the address under Site settings → Order emails.</p></div>`;
}

function fillHubKpi() {
  const k = document.getElementById("hubKpi"); if (!k) return;
  const ym = new Date().toISOString().slice(0, 7), { from, to } = monthRange(ym);
  Promise.all([api("/hub/commissions?month=" + ym), isRep() ? Promise.resolve({ rows: [] }) : api("/commissions?" + new URLSearchParams({ from, to }).toString())]).then(([tr, st]) => {
    const dd = k.querySelector("dd"); if (!dd) return;
    const storeCents = (st.rows || []).filter((r) => r.comm_status !== "void").reduce((t, r) => t + r.commission_cents, 0);
    dd.textContent = tr.ok ? (isRep() ? usd(tr.total || 0) : usd(storeCents / 100 + (tr.total || 0))) : "tracker offline";
  }).catch(() => { const dd = k.querySelector("dd"); if (dd) dd.textContent = "tracker offline"; });
}
/* ---------- orders ---------- */
let oFilter = { status: "", q: "" };
/* ---------- record a payment (check, ACH, wire, cash…) ---------- */
function payForm(box, o, done) {
  const today = new Date().toLocaleDateString("en-CA");
  box.innerHTML = `<div class="panel" style="border-color:var(--blue);margin-top:.6rem"><h2 style="margin-top:0">Record payment · INV-${esc(o.number)}</h2><div class="row2" style="align-items:end;flex-wrap:wrap">
    <div class="field" style="max-width:10rem"><label class="eyebrow">Date received</label><input type="date" data-pd value="${today}" max="${today}"></div>
    <div class="field" style="max-width:9rem"><label class="eyebrow">Method</label><select data-pm>${[["check", "Check"], ["ach", "ACH"], ["wire", "Wire"], ["zelle", "Zelle"], ["cash", "Cash"], ["card", "Card (outside Stripe)"], ["other", "Other"]].map(([k, l]) => `<option value="${k}">${l}</option>`).join("")}</select></div>
    <div class="field" style="max-width:10rem"><label class="eyebrow">Check # / reference</label><input data-pr maxlength="80"></div>
    <div class="field" style="max-width:9rem"><label class="eyebrow">Amount</label><input data-pa inputmode="decimal" value="${((o.total_cents || 0) / 100).toFixed(2)}"></div>
    <button class="btn solid" type="button" data-psave>Mark paid</button><button class="btn" type="button" data-pcancel>Cancel</button></div></div>`;
  box.querySelector("[data-pcancel]").onclick = () => { box.innerHTML = ""; };
  box.querySelector("[data-psave]").onclick = async () => {
    const g = (k) => box.querySelector(`[data-${k}]`).value;
    try { await api(`/orders/${o.id}/payment`, { method: "POST", body: { date: g("pd"), method: g("pm"), ref: g("pr"), amount: g("pa") } }); toast(`INV-${o.number} marked paid`); paneDirty = false; done(); } catch (e) {}
  };
}
/* ---------- invoices & accounts receivable ---------- */
let arView = "customer", arBucket = "", arRep = "", arQ = "";
async function ar() {
  const { invoices, termsDays } = await api("/ar");
  const BUCKETS = [["current", "Current"], ["1-30", "1–30 days"], ["31-60", "31–60"], ["61-90", "61–90"], ["90+", "90+"]];
  const open = invoices.filter((i) => i.open), paid = invoices.filter((i) => !i.open);
  const sum = (l) => l.reduce((t, i) => t + i.total_cents, 0);
  const d = (x) => new Date(x).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "2-digit" });
  const inB = (i) => !arBucket || (arBucket === "past" ? i.bucket !== "current" : i.bucket === arBucket);
  const match = (i) => (!arRep || String(i.rep_id || "") === arRep) && (!arQ || `${i.number} ${i.customer} ${i.email} ${i.rep}`.toLowerCase().includes(arQ.toLowerCase()));
  const openF = open.filter(match), paidF = paid.filter(match);
  const reps = [...new Map(invoices.filter((i) => i.rep_id).map((i) => [String(i.rep_id), i.rep])).entries()];
  const pastDue = open.filter((i) => i.bucket !== "current");
  const pillB = (b) => `<span class="pill ${b === "current" ? "st-shipped" : b === "1-30" ? "st-new" : "st-cancelled"}">${b === "current" ? "Current" : b + " days"}</span>`;
  const group = (key, label) => { const m = new Map(); openF.filter(inB).forEach((i) => { const k = i[key] || "(none)"; const r = m.get(k) || { name: k, n: 0, total: 0, b: {} }; r.n++; r.total += i.total_cents; r.b[i.bucket] = (r.b[i.bucket] || 0) + i.total_cents; m.set(k, r); });
    const rows = [...m.values()].sort((a, b) => b.total - a.total);
    return rows.length ? `<div class="tblwrap"><table class="tbl compact"><thead><tr><th>${label}</th><th class="num">Invoices</th>${BUCKETS.map(([, l]) => `<th class="num">${l}</th>`).join("")}<th class="num">Total open</th></tr></thead><tbody>
      ${rows.map((r) => `<tr class="click" data-arpick="${esc(r.name)}" data-arkey="${key}"><td><strong>${esc(r.name)}</strong></td><td class="num">${r.n}</td>${BUCKETS.map(([k]) => `<td class="num">${r.b[k] ? money(r.b[k]) : "—"}</td>`).join("")}<td class="num"><strong>${money(r.total)}</strong></td></tr>`).join("")}
      <tr><td><strong>Total</strong></td><td class="num">${rows.reduce((t, r) => t + r.n, 0)}</td>${BUCKETS.map(([k]) => `<td class="num"><strong>${money(rows.reduce((t, r) => t + (r.b[k] || 0), 0))}</strong></td>`).join("")}<td class="num"><strong>${money(rows.reduce((t, r) => t + r.total, 0))}</strong></td></tr></tbody></table></div>` : `<p class="muted">No open invoices${arBucket ? " in this bucket" : ""}.</p>`; };
  const openTable = () => { const l = openF.filter(inB).sort((a, b) => (b.days_past_due ?? 0) - (a.days_past_due ?? 0));
    return l.length ? `<div class="tblwrap"><table class="tbl compact"><thead><tr><th>Invoice</th><th>Customer</th><th>Rep</th><th>Date</th><th>Due</th><th class="num">Days past due</th><th>Aging</th><th class="num">Amount</th><th></th></tr></thead><tbody>
      ${l.map((i) => `<tr data-inv="${i.id}"><td class="mono"><a href="#" data-openorder="${i.id}">INV-${esc(i.number)}</a></td><td>${esc(i.customer)}</td><td>${esc(i.rep || "—")}</td><td>${d(i.created_at)}</td><td>${d(i.due)}</td><td class="num">${i.days_past_due > 0 ? i.days_past_due : "—"}</td><td>${pillB(i.bucket)}</td><td class="num"><strong>${money(i.total_cents)}</strong></td>
        <td style="white-space:nowrap"><a class="btn" href="/api/admin/orders/${i.id}/invoice" target="_blank" rel="noopener" style="display:inline-grid;place-items:center;text-decoration:none">Invoice</a>${isRep() ? "" : ` <button class="btn solid" type="button" data-arpay="${i.id}">Record payment</button>`}</td></tr><tr><td colspan="9" style="padding:0;border:0"><div data-paybox="${i.id}"></div></td></tr>`).join("")}</tbody></table></div>` : `<p class="muted">No open invoices${arBucket ? " in this bucket" : ""}.</p>`; };
  const paidTable = () => { const l = paidF.sort((a, b) => new Date(b.paid_at) - new Date(a.paid_at)), avg = l.length ? Math.round(l.reduce((t, i) => t + i.days_to_pay, 0) / l.length) : 0;
    return l.length ? `<p class="muted">${l.length} paid · ${money(sum(l))} collected · average ${avg} day${avg === 1 ? "" : "s"} to pay.</p><div class="tblwrap"><table class="tbl compact"><thead><tr><th>Invoice</th><th>Customer</th><th>Rep</th><th>Invoice date</th><th>Paid</th><th>Method</th><th class="num">Days to pay</th><th class="num">Amount</th></tr></thead><tbody>
      ${l.map((i) => `<tr><td class="mono"><a href="#" data-openorder="${i.id}">INV-${esc(i.number)}</a></td><td>${esc(i.customer)}</td><td>${esc(i.rep || "—")}</td><td>${d(i.created_at)}</td><td>${d(i.paid_at)}</td><td>${esc(i.pay_method === "request" ? "" : i.pay_method || "")}${i.pay_ref ? ` #${esc(i.pay_ref)}` : ""}</td><td class="num">${i.days_to_pay}</td><td class="num">${money(i.paid_cents ?? i.total_cents)}</td></tr>`).join("")}</tbody></table></div>` : `<p class="muted">No paid invoices yet.</p>`; };
  pane().innerHTML = `<header><h1>Invoices &amp; AR</h1><a class="btn" href="#" id="arCsv">Export CSV</a></header>
    <p class="muted">Every order is an invoice (INV-&lt;order #&gt;). ${isRep() ? "Your customers' invoices." : "It's open until it's paid by card or a payment is recorded."} Aging counts days past the due date.</p>
    <dl class="kpis">
      <div class="kpi${!arBucket ? " on" : ""}" data-arb=""><dt>Open AR</dt><dd>${money(sum(open))}</dd></div>
      <div class="kpi${arBucket === "past" ? " on" : ""}" data-arb="past"><dt>Past due</dt><dd style="color:${sum(pastDue) ? "#b42318" : "inherit"}">${money(sum(pastDue))}</dd></div>
      ${BUCKETS.map(([k, l]) => `<div class="kpi${arBucket === k ? " on" : ""}" data-arb="${k}"><dt>${l}</dt><dd>${money(sum(open.filter((i) => i.bucket === k)))}</dd></div>`).join("")}
    </dl>
    ${isOwner() ? `<div class="row2" style="align-items:center;margin:.4rem 0"><span class="muted">New invoices are due</span><select id="arTerms">${[0, 7, 15, 30, 45, 60].map((n) => `<option value="${n}"${termsDays === n ? " selected" : ""}>${n ? `Net ${n}` : "On receipt"}</option>`).join("")}${[0, 7, 15, 30, 45, 60].includes(termsDays) ? "" : `<option selected value="${termsDays}">Net ${termsDays}</option>`}</select><span class="muted">(each invoice keeps the terms it was created with)</span></div>` : ""}
    <div class="row2" style="align-items:center;flex-wrap:wrap;margin:.6rem 0">
      <div class="seg" id="arSeg">${[["customer", "By customer"], ...(isRep() ? [] : [["rep", "By rep"]]), ["open", "Open invoices"], ["paid", "Paid invoices"]].map(([k, l]) => `<button type="button" data-arv="${k}"${arView === k ? ' class="on"' : ""}>${l}</button>`).join("")}</div>
      ${isRep() ? "" : `<select id="arRepSel"><option value="">All reps</option>${reps.map(([id, n]) => `<option value="${id}"${arRep === id ? " selected" : ""}>${esc(n)}</option>`).join("")}</select>`}
      <input id="arSearch" type="search" placeholder="Search invoice, customer" value="${esc(arQ)}" style="max-width:16rem">${arBucket ? `<button class="btn" type="button" data-arb="">Clear: ${esc(arBucket === "past" ? "past due" : arBucket)}</button>` : ""}</div>
    <div class="panel" id="arBody" data-nofold>${arView === "customer" ? group("customer", "Customer") : arView === "rep" ? group("rep", "Rep") : arView === "open" ? openTable() : paidTable()}</div>`;
  const P = pane();
  P.onclick = async (e) => {
    const b = e.target.closest("[data-arb]"); if (b) { arBucket = b.dataset.arb; if (arBucket && arView === "paid") arView = "open"; return ar(); }
    const v = e.target.closest("[data-arv]"); if (v) { arView = v.dataset.arv; return ar(); }
    const pk = e.target.closest("[data-arpick]"); if (pk) { arQ = pk.dataset.arkey === "customer" ? pk.dataset.arpick : arQ; if (pk.dataset.arkey === "rep") { const r = reps.find(([, n]) => n === pk.dataset.arpick); arRep = r ? r[0] : ""; } arView = "open"; return ar(); }
    const oo = e.target.closest("[data-openorder]"); if (oo) { e.preventDefault(); return go("orders", +oo.dataset.openorder); }
    const py = e.target.closest("[data-arpay]"); if (py) { const i = invoices.find((x) => x.id === +py.dataset.arpay); return payForm(P.querySelector(`[data-paybox="${i.id}"]`), { id: i.id, number: i.number, total_cents: i.total_cents }, ar); }
    if (e.target.id === "arCsv") { e.preventDefault();
      const rows = [["Invoice", "Customer", "Email", "Rep", "Invoice date", "Due", "Status", "Aging", "Days past due", "Amount", "Paid date", "Method", "Reference"], ...[...openF, ...paidF].map((i) => [`INV-${i.number}`, i.customer, i.email, i.rep, i.created_at.slice(0, 10), i.due.slice(0, 10), i.open ? "Open" : "Paid", i.open ? i.bucket : "", i.open && i.days_past_due > 0 ? i.days_past_due : "", (i.total_cents / 100).toFixed(2), i.paid_at ? String(i.paid_at).slice(0, 10) : "", i.pay_method === "request" ? "" : i.pay_method || "", i.pay_ref || ""])];
      const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([rows.map((r) => r.map((c) => `"${String(c ?? "").replace(/"/g, '""')}"`).join(",")).join("\r\n")], { type: "text/csv" })); a.download = `invoices-ar-${new Date().toLocaleDateString("en-CA")}.csv`; a.click(); }
  };
  if (document.getElementById("arRepSel")) document.getElementById("arRepSel").onchange = (e) => { arRep = e.target.value; ar(); };
  let t; document.getElementById("arSearch").oninput = (e) => { clearTimeout(t); t = setTimeout(() => { arQ = e.target.value; ar().then(() => { const s = document.getElementById("arSearch"); s.focus(); s.setSelectionRange(s.value.length, s.value.length); }); }, 300); };
  if (document.getElementById("arTerms")) document.getElementById("arTerms").onchange = async (e) => { await api("/ar/terms", { method: "PUT", body: { days: +e.target.value } }); toast("Terms for new invoices saved"); };
}
/* ---------- analytics ---------- */
let anMonths = 12, anRep = "";
const barChart = (data, { label, value, fmt, color = "var(--blue, #2563eb)", h = 180 }) => {
  if (!data.length) return '<p class="muted">No sales in this period yet.</p>';
  const max = Math.max(1, ...data.map(value)), w = 100 / data.length;
  return `<svg viewBox="0 0 100 ${h / 3}" preserveAspectRatio="none" style="width:100%;height:${h}px;display:block" role="img" aria-label="chart">${data.map((r, i) => { const bh = (value(r) / max) * (h / 3 - 2); return `<rect x="${i * w + w * 0.15}" y="${h / 3 - bh}" width="${w * 0.7}" height="${bh}" rx=".6" fill="${color}"><title>${esc(label(r))}: ${esc(fmt(value(r)))}</title></rect>`; }).join("")}</svg>
    <div style="display:grid;grid-template-columns:repeat(${data.length},1fr);font-size:.68rem;color:var(--muted);text-align:center;gap:2px;margin-top:4px">${data.map((r) => `<span title="${esc(fmt(value(r)))}" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(label(r))}</span>`).join("")}</div>
    <div style="display:grid;grid-template-columns:repeat(${data.length},1fr);font-size:.66rem;text-align:center;gap:2px">${data.map((r) => `<span style="overflow:hidden;white-space:nowrap">${esc(fmt(value(r)))}</span>`).join("")}</div>`;
};
/* ---------- sales & cost (admins): day / week / month / year, each period against the same period a year earlier ---------- */
let scG = "month", scN = 0;
async function salescost() {
  if (!isOwner()) return dashboard();
  const j = await api(`/sales-cost?g=${scG}${scN ? `&n=${scN}` : ""}`);
  const D = (iso) => new Date(iso + "T12:00:00Z"), iso = (d) => d.toISOString().slice(0, 10);
  const add = (d, k) => { const x = new Date(d); if (scG === "day") x.setUTCDate(x.getUTCDate() + k); else if (scG === "week") x.setUTCDate(x.getUTCDate() + 7 * k); else if (scG === "month") x.setUTCMonth(x.getUTCMonth() + k); else x.setUTCFullYear(x.getUTCFullYear() + k); return x; };
  const lyKey = (b) => { const d = D(b); if (scG === "week") d.setUTCDate(d.getUTCDate() - 364); else d.setUTCFullYear(d.getUTCFullYear() - 1); return iso(d); };
  const lyRow = (b) => { const k = lyKey(b); return j.prior.find((r) => r.b === k) || (scG === "week" ? j.prior.find((r) => Math.abs(D(r.b) - D(k)) < 4 * 864e5) : null); };
  const B = []; for (let d = D(j.from); iso(d) <= j.to; d = add(d, 1)) B.push(iso(d));
  const Z = { orders: 0, units: 0, sales: 0, cost: 0, nocost: 0 };
  const rows = B.map((b) => ({ b, ...(j.rows.find((r) => r.b === b) || Z), ly: lyRow(b) || Z }));
  const sum = (arr, k) => arr.reduce((t, r) => t + (r[k] || 0), 0);
  const T = { sales: sum(rows, "sales"), cost: sum(rows, "cost"), orders: sum(rows, "orders"), units: sum(rows, "units"), nocost: sum(rows, "nocost") };
  const L = { sales: rows.reduce((t, r) => t + r.ly.sales, 0), cost: rows.reduce((t, r) => t + r.ly.cost, 0), orders: rows.reduce((t, r) => t + r.ly.orders, 0) };
  const gp = (r) => r.sales - r.cost, mg = (r) => (r.sales ? Math.round((gp(r) / r.sales) * 1000) / 10 + "%" : "—");
  const yoy = (a, b) => (b ? `<span style="color:${a >= b ? "var(--green,#0a7)" : "var(--red,#c33)"}">${a >= b ? "▲" : "▼"} ${Math.abs(Math.round(((a - b) / Math.abs(b)) * 100))}%</span>` : a ? '<span class="muted">new</span>' : '<span class="muted">—</span>');
  const lab = (b) => { const d = D(b), o = { timeZone: "UTC" }; return scG === "day" ? d.toLocaleDateString("en-US", { ...o, month: "short", day: "numeric" }) : scG === "week" ? "Wk " + d.toLocaleDateString("en-US", { ...o, month: "short", day: "numeric" }) : scG === "month" ? d.toLocaleDateString("en-US", { ...o, month: "short", year: "2-digit" }) : String(d.getUTCFullYear()); };
  const k = (c) => (Math.abs(c) >= 100000 ? "$" + (c / 100000).toFixed(1) + "k" : money(c));
  // paired bars: this period (solid) vs a year earlier (light), gross profit as a dot
  const max = Math.max(1, ...rows.map((r) => Math.max(r.sales, r.ly.sales))), w = 100 / rows.length, H = 60, every = Math.ceil(rows.length / 12);
  const chart = `<svg viewBox="0 0 100 ${H}" preserveAspectRatio="none" style="width:100%;height:200px;display:block" role="img" aria-label="Sales this year vs last year">${rows.map((r, i) => { const a = (r.sales / max) * (H - 2), c = (r.ly.sales / max) * (H - 2), g = Math.max(0, (gp(r) / max) * (H - 2)); return `<rect x="${i * w + w * 0.12}" y="${H - c}" width="${w * 0.36}" height="${c}" fill="#9fb3d1"><title>${esc(lab(r.b))} last year ${money(r.ly.sales)}</title></rect><rect x="${i * w + w * 0.5}" y="${H - a}" width="${w * 0.38}" height="${a}" fill="var(--blue,#2563eb)"><title>${esc(lab(r.b))} sales ${money(r.sales)} · cost ${money(r.cost)} · GP ${money(gp(r))}</title></rect>${r.sales ? `<rect x="${i * w + w * 0.5}" y="${H - g - 0.6}" width="${w * 0.38}" height="1.2" fill="#0a7"/>` : ""}`; }).join("")}</svg>
    <div style="display:grid;grid-template-columns:repeat(${rows.length},1fr);font-size:.64rem;color:var(--muted);text-align:center;margin-top:4px">${rows.map((r, i) => `<span style="overflow:hidden;white-space:nowrap">${i % every === 0 ? esc(lab(r.b)) : ""}</span>`).join("")}</div>
    <div class="row2" style="gap:1rem;font-size:.75rem;margin-top:.4rem"><span><i style="display:inline-block;width:10px;height:10px;background:var(--blue,#2563eb)"></i> Sales</span><span><i style="display:inline-block;width:10px;height:10px;background:#9fb3d1"></i> Same period last year</span><span><i style="display:inline-block;width:10px;height:3px;background:#0a7;vertical-align:middle"></i> Gross profit</span></div>`;
  const N = { day: [7, 14, 31, 60, 92], week: [8, 13, 26, 52], month: [6, 12, 24, 36], year: [3, 5, 10] }[scG], unitName = { day: "days", week: "weeks", month: "months", year: "years" }[scG];
  pane().innerHTML = `<header><h1>Sales &amp; cost</h1><div class="row2" style="flex-wrap:wrap"><div class="seg">${[["day", "Day"], ["week", "Week"], ["month", "Month"], ["year", "Year"]].map(([v, l]) => `<button type="button" data-scg="${v}"${scG === v ? ' class="on"' : ""}>${l}</button>`).join("")}</div>
      <select id="scN">${N.map((x) => `<option value="${x}"${j.n === x ? " selected" : ""}>Last ${x} ${unitName}</option>`).join("")}</select><a class="btn" id="scCsv" href="#">Export CSV</a></div></header>
    <p class="muted">Sales = products after discounts, before shipping; cancelled orders excluded. Cost = each line's cost at the time of sale. Every period is compared with the same period a year earlier (YoY). ${esc(lab(j.from))} – ${esc(lab(j.to))}${scG === "day" || scG === "week" ? "" : " (current period to date)"}.</p>
    <dl class="kpis">
      <div class="kpi"><dt>Sales</dt><dd>${money(T.sales)}</dd><small class="muted">${yoy(T.sales, L.sales)} YoY · LY ${money(L.sales)}</small></div>
      <div class="kpi"><dt>Cost</dt><dd>${money(T.cost)}</dd><small class="muted">${yoy(T.cost, L.cost)} YoY · LY ${money(L.cost)}</small></div>
      <div class="kpi green"><dt>Gross profit</dt><dd>${money(gp(T))}</dd><small class="muted">${yoy(gp(T), gp(L))} YoY · LY ${money(gp(L))}</small></div>
      <div class="kpi"><dt>Margin</dt><dd>${mg(T)}</dd><small class="muted">LY ${mg(L)}</small></div>
      <div class="kpi"><dt>Orders</dt><dd>${T.orders}</dd><small class="muted">${yoy(T.orders, L.orders)} YoY · LY ${L.orders}</small></div>
      <div class="kpi"><dt>Avg order</dt><dd>${T.orders ? money(Math.round(T.sales / T.orders)) : "—"}</dd><small class="muted">LY ${L.orders ? money(Math.round(L.sales / L.orders)) : "—"}</small></div>
    </dl>
    ${T.nocost ? `<div class="panel" style="border-color:var(--amber,#d97706)"><strong>${T.nocost} unit${T.nocost === 1 ? "" : "s"} sold had no cost on file</strong><span class="muted"> — they count as $0 cost, so profit reads high. Add costs under Products &amp; prices; new orders pick them up.</span></div>` : ""}
    <div class="panel" data-nofold><h2>Sales vs last year</h2>${chart}</div>
    <div class="panel" data-nofold><h2>By ${scG}</h2><div class="tblwrap"><table class="tbl compact"><thead><tr><th>${scG[0].toUpperCase() + scG.slice(1)}</th><th class="num">Orders</th><th class="num">Units</th><th class="num">Sales</th><th class="num">Cost</th><th class="num">Gross profit</th><th class="num">Margin</th><th class="num">Sales LY</th><th class="num">Sales YoY</th><th class="num">GP LY</th><th class="num">GP YoY</th></tr></thead><tbody>
      ${rows.slice().reverse().map((r) => `<tr><td><strong>${esc(lab(r.b))}</strong></td><td class="num">${r.orders}</td><td class="num">${r.units}</td><td class="num">${money(r.sales)}</td><td class="num">${money(r.cost)}</td><td class="num"><strong>${money(gp(r))}</strong></td><td class="num">${mg(r)}</td><td class="num">${money(r.ly.sales)}</td><td class="num">${yoy(r.sales, r.ly.sales)}</td><td class="num">${money(gp(r.ly))}</td><td class="num">${yoy(gp(r), gp(r.ly))}</td></tr>`).join("")}
      <tr><td><strong>Total</strong></td><td class="num">${T.orders}</td><td class="num">${T.units}</td><td class="num">${money(T.sales)}</td><td class="num">${money(T.cost)}</td><td class="num"><strong>${money(gp(T))}</strong></td><td class="num">${mg(T)}</td><td class="num">${money(L.sales)}</td><td class="num">${yoy(T.sales, L.sales)}</td><td class="num">${money(gp(L))}</td><td class="num">${yoy(gp(T), gp(L))}</td></tr></tbody></table></div></div>
    <div class="panel" data-nofold><h2>By product · ${esc(lab(j.from))} – ${esc(lab(j.to))}</h2>${j.products.length ? `<div class="tblwrap"><table class="tbl compact"><thead><tr><th>Product</th><th class="num">Units</th><th class="num">Sales</th><th class="num">Cost</th><th class="num">Gross profit</th><th class="num">Margin</th></tr></thead><tbody>
      ${j.products.map((p) => `<tr><td>${esc(p.product)}${p.nocost ? ' <span class="pill st-cancelled" title="Some units had no cost on file">no cost</span>' : ""}</td><td class="num">${p.units}</td><td class="num">${money(p.sales)}</td><td class="num">${money(p.cost)}</td><td class="num"><strong>${money(gp(p))}</strong></td><td class="num">${mg(p)}</td></tr>`).join("")}</tbody></table></div>` : '<p class="muted">No sales in this period.</p>'}</div>`;
  document.querySelectorAll("[data-scg]").forEach((b) => { b.onclick = () => { scG = b.dataset.scg; scN = 0; salescost(); }; });
  document.getElementById("scN").onchange = (e) => { scN = +e.target.value; salescost(); };
  document.getElementById("scCsv").onclick = (e) => {
    e.preventDefault();
    const c = (v) => `"${String(v).replace(/"/g, '""')}"`, d = (x) => (x / 100).toFixed(2);
    const csv = [["Period", "Orders", "Units", "Sales", "Cost", "Gross profit", "Margin %", "Sales LY", "Cost LY", "GP LY"].map(c).join(",")].concat(rows.map((r) => [lab(r.b), r.orders, r.units, d(r.sales), d(r.cost), d(gp(r)), r.sales ? ((gp(r) / r.sales) * 100).toFixed(1) : "", d(r.ly.sales), d(r.ly.cost), d(gp(r.ly))].map(c).join(","))).join("\n");
    const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" })); a.download = `sales-cost-${scG}-${j.to}.csv`; a.click();
  };
}
/* ---------- profit / loss (admins) ---------- */
let pnlP = "month", pnlFrom = "", pnlTo = "";
async function pnl() {
  if (!isOwner()) return dashboard();
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "America/Chicago" }), [Y, M] = today.split("-").map(Number);
  const iso = (y, m, d) => new Date(Date.UTC(y, m - 1, d)).toISOString().slice(0, 10);
  const PRE = { month: ["This month", iso(Y, M, 1), today], last: ["Last month", iso(Y, M - 1, 1), iso(Y, M, 0)], quarter: ["This quarter", iso(Y, Math.floor((M - 1) / 3) * 3 + 1, 1), today],
    ytd: ["Year to date", iso(Y, 1, 1), today], t12: ["Last 12 months", iso(Y, M - 11, 1), today], lastyear: ["Last year", iso(Y - 1, 1, 1), iso(Y - 1, 12, 31)], custom: ["Custom", pnlFrom || iso(Y, M, 1), pnlTo || today] };
  const [, from, to] = PRE[pnlP] || PRE.month;
  const j = await api(`/pnl?from=${from}&to=${to}`);
  const C = j.cur, L = j.ly;
  const calc = (x) => { const net = x.gross - x.discounts, rev = net + x.shipping, gp = net - x.cogs, exp = x.commission, np = gp + x.shipping - exp; return { net, rev, gp, exp, np, gm: net ? gp / net : null, nm: rev ? np / rev : null }; };
  const c = calc(C), l = calc(L);
  const pctTxt = (v) => (v === null || !isFinite(v) ? "—" : Math.round(v * 1000) / 10 + "%");
  const chg = (a, b, goodUp = true) => { if (!b) return a ? '<span class="muted">new</span>' : '<span class="muted">—</span>'; const up = a >= b, good = up === goodUp; return `<span style="color:${good ? "var(--green,#0a7)" : "var(--red,#c33)"}">${up ? "▲" : "▼"} ${Math.abs(Math.round(((a - b) / Math.abs(b)) * 100))}%</span>`; };
  const neg = (v) => (v ? "(" + money(v) + ")" : money(0));
  const line = (lab, a, b, opt = {}) => `<tr${opt.total ? ' style="font-weight:700;border-top:2px solid var(--line-strong,#c9d1dc)"' : ""}><td${opt.indent ? ' style="padding-left:1.6rem"' : ""}>${lab}</td><td class="num">${opt.minus ? neg(a) : money(a)}</td><td class="num">${opt.minus ? neg(b) : money(b)}</td><td class="num">${opt.nochg ? "" : chg(a, b, !opt.minus)}</td></tr>`;
  const head = (lab) => `<tr><td colspan="4" class="eyebrow" style="padding-top:1rem">${lab}</td></tr>`;
  const lyLabel = `${j.ly_from} – ${j.ly_to}`;
  const mLabel = (ym) => new Date(ym + "-15T12:00:00Z").toLocaleDateString("en-US", { month: "short", year: "2-digit", timeZone: "UTC" });
  const turn = C.cogs ? j.inventory.value / (C.cogs / Math.max(1, (new Date(to) - new Date(from)) / 864e5 + 1)) : null; // days of stock at this period's pace
  pane().innerHTML = `<header><h1>Profit / loss</h1><div class="row2" style="flex-wrap:wrap"><select id="plP">${Object.entries(PRE).map(([k, v]) => `<option value="${k}"${pnlP === k ? " selected" : ""}>${v[0]}</option>`).join("")}</select>
      <span id="plCustom"${pnlP === "custom" ? "" : " hidden"}><input type="date" id="plF" value="${from}"> – <input type="date" id="plT" value="${to}"> <button class="btn" type="button" id="plGo">Show</button></span></div></header>
    <p class="muted">${esc(from)} – ${esc(to)}, compared with the same dates last year (${esc(lyLabel)}). Cancelled orders left out. Cost of goods = each order line's cost at the time of sale. Commissions = what reps earn on these orders (pending, earned and paid out). Expenses not kept in this app (card fees, rent, payroll) aren't included.</p>
    <dl class="kpis">
      <div class="kpi"><dt>Revenue</dt><dd>${money(c.rev)}</dd><small class="muted">${chg(c.rev, l.rev)} vs LY ${money(l.rev)}</small></div>
      <div class="kpi"><dt>Gross profit</dt><dd>${money(c.gp)}</dd><small class="muted">${pctTxt(c.gm)} margin · LY ${pctTxt(l.gm)}</small></div>
      <div class="kpi ${c.np >= 0 ? "green" : ""}"><dt>${c.np >= 0 ? "Net profit" : "Net loss"}</dt><dd style="${c.np < 0 ? "color:var(--red,#c33)" : ""}">${c.np < 0 ? "(" + money(-c.np) + ")" : money(c.np)}</dd><small class="muted">${chg(c.np, l.np)} vs LY ${money(l.np)}</small></div>
      <div class="kpi"><dt>Net margin</dt><dd>${pctTxt(c.nm)}</dd><small class="muted">LY ${pctTxt(l.nm)}</small></div>
    </dl>
    ${C.nocost ? `<div class="panel" style="border-color:var(--amber,#d97706)"><strong>${C.nocost} unit${C.nocost === 1 ? "" : "s"} sold had no cost on file</strong><span class="muted"> — counted at $0, so profit reads high. Add costs under Products &amp; prices.</span></div>` : ""}
    <div class="panel" data-nofold><h2>Statement</h2><div class="tblwrap"><table class="tbl compact" data-noflip style="min-width:0"><thead><tr><th></th><th class="num">This period</th><th class="num">Last year</th><th class="num">Change</th></tr></thead><tbody>
      ${head("Revenue")}${line("Product sales (before discounts)", C.gross, L.gross, { indent: 1 })}${line("Discounts", C.discounts, L.discounts, { indent: 1, minus: 1 })}${line("Net product sales", c.net, l.net, { indent: 1 })}${line("Shipping charged", C.shipping, L.shipping, { indent: 1 })}${line("Total revenue", c.rev, l.rev, { total: 1 })}
      ${head("Cost of goods sold")}${line("Product cost of what sold", C.cogs, L.cogs, { indent: 1, minus: 1 })}${line(`Gross profit · ${pctTxt(c.gm)} of net sales`, c.gp, l.gp, { total: 1 })}
      ${head("Expenses")}${line("Sales rep commissions", C.commission, L.commission, { indent: 1, minus: 1 })}
      ${line(c.np >= 0 ? "Net profit" : "Net loss", c.np, l.np, { total: 1 })}</tbody></table></div></div>
    <hr style="border:0;border-top:2px dashed var(--line-strong,#c9d1dc);margin:1.4rem 0 .4rem"><p class="eyebrow" style="margin:0 0 .6rem">Below the line · inventory &amp; purchases</p>
    <dl class="kpis">
      <div class="kpi"><dt>Inventory on hand · at cost</dt><dd>${money(j.inventory.value)}</dd><small class="muted">${j.inventory.units} units today${j.inventory.nocost ? ` · ${j.inventory.nocost} tracked products have no cost` : ""}</small></div>
      <div class="kpi"><dt>Purchases · received at cost</dt><dd>${money(C.purchases)}</dd><small class="muted">${C.purchased_units} units · LY ${money(L.purchases)}</small></div>
      <div class="kpi"><dt>Cost of what sold</dt><dd>${money(C.cogs)}</dd><small class="muted">${C.units} units sold</small></div>
      <div class="kpi"><dt>Purchases vs sales</dt><dd>${C.cogs ? (C.purchases / C.cogs).toFixed(2) + "×" : "—"}</dd><small class="muted">${C.purchases >= C.cogs ? `Stock grew ${money(C.purchases - C.cogs)} at cost` : `Stock drew down ${money(C.cogs - C.purchases)} at cost`}</small></div>
      <div class="kpi"><dt>Counts &amp; manual changes · at cost</dt><dd>${C.adjustments < 0 ? "(" + money(-C.adjustments) + ")" : money(C.adjustments)}</dd><small class="muted">Physical counts, imports and edits to stock (setting starting stock shows here too)</small></div>
      <div class="kpi"><dt>Days of stock</dt><dd>${turn ? Math.round(turn) : "—"}</dd><small class="muted">On-hand value ÷ this period's daily cost of sales</small></div>
    </dl>
    <div class="panel" data-nofold><h2>Purchases vs sales by month</h2><div class="tblwrap"><table class="tbl compact"><thead><tr><th>Month</th><th class="num">Net sales</th><th class="num">Cost of what sold</th><th class="num">Purchases</th><th class="num">Purchases − cost sold</th></tr></thead><tbody>
      ${j.months.map((m) => `<tr><td><strong>${esc(mLabel(m.ym))}</strong></td><td class="num">${money(m.sales)}</td><td class="num">${money(m.cogs)}</td><td class="num">${money(m.purchases)}</td><td class="num" style="color:${m.purchases - m.cogs >= 0 ? "inherit" : "var(--red,#c33)"}">${m.purchases - m.cogs < 0 ? "(" + money(m.cogs - m.purchases) + ")" : money(m.purchases - m.cogs)}</td></tr>`).join("")}
      <tr style="font-weight:700"><td>Total</td><td class="num">${money(j.months.reduce((t, m) => t + m.sales, 0))}</td><td class="num">${money(j.months.reduce((t, m) => t + m.cogs, 0))}</td><td class="num">${money(j.months.reduce((t, m) => t + m.purchases, 0))}</td><td class="num">${(() => { const v = j.months.reduce((t, m) => t + m.purchases - m.cogs, 0); return v < 0 ? "(" + money(-v) + ")" : money(v); })()}</td></tr></tbody></table></div>
      <p class="muted">Purchases come from Inventory → Receive shipment (at the cost entered there). Positive = bought more than sold (stock building); in brackets = sold more than bought. Whole months shown.</p></div>`;
  document.getElementById("plP").onchange = (e) => { pnlP = e.target.value; pnl(); };
  if (document.getElementById("plGo")) document.getElementById("plGo").onclick = () => { pnlFrom = document.getElementById("plF").value; pnlTo = document.getElementById("plT").value; if (pnlFrom && pnlTo && pnlFrom <= pnlTo) pnl(); else toast("Pick a start date before the end date"); };
}
async function analytics() {
  const j = await api(`/analytics?months=${anMonths}${anRep ? `&rep=${anRep}` : ""}`);
  const ymLabel = (ym) => { const [y, m] = ym.split("-"); return new Date(+y, +m - 1, 1).toLocaleDateString("en-US", { month: "short" }) + (m === "01" ? ` ’${y.slice(2)}` : ""); };
  // fill missing months so the trend has no gaps
  const months = []; { const now = new Date(); for (let i = j.months - 1; i >= 0; i--) { const d = new Date(now.getFullYear(), now.getMonth() - i, 1); months.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`); } }
  const M = months.map((ym) => j.monthly.find((r) => r.ym === ym) || { ym, orders: 0, sales: 0, billed: 0, collected: 0, customers: 0, units: 0 });
  const cur = M[M.length - 1], prev = M[M.length - 2] || { sales: 0, orders: 0 };
  const pct = (a, b) => (b ? `${a >= b ? "▲" : "▼"} ${Math.abs(Math.round(((a - b) / b) * 100))}% vs last month` : "");
  const k = (c) => (c >= 100000 ? "$" + (c / 100000).toFixed(1) + "k" : money(c));
  const totalSales = j.byRep.reduce((t, r) => t + r.sales, 0) || 1;
  const repNames = [...new Set(j.repMonthly.map((r) => r.rep))].sort();
  pane().innerHTML = `<header><h1>Analytics</h1><div class="row2"><select id="anMonths">${[3, 6, 12, 24].map((n) => `<option value="${n}"${anMonths === n ? " selected" : ""}>Last ${n} months</option>`).join("")}</select>
      ${isRep() ? "" : `<select id="anRep"><option value="">All reps</option>${j.reps.map((r) => `<option value="${r.id}"${String(anRep) === String(r.id) ? " selected" : ""}>${esc(r.name)}</option>`).join("")}</select>`}</div></header>
    <p class="muted">Sales = products after discounts, before shipping; cancelled orders excluded.${isRep() ? " Your customers only." : ""}</p>
    <dl class="kpis">
      <div class="kpi"><dt>Sales · this month</dt><dd>${money(cur.sales)}</dd><small class="muted">${pct(cur.sales, prev.sales)}</small></div>
      <div class="kpi"><dt>Orders · this month</dt><dd>${cur.orders}</dd><small class="muted">${pct(cur.orders, prev.orders)}</small></div>
      <div class="kpi"><dt>Sales · ${j.months} months</dt><dd>${money(j.totals.sales)}</dd></div>
      <div class="kpi"><dt>Orders · ${j.months} months</dt><dd>${j.totals.orders}</dd></div>
      <div class="kpi"><dt>Average order</dt><dd>${money(j.totals.avg_order)}</dd></div>
      <div class="kpi"><dt>Vials sold</dt><dd>${M.reduce((t, r) => t + (r.units || 0), 0)}</dd></div></dl>
    <div class="panel" data-nofold><h2>Sales by month</h2>${barChart(M, { label: (r) => ymLabel(r.ym), value: (r) => r.sales, fmt: k })}</div>
    <div class="grid2"><div class="panel" data-nofold><h2>Orders by month</h2>${barChart(M, { label: (r) => ymLabel(r.ym), value: (r) => r.orders, fmt: (v) => String(v), color: "#0f7c8c", h: 140 })}</div>
      <div class="panel" data-nofold><h2>Sales by week · last 13 weeks</h2>${barChart(j.weekly, { label: (r) => new Date(r.wk + "T12:00:00").toLocaleDateString("en-US", { month: "numeric", day: "numeric" }), value: (r) => r.sales, fmt: k, color: "#6b4bd6", h: 140 })}</div></div>
    ${isRep() ? "" : `<div class="panel" data-nofold><h2>By rep</h2><div class="tblwrap"><table class="tbl compact"><thead><tr><th>Rep</th><th class="num">Sales</th><th>Share</th><th class="num">Orders</th><th class="num">Customers</th><th class="num">Avg order</th><th class="num">Open AR</th></tr></thead><tbody>
      ${j.byRep.map((r) => `<tr class="click" data-anrep="${r.rep_id || ""}"><td><strong>${esc(r.rep)}</strong></td><td class="num">${money(r.sales)}</td><td style="min-width:8rem"><div style="background:var(--line,#e5e7eb);border-radius:4px;height:8px"><div style="width:${Math.round((r.sales / totalSales) * 100)}%;background:var(--blue,#2563eb);height:8px;border-radius:4px"></div></div><small class="muted">${Math.round((r.sales / totalSales) * 100)}%</small></td><td class="num">${r.orders}</td><td class="num">${r.customers}</td><td class="num">${money(r.orders ? Math.round(r.sales / r.orders) : 0)}</td><td class="num">${r.open_ar ? money(r.open_ar) : "—"}</td></tr>`).join("") || '<tr><td colspan="7" class="muted">No sales yet.</td></tr>'}</tbody></table></div>
      ${repNames.length ? `<h2 style="font-size:1rem;margin-top:1rem">Rep sales by month</h2><div class="tblwrap"><table class="tbl compact"><thead><tr><th>Rep</th>${months.map((ym) => `<th class="num">${ymLabel(ym)}</th>`).join("")}<th class="num">Total</th></tr></thead><tbody>
        ${repNames.map((n) => { const row = months.map((ym) => (j.repMonthly.find((r) => r.rep === n && r.ym === ym) || { sales: 0 }).sales); return `<tr><td><strong>${esc(n)}</strong></td>${row.map((v) => `<td class="num">${v ? k(v) : "—"}</td>`).join("")}<td class="num"><strong>${k(row.reduce((t, v) => t + v, 0))}</strong></td></tr>`; }).join("")}</tbody></table></div>` : ""}</div>`}
    <div class="grid2"><div class="panel" data-nofold><h2>Top products</h2><div class="tblwrap"><table class="tbl compact"><thead><tr><th>Product</th><th class="num">Vials</th><th class="num">Sales</th>${isOwner() ? '<th class="num">Margin</th>' : ""}</tr></thead><tbody>
        ${j.products.map((p) => `<tr><td>${esc(p.product)}</td><td class="num">${p.units}</td><td class="num">${money(p.sales)}</td>${isOwner() ? `<td class="num">${p.cost ? Math.round(((p.sales - p.cost) / p.sales) * 100) + "%" : "—"}</td>` : ""}</tr>`).join("") || '<tr><td colspan="4" class="muted">No sales yet.</td></tr>'}</tbody></table></div></div>
      <div class="panel" data-nofold><h2>Top customers</h2><div class="tblwrap"><table class="tbl compact"><thead><tr><th>Customer</th><th class="num">Orders</th><th class="num">Sales</th><th>Last order</th></tr></thead><tbody>
        ${j.customers.map((c) => `<tr><td>${esc(c.customer)}</td><td class="num">${c.orders}</td><td class="num">${money(c.sales)}</td><td>${new Date(c.last_order).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</td></tr>`).join("") || '<tr><td colspan="4" class="muted">No sales yet.</td></tr>'}</tbody></table></div></div></div>`;
  document.getElementById("anMonths").onchange = (e) => { anMonths = +e.target.value; analytics(); };
  if (document.getElementById("anRep")) document.getElementById("anRep").onchange = (e) => { anRep = e.target.value; analytics(); };
  pane().onclick = (e) => { const r = e.target.closest("[data-anrep]"); if (r && r.dataset.anrep) { anRep = r.dataset.anrep; analytics(); window.scrollTo(0, 0); } };
}
/* ---------- promo banner: admins and managers ---------- */
async function promo() {
  if (isRep()) return dashboard();
  const $ = (x) => document.getElementById(x);
  const b = await api("/banner");
  const TONES = [["navy", "360 Medical blue", "#0b4d96", "#fff"], ["teal", "Teal", "#0f7c8c", "#fff"], ["gold", "Gold", "#f4c542", "#2b2100"], ["red", "Red", "#b42318", "#fff"]];
  const live = b.on && b.text && (!b.until || b.until >= new Date().toLocaleDateString("en-CA"));
  pane().innerHTML = `<header><h1>Promo banner</h1></header>
    <div class="panel" data-nofold><div class="row2" style="justify-content:space-between;align-items:center"><h2 style="margin:0">Status: ${live ? '<span class="pill st-shipped">Running</span>' : b.on && b.until ? '<span class="pill st-cancelled">Ended</span>' : '<span class="pill">Off</span>'}</h2>
      ${live ? '<button class="btn danger" type="button" id="bnHalt">Halt banner</button>' : '<button class="btn solid" type="button" id="bnGo">Start banner</button>'}</div>
      <p class="muted">The strip across the top of every store page. Admins and managers can change or stop it any time; changes show on the store right away.</p></div>
    <div class="panel" data-nofold><h2>Banner</h2>
      <div class="field"><label class="eyebrow" for="bnText">Banner text</label><input id="bnText" maxlength="300" value="${esc(b.text)}" placeholder="e.g. 15% off BPC-157 this week · code FALL15"></div>
      <div class="row2" style="flex-wrap:wrap;align-items:end">
        <div class="field"><span class="eyebrow">Color</span><div class="seg" id="bnTone">${TONES.map(([k, l, bg, fg]) => `<button type="button" data-tone="${k}"${b.tone === k ? ' class="on"' : ""} style="background:${bg};color:${fg}">${l}</button>`).join("")}</div></div>
        <label class="chk"><input type="checkbox" id="bnScroll"${b.scroll ? " checked" : ""}> Scroll the text</label>
        <label class="chk" title="The banner stays at the top of the screen while customers scroll down the page"><input type="checkbox" id="bnSticky"${b.sticky !== false ? " checked" : ""}> Keep it locked at the top while scrolling</label>
        <div class="field" id="bnSpeedWrap" style="min-width:15rem"${b.scroll ? "" : " hidden"}><label class="eyebrow" for="bnSpeed">Scroll speed · <span id="bnSpeedLbl"></span></label><div class="row2" style="align-items:center;flex-wrap:nowrap"><span class="muted">Slow</span><input id="bnSpeed" type="range" min="6" max="90" step="1" value="${96 - (b.speed || 30)}" style="flex:1"><span class="muted">Fast</span></div></div>
        <div class="field" style="max-width:11rem"><label class="eyebrow" for="bnUntil">Run until (optional)</label><input id="bnUntil" type="date" value="${esc(b.until)}"></div>
        <div class="field" style="min-width:14rem;flex:1"><label class="eyebrow" for="bnLink">Link when tapped (optional)</label><input id="bnLink" value="${esc(b.link)}" placeholder="/ or https://…"></div></div>
      <p class="eyebrow" style="margin-top:.8rem">Preview</p><div id="bnPrev" style="border-radius:10px;overflow:hidden"></div>
      <div class="row2" style="margin-top:.8rem"><button class="btn solid" type="button" id="bnSave">Save${live ? "" : " (stays off)"}</button><span class="muted">Leave "Run until" blank to keep it up until you halt it.</span></div></div>`;
  let tone = b.tone || "navy";
  const speed = () => 96 - Number($("bnSpeed").value); // slider left = slow (more seconds per pass)
  const speedName = (sec) => (sec >= 55 ? "very slow" : sec >= 38 ? "slow" : sec >= 24 ? "normal" : sec >= 14 ? "fast" : "very fast");
  const vals = () => ({ text: $("bnText").value.trim(), scroll: $("bnScroll").checked, tone, until: $("bnUntil").value, link: $("bnLink").value.trim(), speed: speed(), sticky: $("bnSticky").checked });
  const prev = () => { const v = vals(), [, , bg, fg] = TONES.find((t) => t[0] === v.tone) || TONES[0], txt = v.text || "Your banner text";
    $("bnSpeedWrap").hidden = !v.scroll; $("bnSpeedLbl").textContent = speedName(v.speed);
    $("bnPrev").innerHTML = `<div style="background:${bg};color:${fg};font-size:.84rem;font-weight:600;padding:.5rem 0;white-space:nowrap;overflow:hidden;display:flex">${v.scroll ? [0, 1].map(() => `<div style="display:flex;flex:none;animation:marquee ${v.speed}s linear infinite">${(`<span style="padding:0 2rem">${esc(txt)}</span>`).repeat(6)}</div>`).join("") : `<div style="text-align:center;white-space:normal;width:100%">${esc(txt)}</div>`}</div>`; };
  prev();
  if (!document.getElementById("mqkf")) { const st = document.createElement("style"); st.id = "mqkf"; st.textContent = "@keyframes marquee{from{transform:translateX(0)}to{transform:translateX(-100%)}}"; document.head.appendChild(st); }
  pane().oninput = prev; pane().onchange = prev;
  $("bnTone").onclick = (e) => { const t = e.target.closest("[data-tone]"); if (!t) return; tone = t.dataset.tone; $("bnTone").querySelectorAll("button").forEach((x) => x.classList.toggle("on", x === t)); prev(); };
  const save = async (on, msg) => { try { await api("/banner", { method: "PUT", body: { ...vals(), on } }); toast(msg); paneDirty = false; promo(); } catch (e) {} };
  $("bnSave").onclick = () => save(live, live ? "Banner updated" : "Saved (banner is off)");
  if ($("bnGo")) $("bnGo").onclick = () => { if (!vals().text) { $("bnText").focus(); return toast("Type the banner text first"); } if (vals().until && vals().until < new Date().toLocaleDateString("en-CA")) return toast("The Run until date has passed"); save(true, "Banner is live on the store"); };
  if ($("bnHalt")) $("bnHalt").onclick = () => save(false, "Banner halted");
}
/* ---------- fill orders: admins and managers pick, pack and ship ---------- */
let fillTab = "tofill";
async function fill() {
  if (isRep()) return dashboard();
  const { orders: all } = await api("/fill");
  const toFill = all.filter((o) => !o.filled_at), toShip = all.filter((o) => o.filled_at);
  const list = fillTab === "tofill" ? toFill : toShip;
  const addrOf = (o) => { const a = o.address || {}; return [a.line1, a.line2, `${a.city || ""}, ${a.state || ""} ${a.zip || ""}`].filter((x) => x && x.trim() !== ",").map(esc).join("<br>"); };
  const short = (i) => i.stock !== null && i.stock !== undefined && i.stock < 0;
  const bizDays = (n) => { const d = new Date(); while (n > 0) { d.setDate(d.getDate() + 1); if (d.getDay() !== 0 && d.getDay() !== 6) n--; } return d.toISOString().slice(0, 10); };
  const today = new Date().toISOString().slice(0, 10);
  const shipFields = (o) => { const delivery = o.fulfillment === "delivery";
    return `<div class="row2" style="align-items:end;margin-top:.6rem;flex-wrap:wrap">
      ${delivery ? "" : `<div class="field" style="max-width:9rem"><label class="eyebrow">Carrier</label><select data-carrier>${["UPS", "FedEx", "USPS", "DHL", "Other"].map((c) => `<option${o.carrier === c ? " selected" : ""}>${c}</option>`).join("")}</select></div>
      <div class="field" style="max-width:16rem"><label class="eyebrow">Tracking # (required)</label><input data-tracking value="${esc(o.tracking || "")}" placeholder="Paste or scan"></div>`}
      <div class="field" style="max-width:11rem"><label class="eyebrow">${delivery ? "Delivery date" : "Estimated arrival"} (required)</label><input type="date" data-eta min="${today}" value="${o.eta ? String(o.eta).slice(0, 10) : bizDays(delivery ? 1 : 3)}"></div></div>`; };
  const card = (o) => {
    const delivery = o.fulfillment === "delivery", paid = !!o.paid_at;
    return `<div class="panel fillcard" data-fid="${o.id}">
      <div class="row2" style="justify-content:space-between;align-items:baseline"><h2 style="margin:0"><a href="#" data-openorder="${o.id}">Order ${esc(o.number)}</a></h2>
        <span>${paid ? '<span class="pill st-paid">Paid</span>' : '<span class="pill st-confirmed">Not paid yet</span>'} <span class="pill">${delivery ? "Local delivery" : "Ship"}</span></span></div>
      <p class="muted" style="margin:.2rem 0 .5rem">${when(o.created_at)}${o.rep_name ? ` · rep ${esc(o.rep_name)}` : ""}${o.filled_at ? ` · filled by ${esc(o.filled_by || "—")} ${when(o.filled_at)}` : ""}</p>
      <div class="grid2"><div><p class="eyebrow">${delivery ? "Deliver to" : "Ship to"}</p><p><strong>${esc(o.name)}</strong>${o.phone ? ` · ${esc(o.phone)}` : ""}<br>${addrOf(o)}</p>
        ${o.customer_note ? `<p class="muted"><strong>Customer note:</strong> ${esc(o.customer_note)}</p>` : ""}${o.internal_note ? `<p class="muted"><strong>Internal:</strong> ${esc(o.internal_note)}</p>` : ""}</div>
      <div><p class="eyebrow">${o.filled_at ? "Packed" : "Pick list · tick each as you pull it"}</p>
        <table class="tbl compact"><tbody>${o.items.map((i, n) => `<tr>${o.filled_at ? "" : `<td style="width:2rem"><input type="checkbox" data-pick="${n}" aria-label="Picked ${esc(i.name)}"></td>`}<td class="num" style="width:3rem"><strong>${i.qty}×</strong></td><td>${esc(`${i.name} ${i.strength}`.trim())}${i.manufacturer ? ` <span class="muted">· ${esc(i.manufacturer)}</span>` : ""}${short(i) ? ` <span class="pill st-cancelled" title="Sold past what was on the shelf">backordered (${i.stock})</span>` : ""}</td></tr>`).join("")}</tbody></table></div></div>
      ${o.filled_at ? `${shipFields(o)}<div class="row2" style="margin-top:.6rem"><button class="btn solid" type="button" data-ship>${delivery ? "Send out for delivery" : "Ship"} &amp; email customer</button><button class="btn" type="button" data-unfill>Undo filled</button><button class="btn" type="button" data-slip>Packing slip</button></div>`
        : `${shipFields(o)}<div class="row2" style="margin-top:.6rem"><button class="btn solid" type="button" data-fillship disabled>${o.fulfillment === "delivery" ? "Fill &amp; send out for delivery" : "Fill &amp; ship"}</button><button class="btn" type="button" data-slip>Packing slip</button><span class="muted" data-pickleft>Tick all ${o.items.length} line${o.items.length === 1 ? "" : "s"}, then add the shipping info.</span></div>
          <p class="muted" style="margin:.3rem 0 0">This marks the order filled and shipped and emails the customer their tracking and estimated arrival${o.rep_name ? " (and the rep)" : ""}.</p>`}
    </div>`;
  };
  pane().innerHTML = `<header><h1>Fill orders</h1></header>
    <p class="muted">Only admins and managers fill orders. Reps and customers place orders; changes to an order are made here or on the order itself by the office.</p>
    <div class="seg" style="margin-bottom:.8rem"><button type="button" data-filltab="tofill"${fillTab === "tofill" ? ' class="on"' : ""}>To fill · ${toFill.length}</button><button type="button" data-filltab="toship"${fillTab === "toship" ? ' class="on"' : ""}>Filled, to ship · ${toShip.length}</button></div>
    ${list.length ? list.map(card).join("") : `<div class="panel"><p class="muted">${fillTab === "tofill" ? "Nothing to fill. New orders show up here as they come in." : "Nothing waiting to ship."}</p></div>`}`;
  const P = pane();
  const ready = (c) => { const boxes = [...c.querySelectorAll("[data-pick]")], left = boxes.filter((b) => !b.checked).length, tr = c.querySelector("[data-tracking]"), eta = c.querySelector("[data-eta]");
    const missing = [left ? `${left} line${left === 1 ? "" : "s"} to pick` : "", tr && !tr.value.trim() ? "tracking #" : "", eta && !eta.value ? "estimated arrival" : ""].filter(Boolean);
    const b = c.querySelector("[data-fillship]"); if (b) b.disabled = missing.length > 0; const m = c.querySelector("[data-pickleft]"); if (m) m.textContent = missing.length ? "Still needed: " + missing.join(", ") + "." : "Ready.";
    return !missing.length; };
  P.onchange = P.oninput = (e) => { const c = e.target.closest(".fillcard"); if (c && c.querySelector("[data-fillship]")) ready(c); };
  const shipBody = (c, o) => { const delivery = o.fulfillment === "delivery", body = { status: "shipped", notify: true, eta: c.querySelector("[data-eta]").value };
    if (!delivery) { body.carrier = c.querySelector("[data-carrier]").value; body.tracking = c.querySelector("[data-tracking]").value.trim(); } return body; };
  P.onclick = async (e) => {
    const t = e.target.closest("[data-filltab]"); if (t) { fillTab = t.dataset.filltab; return fill(); }
    const oo = e.target.closest("[data-openorder]"); if (oo) { e.preventDefault(); return go("orders", +oo.dataset.openorder); }
    const c = e.target.closest(".fillcard"); if (!c) return; const id = +c.dataset.fid, o = all.find((x) => x.id === id);
    if (e.target.closest("[data-fillship]")) {
      if (!ready(c)) return; const btn = e.target.closest("[data-fillship]"); btn.disabled = true; btn.textContent = "Working…";
      try { await api(`/orders/${id}/fill`, { method: "POST", body: { filled: true } }); await api(`/orders/${id}`, { method: "PATCH", body: shipBody(c, o) }); toast(`Order ${o.number} filled and shipped — customer emailed`); }
      catch (x) { toast("Filled, but shipping didn't save — finish it under Filled, to ship"); }
      await drawNav(); return fill();
    }
    if (e.target.closest("[data-unfill]")) { await api(`/orders/${id}/fill`, { method: "POST", body: { filled: false } }); toast("Back to To fill"); await drawNav(); return fill(); }
    if (e.target.closest("[data-ship]")) {
      const body = shipBody(c, o); if (o.fulfillment !== "delivery" && !body.tracking) return toast("Add the tracking number"); if (!body.eta) return toast("Add the estimated arrival");
      await api(`/orders/${id}`, { method: "PATCH", body }); toast(`Order ${o.number} shipped — customer emailed`); await drawNav(); return fill();
    }
    if (e.target.closest("[data-slip]")) {
      const w = window.open("", "_blank"); if (!w) return toast("Allow pop-ups to print the slip");
      w.document.write(`<!doctype html><meta charset="utf-8"><title>Packing slip ${esc(o.number)}</title><style>body{font:14px/1.45 system-ui,sans-serif;margin:32px;color:#111}h1{font-size:20px;margin:0 0 4px}table{width:100%;border-collapse:collapse;margin-top:16px}td,th{border-bottom:1px solid #ddd;padding:8px;text-align:left}.n{text-align:right;width:4rem}.box{width:1.2rem;height:1.2rem;border:1.5px solid #333;display:inline-block}</style>
        <h1>Packing slip · Order ${esc(o.number)}</h1><div>${when(o.created_at)}</div><p><strong>${esc(o.name)}</strong>${o.phone ? ` · ${esc(o.phone)}` : ""}<br>${addrOf(o)}</p>${o.customer_note ? `<p><em>Note: ${esc(o.customer_note)}</em></p>` : ""}
        <table><tr><th></th><th class="n">Qty</th><th>Product</th></tr>${o.items.map((i) => `<tr><td style="width:2rem"><span class="box"></span></td><td class="n">${i.qty}</td><td>${esc(`${i.name} ${i.strength}`.trim())}</td></tr>`).join("")}</table>
        <p style="margin-top:24px;color:#666">For laboratory research use only.</p><script>print()<\/script>`);
      w.document.close();
    }
  };
}
async function orders() {
  if (orderId) return orderDetail(orderId);
  pane().innerHTML = `<header><h1>Orders</h1><div class="row2"><a class="btn" href="/api/admin/orders.csv" style="display:inline-grid;place-items:center;text-decoration:none">Export CSV</a>${isOwner() ? '<button class="btn danger" type="button" id="delAllOrders" title="Clear out test orders">Delete all orders</button>' : ""}</div></header>
    <div class="filters"><select id="of"><option value="">All statuses</option>${STATUSES.map((s) => `<option${oFilter.status === s ? " selected" : ""}>${s}</option>`).join("")}</select>
      <input id="oq" type="search" placeholder="Name, email, order # or tracking" value="${esc(oFilter.q)}"></div>
    <div class="tblwrap" id="ot"><p class="muted">Loading…</p></div>`;
  const dao = document.getElementById("delAllOrders");
  if (dao) dao.onclick = async () => {
    const typed = prompt("This deletes EVERY order: invoices, AR, commissions and payouts on them go too, and it can't be undone. Use it to clear out test orders.\n\nType DELETE to confirm.");
    if (typed === null) return; if (typed.trim() !== "DELETE") return toast("Nothing deleted. Type DELETE exactly.");
    const restock = confirm("Put the stock from these orders back on the shelf?\n\nOK = yes (the test orders never really shipped)\nCancel = no, leave stock as it is");
    const r = await api("/orders/delete-all", { method: "POST", body: { confirm: "DELETE", restock } });
    toast(`Deleted ${r.deleted} order${r.deleted === 1 ? "" : "s"}${r.restocked ? "; stock put back" : ""}`); drawNav(); orders();
  };
  const load = async () => {
    const qs = new URLSearchParams(oFilter).toString();
    const { orders: list } = await api("/orders?" + qs);
    const payTxt = (o) => (o.paid_at ? '<span class="pill st-paid">card paid</span>' : o.pay_method === "card" ? '<span class="pill st-new">card pending</span>' : '<span class="muted">request</span>');
    document.getElementById("ot").innerHTML = list.length ? `<table class="tbl"><tr><th>Order</th><th>Placed</th><th>Customer</th><th>Rep</th><th class="num">Items</th><th class="num">Total</th><th>Get it</th><th>Payment</th><th>Status</th><th>Tracking</th></tr>
      ${list.map((o) => `<tr class="click" data-order="${o.id}"><td class="mono">${esc(o.number)}</td><td>${when(o.created_at)}</td><td>${esc(o.name)}<br><span class="muted">${esc(o.email)}</span></td><td>${esc(o.rep_name || "")}${o.placed_by && o.placed_by.startsWith("Rep") ? '<div class="muted" style="font-size:.72rem">placed by rep</div>' : ""}</td><td class="num">${o.items}</td><td class="num">${money(o.total_cents)}${o.discount_code ? `<div class="muted" style="font-size:.72rem">code ${esc(o.discount_code)}</div>` : ""}</td><td>${o.fulfillment === "delivery" ? "Delivery" : "Ship"}</td><td>${payTxt(o)}</td><td>${pill(o.status)}</td><td class="mono">${esc(o.tracking)}</td></tr>`).join("")}</table>` : `<p class="muted">No orders${oFilter.status || oFilter.q ? " match" : " yet"}.</p>`;
  };
  document.getElementById("of").onchange = (e) => { oFilter.status = e.target.value; load(); };
  let t; document.getElementById("oq").oninput = (e) => { clearTimeout(t); t = setTimeout(() => { oFilter.q = e.target.value; load(); }, 250); };
  load();
}
async function orderDetail(id) {
  const { order: o, items, events, reps: repOpts, fedexAccount, stripe: st } = await api("/orders/" + id);
  const comm = o.rep_id && o.commission_rate !== null ? Math.round((o.subtotal_cents - o.discount_cents) * o.commission_rate / 100) : 0;
  const a = o.address || {};
  const addr = [a.line1, a.line2, `${a.city || ""}, ${a.state || ""} ${a.zip || ""}`].filter((x) => x && x.trim() !== ",").map(esc).join("<br>");
  const delivery = o.fulfillment === "delivery";
  const unpaid = !o.paid_at && o.status !== "cancelled";
  const stripeLink = o.stripe_pi ? `https://dashboard.stripe.com/${st && st.mode === "test" ? "test/" : ""}payments/${encodeURIComponent(o.stripe_pi)}` : "";
  const canEdit = !isRep() && o.status !== "cancelled"; // reps and customers never edit; admins and managers do
  pane().innerHTML = `<header><h1>Order ${esc(o.number)}</h1><div class="row2"><a class="btn" href="/api/admin/orders/${o.id}/invoice" target="_blank" rel="noopener" style="display:inline-grid;place-items:center;text-decoration:none">Invoice</a>${canEdit ? '<button class="btn solid" id="editO">Edit order</button>' : ""}${isOwner() ? '<button class="btn" id="delO" style="color:#9b1c1c;border-color:#e8b4b4">Delete</button>' : ""}<button class="btn" data-nav="orders">← All orders</button></div></header>
  <div id="editPanel"></div>
  <div class="two">
    <div class="stack">
      <div class="panel"><h2>Items</h2><div class="tblwrap"><table class="tbl"><tr><th>Product</th><th class="num">Qty</th><th class="num">Each</th><th class="num">Line</th></tr>
        ${items.map((i) => `<tr><td class="namecol">${esc(i.name)} ${esc(i.strength)}</td><td class="num">${i.qty}</td><td class="num">${money(i.unit_cents)}</td><td class="num">${money(i.unit_cents * i.qty)}</td></tr>`).join("")}
        <tr><td colspan="3">Subtotal${o.price_markup !== null && o.price_markup !== undefined ? ` <span class="muted">(customer pricing: cost +${esc(Number(o.price_markup))}%)</span>` : ""}</td><td class="num">${money(o.subtotal_cents)}</td></tr>
        <tr><td colspan="3">Discount${o.discount_code ? ` (code <span class="mono">${esc(o.discount_code)}</span>)` : ""}</td><td class="num">${isOwner() ? `<input id="odisc" value="${dollars(o.discount_cents)}" inputmode="decimal" style="max-width:7rem;margin-left:auto">` : money(o.discount_cents)}</td></tr>
        <tr><td colspan="3">${esc(o.shipping_method || (delivery ? "Local delivery" : "Shipping"))}</td><td class="num">${isOwner() ? `<input id="oship" value="${dollars(o.shipping_cents)}" inputmode="decimal" style="max-width:7rem;margin-left:auto">` : money(o.shipping_cents)}</td></tr>
        <tr><td colspan="3"><strong>Total</strong></td><td class="num"><strong>${money(o.total_cents)}</strong></td></tr></table></div>
        ${isOwner() ? `<div><button class="btn" id="saveMoney"${o.paid_at ? ' title="Already paid: changing charges will not change what was collected"' : ""}>Update charges</button></div>` : ""}</div>
      <div class="panel"><h2>Payment</h2>
        ${o.paid_at ? `<p><span class="pill st-paid">paid</span> ${money(o.paid_cents ?? o.total_cents)} ${o.pay_method === "card" ? "by card through Stripe" : ""} on ${when(o.paid_at)}${stripeLink ? ` · <a href="${stripeLink}" target="_blank" rel="noopener">Open in Stripe ↗</a>` : ""}</p>`
          : o.pay_method === "card" ? `<p><span class="pill st-new">card pending</span> The customer went to the card payment page but hasn't finished. Send them the link below, or wait.</p>`
          : `<p>Order request: no payment taken yet. Confirm the total with the customer and collect payment${st && st.on ? ", or send a card payment link" : ""}.</p>`}
        ${unpaid && st && st.ready ? `<div class="row2"><button class="btn" id="payLink">Create card payment link</button><span class="muted" style="align-self:center">${st.on ? "" : "Card payments are off for customers; links you create still work."}</span></div><div id="payLinkOut"></div>` : ""}
        ${!st || !st.ready ? `<p class="muted">Card payments aren't set up: add the Stripe key on the host (see Site settings → Payments).</p>` : ""}
        ${isRep() ? "" : `<div class="row2"><button class="btn" id="resendMail">Send order email again</button><button class="btn" id="invLink" type="button">Copy invoice link</button>${unpaid ? '<button class="btn solid" id="recPay" type="button">Record payment</button>' : ""}</div><div id="recPayBox"></div>`}</div>
      <div class="panel"><h2>Customer</h2>
        <p><strong>${esc(o.name)}</strong><br><a href="mailto:${esc(o.email)}?subject=${encodeURIComponent("Your order " + o.number)}">${esc(o.email)}</a>${o.phone ? `<br><a href="tel:${esc(o.phone)}">${esc(o.phone)}</a>` : ""}</p>
        <p class="eyebrow">${delivery ? "Deliver to" : "Ship to"}</p><p>${addr}</p>
        ${o.customer_note ? `<p class="muted"><strong>Customer note:</strong> ${esc(o.customer_note)}</p>` : ""}
        <div class="row2"><button class="btn" id="copyAddr">Copy ${delivery ? "delivery" : "shipping label"} address</button></div></div>
    </div>
    <div class="stack">
      ${isRep() ? `<div class="panel"><h2>Status &amp; delivery</h2><p>${pill(o.status)} · ${delivery ? "Local delivery" : "Ship"}${o.carrier || o.tracking ? ` · ${esc(o.carrier)} <span class="mono">${esc(o.tracking)}</span>` : ""}</p>
        <p class="muted">${o.paid_at ? "Paid " + when(o.paid_at) + ". " : ""}${o.shipped_at ? "Shipped " + when(o.shipped_at) + ". " : ""}The office updates status, tracking and charges.</p></div>` : `<div class="panel"><h2>Status &amp; delivery</h2>
        <div class="grid2"><div class="field"><label class="eyebrow" for="ost">Status</label><select id="ost">${STATUSES.map((s) => `<option${s === o.status ? " selected" : ""}>${s}</option>`).join("")}</select></div>
        <div class="field"><label class="eyebrow" for="oful">Ship or deliver</label><select id="oful"><option value="ship"${!delivery ? " selected" : ""}>Ship</option><option value="delivery"${delivery ? " selected" : ""}>Local delivery (free)</option></select></div></div>
        ${!delivery && fedexAccount ? `<p class="muted">FedEx account <span class="mono">${esc(fedexAccount)}</span> <button class="linkbtn" type="button" id="copyFedex">copy</button> — use it when you make the label.</p>` : ""}
        <div class="field"><label class="eyebrow" for="ocar">Carrier</label><input id="ocar" list="carriers" value="${esc(o.carrier || (!delivery && fedexAccount ? "FedEx" : ""))}"><datalist id="carriers"><option>FedEx</option><option>USPS</option><option>UPS</option><option>DHL</option><option>Hand delivered</option></datalist></div>
        <div class="field"><label class="eyebrow" for="otr">Tracking number</label><input id="otr" value="${esc(o.tracking)}"></div>
        <div class="field"><label class="eyebrow" for="oeta">Estimated arrival</label><input id="oeta" type="date" value="${o.eta ? String(o.eta).slice(0, 10) : ""}"></div>
        <div class="field"><label class="eyebrow" for="oin">Internal note (staff only)</label><textarea id="oin">${esc(o.internal_note)}</textarea></div>
        <label class="chk"><input type="checkbox" id="oNotify"${o.email ? " checked" : " disabled"}> Email the customer about this update${o.email ? "" : " (no email on the order)"}</label>
        <button class="btn solid" id="saveO">Save</button>
        <p class="muted">${o.paid_at ? "Paid " + when(o.paid_at) + ". " : ""}${o.shipped_at ? "Shipped " + when(o.shipped_at) + "." : ""}</p></div>`}
      <div class="panel"><h2>Sales rep &amp; commission</h2>
        ${isOwner() ? `<div class="grid2"><div class="field"><label class="eyebrow" for="orep">Rep</label><select id="orep"${o.payout_id ? " disabled" : ""}><option value="">— none —</option>${(repOpts || []).concat(o.rep_id && !(repOpts || []).some((r) => r.id === o.rep_id) ? [{ id: o.rep_id, name: o.rep_name, commission_rate: o.commission_rate }] : []).map((r) => `<option value="${r.id}"${r.id === o.rep_id ? " selected" : ""}>${esc(r.name)} (${r.commission_rate}%)</option>`).join("")}</select></div>
          <div class="field"><label class="eyebrow" for="orate">Rate on this order %</label><input id="orate" value="${o.commission_rate ?? ""}" inputmode="decimal"${o.rep_id && !o.payout_id ? "" : " disabled"}></div></div>
          <div><button class="btn" id="saveRep"${o.payout_id ? " disabled" : ""}>Save</button></div>` : `<p>${o.rep_name ? `${esc(o.rep_name)} · ${o.commission_rate}%` : "No sales rep on this order."}</p>`}
        <p class="muted">${o.rep_id ? `Commission ${money(comm)} · ${o.status === "cancelled" ? "void (cancelled)" : o.payout_id ? "paid out" : ["paid", "shipped", "delivered"].includes(o.status) ? "earned, not yet paid out" : "pending until the order is paid"}` : ""}${o.placed_by ? ` · Placed by ${esc(o.placed_by)}` : ""}</p></div>
      <div class="panel"><h2>History</h2>
        <div class="row2"><input id="onote" placeholder="Add a note (e.g. payment received via Zelle)" style="flex:1;height:2.4rem;padding:0 .7rem;border:1px solid var(--line-strong);border-radius:8px"><button class="btn" id="addNote">Add</button></div>
        <ul class="hist">${events.map((e) => `<li>${esc(e.text)}<small>${esc(e.who)} · ${when(e.at)}</small></li>`).join("")}</ul></div>
    </div>
  </div>`;
  const $ = (x) => document.getElementById(x);
  if ($("saveO")) $("saveO").onclick = async () => {
    if ($("ost").value === "shipped" && $("oful").value === "ship" && !$("otr").value.trim() && !confirm("Mark shipped without a tracking number?")) return;
    const r = await api("/orders/" + id, { method: "PATCH", body: { status: $("ost").value, fulfillment: $("oful").value, carrier: $("ocar").value, tracking: $("otr").value, eta: $("oeta").value || null, internalNote: $("oin").value, notify: !!($("oNotify") && $("oNotify").checked) } });
    toast(r.emailed ? (r.emailed.sent ? `Saved · emailed the customer` : `Saved · email not sent: ${r.emailed.error || "emails are off"}`) : "Saved"); orderDetail(id); drawNav();
  };
  if ($("editO")) $("editO").onclick = () => editOrder(o, items, id);
  if ($("delO")) $("delO").onclick = () => {
    $("editPanel").innerHTML = `<div class="panel" style="border-color:#e8b4b4"><h2>Delete order ${esc(o.number)}?</h2>
      <p>This removes the order for good${o.status !== "cancelled" ? " and puts its stock back on the shelf" : ""}.${o.paid_at ? ` <strong>It was paid ${money(o.paid_cents ?? o.total_cents)} by card — deleting doesn't refund anything; do that in Stripe.</strong>` : ""} If you just want it out of the way, set its status to cancelled instead.</p>
      <div class="grid2"><div class="field"><label class="eyebrow" for="delReason">Reason (goes in the email)</label><input id="delReason" placeholder="e.g. duplicate order"></div></div>
      <label class="chk"><input type="checkbox" id="delNotify"${o.email ? " checked" : " disabled"}> Email the customer and the store that it was cancelled${o.email ? "" : " (no email on the order)"}</label>
      <div class="row2"><button class="btn" id="delGo" style="background:#9b1c1c;color:#fff;border-color:#9b1c1c">Delete order</button><button class="btn" type="button" id="delNo">Keep it</button></div></div>`;
    $("delNo").onclick = () => { $("editPanel").innerHTML = ""; };
    $("delGo").onclick = async () => {
      if (!confirm(`Delete order ${o.number}? This can't be undone.`)) return;
      $("delGo").disabled = true;
      try {
        const r = await api("/orders/" + id, { method: "DELETE", body: { notify: !!($("delNotify") && $("delNotify").checked), reason: $("delReason").value } });
        toast(`Order ${r.number} deleted${r.emailed ? (r.emailed.sent ? " · emails sent" : ` · email not sent: ${r.emailed.error || "emails are off"}`) : ""}`);
        oFilter = { status: "", q: "" }; go("orders"); drawNav();
      } catch (e) { $("delGo").disabled = false; }
    };
    $("editPanel").scrollIntoView({ behavior: "smooth", block: "start" });
  };
  if ($("copyFedex")) $("copyFedex").onclick = () => navigator.clipboard?.writeText(fedexAccount).then(() => toast("FedEx account copied"), () => toast("Copy failed"));
  if ($("payLink")) $("payLink").onclick = async () => {
    $("payLink").disabled = true;
    try {
      const r = await api(`/orders/${id}/paylink`, { method: "POST" });
      const msg = `Here's the secure card payment link for your order ${o.number}: ${r.url}`;
      $("payLinkOut").innerHTML = `<p><a href="${esc(r.url)}" target="_blank" rel="noopener" style="word-break:break-all">${esc(r.url)}</a></p>
        <div class="row2"><button class="btn" id="copyPay">Copy link</button><a class="btn" style="display:inline-grid;place-items:center;text-decoration:none" href="mailto:${esc(o.email)}?subject=${encodeURIComponent("Payment link for order " + o.number)}&body=${encodeURIComponent(msg)}">Email it to ${esc(o.email)}</a>${o.phone ? `<a class="btn" style="display:inline-grid;place-items:center;text-decoration:none" href="sms:${esc(o.phone)}?&body=${encodeURIComponent(msg)}">Text it</a>` : ""}</div>
        <p class="muted">The link works for 24 hours. When the customer pays, the order marks itself paid.</p>`;
      $("copyPay").onclick = () => navigator.clipboard?.writeText(r.url).then(() => toast("Link copied"), () => toast("Copy failed"));
    } finally { $("payLink").disabled = false; }
  };
  if ($("invLink")) $("invLink").onclick = async () => { const r = await api(`/orders/${id}/invoice-link`); try { await navigator.clipboard.writeText(r.url); toast("Invoice link copied — send it to the customer"); } catch (e) { prompt("Invoice link", r.url); } };
  if ($("recPay")) $("recPay").onclick = () => payForm($("recPayBox"), o, () => orderDetail(id));
  if ($("resendMail")) $("resendMail").onclick = async () => { $("resendMail").disabled = true; try { const r = await api(`/orders/${id}/email`, { method: "POST" }); toast(`Sent ${r.sent} email${r.sent === 1 ? "" : "s"}`); } finally { $("resendMail").disabled = false; } };
  if ($("saveMoney")) $("saveMoney").onclick = async () => {
    await api("/orders/" + id, { method: "PATCH", body: { shippingCents: Math.round(parseFloat($("oship").value || 0) * 100), discountCents: Math.round(parseFloat($("odisc").value || 0) * 100) } });
    toast("Charges updated"); orderDetail(id);
  };
  if ($("saveRep")) $("saveRep").onclick = async () => { await api("/orders/" + id, { method: "PATCH", body: { repId: $("orep").value || null, commissionRate: $("orate").value } }); toast("Saved"); orderDetail(id); };
  $("addNote").onclick = async () => { if (!$("onote").value.trim()) return; await api(`/orders/${id}/note`, { method: "POST", body: { text: $("onote").value } }); orderDetail(id); };
  $("copyAddr").onclick = () => {
    const txt = [o.name, a.line1, a.line2, `${a.city}, ${a.state} ${a.zip}`].filter(Boolean).join("\n");
    navigator.clipboard?.writeText(txt).then(() => toast("Address copied"), () => toast("Copy failed"));
  };
}


/* ---------- edit an order: lines, customer, address, note, ship/deliver; emails the customer and store about it ---------- */
async function editOrder(o, items, id) {
  const $ = (x) => document.getElementById(x);
  const a = o.address || {};
  const cat = await api("/catalog" + (o.customer_id ? "?customerId=" + o.customer_id : ""));
  const onOrder = new Set(items.map((i) => i.product_id).filter(Boolean));
  const addable = cat.products.filter((p) => p.price_cents !== null && !onOrder.has(p.id));
  const plabel = (p) => `${p.name} ${p.strength}`.trim() + (p.manufacturer ? ` · ${p.manufacturer}` : "");
  const own = isOwner();
  const fld = (id, label, val, attrs = "") => `<div class="field"><label class="eyebrow" for="${id}">${label}</label><input id="${id}" value="${esc(val || "")}" ${attrs}></div>`;
  $("editPanel").innerHTML = `<div class="panel" style="border-color:var(--blue)"><div class="row2" style="justify-content:space-between;align-items:center"><h2>Edit order ${esc(o.number)}</h2><button class="btn" type="button" id="edClose">Close</button></div>
    ${o.paid_at ? `<p class="muted"><strong>This order is paid</strong> (${money(o.paid_cents ?? o.total_cents)}). If the total changes, the emails say what's owed or to be refunded; Stripe isn't touched.</p>` : ""}
    <h3 class="eyebrow" style="margin:.6rem 0 .3rem">Items</h3>
    <div class="tblwrap"><table class="tbl compact" id="edT"><thead><tr><th>Product</th><th>Qty</th><th class="num">Each</th><th class="num">Line</th><th></th></tr></thead><tbody>
      ${items.map((i) => `<tr data-line="${i.id}"><td class="namecol"><strong>${esc(i.name)} ${esc(i.strength)}</strong></td><td><input data-qty inputmode="numeric" value="${i.qty}" style="width:4.5rem;text-align:center"></td>
        <td class="num">${own ? `<input data-unit inputmode="decimal" value="${dollars(i.unit_cents)}" style="width:6rem;text-align:right">` : money(i.unit_cents)}</td><td class="num" data-amt>${money(i.unit_cents * i.qty)}</td><td><button class="btn" type="button" data-rm title="Remove from the order">Remove</button></td></tr>`).join("")}</tbody></table></div>
    <div class="row2" style="align-items:center;margin-top:.5rem"><select id="edAdd" style="max-width:26rem"><option value="">Add a product…</option>${addable.map((p) => `<option value="${p.id}">${esc(plabel(p))} — ${money(p.price_cents)}${p.stock !== null ? ` (${p.stock} in stock)` : ""}</option>`).join("")}</select><span class="muted">${cat.markup !== null && cat.markup !== undefined ? `Priced at this customer's markup (cost +${esc(cat.markup)}%)` : o.price_markup !== null && o.price_markup !== undefined ? `Priced at the order's markup (cost +${esc(Number(o.price_markup))}%)` : "Store prices"}${own ? "; you can change any price" : ""}.</span></div>
    <p class="muted" id="edTot" style="margin:.4rem 0 0"></p>
    <h3 class="eyebrow" style="margin:1rem 0 .3rem">Customer</h3>
    <div class="grid2">${fld("edName", "Name", o.name)}${fld("edEmail", "Email", o.email, 'type="email"')}${fld("edPhone", "Phone", o.phone)}
      <div class="field"><label class="eyebrow" for="edFul">Ship or deliver</label><select id="edFul"><option value="ship"${o.fulfillment !== "delivery" ? " selected" : ""}>Ship</option><option value="delivery"${o.fulfillment === "delivery" ? " selected" : ""}>Local delivery</option></select></div></div>
    <h3 class="eyebrow" style="margin:.8rem 0 .3rem">Address</h3>
    <div class="grid2">${fld("edL1", "Street", a.line1)}${fld("edL2", "Apt / suite (optional)", a.line2)}${fld("edCity", "City", a.city)}${fld("edState", "State", a.state)}${fld("edZip", "ZIP", a.zip)}</div>
    <div class="field"><label class="eyebrow" for="edNote">Customer note</label><textarea id="edNote" maxlength="1000">${esc(o.customer_note || "")}</textarea></div>
    <label class="chk"><input type="checkbox" id="edNotify"${o.email ? " checked" : ""}> Email the customer and the store about these changes${o.email ? "" : " (needs an email address)"}</label>
    <div class="err" id="edErr" hidden></div>
    <div class="row2"><button class="btn solid" type="button" id="edSave">Save changes</button><span class="muted">Stock follows the quantities; totals are recalculated${o.discount_code ? ` (code ${esc(o.discount_code)} is re-applied)` : ""}.</span></div></div>`;
  const rows = () => [...document.querySelectorAll("#edT tbody tr")];
  const cents = (v) => { const n = parseFloat(String(v).replace(/[$,\s]/g, "")); return Number.isFinite(n) ? Math.round(n * 100) : null; };
  const unitOf = (tr) => { const u = tr.querySelector("[data-unit]"); return u ? (cents(u.value) ?? +tr.dataset.unit) : +tr.dataset.unit; };
  rows().forEach((tr) => { const i = items.find((x) => String(x.id) === tr.dataset.line); tr.dataset.unit = i.unit_cents; });
  const total = () => {
    let sub = 0, n = 0;
    rows().forEach((tr) => { const q = parseInt(tr.querySelector("[data-qty]").value) || 0, u = unitOf(tr); tr.querySelector("[data-amt]").textContent = q ? money(u * q) : ""; sub += q * u; n += q; });
    $("edTot").textContent = `${n} item${n === 1 ? "" : "s"} · products ${money(sub)}${o.discount_cents ? " · discount and shipping are worked out when you save" : " · shipping is worked out when you save"}`;
  };
  total();
  $("edT").addEventListener("input", total);
  $("edT").addEventListener("click", (e) => { const b = e.target.closest("[data-rm]"); if (!b) return; const tr = b.closest("tr"); if (rows().length === 1) return toast("An order needs at least one product — delete the order instead"); tr.remove(); total(); });
  $("edAdd").onchange = () => {
    const p = addable.find((x) => String(x.id) === $("edAdd").value); if (!p) return;
    $("edT").querySelector("tbody").insertAdjacentHTML("beforeend", `<tr data-new="${p.id}" data-unit="${p.price_cents}"><td class="namecol"><strong>${esc(p.name)}${p.manufacturer ? ` (${esc(p.manufacturer)})` : ""} ${esc(p.strength)}</strong> <span class="pill st-new">new</span></td><td><input data-qty inputmode="numeric" value="1" style="width:4.5rem;text-align:center"></td>
      <td class="num">${own ? `<input data-unit inputmode="decimal" value="${dollars(p.price_cents)}" style="width:6rem;text-align:right">` : money(p.price_cents)}</td><td class="num" data-amt></td><td><button class="btn" type="button" data-rm>Remove</button></td></tr>`);
    $("edAdd").querySelector(`option[value="${p.id}"]`).remove(); $("edAdd").value = ""; total();
  };
  $("edClose").onclick = () => { $("editPanel").innerHTML = ""; };
  $("edSave").onclick = async () => {
    $("edErr").hidden = true;
    const lines = rows().map((tr) => ({ itemId: tr.dataset.line ? +tr.dataset.line : undefined, productId: tr.dataset.new ? +tr.dataset.new : undefined, qty: parseInt(tr.querySelector("[data-qty]").value) || 0, unitCents: own && tr.querySelector("[data-unit]") ? cents(tr.querySelector("[data-unit]").value) : undefined }));
    if (lines.some((l) => l.qty < 0 || (own && l.unitCents === null))) { $("edErr").textContent = "Check the quantities and prices."; $("edErr").hidden = false; return; }
    $("edSave").disabled = true;
    try {
      const r = await api(`/orders/${id}/edit`, { method: "POST", body: { items: lines, name: $("edName").value, email: $("edEmail").value, phone: $("edPhone").value, fulfillment: $("edFul").value,
        address: { line1: $("edL1").value, line2: $("edL2").value, city: $("edCity").value, state: $("edState").value, zip: $("edZip").value }, customerNote: $("edNote").value, notify: $("edNotify").checked } });
      paneDirty = false;
      toast(`Saved ${r.changes.length} change${r.changes.length === 1 ? "" : "s"}${r.emailed ? (r.emailed.sent ? ` · ${r.emailed.sent} email${r.emailed.sent === 1 ? "" : "s"} sent` : ` · email not sent: ${r.emailed.error || "emails are off"}`) : ""}`);
      orderDetail(id); drawNav();
    } catch (e) { $("edErr").textContent = e.message; $("edErr").hidden = false; $("edSave").disabled = false; }
  };
  $("editPanel").scrollIntoView({ behavior: "smooth", block: "start" });
}

/* ---------- new order for a customer (phone orders; reps for their customers) ---------- */
let pickCustomer = null; // set by the Customers screen's "New order" button
async function neworder() {
  const $ = (x) => document.getElementById(x);
  const [{ customers: list }, cat0] = await Promise.all([api("/customers"), api("/catalog")]);
  const label = (p) => `${p.name} ${p.strength}`.trim() + (p.manufacturer ? ` · ${p.manufacturer}` : "");
  pane().innerHTML = `<header><h1>New order</h1><span class="muted">${isRep() ? "For one of your customers" : "Phone or walk-in orders for any customer"}</span></header>
    ${!list.length ? `<div class="panel"><p>Add a customer first.</p><div><button class="btn solid" data-nav="customers">Customers</button></div></div>` : `
    <div class="two">
      <div class="stack">
        <div class="panel"><h2>1. Customer</h2>
          <div class="field"><label class="eyebrow" for="noCust">Who is this order for?</label><select id="noCust"><option value="">Choose a customer…</option>${list.filter((c) => c.active).map((c) => `<option value="${c.id}"${pickCustomer === c.id ? " selected" : ""}>${esc(c.name)}${c.email ? " — " + esc(c.email) : c.phone ? " — " + esc(c.phone) : ""}</option>`).join("")}</select></div>
          <p class="muted" id="noInfo"></p></div>
        <div class="panel"><h2>2. Products</h2>
          <div class="filters"><input id="noq" type="search" placeholder="Filter products" style="flex:1"></div>
          <div class="tblwrap" style="max-height:30rem"><table class="tbl compact" id="noT"><thead><tr><th>Product</th><th class="num">Each</th><th>Qty</th><th class="num">Line</th></tr></thead><tbody id="noLines"></tbody></table></div>
          <p class="muted" id="noNone" hidden>No products have a price yet.</p></div>
      </div>
      <div class="stack">
        <div class="panel"><h2>3. Ship or deliver</h2>
          ${cat0.fulfillment.length ? `<div class="choices" id="noFul">${cat0.fulfillment.map((f, i) => `<label class="choice-opt"><input type="radio" name="noFul" value="${esc(f.key)}"${i === 0 ? " checked" : ""}><span><strong>${esc(f.label)}</strong>${f.note || f.freeOverCents ? `<small>${esc(f.note)}${f.freeOverCents ? `${f.note ? " · " : ""}Free over ${money(f.freeOverCents)}` : ""}</small>` : ""}</span><span class="amt" data-fulamt="${esc(f.key)}">${f.cents ? money(f.cents) : "Free"}</span></label>`).join("")}</div>` : '<p class="muted">Shipping is settled with the order.</p>'}
          <div class="field"><label class="eyebrow" for="noCode">Discount code (optional)</label><div class="row2" style="flex-wrap:nowrap"><input id="noCode" autocomplete="off" autocapitalize="characters" placeholder="Enter a code" style="flex:1"><button class="btn" type="button" id="noCodeApply">Apply</button></div><span class="muted" id="noCodeMsg"></span></div>
          ${cat0.cardPayments ? `<label class="chk"><input type="checkbox" id="noPayLink" checked> Make a card payment link to send the customer</label>` : ""}
          <div class="field"><label class="eyebrow" for="noNote">Note (optional)</label><textarea id="noNote" maxlength="1000"></textarea></div></div>
        <div class="panel"><h2>4. Total</h2>
          <div class="totals" id="noTotals"></div>
          <div class="err" id="noErr" hidden></div>
          <button class="btn solid" id="noGo" style="height:2.8rem">Place order</button>
          <div id="noDone"></div></div>
      </div>
    </div>`}`;
  if (!list.length) return;
  pickCustomer = null;
  let sellable = [], code = null, ful = cat0.fulfillment;
  const chosen = () => ful.find((f) => f.key === (document.querySelector("#noFul input:checked") || {}).value) || ful[0] || null;
  const shipCost = (f, sub) => (!f ? 0 : f.freeOverCents > 0 && sub >= f.freeOverCents ? 0 : f.cents);
  const qtys = () => { const m = {}; document.querySelectorAll("#noLines tr[data-pid]").forEach((r) => { m[r.dataset.pid] = parseInt(r.querySelector("[data-qty]").value) || 0; }); return m; };
  const drawLines = (keep = {}) => {
    $("noLines").innerHTML = sellable.map((p) => `<tr data-pid="${p.id}" data-txt="${esc(label(p).toLowerCase())}"><td class="namecol"><strong>${esc(label(p))}</strong><span class="muted">${p.stock !== null ? `${p.stock} in stock` : ""}${p.max_per_order ? ` · max ${p.max_per_order}` : ""}</span></td><td class="num">${money(p.price_cents)}</td><td><input data-qty inputmode="numeric" placeholder="0" value="${keep[p.id] || ""}" style="width:4.5rem;min-width:0;text-align:center"></td><td class="num" data-amt></td></tr>`).join("");
    $("noNone").hidden = sellable.length > 0;
    total();
  };
  const total = () => {
    let sub = 0, n = 0;
    document.querySelectorAll("#noLines tr[data-pid]").forEach((row) => { const p = sellable.find((x) => String(x.id) === row.dataset.pid); const q = parseInt(row.querySelector("[data-qty]").value) || 0; row.querySelector("[data-amt]").textContent = q ? money(p.price_cents * q) : ""; sub += q * p.price_cents; n += q; });
    ful.forEach((f) => { const el = document.querySelector(`[data-fulamt="${f.key}"]`); if (el) el.textContent = shipCost(f, sub) ? money(shipCost(f, sub)) : "Free"; });
    const units = [...document.querySelectorAll("#noLines tr[data-pid]")].map((row) => { const p = sellable.find((x) => String(x.id) === row.dataset.pid); return { cents: p ? p.price_cents : 0, qty: parseInt(row.querySelector("[data-qty]").value) || 0 }; });
    const off = codeOffFor(code, sub, units);
    const f = chosen(), sc = shipCost(f, sub);
    $("noTotals").innerHTML = `<div><span>${n} item${n === 1 ? "" : "s"}</span><span>${money(sub)}</span></div>${off ? `<div><span>Discount (${esc(code.code)})</span><span>−${money(off)}</span></div>` : ""}${f ? `<div><span>${esc(f.label)}</span><span>${sc ? money(sc) : "Free"}</span></div>` : ""}<div class="big"><span>Total</span><span>${money(sub - off + sc)}</span></div>`;
  };
  const loadCustomer = async () => {
    const id = $("noCust").value;
    const keep = qtys();
    const cat = await api("/catalog" + (id ? "?customerId=" + id : ""));
    sellable = cat.products.filter((p) => p.price_cents !== null && (p.stock === null || p.stock > 0));
    const c = cat.customer, a = (c && c.address) || {};
    $("noInfo").innerHTML = c ? `${a.line1 ? `Ships or delivers to ${esc([a.line1, a.line2, a.city, a.state, a.zip].filter(Boolean).join(", "))}` : '<span class="err" style="display:inline-block;padding:.2rem .5rem">No address yet — edit the customer first.</span>'} · ${cat.markup !== null ? `Pricing: cost +${esc(cat.markup)}% (this customer's own)` : "Store prices"}${c.rep_name ? ` · Sales rep: ${esc(c.rep_name)}` : ""}` : "";
    drawLines(keep);
  };
  $("noCodeApply").onclick = async () => {
    const c = $("noCode").value.trim().toUpperCase(); $("noCodeMsg").textContent = "";
    if (!c) { code = null; total(); return; }
    let sub = 0; document.querySelectorAll("#noLines tr[data-pid]").forEach((row) => { const p = sellable.find((x) => String(x.id) === row.dataset.pid); sub += (parseInt(row.querySelector("[data-qty]").value) || 0) * p.price_cents; });
    try {
      const r = await fetch("/api/discount", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ code: c, subtotalCents: sub, units: [...document.querySelectorAll("#noLines tr[data-pid]")].map((row) => { const p = sellable.find((x) => String(x.id) === row.dataset.pid); return { cents: p ? p.price_cents : 0, qty: parseInt(row.querySelector("[data-qty]").value) || 0 }; }) }) });
      const j = await r.json(); if (!r.ok) throw new Error(j.error || "That code didn't work.");
      code = { code: j.code, kind: j.kind, value: j.value, minSubtotalCents: j.minSubtotalCents || 0, minVials: j.minVials || 0 }; $("noCode").value = j.code; $("noCodeMsg").textContent = `${j.label} applied.`;
    } catch (e) { code = null; $("noCodeMsg").textContent = e.message; }
    total();
  };
  $("noq").oninput = () => { const t = $("noq").value.toLowerCase(); document.querySelectorAll("#noLines tr[data-pid]").forEach((r) => { r.hidden = t && !r.dataset.txt.includes(t) && !r.querySelector("[data-qty]").value; }); };
  pane().oninput = (e) => { if (e.target.matches("[data-qty]")) total(); };
  pane().onchange = (e) => { if (e.target.matches("#noFul input")) total(); if (e.target.id === "noCust") loadCustomer(); };
  $("noGo").onclick = async () => {
    const items = Object.entries(qtys()).filter(([, q]) => q > 0).map(([id, qty]) => ({ id: +id, qty }));
    $("noErr").hidden = true;
    if (!$("noCust").value) { $("noErr").textContent = "Choose a customer."; $("noErr").hidden = false; return; }
    if (!items.length) { $("noErr").textContent = "Enter a quantity for at least one product."; $("noErr").hidden = false; return; }
    $("noGo").disabled = true;
    try {
      const f = chosen();
      const r = await api("/orders", { method: "POST", body: { customerId: +$("noCust").value, items, fulfillment: f ? f.key : "ship", discountCode: code ? code.code : "", payLink: !!($("noPayLink") && $("noPayLink").checked), note: $("noNote").value } });
      paneDirty = false; drawNav();
      const msg = r.payUrl ? `Here's the secure card payment link for your order ${r.number}: ${r.payUrl}` : "";
      $("noDone").innerHTML = `<div class="panel" style="border-color:var(--pass);background:var(--pass-wash)"><h2>Order ${esc(r.number)} placed</h2><p>Total ${money(r.totalCents)} (products ${money(r.subtotalCents)}${r.discountCents ? `, discount −${money(r.discountCents)}` : ""}${r.shippingCents ? `, ${esc(r.shippingName || "shipping")} ${money(r.shippingCents)}` : r.shippingName ? `, ${esc(r.shippingName)} free` : ""}).</p>
        ${r.payUrl ? `<p><strong>Card payment link</strong> — send it to the customer; the order marks itself paid when they pay:<br><a href="${esc(r.payUrl)}" target="_blank" rel="noopener" style="word-break:break-all">${esc(r.payUrl)}</a></p><div class="row2"><button class="btn" type="button" data-copy="${esc(r.payUrl)}">Copy link</button><a class="btn" style="display:inline-grid;place-items:center;text-decoration:none" href="mailto:?subject=${encodeURIComponent("Payment link for order " + r.number)}&body=${encodeURIComponent(msg)}">Email it</a><a class="btn" style="display:inline-grid;place-items:center;text-decoration:none" href="sms:?&body=${encodeURIComponent(msg)}">Text it</a></div>` : `<p class="muted">The order email went to the store${isRep() ? "; the office will confirm it with the customer and collect payment" : ""}.</p>`}
        <div class="row2"><button class="btn solid" type="button" data-openorder="${r.id}">Open the order</button><button class="btn" type="button" data-nav="neworder">Another order</button></div></div>`;
      $("noDone").scrollIntoView({ behavior: "smooth" });
      const cp = $("noDone").querySelector("[data-copy]"); if (cp) cp.onclick = () => navigator.clipboard?.writeText(cp.dataset.copy).then(() => toast("Link copied"), () => toast("Copy failed"));
      $("noDone").querySelector("[data-openorder]").onclick = () => go("orders", r.id);
      document.querySelectorAll("#noLines [data-qty]").forEach((i) => { i.value = ""; }); code = null; $("noCode").value = ""; $("noCodeMsg").textContent = ""; total();
    } catch (e) { $("noErr").textContent = e.message; $("noErr").hidden = false; }
    finally { $("noGo").disabled = false; }
  };
  await loadCustomer();
}

/* ---------- customers ---------- */
async function customers() {
  pane().innerHTML = `<header><h1>${isRep() ? "My customers" : "Customers"}</h1>${isOwner() || isRep() ? `<button class="btn solid" id="addC">Add customer</button>` : ""}</header>
    ${isRep() ? `<p class="muted">Customers assigned to you. Orders they place (or you place for them) earn your commission. Ask the office to give them a PIN or special pricing.</p>` : `<p class="muted">Give a customer their own PIN to let them into the site. Their PIN works only for them: it unlocks the store and signs them into their account. Changing or revoking it, or turning the account off, ends their access right away. Turn the lock on under Site settings → Site PIN.</p>
    <p class="muted"><strong>Markup:</strong> a customer with a markup pays our cost plus that percent on every product that has a cost (products without a cost stay at the store price). They see their prices as soon as they sign in; sales reps see them when they place that customer's order. "Store prices" = the normal Products &amp; prices list.</p>`}
    <div id="cNew"></div><div id="pinShow"></div><div id="pinReq"></div>
    <div class="filters" style="flex-wrap:wrap;gap:.5rem"><input id="cq" type="search" placeholder="Search customers">
      ${isRep() ? "" : `<select id="cRep"><option value="">All reps</option><option value="none">No rep</option></select>`}
      <select id="cMonth" title="Month the customer was added"><option value="">Added: any month</option></select>
      <select id="cBuy"><option value="">Any orders</option><option value="buyers">Have ordered</option><option value="none">Never ordered</option><option value="open">Owes a balance</option></select>
      <select id="cSort">${[["created", "Newest added"], ["spend", "Total sales"], ["orders", "Total orders"], ["vials", "Vials"], ["paid", "Paid total"], ["open", "Open balance"], ["last", "Last order"], ["name", "Name A–Z"]].map(([k, l]) => `<option value="${k}">Sort: ${l}</option>`).join("")}</select></div>
    <div class="row2" style="justify-content:space-between;align-items:center"><p class="muted" id="cSum" style="margin:0"></p><button class="btn" type="button" id="cAll">Expand all</button></div>
    <div class="tblwrap" id="ct"><p class="muted">Loading…</p></div>`;
  let term = "";
  const { reps: repList } = isRep() ? { reps: [] } : await api("/reps").catch(() => ({ reps: [] }));
  const activeReps = repList.filter((r) => r.active);
  const repCell = (c) => isOwner()
    ? `<select data-rep style="min-width:8rem"><option value="">— none —</option>${repList.filter((r) => r.active || r.id === c.rep_id).map((r) => `<option value="${r.id}"${r.id === c.rep_id ? " selected" : ""}>${esc(r.name)}${r.active ? "" : " (off)"}</option>`).join("")}</select>`
    : esc(c.rep_name || "");
  const MK = ["25", "50", "75", "100"];
  const markupCell = (c) => {
    const cur = c.markup === null || c.markup === undefined ? "" : String(Number(c.markup));
    const custom = cur !== "" && !MK.includes(cur);
    if (!isOwner()) return cur ? `+${esc(cur)}% over cost` : "Store prices";
    return `<div class="row2" style="flex-wrap:nowrap"><select data-markup style="min-width:7.5rem" title="What this customer pays: our cost plus this markup"><option value="">Store prices</option>${MK.map((m) => `<option value="${m}"${cur === m ? " selected" : ""}>+${m}%</option>`).join("")}<option value="custom"${custom ? " selected" : ""}>Custom…</option></select><input data-markup-custom inputmode="decimal" value="${custom ? esc(cur) : ""}" placeholder="%" style="width:4.5rem"${custom ? "" : " hidden"}></div>`;
  };
  const pinCell = (c) => {
    if (!isOwner()) return c.has_pin ? "Set" : "";
    return c.has_pin
      ? `<span class="pill st-shipped">PIN set</span><div class="muted" style="font-size:.75rem">${c.pin_used_at ? "Last used " + when(c.pin_used_at) : "Not used yet"}</div>
         <div class="row2" style="flex-wrap:nowrap;margin-top:.3rem"><button class="btn" data-pin="set">Change</button><button class="btn" data-pin="revoke">Revoke</button></div>`
      : `<button class="btn" data-pin="set">Give PIN</button>`;
  };
  const F = (() => { try { return JSON.parse(localStorage.getItem("custView") || "{}"); } catch (e) { return {}; } })();
  const openSet = new Set(); // customers expanded to show their details
  const st = { rep: F.rep || "", month: F.month || "", buy: F.buy || "", sort: F.sort || "created", dir: F.dir || "" };
  const ym = (d) => new Date(d).toLocaleDateString("en-CA", { timeZone: "America/Chicago" }).slice(0, 7);
  const ymName = (k) => { const [y, m] = k.split("-"); return new Date(+y, +m - 1, 1).toLocaleDateString("en-US", { month: "long", year: "numeric" }); };
  const SORTS = { created: (c) => new Date(c.created_at).getTime(), spend: (c) => c.total_cents, orders: (c) => c.orders, vials: (c) => c.vials, paid: (c) => c.spent_cents, open: (c) => c.open_cents, last: (c) => (c.last_order ? new Date(c.last_order).getTime() : 0), name: (c) => (c.name || c.email || "").toLowerCase() };
  const view = (all) => {
    let l = all.filter((c) => (!st.rep || (st.rep === "none" ? !c.rep_id : String(c.rep_id) === st.rep)) && (!st.month || ym(c.created_at) === st.month)
      && (!st.buy || (st.buy === "buyers" ? c.orders > 0 : st.buy === "none" ? !c.orders : c.open_cents > 0)));
    const key = SORTS[st.sort] || SORTS.created, asc = st.dir ? st.dir === "asc" : st.sort === "name";
    l.sort((a, b) => { const x = key(a), y = key(b); return (x < y ? -1 : x > y ? 1 : 0) * (asc ? 1 : -1); });
    return l;
  };
  const th = (k, label, cls = "") => `<th class="sortable${cls}" data-csort="${k}" style="cursor:pointer">${label}${st.sort === k ? (((st.dir ? st.dir === "asc" : k === "name") ? " ▲" : " ▼")) : ""}</th>`;
  const load = async () => {
    const { customers: all } = await api("/customers?q=" + encodeURIComponent(term));
    // filter options from what's on file
    const ms = document.getElementById("cMonth"), months = [...new Set(all.map((c) => ym(c.created_at)))].sort().reverse();
    ms.innerHTML = `<option value="">Added: any month</option>` + months.map((m) => `<option value="${m}"${st.month === m ? " selected" : ""}>Added ${ymName(m)}</option>`).join("");
    const rs = document.getElementById("cRep"); if (rs) rs.innerHTML = `<option value="">All reps</option><option value="none"${st.rep === "none" ? " selected" : ""}>No rep</option>` + repList.map((r) => `<option value="${r.id}"${st.rep === String(r.id) ? " selected" : ""}>${esc(r.name)}${r.active ? "" : " (off)"}</option>`).join("");
    document.getElementById("cBuy").value = st.buy; document.getElementById("cSort").value = st.sort;
    const list = view(all);
    document.getElementById("cSum").textContent = list.length ? `${list.length} customer${list.length === 1 ? "" : "s"}${list.length !== all.length ? ` of ${all.length}` : ""} · ${list.reduce((t, c) => t + c.orders, 0)} orders · ${list.reduce((t, c) => t + c.vials, 0)} vials · ${money(list.reduce((t, c) => t + c.total_cents, 0))} sales · ${money(list.reduce((t, c) => t + c.spent_cents, 0))} paid · ${money(list.reduce((t, c) => t + c.open_cents, 0))} open` : "";
    const acts = isOwner() ? `<button class="btn" data-corder>New order</button><button class="btn" data-cedit>Edit</button><button class="btn danger" data-cdel>Delete</button>` : isRep() ? `<button class="btn" data-corder>New order</button><button class="btn" data-cedit>Edit</button>` : `<button class="btn" data-corder>New order</button>`;
    const det = (lab, html) => `<div><div class="eyebrow" style="margin-bottom:.2rem">${lab}</div>${html}</div>`;
    document.getElementById("ct").innerHTML = list.length ? `<table class="tbl ctbl"><tr>${th("name", "Customer")}${isRep() ? "" : "<th>Sales rep</th>"}${th("orders", "Orders", " num")}${th("vials", "Vials", " num")}${th("spend", "Sales", " num")}${th("paid", "Paid", " num")}${th("open", "Open", " num")}${th("last", "Last order")}</tr>
      ${list.map((c) => { const open = openSet.has(c.id); return `<tr class="csum click" data-cid="${c.id}" data-cname="${esc(c.name || c.email)}" data-ctoggle aria-expanded="${open}"><td><span class="caret" style="display:inline-block;width:1rem;transition:transform .15s;${open ? "transform:rotate(90deg)" : ""}">▸</span><strong>${esc(c.name || c.email || "—")}</strong>${c.active ? "" : ' <span class="pill st-cancelled">off</span>'}${c.has_pin ? "" : ' <span class="pill" title="No PIN yet">no PIN</span>'}</td>
        ${isRep() ? "" : `<td>${esc(c.rep_name || "—")}</td>`}<td class="num">${c.orders}</td><td class="num">${c.vials}</td><td class="num"><strong>${money(c.total_cents)}</strong></td><td class="num">${money(c.spent_cents)}</td><td class="num">${c.open_cents ? money(c.open_cents) : "—"}</td><td>${c.last_order ? when(c.last_order) : "—"}</td></tr>
        <tr class="cdet" data-cid="${c.id}" data-cname="${esc(c.name || c.email)}"${open ? "" : " hidden"}><td colspan="${isRep() ? 7 : 8}" style="background:var(--ground,#f6f7f9)">
          <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(12rem,1fr));gap:.8rem 1.2rem;padding:.4rem .2rem">
            ${det("Email", c.email ? `<a href="#" data-cust-orders="${esc(c.email)}">${esc(c.email)}</a>` : `<a href="#" data-cust-orders="${esc(c.name)}" class="muted">no email · see orders</a>`)}
            ${det("Phone", c.phone ? `<a href="tel:${esc(c.phone)}">${esc(c.phone)}</a>` : '<span class="muted">—</span>')}
            ${det("Pricing", markupCell(c))}${isRep() ? "" : det("Sales rep", repCell(c))}${det("Site PIN", pinCell(c))}
            ${det("Joined", when(c.created_at))}${det("Account", `<label class="chk"><input type="checkbox" data-cact${c.active ? " checked" : ""}${ro()}> Active</label>`)}
            ${det("Average order", c.orders ? money(Math.round(c.total_cents / c.orders)) : "—")}</div>
          <div class="row2" style="margin-top:.6rem">${acts}</div></td></tr>`; }).join("")}</table>` : `<p class="muted">No customers yet.${isOwner() || isRep() ? " Use Add customer to set one up." : ""}</p>`;
    lastList = list;
  };
  const save = () => { try { localStorage.setItem("custView", JSON.stringify(st)); } catch (e) {} };
  document.getElementById("cMonth").onchange = (e) => { st.month = e.target.value; save(); load(); };
  document.getElementById("cBuy").onchange = (e) => { st.buy = e.target.value; save(); load(); };
  document.getElementById("cSort").onchange = (e) => { st.sort = e.target.value; st.dir = ""; save(); load(); };
  if (document.getElementById("cRep")) document.getElementById("cRep").onchange = (e) => { st.rep = e.target.value; save(); load(); };
  document.getElementById("cAll").onclick = () => { const all = openSet.size < lastList.length; openSet.clear(); if (all) lastList.forEach((c) => openSet.add(c.id)); document.getElementById("cAll").textContent = all ? "Collapse all" : "Expand all";
    document.querySelectorAll("#ct tr.cdet").forEach((r) => { r.hidden = !all; }); document.querySelectorAll("#ct tr.csum").forEach((r) => { r.setAttribute("aria-expanded", all); r.querySelector(".caret").style.transform = all ? "rotate(90deg)" : ""; }); };
  document.getElementById("ct").addEventListener("click", (e) => { const t = e.target.closest("tr.csum"); if (!t || e.target.closest("a, button, input, select")) return; const id = +t.dataset.cid, det = t.nextElementSibling, open = det.hidden;
    det.hidden = !open; t.setAttribute("aria-expanded", open); t.querySelector(".caret").style.transform = open ? "rotate(90deg)" : ""; if (open) openSet.add(id); else openSet.delete(id); });
  document.getElementById("ct").addEventListener("click", (e) => { const h = e.target.closest("[data-csort]"); if (!h) return; const k = h.dataset.csort;
    if (st.sort === k) st.dir = (st.dir ? st.dir === "asc" : k === "name") ? "desc" : "asc"; else { st.sort = k; st.dir = ""; } save(); load(); });
  let lastList = [];
  const editForm = (c) => {
    const a = c.address || {};
    const f = (id, label, val = "", type = "text") => `<div class="field"><label class="eyebrow" for="${id}">${label}</label><input id="${id}" type="${type}" value="${esc(val)}"></div>`;
    document.getElementById("cNew").innerHTML = `<div class="panel" style="border-color:var(--blue)"><h2>Edit customer</h2><div class="grid2">${f("ec-n", "Name", c.name)}${f("ec-e", "Email (optional)", c.email || "", "email")}${f("ec-p", "Phone", c.phone, "tel")}</div>
      <div class="grid2">${f("ec-1", "Street address", a.line1)}${f("ec-2", "Apt, suite", a.line2)}${f("ec-c", "City", a.city)}${f("ec-s", "State", a.state)}${f("ec-z", "ZIP", a.zip)}</div>
      <div class="row2"><button class="btn solid" type="button" id="ecSave">Save changes</button><button class="btn" type="button" id="ecCancel">Cancel</button></div></div>`;
    window.scrollTo(0, 0);
    document.getElementById("ecCancel").onclick = () => { document.getElementById("cNew").innerHTML = ""; paneDirty = false; };
    document.getElementById("ecSave").onclick = async () => {
      const g = (x) => document.getElementById(x).value;
      await api("/customers/" + c.id, { method: "PATCH", body: { edit: true, name: g("ec-n"), email: g("ec-e"), phone: g("ec-p"), address: { line1: g("ec-1"), line2: g("ec-2"), city: g("ec-c"), state: g("ec-s"), zip: g("ec-z") } } });
      toast("Customer updated"); paneDirty = false; document.getElementById("cNew").innerHTML = ""; load();
    };
  };
  const showPin = (name, pin) => {
    document.getElementById("pinShow").innerHTML = `<div class="panel" style="border-color:var(--blue)"><h2>PIN for ${esc(name)}</h2>
      <p style="font:700 2rem/1 var(--mono);letter-spacing:.2em">${esc(pin)}</p>
      <p class="muted">Send this to the customer now. For security it isn't shown again. If it's lost, click Change to give them a new one.</p>
      <div class="row2"><button class="btn" type="button" id="pinCopy">Copy PIN</button><button class="btn" type="button" id="pinHide">Done</button></div></div>`;
    document.getElementById("pinCopy").onclick = () => navigator.clipboard?.writeText(pin).then(() => toast("PIN copied"), () => toast("Copy failed"));
    document.getElementById("pinHide").onclick = () => { document.getElementById("pinShow").innerHTML = ""; };
    window.scrollTo(0, 0);
  };
  const askPin = (name, err) => new Promise((done) => {
    document.getElementById("pinShow").innerHTML = `<div class="panel"><h2>PIN for ${esc(name)}</h2>${err ? `<p class="err" style="color:#b91c1c;font-weight:600">${esc(err)}</p>` : ""}
      <div class="row2" style="align-items:end"><div class="field" style="max-width:16rem"><label class="eyebrow" for="pinIn">Type a 4 to 8 digit PIN, or leave blank to make one up</label><input id="pinIn" inputmode="numeric" maxlength="8" autocomplete="off"${err ? ' style="border-color:#b91c1c"' : ""}></div>
      <button class="btn solid" type="button" id="pinOk">Save PIN</button><button class="btn" type="button" id="pinNo">Cancel</button></div></div>`;
    window.scrollTo(0, 0); document.getElementById("pinIn").focus();
    document.getElementById("pinOk").onclick = () => done(document.getElementById("pinIn").value.trim());
    document.getElementById("pinNo").onclick = () => { document.getElementById("pinShow").innerHTML = ""; done(null); };
  });
  const givePin = async (id, name, err) => {
    const typed = await askPin(name, err); if (typed === null) return;
    if (typed && !/^\d{4,8}$/.test(typed)) { return givePin(id, name, "A customer PIN is 4 to 8 digits — " + typed.length + " typed. Try again."); }
    try { const r = await api(`/customers/${id}/pin`, { method: "POST", body: { pin: typed } }); showPin(name, r.pin); load(); } catch (e) { /* toast shown */ }
  };
  let t; document.getElementById("cq").oninput = (e) => { clearTimeout(t); t = setTimeout(() => { term = e.target.value; load(); }, 250); };
  // PIN requests from the store's sign-in box
  const loadRequests = async () => {
    if (isRep()) return;
    const { requests } = await api("/pin-requests").catch(() => ({ requests: [] }));
    const open = requests.filter((r) => r.status === "new");
    document.getElementById("pinReq").innerHTML = open.length ? `<div class="panel" style="border-color:var(--blue)"><h2>PIN requests (${open.length})</h2>
      <p class="muted">People who asked for a PIN on the store. Approve makes the customer (you can pick a rep and pricing), then shows the PIN to send them.</p>
      <div class="tblwrap"><table class="tbl"><tr><th>When</th><th>Name</th><th>Company</th><th>Email</th><th>Phone</th><th>Message</th>${isOwner() ? "<th></th>" : ""}</tr>
      ${open.map((r) => `<tr data-rq="${r.id}"><td>${when(r.created_at)}</td><td>${esc(r.name)}</td><td>${esc(r.company)}</td><td>${r.email ? `<a href="mailto:${esc(r.email)}">${esc(r.email)}</a>` : ""}</td><td>${r.phone ? `<a href="tel:${esc(r.phone)}">${esc(r.phone)}</a>` : ""}</td><td class="muted">${esc(r.note)}</td>
        ${isOwner() ? `<td class="row2" style="flex-wrap:nowrap"><button class="btn solid" data-rq-ok>Approve &amp; give PIN</button><button class="btn" data-rq-no>Dismiss</button></td>` : ""}</tr>`).join("")}</table></div>
      ${isOwner() ? `<div class="row2" style="align-items:end"><div class="field" style="max-width:16rem"><label class="eyebrow" for="rq-rep">Sales rep for approved requests</label><select id="rq-rep"><option value="">— none —</option>${activeReps.map((r) => `<option value="${r.id}">${esc(r.name)}</option>`).join("")}</select></div>
        <div class="field" style="max-width:14rem"><label class="eyebrow" for="rq-mk">Markup</label><select id="rq-mk"><option value="">Store prices</option>${MK.map((m) => `<option value="${m}">+${m}%</option>`).join("")}</select></div></div>` : ""}</div>` : "";
    document.getElementById("pinReq").onclick = async (e) => {
      const tr = e.target.closest("tr[data-rq]"); if (!tr) return;
      const r = open.find((x) => String(x.id) === tr.dataset.rq);
      if (e.target.closest("[data-rq-no]")) { if (!confirm(`Dismiss the request from ${r.name}?`)) return; await api(`/pin-requests/${r.id}/dismiss`, { method: "POST" }); toast("Dismissed"); drawNav(); return loadRequests(); }
      if (e.target.closest("[data-rq-ok]")) {
        const res = await api(`/pin-requests/${r.id}/approve`, { method: "POST", body: { repId: document.getElementById("rq-rep").value || null, markup: document.getElementById("rq-mk").value } });
        toast("Customer created"); drawNav(); await loadRequests(); await load();
        givePin(res.customerId, r.name);
      }
    };
  };
  loadRequests();
  if (document.getElementById("addC")) document.getElementById("addC").onclick = () => {
    const box = document.getElementById("cNew");
    if (box.innerHTML) { box.innerHTML = ""; return; }
    const f = (id, label, type = "text") => `<div class="field"><label class="eyebrow" for="${id}">${label}</label><input id="${id}" type="${type}"></div>`;
    box.innerHTML = `<div class="panel"><h2>Add customer</h2><div class="grid2">${f("nc-n", "Name")}${f("nc-e", "Email (optional)", "email")}${f("nc-p", "Phone", "tel")}</div>
      <p class="muted" style="margin:-.3rem 0 0">Email is only needed for order confirmations and password sign-in; a PIN works without one.</p>
      <div class="grid2">${f("nc-1", "Street address")}${f("nc-2", "Apt, suite")}${f("nc-c", "City")}${f("nc-s", "State")}${f("nc-z", "ZIP")}</div>
      <div class="grid2"${isRep() ? " hidden" : ""}><div class="field" style="max-width:20rem"><label class="eyebrow" for="nc-rep">Sales rep (for commission)</label><select id="nc-rep"><option value="">— none —</option>${activeReps.map((r) => `<option value="${r.id}">${esc(r.name)} · ${r.commission_rate}%</option>`).join("")}</select></div>
      <div class="field" style="max-width:20rem"><label class="eyebrow" for="nc-mk">Markup over our cost</label><div class="row2" style="flex-wrap:nowrap"><select id="nc-mk" style="flex:1"><option value="">Store prices</option>${MK.map((m) => `<option value="${m}">+${m}%</option>`).join("")}<option value="custom">Custom…</option></select><input id="nc-mkc" inputmode="decimal" placeholder="%" style="width:5rem" hidden></div></div></div>
      <div class="row2" style="align-items:end"${isRep() ? " hidden" : ""}><label class="chk"><input type="checkbox" id="nc-pin" checked> Give them a PIN now</label><div class="field" style="max-width:14rem"><label class="eyebrow" for="nc-pinval">Their PIN · 4 to 8 digits (blank = make one up)</label><input id="nc-pinval" inputmode="numeric" maxlength="8" autocomplete="off" placeholder="e.g. 4455"></div></div>
      <div class="row2"><button class="btn solid" type="button" id="ncSave">Add customer</button><button class="btn" type="button" id="ncCancel">Cancel</button></div></div>`;
    document.getElementById("ncCancel").onclick = () => { box.innerHTML = ""; };
    document.getElementById("nc-mk").onchange = (e) => { const c = document.getElementById("nc-mkc"); c.hidden = e.target.value !== "custom"; if (!c.hidden) c.focus(); };
    document.getElementById("ncSave").onclick = async () => {
      const g = (x) => document.getElementById(x).value;
      const mk = g("nc-mk") === "custom" ? g("nc-mkc") : g("nc-mk");
      if (g("nc-mk") === "custom" && !(parseFloat(mk) >= 0)) return toast("Enter the custom markup as a percent, like 35");
      const wantPin = !isRep() && document.getElementById("nc-pin").checked, name = g("nc-n"), typedPin = wantPin ? g("nc-pinval").trim() : "";
      if (typedPin && !/^\d{4,8}$/.test(typedPin)) { const i = document.getElementById("nc-pinval"); i.focus(); i.style.borderColor = "#b91c1c"; return toast("Customer PINs are 4 to 8 digits"); }
      const r = await api("/customers", { method: "POST", body: { name: g("nc-n"), email: g("nc-e"), phone: g("nc-p"), repId: g("nc-rep") || null, markup: mk, address: { line1: g("nc-1"), line2: g("nc-2"), city: g("nc-c"), state: g("nc-s"), zip: g("nc-z") }, givePin: wantPin, pin: typedPin } });
      box.innerHTML = ""; toast("Customer added"); await load();
      if (r.pin) showPin(name, r.pin); // saved in the same step: nothing else to tap
      else if (r.pinError) { toast(r.pinError); givePin(r.id, name); }
    };
  };
  document.getElementById("ct").onclick = async (e) => {
    const link = e.target.closest("[data-cust-orders]");
    if (link) { e.preventDefault(); oFilter = { status: "", q: link.dataset.custOrders }; go("orders"); return; }
    const tr = e.target.closest("tr[data-cid]");
    if (tr && e.target.closest("[data-corder]")) { pickCustomer = +tr.dataset.cid; go("neworder"); return; }
    if (tr && e.target.closest("[data-cedit]")) { const c = lastList.find((x) => String(x.id) === tr.dataset.cid); if (c) editForm(c); return; }
    if (tr && e.target.closest("[data-cdel]")) {
      const c = lastList.find((x) => String(x.id) === tr.dataset.cid);
      if (!confirm(`Delete ${tr.dataset.cname}? Their login and PIN are removed. Past orders are kept with the name and address they were placed with.${c && c.orders ? ` (${c.orders} order${c.orders === 1 ? "" : "s"})` : ""}`)) return;
      await api("/customers/" + tr.dataset.cid, { method: "DELETE" }); toast("Customer deleted"); return load();
    }
    const pb = e.target.closest("[data-pin]");
    if (pb && tr) {
      if (pb.dataset.pin === "revoke") {
        if (!confirm(`Revoke ${tr.dataset.cname}'s PIN? They lose access to the site right away.`)) return;
        await api(`/customers/${tr.dataset.cid}/pin`, { method: "DELETE" }); toast("PIN revoked"); return load();
      }
      return givePin(tr.dataset.cid, tr.dataset.cname);
    }
    const box = e.target.closest("[data-cact]");
    if (box) { await api("/customers/" + box.closest("tr").dataset.cid, { method: "PATCH", body: { active: box.checked } }); toast(box.checked ? "Account turned on" : "Account turned off"); }
  };
  document.getElementById("ct").onchange = async (e) => {
    const mk = e.target.closest("[data-markup]");
    if (mk) {
      const inp = mk.parentElement.querySelector("[data-markup-custom]");
      if (mk.value === "custom") { inp.hidden = false; inp.focus(); return; }
      inp.hidden = true;
      await api("/customers/" + mk.closest("tr").dataset.cid, { method: "PATCH", body: { markup: mk.value } });
      toast(mk.value ? `Pays cost +${mk.value}% from now on` : "Pays store prices"); return;
    }
    const mc = e.target.closest("[data-markup-custom]");
    if (mc) {
      const v = parseFloat(mc.value);
      if (!(v >= 0)) return toast("Enter the markup as a percent, like 35");
      await api("/customers/" + mc.closest("tr").dataset.cid, { method: "PATCH", body: { markup: v } });
      toast(`Pays cost +${v}% from now on`); return;
    }
    const sel = e.target.closest("[data-rep]"); if (!sel) return;
    await api("/customers/" + sel.closest("tr").dataset.cid, { method: "PATCH", body: { repId: sel.value || null } });
    toast(sel.value ? "Sales rep assigned. New orders from this customer earn them commission." : "Sales rep removed");
  };
  load();
}

/* ---------- sales reps ---------- */
async function reps() {
  const PLAN_ON = isOwner() ? await api("/commissions/plan").then((j) => j.on).catch(() => false) : false;
  if (!isOwner()) return dashboard();
  const $ = (x) => document.getElementById(x);
  const { reps: list } = await api("/reps");
  const F = (() => { try { return JSON.parse(localStorage.getItem("repView") || "{}"); } catch (e) { return {}; } })();
  const st = { q: "", show: F.show || "active", sort: F.sort || "month" }, openSet = new Set();
  const SORTS = { month: (r) => r.month_cents, sales: (r) => r.sales_cents, owed: (r) => r.commission.earned, customers: (r) => r.customers, orders: (r) => r.orders, name: (r) => r.name.toLowerCase() };
  pane().innerHTML = `<header><h1>Sales reps</h1><button class="btn solid" id="addRep">Add sales rep</button></header>
    <p class="muted">Reps sign in at <a href="/rep" target="_blank">/rep</a> (the rep app). They add their own customers and place orders for them; every order from one of their customers earns their commission, whether the rep or the customer placed it. Tap a rep to change their details or plan.</p>
    <div id="repForm"></div>
    <div class="filters" style="flex-wrap:wrap;gap:.5rem"><input id="rq" type="search" placeholder="Search reps">
      <select id="rShow"><option value="active">Active reps</option><option value="off">Turned off</option><option value="">All reps</option></select>
      <select id="rSort">${[["month", "This month"], ["sales", "Sales (all)"], ["owed", "Owed now"], ["customers", "Customers"], ["orders", "Orders"], ["name", "Name A–Z"]].map(([k, l]) => `<option value="${k}">Sort: ${l}</option>`).join("")}</select></div>
    <div class="row2" style="justify-content:space-between;align-items:center"><p class="muted" id="rSum" style="margin:0"></p><button class="btn" type="button" id="rAll">Expand all</button></div>
    <div class="tblwrap" id="rt"></div>`;
  let shown = [];
  const draw = () => {
    shown = list.filter((r) => (!st.show || (st.show === "off" ? !r.active : r.active)) && (!st.q || [r.name, r.email, r.phone].join(" ").toLowerCase().includes(st.q)));
    const key = SORTS[st.sort] || SORTS.month, asc = st.sort === "name";
    shown.sort((a, b) => { const x = key(a), y = key(b); return (x < y ? -1 : x > y ? 1 : 0) * (asc ? 1 : -1); });
    $("rSum").textContent = shown.length ? `${shown.length} rep${shown.length === 1 ? "" : "s"} · ${shown.reduce((t, r) => t + r.customers, 0)} customers · ${money(shown.reduce((t, r) => t + r.month_cents, 0))} this month · ${money(shown.reduce((t, r) => t + r.commission.earned, 0))} owed` : "";
    const det = (lab, html) => `<div><div class="eyebrow" style="margin-bottom:.2rem">${lab}</div>${html}</div>`;
    $("rt").innerHTML = shown.length ? `<table class="tbl ctbl"><thead><tr><th>Rep</th><th class="num">Customers</th><th class="num">This month</th><th class="num">Sales (all)</th><th class="num">Owed now</th></tr></thead><tbody>
      ${shown.map((r) => { const open = openSet.has(r.id); return `<tr class="csum click" data-rid="${r.id}" aria-expanded="${open}"><td><span class="caret" style="display:inline-block;width:1rem;transition:transform .15s;${open ? "transform:rotate(90deg)" : ""}">▸</span><strong>${esc(r.name)}</strong>${r.active ? "" : ' <span class="pill st-cancelled">off</span>'}</td>
        <td class="num">${r.customers}</td><td class="num">${money(r.month_cents)}</td><td class="num">${money(r.sales_cents)}</td><td class="num"><strong>${money(r.commission.earned)}</strong></td></tr>
        <tr class="cdet" data-rid="${r.id}"${open ? "" : " hidden"}><td colspan="5" style="background:var(--ground,#f6f7f9)">
          <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,12rem),1fr));gap:.8rem 1.2rem;padding:.4rem .2rem;align-items:start">
            ${det("Name", `<input data-k="name" value="${esc(r.name)}" style="width:100%">`)}${det("Email (login)", esc(r.email))}${det("Phone", `<input data-k="phone" value="${esc(r.phone || "")}" style="width:100%">`)}
            ${det("Commission", planPick(r, PLAN_ON).replace("justify-content:flex-end", "justify-content:flex-start"))}${det("Orders", r.orders)}${det("Paid out", money(r.commission.paid))}
            ${det("Status", `<label class="chk"><input type="checkbox" data-k="active"${r.active ? " checked" : ""}> Active</label>`)}${det("New password", `<input data-k="password" type="password" placeholder="Leave blank" autocomplete="new-password" style="width:100%">`)}</div>
          <div class="row2" style="margin-top:.6rem"><button class="btn solid" data-save>Save</button><button class="btn" data-comm="${r.id}">Commissions</button><button class="btn" data-rcust="${r.id}">Customers</button></div></td></tr>`; }).join("")}</tbody></table>` : `<p class="muted">${list.length ? "No reps match." : "No sales reps yet."}</p>`;
  };
  const save = () => { try { localStorage.setItem("repView", JSON.stringify({ show: st.show, sort: st.sort })); } catch (e) {} };
  $("rShow").value = st.show; $("rSort").value = st.sort;
  $("rq").oninput = (e) => { st.q = e.target.value.trim().toLowerCase(); draw(); };
  $("rShow").onchange = (e) => { st.show = e.target.value; save(); draw(); };
  $("rSort").onchange = (e) => { st.sort = e.target.value; save(); draw(); };
  $("rAll").onclick = () => { const all = openSet.size < shown.length; openSet.clear(); if (all) shown.forEach((r) => openSet.add(r.id)); $("rAll").textContent = all ? "Collapse all" : "Expand all"; draw(); };
  draw();
  $("addRep").onclick = () => {
    const f = (id, label, type = "text", extra = "") => `<div class="field"><label class="eyebrow" for="${id}">${label}</label><input id="${id}" type="${type}"${extra}></div>`;
    $("repForm").innerHTML = `<div class="panel"><h2>New sales rep</h2><div class="grid2">${f("nr-n", "Name")}${f("nr-e", "Email (their login)", "email")}${f("nr-p", "Phone", "tel")}${f("nr-r", "Commission %", "text", ' inputmode="decimal" placeholder="e.g. 10"')}${f("nr-pw", "Temporary password (8+ characters)", "password", ' autocomplete="new-password"')}</div>
      <div class="row2"><button class="btn solid" id="nrSave">Add rep</button><button class="btn" id="nrCancel">Cancel</button></div></div>`;
    $("nrCancel").onclick = () => { $("repForm").innerHTML = ""; paneDirty = false; };
    $("nrSave").onclick = async () => {
      const g = (x) => $(x).value.trim();
      await api("/reps", { method: "POST", body: { name: g("nr-n"), email: g("nr-e"), phone: g("nr-p"), rate: g("nr-r"), password: $("nr-pw").value } });
      toast("Rep added. Send them /rep and their temporary password."); paneDirty = false; reps();
    };
  };
  $("rt").addEventListener("change", planToggle);
  $("rt").onclick = async (e) => {
    const c = e.target.closest("[data-comm]"); if (c) { commFilter.rep = c.dataset.comm; go("commissions"); return; }
    const rc = e.target.closest("[data-rcust]"); if (rc) { try { const v = JSON.parse(localStorage.getItem("custView") || "{}"); v.rep = rc.dataset.rcust; localStorage.setItem("custView", JSON.stringify(v)); } catch (er) {} go("customers"); return; }
    const sm = e.target.closest("tr.csum"); if (sm && !e.target.closest("a, button, input, select")) { const id = +sm.dataset.rid, d = sm.nextElementSibling, open = d.hidden; d.hidden = !open; sm.setAttribute("aria-expanded", open); sm.querySelector(".caret").style.transform = open ? "rotate(90deg)" : ""; if (open) openSet.add(id); else openSet.delete(id); return; }
    if (!e.target.closest("[data-save]")) return;
    const tr = e.target.closest("tr.cdet[data-rid]"), body = {};
    tr.querySelectorAll("[data-k]").forEach((i) => { if (i.type === "checkbox") body.active = i.checked; else if (i.dataset.k !== "password" || i.value) body[i.dataset.k] = i.value; });
    await api("/reps/" + tr.dataset.rid, { method: "PATCH", body }); toast("Saved"); paneDirty = false; reps();
  };
}

/* ---------- commissions ---------- */
let surgPick = "", commFilter = { rep: "", from: "", to: "", status: "" }, commView = localStorage.getItem("commView") || "combined", commMonth = new Date().toISOString().slice(0, 7);
const usd = (n) => "$" + (Number(n) || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const monthLabel = (ym) => new Date(ym + "-15T12:00:00").toLocaleDateString("en-US", { month: "long", year: "numeric" });
const commSwitch = () => HUB.linked ? `<div class="seg" style="display:inline-flex;margin:0 0 .8rem">${[["combined", "Combined"], ["store", "Peptide store"], ["tracker", "Surgical cases"]].map(([k, l]) => `<button type="button" data-cv="${k}"${commView === k ? ' class="on"' : ""}>${l}</button>`).join("")}</div>` : "";
const wireCommSwitch = () => { document.querySelectorAll("[data-cv]").forEach((b) => { b.onclick = () => { commView = b.dataset.cv; localStorage.setItem("commView", commView); commissions(); }; }); };
// the month the store rows use when the view is Combined / Case tracker
const monthRange = (ym) => { const [y, m] = ym.split("-").map(Number); const last = new Date(Date.UTC(y, m, 0)).getUTCDate(); return { from: `${ym}-01`, to: `${ym}-${String(last).padStart(2, "0")}` }; };
/* each rep's commission: the tiered plan (Commissions → Commission plan) or their own flat % */
const planPick = (u, planOn, isRepRow = true) => { const tiered = u.comm_tiered !== false;
  return `<div class="row2 planpick" style="flex-wrap:nowrap;align-items:center;gap:.3rem;justify-content:flex-end"${isRepRow ? "" : " hidden"}><select data-k="plan" title="Tiered = the Commission plan under Commissions; Flat = this rep's own percent"><option value="tiered"${tiered ? " selected" : ""}>Tiered plan${planOn ? "" : " (not on yet)"}</option><option value="flat"${tiered ? "" : " selected"}>Flat %</option></select>
    <span data-flat${tiered ? " hidden" : ""} style="white-space:nowrap"><input data-k="rate" inputmode="decimal" value="${esc(Number(u.commission_rate ?? 0))}" placeholder="10" style="width:4rem;text-align:right">%</span></div>`; };
const planToggle = (e) => { const s = e.target.closest('[data-k="plan"]'); if (!s) return false; const f = s.parentElement.querySelector("[data-flat]"); if (f) f.hidden = s.value !== "flat"; return true; };
/* ---------- tiered commission plan (admins) ---------- */
async function commPlanPanel(box, reload) {
  const P = await api("/commissions/plan");
  let tiers = P.tiers.map((t) => ({ ...t })), mode = P.mode, on = P.on;
  const fmt$ = (n) => "$" + Number(n).toLocaleString("en-US");
  const commFor = (cents) => { const T = [...tiers].filter((t) => t.from !== "" && isFinite(+t.from)).map((t) => ({ from: +t.from, rate: +t.rate || 0 })).sort((a, b) => a.from - b.from); if (!T.length) return 0;
    if (mode === "whole") { const r = T.reduce((x, t) => (cents >= t.from * 100 ? t.rate : x), T[0].rate); return Math.round((cents * r) / 100); }
    return Math.round(T.reduce((tot, t, i) => { const lo = t.from * 100, hi = i + 1 < T.length ? T[i + 1].from * 100 : Infinity; return cents > lo ? tot + ((Math.min(cents, hi) - lo) * t.rate) / 100 : tot; }, 0)); };
  const draw = () => {
    const sorted = tiers.map((t, i) => ({ ...t, i })).sort((a, b) => (+a.from || 0) - (+b.from || 0));
    box.innerHTML = `<div class="panel" data-nofold style="border-color:${on ? "var(--blue)" : "var(--line)"}"><div class="row2" style="justify-content:space-between;align-items:center"><h2 style="margin:0">Commission plan · ${on ? '<span class="pill st-shipped">Tiered</span>' : '<span class="pill">Flat rate per rep</span>'}</h2>
        <label class="chk"><input type="checkbox" id="tpOn"${on ? " checked" : ""}> Use tiered payouts</label></div>
      <p class="muted">A rep's product sales for the calendar month (after discounts, before shipping; cancelled orders left out) decide the rate. ${on ? "" : "While this is off, each rep earns their own flat rate from Sales reps."}</p>
      <div class="seg" style="margin:.4rem 0"><button type="button" data-tpmode="whole"${mode === "whole" ? ' class="on"' : ""}>Whole month at the tier reached</button><button type="button" data-tpmode="bracket"${mode === "bracket" ? ' class="on"' : ""}>Each slice at its own rate</button></div>
      <p class="muted" style="margin-top:0">${mode === "whole" ? "Example: reach the $5,000 tier and every dollar that month earns that tier's rate." : "Example: the first $5,000 earns the first rate, the next slice the second rate, and so on (like tax brackets)."}</p>
      <div class="tblwrap" style="max-width:34rem"><table class="tbl compact"><thead><tr><th>Monthly sales from</th><th>Up to</th><th class="num">Rate</th><th></th></tr></thead><tbody>
        ${sorted.map((t, n) => `<tr><td><div class="row2" style="flex-wrap:nowrap;align-items:center">$<input data-tf="${t.i}" value="${esc(t.from)}" inputmode="numeric" style="width:7rem"${t.from === 0 && n === 0 ? " readonly title=\"The first tier starts at $0\"" : ""}></div></td>
          <td class="muted">${n + 1 < sorted.length ? "under " + fmt$(sorted[n + 1].from) : "and up"}</td><td class="num"><div class="row2" style="flex-wrap:nowrap;align-items:center;justify-content:flex-end"><input data-tr="${t.i}" value="${esc(t.rate)}" inputmode="decimal" style="width:4.5rem;text-align:right">%</div></td>
          <td>${n === 0 ? "" : `<button class="btn" type="button" data-tdel="${t.i}" title="Remove this tier">✕</button>`}</td></tr>`).join("")}</tbody></table></div>
      <div class="row2" style="margin:.4rem 0"><button class="btn" type="button" id="tpAdd">+ Add tier</button></div>
      <div class="row2" style="align-items:center;flex-wrap:wrap;gap:.5rem;margin:.4rem 0"><span class="muted">Try it: a month with sales of $</span><input id="tpTry" value="${esc(box.dataset.try || "6000")}" inputmode="numeric" style="width:7rem"><strong id="tpOut"></strong></div>
      <details style="margin:.6rem 0"><summary>Which reps are on the plan (${P.reps.filter((r) => r.comm_tiered).length} of ${P.reps.length})</summary>
        <p class="muted">Untick a rep to keep them on their own flat rate.</p>${P.reps.map((r) => `<label class="chk" style="display:block"><input type="checkbox" data-trep="${r.id}"${r.comm_tiered ? " checked" : ""}> ${esc(r.name)}${r.active ? "" : " (off)"} <span class="muted">· flat rate ${Number(r.commission_rate || 0)}%</span></label>`).join("")}</details>
      <div class="row2"><button class="btn solid" type="button" id="tpSave">Save plan</button><span class="muted">Applies to every order's commission, including this month's; orders already paid out keep the payout amount.</span></div></div>`;
    const tryIt = () => { const v = Math.round(parseFloat(String(document.getElementById("tpTry").value).replace(/[$,]/g, "")) * 100) || 0, c = commFor(v); box.dataset.try = document.getElementById("tpTry").value; document.getElementById("tpOut").textContent = `→ ${money(c)} commission${v ? ` (${((c / v) * 100).toFixed(1)}% overall)` : ""}`; };
    tryIt();
    box.oninput = (e) => { if (e.target.dataset.tf !== undefined) tiers[+e.target.dataset.tf].from = e.target.value.replace(/[$,\s]/g, ""); if (e.target.dataset.tr !== undefined) tiers[+e.target.dataset.tr].rate = e.target.value.replace(/[%\s]/g, ""); tryIt(); };
    box.onchange = (e) => { if (e.target.dataset.tf !== undefined) draw(); if (e.target.id === "tpOn") { on = e.target.checked; draw(); } };
    box.onclick = async (e) => {
      const m = e.target.closest("[data-tpmode]"); if (m) { mode = m.dataset.tpmode; return draw(); }
      const d = e.target.closest("[data-tdel]"); if (d) { tiers.splice(+d.dataset.tdel, 1); return draw(); }
      if (e.target.id === "tpAdd") { const last = Math.max(0, ...tiers.map((t) => +t.from || 0)); tiers.push({ from: last + 2500, rate: (+tiers[tiers.length - 1]?.rate || 0) + 5 }); return draw(); }
      if (e.target.id === "tpSave") {
        const reps = [...box.querySelectorAll("[data-trep]")].map((c) => ({ id: +c.dataset.trep, tiered: c.checked }));
        try { await api("/commissions/plan", { method: "PUT", body: { on, mode, tiers, reps } }); toast(on ? "Tiered plan saved — commissions updated" : "Plan saved (off: flat rates)"); paneDirty = false; reload(); } catch (x) {}
      }
    };
  };
  draw();
}
async function commissions() {
  if (!isOwner() && !isRep()) return dashboard();
  const $ = (x) => document.getElementById(x);
  if (!HUB.linked) commView = "store";
  if (commView !== "store") return commissionsHub();
  const { reps: repList } = isRep() ? { reps: [] } : await api("/reps");
  pane().innerHTML = `<header><h1>${isRep() ? "My commissions" : "Commissions"}</h1><a class="btn" id="cmCsv" href="#" style="display:inline-grid;place-items:center;text-decoration:none">Export CSV</a></header>
    ${commSwitch()}
    ${isOwner() ? '<div id="planBox"></div>' : ""}
    <div class="filters"><select id="cm-rep"${isRep() ? " hidden" : ""}><option value="">All reps</option>${repList.map((r) => `<option value="${r.id}"${String(r.id) === String(commFilter.rep) ? " selected" : ""}>${esc(r.name)}</option>`).join("")}</select>
      <input id="cm-from" type="date" value="${esc(commFilter.from)}"><input id="cm-to" type="date" value="${esc(commFilter.to)}">
      <select id="cm-st"><option value="">All statuses</option>${["pending", "earned", "paid", "void"].map((x) => `<option value="${x}"${commFilter.status === x ? " selected" : ""}>${x}</option>`).join("")}</select>
      <button class="btn" id="cm-month" type="button">This month</button><button class="btn" id="cm-clear" type="button">Clear</button></div>
    <dl class="kpis" id="cmK"></dl>
    <div class="panel" id="cmPay" hidden></div>
    <div class="tblwrap" id="cmT"></div>
    <div id="cmHist"></div>
    <p class="muted"><strong>Pending</strong> = order not paid yet. <strong>Earned</strong> = order paid, commission owed. <strong>Paid</strong> = included in a payout. <strong>Void</strong> = order cancelled. Commission = product total after discount × the rep's rate when the order was placed.</p>`;
  wireCommSwitch();
  const qs = () => new URLSearchParams(Object.fromEntries(Object.entries({ rep: commFilter.rep, from: commFilter.from, to: commFilter.to, status: commFilter.status }).filter(([, v]) => v))).toString();
  const load = async () => {
    const d = await api("/commissions?" + qs());
    $("cmCsv").href = "/api/admin/commissions.csv?" + qs();
    $("cmK").innerHTML = [["Sales (product total)", d.totals.sales], ["Pending", d.totals.pending], ["Earned, owed now", d.totals.earned], ["Paid out", d.totals.paid]].map(([k, v]) => `<div class="kpi"><dt>${k}</dt><dd>${money(v)}</dd></div>`).join("");
    const earned = d.rows.filter((r) => r.comm_status === "earned");
    $("cmT").innerHTML = d.rows.length ? `<table class="tbl"><tr><th>${earned.length && isOwner() ? '<input type="checkbox" id="cmAll" title="Select all earned">' : ""}</th><th>Date</th><th>Order</th><th>Rep</th><th>Customer</th><th>Order status</th><th class="num">Sales</th><th class="num">Rate</th><th class="num">Commission</th><th>Status</th></tr>
      ${d.rows.map((r) => `<tr><td>${r.comm_status === "earned" && isOwner() ? `<input type="checkbox" data-pick="${r.id}" data-rep="${r.rep_id}">` : ""}</td><td>${when(r.created_at)}</td><td class="mono"><a href="#" data-order="${r.id}">${esc(r.number)}</a></td><td>${esc(r.rep_name)}</td><td>${esc(r.customer)}</td><td>${pill(r.status)}</td>
        <td class="num">${money(r.subtotal_cents - r.discount_cents)}</td><td class="num">${r.commission_rate}%</td><td class="num"><strong>${money(r.commission_cents)}</strong></td><td><span class="pill st-${r.comm_status === "earned" ? "shipped" : r.comm_status === "paid" ? "delivered" : r.comm_status === "void" ? "cancelled" : "new"}">${r.comm_status}</span>${r.payout_date ? `<div class="muted" style="font-size:.72rem">${when(r.payout_date)}</div>` : ""}</td></tr>`).join("")}</table>` : `<p class="muted">No commissions match.</p>`;
    $("cmHist").innerHTML = d.payouts.length ? `<div class="panel"><h2>Payouts</h2><div class="tblwrap"><table class="tbl"><tr><th>Date</th><th>Rep</th><th class="num">Amount</th><th class="num">Orders</th><th>Note</th><th>By</th><th></th></tr>
      ${d.payouts.map((p) => `<tr><td>${when(p.paid_at)}</td><td>${esc(p.rep_name || "")}</td><td class="num"><strong>${money(p.amount_cents)}</strong></td><td class="num">${p.orders}</td><td>${esc(p.note)}</td><td>${esc(p.who)}</td><td>${isOwner() ? `<button class="btn" data-undo="${p.id}">Undo</button>` : ""}</td></tr>`).join("")}</table></div></div>` : "";
    const payBox = $("cmPay");
    const sync = () => {
      const picked = [...document.querySelectorAll("[data-pick]:checked")];
      if (!picked.length) { payBox.hidden = true; return; }
      const repIds = new Set(picked.map((c) => c.dataset.rep));
      const sum = picked.reduce((t, c) => t + d.rows.find((r) => String(r.id) === c.dataset.pick).commission_cents, 0);
      payBox.hidden = false;
      payBox.innerHTML = repIds.size > 1 ? `<div class="err">Select commissions for one rep at a time.</div>` : `<div class="row2" style="align-items:end"><div><strong>${picked.length} commission${picked.length === 1 ? "" : "s"} · ${money(sum)}</strong> for ${esc(d.rows.find((r) => String(r.id) === picked[0].dataset.pick).rep_name)}</div>
        <div class="field" style="flex:1;min-width:12rem"><label class="eyebrow" for="cmNote">Payout note (check #, Zelle, date…)</label><input id="cmNote"></div><button class="btn solid" id="cmPaid">Mark as paid out</button></div>`;
      if (repIds.size === 1) $("cmPaid").onclick = async () => {
        const r = await api("/commissions/payout", { method: "POST", body: { repId: picked[0].dataset.rep, orderIds: picked.map((c) => +c.dataset.pick), note: $("cmNote").value } });
        toast(`Paid out ${money(r.amountCents)} for ${r.orders} order${r.orders === 1 ? "" : "s"}`); paneDirty = false; load();
      };
    };
    $("cmT").onchange = (e) => { if (e.target.id === "cmAll") document.querySelectorAll("[data-pick]").forEach((c) => { c.checked = e.target.checked; }); sync(); };
    $("cmT").onclick = (e) => { const o = e.target.closest("[data-order]"); if (o) { e.preventDefault(); go("orders", o.dataset.order); } };
    $("cmHist").onclick = async (e) => { const u = e.target.closest("[data-undo]"); if (u && confirm("Undo this payout? Its commissions go back to earned.")) { await api("/commissions/payout/" + u.dataset.undo, { method: "DELETE" }); toast("Payout undone"); load(); } };
  };
  const apply = () => { commFilter = { rep: $("cm-rep").value, from: $("cm-from").value, to: $("cm-to").value, status: $("cm-st").value }; load(); };
  ["cm-rep", "cm-from", "cm-to", "cm-st"].forEach((id) => { $(id).onchange = apply; });
  $("cm-month").onclick = () => { const d = new Date(); $("cm-from").value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`; $("cm-to").value = ""; apply(); };
  $("cm-clear").onclick = () => { $("cm-rep").value = ""; $("cm-from").value = ""; $("cm-to").value = ""; $("cm-st").value = ""; apply(); };
  load();
  if (isOwner() && document.getElementById("planBox")) commPlanPanel(document.getElementById("planBox"), load).catch(() => {});
}

/* Combined / Case tracker commissions: the tracker is asked for its month per rep (actual vs plan × rate), the store's rows for the
   same month are summed per rep, and the two are shown side by side. Goals and targets stay separate — each app keeps its own plan. */
async function commissionsHub() {
  const $ = (x) => document.getElementById(x);
  const title = isRep() ? "My commissions" : "Commissions";
  pane().innerHTML = `<header><h1>${title}</h1><div class="row2"><button class="btn" id="cmPrev" type="button" title="Previous month">‹</button><input id="cmMonth" type="month" value="${esc(commMonth)}"><button class="btn" id="cmNext" type="button" title="Next month">›</button></div></header>
    ${commSwitch()}
    <dl class="kpis" id="cmK"></dl>
    <div class="tblwrap" id="cmT"><p class="muted">Loading…</p></div>
    <p class="muted" id="cmNote"></p>`;
  wireCommSwitch();
  const step = (n) => { const [y, m] = commMonth.split("-").map(Number); const d = new Date(Date.UTC(y, m - 1 + n, 1)); commMonth = d.toISOString().slice(0, 7); commissions(); };
  $("cmPrev").onclick = () => step(-1); $("cmNext").onclick = () => step(1);
  $("cmMonth").onchange = () => { if (/^\d{4}-\d{2}$/.test($("cmMonth").value)) { commMonth = $("cmMonth").value; commissions(); } };
  const { from, to } = monthRange(commMonth);
  const [tr, st] = await Promise.all([api("/hub/commissions?month=" + commMonth).catch((e) => ({ ok: false, error: e.message, reps: [] })), api("/commissions?" + new URLSearchParams({ from, to }).toString()).catch(() => ({ rows: [], totals: {} }))]);
  // store rows → per rep (name) for the month: earned + paid count as commission, pending shown separately, void ignored
  const storeBy = {};
  for (const r of st.rows || []) {
    const k = String(r.rep_name || "").trim(); if (!k || r.comm_status === "void") continue;
    const o = storeBy[k] || (storeBy[k] = { rep: k, sales: 0, pending: 0, earned: 0, paid: 0, orders: 0 });
    o.sales += r.subtotal_cents - r.discount_cents; o.orders++; o[r.comm_status] = (o[r.comm_status] || 0) + r.commission_cents;
  }
  const trackerBy = {}; for (const r of tr.reps || []) trackerBy[String(r.rep).trim()] = r;
  const names = [...new Set([...Object.keys(storeBy), ...Object.keys(trackerBy)])].sort((a, b) => a.localeCompare(b));
  const storeComm = (o) => (o ? o.earned + o.paid + o.pending : 0);
  if (commView === "tracker") { // surgical cases: the case tracker's plan math per rep, plus the cases behind it
    const rows = (tr.reps || []).slice().sort((a, b) => b.commission - a.commission), sum = (k) => rows.reduce((t, r) => t + (r[k] || 0), 0);
    const amt = (r, v) => (v === null || v === undefined ? "—" : r.metric === "Cases" ? v + " cases" : usd(v));
    $("cmK").innerHTML = [["Surgical sales", usd(tr.sales)], ["Surgical commission", usd(tr.total)], ["At current pace", usd(sum("comm_proj"))], [(tr.quarter || "Quarter") + " to date", usd(sum("comm_qtd"))], ["Est. pay (draw/base + comm.)", usd(sum("est_pay"))]].map(([k, v]) => `<div class="kpi"><dt>${k}</dt><dd>${v}</dd></div>`).join("");
    if (!tr.ok) { $("cmT").innerHTML = `<div class="err">Case tracker: ${esc(tr.error || "not reachable")}</div>`; $("cmNote").innerHTML = ""; return; }
    if (!rows.length) { $("cmT").innerHTML = `<p class="muted">No reps with a surgical plan for ${monthLabel(commMonth)}.</p>`; $("cmNote").innerHTML = ""; return; }
    if (!rows.some((r) => r.rep === surgPick)) surgPick = rows[0].rep;
    $("cmT").innerHTML = `<table class="tbl"><tr><th>Rep</th><th class="num">Sales</th><th class="num">Commission</th><th class="num">At pace</th><th class="num">${esc(tr.quarter || "QTD")} to date</th><th class="num">Est. pay</th></tr>
      ${rows.map((r) => `<tr data-surg="${esc(r.rep)}" style="cursor:pointer"><td><strong>${esc(r.rep)}</strong></td><td class="num">${amt(r, r.actual)}</td><td class="num"><strong>${usd(r.commission)}</strong></td><td class="num">${usd(r.comm_proj)}</td><td class="num">${usd(r.comm_qtd)}</td><td class="num">${usd(r.est_pay)}</td></tr>`).join("")}
      <tr><td><strong>Total</strong></td><td class="num">${usd(tr.sales)}</td><td class="num"><strong>${usd(tr.total)}</strong></td><td class="num">${usd(sum("comm_proj"))}</td><td class="num">${usd(sum("comm_qtd"))}</td><td class="num">${usd(sum("est_pay"))}</td></tr></table>
      <div class="row2" style="align-items:end;gap:.6rem;margin-top:1rem;flex-wrap:wrap"><div class="field" style="margin:0;flex:1 1 16rem;max-width:24rem"><label class="eyebrow" for="surgPick">Rep detail</label><select id="surgPick">${rows.map((r) => `<option${r.rep === surgPick ? " selected" : ""}>${esc(r.rep)}</option>`).join("")}</select></div></div><div id="surgOne"></div>`;
    const one = () => {
      const r = rows.find((x) => x.rep === surgPick), F = (k, v) => `<div><div class="eyebrow">${k}</div><div style="font-weight:600">${v}</div></div>`;
      const cl = r.case_list || [];
      $("surgOne").innerHTML = `<div class="panel" style="margin-top:.5rem"><div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,9.5rem),1fr));gap:.7rem 1rem">
          ${F("Plan", esc(r.metric || "Revenue") + (r.counts && r.counts !== "All" ? " · " + esc(r.counts) : "") + (r.product_filter ? " · " + esc(r.product_filter) : ""))}${F("Rate", r.comm_rate ? r.comm_rate + "%" : "—")}${F("Floor", r.comm_floor ? amt(r, r.comm_floor) + (r.carried ? `<div class="muted" style="font-size:.72rem">incl. ${amt(r, r.carried)} carried</div>` : "") : "None")}
          ${F("Quota / target", amt(r, r.quota) + (r.target && r.target !== r.quota ? " → " + amt(r, r.target) : ""))}${F("Sales", amt(r, r.actual))}${F("Cases done", r.cases)}${F("Commission", `<span style="color:var(--green,#0a7)">${usd(r.commission)}</span>`)}${F("At pace", usd(r.comm_proj))}${F((tr.quarter || "Q") + " to date", usd(r.comm_qtd))}${F("Pay", r.pay_type ? esc(r.pay_type) + " " + usd(r.pay_amount) : "Commission only")}${F("Est. pay", usd(r.est_pay))}</div>
        <h3 style="margin:1rem 0 .4rem">Cases in ${esc(monthLabel(commMonth))} (${cl.length})</h3>${cl.length ? `<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,15rem),1fr));gap:.5rem">${cl.map((c) => `<div style="border:1px solid var(--line);border-radius:10px;padding:.45rem .65rem${c.counts ? "" : ";opacity:.6"}"><div class="row2" style="justify-content:space-between;gap:.4rem"><strong>${esc(c.surgeon || "Surgeon TBD")}</strong><span>${r.metric === "Cases" ? "" : usd(c.net_sales)}</span></div><div class="muted" style="font-size:.78rem">${esc(c.date)}${c.facility ? " · " + esc(c.facility) : ""}${c.product ? " · " + esc(c.product) + (c.units ? " ×" + c.units : "") : ""}</div><div style="font-size:.72rem;margin-top:.15rem">${c.counts ? '<span class="pill st-paid">Counts</span>' : `<span class="pill st-cancelled">${/scheduled/i.test(c.status) ? "Scheduled" : "Doesn't count"}</span>`} <span class="muted">${esc(c.status)}${c.surgeon_type ? " · " + esc(c.surgeon_type) : ""}</span></div></div>`).join("")}</div>` : '<p class="muted">No cases logged.</p>'}</div>`;
    };
    $("surgPick").onchange = (e) => { surgPick = e.target.value; one(); };
    $("cmT").onclick = (e) => { const t = e.target.closest("[data-surg]"); if (!t) return; surgPick = t.dataset.surg; $("surgPick").value = surgPick; one(); $("surgOne").scrollIntoView({ behavior: "smooth", block: "start" }); };
    one();
    $("cmNote").innerHTML = `Surgical commission for ${esc(monthLabel(commMonth))} = rate × (sales − floor); the floor includes any carried shortfall. Estimates from cases logged in the case tracker — rates, floors, quotas and draws are set under Team logins → Case tracker plans.`;
    return;
  }
  // combined
  const totStore = names.reduce((t, n) => t + storeComm(storeBy[n]), 0), totTr = tr.total || 0;
  $("cmK").innerHTML = [["Peptide commission", money(totStore)], ["Surgical commission", usd(totTr)], ["Total commission", usd(totStore / 100 + totTr)], ["Peptide sales", money(names.reduce((t, n) => t + (storeBy[n] ? storeBy[n].sales : 0), 0))], ["Surgical sales", usd(tr.sales)]].map(([k, v]) => `<div class="kpi"><dt>${k}</dt><dd>${v}</dd></div>`).join("");
  $("cmT").innerHTML = names.length ? `<table class="tbl"><tr><th>Rep</th><th class="num">Peptide sales</th><th class="num">Peptide commission</th><th class="num">Surgical sales</th><th class="num">Surgical quota</th><th class="num">Surgical commission</th><th class="num">Total commission</th></tr>
    ${names.map((n) => { const s = storeBy[n], t = trackerBy[n]; const tot = storeComm(s) / 100 + (t ? t.commission : 0); return `<tr><td><strong>${esc(n)}</strong><div class="muted" style="font-size:.72rem">${[s ? "peptides" : "", t ? "surgical" : ""].filter(Boolean).join(" + ")}</div></td><td class="num">${s ? money(s.sales) : "—"}</td><td class="num">${s ? `${money(storeComm(s))}${s.pending ? `<div class="muted" style="font-size:.72rem">${money(s.pending)} pending</div>` : ""}` : "—"}</td><td class="num">${t ? (t.metric === "Cases" ? t.actual : usd(t.actual)) : "—"}</td><td class="num">${t && t.quota !== null && t.quota !== undefined ? (t.metric === "Cases" ? t.quota : usd(t.quota)) : "—"}</td><td class="num">${t ? usd(t.commission) : "—"}</td><td class="num"><strong>${usd(tot)}</strong></td></tr>`; }).join("")}</table>` : `<p class="muted">Nothing for ${monthLabel(commMonth)} in either app.</p>`;
  $("cmNote").innerHTML = `${tr.ok ? "" : `<span class="err" style="display:inline-block;margin-bottom:.4rem">Case tracker: ${esc(tr.error || "not reachable")} — showing the store only.</span><br>`}Store commission = earned + paid (+ pending) on orders placed in ${esc(monthLabel(commMonth))}; surgical commission = the case tracker plan for the same month. Switch to <strong>Peptide store</strong> to pick commissions and pay them out, or <strong>Surgical cases</strong> for each rep's plan and cases.`;
}

/* ---------- products ---------- */
let pFilter = "all"; const openP = new Set();
async function products() {
  const [{ products: list }, { reports: reps }] = await Promise.all([api("/products"), api("/reports")]);
  const repFor = (p) => reps.filter((r) => r.active && reportMatches(p, r));
  const COLS = [["name", "Name"], ["strength", "Size"], ["description", "Description (line 1: peptides + mg · then - benefits)"], ["category", "Category"], ["manufacturer", "Manufacturer"], ["cost", "Cost $"], ["price", "Price $"], ["stock", "Stock"], ["storeNote", "Store note"], ["maxPerOrder", "Max/order"], ["sort", "Sort"], ["active", "Active"], ["report", "Lab report"], ["docs", "Docs"]];
  const NUM = new Set(["cost", "price", "stock", "maxPerOrder", "sort"]);
  const inp = (k, v, ph = "", extra = "") => `<input data-k="${k}" value="${esc(v)}" placeholder="${ph}"${extra}${ro()}>`;
  // one product per row: the summary line (name, cost, price, stock) stays visible; tap it for every other field. All inputs live in the
  // same <tr>, so sorting, the markup tool, the dirty count and Save all changes work as before.
  const repPills = (p) => (repFor(p).length ? repFor(p).map((r) => `<span class="pill st-shipped" title="Task ${esc(r.task)}">${esc(r.sample || r.product + " " + r.strength)}</span>`).join(" ") : '<span class="pill st-cancelled">No report</span>');
  const fl = (lab, html, wide) => `<label style="display:flex;flex-direction:column;gap:.2rem;min-width:0${wide ? ";grid-column:1/-1" : ""}"><span class="eyebrow">${lab}</span>${html}</label>`;
  const sm = (lab, html) => `<label style="display:flex;flex-direction:column;gap:.1rem;font-size:.7rem;color:var(--muted);text-transform:uppercase;letter-spacing:.05em;font-weight:700">${lab}${html}</label>`;
  const row = (p) => { const open = !p || openP.has(p.id); return `<tr data-id="${p ? p.id : ""}" class="prow${p ? "" : " dirty"}"><td style="padding:.55rem .8rem">
    <div class="psum" style="display:flex;flex-wrap:wrap;align-items:center;gap:.4rem 1rem;cursor:pointer">
      <span style="flex:1 1 14rem;min-width:0"><span class="caret" style="display:inline-block;width:1rem;transition:transform .15s;${open ? "transform:rotate(90deg)" : ""}">▸</span><strong data-pname>${esc(p ? `${p.name} ${p.strength}`.trim() : "New product")}</strong>
        <span class="muted" style="font-size:.8rem" data-pmeta>${esc(p ? [p.manufacturer, p.category].filter(Boolean).join(" · ") : "")}</span>
        ${p && !p.active ? ' <span class="pill st-cancelled" data-poff>hidden</span>' : ""}${p && !repFor(p).length && p.active ? ' <span class="pill st-cancelled" title="No lab report attached">no report</span>' : ""}</span>
      <span style="display:flex;gap:.6rem;flex-wrap:wrap;align-items:flex-end">
        ${sm("Cost $", inp("cost", dollars(p?.cost_cents), "—", ' inputmode="decimal" style="width:5.5rem" title="Our cost per vial (staff never see it on the store)"'))}
        ${sm("Price $", inp("price", dollars(p?.price_cents), "Ask", ' inputmode="decimal" style="width:5.5rem"'))}
        ${sm("Stock", inp("stock", p?.stock ?? "", "∞", ' inputmode="numeric" style="width:4.5rem"'))}</span></div>
    <div class="pdet"${open ? "" : " hidden"} style="margin-top:.7rem;padding:.7rem;border-radius:10px;background:var(--ground,#f6f7f9)">
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,11rem),1fr));gap:.7rem 1rem;align-items:start">
        ${fl("Name", inp("name", p?.name, "Name", ' style="width:100%"'))}${fl("Size", inp("strength", p?.strength, "10 mg", ' style="width:100%"'))}
        ${fl("Category", inp("category", p?.category ?? "Research peptide", "Category", ' list="catlist" style="width:100%"'))}${fl("Manufacturer", inp("manufacturer", p?.manufacturer, "", ' list="mfrlist" style="width:100%"'))}
        ${fl("Store note", inp("storeNote", p?.store_note ?? "", "e.g. Sold out — 2 weeks", ' maxlength="80" style="width:100%" title="Shown on the store under the product (optional)"'))}
        ${fl("Max per order", inp("maxPerOrder", p?.max_per_order ?? "", "—", ' inputmode="numeric" style="width:100%"'))}${fl("Sort order", inp("sort", p?.sort ?? 0, "", ' inputmode="numeric" style="width:100%"'))}
        ${fl("On the store", `<span class="chk"><input type="checkbox" data-k="active"${!p || p.active ? " checked" : ""}${ro()}> Active</span>`)}
        ${fl("Description · line 1 what's in the vial, then one - benefit per line", `<textarea data-k="description" rows="4" placeholder="Line 1: what's in the vial. Then one benefit per line starting with -" style="width:100%;font:inherit;font-size:.85rem;line-height:1.3;resize:vertical"${ro()}>${esc(p?.description || "")}</textarea>`, true)}
        <div data-rep style="grid-column:1/-1">${p ? `<span class="eyebrow">Lab report</span> ${repPills(p)}` : ""}</div></div>
      <div class="row2" style="margin-top:.6rem;flex-wrap:wrap" data-docs>${p ? `<button class="btn" type="button" data-manage="${p.id}" title="COA and documents for this peptide">${p.doc_count ? `${p.doc_count} doc${p.doc_count === 1 ? "" : "s"} · ` : ""}Pictures &amp; documents</button>` : '<span class="muted">Save first to add pictures and documents.</span>'}
        ${isOwner() ? `<button class="btn solid" data-save>Save</button><button class="btn danger" data-del>${p ? "Delete" : "Remove"}</button>` : ""}</div></div>
  </td></tr>`; };
  const cats = [...new Set(list.map((p) => p.category).filter(Boolean))];
  const saveBar = isOwner() ? `<div class="row2" style="align-items:center"><button class="btn solid" data-saveall disabled>Save all changes</button><span class="muted" data-dirtycount></span></div>` : "";
  const savedMk = localStorage.getItem("markup") || "100";
  const PCTS = ["50", "75", "100", "150"];
  const markupBar = isOwner() ? `<div class="panel markup" style="gap:.6rem"><h2>Pricing: markup from cost</h2>
      <div class="row2" style="align-items:center">
        <span class="seg" id="mkSeg">${PCTS.map((m) => `<button type="button" data-mk="${m}"${savedMk === m ? ' class="on"' : ""}>+${m}%</button>`).join("")}<button type="button" data-mk="custom"${!PCTS.includes(savedMk) ? ' class="on"' : ""}>Enter new</button></span>
        <span id="mkCustomWrap"${PCTS.includes(savedMk) ? " hidden" : ""}><input id="mkCustom" inputmode="decimal" value="${PCTS.includes(savedMk) ? "" : esc(savedMk)}" placeholder="e.g. 125" style="width:5.5rem;height:2.4rem;padding:0 .6rem;border:1px solid var(--line-strong);border-radius:8px;font:inherit"> %</span>
        <label class="chk"><input type="checkbox" id="mkRound"${localStorage.getItem("markupRound") === "1" ? " checked" : ""}> Round to whole dollars</label>
        <button class="btn solid" id="mkApply">Set all prices from cost</button><span class="muted" id="mkNote"></span></div>
      <span class="muted">Pick a markup, then Set all prices: price = cost + markup (a $20 cost at +100% is $40). Only products with a cost change; the new prices show in the table until you click Save all changes. Costs come from the cost sheet, the Cost column or Inventory → Receive.</span></div>` : "";
  pane().innerHTML = `<header><h1>Products &amp; prices</h1><div class="row2">${isOwner() ? `<button class="btn" id="descP">Descriptions</button><button class="btn" id="costP">Cost sheet</button><button class="btn" id="impP">Import from file</button><button class="btn" id="addP">Add product</button>${list.length ? `<button class="btn danger" id="clrP">Remove all products</button>` : ""}` : ""}</div></header>
    <div id="descBox"></div><div id="costBox"></div><div id="impBox"></div><div id="manageBox"></div>
    <p class="muted">Tap a product to open all its fields; cost, price and stock edit right on the line. Use Sort by to reorder the list. Cost = what you pay per vial (never shown on the store). Price blank = "Ask for price" (not buyable). Stock blank = not tracked. Max per order blank = no limit. "Sort" sets the order on the store (lower shows first). Untick Active to hide a product. <strong>Description:</strong> the first line is what's in the vial (e.g. "BPC-157 5 mg + TB-500 5 mg in one 10 mg vial") and each line that starts with "-" is a benefit bullet on the store card. A lab report attaches to a product when the peptide name, size and manufacturer match.</p>
    ${(() => { const n = list.filter((p) => p.active && !repFor(p).length).length; return n ? `<p class="muted"><strong>${n} active product${n === 1 ? " has" : "s have"} no lab report.</strong> Tap the No lab report filter to see them.</p>` : ""; })()}
    ${markupBar}
    ${saveBar}
    <datalist id="catlist">${cats.map((c) => `<option value="${esc(c)}">`).join("")}</datalist>
    <datalist id="mfrlist">${[...new Set(list.map((p) => p.manufacturer).filter(Boolean))].map((c) => `<option value="${esc(c)}">`).join("")}</datalist>
    <div class="filters" style="flex-wrap:wrap;gap:.5rem"><input id="pq" type="search" placeholder="Search name, maker or category">
      ${[["all", "All"], ["active", "Active"], ["hidden", "Hidden"], ["noprice", "No price"], ["nocost", "No cost"], ["noreport", "No lab report"]].map(([k, l]) => `<button class="chip${pFilter === k ? " on" : ""}" type="button" data-pf="${k}">${l}</button>`).join("")}</div>
    <div class="row2" style="justify-content:space-between;align-items:center"><p class="muted" id="pSum" style="margin:0"></p><button class="btn" type="button" id="pAll">Expand all</button></div>
    <div class="tblwrap"><table class="tbl ctbl" id="pt" data-noflip><thead><tr><th style="font-weight:600">Sort by ${COLS.filter(([k]) => !["description", "docs"].includes(k)).map(([k, l]) => `<span class="sortable chip" data-sort="${k}" style="cursor:pointer;margin:.15rem .2rem;height:1.8rem;padding:0 .6rem;text-transform:none;letter-spacing:0">${l.replace(" $", "")}<span class="arr"></span></span>`).join("")}</th></tr></thead>
    <tbody id="pb">${list.map(row).join("")}</tbody></table></div>
    ${saveBar}`;
  const pb = document.getElementById("pb");
  const bodyOf = (tr) => { const b = {}; tr.querySelectorAll("[data-k]").forEach((i) => { b[i.dataset.k] = i.type === "checkbox" ? i.checked : i.value; }); return b; };
  pb.querySelectorAll("tr").forEach((tr) => { tr.dataset.orig = JSON.stringify(bodyOf(tr)); });
  const dirtyRows = () => [...pb.querySelectorAll("tr")].filter((tr) => !tr.dataset.id || JSON.stringify(bodyOf(tr)) !== tr.dataset.orig);
  const refresh = () => {
    const d = dirtyRows();
    pb.querySelectorAll("tr").forEach((tr) => tr.classList.toggle("dirty", d.includes(tr)));
    document.querySelectorAll("[data-saveall]").forEach((b) => { b.disabled = !d.length; b.textContent = d.length ? `Save all changes (${d.length})` : "Save all changes"; });
    document.querySelectorAll("[data-dirtycount]").forEach((x) => { x.textContent = d.length ? "Unsaved rows are highlighted." : ""; });
    unsaved = d.length > 0;
  };
  pb.addEventListener("input", refresh); pb.addEventListener("change", refresh);
  pb.addEventListener("input", (e) => { if (!e.target.matches('[data-k="name"], [data-k="strength"]')) return; const tr = e.target.closest("tr"); tr.querySelector("[data-pname]").textContent = `${tr.querySelector('[data-k="name"]').value} ${tr.querySelector('[data-k="strength"]').value}`.trim() || "New product"; });
  const setOpen = (tr, open) => { tr.querySelector(".pdet").hidden = !open; tr.querySelector(".caret").style.transform = open ? "rotate(90deg)" : ""; const id = +tr.dataset.id; if (id) { if (open) openP.add(id); else openP.delete(id); } };
  pb.addEventListener("click", (e) => { const s = e.target.closest(".psum"); if (!s || e.target.closest("a, button, input, select, textarea, label")) return; const tr = s.closest("tr"); setOpen(tr, tr.querySelector(".pdet").hidden); });
  const byId = Object.fromEntries(list.map((p) => [String(p.id), p]));
  const pass = (tr) => { const p = byId[tr.dataset.id]; if (!p) return true; const t = (document.getElementById("pq").value || "").toLowerCase();
    if (t && ![p.name, p.strength, p.manufacturer, p.category].join(" ").toLowerCase().includes(t)) return false;
    return pFilter === "all" || (pFilter === "active" ? p.active : pFilter === "hidden" ? !p.active : pFilter === "noprice" ? p.price_cents == null : pFilter === "nocost" ? p.cost_cents == null : !repFor(p).length); };
  const applyF = () => { let n = 0; pb.querySelectorAll("tr").forEach((tr) => { const ok = pass(tr); tr.hidden = !ok; if (ok) n++; }); document.getElementById("pSum").textContent = `${n} product${n === 1 ? "" : "s"}${n !== list.length ? ` of ${list.length}` : ""} · ${list.filter((p) => p.active).length} active · ${list.filter((p) => p.price_cents == null).length} without a price`; };
  document.getElementById("pq").oninput = applyF;
  pane().querySelectorAll("[data-pf]").forEach((c) => { c.onclick = () => { pFilter = c.dataset.pf; pane().querySelectorAll("[data-pf]").forEach((x) => x.classList.toggle("on", x === c)); applyF(); }; });
  document.getElementById("pAll").onclick = () => { const rows = [...pb.querySelectorAll("tr")].filter((tr) => !tr.hidden), all = rows.some((tr) => tr.querySelector(".pdet").hidden); rows.forEach((tr) => setOpen(tr, all)); document.getElementById("pAll").textContent = all ? "Collapse all" : "Expand all"; };
  applyF();

  // sort rows in place, so unsaved edits are kept
  let sortKey = "", dir = 1;
  pane().querySelector("thead").onclick = (e) => {
    const th = e.target.closest("[data-sort]"); if (!th) return;
    const k = th.dataset.sort; dir = sortKey === k ? -dir : 1; sortKey = k;
    const val = (tr) => { if (k === "report") return tr.querySelector("[data-rep]").textContent.toLowerCase(); if (k === "docs") return parseInt(tr.querySelector("[data-docs]").textContent) || 0; const i = tr.querySelector(`[data-k="${k}"]`); if (i.type === "checkbox") return i.checked ? 1 : 0; const v = i.value.trim(); return NUM.has(k) ? (v === "" ? Infinity : parseFloat(v)) : v.toLowerCase(); };
    const rows = [...pb.querySelectorAll("tr")].sort((a, b) => { const x = val(a), y = val(b); return (x < y ? -1 : x > y ? 1 : 0) * dir; });
    rows.forEach((r) => pb.appendChild(r));
    pane().querySelectorAll("thead .arr").forEach((s) => { s.textContent = ""; });
    th.querySelector(".arr").textContent = dir > 0 ? " ▲" : " ▼";
  };

  const saveRow = async (tr) => {
    const id = tr.dataset.id, body = bodyOf(tr);
    const r = await api(id ? "/products/" + id : "/products", { method: id ? "PATCH" : "POST", body });
    if (!id && r.id) tr.dataset.id = r.id;
    tr.dataset.orig = JSON.stringify(body);
  };
  const saveAll = async () => {
    const d = dirtyRows(); if (!d.length) return;
    let ok = 0, fail = 0;
    for (const tr of d) { try { await saveRow(tr); ok++; } catch (e) { fail++; tr.classList.add("bad"); } }
    refresh(); drawNav();
    toast(fail ? `Saved ${ok}, ${fail} need fixing` : `Saved ${ok} product${ok === 1 ? "" : "s"}`);
    if (!fail) products();
  };
  document.querySelectorAll("[data-saveall]").forEach((b) => (b.onclick = saveAll));
  if (document.getElementById("mkApply")) {
    const seg = document.getElementById("mkSeg"), custom = document.getElementById("mkCustom");
    const picked = () => (seg.querySelector(".on") || {}).dataset?.mk || "100";
    seg.onclick = (e) => { const b = e.target.closest("[data-mk]"); if (!b) return; seg.querySelectorAll("button").forEach((x) => x.classList.toggle("on", x === b)); document.getElementById("mkCustomWrap").hidden = b.dataset.mk !== "custom"; if (b.dataset.mk === "custom") custom.focus(); };
    document.getElementById("mkApply").onclick = () => {
      const sel = { value: picked() };
      const pct = sel.value === "custom" ? parseFloat(custom.value) : parseFloat(sel.value);
      if (!Number.isFinite(pct) || pct < 0) return toast("Enter the markup as a number, like 125");
      const round = document.getElementById("mkRound").checked;
      localStorage.setItem("markup", sel.value === "custom" ? String(pct) : sel.value); localStorage.setItem("markupRound", round ? "1" : "0");
      let set = 0, noCost = 0;
      pb.querySelectorAll("tr").forEach((tr) => {
        const cost = parseFloat(String(tr.querySelector('[data-k="cost"]').value).replace(/[$,]/g, ""));
        if (!Number.isFinite(cost) || cost <= 0) { noCost++; return; }
        const price = cost * (1 + pct / 100);
        tr.querySelector('[data-k="price"]').value = round ? String(Math.round(price)) : price.toFixed(2);
        set++;
      });
      refresh();
      document.getElementById("mkNote").textContent = set ? `${set} price${set === 1 ? "" : "s"} set at +${pct}%${noCost ? ` · ${noCost} without a cost left alone` : ""}. Click Save all changes to keep them.` : "No product has a cost yet. Enter costs in the Cost column first.";
      if (set) toast(`${set} prices set, not saved yet`);
    };
  }
  if (document.getElementById("impP")) document.getElementById("impP").onclick = () => importBox(list);
  if (document.getElementById("descP")) document.getElementById("descP").onclick = () => {
    const box = document.getElementById("descBox");
    box.innerHTML = `<div class="panel" style="border-color:var(--blue)"><div class="row2" style="justify-content:space-between;align-items:center"><h2>Descriptions</h2><button class="btn" type="button" id="descClose">Close</button></div>
      <p class="muted">Line 1 shows under the name on the store: just the peptides and mg in the vial (e.g. "BPC-157 5 mg + TB-500 5 mg"). Every line that starts with "-" is a benefit bullet — keep them short (about 25 characters) so each stays on one line.</p>
      <input id="descQ" type="search" placeholder="Filter products" style="height:2.4rem;padding:0 .8rem;border:1px solid var(--line-strong);border-radius:8px;max-width:18rem">
      <div class="tblwrap" style="max-height:60vh"><table class="tbl compact" id="descT"><thead><tr><th>Product</th><th>Description</th><th>Preview</th></tr></thead><tbody>
      ${list.map((p) => `<tr data-did="${p.id}" data-txt="${esc(`${p.name} ${p.strength} ${p.manufacturer || ""}`.toLowerCase())}"><td class="namecol"><strong>${esc(p.name)}</strong><div class="muted" style="font-size:.78rem">${esc(p.strength)}${p.manufacturer ? " · " + esc(p.manufacturer) : ""}</div></td>
        <td><textarea data-desc rows="5" style="width:100%;min-width:22rem;font:inherit;font-size:.85rem;line-height:1.3;resize:vertical">${esc(p.description || "")}</textarea></td><td data-prev style="min-width:14rem;font-size:.8rem"></td></tr>`).join("")}</tbody></table></div>
      <div class="row2" style="align-items:center"><button class="btn solid" type="button" id="descSave">Save descriptions</button><span class="muted" id="descMsg">Only changed rows are saved.</span></div></div>`;
    const preview = (tr) => { const lines = tr.querySelector("[data-desc]").value.split(/\r?\n/).map((l) => l.trim()).filter(Boolean); const b = lines.filter((l) => /^[-•*]/.test(l)).map((l) => l.replace(/^[-•*]\s*/, "")); const t = lines.filter((l) => !/^[-•*]/.test(l)); tr.querySelector("[data-prev]").innerHTML = `${t.length ? `<div class="muted">${t.map(esc).join("<br>")}</div>` : ""}${b.length ? `<ul style="margin:.25rem 0 0;padding-left:1.1rem">${b.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>` : ""}`; };
    box.querySelectorAll("tr[data-did]").forEach(preview);
    box.addEventListener("input", (e) => { if (e.target.matches("[data-desc]")) preview(e.target.closest("tr")); });
    document.getElementById("descQ").oninput = (e) => { const t = e.target.value.toLowerCase(); box.querySelectorAll("tr[data-did]").forEach((tr) => { tr.hidden = t && !tr.dataset.txt.includes(t); }); };
    document.getElementById("descClose").onclick = () => { box.innerHTML = ""; };
    document.getElementById("descSave").onclick = async () => {
      const items = [...box.querySelectorAll("tr[data-did]")].map((tr) => ({ id: +tr.dataset.did, description: tr.querySelector("[data-desc]").value })).filter((i) => (list.find((p) => p.id === i.id) || {}).description !== i.description);
      if (!items.length) return toast("Nothing changed");
      const r = await api("/products/descriptions", { method: "POST", body: { items } }); toast(`Saved ${r.saved} description${r.saved === 1 ? "" : "s"}`); paneDirty = false; unsaved = false; products();
    };
    box.scrollIntoView({ behavior: "smooth", block: "start" });
  };
  if (document.getElementById("costP")) document.getElementById("costP").onclick = async () => {
    const box = document.getElementById("costBox");
    if (box.innerHTML) { box.innerHTML = ""; return; }
    box.innerHTML = `<div class="panel"><p class="muted">Checking the cost sheet against your products…</p></div>`;
    const d = await api("/costs/sheet");
    const withCost = d.rows.filter((r) => r.costCents !== null);
    const matched = withCost.filter((r) => r.matches.length), unmatched = withCost.filter((r) => !r.matches.length);
    const differ = matched.flatMap((r) => r.matches.filter((m) => !m.same));
    box.innerHTML = `<div class="panel" style="border-color:var(--blue)"><h2>Cost sheet · Internal pricing Q4 2026</h2>
      <p class="muted">${withCost.length} products on the sheet with a cost. <strong>${matched.length}</strong> match a product here by name and size (${matched.reduce((n, r) => n + r.matches.length, 0)} products, counting each manufacturer). <strong>${differ.length}</strong> of those currently have a different or missing cost.${unmatched.length ? ` <strong>${unmatched.length}</strong> rows match nothing — their name or size differs from the product list, so fix the product name (or type the cost by hand) for: ${unmatched.map((r) => esc(`${r.name} ${r.strength} ($${(r.costCents / 100).toFixed(2)})`)).join("; ")}.` : " Every row matches."}</p>
      ${differ.length ? `<div class="tblwrap" style="max-height:20rem"><table class="tbl compact"><tr><th>Product</th><th>Maker</th><th class="num">Cost now</th><th class="num">Sheet cost</th></tr>${matched.flatMap((r) => r.matches.filter((m) => !m.same).map((m) => `<tr><td class="namecol">${esc(m.name)} ${esc(m.strength)}</td><td>${esc(m.manufacturer || "")}</td><td class="num">${m.costCents === null ? "—" : money(m.costCents)}</td><td class="num"><strong>${money(r.costCents)}</strong></td></tr>`)).join("")}</table></div>` : `<p class="muted">All matched products already have the sheet's cost.</p>`}
      ${d.notInSheet.length ? `<p class="muted"><strong>${d.notInSheet.length} product${d.notInSheet.length === 1 ? "" : "s"} not on the sheet:</strong> ${d.notInSheet.map((p) => esc(`${p.name} ${p.strength}${p.manufacturer ? " · " + p.manufacturer : ""}`)).join("; ")}.</p>` : `<p class="muted">Every product is on the sheet.</p>`}
      <div class="row2" style="align-items:center"><button class="btn solid" id="costApply"${differ.length ? "" : " disabled"}>Set ${differ.length} cost${differ.length === 1 ? "" : "s"} from the sheet</button>
        ${unmatched.length ? `<button class="btn" id="costAdd">Add the ${unmatched.length} missing product${unmatched.length === 1 ? "" : "s"}</button>` : ""}
        ${d.notInSheet.length ? `<button class="btn danger" id="costPrune">Remove the ${d.notInSheet.length} not on the sheet</button>` : ""}
        <button class="btn" id="costDesc" title="Every product with a blank description gets the standard research description for its peptide">Fill blank descriptions</button>
        <button class="btn" id="costClose">Close</button></div>
      <p class="muted" style="margin:0">"Add" creates each missing row with its cost, its description and a price at cost +100% (the sheet's own column) — change it with the markup buttons. "Remove" deletes the products the sheet doesn't list; past orders keep their copies. "Fill blank descriptions" writes the standard description for any product that has none (edit any of them in the Description column).</p></div>`;
    document.getElementById("costClose").onclick = () => { box.innerHTML = ""; };
    document.getElementById("costDesc").onclick = async () => { const r = await api("/costs/descriptions", { method: "POST" }); toast(r.filled.length ? `Filled ${r.filled.length} description${r.filled.length === 1 ? "" : "s"}` : r.missing.length ? `Nothing filled — no text on file for: ${r.missing.slice(0, 3).join("; ")}${r.missing.length > 3 ? "…" : ""}` : "Every product already has a description"); unsaved = false; products(); };
    if (document.getElementById("costAdd")) document.getElementById("costAdd").onclick = async () => { const r = await api("/costs/add-missing", { method: "POST" }); toast(`Added ${r.added.length} product${r.added.length === 1 ? "" : "s"}`); unsaved = false; products(); };
    if (document.getElementById("costPrune")) document.getElementById("costPrune").onclick = async () => {
      const names = d.notInSheet.map((p) => `${p.name} ${p.strength}${p.manufacturer ? " · " + p.manufacturer : ""}`).join("\n");
      if (!confirm(`Remove these ${d.notInSheet.length} products so the list matches the sheet?\n\n${names}\n\nPast orders keep their line items.`)) return;
      const r = await api("/costs/prune", { method: "POST", body: { confirm: "REMOVE" } }); toast(`Removed ${r.removed.length}`); unsaved = false; products();
    };
    document.getElementById("costApply").onclick = async () => {
      const r = await api("/costs/apply", { method: "POST", body: { overwrite: true } });
      toast(`${r.updated} cost${r.updated === 1 ? "" : "s"} updated`); unsaved = false; products();
    };
  };
  if (document.getElementById("addP")) document.getElementById("addP").onclick = () => { pb.insertAdjacentHTML("afterbegin", row(null)); refresh(); pb.querySelector('tr [data-k="name"]').focus(); };
  if (document.getElementById("clrP")) document.getElementById("clrP").onclick = async () => {
    const typed = prompt(`This removes all ${list.length} products, their prices and their documents from the store. Past orders keep their own copy of what was bought. Lab reports are not touched.\n\nType DELETE to confirm.`);
    if (typed === null) return;
    if (typed.trim() !== "DELETE") return toast("Not removed. Type DELETE exactly.");
    unsaved = false;
    const r = await api("/products/clear", { method: "POST", body: { confirm: "DELETE" } });
    toast(`Removed ${r.removed} products`); products(); drawNav();
  };
  pb.onclick = async (e) => {
    const mg = e.target.closest("[data-manage]");
    if (mg) { const p = list.find((x) => String(x.id) === mg.dataset.manage); if (p) manageProduct(p, repFor(p)); return; }
    const tr = e.target.closest("tr"); if (!tr) return;
    const id = tr.dataset.id;
    if (e.target.closest("[data-del]")) {
      if (!id) { tr.remove(); return refresh(); }
      if (!confirm("Delete this product? Past orders keep their line items.")) return;
      await api("/products/" + id, { method: "DELETE" }); toast("Deleted"); tr.remove(); return refresh();
    }
    if (!e.target.closest("[data-save]")) return;
    const isNew = !tr.dataset.id;
    await saveRow(tr); tr.classList.remove("bad"); refresh(); toast(isNew ? "Saved. Add a picture or logo below." : "Saved"); drawNav();
    if (isNew) { openManageId = +tr.dataset.id; unsaved = false; products(); }
  };
  refresh();
  if (openManageId) { const p = list.find((x) => x.id === openManageId); openManageId = null; if (p) manageProduct(p, repFor(p)); }
}


/* ---------- inventory ---------- */
let invFilter = "all";
let invTab = "stock"; // stock | count | counts | log
let openCountId = null; // a reconciliation to open when the Reconciliations tab draws
const INV_TABS = [["stock", "Stock"], ["count", "Count sheet"], ["counts", "Reconciliations"], ["log", "Activity log"]];
const invTabs = () => `<div class="seg" style="margin-bottom:1rem">${INV_TABS.map(([k, l]) => `<button type="button" data-invtab="${k}"${invTab === k ? ' class="on"' : ""}>${l}</button>`).join("")}</div>`;
const daysAgo = (iso) => Math.floor((Date.now() - new Date(iso)) / 864e5);
const agoText = (iso) => { const d = daysAgo(iso); return d <= 0 ? "today" : d === 1 ? "yesterday" : `${d} days ago`; };
const countDue = (lastAt, dueDays) => !lastAt || daysAgo(lastAt) >= (dueDays || 7);
const signedMoney = (c) => (c === null || c === undefined ? "" : (c < 0 ? "−" : c > 0 ? "+" : "") + money(Math.abs(c)));
const refCell = (m) => !m.ref ? "" : m.reason.startsWith("Order") ? `<a href="#" data-orderq="${esc(m.ref)}">${esc(m.ref)}</a>` : m.count_id ? `<a href="#" data-cntopen="${m.count_id}">${esc(m.ref)}</a>` : esc(m.ref);
let invSort = (() => { try { return localStorage.getItem("invSort") || "name"; } catch (e) { return "name"; } })();
async function inventory() {
  if (invTab === "count") return invCountSheet();
  if (invTab === "counts") return invCounts();
  if (invTab === "log") return invLog();
  const { items } = await api("/inventory");
  const own = isOwner();
  const label = (p) => `${p.name} ${p.strength}`.trim();
  const sub = (p) => [p.manufacturer, p.active ? "" : "hidden"].filter(Boolean).join(" · ");
  const soon = (d) => d && (new Date(d) - Date.now()) / 864e5 <= 60;
  const status = (p) => p.stock === null ? "untracked" : p.stock <= 0 ? "out" : p.stock <= (p.reorder_point ?? 5) ? "low" : "ok";
  const pillFor = { ok: '<span class="pill st-shipped">In stock</span>', low: '<span class="pill st-new">Low</span>', out: '<span class="pill st-cancelled">Out</span>', untracked: '<span class="pill">Not tracked</span>' };
  const tracked = items.filter((p) => p.stock !== null);
  const value = tracked.reduce((t, p) => t + (p.cost_cents ? p.cost_cents * Math.max(0, p.stock + p.committed) : 0), 0);
  const counts = { low: items.filter((p) => status(p) === "low").length, out: items.filter((p) => status(p) === "out").length, untracked: items.filter((p) => p.stock === null).length, expiring: items.filter((p) => soon(p.next_expiry)).length };
  const weeksLeft = (p) => (p.stock > 0 && p.sold_30d > 0 ? Math.round((p.stock / p.sold_30d) * 30 / 7) : null);
  const lastAt = stats && stats.count ? stats.count.lastAt : null, dueDays = stats && stats.count ? stats.count.dueDays : 7;
  pane().innerHTML = `<header><h1>Inventory</h1><div class="row2"><button class="btn solid" id="rcvBtn">Receive shipment</button><button class="btn" id="qtyUp" type="button">Upload quantities</button><a class="btn" href="/api/admin/inventory.csv" style="display:inline-grid;place-items:center;text-decoration:none">Export CSV</a></div></header>
    ${invTabs()}<div id="qtyBox"></div>
    ${countDue(lastAt, dueDays) ? `<div class="panel" style="border-color:var(--blue)"><strong>Weekly count is due.</strong><span class="muted">${lastAt ? `Last count ${when(lastAt)}, ${agoText(lastAt)}.` : "No physical count has been posted yet — do the first one to set what's on the shelf."}</span><div><button class="btn solid" type="button" data-invtab="count">Open count sheet</button></div></div>` : ""}
    <dl class="kpis">
      <div class="kpi"><dt>Products tracked</dt><dd>${tracked.length}</dd></div>
      <div class="kpi"><dt>Units on shelf</dt><dd>${tracked.reduce((t, p) => t + Math.max(0, p.stock + p.committed), 0)}</dd></div>
      ${own ? `<div class="kpi"><dt>On-shelf value at cost</dt><dd>${money(value)}</dd></div>` : ""}
      <div class="kpi" data-invtab="counts"><dt>Last count</dt><dd style="font-size:1rem">${lastAt ? `${agoText(lastAt)}` : "never"}</dd></div>
      <div class="kpi" data-invf="low"><dt>Low stock</dt><dd>${counts.low}</dd></div>
      <div class="kpi" data-invf="out"><dt>Out of stock</dt><dd>${counts.out}</dd></div>
      <div class="kpi" data-invf="expiring"><dt>Lots expiring ≤ 60 days</dt><dd>${counts.expiring}</dd></div>
    </dl>
    ${(() => { const need = items.filter((p) => status(p) === "low" || status(p) === "out").sort((a, b) => a.stock - b.stock); const sug = (p) => Math.max(0, Math.max((p.reorder_point ?? 5) * 2, p.sold_30d || 0) - p.stock);
      return `<div class="panel" id="needPanel"><div class="row2" style="justify-content:space-between;align-items:center"><h2 style="margin:0">Need to order${need.length ? ` · ${need.length}` : ""}</h2><a class="btn" href="/api/admin/inventory/reorder.csv" download>Download list (CSV)</a></div>
      ${need.length ? `<p class="muted">Products at or under their reorder point. Suggested order brings each back to twice its reorder point, or last month's sales if higher. Negative Available = backordered (sold but not on the shelf).</p>
      <div class="tblwrap"><table class="tbl compact"><thead><tr><th>Product</th><th class="num">Available</th><th class="num">Reorder at</th><th class="num">Sold 30 d</th><th class="num">Suggested order</th>${own ? '<th class="num">Est. cost</th>' : ""}</tr></thead><tbody>
      ${need.map((p) => `<tr><td>${esc(label(p))}<div class="muted" style="font-size:.75rem">${esc(sub(p))}</div></td><td class="num">${p.stock <= 0 ? `<span class="pill st-cancelled">${p.stock}</span>` : p.stock}</td><td class="num">${p.reorder_point ?? 5}</td><td class="num">${p.sold_30d || 0}</td><td class="num"><strong>${sug(p)}</strong></td>${own ? `<td class="num">${p.cost_cents ? money(p.cost_cents * sug(p)) : "—"}</td>` : ""}</tr>`).join("")}</tbody></table></div>` : `<p class="muted">Nothing to order — every tracked product is above its reorder point.</p>`}</div>`; })()}
    <div id="invPanel"></div>
    <div class="filters"><input id="invQ" type="search" placeholder="Search name, maker or code">
      ${[["all", "All"], ["low", "Low"], ["out", "Out"], ["expiring", "Expiring"], ["untracked", "Not tracked"]].map(([k, l]) => `<button class="chip${invFilter === k ? " on" : ""}" type="button" data-invf="${k}">${l}${counts[k] ? ` (${counts[k]})` : ""}</button>`).join("")}</div>
    <p class="muted">Available is what customers can still buy. Stock comes off when an order is placed and goes back if it's cancelled; "In orders" is stock held by orders not yet shipped, so On shelf = Available + In orders. Value = on shelf × cost each. Every change is kept in each product's History and in the Activity log; the weekly count goes on the Count sheet.</p>
    <div class="row2" style="justify-content:space-between;align-items:center;flex-wrap:wrap;gap:.5rem"><p class="muted" id="invSum" style="margin:0"></p><div class="row2" style="gap:.5rem"><select id="invSort">${[["name", "Name A–Z"], ["avail", "Available, lowest first"], ["sold", "Sold 30 days"], ["weeks", "Weeks left, fewest first"], ...(own ? [["value", "Value"]] : []), ["expiry", "Next expiry"]].map(([k, l]) => `<option value="${k}"${invSort === k ? " selected" : ""}>Sort: ${l}</option>`).join("")}</select><button class="btn" type="button" id="invAll">Expand all</button></div></div>
    <div class="tblwrap"><table class="tbl ctbl" id="invT"><thead><tr><th>Product</th><th class="num">Available</th><th class="num">On shelf</th><th class="num">Sold 30d</th><th>Status</th></tr></thead><tbody id="invB"></tbody></table></div>`;
  const openInv = new Set(); let shownInv = [];
  const ISORT = { name: (p) => label(p).toLowerCase(), avail: (p) => (p.stock === null ? 1e9 : p.stock), sold: (p) => -(p.sold_30d || 0), weeks: (p) => (weeksLeft(p) === null ? 1e9 : weeksLeft(p)), value: (p) => -((p.cost_cents || 0) * Math.max(0, (p.stock || 0) + (p.committed || 0))), expiry: (p) => p.next_expiry || "9999" };
  const draw = () => {
    const term = (document.getElementById("invQ").value || "").toLowerCase();
    const list = items.filter((p) => (invFilter === "all" || (invFilter === "expiring" ? soon(p.next_expiry) : status(p) === invFilter))
      && (!term || [p.name, p.strength, p.manufacturer].join(" ").toLowerCase().includes(term)));
    const key = ISORT[invSort] || ISORT.name; list.sort((a, b) => { const x = key(a), y = key(b); return x < y ? -1 : x > y ? 1 : 0; }); shownInv = list;
    document.getElementById("invSum").textContent = `${list.length} product${list.length === 1 ? "" : "s"}${list.length !== items.length ? ` of ${items.length}` : ""} · ${list.reduce((t, p) => t + Math.max(0, (p.stock || 0) + (p.committed || 0)), 0)} units on shelf${own ? ` · ${money(list.reduce((t, p) => t + (p.cost_cents && p.stock !== null ? p.cost_cents * Math.max(0, p.stock + p.committed) : 0), 0))} at cost` : ""}`;
    const det = (lab, html) => `<div><div class="eyebrow" style="margin-bottom:.2rem">${lab}</div>${html}</div>`;
    document.getElementById("invB").innerHTML = list.length ? list.map((p) => { const open = openInv.has(p.id); return `<tr class="csum click" data-iid="${p.id}" aria-expanded="${open}">
      <td title="${esc(label(p))}"><span class="caret" style="display:inline-block;width:1rem;transition:transform .15s;${open ? "transform:rotate(90deg)" : ""}">▸</span><strong>${esc(label(p))}</strong>${sub(p) ? `<div class="muted" style="font-size:.78rem;margin-left:1rem">${esc(sub(p))}</div>` : ""}</td>
      <td class="num"><strong>${p.stock ?? "—"}</strong>${p.stock < 0 ? '<div class="muted" style="font-size:.72rem" title="Open orders need more than what\'s on the shelf">short for orders</div>' : ""}</td><td class="num">${p.stock === null ? "" : p.stock + p.committed}</td>
      <td class="num">${p.sold_30d || ""}${weeksLeft(p) !== null ? `<div class="muted" style="font-size:.72rem">~${weeksLeft(p)} wk left</div>` : ""}</td><td>${pillFor[status(p)]}</td></tr>
      <tr class="cdet" data-iid="${p.id}"${open ? "" : " hidden"}><td colspan="5" style="background:var(--ground,#f6f7f9)">
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,10rem),1fr));gap:.8rem 1.2rem;padding:.4rem .2rem;align-items:start">
          ${det("In orders", p.committed || 0)}${det("Reorder at", own ? `<input data-reorder value="${p.reorder_point ?? ""}" placeholder="5" inputmode="numeric" style="width:100%">` : (p.reorder_point ?? 5))}
          ${own ? det("Cost each", `<input data-cost value="${dollars(p.cost_cents)}" placeholder="—" inputmode="decimal" style="width:100%">`) + det("Value on shelf", p.cost_cents !== null && p.stock !== null ? money(p.cost_cents * Math.max(0, p.stock + p.committed)) : "—") : ""}
          ${det("Next expiry", p.next_expiry ? `<span${soon(p.next_expiry) ? ' class="pill st-new"' : ""}>${esc(String(p.next_expiry).slice(0, 10))}</span>` : "—")}</div>
        <div class="acts row2" style="margin-top:.6rem"><button class="btn" data-act="receive">Receive</button>${p.stock === null ? (own ? '<button class="btn" data-act="track">Track</button>' : "") : '<button class="btn" data-act="adjust">Adjust</button>'}<button class="btn" data-act="history">History</button></div></td></tr>`; }).join("")
      : `<tr><td colspan="5" class="muted">Nothing here.</td></tr>`;
  };
  document.getElementById("invSort").onchange = (e) => { invSort = e.target.value; try { localStorage.setItem("invSort", invSort); } catch (er) {} draw(); };
  document.getElementById("invAll").onclick = () => { const all = openInv.size < shownInv.length; openInv.clear(); if (all) shownInv.forEach((p) => openInv.add(p.id)); document.getElementById("invAll").textContent = all ? "Collapse all" : "Expand all"; draw(); };
  document.getElementById("invB").addEventListener("click", (e) => { const t = e.target.closest("tr.csum"); if (!t || e.target.closest("a, button, input, select")) return; const id = +t.dataset.iid, d = t.nextElementSibling, open = d.hidden; d.hidden = !open; t.setAttribute("aria-expanded", open); t.querySelector(".caret").style.transform = open ? "rotate(90deg)" : ""; if (open) openInv.add(id); else openInv.delete(id); });
  draw();
  const panel = document.getElementById("invPanel");
  const fld = (id, label, attrs = "") => `<div class="field"><label class="eyebrow" for="${id}">${label}</label><input id="${id}" ${attrs}></div>`;
  const receiveForm = (only) => {
    const rows = only ? [only] : items.filter((p) => p.active);
    panel.innerHTML = `<div class="panel" style="border-color:var(--blue)"><div class="row2" style="justify-content:space-between;align-items:center"><h2>${only ? `Receive ${esc(label(only))}` : "Receive shipment"}</h2><button class="btn" type="button" data-pclose>Close</button></div>
      <div class="grid2">${fld("rvSup", "Supplier")}${fld("rvRef", "Invoice / PO #")}${fld("rvNote", "Note")}</div>
      ${only ? "" : `<input id="rvQ" type="search" placeholder="Filter products" style="height:2.4rem;padding:0 .8rem;border:1px solid var(--line-strong);border-radius:8px;max-width:20rem">`}
      <div class="tblwrap" style="max-height:26rem;overflow:auto"><table class="tbl compact" id="rvT"><tr><th>Product</th><th class="num">Now</th><th>Qty received</th><th>Cost each $</th><th>Lot / batch</th><th>Expires</th></tr>
      ${rows.map((p) => `<tr data-rid="${p.id}" data-txt="${esc([p.name, p.strength, p.manufacturer].join(" ").toLowerCase())}"><td class="namecol"><strong>${esc(label(p))}</strong><div class="muted" style="font-size:.78rem">${esc(sub(p))}</div></td><td class="num">${p.stock ?? "—"}</td>
        <td><input data-f="qty" inputmode="numeric" style="width:5rem"></td><td><input data-f="costEach" inputmode="decimal" style="width:6rem" placeholder="${p.cost_cents !== null ? dollars(p.cost_cents) : ""}"></td>
        <td><input data-f="lot" style="width:9rem"></td><td><input data-f="expires" type="date" style="width:9.5rem"></td></tr>`).join("")}</table></div>
      <div class="row2"><button class="btn solid" type="button" id="rvGo">Add to stock</button><span class="muted">Only rows with a quantity are received. Cost updates the average cost per unit.</span></div></div>`;
    if (!only) document.getElementById("rvQ").oninput = (e) => { const t = e.target.value.toLowerCase(); document.querySelectorAll("#rvT tr[data-rid]").forEach((tr) => { tr.hidden = t && !tr.dataset.txt.includes(t); }); };
    document.getElementById("rvGo").onclick = async () => {
      const lines = [...document.querySelectorAll("#rvT tr[data-rid]")].map((tr) => { const l = { productId: +tr.dataset.rid }; tr.querySelectorAll("[data-f]").forEach((i) => { l[i.dataset.f] = i.value.trim(); }); return l; }).filter((l) => +l.qty > 0);
      if (!lines.length) return toast("Enter a quantity on at least one row");
      const r = await api("/inventory/receive", { method: "POST", body: { supplier: document.getElementById("rvSup").value, ref: document.getElementById("rvRef").value, note: document.getElementById("rvNote").value, lines } });
      toast(`Received ${r.lines} product${r.lines === 1 ? "" : "s"}`); inventory(); drawNav();
    };
    panel.scrollIntoView({ behavior: "smooth", block: "start" });
  };
  const adjustForm = (p) => {
    panel.innerHTML = `<div class="panel" style="border-color:var(--blue)"><div class="row2" style="justify-content:space-between;align-items:center"><h2>Adjust ${esc(label(p))}</h2><button class="btn" type="button" data-pclose>Close</button></div>
      <p class="muted">Available now: <strong>${p.stock}</strong>${p.committed ? ` (plus ${p.committed} held in unshipped orders)` : ""}</p>
      <div class="row2"><label class="chk"><input type="radio" name="adjM" value="set" checked> Set the count to</label><label class="chk"><input type="radio" name="adjM" value="add"> Add or remove (use − to remove)</label></div>
      <div class="grid2">${fld("adjQ", "Quantity", 'inputmode="numeric"')}
        <div class="field"><label class="eyebrow" for="adjR">Reason</label><select id="adjR">${["Count correction", "Damaged", "Expired", "Lost", "Sample / testing", "Returned by customer", "Other"].map((r) => `<option>${r}</option>`).join("")}</select></div>
        ${fld("adjN", "Note")}</div>
      <div><button class="btn solid" type="button" id="adjGo">Save adjustment</button></div></div>`;
    document.getElementById("adjGo").onclick = async () => {
      const mode = document.querySelector("[name=adjM]:checked").value, qty = document.getElementById("adjQ").value.trim();
      if (!/^-?\d+$/.test(qty)) return toast("Enter a whole number");
      const r = await api(`/inventory/${p.id}/adjust`, { method: "POST", body: { mode, qty: +qty, reason: document.getElementById("adjR").value, note: document.getElementById("adjN").value } });
      toast(`Now ${r.stock} available`); inventory(); drawNav();
    };
    panel.scrollIntoView({ behavior: "smooth", block: "start" });
  };
  const historyView = async (p) => {
    const { moves } = await api(`/inventory/${p.id}/moves`);
    panel.innerHTML = `<div class="panel"><div class="row2" style="justify-content:space-between;align-items:center"><h2>History: ${esc(label(p))}</h2><button class="btn" type="button" data-pclose>Close</button></div>
      ${moves.length ? `<div class="tblwrap" style="max-height:26rem;overflow:auto"><table class="tbl"><tr><th>When</th><th>What</th><th class="num">Change</th><th class="num">Balance</th><th>Lot</th><th>Expires</th>${own ? '<th class="num">Cost each</th>' : ""}<th>Ref</th><th>By</th><th>Note</th></tr>
      ${moves.map((m) => `<tr><td>${when(m.at)}</td><td>${esc(m.reason)}${m.supplier ? `<div class="muted" style="font-size:.75rem">${esc(m.supplier)}</div>` : ""}</td><td class="num" style="color:${m.change > 0 ? "var(--pass)" : m.change < 0 ? "#9b1c1c" : "inherit"}">${m.change > 0 ? "+" : ""}${m.change}</td><td class="num">${m.balance ?? ""}</td>
        <td class="mono">${esc(m.lot)}</td><td>${m.expires ? esc(String(m.expires).slice(0, 10)) : ""}</td>${own ? `<td class="num">${m.cost_cents !== null ? money(m.cost_cents) : ""}</td>` : ""}<td class="mono">${refCell(m)}</td><td>${esc(m.who)}</td><td>${esc(m.note)}</td></tr>`).join("")}</table></div>`
      : `<p class="muted">No stock changes recorded yet.</p>`}</div>`;
    panel.querySelectorAll("[data-orderq]").forEach((a) => (a.onclick = (e) => { e.preventDefault(); oFilter = { status: "", q: a.dataset.orderq }; go("orders"); }));
    panel.scrollIntoView({ behavior: "smooth", block: "start" });
  };
  document.getElementById("rcvBtn").onclick = () => receiveForm(null);
  document.getElementById("qtyUp").onclick = () => qtyUploadBox(items);
  document.getElementById("invQ").oninput = draw;
  pane().onclick = async (e) => {
    const f = e.target.closest("[data-invf]");
    if (f) { invFilter = invFilter === f.dataset.invf && f.classList.contains("kpi") ? "all" : f.dataset.invf; pane().querySelectorAll("[data-invf].chip").forEach((c) => c.classList.toggle("on", c.dataset.invf === invFilter)); draw(); return; }
    if (e.target.closest("[data-pclose]")) { panel.innerHTML = ""; return; }
    const a = e.target.closest("[data-act]"); if (!a) return;
    const p = items.find((x) => String(x.id) === a.closest("tr").dataset.iid);
    if (a.dataset.act === "receive") receiveForm(p);
    else if (a.dataset.act === "adjust") adjustForm(p);
    else if (a.dataset.act === "history") historyView(p);
    else if (a.dataset.act === "track") { const n = prompt(`Start tracking ${label(p)}. How many are on hand now?`, "0"); if (n === null) return; if (!/^\d+$/.test(n.trim())) return toast("Enter a whole number"); await api(`/inventory/${p.id}`, { method: "PATCH", body: { track: true, startAt: +n } }); toast("Tracking started"); inventory(); }
  };
  if (own) document.getElementById("invB").addEventListener("change", async (e) => {
    const tr = e.target.closest("tr[data-iid]"); if (!tr) return;
    if (e.target.matches("[data-reorder]")) { await api(`/inventory/${tr.dataset.iid}`, { method: "PATCH", body: { reorderPoint: e.target.value.trim() } }); toast("Reorder point saved"); }
    if (e.target.matches("[data-cost]")) { await api(`/inventory/${tr.dataset.iid}`, { method: "PATCH", body: { costEach: e.target.value.trim() } }); toast("Cost saved"); }
    const p = items.find((x) => String(x.id) === tr.dataset.iid);
    if (e.target.matches("[data-reorder]")) p.reorder_point = e.target.value.trim() === "" ? null : +e.target.value;
    if (e.target.matches("[data-cost]")) p.cost_cents = e.target.value.trim() === "" ? null : Math.round(parseFloat(e.target.value) * 100);
  });
}

/* ---------- inventory: the weekly count sheet, reconciliations and the activity log ---------- */
async function invCountSheet() {
  const { items, lastCount, dueDays, showCost } = await api("/inventory/count-sheet");
  const label = (p) => `${p.name} ${p.strength}`.trim();
  const lastAt = lastCount ? lastCount.at : null;
  pane().innerHTML = `<header><h1>Inventory</h1></header>${invTabs()}
    <div class="panel" style="border-color:var(--blue)">
      <h2>Count sheet</h2>
      <p class="muted">Count what's physically on the shelf and type it in; leave a row blank to skip it. <strong>On shelf</strong> is what the system expects (available + units held in unshipped orders). Posting corrects every product to what you counted, logs each difference, and files the count under Reconciliations. Do this weekly.
        ${lastAt ? ` Last count ${when(lastAt)} (${agoText(lastAt)}) by ${esc(lastCount.who)}: ${lastCount.lines} products, ${lastCount.varied} difference${lastCount.varied === 1 ? "" : "s"}.` : " No count has been posted yet, so this first one sets the on-shelf amounts."}
        ${countDue(lastAt, dueDays) ? " <strong>A count is due.</strong>" : ""}</p>
      <div class="row2" style="align-items:center"><input id="csQ" type="search" placeholder="Filter products" style="height:2.4rem;padding:0 .8rem;border:1px solid var(--line-strong);border-radius:8px;max-width:18rem"><button class="btn" type="button" id="csFill" title="Puts the expected on-shelf number in every blank row so you only change what's different">Prefill with on shelf</button><button class="btn" type="button" id="csClear">Clear</button><span class="muted" id="csSum"></span></div>
      <div class="tblwrap" style="max-height:62vh"><table class="tbl compact" id="csT"><thead><tr><th>Product</th><th class="num">Available</th><th class="num">In orders</th><th class="num">On shelf</th><th>Counted</th><th class="num">Difference</th>${showCost ? '<th class="num">Cost each</th><th class="num">Difference at cost</th>' : ""}<th>Last counted</th></tr></thead><tbody>
      ${items.map((p) => `<tr data-cid="${p.id}" data-exp="${p.on_shelf ?? ""}" data-cost="${p.cost_cents ?? ""}" data-txt="${esc([p.name, p.strength, p.manufacturer].join(" ").toLowerCase())}">
        <td class="namecol" title="${esc(label(p))}"><strong>${esc(label(p))}</strong>${p.manufacturer || !p.active ? `<div class="muted" style="font-size:.78rem">${esc([p.manufacturer, p.active ? "" : "hidden on store"].filter(Boolean).join(" · "))}</div>` : ""}</td>
        <td class="num">${p.stock ?? '<span class="muted">not tracked</span>'}${p.stock < 0 ? '<div class="muted" style="font-size:.72rem">short for orders</div>' : ""}</td><td class="num">${p.committed || ""}</td><td class="num"><strong>${p.on_shelf ?? "—"}</strong></td>
        <td><input data-counted inputmode="numeric" autocomplete="off" style="width:5.5rem;text-align:right" aria-label="Counted: ${esc(label(p))}"></td><td class="num" data-diff></td>
        ${showCost ? `<td class="num">${money(p.cost_cents)}</td><td class="num" data-diffval></td>` : ""}<td class="muted" style="font-size:.8rem;white-space:nowrap">${p.last_counted ? when(p.last_counted) : "never"}</td></tr>`).join("")}</tbody></table></div>
      <div class="grid2" style="margin-top:1rem"><div class="field"><label class="eyebrow" for="csNote">Note (optional)</label><input id="csNote" placeholder="e.g. weekly count"></div></div>
      <div class="row2" style="align-items:center"><button class="btn solid" type="button" id="csPost">Post count</button><span class="muted">Only rows with a number are counted. Blank rows are left as they are.</span></div>
    </div>`;
  const rows = () => [...document.querySelectorAll("#csT tr[data-cid]")];
  const lineOf = (tr) => { const v = tr.querySelector("[data-counted]").value.trim(); if (!/^\d+$/.test(v)) return null; const counted = +v, exp = tr.dataset.exp === "" ? null : +tr.dataset.exp, cost = tr.dataset.cost === "" ? null : +tr.dataset.cost; const diff = exp === null ? null : counted - exp; return { id: +tr.dataset.cid, counted, exp, diff, val: diff !== null && cost !== null ? diff * cost : null }; };
  const paint = () => {
    let n = 0, varied = 0, over = 0, short = 0, val = 0;
    rows().forEach((tr) => {
      const l = lineOf(tr), d = tr.querySelector("[data-diff]"), dv = tr.querySelector("[data-diffval]");
      tr.classList.toggle("dirty", !!l && !!l.diff);
      if (!l) { d.textContent = ""; if (dv) dv.textContent = ""; return; }
      n++;
      if (l.diff === null) { d.innerHTML = '<span class="muted">sets on shelf</span>'; if (dv) dv.textContent = ""; return; }
      d.innerHTML = l.diff === 0 ? '<span class="muted">0</span>' : `<strong style="color:${l.diff > 0 ? "var(--pass)" : "#9b1c1c"}">${l.diff > 0 ? "+" : "−"}${Math.abs(l.diff)}</strong>`;
      if (dv) dv.textContent = l.val === null || !l.diff ? "" : signedMoney(l.val);
      if (l.diff) { varied++; if (l.diff > 0) over += l.diff; else short -= l.diff; val += l.val || 0; }
    });
    document.getElementById("csSum").textContent = n ? `${n} of ${rows().length} counted · ${varied} difference${varied === 1 ? "" : "s"}${varied ? ` (+${over} / −${short} units${showCost ? `, ${signedMoney(val)} at cost` : ""})` : ""}` : `${rows().length} products on the sheet`;
  };
  paint();
  const tbl = document.getElementById("csT");
  tbl.addEventListener("input", (e) => { if (e.target.matches("[data-counted]")) paint(); });
  tbl.addEventListener("keydown", (e) => { // Enter moves down the sheet like a spreadsheet
    if (e.key !== "Enter" || !e.target.matches("[data-counted]")) return;
    e.preventDefault();
    const inputs = rows().filter((tr) => !tr.hidden).map((tr) => tr.querySelector("[data-counted]")); const i = inputs.indexOf(e.target);
    if (i >= 0 && inputs[i + 1]) { inputs[i + 1].focus(); inputs[i + 1].select(); }
  });
  document.getElementById("csQ").oninput = (e) => { const t = e.target.value.toLowerCase(); rows().forEach((tr) => { tr.hidden = t && !tr.dataset.txt.includes(t); }); };
  document.getElementById("csFill").onclick = () => { rows().forEach((tr) => { const i = tr.querySelector("[data-counted]"); if (!i.value.trim() && tr.dataset.exp !== "") i.value = tr.dataset.exp; }); paneDirty = true; paint(); };
  document.getElementById("csClear").onclick = () => { if (rows().some((tr) => tr.querySelector("[data-counted]").value.trim()) && !confirm("Clear everything you typed on the sheet?")) return; rows().forEach((tr) => { tr.querySelector("[data-counted]").value = ""; }); paint(); };
  document.getElementById("csPost").onclick = async () => {
    const bad = rows().find((tr) => { const v = tr.querySelector("[data-counted]").value.trim(); return v && !/^\d+$/.test(v); });
    if (bad) { bad.querySelector("[data-counted]").focus(); return toast("Counts must be whole numbers (0 or more)"); }
    const lines = rows().map(lineOf).filter(Boolean);
    if (!lines.length) return toast("Type a count for at least one product");
    const varied = lines.filter((l) => l.diff).length, opening = lines.filter((l) => l.diff === null).length;
    if (!confirm(`Post this count? ${lines.length} product${lines.length === 1 ? "" : "s"} counted, ${varied} difference${varied === 1 ? "" : "s"}${opening ? `, ${opening} newly tracked` : ""}. Stock will be corrected to match what you counted.`)) return;
    const r = await api("/inventory/counts", { method: "POST", body: { note: document.getElementById("csNote").value, lines: lines.map((l) => ({ productId: l.id, counted: l.counted })) } });
    toast(`Count #${r.id} posted: ${r.varied} difference${r.varied === 1 ? "" : "s"}`);
    paneDirty = false; invTab = "counts"; openCountId = r.id; go("inventory", null, { silent: true }); drawNav();
  };
}

async function invCounts() {
  const { counts, showCost, dueDays } = await api("/inventory/counts");
  const lastAt = counts[0] ? counts[0].at : null;
  pane().innerHTML = `<header><h1>Inventory</h1></header>${invTabs()}
    <p class="muted">Every posted count sheet is a reconciliation: what the system expected on the shelf, what was counted, and the difference${showCost ? " with its value at cost" : ""}. ${lastAt ? `Last count ${when(lastAt)} (${agoText(lastAt)}).` : "No count posted yet."}${countDue(lastAt, dueDays) ? ' <strong>A weekly count is due.</strong>' : ""} <button class="btn" type="button" data-invtab="count" style="margin-left:.5rem">Open count sheet</button></p>
    <div id="cntDetail"></div>
    ${counts.length ? `<div class="tblwrap"><table class="tbl compact" id="cntT"><thead><tr><th>When</th><th>By</th><th class="num">Products counted</th><th class="num">Differences</th><th class="num">Units over</th><th class="num">Units short</th>${showCost ? '<th class="num">Net at cost</th>' : ""}<th>Note</th><th></th></tr></thead><tbody>
      ${counts.map((c) => `<tr data-cnt="${c.id}"><td style="white-space:nowrap"><strong>Count #${c.id}</strong><div class="muted" style="font-size:.78rem">${when(c.at)}</div></td><td>${esc(c.who)}</td><td class="num">${c.lines}</td><td class="num">${c.varied ? `<strong>${c.varied}</strong>` : '<span class="muted">0</span>'}</td>
        <td class="num" style="color:var(--pass)">${c.units_over ? "+" + c.units_over : ""}</td><td class="num" style="color:#9b1c1c">${c.units_short ? "−" + c.units_short : ""}</td>${showCost ? `<td class="num">${c.varied ? signedMoney(c.value_cents) : ""}</td>` : ""}<td>${esc(c.note)}</td>
        <td><div class="acts"><button class="btn" type="button" data-cntview="${c.id}">View</button><a class="btn" href="/api/admin/inventory/counts/${c.id}.csv" style="display:inline-grid;place-items:center;text-decoration:none">CSV</a></div></td></tr>`).join("")}</tbody></table></div>`
    : `<p class="muted">No counts yet. Open the count sheet, type what's on the shelf and post it — that becomes the first reconciliation.</p>`}`;
  const detail = async (id) => {
    const c = await api(`/inventory/counts/${id}`);
    const varied = c.items.filter((l) => l.variance), same = c.items.filter((l) => l.variance === 0), opening = c.items.filter((l) => l.variance === null);
    const line = (l) => `<tr><td class="namecol"><strong>${esc(l.name)} ${esc(l.strength)}</strong>${l.manufacturer ? `<div class="muted" style="font-size:.78rem">${esc(l.manufacturer)}</div>` : ""}</td><td class="num">${l.expected ?? '<span class="muted">not tracked</span>'}</td><td class="num"><strong>${l.counted}</strong></td>
      <td class="num">${l.variance === null ? '<span class="muted">set</span>' : l.variance === 0 ? '<span class="muted">0</span>' : `<strong style="color:${l.variance > 0 ? "var(--pass)" : "#9b1c1c"}">${l.variance > 0 ? "+" : "−"}${Math.abs(l.variance)}</strong>`}</td>
      ${c.showCost ? `<td class="num">${money(l.cost_cents)}</td><td class="num">${l.variance && l.cost_cents !== null ? signedMoney(l.variance * l.cost_cents) : ""}</td>` : ""}</tr>`;
    document.getElementById("cntDetail").innerHTML = `<div class="panel" style="border-color:var(--blue)"><div class="row2" style="justify-content:space-between;align-items:center"><h2>Count #${c.id} · ${when(c.at)} · ${esc(c.who)}</h2><button class="btn" type="button" data-pclose>Close</button></div>
      ${c.note ? `<p class="muted">${esc(c.note)}</p>` : ""}
      <dl class="kpis"><div class="kpi"><dt>Products counted</dt><dd>${c.lines}</dd></div><div class="kpi"><dt>Differences</dt><dd>${c.varied}</dd></div><div class="kpi"><dt>Units over</dt><dd>${c.units_over ? "+" + c.units_over : 0}</dd></div><div class="kpi"><dt>Units short</dt><dd>${c.units_short ? "−" + c.units_short : 0}</dd></div>${c.showCost ? `<div class="kpi"><dt>Net at cost</dt><dd>${c.varied ? signedMoney(c.value_cents) : "$0.00"}</dd></div>` : ""}</dl>
      <div class="tblwrap" style="max-height:50vh"><table class="tbl compact"><thead><tr><th>Product</th><th class="num">Expected on shelf</th><th class="num">Counted</th><th class="num">Difference</th>${c.showCost ? '<th class="num">Cost each</th><th class="num">Difference at cost</th>' : ""}</tr></thead><tbody>
        ${varied.map(line).join("")}${opening.map(line).join("")}
        ${same.length ? `<tr class="cntSameHead"><td colspan="${c.showCost ? 6 : 4}" class="muted">${same.length} product${same.length === 1 ? "" : "s"} matched exactly <button class="btn" type="button" id="cntSameBtn" style="margin-left:.5rem">Show</button></td></tr>${same.map((l) => line(l).replace("<tr>", '<tr class="cntSame" hidden>')).join("")}` : ""}
        ${!c.items.length ? '<tr><td colspan="6" class="muted">Nothing on this count.</td></tr>' : ""}</tbody></table></div>
      <div class="row2"><a class="btn" href="/api/admin/inventory/counts/${c.id}.csv" style="display:inline-grid;place-items:center;text-decoration:none">Export CSV</a></div></div>`;
    const sb = document.getElementById("cntSameBtn"); if (sb) sb.onclick = () => { const hid = sb.textContent === "Show"; document.querySelectorAll("#cntDetail .cntSame").forEach((tr) => { tr.hidden = !hid; }); sb.textContent = hid ? "Hide" : "Show"; };
    document.getElementById("cntDetail").scrollIntoView({ behavior: "smooth", block: "start" });
  };
  if (openCountId) { const id = openCountId; openCountId = null; detail(id); }
  pane().onclick = (e) => {
    const v = e.target.closest("[data-cntview]"); if (v) { detail(v.dataset.cntview); return; }
    if (e.target.closest("[data-pclose]")) document.getElementById("cntDetail").innerHTML = "";
  };
}

let logF = { reason: "", q: "", from: "", to: "" };
async function invLog() {
  const qs = new URLSearchParams(Object.entries(logF).filter(([, v]) => v)).toString();
  const { moves, reasons, more, showCost } = await api("/inventory/log" + (qs ? "?" + qs : ""));
  pane().innerHTML = `<header><h1>Inventory</h1><div class="row2"><a class="btn" href="/api/admin/inventory/log.csv${qs ? "?" + qs : ""}" style="display:inline-grid;place-items:center;text-decoration:none">Export CSV</a></div></header>${invTabs()}
    <p class="muted">Every stock change on every product, newest first: orders taking stock, cancellations putting it back, shipments received, physical counts and adjustments. Balance = available after the change.</p>
    <div class="filters" style="align-items:center"><input id="lgQ" type="search" placeholder="Product, order #, lot or person" value="${esc(logF.q)}"><select id="lgR"><option value="">All reasons</option>${reasons.map((r) => `<option${logF.reason === r ? " selected" : ""}>${esc(r)}</option>`).join("")}</select>
      <label class="muted">From <input id="lgFrom" type="date" value="${esc(logF.from)}"></label><label class="muted">To <input id="lgTo" type="date" value="${esc(logF.to)}"></label><button class="btn" type="button" id="lgGo">Apply</button><button class="btn" type="button" id="lgReset">Reset</button></div>
    ${moves.length ? `<div class="tblwrap"><table class="tbl compact"><thead><tr><th>When</th><th>Product</th><th>What</th><th class="num">Change</th><th class="num">Balance</th><th>Ref</th><th>Lot</th>${showCost ? '<th class="num">Cost each</th>' : ""}<th>By</th><th>Note</th></tr></thead><tbody>
      ${moves.map((m) => `<tr><td style="white-space:nowrap">${when(m.at)}</td><td class="namecol"><strong>${esc(m.name)} ${esc(m.strength)}</strong>${m.manufacturer ? `<div class="muted" style="font-size:.78rem">${esc(m.manufacturer)}</div>` : ""}</td><td>${esc(m.reason)}${m.supplier ? `<div class="muted" style="font-size:.75rem">${esc(m.supplier)}</div>` : ""}</td>
        <td class="num" style="color:${m.change > 0 ? "var(--pass)" : m.change < 0 ? "#9b1c1c" : "inherit"}"><strong>${m.change > 0 ? "+" : ""}${m.change}</strong></td><td class="num">${m.balance ?? ""}</td><td class="mono">${refCell(m)}</td><td class="mono">${esc(m.lot)}${m.expires ? `<div class="muted" style="font-size:.75rem">exp ${esc(String(m.expires).slice(0, 10))}</div>` : ""}</td>
        ${showCost ? `<td class="num">${money(m.cost_cents)}</td>` : ""}<td>${esc(m.who)}</td><td>${esc(m.note)}</td></tr>`).join("")}</tbody></table></div>${more ? `<p class="muted">Showing the latest ${moves.length}. Narrow the dates or export the CSV for the rest.</p>` : ""}`
    : `<p class="muted">No stock changes match.</p>`}`;
  const apply = () => { logF = { reason: document.getElementById("lgR").value, q: document.getElementById("lgQ").value.trim(), from: document.getElementById("lgFrom").value, to: document.getElementById("lgTo").value }; invLog(); };
  document.getElementById("lgGo").onclick = apply;
  document.getElementById("lgQ").onkeydown = (e) => { if (e.key === "Enter") apply(); };
  document.getElementById("lgR").onchange = apply;
  document.getElementById("lgReset").onclick = () => { logF = { reason: "", q: "", from: "", to: "" }; invLog(); };
  pane().querySelectorAll("[data-orderq]").forEach((a) => (a.onclick = (e) => { e.preventDefault(); oFilter = { status: "", q: a.dataset.orderq }; go("orders"); }));
}

/* ---------- one peptide: its lab reports (COAs) and other documents ---------- */
const fmtSize = (n) => (n >= 1048576 ? (n / 1048576).toFixed(1) + " MB" : Math.max(1, Math.round(n / 1024)) + " KB");
const readFile = (file) => new Promise((ok, no) => { const fr = new FileReader(); fr.onload = () => ok(fr.result); fr.onerror = () => no(new Error("Couldn't read the file")); fr.readAsDataURL(file); });
const OK_TYPES = ["application/pdf", "image/jpeg", "image/png", "image/webp"];
let pendingReport = null;
let openManageId = null; // a peptide just added opens its Manage panel for picture/logo // opens the Lab reports form already filled in for a product
async function manageProduct(p, reps) {
  const box = document.getElementById("manageBox");
  const label = `${p.name} ${p.strength}`.trim() + (p.manufacturer ? ` · ${p.manufacturer}` : "");
  const { documents: docs, kinds } = await api("/documents?productId=" + p.id);
  const st = await api("/settings").catch(() => ({ settings: {} }));
  const vialStyle = Object.assign({}, window.VIAL_DEFAULT, st.settings.vial || {});
  const artHTML = () => p.has_image ? `<img src="/pimg/${p.id}?v=${p.media_v}" alt="">`
    : window.drawVial({ title: p.name, sub: p.strength, style: Object.assign({}, vialStyle, p.vial_label ? { label: p.vial_label, photoTint: true } : {}), logoUrl: p.has_logo ? `/plogo/${p.id}?v=${p.media_v}` : st.settings.vialLogoV ? `/vial-logo?v=${st.settings.vialLogoV}` : "", photoUrl: `/vial-photo?v=${st.settings.vialPhotoV || 1}` });
  box.innerHTML = `<div class="panel" style="border-color:var(--blue)">
    <div class="row2" style="justify-content:space-between;align-items:center"><h2>${esc(label)}</h2><button class="btn" type="button" id="mgClose">Close</button></div>
    <div class="row2" style="align-items:flex-start;gap:1.25rem">
      <div class="vialprev" id="mgArt">${artHTML()}</div>
      <div class="stack" style="flex:1;min-width:16rem"><h3 class="eyebrow">Picture &amp; vial</h3>
        <p class="muted" style="font-size:.82rem">A picture replaces the drawn vial on the store. Without one, the vial is drawn using Page setup → Vial look, with this product's logo and label color if you set them.</p>
        ${isOwner() ? `<div class="field"><label class="eyebrow">Product picture (JPG/PNG, under 5 MB)</label><div class="row2"><input type="file" id="mgPic" accept="image/png,image/jpeg,image/webp">${p.has_image ? '<button class="btn" type="button" data-mdel="image">Remove picture</button>' : ""}</div></div>
        <div class="field"><label class="eyebrow">Logo on this vial's label</label><div class="row2"><input type="file" id="mgLogo" accept="image/png,image/jpeg,image/webp">${p.has_logo ? '<button class="btn" type="button" data-mdel="logo">Remove logo</button>' : ""}</div></div>
        <div class="row2" style="align-items:center"><label class="chk"><input type="color" id="mgColor" value="${esc(p.vial_label || vialStyle.label)}" style="width:2.4rem;height:2rem;padding:0;border:1px solid var(--line-strong);border-radius:6px"> Label color for this product</label>
          <button class="btn" type="button" id="mgColorSave">Use this color</button>${p.vial_label ? '<button class="linkbtn" type="button" id="mgColorClear">Use the standard color</button>' : ""}</div>` : ""}
      </div>
    </div>
    <div class="two">
      <div class="stack"><h3 class="eyebrow">Lab reports (COA)</h3>
        ${reps.length ? `<ul class="hist">${reps.map((r) => `<li><strong>${esc(r.sample || `${r.product} ${r.strength}`)}</strong>${r.task ? ` · task #${esc(r.task)}` : ""}${r.tested ? ` · tested ${esc(r.tested)}` : ""}
          <small>${r.image ? `<a href="${esc(r.image)}" target="_blank" rel="noopener">${r.isPdf ? "Open PDF" : "Open image"}</a> · ` : "No file attached · "}<a href="#" data-editrep="${r.id}">Edit</a></small></li>`).join("")}</ul>`
          : `<p class="muted">No lab report attached yet.</p>`}
        ${isOwner() ? `<div><button class="btn solid" type="button" id="mgAddCoa">Add a COA for this peptide</button></div>` : ""}
        <p class="muted" style="font-size:.8rem">A COA attaches when its peptide name, size and manufacturer match this product.</p></div>
      <div class="stack"><h3 class="eyebrow">Other documents</h3>
        ${docs.length ? `<ul class="hist" id="docList">${docs.map((d) => `<li data-doc="${d.id}"><div class="row2" style="justify-content:space-between;align-items:center">
            <span><strong>${esc(d.title)}</strong> <span class="pill st-confirmed">${esc(d.kind)}</span>${d.public ? "" : ' <span class="pill st-new">Hidden</span>'}</span>
            <span class="row2" style="flex-wrap:nowrap"><a class="btn" href="/doc/${d.id}" target="_blank" rel="noopener">Open</a>${isOwner() ? `<button class="btn" type="button" data-dtog>${d.public ? "Hide" : "Show"}</button><button class="btn" type="button" data-ddel>Delete</button>` : ""}</span></div>
            <small>${d.file_type === "application/pdf" ? "PDF" : "Image"} · ${fmtSize(d.size)} · added ${when(d.created_at)}</small></li>`).join("")}</ul>`
          : `<p class="muted">No other documents yet.</p>`}
        ${isOwner() ? `<div class="panel" style="padding:.9rem;background:var(--ground)"><strong>Add a document</strong>
          <div class="grid2"><div class="field"><label class="eyebrow" for="dTitle">Title</label><input id="dTitle" placeholder="e.g. Safety data sheet"></div>
          <div class="field"><label class="eyebrow" for="dKind">Type</label><select id="dKind">${kinds.map((k) => `<option>${esc(k)}</option>`).join("")}</select></div></div>
          <div class="field"><label class="eyebrow" for="dFile">File (PDF, JPG or PNG, under 10 MB)</label><input type="file" id="dFile" accept="application/pdf,image/jpeg,image/png,image/webp"></div>
          <label class="chk"><input type="checkbox" id="dPub" checked> Show on the store with this product</label>
          <div><button class="btn solid" type="button" id="dUp">Upload document</button></div></div>` : ""}
      </div>
    </div></div>`;
  box.scrollIntoView({ behavior: "smooth", block: "start" });
  const $ = (x) => document.getElementById(x);
  $("mgClose").onclick = () => { box.innerHTML = ""; };
  const media = async (body, msg) => { await api(`/products/${p.id}/media`, { method: "POST", body }); toast(msg); refreshP(); };
  const refreshP = async () => { const { products: all } = await api("/products"); const np = all.find((x) => x.id === p.id); if (np) Object.assign(p, np); manageProduct(p, reps); };
  const upload = (input, kind) => input && (input.onchange = async () => {
    const f = input.files[0]; if (!f) return;
    if (!["image/jpeg", "image/png", "image/webp"].includes(f.type)) return toast("Use a JPG, PNG or WEBP");
    if (f.size > 5 * 1024 * 1024) return toast("That image is over 5 MB");
    await media({ kind, fileData: await fileToData(f) }, kind === "logo" ? "Logo added" : "Picture added");
  });
  upload($("mgPic"), "image"); upload($("mgLogo"), "logo");
  box.querySelectorAll("[data-mdel]").forEach((b) => (b.onclick = async () => { await api(`/products/${p.id}/media/${b.dataset.mdel}`, { method: "DELETE" }); toast("Removed"); refreshP(); }));
  if ($("mgColor")) $("mgColor").oninput = () => { if (!p.has_image) $("mgArt").innerHTML = window.drawVial({ title: p.name, sub: p.strength, style: Object.assign({}, vialStyle, { label: $("mgColor").value, photoTint: true }), logoUrl: p.has_logo ? `/plogo/${p.id}?v=${p.media_v}` : st.settings.vialLogoV ? `/vial-logo?v=${st.settings.vialLogoV}` : "", photoUrl: `/vial-photo?v=${st.settings.vialPhotoV || 1}` }); };
  if ($("mgColorSave")) $("mgColorSave").onclick = () => media({ vialLabel: $("mgColor").value }, "Label color saved");
  if ($("mgColorClear")) $("mgColorClear").onclick = () => media({ vialLabel: "" }, "Standard color restored");
  box.querySelectorAll("[data-editrep]").forEach((a) => (a.onclick = (e) => { e.preventDefault(); pendingReport = { id: +a.dataset.editrep }; go("reports"); }));
  if ($("mgAddCoa")) $("mgAddCoa").onclick = () => { pendingReport = { product: p.name, strength: p.strength, sample: `${p.name} ${p.strength}`.trim(), manufacturer: p.manufacturer || "" }; go("reports"); };
  if ($("dUp")) $("dUp").onclick = async () => {
    const file = $("dFile").files[0];
    if (!file) return toast("Choose a file first");
    if (!OK_TYPES.includes(file.type)) return toast("Use a PDF, JPG or PNG");
    if (file.size > 10 * 1024 * 1024) return toast("That file is over 10 MB");
    $("dUp").disabled = true; $("dUp").textContent = "Uploading…";
    try {
      await api("/documents", { method: "POST", body: { productId: p.id, title: $("dTitle").value.trim() || file.name.replace(/\.[a-z0-9]+$/i, ""), kind: $("dKind").value, public: $("dPub").checked, fileName: file.name, fileData: await readFile(file) } });
      toast("Document added"); p.doc_count = (p.doc_count || 0) + 1; manageProduct(p, reps);
    } catch (e) { $("dUp").disabled = false; $("dUp").textContent = "Upload document"; }
  };
  box.querySelectorAll("[data-doc]").forEach((li) => {
    const d = docs.find((x) => String(x.id) === li.dataset.doc);
    const tog = li.querySelector("[data-dtog]"), del = li.querySelector("[data-ddel]");
    if (tog) tog.onclick = async () => { await api("/documents/" + d.id, { method: "PATCH", body: { title: d.title, kind: d.kind, public: !d.public } }); manageProduct(p, reps); };
    if (del) del.onclick = async () => { if (!confirm(`Delete "${d.title}"?`)) return; await api("/documents/" + d.id, { method: "DELETE" }); p.doc_count = Math.max(0, (p.doc_count || 1) - 1); toast("Deleted"); manageProduct(p, reps); };
  });
}

/* ---------- product import from Excel / CSV ---------- */
const IMPORT_COLS = [["name", "Name"], ["strength", "Size"], ["category", "Category"], ["manufacturer", "Manufacturer"], ["cost", "Cost"], ["price", "Price"], ["stock", "Stock"], ["maxPerOrder", "Max per order"], ["sort", "Sort"], ["active", "Active"], ["description", "Description"]];
const HEADER_ALIASES = { name: ["name", "product", "productname", "peptide", "item"], strength: ["size", "strength", "mg", "dose", "amount", "vialsize"],
  category: ["category", "cat", "type"], manufacturer: ["manufacturer", "mfr", "mfg", "maker", "brand", "supplier", "lab"], price: ["price", "retail", "priceusd", "price$", "sellprice", "storeprice"], cost: ["cost", "ourcost", "costusd", "cost$", "wholesale", "unitcost"],
  stock: ["stock", "qty", "quantity", "onhand", "inventory"], maxPerOrder: ["maxperorder", "max", "limit", "maxorder", "max/order"],
  sort: ["sort", "order", "position"], active: ["active", "show", "visible", "enabled"], description: ["description", "desc", "notes", "details"] };
const normH = (h) => String(h || "").toLowerCase().replace(/[^a-z0-9$/]/g, "");
function loadSheetJS() {
  if (window.XLSX) return Promise.resolve();
  return new Promise((ok, no) => { const sc = document.createElement("script"); sc.src = "/xlsx.full.min.js?v=0.18.5"; sc.onload = ok; sc.onerror = () => no(new Error("Couldn't load the spreadsheet reader")); document.head.appendChild(sc); });
}
function downloadTemplate(list) {
  const cell = (v) => { const x = String(v ?? ""); return /[",\n]/.test(x) ? `"${x.replace(/"/g, '""')}"` : x; };
  const lines = [IMPORT_COLS.map(([, l]) => l).join(",")];
  list.forEach((p) => lines.push([p.name, p.strength, p.category, p.manufacturer, p.price_cents === null ? "" : (p.price_cents / 100).toFixed(2), p.stock ?? "", p.max_per_order ?? "", p.sort, p.active ? "Yes" : "No", p.description].map(cell).join(",")));
  if (!list.length) lines.push("BPC-157,10 mg,Tissue repair research,,,45.00,25,,0,Yes,");
  const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([lines.join("\n")], { type: "text/csv" })); a.download = "products.csv"; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
function importBox(list) {
  const box = document.getElementById("impBox");
  if (box.innerHTML) { box.innerHTML = ""; return; }
  box.innerHTML = `<div class="panel"><h2>Import products from a file</h2>
    <p class="muted">Upload an Excel (.xlsx, .xls) or CSV file with a header row. Columns: <strong>Name</strong>, <strong>Size</strong>, Category, Manufacturer, Price, Stock, Max per order, Sort, Active (Yes/No), Description. Only Name is required. A row whose Name, Size and Manufacturer match an existing product updates it; anything else is added as a new product, so the same peptide from two manufacturers becomes two products with their own prices. Blank cells keep the current value.</p>
    <div class="row2"><button class="btn" type="button" id="tpl">Download current products as a template</button>
      <label class="btn solid" style="display:inline-grid;place-items:center;cursor:pointer">Choose file<input type="file" id="impFile" accept=".xlsx,.xls,.csv,text/csv" hidden></label></div>
    <div id="impPrev"></div></div>`;
  document.getElementById("tpl").onclick = () => downloadTemplate(list);
  document.getElementById("impFile").onchange = async (e) => {
    const file = e.target.files[0]; if (!file) return;
    const prev = document.getElementById("impPrev"); prev.innerHTML = `<p class="muted">Reading ${esc(file.name)}…</p>`;
    try {
      await loadSheetJS();
      const wb = XLSX.read(await file.arrayBuffer(), { type: "array" });
      const raw = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: "", raw: false });
      if (!raw.length) { prev.innerHTML = `<div class="err">That file has no rows under the header.</div>`; return; }
      const heads = Object.keys(raw[0]);
      const map = {};
      heads.forEach((h) => { const n = normH(h); const k = Object.keys(HEADER_ALIASES).find((key) => HEADER_ALIASES[key].includes(n)); if (k && !map[k]) map[k] = h; });
      if (!map.name) { prev.innerHTML = `<div class="err">Couldn't find a Name column. The columns found were: ${heads.map(esc).join(", ")}</div>`; return; }
      const rows = raw.map((r) => Object.fromEntries(Object.entries(map).map(([k, h]) => [k, String(r[h] ?? "").trim()]))).filter((r) => r.name);
      const sk = (v) => String(v ?? "").toLowerCase().replace(/[^a-z0-9.]/g, "").replace(/mg$/, "");
      const same = (r) => list.filter((p) => p.name.toLowerCase() === r.name.toLowerCase() && sk(p.strength) === sk(r.strength));
      const isUpd = (r) => r.manufacturer ? same(r).some((p) => nrm(p.manufacturer) === nrm(r.manufacturer)) : same(r).length === 1;
      const nNew = rows.filter((r) => !isUpd(r)).length, nUpd = rows.length - nNew;
      const used = IMPORT_COLS.filter(([k]) => map[k]);
      prev.innerHTML = `<p><strong>${rows.length} rows:</strong> ${nNew} new, ${nUpd} update existing. Columns used: ${used.map(([, l]) => l).join(", ")}.${heads.length > used.length ? ` <span class="muted">Ignored: ${heads.filter((h) => !Object.values(map).includes(h)).map(esc).join(", ")}</span>` : ""}</p>
        <div class="tblwrap" style="max-height:22rem;overflow:auto"><table class="tbl"><tr><th></th>${used.map(([, l]) => `<th>${l}</th>`).join("")}</tr>
        ${rows.map((r) => `<tr><td>${isUpd(r) ? '<span class="pill st-confirmed">update</span>' : '<span class="pill st-shipped">new</span>'}</td>${used.map(([k]) => `<td>${esc(r[k])}</td>`).join("")}</tr>`).join("")}</table></div>
        <div class="row2"><button class="btn solid" type="button" id="impGo">Import ${rows.length} rows</button><button class="btn" type="button" id="impCancel">Cancel</button></div>`;
      document.getElementById("impCancel").onclick = () => { box.innerHTML = ""; };
      document.getElementById("impGo").onclick = async () => {
        const r = await api("/products/import", { method: "POST", body: { rows } });
        unsaved = false;
        toast(`Imported: ${r.created} new, ${r.updated} updated`);
        await products();
        if (r.problems.length) document.getElementById("impBox").innerHTML = `<div class="panel"><h2>Some rows were skipped</h2><ul class="muted">${r.problems.map((x) => `<li>${esc(x)}</li>`).join("")}</ul></div>`;
        drawNav();
      };
    } catch (x) { prev.innerHTML = `<div class="err">${esc(x.message || "Couldn't read that file.")}</div>`; }
  };
}

/* ---------- upload quantities: a CSV / Excel file of Name, Size, Qty → count sheet or shipment ---------- */
function qtyUploadBox(items) {
  const box = document.getElementById("qtyBox"); if (!box) return;
  if (box.innerHTML) { box.innerHTML = ""; return; }
  const label = (p) => `${p.name} ${p.strength}`.trim();
  box.innerHTML = `<div class="panel" style="border-color:var(--blue)"><h2>Upload quantities</h2>
    <p class="muted">A CSV or Excel file with a header row: <strong>Name</strong>, <strong>Size</strong>, <strong>Qty</strong> (optional: Lot, Expires, Cost each, Manufacturer). Names and sizes must match the products list — download the template to get them exactly right, type the quantities, and upload it back. "On the shelf" means every vial physically there, including ones already held by open orders.</p>
    <div class="grid2"><div class="field"><label class="eyebrow" for="qtyMode">What the quantities mean</label><select id="qtyMode"><option value="count">Set what's on the shelf (posts a count sheet)</option><option value="receive">Add to stock (receive a shipment)</option></select></div>
      <div class="field"><label class="eyebrow" for="qtyNote">Note (optional)</label><input id="qtyNote" placeholder="e.g. Weekly count · Oct 29"></div></div>
    <div class="row2"><button class="btn" type="button" id="qtyTpl">Download template with current stock</button><label class="btn solid" style="display:inline-grid;place-items:center;cursor:pointer">Choose file<input type="file" id="qtyFile" accept=".xlsx,.xls,.csv,text/csv" hidden></label></div>
    <div id="qtyPrev"></div></div>`;
  document.getElementById("qtyTpl").onclick = () => {
    const cell = (v) => { const x = String(v ?? ""); return /[",\n]/.test(x) ? `"${x.replace(/"/g, '""')}"` : x; };
    const lines = ["Name,Size,Manufacturer,Qty,Lot,Expires,Cost each"]; items.forEach((p) => lines.push([p.name, p.strength, p.manufacturer, p.stock === null ? "" : p.stock + (p.committed || 0), "", "", ""].map(cell).join(",")));
    const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([lines.join("\n")], { type: "text/csv" })); a.download = "quantities.csv"; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  };
  document.getElementById("qtyFile").onchange = async (e) => {
    const file = e.target.files[0]; if (!file) return;
    const prev = document.getElementById("qtyPrev"); prev.innerHTML = `<p class="muted">Reading ${esc(file.name)}…</p>`;
    try {
      await loadSheetJS();
      const wb = XLSX.read(await file.arrayBuffer(), { type: "array", cellDates: true, raw: true }); // raw: CSV text stays exactly as typed
      const asText = (v) => v instanceof Date ? `${v.getFullYear()}-${String(v.getMonth() + 1).padStart(2, "0")}-${String(v.getDate()).padStart(2, "0")}` : String(v ?? ""); // dates stay the day that was typed
      const raw = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: "", raw: true }).map((r) => Object.fromEntries(Object.entries(r).map(([k, v]) => [k, asText(v)])));
      if (!raw.length) { prev.innerHTML = `<div class="err">That file has no rows under the header.</div>`; return; }
      const heads = Object.keys(raw[0]);
      const AL = { name: HEADER_ALIASES.name, strength: HEADER_ALIASES.strength, manufacturer: HEADER_ALIASES.manufacturer, qty: ["qty", "quantity", "count", "counted", "onhand", "onshelf", "stock", "units", "vials", "received", "amount"], lot: ["lot", "lotnumber", "batch"], expires: ["expires", "expiry", "expiration", "expdate", "exp"], cost: ["cost", "costeach", "unitcost", "ourcost", "cost$"] };
      const map = {}; heads.forEach((h) => { const n = normH(h); const k = Object.keys(AL).find((key) => AL[key].includes(n)); if (k && !map[k]) map[k] = h; });
      if (!map.name || !map.qty) { prev.innerHTML = `<div class="err">Need a Name column and a Qty column. Columns found: ${heads.map(esc).join(", ")}</div>`; return; }
      const sk = (v) => String(v ?? "").toLowerCase().replace(/[^a-z0-9.]/g, "").replace(/mg$/, "");
      const rows = raw.map((r, i) => ({ row: i + 2, name: String(r[map.name] ?? "").trim(), strength: map.strength ? String(r[map.strength] ?? "").trim() : "", manufacturer: map.manufacturer ? String(r[map.manufacturer] ?? "").trim() : "", qty: String(r[map.qty] ?? "").trim(), lot: map.lot ? String(r[map.lot] ?? "").trim() : "", expires: map.expires ? String(r[map.expires] ?? "").trim() : "", cost: map.cost ? String(r[map.cost] ?? "").trim() : "" })).filter((r) => r.name);
      const match = (r) => { let c = items.filter((p) => p.name.toLowerCase() === r.name.toLowerCase()); if (r.strength) c = c.filter((p) => sk(p.strength) === sk(r.strength)); if (c.length > 1 && r.manufacturer) c = c.filter((p) => nrm(p.manufacturer) === nrm(r.manufacturer)); return c.length === 1 ? c[0] : c.length > 1 ? "many" : null; };
      const seen = new Set(), lines = [], problems = [];
      for (const r of rows) {
        const m = match(r); const q = r.qty === "" ? null : Number(String(r.qty).replace(/[^0-9.-]/g, ""));
        if (!m) { problems.push(`Row ${r.row}: no product called "${r.name}${r.strength ? " " + r.strength : ""}"`); continue; }
        if (m === "many") { problems.push(`Row ${r.row}: "${r.name} ${r.strength}" matches more than one product — add the Manufacturer column`); continue; }
        if (q === null || !isFinite(q)) { problems.push(`Row ${r.row}: ${label(m)} — Qty is blank, skipped`); continue; }
        if (q < 0 || Math.round(q) !== q) { problems.push(`Row ${r.row}: ${label(m)} — Qty "${r.qty}" must be a whole number`); continue; }
        if (seen.has(m.id)) { problems.push(`Row ${r.row}: ${label(m)} is in the file twice — second one ignored`); continue; }
        seen.add(m.id); lines.push({ p: m, qty: q, lot: r.lot, expires: r.expires, cost: r.cost });
      }
      const draw = () => {
        const mode = document.getElementById("qtyMode").value;
        prev.innerHTML = `<p><strong>${lines.length} product${lines.length === 1 ? "" : "s"} matched</strong>${problems.length ? `, ${problems.length} row${problems.length === 1 ? "" : "s"} skipped` : ""}.</p>
          ${lines.length ? `<div class="tblwrap" style="max-height:24rem;overflow:auto"><table class="tbl"><tr><th>Product</th><th class="num">On shelf now</th><th class="num">${mode === "count" ? "Counted" : "Receiving"}</th><th class="num">${mode === "count" ? "Change" : "New on shelf"}</th>${mode === "receive" ? "<th>Lot</th><th>Expires</th><th class=\"num\">Cost each</th>" : ""}</tr>
            ${lines.map((l) => { const cur = l.p.stock === null ? null : l.p.stock + (l.p.committed || 0); const diff = mode === "count" ? (cur === null ? null : l.qty - cur) : null; return `<tr><td>${esc(label(l.p))}${l.p.manufacturer ? `<div class="muted" style="font-size:.72rem">${esc(l.p.manufacturer)}</div>` : ""}</td><td class="num">${cur === null ? '<span class="muted">not tracked</span>' : cur}</td><td class="num"><strong>${l.qty}</strong></td><td class="num">${mode === "count" ? (diff === null ? "opening count" : diff === 0 ? "—" : (diff > 0 ? "+" : "") + diff) : (cur === null ? l.qty : cur + l.qty)}</td>${mode === "receive" ? `<td>${esc(l.lot)}</td><td>${esc(l.expires)}</td><td class="num">${esc(l.cost)}</td>` : ""}</tr>`; }).join("")}</table></div>` : ""}
          ${problems.length ? `<details style="margin-top:.6rem"><summary class="muted" style="cursor:pointer">Skipped rows</summary><ul class="muted">${problems.map((x) => `<li>${esc(x)}</li>`).join("")}</ul></details>` : ""}
          ${lines.length ? `<div class="row2" style="margin-top:.6rem"><button class="btn solid" type="button" id="qtyGo">${mode === "count" ? "Post count sheet" : "Receive into stock"} (${lines.length})</button><button class="btn" type="button" id="qtyCancel">Cancel</button></div>` : ""}`;
        if (document.getElementById("qtyCancel")) document.getElementById("qtyCancel").onclick = () => { box.innerHTML = ""; };
        if (document.getElementById("qtyGo")) document.getElementById("qtyGo").onclick = async () => {
          const note = document.getElementById("qtyNote").value || `Uploaded from ${file.name}`;
          const b = document.getElementById("qtyGo"); b.disabled = true;
          try {
            if (mode === "count") { const r = await api("/inventory/counts", { method: "POST", body: { note, lines: lines.map((l) => ({ productId: l.p.id, counted: l.qty })) } }); toast(`Count posted: ${r.varied ?? lines.length} changed`); invTab = "counts"; }
            else { const r = await api("/inventory/receive", { method: "POST", body: { note, ref: file.name, lines: lines.map((l) => ({ productId: l.p.id, qty: l.qty, lot: l.lot, expires: l.expires, costEach: l.cost })) } }); toast(`Received ${r.lines} line${r.lines === 1 ? "" : "s"} into stock`); }
            stats = null; await inventory();
          } catch (x) { b.disabled = false; }
        };
      };
      draw(); document.getElementById("qtyMode").onchange = draw;
    } catch (x) { prev.innerHTML = `<div class="err">${esc(x.message || "Couldn't read that file.")}</div>`; }
  };
}

/* ---------- lab reports ---------- */
async function reports() {
  const [{ reports: list }, { products: prods }] = await Promise.all([api("/reports"), api("/products")]);
  const attached = (r) => prods.filter((p) => reportMatches(p, r));
  const orphans = list.filter((r) => r.active && !attached(r).some((p) => p.active)).length;
  pane().innerHTML = `<header><h1>Lab reports</h1><div class="row2">${isOwner() ? `<button class="btn solid" id="addR">Add report</button>${list.length ? `<button class="btn danger" id="clrR">Remove all lab reports</button>` : ""}` : ""}</div></header>
    <p class="muted">Copy each field from the lab's document exactly as printed. A report attaches to a product when the peptide name, size and manufacturer match.</p>
    ${!list.length ? `<div class="okbox" style="padding:.7rem 1rem">No lab reports yet. Click Add report, or open a product's Manage button under Products &amp; prices.</div>` : orphans ? `<div class="err">${orphans} lab report${orphans === 1 ? " isn't" : "s aren't"} attached to any product on the store. Add the product, or give an existing product the matching name, size or code.</div>` : `<div class="okbox" style="padding:.7rem 1rem">Every lab report is attached to a product.</div>`}
    <div id="rform"></div>
    <div class="tblwrap"><table class="tbl"><tr><th></th><th>Peptide</th><th>Size</th><th>Sample</th><th>Task</th><th>Tested</th><th>Attached to</th><th>Shown</th></tr>
    ${list.map((r) => `<tr class="click" data-rid="${r.id}"><td>${r.image ? (r.isPdf ? '<span class="pdfthumb">PDF</span>' : `<img class="thumbimg" src="${esc(r.image)}" alt="">`) : ""}</td><td>${esc(r.product)}</td><td>${esc(r.strength)}</td><td class="mono">${esc(r.sample)}</td><td class="mono">${esc(r.task)}</td><td>${esc(r.tested)}</td>
      <td>${(() => { const a = attached(r); if (!a.length) return '<span class="pill st-cancelled">No product</span>'; return a.map((p) => `<span class="pill ${p.active ? "st-shipped" : "st-new"}">${esc(p.name)} ${esc(p.strength)}${p.manufacturer ? " · " + esc(p.manufacturer) : ""}${p.active ? "" : " (hidden)"}</span>`).join(" "); })()}</td>
      <td>${r.active ? "Yes" : "Hidden"}</td></tr>`).join("")}</table></div>`;
  const form = (r) => {
    r = r || { results: [["", ""], ["Purity", ""]], lab: "Janoshik", active: true };
    const f = (k, label, v, extra = "") => `<div class="field"><label class="eyebrow">${label}</label><input data-k="${k}" value="${esc(v)}" ${extra}${ro()}></div>`;
    document.getElementById("rform").innerHTML = `<div class="panel"><h2>${r.id ? "Edit report" : "New report"}</h2>
      <p class="muted">Choose the report file first — the boxes below fill themselves from it (check them against the document, then Save).</p>
      <div class="field"><label class="eyebrow">Report file (PDF, JPG or PNG, under 10 MB)${r.image ? ` — leave empty to keep the current one (<a href="${esc(r.image)}" target="_blank" rel="noopener">open current</a>)` : ""}</label><input type="file" id="rimg" accept="application/pdf,image/jpeg,image/png,image/webp"${ro()}></div>
      <div class="grid2">${f("product", "Peptide (as listed)", r.product)}${f("strength", "Size, e.g. 10 mg", r.strength)}${f("sample", "Sample line", r.sample)}
      ${f("task", "Task number", r.task)}${f("key", "Unique key", r.key)}${f("verifyUrl", "Verify link (https)", r.verifyUrl)}
      ${f("lab", "Lab", r.lab)}${f("client", "Client", r.client)}${f("manufacturer", "Manufacturer", r.manufacturer)}${f("batch", "Batch", r.batch)}
      ${f("ordered", "Testing ordered", r.ordered, 'type="date"')}${f("received", "Sample received", r.received, 'type="date"')}${f("tested", "Analysis conducted", r.tested, 'type="date"')}
      ${f("testsRequested", "Tests requested", r.testsRequested)}</div>
      <div class="field"><label class="eyebrow">Results rows (name, value)</label><div id="rres" class="stack">${(r.results || []).map(([n, v]) => `<div class="row2"><input value="${esc(n)}" placeholder="BPC-157 or Purity" style="flex:1;height:2.4rem;padding:0 .7rem;border:1px solid var(--line-strong);border-radius:8px"${ro()}><input value="${esc(v)}" placeholder="10.95 mg" style="flex:1;height:2.4rem;padding:0 .7rem;border:1px solid var(--line-strong);border-radius:8px"${ro()}></div>`).join("")}</div>
      ${isOwner() ? `<button class="linkbtn" type="button" id="addRow" style="justify-self:start">+ Add a results row</button>` : ""}</div>
      <label class="chk"><input type="checkbox" id="ract"${r.active ? " checked" : ""}${ro()}> Show on the site</label>
      ${isOwner() ? `<div class="row2"><button class="btn solid" id="rsave">Save report</button>${r.id ? `<button class="btn" id="rdel">Delete</button>` : ""}<button class="btn" id="rcancel">Cancel</button></div>` : ""}</div>`;
    const $ = (x) => document.getElementById(x);
    if (!isOwner()) return;
    $("addRow").onclick = () => $("rres").insertAdjacentHTML("beforeend", `<div class="row2"><input placeholder="Name" style="flex:1;height:2.4rem;padding:0 .7rem;border:1px solid var(--line-strong);border-radius:8px"><input placeholder="Value" style="flex:1;height:2.4rem;padding:0 .7rem;border:1px solid var(--line-strong);border-radius:8px"></div>`);
    $("rcancel").onclick = () => { $("rform").innerHTML = ""; };
    // pick the file → the fields fill themselves from the document (empty boxes only; check them against the report)
    $("rimg").onchange = async () => {
      const file = $("rimg").files[0]; if (!file) return;
      let note = document.getElementById("rfill"); if (!note) { note = document.createElement("p"); note.id = "rfill"; note.className = "muted"; $("rimg").closest(".field").appendChild(note); }
      if (!OK_TYPES.includes(file.type)) { note.innerHTML = `<span class="err" style="display:inline-block">That file is ${esc(file.type || file.name.split(".").pop() || "an unknown type")} — use a PDF, JPG or PNG.${/heic|heif/i.test(file.type + file.name) ? " iPhone photos come as HEIC: share the photo as a JPEG (or set Settings → Camera → Formats → Most Compatible), or scan the report into a PDF." : ""}</span>`; return; }
      if (file.size > 10 * 1024 * 1024) { note.innerHTML = `<span class="err" style="display:inline-block">That file is over 10 MB — use a smaller picture or PDF.</span>`; return; }
      note.textContent = `Reading ${file.name}… (10–20 seconds the first time)`;
      try {
        const r = await api("/reports/extract", { method: "POST", body: { imageData: await readFile(file) } });
        if (!r.ok) { note.textContent = r.note || "Couldn't read that file."; return; }
        const f = r.fields || {}; let filled = 0;
        document.querySelectorAll("#rform [data-k]").forEach((i) => { const k = i.dataset.k; if (f[k] && !i.value.trim()) { i.value = f[k]; filled++; } });
        if (f.results && f.results.length) {
          const rows = [...$("rres").children], blank = rows.every((d) => !(d.querySelectorAll("input")[1] || {}).value);
          if (blank) { $("rres").innerHTML = ""; f.results.forEach(([n, v]) => $("rres").insertAdjacentHTML("beforeend", `<div class="row2"><input value="${esc(n)}" placeholder="BPC-157 or Purity" style="flex:1;height:2.4rem;padding:0 .7rem;border:1px solid var(--line-strong);border-radius:8px"><input value="${esc(v)}" placeholder="10.95 mg or 99.8%" style="flex:1;height:2.4rem;padding:0 .7rem;border:1px solid var(--line-strong);border-radius:8px"></div>`)); filled += f.results.length; }
        }
        note.innerHTML = filled ? `<strong>Filled ${filled} field${filled === 1 ? "" : "s"} from the file</strong> (${r.how === "ocr" ? "read from the picture" : "from the PDF text"}). Check them against the document — the unique key and numbers especially — then Save.` : "Nothing new to fill in from that file (boxes that already had text were left alone).";
      } catch (x) { note.textContent = "Couldn't read that file: " + (x.message || ""); }
    };
    if ($("rdel")) $("rdel").onclick = async () => { if (!confirm("Delete this lab report?")) return; await api("/reports/" + r.id, { method: "DELETE" }); reports(); };
    $("rsave").onclick = async () => {
      const body = { active: $("ract").checked, results: [...$("rres").children].map((d) => [...d.querySelectorAll("input")].map((i) => i.value.trim())).filter(([n]) => n) };
      document.querySelectorAll("#rform [data-k]").forEach((i) => { body[i.dataset.k] = i.value; });
      const file = $("rimg").files[0];
      if (file) {
        if (!OK_TYPES.includes(file.type)) return toast("Use a PDF, JPG or PNG");
        if (file.size > 10 * 1024 * 1024) return toast("That file is over 10 MB");
        body.imageData = await readFile(file);
      }
      await api(r.id ? "/reports/" + r.id : "/reports", { method: r.id ? "PATCH" : "POST", body });
      toast("Report saved"); reports();
    };
  };
  if (document.getElementById("addR")) document.getElementById("addR").onclick = () => form(null);
  if (document.getElementById("clrR")) document.getElementById("clrR").onclick = async () => {
    const typed = prompt(`This removes all ${list.length} lab reports and their files from the site. Products stay.\n\nType DELETE to confirm.`);
    if (typed === null) return;
    if (typed.trim() !== "DELETE") return toast("Not removed. Type DELETE exactly.");
    const r = await api("/reports/clear", { method: "POST", body: { confirm: "DELETE" } });
    toast(`Removed ${r.removed} lab reports`); reports();
  };
  if (pendingReport) {
    const pr = pendingReport; pendingReport = null;
    if (pr.id) { const r = list.find((x) => x.id === pr.id); if (r) form(r); }
    else form({ results: [[pr.product, ""], ["Purity", ""]], lab: "Janoshik", active: true, product: pr.product, strength: pr.strength, sample: pr.sample, manufacturer: pr.manufacturer });
  }
  pane().querySelector(".tbl").onclick = (e) => { const tr = e.target.closest("[data-rid]"); if (tr) { form(list.find((x) => String(x.id) === tr.dataset.rid)); window.scrollTo(0, 0); } };
}

/* ---------- discount codes (owner) ---------- */
async function discounts() {
  if (!isOwner()) return dashboard();
  const { codes } = await api("/discounts");
  const today = new Date().toISOString().slice(0, 10);
  const state = (c) => (!c.active ? ["off", "st-cancelled"] : c.expired ? ["expired", "st-cancelled"] : c.max_uses !== null && c.used >= c.max_uses ? ["used up", "st-cancelled"] : ["live", "st-shipped"]);
  pane().innerHTML = `<header><h1>Discount codes</h1></header>
    <div class="panel"><h2>Make a code</h2>
      <p class="muted">Customers type the code at checkout (sales reps can too). It comes off the product subtotal, before shipping. Commissions are paid on the discounted amount.</p>
      <div class="grid2" style="grid-template-columns:repeat(auto-fit,minmax(11rem,1fr))">
        <div class="field"><label class="eyebrow" for="dcCode">Code</label><div class="row2" style="flex-wrap:nowrap"><input id="dcCode" placeholder="e.g. WELCOME10" autocapitalize="characters" style="text-transform:uppercase;flex:1;min-width:0"><button class="btn" type="button" id="dcGen" title="Make a random code">Generate</button></div></div>
        <div class="field"><label class="eyebrow" for="dcKind">Type</label><select id="dcKind"><option value="percent">Percent off</option><option value="amount">Dollars off ($)</option><option value="vials">Free vials (quantity)</option></select></div>
        <div class="field"><label class="eyebrow" for="dcValue" id="dcValueLbl">Percent off</label><input id="dcValue" inputmode="decimal" placeholder="%"></div>
        <div class="field"><label class="eyebrow" for="dcMinVials">Minimum vials in order (optional)</label><input id="dcMinVials" inputmode="numeric" placeholder="None"></div>
        <div class="field"><label class="eyebrow" for="dcMin">Minimum order $ (optional)</label><input id="dcMin" inputmode="decimal" placeholder="None"></div>
        <div class="field"><label class="eyebrow" for="dcUses">Number of uses (optional)</label><input id="dcUses" inputmode="numeric" placeholder="Unlimited"></div>
        <div class="field"><label class="eyebrow" for="dcExp">Expires (optional)</label><input id="dcExp" type="date" min="${today}"></div>
        <div class="field" style="grid-column:1/-1"><label class="eyebrow" for="dcNote">Note to yourself (optional)</label><input id="dcNote" placeholder="e.g. October promo, handed out at the clinic"></div></div>
      <div class="row2"><button class="btn solid" id="dcSave">Create code</button></div></div>
    <div class="panel"><h2>Codes</h2>
      ${codes.length ? `<div class="tblwrap"><table class="tbl"><tr><th>Code</th><th>Takes off</th><th>Minimum</th><th class="num">Used</th><th>Expires</th><th>State</th><th class="num">Orders</th><th class="num">Given</th><th>Note</th><th></th></tr>
        ${codes.map((c) => { const [st, cls] = state(c); return `<tr data-id="${c.id}"><td class="mono"><strong>${esc(c.code)}</strong></td><td>${esc(c.label)}</td><td>${c.min_subtotal_cents ? money(c.min_subtotal_cents) : "—"}</td><td class="num">${c.used}${c.max_uses !== null ? ` / ${c.max_uses}` : ""}</td><td>${c.expires ? esc(String(c.expires).slice(0, 10)) : "—"}</td><td><span class="pill ${cls}">${st}</span></td><td class="num">${c.orders}</td><td class="num">${money(c.given_cents)}</td><td class="muted">${esc(c.note)}</td>
          <td class="row2" style="flex-wrap:nowrap"><button class="btn" data-copy="${esc(c.code)}">Copy</button><button class="btn" data-toggle="${c.active ? 0 : 1}">${c.active ? "Turn off" : "Turn on"}</button><button class="btn danger" data-del>Delete</button></td></tr>`; }).join("")}</table></div>` : `<p class="muted">No codes yet.</p>`}</div>`;
  const $ = (x) => document.getElementById(x);
  $("dcKind").onchange = () => { const k = $("dcKind").value; $("dcValue").placeholder = k === "percent" ? "%" : k === "vials" ? "e.g. 1" : "$"; $("dcValue").inputMode = k === "amount" ? "decimal" : "numeric"; $("dcValueLbl").textContent = k === "percent" ? "Percent off" : k === "vials" ? "How many vials free (the cheapest in the order)" : "Dollars off"; };
  $("dcGen").onclick = async () => { const r = await api("/discounts/new-code?prefix=" + encodeURIComponent($("dcCode").value.replace(/-.*$/, "").trim())); $("dcCode").value = r.code; };
  $("dcSave").onclick = async () => {
    const body = { code: $("dcCode").value, kind: $("dcKind").value, value: $("dcValue").value, minSubtotal: $("dcMin").value, minVials: $("dcMinVials").value, maxUses: $("dcUses").value, expires: $("dcExp").value, note: $("dcNote").value };
    if (!body.code.trim()) { const r = await api("/discounts/new-code"); body.code = r.code; }
    const r = await api("/discounts", { method: "POST", body });
    toast(`Code ${r.code} created`); paneDirty = false; discounts();
  };
  pane().querySelectorAll("tr[data-id]").forEach((tr) => {
    const id = tr.dataset.id;
    tr.querySelector("[data-copy]").onclick = (e) => navigator.clipboard?.writeText(e.target.dataset.copy).then(() => toast("Code copied"), () => toast("Copy failed"));
    tr.querySelector("[data-toggle]").onclick = async (e) => { await api("/discounts/" + id, { method: "PATCH", body: { active: e.target.dataset.toggle === "1" } }); discounts(); };
    tr.querySelector("[data-del]").onclick = async () => { if (!confirm("Delete this code? Orders that used it keep their discount.")) return; await api("/discounts/" + id, { method: "DELETE" }); toast("Deleted"); discounts(); };
  });
}

/* ---------- page setup: home page header, feature cards, vial look ---------- */
const CARD_ICONS = [["flask", "Flask"], ["doc", "Document"], ["key", "Key"], ["shield", "Shield"], ["truck", "Truck"], ["star", "Star"], ["lock", "Lock"], ["chat", "Chat"], ["box", "Box"], ["check", "Check"]];
const fileToData = (file) => new Promise((ok, no) => { const fr = new FileReader(); fr.onload = () => ok(fr.result); fr.onerror = () => no(new Error("Couldn't read the file")); fr.readAsDataURL(file); });
async function page() {
  const { settings: s } = await api("/settings");
  const own = isOwner();
  const vial = Object.assign({}, window.VIAL_DEFAULT, s.vial || {});
  let logoV = s.vialLogoV || 0, photoV = s.vialPhotoV || 1;
  const cards = (s.perks || []).concat(Array.from({ length: Math.max(0, 4 - (s.perks || []).length) }, () => ({ icon: "check", title: "", text: "" })));
  const inp = (id, label, val, extra = "") => `<div class="field"><label class="eyebrow" for="${id}">${label}</label><input id="${id}" value="${esc(val)}"${extra}${ro()}></div>`;
  const COLORS = [["cap", "Cap"], ["band", "Metal band & outline"], ["glass", "Glass"], ["label", "Label"], ["text", "Label name"], ["sub", "Label size text"], ["liquid", "Liquid line"]];
  pane().innerHTML = `<header><h1>Page setup</h1>${own ? `<button class="btn solid" id="pgSave">Save page setup</button>` : ""}</header>
    <div class="panel"><h2>Home page header</h2>
      ${inp("pg-eyebrow", "Small line above the headline", s.heroEyebrow)}
      ${inp("pg-headline", "Headline", s.headline)}
      <div class="field"><label class="eyebrow" for="pg-intro">Text under the headline</label><textarea id="pg-intro"${ro()}>${esc(s.intro)}</textarea></div></div>
    <div class="panel"><h2>Logo</h2>
      <p class="muted">Shown in the store header, on the PIN screen and in the admin and rep apps. The app icons use the cross mark from it.</p>
      <div class="row2" style="align-items:center;gap:1.25rem"><div style="padding:.6rem 1rem;background:#fff;border:1px solid var(--line);border-radius:10px"><img id="lgPrev" src="${s.siteLogoV ? "/site-logo?v=" + s.siteLogoV : "/brand-logo.png"}" alt="" style="height:3rem;width:auto;max-width:16rem;object-fit:contain;${s.siteLogoV ? "" : "opacity:.35"}"></div>
        <span class="muted" id="lgState">${s.siteLogoV ? "Logo is shown." : "Logo is off; the store name shows as text."}</span></div>
      ${own ? `<div class="row2"><input type="file" id="lg-file" accept="image/png,image/jpeg,image/webp"><button class="btn" type="button" id="lg-off"${s.siteLogoV ? "" : " hidden"}>Show the name as text instead</button><button class="btn" type="button" id="lg-restore"${s.siteLogoV ? " hidden" : ""}>Bring the logo back</button></div>` : ""}</div>
    <div class="panel"><h2>Feature cards</h2>
      <label class="chk"><input type="checkbox" id="pg-perksOn"${s.perksOn !== false ? " checked" : ""}${ro()}> Show the feature cards under the header</label>
      <p class="muted">Up to 6 cards. Leave a card's title and text empty to remove it.</p>
      <div class="stack" id="pgCards">${cards.slice(0, 6).map((c, i) => `<div class="cardrow" data-card>
        <div class="field"><label class="eyebrow">Icon</label><select data-c="icon"${ro()}>${CARD_ICONS.map(([v, l]) => `<option value="${v}"${c.icon === v ? " selected" : ""}>${l}</option>`).join("")}</select></div>
        <div class="field"><label class="eyebrow">Card ${i + 1} title</label><input data-c="title" value="${esc(c.title)}" maxlength="60"${ro()}></div>
        <div class="field"><label class="eyebrow">Text</label><input data-c="text" value="${esc(c.text)}" maxlength="160"${ro()}></div></div>`).join("")}</div>
      ${own && cards.length < 6 ? `<div><button class="linkbtn" type="button" id="pgAddCard">+ Add a card</button></div>` : ""}</div>
    <div class="panel"><h2>Vial look</h2>
      <p class="muted">How the drawn vial looks on every product that doesn't have its own picture. Each peptide can also have its own picture, logo or label color under Products &amp; prices → Manage.</p>
      <div class="two"><div class="stack">
        <div class="grid2"><div class="field"><label class="eyebrow" for="vl-shape">Shape</label><select id="vl-shape"${ro()}>${[["photo", "Photo of a real vial"], ["vial", "Drawn vial"], ["tall", "Drawn tall vial"], ["round", "Drawn rounded bottle"]].map(([v, l]) => `<option value="${v}"${vial.shape === v ? " selected" : ""}>${l}</option>`).join("")}</select></div>
</div>
        <div class="colors" data-photo-only><label><input type="color" data-vc="photoName" value="${esc(vial.photoName)}"${ro()}> Peptide name</label><label><input type="color" data-vc="photoMg" value="${esc(vial.photoMg)}"${ro()}> Size (mg)</label>
          <label class="chk" style="grid-column:1/-1"><input type="checkbox" id="vl-tint"${vial.photoTint ? " checked" : ""}${ro()}> Color the label (uses the Label, Label name and Label size colors below)</label></div>
        <div class="colors">${COLORS.map(([k, l]) => `<label${["cap", "band", "glass", "liquid"].includes(k) ? " data-drawn-only" : ""}><input type="color" data-vc="${k}" value="${esc(vial[k])}"${ro()}> ${l}</label>`).join("")}</div>
        <div class="field" data-photo-only><label class="eyebrow">Vial photo (JPG/PNG, square works best; under 5 MB)</label>
          <div class="row2">${own ? `<input type="file" id="vl-photo" accept="image/png,image/jpeg,image/webp"><button class="btn" type="button" id="vl-photoReset"${photoV > 1 ? "" : " hidden"}>Back to the standard photo</button>` : ""}</div></div>
        <div class="field"><label class="eyebrow">Logo on every vial label (JPG/PNG, under 1 MB) — the brand mark by default</label>
          <div class="row2">${own ? `<input type="file" id="vl-logo" accept="image/png,image/jpeg,image/webp"><button class="btn" type="button" id="vl-logoDel"${logoV ? "" : " hidden"}>No logo on vials</button><button class="btn" type="button" id="vl-logoRestore"${logoV ? " hidden" : ""}>Use the brand mark</button>` : ""}</div></div>
        ${own ? `<div><button class="btn" type="button" id="vl-reset">Back to the original colors</button></div>` : ""}
      </div>
      <div class="stack" style="justify-items:center"><div class="vialprev" id="vlPrev"></div><input id="vl-sample" value="BPC-157" style="height:2.2rem;padding:0 .6rem;border:1px solid var(--line-strong);border-radius:8px;width:9rem;text-align:center" title="Sample name for the preview"><span class="muted" style="font-size:.78rem">Live preview</span></div></div></div>
    ${own ? `<div><button class="btn solid" id="pgSave2">Save page setup</button></div>` : ""}`;
  const $ = (x) => document.getElementById(x);
  const readVial = () => { const v = { shape: $("vl-shape").value, labelShows: "name", photoTint: $("vl-tint").checked }; document.querySelectorAll("[data-vc]").forEach((i) => { v[i.dataset.vc] = i.value; }); return v; };
  const modeUI = () => { const photo = $("vl-shape").value === "photo"; document.querySelectorAll("[data-photo-only]").forEach((el) => { el.hidden = !photo; }); document.querySelectorAll("[data-drawn-only]").forEach((el) => { el.hidden = photo; }); };
  const preview = () => { modeUI(); const v = readVial(); $("vlPrev").innerHTML = window.drawVial({ title: $("vl-sample").value || "BPC-157", sub: "10 mg", style: v, logoUrl: logoV ? `/vial-logo?v=${logoV}` : "", photoUrl: `/vial-photo?v=${photoV}` }); };
  pane().oninput = (e) => { if (e.target.closest("[data-vc], #vl-shape, #vl-sample, #vl-tint")) preview(); };
  pane().onchange = (e) => { if (e.target.closest("#vl-shape, #vl-tint")) preview(); };
  preview();
  if (!own) return;
  $("vl-reset").onclick = () => { const d = window.VIAL_DEFAULT; document.querySelectorAll("[data-vc]").forEach((i) => { i.value = d[i.dataset.vc]; }); $("vl-shape").value = d.shape; preview(); toast("Original colors restored. Save to keep them."); };
  if ($("pgAddCard")) $("pgAddCard").onclick = () => {
    const rows = document.querySelectorAll("[data-card]"); if (rows.length >= 6) return;
    const r = rows[rows.length - 1].cloneNode(true); r.querySelectorAll("input").forEach((i) => { i.value = ""; }); $("pgCards").appendChild(r);
    r.querySelectorAll(".field label")[1].textContent = `Card ${rows.length + 1} title`;
  };
  $("lg-file").onchange = async (e) => {
    const f = e.target.files[0]; if (!f) return;
    if (f.size > 2 * 1024 * 1024) return toast("Keep the logo under 2 MB");
    await api("/site-logo", { method: "PUT", body: { fileData: await fileToData(f) } }); toast("Logo updated everywhere"); page();
  };
  $("lg-off").onclick = async () => { await api("/site-logo", { method: "DELETE" }); toast("Store name shows as text"); page(); };
  $("lg-restore").onclick = async () => { await api("/site-logo?restore=1", { method: "DELETE" }); toast("Logo is back"); page(); };
  $("vl-photo").onchange = async (e) => {
    const f = e.target.files[0]; if (!f) return;
    if (f.size > 5 * 1024 * 1024) return toast("Keep the photo under 5 MB");
    await api("/vial-photo", { method: "PUT", body: { fileData: await fileToData(f) } }); photoV++; $("vl-photoReset").hidden = false; preview(); toast("Vial photo updated");
  };
  $("vl-photoReset").onclick = async () => { await api("/vial-photo", { method: "DELETE" }); photoV = 1; $("vl-photoReset").hidden = true; $("vl-photo").value = ""; preview(); toast("Standard vial photo restored"); };
  $("vl-logo").onchange = async (e) => {
    const f = e.target.files[0]; if (!f) return;
    if (f.size > 1024 * 1024) return toast("Keep the logo under 1 MB");
    await api("/vial-logo", { method: "PUT", body: { fileData: await fileToData(f) } });
    logoV++; $("vl-logoDel").hidden = false; preview(); toast("Logo added to the vial");
  };
  $("vl-logoDel").onclick = async () => { await api("/vial-logo", { method: "DELETE" }); logoV = 0; $("vl-logoDel").hidden = true; $("vl-logoRestore").hidden = false; $("vl-logo").value = ""; preview(); toast("Vials show no logo"); };
  $("vl-logoRestore").onclick = async () => { await api("/vial-logo?restore=1", { method: "DELETE" }); logoV = 1; $("vl-logoDel").hidden = false; $("vl-logoRestore").hidden = true; preview(); toast("Brand mark is back on the vials"); };
  const save = async () => {
    const perks = [...document.querySelectorAll("[data-card]")].map((r) => ({ icon: r.querySelector('[data-c="icon"]').value, title: r.querySelector('[data-c="title"]').value.trim(), text: r.querySelector('[data-c="text"]').value.trim() }));
    await api("/settings", { method: "PUT", body: { heroEyebrow: $("pg-eyebrow").value, headline: $("pg-headline").value, intro: $("pg-intro").value, perksOn: $("pg-perksOn").checked, perks, vial: readVial() } });
    toast("Page setup saved");
  };
  $("pgSave").onclick = save; $("pgSave2").onclick = save;
}

/* ---------- settings ---------- */
async function settings(part = "site") {
  const { settings: s, stripe: st, mail: ml, baseUrl } = await api("/settings");
  const t = (k, label, help = "") => `<div class="field"><label class="eyebrow" for="s-${k}">${label}</label><input id="s-${k}" value="${esc(s[k])}"${ro()}>${help ? `<span class="muted">${help}</span>` : ""}</div>`;
  const ta = (k, label, help = "") => `<div class="field"><label class="eyebrow" for="s-${k}">${label}</label><textarea id="s-${k}"${ro()}>${esc(s[k])}</textarea>${help ? `<span class="muted">${help}</span>` : ""}</div>`;
  const site = baseUrl || location.origin;
  // which sending account is picked: what's saved, else Microsoft 365 (so the login boxes show right away), unless the host already has settings
  const prov0 = s.mailMode === "resend" ? "resend" : s.mailMode === "graph" ? "graph" : s.mailMode === "smtp" ? (/office365|outlook/i.test(s.mailHost || "") ? "microsoft" : /gmail|google/i.test(s.mailHost || "") ? "google" : "smtp") : (ml && ml.ready && ml.source === "host" ? "" : "graph");
  const emailPanel = `    <div class="panel"><h2>Order emails</h2>
      <p>${ml && ml.ready ? `<span class="pill st-shipped">Email connected</span> Sending through ${esc(ml.detail)} as ${esc(ml.from)}${ml.source === "host" ? " (from the settings on the host)" : ""}.` : `<span class="pill st-cancelled">Email not connected</span> Orders are saved here, but no emails go out until a sending account is saved below.`}</p>
      <div class="grid2">${t("orderEmail", "Send every order to", "You get a message for each new order and each card payment")}${t("cooEmail", "COO approval emails (case tracker) to", "Where the case tracker sends its facility / surgeon approvals; it uses the sending account below")}</div>
      <label class="chk"><input type="checkbox" id="s-orderEmailOn"${s.orderEmailOn ? " checked" : ""}${ro()}> Email me every order</label>
      <label class="chk"><input type="checkbox" id="s-customerEmailOn"${s.customerEmailOn ? " checked" : ""}${ro()}> Email the customer a confirmation (and a receipt when they pay by card)</label>
      <label class="chk"><input type="checkbox" id="s-repEmailOn"${s.repEmailOn !== false ? " checked" : ""}${ro()}> Email the customer's sales rep every order and update (with their commission on it)</label>
      <div class="row2" style="align-items:center"><label class="chk"><input type="checkbox" id="s-lowStockEmailOn"${s.lowStockEmailOn !== false ? " checked" : ""}${ro()}> Email every admin as soon as a product drops below</label><input id="s-lowStockAt" value="${esc(s.lowStockAt ?? 5)}" inputmode="numeric" style="width:4.5rem"${ro()}><span class="muted">units (once per product, again after it's restocked)</span></div>
      <h2 style="font-size:1.05rem;margin-top:.4rem">Sending account</h2>
      <p class="muted">How the store sends. <strong>Microsoft 365 app</strong> is the one to use here: no mailbox password, unaffected by MFA, and it can send straight from the shared noreply@ address. (The store's host blocks plain mail-server connections on its free plan, so the "mailbox login" option only works on a paid host plan and without MFA.)</p>
      <div class="grid2">
        <div class="field"><label class="eyebrow" for="s-mailProvider">Mail provider</label><select id="s-mailProvider"${ro()}>
          <option value="graph"${prov0 === "graph" ? " selected" : ""}>Microsoft 365 app (no password; works with MFA)</option>
          <option value="microsoft"${prov0 === "microsoft" ? " selected" : ""}>Microsoft 365 mailbox login (SMTP)</option>
          <option value="google"${prov0 === "google" ? " selected" : ""}>Google Workspace / Gmail</option>
          <option value="smtp"${prov0 === "smtp" ? " selected" : ""}>Other mail server (SMTP)</option>
          <option value="resend"${prov0 === "resend" ? " selected" : ""}>Resend (API key)</option>
          <option value=""${prov0 === "" ? " selected" : ""}>Not set here (use the host's settings)</option></select></div>
        <div class="field mail-graph"><label class="eyebrow" for="s-graphTenant">Directory (tenant) ID</label><input id="s-graphTenant" value="${esc(s.graphTenant)}" autocomplete="off" placeholder="xxxxxxxx-xxxx-…"${ro()}></div>
        <div class="field mail-graph"><label class="eyebrow" for="s-graphClient">Application (client) ID</label><input id="s-graphClient" value="${esc(s.graphClient)}" autocomplete="off" placeholder="xxxxxxxx-xxxx-…"${ro()}></div>
        <div class="field mail-graph"><label class="eyebrow" for="s-graphSecret">Client secret (value)</label><input id="s-graphSecret" type="password" autocomplete="new-password" placeholder="${s.graphSecretSet ? "•••••••• saved — type to change" : "Secret value from Certificates & secrets"}"${ro()}></div>
        <div class="field mail-smtp mail-graph"><label class="eyebrow" for="s-mailUser"><span class="mail-smtp">Login email</span><span class="mail-graph">Mailbox to send from</span></label><input id="s-mailUser" value="${esc(s.mailUser)}" autocomplete="off" placeholder="noreply@360medical.net"${ro()}></div>
        <div class="field mail-smtp"><label class="eyebrow" for="s-mailPass">Password</label><input id="s-mailPass" type="password" autocomplete="new-password" placeholder="${s.mailPassSet ? "•••••••• saved — type to change" : "Mailbox password"}"${ro()}></div>
        <div class="field mail-resend"><label class="eyebrow" for="s-resendKey">Resend API key</label><input id="s-resendKey" type="password" autocomplete="new-password" placeholder="${s.resendKeySet ? "•••••••• saved — type to change" : "re_…"}"${ro()}></div>
        <div class="field mail-smtp mail-resend mail-graph"><label class="eyebrow" for="s-mailFrom">From (optional)</label><input id="s-mailFrom" value="${esc(s.mailFrom)}" placeholder="360 Medical Peptides <noreply@360medical.net>"${ro()}><span class="muted">Blank = the login / mailbox address</span></div>
        <div class="field mail-smtp"><label class="eyebrow" for="s-mailHost">Mail server</label><input id="s-mailHost" value="${esc(s.mailHost)}"${ro()}></div>
        <div class="field mail-smtp"><label class="eyebrow" for="s-mailPort">Port</label><input id="s-mailPort" value="${esc(s.mailPort)}" inputmode="numeric"${ro()}></div></div>
      ${isOwner() ? `<div class="row2" style="align-items:center"><button class="btn solid" id="mailSave">Save sending account</button><button class="btn" id="mailTest">Send a test email</button>${s.mailPassSet || s.resendKeySet || s.graphSecretSet ? `<button class="btn" id="mailClear">Forget saved password / secret</button>` : ""}${s.graphSecretSet ? `<button class="btn" id="mailShow" title="For setting up the case tracker with the same Microsoft 365 app">Show app details</button>` : ""}<span class="muted" id="mailTestOut"></span></div><div id="mailShowOut"></div>` : ""}
      <details><summary style="cursor:pointer;font-weight:600">Help: Microsoft 365 app, mailbox login, Google, Resend</summary>
        <p class="muted" style="margin-top:.6rem"><strong>Microsoft 365 app (recommended):</strong> one-time setup by a Microsoft 365 admin, about 10 minutes.</p><ol class="muted" style="margin:.3rem 0 0 1.2rem;display:grid;gap:.35rem">
        <li>Go to <a href="https://entra.microsoft.com" target="_blank" rel="noopener">entra.microsoft.com</a> → Identity → Applications → <strong>App registrations</strong> → <strong>New registration</strong>. Name: <em>Peptide store mail</em>. Leave "single tenant" selected → Register.</li>
        <li>On the app's Overview page copy the <strong>Application (client) ID</strong> and the <strong>Directory (tenant) ID</strong> into the boxes above.</li>
        <li><strong>API permissions</strong> → Add a permission → Microsoft Graph → <strong>Application permissions</strong> → search <em>Mail.Send</em> → tick it → Add. Then click <strong>Grant admin consent for 360 Medical</strong> → Yes.</li>
        <li><strong>Certificates &amp; secrets</strong> → New client secret → Add → copy the <strong>Value</strong> column (not the ID) into the Client secret box above. Note its expiry (pick 24 months); you'll paste a new one then.</li>
        <li>Mailbox to send from: <span class="mono">noreply@360medical.net</span> (works for shared mailboxes). Click <strong>Send a test email</strong>.</li></ol>
        <p class="muted" style="margin-top:.4rem">Optional, for IT: limit the app to that one mailbox with an application access policy (New-ApplicationAccessPolicy in Exchange Online PowerShell).</p>
        <p class="muted" style="margin-top:.6rem"><strong>Microsoft 365 mailbox login (SMTP):</strong> pick Microsoft 365, enter a real mailbox's email and password. Shared mailboxes have no password: either use a real user that has <em>Send as</em> on the shared address (put the shared address in From), or send as the user's own address. If the test says the login was rejected, the tenant blocks app sign-ins (Security defaults / MFA) — ask your Microsoft admin to allow this mailbox, or use Resend.</p>
        <p class="muted" style="margin-top:.6rem"><strong>Google Workspace / Gmail:</strong> turn on 2-Step Verification, create an app password at myaccount.google.com/apppasswords and use it as the password.</p>
        <p class="muted" style="margin-top:.6rem"><strong>Resend</strong> (no mailbox password needed): sign up at resend.com, add and verify the domain 360medical.net with the DNS records they show, create an API key and paste it here with a From address on that domain.</p></details></div>`;
  if (part === "email") {
    pane().innerHTML = `<header><h1>Email &amp; approvals</h1></header>
      <p class="muted">One place for both apps' email. The <strong>Peptide store</strong> sends order emails with the account below; the <strong>Case tracker</strong> sends its facility / surgeon approval emails to the COO with the same account.</p>
      <h2 class="eyebrow" style="margin:.2rem 0 -.4rem">Peptide store</h2>${emailPanel}
      <h2 class="eyebrow" style="margin:.6rem 0 -.4rem">Case tracker</h2><div id="trackerMail" class="panel"><h2>Approval emails</h2><p class="muted">Loading…</p></div>`;
    trackerMailPanel();
  } else
  pane().innerHTML = `<header><h1>Site settings</h1></header>
    <div class="panel"><h2>Store</h2>
      <label class="chk"><input type="checkbox" id="s-storeOpen"${s.storeOpen ? " checked" : ""}${ro()}> Taking orders (untick to pause checkout)</label>
      <label class="chk"><input type="checkbox" id="s-showSoldOut"${s.showSoldOut ? " checked" : ""}${ro()}> Show "Sold out" and block orders when stock is 0</label>
      <div class="row2" style="flex-wrap:wrap;gap:.4rem .8rem;align-items:center;margin:.2rem 0 .4rem"><label class="eyebrow" for="s-stockDisplay" style="margin:0">What shoppers see about stock</label>
        <select id="s-stockDisplay"${ro()}>${[["none", "Nothing (default)"], ["low", "\"Only 3 left\" when low"], ["words", "\"In stock\" / \"Low stock\""], ["count", "The count (\"12 in stock\")"]].map(([k, l]) => `<option value="${k}"${(s.stockDisplay || "none") === k ? " selected" : ""}>${l}</option>`).join("")}</select>
        <span style="white-space:nowrap">Low = <input id="s-stockLowAt" value="${esc(s.stockLowAt ?? 5)}" inputmode="numeric" style="width:4rem;display:inline-block"${ro()}> or fewer</span></div>
      <p class="muted">Off (the default): the store never says sold out — orders still go through and the product's Available count goes negative (backordered) so you know what to ship later. Use the <strong>Store note</strong> column under Products to say something like "Sold out — ships in 2 weeks" on a product when you choose to.</p>
      <label class="chk"><input type="checkbox" id="s-pricesRequireLogin"${s.pricesRequireLogin ? " checked" : ""}${ro()}> Show prices and the cart only after a customer signs in with their PIN (each customer sees their own pricing)</label>
      <div style="margin:-.2rem 0 .4rem 1.6rem;display:flex;flex-wrap:wrap;gap:.4rem .8rem;align-items:center"><label class="chk" style="margin:0"><input type="checkbox" id="s-guestPricesOn"${s.guestPricesOn ? " checked" : ""}${ro()}> Visitors who aren't signed in still see prices and can order, at</label>
        <span style="white-space:nowrap"><input id="s-guestMarkup" value="${esc(s.guestMarkup ?? 0)}" inputmode="decimal" style="width:5rem;display:inline-block"${ro()}> % above the store price</span></div>
      <p class="muted" style="margin-top:0">Signed-in customers keep their own pricing. Example: store price $100 at +20% shows $120 to anyone not signed in.</p>
      <div class="grid2">${t("brand", "Store name", "Shown top left and in the footer")}${t("tagline", "Tagline (optional)")}${t("contact", "Contact for customers", "Phone, text or email")}
      ${t("distributorOf", "Brand you distribute", 'Shows "Authorized ___ distributor"')}${t("brandUrl", "Brand's website (https)")}</div>
      <div class="grid2">${t("priceNote", "Note under products")}
        <div class="field"><label class="eyebrow" for="s-minOrder">Minimum order $</label><input id="s-minOrder" value="${dollars(s.minOrderCents) || ""}" placeholder="None" inputmode="decimal"${ro()}></div></div></div>
    <div class="panel"><h2>Shipping &amp; local delivery</h2>
      <p class="muted">Customers (and sales reps) choose one at checkout. Shipping is charged; local delivery is free. Orders show which one was picked.</p>
      <div class="grid2">
        <div class="stack"><label class="chk"><input type="checkbox" id="s-shippingOn"${s.shippingOn ? " checked" : ""}${ro()}> Offer shipping</label>
          ${t("shippingLabel", "Shipping name shown", "e.g. FedEx shipping")}
          <div class="field"><label class="eyebrow" for="s-shippingAmt">Shipping charge $</label><input id="s-shippingAmt" value="${dollars(s.shippingCents)}" inputmode="decimal"${ro()}></div>
          <div class="field"><label class="eyebrow" for="s-shippingFree">Free shipping on orders over $ (optional)</label><input id="s-shippingFree" value="${s.shippingFreeOverCents ? dollars(s.shippingFreeOverCents) : ""}" placeholder="Never free" inputmode="decimal"${ro()}></div>
          ${t("shippingNote", "Note under it", "e.g. Ships in 1 to 3 business days")}
          ${t("fedexAccount", "FedEx account number", "Shown to staff on orders to ship, with a copy button. Customers never see it.")}</div>
        <div class="stack"><label class="chk"><input type="checkbox" id="s-deliveryOn"${s.deliveryOn ? " checked" : ""}${ro()}> Offer local delivery (free)</label>
          ${t("deliveryLabel", "Delivery name shown", "e.g. Local delivery")}
          ${t("deliveryNote", "Note under it", "e.g. Free in the McAllen area. We'll call to set a time.")}</div></div></div>
    <div class="panel"><h2>Payments</h2>
      <p>${st && st.ready ? `<span class="pill st-shipped">Stripe connected</span> ${st.mode === "live" ? "Live key: real cards are charged." : "Test key: only Stripe test cards work (4242 4242 4242 4242)."} ${st.webhook ? "Webhook secret set." : "No webhook secret yet (payments still record when the customer returns to the site; the webhook is the backup)."}` : `<span class="pill st-cancelled">Stripe not connected</span> Checkout takes order requests until the Stripe key is on the host.`}</p>
      <label class="chk"><input type="checkbox" id="s-cardPayments"${s.cardPayments ? " checked" : ""}${ro()}${st && st.ready ? "" : " disabled"}> Take card payments at checkout (Stripe)${st && st.ready ? "" : " — connect Stripe first"}</label>
      <p class="muted">With this on, the Checkout button becomes <strong>Pay with card</strong>: the customer pays on Stripe's secure page and the order marks itself <em>paid</em>. Off, customers submit order requests and you collect payment yourself; you can still send any unpaid order a card payment link from the order page.</p>
      ${ta("paymentInstructions", "What customers see after an order request", "Explain how you'll confirm and how they pay (shown when card payments are off)")}
      <details><summary style="cursor:pointer;font-weight:600">How to connect Stripe (one time)</summary><ol class="muted" style="margin:.6rem 0 0 1.2rem;display:grid;gap:.35rem">
        <li>Create the account at <a href="https://dashboard.stripe.com/register" target="_blank" rel="noopener">dashboard.stripe.com/register</a> with your business details and bank account. Stripe reviews what you sell; research peptides can be declined, so wait for the account to be approved before turning this on.</li>
        <li>In Stripe go to <strong>Developers → API keys</strong> and copy the <strong>Secret key</strong> (starts with <span class="mono">sk_live_</span>; use <span class="mono">sk_test_</span> to try it first).</li>
        <li>In Render open the <strong>peptide-store</strong> service → <strong>Environment</strong> → add <span class="mono">STRIPE_SECRET_KEY</span> = that key → Save. The service restarts by itself.</li>
        <li>Back in Stripe: <strong>Developers → Webhooks → Add endpoint</strong>, URL <span class="mono">${esc(site)}/api/stripe/webhook</span>, event <span class="mono">checkout.session.completed</span>. Copy its <strong>Signing secret</strong> (<span class="mono">whsec_…</span>) into Render as <span class="mono">STRIPE_WEBHOOK_SECRET</span>.</li>
        <li>Reload this page: it should say <em>Stripe connected</em>. Tick the box above and Save.</li></ol></details></div>
    ${part === "email" ? emailPanel : ""}
    ${isOwner() ? `<div class="panel" id="pinPanel"><h2>Site PIN</h2>
      <p class="muted">When on, nobody can see the store, products, prices or lab reports until they enter a PIN. Two kinds work: the <strong>shared PIN</strong> below, which anyone can use, and each customer's <strong>own PIN</strong>, which you give out under Customers. Admin stays open to you. Changing the shared PIN makes everyone using it enter the new one.</p>
      <label class="chk"><input type="checkbox" id="pinOn"> Require the PIN to view the store</label>
      <div class="row2" style="align-items:end"><div class="field" style="max-width:14rem"><label class="eyebrow" for="pinNew">New PIN (4 to 8 digits)</label><input id="pinNew" type="password" inputmode="numeric" autocomplete="new-password" placeholder="Leave blank to keep"></div>
      <button class="btn solid" type="button" id="pinSave">Save PIN setting</button></div>
      <span class="muted" id="pinState"></span>
      <div><button class="linkbtn" type="button" id="pinClear">Remove the shared PIN (only customers' own PINs will work)</button></div></div>` : ""}
    <div class="panel"><h2>Age gate</h2>
      <label class="chk"><input type="checkbox" id="s-ageGate"${s.ageGate ? " checked" : ""}${ro()}> Ask visitors to confirm age and research use before entering</label>
      <div class="field" style="max-width:10rem"><label class="eyebrow" for="s-minAge">Minimum age</label><input id="s-minAge" value="${esc(s.minAge)}" inputmode="numeric"${ro()}></div></div>
    <div class="panel"><h2>Automatic sign-out</h2>
      <p class="muted">So a phone or computer left signed in doesn't show one customer's account to the next person. The store always shows who is signed in with a "Not you? Sign out" link.</p>
      <div class="row2" style="align-items:end"><div class="field" style="max-width:12rem"><label class="eyebrow" for="s-custIdleMin">Customers: sign out after (minutes idle · 0 = as soon as they leave)</label><input id="s-custIdleMin" value="${esc(s.custIdleMin ?? 30)}" inputmode="numeric" placeholder="30"${ro()}></div>
      <label class="chk"><input type="checkbox" id="s-custCloseOut"${s.custCloseOut !== false ? " checked" : ""}${ro()}> Also sign customers out when they close the browser or app</label></div>
      <div class="field" style="max-width:12rem"><label class="eyebrow" for="s-staffIdleMin">Admin and rep app: sign out after (minutes idle)</label><input id="s-staffIdleMin" value="${esc(s.staffIdleMin ?? 720)}" inputmode="numeric" placeholder="720"${ro()}></div>
      <p class="muted">0 = never. Customers' saved sign-ins also expire after 14 days.</p></div>
    <div class="panel"><h2>Disclaimers &amp; policies</h2><p class="muted">One paragraph per line. Start a line with "Heading: " to show a bold heading. Have your attorney review these before you rely on them.</p>
      ${[["footerNotice", "Footer notice (every page)"], ["disclaimers", "Disclaimer"], ["policyTerms", "Terms of service"], ["policyReturns", "Refund and returns policy"], ["policyShipping", "Shipping policy"], ["policyPrivacy", "Privacy policy"]]
        .map(([k, label]) => `<div class="field"><label class="eyebrow" for="s-${k}">${label}</label><textarea id="s-${k}" style="min-height:12rem"${ro()}>${esc((s[k] || []).join("\n"))}</textarea></div>`).join("")}</div>
    ${isOwner() ? `<div><button class="btn solid" id="sSave">Save settings</button></div>` : `<p class="muted">Only the owner can change settings.</p>`}`;
  if (!isOwner()) return;
  if (part === "site") {
  const pin = await api("/pin");
  const pst = () => {
    const kinds = [pin.set ? "the shared PIN" : "", pin.customerPins ? `${pin.customerPins} customer PIN${pin.customerPins === 1 ? "" : "s"}` : ""].filter(Boolean).join(" and ");
    document.getElementById("pinState").textContent = pin.on ? (kinds ? `Locked. Visitors can get in with ${kinds}.` : "Locked, and no PINs are active, so nobody can get in. Give a customer a PIN or set a shared one.") : kinds ? `Turned off, so the store is open. Ready to use: ${kinds}.` : "No PINs yet. Set a shared PIN here, or give customers their own under Customers.";
    document.getElementById("pinClear").hidden = !pin.set;
  };
  document.getElementById("pinClear").onclick = async () => {
    if (!confirm("Remove the shared PIN? Only customers with their own PIN will be able to get in.")) return;
    await api("/pin", { method: "PUT", body: { on: document.getElementById("pinOn").checked && pin.customerPins > 0, clearShared: true } });
    Object.assign(pin, await api("/pin")); document.getElementById("pinOn").checked = pin.on; pst(); toast("Shared PIN removed");
  };
  document.getElementById("pinOn").checked = pin.on; pst();
  document.getElementById("pinSave").onclick = async () => {
    const on = document.getElementById("pinOn").checked, np = document.getElementById("pinNew").value.trim();
    if (np && !/^\d{4,8}$/.test(np)) return toast("The PIN must be 4 to 8 digits");
    if (on && !pin.set && !np && !pin.customerPins) return toast("Type a shared PIN, or give a customer a PIN first");
    await api("/pin", { method: "PUT", body: { on, pin: np } });
    Object.assign(pin, await api("/pin")); document.getElementById("pinNew").value = ""; pst();
    toast(on ? "Store locked with PIN" : "PIN turned off");
  };
  document.getElementById("sSave").onclick = async () => {
    const v = (k) => document.getElementById("s-" + k) || { value: Array.isArray(s[k]) ? s[k].join("\n") : (s[k] ?? ""), checked: !!s[k] }; // email fields live on the Email & approvals page: keep what's saved
    const body = {};
    ["brand", "tagline", "contact", "distributorOf", "brandUrl", "paymentInstructions", "priceNote", "shippingLabel", "shippingNote", "fedexAccount", "deliveryLabel", "deliveryNote", "orderEmail", "cooEmail"].forEach((k) => { body[k] = v(k).value; });
    ["storeOpen", "pricesRequireLogin", "ageGate", "shippingOn", "deliveryOn", "cardPayments", "orderEmailOn", "customerEmailOn", "repEmailOn", "lowStockEmailOn", "showSoldOut", "guestPricesOn"].forEach((k) => { body[k] = v(k).checked; });
    body.guestMarkup = v("guestMarkup").value; body.stockDisplay = v("stockDisplay").value; body.stockLowAt = v("stockLowAt").value;
    body.lowStockAt = v("lowStockAt").value;
    body.minAge = v("minAge").value; body.custIdleMin = v("custIdleMin").value; body.staffIdleMin = v("staffIdleMin").value; body.custCloseOut = v("custCloseOut").checked;
    const cents = (id) => Math.max(0, Math.round(parseFloat(String(v(id).value).replace(/[$,]/g, "") || 0) * 100));
    body.minOrderCents = cents("minOrder"); body.shippingCents = cents("shippingAmt"); body.shippingFreeOverCents = cents("shippingFree");
    ["footerNotice", "disclaimers", "policyTerms", "policyReturns", "policyShipping", "policyPrivacy"].forEach((k) => { body[k] = v(k).value.split("\n").map((x) => x.trim()).filter(Boolean); });
    // the promo banner has its own page (Promo banner); Site settings leaves it alone
    if (!v("shippingOn").checked && !v("deliveryOn").checked && !confirm("Neither shipping nor delivery is offered: checkout will say shipping is confirmed with the order. Save anyway?")) return;
    await api("/settings", { method: "PUT", body }); toast("Settings saved"); paneDirty = false;
  };
  } // end of the site-only handlers
  const prov = document.getElementById("s-mailProvider");
  const mailFields = () => { if (!prov) return;
    const p = prov.value;
    const isSmtp = p === "microsoft" || p === "google" || p === "smtp";
    pane().querySelectorAll(".mail-smtp, .mail-resend, .mail-graph").forEach((el) => { el.hidden = !((el.classList.contains("mail-smtp") && isSmtp) || (el.classList.contains("mail-resend") && p === "resend") || (el.classList.contains("mail-graph") && p === "graph")); });
    const host = document.getElementById("s-mailHost"), port = document.getElementById("s-mailPort");
    if (p === "microsoft") { host.value = "smtp.office365.com"; port.value = "587"; }
    if (p === "google") { host.value = "smtp.gmail.com"; port.value = "465"; }
    host.readOnly = port.readOnly = p === "microsoft" || p === "google";
  };
  mailFields(); if (prov) prov.onchange = mailFields;
  const mailBody = () => {
    const v = (k) => document.getElementById("s-" + k);
    const p = prov.value;
    return { mailMode: p === "resend" ? "resend" : p === "graph" ? "graph" : p ? "smtp" : "", mailHost: v("mailHost").value, mailPort: v("mailPort").value, mailUser: v("mailUser").value, mailPass: v("mailPass").value, mailFrom: v("mailFrom").value, resendKey: v("resendKey").value,
      graphTenant: v("graphTenant").value, graphClient: v("graphClient").value, graphSecret: v("graphSecret").value,
      orderEmail: v("orderEmail").value, cooEmail: v("cooEmail").value, orderEmailOn: v("orderEmailOn").checked, customerEmailOn: v("customerEmailOn").checked, repEmailOn: v("repEmailOn").checked, lowStockEmailOn: v("lowStockEmailOn").checked, lowStockAt: v("lowStockAt").value };
  };
  if (document.getElementById("mailSave")) document.getElementById("mailSave").onclick = async () => {
    const b = mailBody();
    if (b.mailMode === "smtp" && (!b.mailUser || (!b.mailPass && !s.mailPassSet))) return toast("Enter the login email and password");
    if (b.mailMode === "resend" && !b.resendKey && !s.resendKeySet) return toast("Paste the Resend API key");
    if (b.mailMode === "graph" && (!b.graphTenant || !b.graphClient || !b.mailUser || (!b.graphSecret && !s.graphSecretSet))) return toast("Enter the tenant ID, client ID, secret and the mailbox");
    await api("/settings", { method: "PUT", body: b }); toast("Sending account saved"); paneDirty = false; settings(part);
  };
  if (document.getElementById("mailClear")) document.getElementById("mailClear").onclick = async () => {
    if (!confirm("Forget the saved mail password / API key? The store stops sending until a new one is saved (unless the host has its own settings).")) return;
    await api("/mail/clear", { method: "POST" }); toast("Forgotten"); settings(part);
  };
  if (document.getElementById("mailShow")) document.getElementById("mailShow").onclick = async () => {
    const d = await api("/mail/secret");
    const row = (l, v) => `<tr><td class="eyebrow" style="padding:.3rem .6rem .3rem 0;white-space:nowrap">${l}</td><td class="mono" style="padding:.3rem 0;word-break:break-all">${esc(v || "—")}</td><td style="padding:.3rem 0 .3rem .6rem"><button class="btn" type="button" data-copy="${esc(v || "")}">Copy</button></td></tr>`;
    document.getElementById("mailShowOut").innerHTML = `<div class="panel" style="border-color:var(--blue);margin-top:.6rem"><p class="muted">Paste these into the case tracker: Admin → Approval emails. Keep the secret private.</p><table>${row("Tenant ID", d.tenant)}${row("Client ID", d.client)}${row("Client secret", d.secret)}${row("Mailbox", d.mailbox)}${row("From", d.from)}</table><div><button class="btn" type="button" id="mailHide">Hide</button></div></div>`;
    document.querySelectorAll("#mailShowOut [data-copy]").forEach((b) => (b.onclick = () => navigator.clipboard?.writeText(b.dataset.copy).then(() => toast("Copied"), () => toast("Copy failed"))));
    document.getElementById("mailHide").onclick = () => { document.getElementById("mailShowOut").innerHTML = ""; };
  };
  if (document.getElementById("mailTest")) document.getElementById("mailTest").onclick = async () => {
    const b = document.getElementById("mailTest"), out = document.getElementById("mailTestOut");
    const body = mailBody();
    if (body.mailMode === "smtp" && (!body.mailUser || (!body.mailPass && !s.mailPassSet))) { out.textContent = "Enter the login email and password first, then test."; return; }
    if (body.mailMode === "resend" && !body.resendKey && !s.resendKeySet) { out.textContent = "Paste the Resend API key first, then test."; return; }
    if (body.mailMode === "graph" && (!body.graphTenant || !body.graphClient || !body.mailUser || (!body.graphSecret && !s.graphSecretSet))) { out.textContent = "Enter the tenant ID, client ID, secret and the mailbox first, then test."; return; }
    b.disabled = true; out.textContent = "Saving and sending…";
    try {
      if (body.mailMode) await api("/settings", { method: "PUT", body }); // test what's on screen
      const r = await api("/mail/test", { method: "POST", body: { to: document.getElementById("s-orderEmail").value } });
      out.textContent = `Sent to ${r.to}. Check the inbox (and spam).`;
      pane().querySelectorAll("#s-mailPass, #s-graphSecret, #s-resendKey").forEach((ms) => { if (ms.value) { ms.value = ""; ms.placeholder = "•••••••• saved — type to change"; } });
    } catch (e) { out.textContent = "Not sent: " + e.message; }
    finally { b.disabled = false; }
  };
}

const setup = () => settings("email");
// the case tracker's approval emails, managed from here (on/off, test, previews); its sender and COO address are the store's
async function trackerMailPanel() {
  const box = document.getElementById("trackerMail"); if (!box) return;
  if (!HUB.linked) { box.innerHTML = `<h2>Approval emails</h2><p class="muted">The case tracker isn't linked to this store yet (HUB_SECRET / TRACKER_URL on the host).</p>`; return; }
  const r = await api("/hub/settings").catch((e) => ({ ok: false, error: e.message }));
  if (!r.ok) { box.innerHTML = `<h2>Approval emails</h2><div class="err">Case tracker: ${esc(r.error || "not reachable")}</div>`; return; }
  box.innerHTML = `<h2>Approval emails</h2>
    <p class="muted">When a rep adds a facility or a surgeon in the case tracker, the COO gets an email with a one-tap <strong>Approve</strong> button. It goes to the <strong>COO approval emails</strong> address above and sends with the store's sending account${r.viaHub ? "" : " once that's a Microsoft 365 app"}.</p>
    <label class="chk"><input type="checkbox" id="tmOn"${r.mailOn ? " checked" : ""}> Send approval emails</label>
    <p class="muted" id="tmInfo">${esc(r.info || "")}</p>
    <div class="row2" style="align-items:center"><button class="btn" id="tmTest" type="button">Send a test to the COO</button><a class="btn" id="tmPrevF" href="#" target="_blank" rel="noopener" style="display:inline-grid;place-items:center;text-decoration:none">Preview facility email</a><a class="btn" id="tmPrevS" href="#" target="_blank" rel="noopener" style="display:inline-grid;place-items:center;text-decoration:none">Preview surgeon email</a><a class="btn" href="/admin/go/tracker?next=/admin" target="_blank" rel="noopener" style="display:inline-grid;place-items:center;text-decoration:none">Open the tracker admin ↗</a><span class="muted" id="tmOut"></span></div>`;
  document.getElementById("tmOn").onchange = async (e) => { try { await api("/hub/settings", { method: "PUT", body: { mailOn: e.target.checked } }); toast(e.target.checked ? "Approval emails on" : "Approval emails off"); } catch (x) { e.target.checked = !e.target.checked; } };
  document.getElementById("tmTest").onclick = async () => { const o = document.getElementById("tmOut"); o.textContent = "Sending…"; try { const t = await api("/hub/mail-test", { method: "POST" }); o.textContent = `Sent to ${t.to}. Check the inbox (and spam).`; } catch (x) { o.textContent = "Not sent: " + x.message; } };
  for (const [id, kind] of [["tmPrevF", "facility"], ["tmPrevS", "surgeon"]]) document.getElementById(id).onclick = async (e) => { e.preventDefault(); const { url } = await api("/hub/preview-url?kind=" + kind); window.open(url, "_blank", "noopener"); };
}
/* ---------- geofencing: the case tracker's own card, shown here ---------- */
function geo() {
  pane().innerHTML = `<header><h1>Geofencing</h1></header>
    ${HUB.linked ? `<p class="muted">Visit geofencing lives in the case tracker; this is its card. Changes save there.</p><iframe class="hubframe" title="Visit geofencing" src="/admin/go/tracker?next=${encodeURIComponent("/admin?embed=1&card=geo-card")}" style="width:100%;height:calc(100vh - 9rem);min-height:32rem;border:0;border-radius:14px;background:var(--card)"></iframe>` : `<p class="muted">The case tracker isn't linked to this store yet.</p>`}`;
}
/* ---------- how to: how the whole thing works, in plain words — written for the reader's own role ---------- */
function howto() {
  const TAG = { store: '<span class="pill st-confirmed" style="margin-left:.5rem;font-size:.66rem;vertical-align:middle">Peptide store</span>', tracker: '<span class="pill st-delivered" style="margin-left:.5rem;font-size:.66rem;vertical-align:middle">Case tracker</span>', both: '<span class="pill st-shipped" style="margin-left:.5rem;font-size:.66rem;vertical-align:middle">Both apps</span>' };
  const who = isOwner() ? "owner" : isRep() ? "rep" : "staff";
  const b = (x) => `<strong>${x}</strong>`;
  const ul = (items) => `<ul class="muted" style="margin:.2rem 0 0 1.2rem;display:grid;gap:.35rem">${items.map((x) => `<li>${x}</li>`).join("")}</ul>`;
  const sec = (title, app, items) => `<div class="panel"><h2>${title}${TAG[app]}</h2>${ul(items)}</div>`;
  const S = [];
  // ---- getting around (everyone, worded for the role)
  S.push(sec("Getting around", "both", [
    `${b("Two rows of switches")} under the logo. Top row: which app you're in (Peptide store / Case tracker). Second row: which view (${who === "rep" ? "Store, Rep, Tracker — Admin is for admins" : "Admin, Store, Rep, Tracker"}). The one you're in is green. They all keep your login — no second sign-in.`,
    who === "rep" ? `${b("Below the line")} in the menu is the same on every page of both apps: Apps & downloads, How to, My account.` : `${b("Above the line")} in the menu is this app's own work. ${b("Below the line")} is the same on every page of both apps: ${who === "owner" ? "Team logins, Email & approvals, Geofencing, " : ""}Apps & downloads, How to, My account.`,
    `${b("Panels start collapsed.")} Click a heading to open it; it stays open on this device until you close it. Alt+Shift+C opens or folds everything on a page. The ${b("« »")} button at the top of the menu hides and shows the menu.`,
    `${b("Phones:")} each app installs from Apps & downloads (Add to Home Screen / Install). Everything works the same on a phone, with the menu behind the Menu button.`
  ]));
  S.push(sec("Signing in", "both", [
    `${b("Email + password")} or ${b("Name + PIN")} (the toggle on the sign-in screen). Your PIN is under My account${who === "owner" ? " (or set by an admin under Team logins)" : ""}. The same login works on the store, the rep app and the case tracker — the PIN also opens the storefront as the office.`,
    who === "rep" ? `On the case tracker's own sign-in page, pick your name and type the same PIN.` : `${b("Store PIN")} (Site settings → Site PIN) lets anyone in the office into the storefront; customers get their own PINs under Customers. The tracker's COO PIN is a back door for the tracker only.`
  ]));
  // ---- store side
  if (who === "rep") {
    S.push(sec("Your customers & orders", "store", [
      `${b("Customers")}: add your customers (name, address, email optional). Orders from your customers earn your commission whether you place them or they order on the store themselves. Ask the office to give a customer a PIN or special pricing.`,
      `${b("New order")}: pick the customer, add products, send. The office confirms the total, marks it paid and ships it; you'll see the status change under Orders.`,
      `${b("Orders")}: every order from your customers with its status — New → Confirmed → Paid → Shipped / Delivered. You can add a note or send a card-payment link; the office changes the order itself.`
    ]));
    S.push(sec("Your commission", "store", [
      `You earn your rate on the product total after any discount, before shipping. ${b("Pending")} until the office marks the order paid → ${b("Earned")} → ${b("Paid")} when the office pays it out. Cancelled orders earn nothing.`,
      `${b("Commissions")} shows every order line with its status, this month's totals, and your payouts.`
    ]));
  } else {
    S.push(sec("Orders", "store", [
      `Orders arrive from the storefront, the rep app, or ${b("New order")} here. Flow: ${b("New")} → ${b("Confirmed")} (you've sent the total and how to pay) → ${b("Paid")} → ${b("Shipped")} (carrier + tracking) or ${b("Delivered")}. Card payments through Stripe arrive already paid.`,
      `Open an order to ${b("Edit")} (lines, quantities, address, phone — totals recalculate and an "order updated" email goes out)${who === "owner" ? ` or ${b("Delete")} it (stock goes back)` : ""}. Every status change can email the customer.`,
      `${b("Stock")} comes off when an order is placed and goes back if it's cancelled; stock held by unshipped orders shows as "In orders".`
    ]));
    S.push(sec("Customers & pricing", "store", [
      `Add a customer with a name, address and (optional) email. Give them a ${b("PIN")} so they can sign in and see their pricing; revoke it any time.`,
      `${b("Markup")} per customer sets their price from cost${who === "owner" ? " (the store default is under Products & prices → Pricing)" : ""}. Assign a ${b("Sales rep")} so their orders earn commission.`,
      who === "owner" ? `${b("Discount codes")} come off the product subtotal before shipping; commissions are paid on the discounted amount.` : `Discount codes are set by an admin; they come off the product subtotal before shipping.`
    ]));
    S.push(sec("Products, descriptions & lab reports", "store", [
      `${b("Products & prices")}: name, size, category, manufacturer${who === "owner" ? ", cost (never shown on the store), price" : ""}, stock, max per order, sort, active. ${b("Import from file")} takes a CSV/Excel; download the current list as the template first.`,
      `${b("Descriptions")}: first line is what's in the vial (e.g. "BPC-157 10 mg + TB-500 10 mg"); each line starting with "-" is a benefit bullet on the store card.`,
      `${b("Lab reports")}: choose the report file first and the form fills itself (PDF text, or reading the picture); check it against the document, then Save. A report attaches to a product when the peptide name, size and manufacturer match.`
    ]));
    S.push(sec("Inventory", "store", [
      `${b("Stock")} tab: on shelf, in orders, available, weeks left (from the last 30 days of sales), low / out / expiring. Low means at or below the reorder point (5 unless set).`,
      `${b("Receive shipment")} adds stock with lot, expiry${who === "owner" ? " and cost each (cost averages into the product cost)" : ""}. ${b("Adjust")} for damaged, expired, lost, samples, returns.`,
      `${b("Count sheet")} (weekly): type what's physically on the shelf; posting it creates a ${b("Reconciliation")} with expected vs counted and the variance. ${b("Upload quantities")} does the same from a CSV/Excel file — or adds to stock as a shipment — with a preview before anything posts.`,
      `${b("Activity log")}: every stock movement with who, when, why and the reference.`
    ]));
    if (who === "owner") S.push(sec("Sales reps & commissions", "store", [
      `Reps use the ${b("Rep app")}: their own customers, orders and commission. Every order from one of their customers earns their rate on the product total after discount, before shipping — whether they placed it or the customer did.`,
      `${b("Pending")} until the order is paid → ${b("Earned")} → ${b("Paid")} when you include it in a payout (Commissions → pick the earned lines → Pay out). Cancelled orders are void.`,
      `${b("Combined / Peptide store / Case tracker")} on the Commissions page: the combined view lines up each rep's store commission with their case-tracker commission for the month; goals and targets stay separate per app.`,
      `${b("Admins in the rep app:")} a "Viewing as" picker shows the app exactly as that rep sees it.`
    ]));
  }
  // ---- tracker side
  if (who === "rep") S.push(sec("Case tracker (360 Medical)", "tracker", [
    `${b("Log a case")}: surgeon, facility, product, amount, status. Completed / PO / invoiced / paid cases count toward your quota; scheduled ones show as booked ahead.`,
    `Your page shows ${b("pace to quota")}, the run-rate projection, the quarter, any carried shortfall and your ${b("commission plan")} (rate above a floor, draw or base salary) with this month's estimate.`,
    `${b("Target visits")}: open the app when you arrive — inside the check-in window your location is checked against the facility and the visit is verified. Keep the app open during the visit; leaving early is noticed.`,
    `Adding a ${b("facility or surgeon")} sends the COO an approval; until it's approved, visits there can't be verified.`,
    `${b("Calendar / Upcoming")}: your planned visits and cases; "Add to my phone calendar" subscribes your phone to them.`
  ]));
  else S.push(sec("Case tracker (360 Medical)", "tracker", [
    `Reps log ${b("cases")} (surgeon, facility, product, amount); completed / PO / invoiced / paid cases count toward quota. The tracker shows pace to quota, run-rate projection, the quarter, carried shortfalls and the commission plan (rate above a floor, draw or base salary).`,
    `${b("Target visits")} are verified by the phone's location inside the check-in window; leaving early is noticed.${who === "owner" ? ` Switches are under ${b("Geofencing")} below the line; each facility can have its own radius.` : ""}`,
    `When a rep adds a ${b("facility or surgeon")}, the COO gets an approval email with a one-tap Approve button${who === "owner" ? " (Email & approvals controls it)" : ""}.`,
    `Tracker Admin: reps and plans, visits, surgeons, facilities, price book, alert settings, close a month, weekly digest, backup.`
  ]));
  // ---- shared pages
  if (who === "owner") S.push(sec("Team logins (one list of people)", "both", [
    `Add a person once: name, email, role (${b("Admin")} = everything; ${b("Manager")} = orders, customers, products, inventory, settings, no costs or logins; ${b("Sales rep")} = their own customers, orders, commission), optional PIN, and which apps they get: ${b("Peptide store")} and/or ${b("Case tracker")}.`,
    `Tick Case tracker and they appear in the tracker automatically (reps get a plan row to fill in). Untick to switch them off there. Reps that exist only in the tracker show up here to import in one click.`,
    `Changing someone's role or password signs them out everywhere. Turning a login off ends their access right away.`
  ]));
  S.push(sec(who === "owner" ? "Email & approvals, Apps, Geofencing, My account" : "Apps & My account", "both", [
    ...(who === "owner" ? [`${b("Email & approvals")}: the store's order emails and sending account (Microsoft 365 app), the COO address, and the tracker's approval emails (on/off, test, previews) — one page for both apps.`, `${b("Geofencing")}: the tracker's visit-verification switches.`] : []),
    `${b("Apps & downloads")}: every app with open / install links.`,
    `${b("My account")}: your password and PIN.`
  ]));
  const roleName = who === "owner" ? "an admin" : who === "rep" ? "a sales rep" : "a manager";
  pane().innerHTML = `<header><h1>How to</h1></header>
    <p class="muted">Two apps, one login: the ${b("Peptide store")} and the ${b("Case tracker")}. This guide is written for ${b(roleName)} — it only covers what you can do. Each section is tagged with the app it belongs to: ${TAG.store.replace("margin-left:.5rem;", "")} ${TAG.tracker.replace("margin-left:.5rem;", "")} ${TAG.both.replace("margin-left:.5rem;", "")}. Click a heading to open it.</p>
    ${S.join("")}`;
}
/* ---------- apps & downloads: every app in one place ---------- */
function apps() {
  const tr = HUB.linked;
  const card = (title, what, who, open, install) => `<div class="panel"><h2>${title}</h2><p class="muted">${what}</p><p class="muted"><strong>Who:</strong> ${who}</p><div class="row2">${open}${install || ""}</div></div>`;
  const link = (href, label, ext) => `<a class="btn" href="${href}"${ext ? ' target="_blank" rel="noopener"' : ""} style="display:inline-grid;place-items:center;text-decoration:none">${label}</a>`;
  pane().innerHTML = `<header><h1>Apps &amp; downloads</h1></header>
    <p class="muted">Each app installs from its own page on a phone or computer (Add to Home Screen / Install). One login works across all of them${tr ? "" : " once the case tracker is linked"}.</p>
    ${card("360 Peptides admin", "Orders, customers, products, inventory, commissions, team logins — this app.", "Admins and managers", link("/admin", "Open"), `<button class="btn solid" data-install type="button">Install on this device</button>`)}
    ${card("360 Peptides store", "The customer-facing store and lab reports.", "Customers (and the office, with the store PIN)", link("/", "Open the store", true) + link("/lab-reports", "Lab reports", true), `<span class="muted">Install from the store page's <strong>Download app</strong> button.</span>`)}
    ${card("Rep app", "Sales reps' customers, orders and commissions on a phone.", "Sales reps", link("/rep", "Open the rep app", true), `<span class="muted">Install from the rep app's <strong>Download app</strong> button.</span>`)}
    ${card("360 Medical case tracker", "Surgical cases, quotas, pace and commission plans for the medical reps.", "Medical reps and the COO", tr ? link("/admin/go/tracker?next=/", "Open the tracker", true) + link("/admin/go/tracker?next=/download", "Download page", true) : `<span class="muted">Not linked yet.</span>`)}
    ${card("360 Medical tracker admin", "Reps and plans, visits, surgeons, facilities, approvals.", "COO and managers", tr ? link("/admin/go/tracker?next=/admin", "Open the tracker admin", true) + link("/admin/go/tracker?next=/admin/download", "Download page", true) : `<span class="muted">Not linked yet.</span>`)}`;
}
/* ---------- staff ---------- */
let staffPick = null;
async function staff() {
  const PLAN_ON = isOwner() ? await api("/commissions/plan").then((j) => j.on).catch(() => false) : false;
  if (!isOwner()) return dashboard();
  const { users } = await api("/users");
  const ROLE = { owner: "Admin", staff: "Manager", rep: "Sales rep" };
  const roleSel = (cur, id) => `<select ${id ? `id="${id}"` : 'data-k="role" style="min-width:7.5rem"'}>${Object.entries(ROLE).map(([k, l]) => `<option value="${k}"${cur === k ? " selected" : ""}>${l}</option>`).join("")}</select>`;
  if (!users.some((u) => String(u.id) === String(staffPick))) staffPick = (users.find((u) => u.role === "rep") || users[0] || {}).id;
  const appsOf = (u) => ({ store: !u.apps || u.apps.store !== false, tracker: u.apps && u.apps.tracker !== undefined ? !!u.apps.tracker : u.role === "owner" });
  const optLabel = (u) => `${u.name}${u.active ? "" : " (off)"}${u.id === me.id ? " · you" : u.signed_in ? " · signed in" : ""}`;
  const u = users.find((x) => String(x.id) === String(staffPick));
  const F = (label, html, wide) => `<div class="field" style="margin:0${wide ? ";grid-column:1/-1" : ""}"><span class="eyebrow">${label}</span>${html}</div>`;
  const card = !u ? '<p class="muted">No logins yet.</p>' : (() => { const ap = appsOf(u); return `<div class="panel" data-id="${u.id}" data-role="${u.role}" style="margin-top:.6rem">
      <div class="row2" style="justify-content:space-between;align-items:center;flex-wrap:wrap;gap:.4rem;margin-bottom:.6rem"><div><strong style="font-size:1.05rem">${esc(u.name)}</strong> <span class="muted">${esc(u.email)}</span>${u.role === "rep" ? ` <span class="muted">· ${u.customers} customer${u.customers === 1 ? "" : "s"}</span>` : ""}</div>
        <div class="row2" style="gap:.4rem"><button class="btn solid" data-save>Save</button>${u.id === me.id ? "" : '<button class="btn danger" data-del title="Delete this login for good">Delete</button>'}</div></div>
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,12.5rem),1fr));gap:.7rem 1rem;align-items:end">
        ${F("Name", `<input data-k="name" value="${esc(u.name)}">`)}
        ${F("Role", roleSel(u.role))}
        ${F("Phone", `<input data-k="phone" value="${esc(u.phone || "")}">`)}
        ${F("Commission", planPick(u, PLAN_ON, u.role === "rep").replace("justify-content:flex-end", "justify-content:flex-start") + (u.role === "rep" ? "" : '<span class="muted" data-noplan>— (reps only)</span>'))}
        ${F("PIN", `<input data-k="pin" inputmode="numeric" placeholder="${u.pin_set ? "Set · type to change" : "4–10 digits"}" title="Name + PIN sign-in for both apps">`)}
        ${F("New password", `<input data-k="password" type="password" placeholder="Leave blank to keep" autocomplete="new-password">`)}
        ${F("Apps", `<div class="row2" style="gap:.2rem 1rem;flex-wrap:wrap"><label class="chk"><input type="checkbox" data-app="store"${ap.store ? " checked" : ""}> Peptide store</label><label class="chk"><input type="checkbox" data-app="tracker"${ap.tracker ? " checked" : ""}> Case tracker</label></div>`)}
        ${F("Status", `<label class="chk"><input type="checkbox" data-k="active"${u.active ? " checked" : ""}${u.id === me.id ? " disabled" : ""}> Active</label>`)}
      </div></div>`; })();
  const grp = (role, label) => { const l = users.filter((x) => x.role === role); return l.length ? `<optgroup label="${label} (${l.length})">${l.map((x) => `<option value="${x.id}"${String(x.id) === String(staffPick) ? " selected" : ""}>${esc(optLabel(x))}</option>`).join("")}</optgroup>` : ""; };
  pane().innerHTML = `<header><h1>Team logins</h1></header>
    <div id="trackerImport"></div>
    <details class="muted" style="margin:.2rem 0 .6rem"><summary>How logins work</summary><p>One login for both apps: tick <strong>Peptide store</strong> and/or <strong>Case tracker</strong> per person. A <strong>PIN</strong> lets them sign in by name + PIN on either app (email + password always works too). <strong>Admin</strong> can do everything (prices, costs, settings, logins, deleting orders). <strong>Manager</strong> works orders, customers, products, inventory and settings but can't see costs, change prices or manage logins. <strong>Sales rep</strong> signs in to the admin or the <a href="/rep" target="_blank" rel="noopener">rep app</a> and sees only their own customers, orders and commission. Changing someone's role or password signs them out everywhere.</p></details>
    <div class="row2" style="align-items:end;gap:.6rem;flex-wrap:wrap"><div class="field" style="margin:0;flex:1 1 18rem;max-width:28rem"><label class="eyebrow" for="staffPick">Person (${users.length})</label><select id="staffPick">${grp("rep", "Sales reps")}${grp("staff", "Managers")}${grp("owner", "Admins")}</select></div><button class="btn" type="button" onclick="const n=document.getElementById('nu-n'),c=n.closest('.folded');if(c){const h=c.querySelector('.fold-h,.fold-head');if(h)h.click();else c.classList.remove('folded')}n.scrollIntoView({behavior:'smooth',block:'center'});n.focus()">+ Add a login</button></div>
    <div id="ut">${card}</div>
    <div class="panel"><h2>Add a login</h2><div class="grid2">
      <div class="field"><label class="eyebrow" for="nu-n">Name</label><input id="nu-n"></div>
      <div class="field"><label class="eyebrow" for="nu-e">Email (their login)</label><input id="nu-e" type="email"></div>
      <div class="field"><label class="eyebrow" for="nu-p">Temporary password (8+ characters)</label><input id="nu-p" type="password" autocomplete="new-password"></div>
      <div class="field"><label class="eyebrow" for="nu-r">Role</label>${roleSel("staff", "nu-r")}</div>
      <div class="field"><label class="eyebrow" for="nu-ph">Phone (optional)</label><input id="nu-ph"></div>
      <div class="field" id="nu-rateWrap" hidden><label class="eyebrow" for="nu-plan">Commission</label><div class="row2" style="flex-wrap:nowrap;align-items:center;gap:.3rem"><select id="nu-plan"><option value="tiered">Tiered plan${PLAN_ON ? "" : " (not on yet)"}</option><option value="flat">Flat %</option></select><span id="nu-flat" hidden style="white-space:nowrap"><input id="nu-rate" inputmode="decimal" placeholder="10" style="width:4.5rem">%</span></div></div>
      <div class="field"><label class="eyebrow" for="nu-pin">PIN (optional, 4–10 digits)</label><input id="nu-pin" inputmode="numeric" placeholder="Name + PIN sign-in"></div>
      <div class="field"><span class="eyebrow">Apps</span><label class="chk"><input type="checkbox" id="nu-store" checked> Peptide store</label><label class="chk"><input type="checkbox" id="nu-tracker"> Case tracker</label></div></div>
      <div class="row2"><button class="btn solid" id="nuAdd">Add login</button><span class="muted">Send them the email and temporary password; they can change it under My account.</span></div></div>
    ${HUB.linked && HUB.apps && HUB.apps.tracker ? `<div class="panel" id="plansPanel"><h2>Case tracker plans</h2>
      <p class="muted">Quota, commission plan, pay and territory for each rep with the Case tracker ticked above. Names, PINs and on/off come from the logins table; add or remove reps up there. Team quotas are set here.</p>
      ${HOSTABLE ? `<iframe class="hubframe" title="Reps and plans" src="/admin/go/tracker?next=${encodeURIComponent("/admin?embed=1&card=reps-card")}" style="width:100%;height:40rem;min-height:24rem;border:0;border-radius:14px;background:var(--card)"></iframe>` : `<a class="btn solid" href="${switchHref("/admin")}"${FRAMED ? ' target="_top"' : ""}>Open reps and plans in the case tracker ↗</a><p class="muted" style="margin-top:.4rem">This browser doesn't show the tracker inside the page.</p>`}</div>` : ""}`;
  document.getElementById("nu-r").onchange = () => { document.getElementById("nu-rateWrap").hidden = document.getElementById("nu-r").value !== "rep"; };
  document.getElementById("nu-plan").onchange = (e) => { document.getElementById("nu-flat").hidden = e.target.value !== "flat"; };
  api("/hub/tracker-reps").then((r) => {
    const box = document.getElementById("trackerImport"); if (!box) return;
    if (!r.ok) { box.innerHTML = `<p class="muted">Case tracker: ${esc(r.error)}</p>`; return; }
    const missing = (r.reps || []).filter((t) => !users.some((u) => u.name.trim().toLowerCase() === String(t.rep).trim().toLowerCase()));
    if (!missing.length) return;
    box.innerHTML = `<details class="panel" style="border-color:var(--blue)"><summary><strong>In the case tracker only (${missing.length})</strong> <span class="muted">· reps without a login yet</span></summary>
      <p class="muted">These reps were set up in the tracker before Team logins existed. <strong>Add</strong> gives them one login for both apps (Case tracker ticked, same PIN they use today; the email is only for email + password sign-in — change it if they have a real one). <strong>Remove</strong> takes them out of the tracker's rep list; their logged cases stay.</p>
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,20rem),1fr));gap:.6rem">
      ${missing.map((t, i) => `<div style="border:1px solid var(--line);border-radius:10px;padding:.6rem .7rem"><strong>${esc(t.rep)}</strong>${t.active === false ? ' <span class="muted">(off)</span>' : ""}<label class="eyebrow" style="display:block;margin-top:.3rem">Email for their login</label><input data-imp="${i}" type="email" style="width:100%" value="${esc(String(t.rep).toLowerCase().replace(/[^a-z0-9]+/g, ".").replace(/^\.|\.$/g, ""))}@360medical.net">
        <div class="row2" style="gap:.4rem;margin-top:.4rem"><button class="btn solid" type="button" data-impadd="${i}">Add login</button><button class="btn danger" type="button" data-imprm="${i}" title="Remove from the tracker's rep list (their cases stay)">Remove</button></div></div>`).join("")}</div>
      ${missing.length > 1 ? `<div style="margin-top:.5rem"><button class="btn" type="button" id="impReps">Add all ${missing.length}</button></div>` : ""}</details>`;
    const addOne = async (i) => {
      const email = (document.querySelector(`[data-imp="${i}"]`).value || "").trim(); if (!email) { toast("Enter an email for " + missing[i].rep); return false; }
      try { await api("/users", { method: "POST", body: { name: missing[i].rep, email, password: "temp-" + Math.random().toString(36).slice(2, 10) + "A1", role: "rep", rate: "0", pin: missing[i].pin || "", apps: { store: false, tracker: true } } }); return true; } catch (e) { return false; }
    };
    box.onclick = async (e) => {
      const a = e.target.closest("[data-impadd]"), r = e.target.closest("[data-imprm]");
      if (a) { if (await addOne(+a.dataset.impadd)) { toast("Login added"); staff(); } return; }
      if (r) { const t = missing[+r.dataset.imprm]; if (!confirm(`Remove ${t.rep} from the case tracker's rep list? Their logged cases stay.`)) return; try { await api("/hub/tracker-reps/" + encodeURIComponent(t.rep), { method: "DELETE" }); toast("Removed from the tracker"); staff(); } catch (e) {} return; }
      if (e.target.id === "impReps") { let n = 0; for (let i = 0; i < missing.length; i++) if (await addOne(i)) n++; toast(`Added ${n} login${n === 1 ? "" : "s"}`); staff(); }
    };
  }).catch(() => {});
  document.getElementById("staffPick").onchange = (e) => { staffPick = e.target.value; staff(); };
  document.getElementById("ut").onchange = (e) => { if (planToggle(e)) return; if (e.target.matches('[data-k="role"]')) { const tr = e.target.closest("[data-id]"), pp = tr.querySelector(".planpick"), np = tr.querySelector("[data-noplan]"); pp.hidden = e.target.value !== "rep"; if (np) np.hidden = e.target.value === "rep"; } };
  document.getElementById("ut").onclick = async (e) => {
    if (e.target.closest("[data-del]")) {
      const tr = e.target.closest("[data-id]"), nm = tr.querySelector('[data-k="name"]').value;
      if (!confirm(`Delete ${nm}'s login for good? Their customers stay (unassigned). A rep with orders on record can't be deleted — untick Active instead.`)) return;
      await api("/users/" + tr.dataset.id, { method: "DELETE" }); toast("Login deleted"); staffPick = null; staff(); return;
    }
    if (!e.target.closest("[data-save]")) return;
    const tr = e.target.closest("[data-id]"), body = {};
    tr.querySelectorAll("[data-k]").forEach((i) => { if (i.type === "checkbox") body.active = i.checked; else if (i.dataset.k === "rate") { if (!i.disabled && i.value.trim() !== "") body.rate = i.value.trim(); } else if (i.dataset.k === "pin") { if (i.value.trim()) body.pin = i.value.trim(); } else if (i.dataset.k !== "password" || i.value) body[i.dataset.k] = i.value; });
    body.apps = { store: tr.querySelector('[data-app="store"]').checked, tracker: tr.querySelector('[data-app="tracker"]').checked };
    if (body.role && body.role !== tr.dataset.role && !confirm(`Change this login to ${ROLE[body.role]}? They'll be signed out.`)) return;
    await api("/users/" + tr.dataset.id, { method: "PATCH", body }); toast("Saved"); staff();
  };
  document.getElementById("nuAdd").onclick = async () => {
    const g = (x) => document.getElementById(x).value;
    const r = await api("/users", { method: "POST", body: { name: g("nu-n"), email: g("nu-e"), password: g("nu-p"), role: g("nu-r"), phone: g("nu-ph"), rate: g("nu-rate"), plan: g("nu-plan"), pin: g("nu-pin"), apps: { store: document.getElementById("nu-store").checked, tracker: document.getElementById("nu-tracker").checked } } });
    toast(`${ROLE[g("nu-r")]} login added`); staff();
  };
}

/* ---------- account ---------- */
function account() {
  pane().innerHTML = `<header><h1>My account</h1></header>
    <div class="panel" style="max-width:28rem"><h2>Change password</h2>
      <div class="field"><label class="eyebrow" for="pc">Current password</label><input id="pc" type="password" autocomplete="current-password"></div>
      <div class="field"><label class="eyebrow" for="pn">New password (10+ characters)</label><input id="pn" type="password" autocomplete="new-password"></div>
      <div><button class="btn solid" id="pSave">Change password</button></div>
      <p class="muted">Changing it signs you out everywhere else.</p></div>
    <div class="panel" style="max-width:28rem"><h2>My PIN</h2>
      <p class="muted">Sign in faster with your name + PIN on this admin, the rep app and the case tracker. ${me.apps && me.apps.tracker ? "" : ""}</p>
      <div class="field"><label class="eyebrow" for="myPin">PIN (4–10 digits; blank to remove)</label><input id="myPin" inputmode="numeric" maxlength="10"></div>
      <div><button class="btn solid" id="pinSave">Save PIN</button></div></div>`;
  document.getElementById("pinSave").onclick = async () => { const r = await api("/my-pin", { method: "POST", body: { pin: document.getElementById("myPin").value } }); toast(r.pinSet ? "PIN saved" : "PIN removed"); document.getElementById("myPin").value = ""; };
  document.getElementById("pSave").onclick = async () => {
    await fetch("/api/admin/password", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ current: pc.value, next: pn.value }) })
      .then(async (r) => { const j = await r.json(); toast(r.ok ? "Password changed" : j.error); if (r.ok) { pc.value = pn.value = ""; } });
  };
}

/* ---------- clicks ---------- */
document.addEventListener("click", (e) => {
  const n = e.target.closest("[data-nav]"); if (n) { const [v, sub] = n.dataset.nav.split(":"); if (v === "inventory") invTab = sub || "stock"; go(v); return; }
  const t = e.target.closest("[data-invtab]"); if (t) {
    if (invTab === "count" && t.dataset.invtab !== "count" && paneDirty && !confirm("Leave the count sheet? The counts you typed won't be saved.")) return;
    invTab = t.dataset.invtab; go("inventory", null, { silent: true }); return;
  }
  const co = e.target.closest("[data-cntopen]"); if (co) { e.preventDefault(); invTab = "counts"; openCountId = +co.dataset.cntopen; go("inventory", null, { silent: true }); return; }
  const k = e.target.closest("[data-go]"); if (k) { const [v, st] = k.dataset.go.split(":"); if (st) oFilter = { status: st, q: "" }; go(v); return; }
  const o = e.target.closest("[data-order]"); if (o) { go("orders", o.dataset.order); }
});

if (window.AppRefresh) window.AppRefresh.init({
  version: "/api/version",
  canAuto: () => !!me && !unsaved && !paneDirty && view !== "neworder" && !document.querySelector("dialog[open]") && !/^(INPUT|TEXTAREA|SELECT)$/.test((document.activeElement || {}).tagName || "") && !document.getElementById("impPrev"),
  refresh: async () => { if (me) go(view, orderId, { keepScroll: true, silent: true }); }
});

(async () => {
  // order emails link straight to an order: /admin#order-123
  const m = /^#order-(\d+)$/.exec(location.hash);
  if (m) { view = "orders"; orderId = m[1]; history.replaceState(null, "", location.pathname); }
  if (location.hash === "#customers") { view = "customers"; history.replaceState(null, "", location.pathname); }
  if (new URLSearchParams(location.search).get("embed") === "1") document.body.classList.add("embed");
  if (/^#(staff|setup|apps|account|settings|commissions|reps|geo|howto|salescost|pnl|analytics)$/.test(location.hash)) { view = location.hash.slice(1); history.replaceState(null, "", location.pathname); }
  const sso = new URLSearchParams(location.search).get("sso");
  if (sso) { const name = new URLSearchParams(location.search).get("name"); history.replaceState(null, "", location.pathname); window.__ssoMsg = sso === "expired" ? "That link from the case tracker expired — go back and tap it again." : `There's no store login for ${name || "that tracker sign-in"} yet. Sign in here, or an admin can add one under Team logins (same email).`; }
  const res = await fetch("/api/admin/me");
  if (res.ok) { me = (await res.json()).user; HUB = await api("/hub").catch(() => HUB); shell(); } else drawLogin();
})();
})();
