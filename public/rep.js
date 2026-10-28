/* Sales rep app: one rep's customers, orders and commissions. Signs in with the same login screen as admin; the server only shows this rep's own records. */
(() => {
const app = document.getElementById("app");
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const money = (c) => (c === null || c === undefined ? "" : "$" + (c / 100).toFixed(2));
const when = (iso) => { if (!iso) return ""; const d = new Date(iso); return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }); };
const STATUS_TEXT = { new: "Received", confirmed: "Awaiting payment", paid: "Paid", shipped: "Shipped", delivered: "Delivered", cancelled: "Cancelled" };
const pill = (s) => `<span class="pill st-${esc(s)}">${esc(STATUS_TEXT[s] || s)}</span>`;
function toast(msg) { const t = document.createElement("div"); t.className = "toast"; t.textContent = msg; document.body.appendChild(t); setTimeout(() => t.remove(), 2000); }
let me = null, view = "home", pick = null, paneDirty = false, HUB = { linked: false, apps: {} }, REP_AS = localStorage.getItem("repAs") || "", REP_LIST = [];
const FRAMED = (() => { try { return window.top !== window; } catch (e) { return true; } })();
const HOSTABLE = !/iPhone|iPad|iPod/.test(navigator.userAgent) && /Chrome|Edg|Firefox/.test(navigator.userAgent);
const $ = (id) => document.getElementById(id);

async function api(path, opts = {}) {
  const method = opts.method || "GET", send = method !== "GET";
  let url = "/api/rep" + path;
  if (me && me.role !== "rep" && REP_AS) url += (url.includes("?") ? "&" : "?") + "as=" + encodeURIComponent(REP_AS); // admin viewing the app as a rep
  const res = await fetch(url, { method, headers: send ? { "Content-Type": "application/json" } : {}, body: send ? JSON.stringify(opts.body || {}) : undefined, credentials: "same-origin" });
  if (res.status === 401) { me = null; drawLogin(); throw new Error("signed out"); }
  const j = await res.json().catch(() => ({}));
  if (!res.ok) { toast(j.error || "That didn't work"); throw new Error(j.error || "error"); }
  return j;
}

/* ---------- login ---------- */
let loginMode = localStorage.getItem("loginMode") || "email";
function drawLogin(msg) {
  const pinMode = loginMode === "pin";
  app.innerHTML = `<div class="login"><form id="lf">
    <img src="/site-logo?v=2" alt="360 Peptides" style="height:3rem;width:auto;max-width:15rem;object-fit:contain;justify-self:start">
    <h1>Sales rep sign in</h1><p class="muted">One login for the peptide store and the case tracker.</p>
    <div class="seg" style="justify-self:start"><button type="button" data-lmode="email"${pinMode ? "" : ' class="on"'}>Email + password</button><button type="button" data-lmode="pin"${pinMode ? ' class="on"' : ""}>Name + PIN</button></div>
    ${pinMode ? `<div class="field"><label class="eyebrow" for="ln">Your name</label><select id="ln" required><option value="">Loading…</option></select></div>
    <div class="field"><label class="eyebrow" for="lpin">PIN</label><input id="lpin" inputmode="numeric" autocomplete="one-time-code" maxlength="10" required style="font:600 1.3rem/1 var(--mono);letter-spacing:.3em"></div>`
    : `<div class="field"><label class="eyebrow" for="le">Email</label><input id="le" type="email" autocomplete="username" required></div>
    <div class="field"><label class="eyebrow" for="lp">Password</label><input id="lp" type="password" autocomplete="current-password" required></div>`}
    ${msg ? `<div class="err">${esc(msg)}</div>` : ""}
    <button class="btn solid wide rep">Sign in</button>
    <button class="btn wide" type="button" data-install>Download rep app</button>
    <p class="muted" style="text-align:center">Office staff? <a href="/admin">Sign in to admin</a></p></form></div>`;
  document.querySelectorAll("[data-lmode]").forEach((b) => (b.onclick = () => { loginMode = b.dataset.lmode; localStorage.setItem("loginMode", loginMode); drawLogin(); }));
  if (pinMode) fetch("/api/admin/pin-names").then((r) => r.json()).then((j) => { const sel = $("ln"); if (!sel) return; sel.innerHTML = `<option value="">Choose your name…</option>` + j.names.map((n) => `<option value="${n.id}"${String(n.id) === localStorage.getItem("loginName") ? " selected" : ""}>${esc(n.name)}</option>`).join(""); if (!j.names.length) sel.innerHTML = `<option value="">No PINs set yet — use email + password</option>`; }).catch(() => {});
  $("lf").onsubmit = async (e) => {
    e.preventDefault();
    const res = pinMode
      ? await fetch("/api/admin/login-pin", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: +$("ln").value, pin: $("lpin").value }) })
      : await fetch("/api/admin/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: $("le").value, password: $("lp").value }) });
    const j = await res.json();
    if (!res.ok) return drawLogin(j.error);
    if (pinMode) localStorage.setItem("loginName", $("ln").value);
    if (j.user.role !== "rep") { await fetch("/api/admin/logout", { method: "POST" }); return drawLogin("That login is for the admin, not the rep app. Go to /admin."); }
    me = j.user; HUB = await fetch("/api/admin/hub", { credentials: "same-origin" }).then((r) => r.ok ? r.json() : HUB).catch(() => HUB); if (me.role !== "rep") await loadRepList(); shell();
  };
}

/* ---------- shell ---------- */
const NAV = [["home", "Home"], ["customers", "Customers"], ["neworder", "New order"], ["orders", "Orders"], ["commissions", "Commissions"], ["account", "Account"]];
async function loadRepList() {
  try { const r = await fetch("/api/rep-list", { credentials: "same-origin" }).then((x) => x.json()); REP_LIST = r.reps || []; } catch (e) { REP_LIST = []; }
  if (!REP_LIST.some((r) => String(r.id) === String(REP_AS))) REP_AS = REP_LIST.length ? String(REP_LIST[0].id) : "";
}
function shell() {
  app.innerHTML = `<div class="rtop"><div style="display:flex;align-items:center;gap:.6rem"><span class="logopill"><img src="/site-logo?v=2" alt="360 Peptides"></span><div class="logo"><span id="rbrand">Sales rep</span><small>${esc(me.name || me.email)} <span id="rver"></span></small></div></div>
      <div class="tools"><span class="seg appswitch views"><a href="/admin" title="The admin with this login">Admin</a><a href="/" title="The store, signed in as the office">Store</a><span class="on" title="You are in the rep app">Rep</span>${HUB.linked && (me.role !== "rep" || (HUB.apps && HUB.apps.tracker)) ? `<a href="${FRAMED ? HUB.trackerUrl + "/" : (HOSTABLE ? "/rep/tracker?next=/" : "/rep/go/tracker?next=/")}"${FRAMED ? ' target="_top"' : ""} title="The case tracker with this login">Tracker</a>` : ""}</span>${me.role !== "rep" ? `<label class="asrep" title="You're an admin: the app shows what this rep sees">Viewing as <select id="repAs">${REP_LIST.map((r) => `<option value="${r.id}"${String(r.id) === String(REP_AS) ? " selected" : ""}>${esc(r.name)}</option>`).join("")}</select></label>` : ""}<button type="button" data-refresh title="Refresh"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M20 12a8 8 0 1 1-2.3-5.7M20 4v5h-5"/></svg></button><button type="button" id="lo">Sign out</button></div></div>
    <nav class="rnav" id="rnav"></nav><main class="rpane" id="pane"></main>`;
  $("lo").onclick = async () => { await fetch("/api/admin/logout", { method: "POST" }); me = null; drawLogin(); };
  if ($("repAs")) $("repAs").onchange = () => { REP_AS = $("repAs").value; localStorage.setItem("repAs", REP_AS); go(view); };
  fetch("/api/build").then((r) => r.json()).then((b) => { const v = $("rver"); if (v) v.textContent = `· v${b.version}`; }).catch(() => {});
  go(view);
}
function drawNav() { $("rnav").innerHTML = NAV.map(([k, l]) => `<button type="button" data-nav="${k}" class="${view === k ? "on" : ""}">${l}</button>`).join(""); }
const pane = () => $("pane");
function go(v, opts = {}) {
  if (paneDirty && !opts.silent && !confirm("Leave this page? What you typed hasn't been saved.")) return;
  paneDirty = false; view = v;
  const pn = pane(); if (pn) { pn.onclick = null; pn.oninput = null; }
  drawNav();
  ({ home, customers, neworder, orders, commissions, account }[v] || home)();
  if (!opts.keepScroll) window.scrollTo(0, 0);
}
document.addEventListener("input", (e) => { if (e.target.closest("#pane")) paneDirty = true; });
document.addEventListener("click", (e) => { const n = e.target.closest("[data-nav]"); if (n) go(n.dataset.nav); });

/* ---------- home ---------- */
async function home() {
  const d = await api("/me");
  pane().innerHTML = `<header><h1>Hi ${esc((d.rep.name || "").split(" ")[0] || "there")}</h1><span class="muted">Commission rate ${d.rep.commission_rate}%</span></header>
    <dl class="kpis">
      <div class="kpi green"><dt>Earned, not yet paid</dt><dd>${money(d.totals.earned)}</dd></div>
      <div class="kpi"><dt>Pending (orders unpaid)</dt><dd>${money(d.totals.pending)}</dd></div>
      <div class="kpi"><dt>Paid out so far</dt><dd>${money(d.totals.paid)}</dd></div>
      <div class="kpi"><dt>Sales this month</dt><dd>${money(d.month.sales)}</dd></div>
      <div class="kpi"><dt>Orders this month</dt><dd>${d.month.orders}</dd></div>
      <div class="kpi"><dt>My customers</dt><dd>${d.customers}</dd></div>
    </dl>
    <div class="row2"><button class="btn solid rep" data-nav="neworder" style="height:2.8rem">Place an order</button><button class="btn" data-nav="customers" style="height:2.8rem">Add a customer</button></div>
    <div class="panel"><h2>How commissions work</h2><p class="muted">You earn ${d.rep.commission_rate}% of the product total (after any discount, before shipping) on every order from your customers, whether you place it or they order on the store themselves. Commission is <strong>pending</strong> until the office marks the order paid, then <strong>earned</strong> until it's paid out to you. Cancelled orders earn nothing.</p></div>`;
}

/* ---------- customers ---------- */
let custList = [];
async function customers(editId) {
  const { customers: list } = await api("/customers"); custList = list;
  const a = (c) => c.address || {};
  pane().innerHTML = `<header><h1>My customers</h1><button class="btn solid rep" id="addC">Add customer</button></header>
    <div id="cForm"></div>
    <div class="filters"><input id="cq" type="search" placeholder="Search name, email or phone"></div>
    <div class="list" id="cList"></div>`;
  const draw = () => {
    const t = ($("cq").value || "").toLowerCase();
    const rows = list.filter((c) => !t || [c.name, c.email, c.phone].join(" ").toLowerCase().includes(t));
    $("cList").innerHTML = rows.length ? rows.map((c) => `<div class="item" data-cid="${c.id}"><div class="top2"><span>${esc(c.name)}</span><span>${c.orders ? money(c.sales_cents) : ""}</span></div>
      <small>${esc(c.email || "no email")}${c.phone ? " · " + esc(c.phone) : ""}${c.markup !== null && c.markup !== undefined ? ` · markup +${Number(c.markup)}% over cost` : ""}</small><small>${[a(c).city, a(c).state].filter(Boolean).join(", ")}${c.orders ? ` · ${c.orders} order${c.orders === 1 ? "" : "s"} · last ${when(c.last_order)}` : " · no orders yet"}${c.active ? "" : " · account off"}</small></div>`).join("")
      : `<p class="muted">${list.length ? "No customer matches." : "No customers yet. Add your first one."}</p>`;
  };
  draw(); $("cq").oninput = draw;
  const form = (c) => {
    const ad = c ? a(c) : {};
    const f = (id, label, val = "", type = "text", ac = "") => `<div class="field"><label class="eyebrow" for="${id}">${label}</label><input id="${id}" type="${type}" value="${esc(val)}" autocomplete="${ac}"></div>`;
    $("cForm").innerHTML = `<div class="panel"><h2>${c ? "Edit customer" : "New customer"}</h2>
      <div class="grid2">${f("c-n", "Full name", c?.name, "text", "name")}${c ? `<div class="field"><label class="eyebrow">Email</label><input value="${esc(c.email || "")}" placeholder="none" disabled></div>` : f("c-e", "Email (optional)", "", "email", "email")}${f("c-p", "Phone", c?.phone, "tel", "tel")}</div>
      <div class="grid2"><div class="field" style="grid-column:1/-1">${""}<label class="eyebrow" for="c-1">Street address</label><input id="c-1" value="${esc(ad.line1)}" autocomplete="address-line1"></div>
        ${f("c-2", "Apt, suite (optional)", ad.line2)}${f("c-c", "City", ad.city)}${f("c-s", "State", ad.state)}${f("c-z", "ZIP", ad.zip)}</div>
      <div class="err" id="cErr" hidden></div>
      <div class="row2"><button class="btn solid rep" id="cSave">${c ? "Save changes" : "Add customer"}</button>${c ? `<button class="btn" id="cOrder">Place an order for ${esc((c.name || "").split(" ")[0])}</button>` : ""}<button class="btn" id="cCancel">Cancel</button></div></div>`;
    $("cForm").scrollIntoView({ behavior: "smooth", block: "start" });
    const g = (x) => $(x).value.trim();
    $("cCancel").onclick = () => { $("cForm").innerHTML = ""; paneDirty = false; };
    if ($("cOrder")) $("cOrder").onclick = () => { paneDirty = false; pick = c.id; go("neworder"); };
    $("cSave").onclick = async () => {
      const body = { name: g("c-n"), phone: g("c-p"), address: { line1: g("c-1"), line2: g("c-2"), city: g("c-c"), state: g("c-s"), zip: g("c-z") } };
      if (!c) body.email = g("c-e");
      try {
        if (c) { await api("/customers/" + c.id, { method: "PATCH", body }); toast("Customer updated"); }
        else { const r = await api("/customers", { method: "POST", body }); toast("Customer added"); pick = r.id; }
        paneDirty = false; customers();
      } catch (e) { $("cErr").textContent = e.message; $("cErr").hidden = false; }
    };
  };
  $("addC").onclick = () => form(null);
  pane().onclick = (e) => { const it = e.target.closest("[data-cid]"); if (it) form(list.find((c) => String(c.id) === it.dataset.cid)); };
  if (editId) form(list.find((c) => c.id === editId));
}

/* ---------- new order ---------- */
async function neworder() {
  const [{ customers: list }, { products, fulfillment: ful, cardPayments }] = await Promise.all([api("/customers"), api("/catalog")]);
  const sellable0 = products.filter((p) => p.price_cents !== null && (p.stock === null || p.stock > 0));
  const label = (p) => `${p.name} ${p.strength}`.trim() + (p.manufacturer ? ` · ${p.manufacturer}` : "");
  pane().innerHTML = `<header><h1>New order</h1></header>
    ${!list.length ? `<div class="panel"><p>You need a customer first.</p><div><button class="btn solid rep" data-nav="customers">Add a customer</button></div></div>` : `
    <div class="panel"><h2>1. Customer</h2>
      <div class="field"><label class="eyebrow" for="oCust">Who is this order for?</label><select id="oCust"><option value="">Choose a customer…</option>${list.filter((c) => c.active).map((c) => `<option value="${c.id}"${pick === c.id ? " selected" : ""}>${esc(c.name)}${c.email ? " — " + esc(c.email) : c.phone ? " — " + esc(c.phone) : ""}</option>`).join("")}</select></div>
      <p class="muted" id="oAddr"></p></div>
    <div class="panel"><h2>2. Products</h2>
      <div class="filters"><input id="oq" type="search" placeholder="Filter products"></div>
      <div class="lines" id="oLines">${sellable0.map((p) => `<div class="line2" data-pid="${p.id}" data-txt="${esc(label(p).toLowerCase())}"><div class="nm">${esc(label(p))}<small>${money(p.price_cents)} each${p.stock !== null ? ` · ${p.stock} in stock` : ""}${p.max_per_order ? ` · max ${p.max_per_order}` : ""}</small></div>
        <input data-qty inputmode="numeric" placeholder="0" max="${p.max_per_order || 999}"><div class="amt" data-amt></div></div>`).join("")}</div>
      ${sellable0.length ? "" : '<p class="muted">No products have a price yet.</p>'}</div>
    <div class="panel"><h2>3. Ship or deliver, discount, notes</h2>
      ${ful.length ? `<div class="choices" id="oFul">${ful.map((f, i) => `<label class="choice-opt"><input type="radio" name="oFul" value="${esc(f.key)}"${i === 0 ? " checked" : ""}><span><strong>${esc(f.label)}</strong>${f.note || f.freeOverCents ? `<small>${esc(f.note)}${f.freeOverCents ? `${f.note ? " · " : ""}Free over ${money(f.freeOverCents)}` : ""}</small>` : ""}</span><span class="amt" data-fulamt="${esc(f.key)}">${f.cents ? money(f.cents) : "Free"}</span></label>`).join("")}</div>` : '<p class="muted">Shipping is confirmed by the office.</p>'}
      <div class="field"><label class="eyebrow" for="oCode">Discount code (optional)</label><div class="coderow"><input id="oCode" autocomplete="off" autocapitalize="characters" placeholder="Enter a code" style="height:2.6rem"><button class="btn" type="button" id="oCodeApply" style="height:2.6rem">Apply</button></div><span class="muted" id="oCodeMsg"></span></div>
      ${cardPayments ? `<label class="chk" style="display:flex;gap:.5rem;align-items:center"><input type="checkbox" id="oPayLink" checked> Get a card payment link to send the customer</label>` : ""}
      <div class="field"><label class="eyebrow" for="oNote">Note for the office (optional)</label><textarea id="oNote" maxlength="1000"></textarea></div></div>
    <div class="sticky-total"><div><strong id="oSub">$0.00</strong> <span class="muted" id="oCount">0 items</span></div><div class="err" id="oErr" hidden style="flex:1 1 100%"></div><button class="btn solid rep" id="oGo" style="height:2.8rem">Place order</button></div>
    <div id="oDone"></div>`}`;
  if (!list.length) return;
  pick = null;
  let code = null; // applied discount code { code, kind, value, minSubtotalCents }
  const addr = () => { const c = list.find((x) => String(x.id) === $("oCust").value); const a = c && c.address || {}; $("oAddr").textContent = c ? (a.line1 ? `Ships or delivers to ${[a.line1, a.line2, a.city, a.state, a.zip].filter(Boolean).join(", ")}` : "This customer has no address yet. Add it under Customers first.") + (c.markup !== null && c.markup !== undefined ? ` · Pricing: cost +${Number(c.markup)}% (this customer's own prices)` : " · Store prices") : ""; };
  // prices change with the customer (some have their own markup): reload the product list for them
  let sellable = products.filter((p) => p.price_cents !== null && (p.stock === null || p.stock > 0));
  const lineHtml = (p) => `<div class="line2" data-pid="${p.id}" data-txt="${esc(label(p).toLowerCase())}"><div class="nm">${esc(label(p))}<small>${money(p.price_cents)} each${p.stock !== null ? ` · ${p.stock} in stock` : ""}${p.max_per_order ? ` · max ${p.max_per_order}` : ""}</small></div>
        <input data-qty inputmode="numeric" placeholder="0" max="${p.max_per_order || 999}"><div class="amt" data-amt></div></div>`;
  const reprice = async () => {
    const id = $("oCust").value; if (!id) return;
    const qtys = {}; document.querySelectorAll("#oLines [data-pid]").forEach((r) => { qtys[r.dataset.pid] = r.querySelector("[data-qty]").value; });
    const { products: priced } = await api("/catalog?customerId=" + id);
    sellable = priced.filter((p) => p.price_cents !== null && (p.stock === null || p.stock > 0));
    $("oLines").innerHTML = sellable.map(lineHtml).join("");
    document.querySelectorAll("#oLines [data-pid]").forEach((r) => { if (qtys[r.dataset.pid]) r.querySelector("[data-qty]").value = qtys[r.dataset.pid]; });
    total();
  };
  const chosen = () => ful.find((f) => f.key === (document.querySelector("#oFul input:checked") || {}).value) || ful[0] || null;
  const shipCost = (f, sub) => (!f ? 0 : f.freeOverCents > 0 && sub >= f.freeOverCents ? 0 : f.cents);
  const total = () => {
    let sub = 0, n = 0;
    document.querySelectorAll("#oLines [data-pid]").forEach((row) => { const p = sellable.find((x) => String(x.id) === row.dataset.pid); const q = parseInt(row.querySelector("[data-qty]").value) || 0; row.querySelector("[data-amt]").textContent = q ? money(p.price_cents * q) : ""; sub += q * p.price_cents; n += q; });
    ful.forEach((f) => { const el = document.querySelector(`[data-fulamt="${f.key}"]`); if (el) el.textContent = shipCost(f, sub) ? money(shipCost(f, sub)) : "Free"; });
    const off = !code || !sub || (code.minSubtotalCents && sub < code.minSubtotalCents) ? 0 : Math.max(0, Math.min(sub, code.kind === "percent" ? Math.round(sub * code.value / 100) : code.value));
    const sc = shipCost(chosen(), sub);
    $("oSub").textContent = money(sub - off + sc); $("oCount").textContent = `${n} item${n === 1 ? "" : "s"}${off ? ` · −${money(off)} ${code.code}` : ""}${sc ? ` · +${money(sc)} ${chosen().label}` : ""}`;
  };
  $("oCodeApply").onclick = async () => {
    const c = $("oCode").value.trim().toUpperCase(); $("oCodeMsg").textContent = "";
    if (!c) { code = null; total(); return; }
    let sub = 0; document.querySelectorAll("#oLines [data-pid]").forEach((row) => { const p = sellable.find((x) => String(x.id) === row.dataset.pid); sub += (parseInt(row.querySelector("[data-qty]").value) || 0) * p.price_cents; });
    try {
      const r = await fetch("/api/discount", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ code: c, subtotalCents: sub }) });
      const j = await r.json(); if (!r.ok) throw new Error(j.error || "That code didn't work.");
      code = { code: j.code, kind: j.kind, value: j.value, minSubtotalCents: j.minSubtotalCents || 0 }; $("oCode").value = j.code; $("oCodeMsg").textContent = `${j.label} applied.`;
    } catch (e) { code = null; $("oCodeMsg").textContent = e.message; }
    total();
  };
  addr(); if ($("oCust").value) reprice();
  $("oCust").onchange = () => { addr(); reprice(); };
  $("oq").oninput = () => { const t = $("oq").value.toLowerCase(); document.querySelectorAll("#oLines [data-pid]").forEach((r) => { r.hidden = t && !r.dataset.txt.includes(t) && !r.querySelector("[data-qty]").value; }); };
  pane().oninput = (e) => { if (e.target.matches("[data-qty]")) total(); };
  pane().onchange = (e) => { if (e.target.matches("#oFul input")) total(); };
  $("oGo").onclick = async () => {
    const items = [...document.querySelectorAll("#oLines [data-pid]")].map((r) => ({ id: +r.dataset.pid, qty: parseInt(r.querySelector("[data-qty]").value) || 0 })).filter((i) => i.qty > 0);
    $("oErr").hidden = true;
    if (!$("oCust").value) { $("oErr").textContent = "Choose a customer."; $("oErr").hidden = false; return; }
    if (!items.length) { $("oErr").textContent = "Enter a quantity for at least one product."; $("oErr").hidden = false; return; }
    $("oGo").disabled = true;
    try {
      const f = chosen();
      const r = await api("/orders", { method: "POST", body: { customerId: +$("oCust").value, items, fulfillment: f ? f.key : "ship", discountCode: code ? code.code : "", payLink: !!($("oPayLink") && $("oPayLink").checked), note: $("oNote").value } });
      paneDirty = false;
      $("oDone").innerHTML = `<div class="okbox"><span class="eyebrow">Order placed</span><span class="num" style="font:600 1.4rem/1 var(--mono)">${esc(r.number)}</span><span>Total ${money(r.totalCents)} (products ${money(r.subtotalCents)}${r.discountCents ? `, discount −${money(r.discountCents)}` : ""}${r.shippingCents ? `, ${esc(r.shippingName || "shipping")} ${money(r.shippingCents)}` : r.shippingName ? `, ${esc(r.shippingName)} free` : ""})</span>
        ${r.payUrl ? `<span><strong>Card payment link</strong> (send it to the customer; the order marks itself paid when they pay):<br><a href="${esc(r.payUrl)}" target="_blank" rel="noopener" style="word-break:break-all">${esc(r.payUrl)}</a></span><div class="row2"><button class="btn" type="button" data-copy="${esc(r.payUrl)}">Copy link</button><a class="btn" href="sms:?&body=${encodeURIComponent(`Here's the secure card payment link for your order ${r.number}: ${r.payUrl}`)}">Text it</a><a class="btn" href="mailto:?subject=${encodeURIComponent("Payment link for order " + r.number)}&body=${encodeURIComponent(`Here's the secure card payment link for your order ${r.number}: ${r.payUrl}`)}">Email it</a></div>` : ""}
        <span class="muted">${r.payUrl ? "Until the customer pays, the order stays pending." : "The office will confirm it with the customer and collect payment."} Your commission shows as pending until the order is paid.</span>
        <div class="row2"><button class="btn solid rep" data-nav="orders">See my orders</button><button class="btn" data-nav="neworder">Another order</button></div></div>`;
      const cp = $("oDone").querySelector("[data-copy]"); if (cp) cp.onclick = () => navigator.clipboard?.writeText(cp.dataset.copy).then(() => toast("Link copied"), () => toast("Copy failed"));
      $("oDone").scrollIntoView({ behavior: "smooth" });
      document.querySelectorAll("#oLines [data-qty]").forEach((i) => { i.value = ""; }); total();
    } catch (e) { $("oErr").textContent = e.message; $("oErr").hidden = false; }
    finally { $("oGo").disabled = false; }
  };
}

/* ---------- orders ---------- */
async function orders() {
  const { orders: list } = await api("/orders");
  pane().innerHTML = `<header><h1>My orders</h1><span class="muted">${list.length} order${list.length === 1 ? "" : "s"}</span></header>
    <div class="filters"><input id="oq2" type="search" placeholder="Search order #, customer or product"><select id="of2"><option value="">All statuses</option>${Object.entries(STATUS_TEXT).map(([k, v]) => `<option value="${k}">${v}</option>`).join("")}</select></div>
    <div class="list" id="oList"></div>`;
  const draw = () => {
    const t = ($("oq2").value || "").toLowerCase(), st = $("of2").value;
    const rows = list.filter((o) => (!st || o.status === st) && (!t || [o.number, o.name, ...(o.items || []).map((i) => i.name)].join(" ").toLowerCase().includes(t)));
    $("oList").innerHTML = rows.length ? rows.map((o) => `<div class="item" style="cursor:default"><div class="top2"><span>Order ${esc(o.number)} · ${esc(o.name)}</span><span>${money(o.total_cents)}</span></div>
      <small>${when(o.created_at)} · ${pill(o.status)}${o.shipping_method ? ` · ${esc(o.shipping_method)}` : ""}${o.paid_at ? " · paid by card" : o.pay_method === "card" ? " · card payment pending" : ""}${o.discount_code ? ` · code ${esc(o.discount_code)}` : ""}${o.tracking ? ` · ${esc(o.carrier || "Tracking")} <span class="mono">${esc(o.tracking)}</span>` : ""}${o.placed_by && !o.placed_by.startsWith("Rep") ? " · placed by the customer" : ""}</small>
      <small>${(o.items || []).map((i) => `${i.qty} × ${esc(i.name)} ${esc(i.strength)}`).join(", ")}</small></div>`).join("")
      : `<p class="muted">${list.length ? "No order matches." : "No orders yet."}</p>`;
  };
  draw(); $("oq2").oninput = draw; $("of2").onchange = draw;
}

/* ---------- commissions ---------- */
async function commissions() {
  const qs = (f, t) => "?" + new URLSearchParams({ from: f || "", to: t || "" }).toString();
  const load = async (f, t) => {
    const d = await api("/commissions" + qs(f, t));
    $("cmK").innerHTML = `<div class="kpi green"><dt>Earned, not yet paid</dt><dd>${money(d.totals.earned)}</dd></div><div class="kpi"><dt>Pending</dt><dd>${money(d.totals.pending)}</dd></div><div class="kpi"><dt>Paid out</dt><dd>${money(d.totals.paid)}</dd></div><div class="kpi"><dt>Sales (product total)</dt><dd>${money(d.totals.sales)}</dd></div>`;
    $("cmT").innerHTML = d.rows.length ? `<div class="tblwrap"><table class="tbl"><tr><th>Date</th><th>Order</th><th>Customer</th><th class="num">Sales</th><th class="num">Rate</th><th class="num">Commission</th><th>Status</th></tr>
      ${d.rows.map((r) => `<tr><td>${when(r.created_at)}</td><td class="mono">${esc(r.number)}</td><td>${esc(r.customer)}</td><td class="num">${money(r.subtotal_cents - r.discount_cents)}</td><td class="num">${r.commission_rate}%</td><td class="num"><strong>${money(r.commission_cents)}</strong></td><td><span class="pill st-${r.comm_status}">${r.comm_status}</span>${r.payout_date ? `<div class="muted" style="font-size:.72rem">paid ${when(r.payout_date)}</div>` : ""}</td></tr>`).join("")}</table></div>` : `<p class="muted">No orders in this period.</p>`;
    $("cmP").innerHTML = d.payouts.length ? `<div class="panel"><h2>Payouts to me</h2><div class="tblwrap"><table class="tbl"><tr><th>Date</th><th class="num">Amount</th><th class="num">Orders</th><th>Note</th></tr>${d.payouts.map((p) => `<tr><td>${when(p.paid_at)}</td><td class="num"><strong>${money(p.amount_cents)}</strong></td><td class="num">${p.orders}</td><td>${esc(p.note)}</td></tr>`).join("")}</table></div></div>` : "";
  };
  pane().innerHTML = `<header><h1>My commissions</h1></header>
    <div class="filters"><input id="cmF" type="date"><input id="cmTo" type="date"><button class="btn" id="cmAll" type="button">All time</button></div>
    <dl class="kpis" id="cmK"></dl><div id="cmT"></div><div id="cmP"></div>
    <p class="muted"><strong>Pending</strong> = the customer hasn't paid yet. <strong>Earned</strong> = order paid, commission owed to you. <strong>Paid</strong> = included in a payout.</p>`;
  const run = () => load($("cmF").value, $("cmTo").value);
  $("cmF").onchange = run; $("cmTo").onchange = run; $("cmAll").onclick = () => { $("cmF").value = ""; $("cmTo").value = ""; run(); };
  run();
}

/* ---------- account ---------- */
async function account() {
  const d = await api("/me");
  pane().innerHTML = `<header><h1>My account</h1></header>
    <div class="panel"><h2>${esc(d.rep.name)}</h2><p class="muted">${esc(d.rep.email)}${d.rep.phone ? " · " + esc(d.rep.phone) : ""} · commission ${d.rep.commission_rate}%</p><p class="muted">To change your name, phone or rate, ask the office.</p></div>
    <div class="panel"><h2>Change password</h2>
      <div class="grid2"><div class="field"><label class="eyebrow" for="pc">Current password</label><input id="pc" type="password" autocomplete="current-password"></div><div class="field"><label class="eyebrow" for="pn">New password (10+ characters)</label><input id="pn" type="password" autocomplete="new-password"></div></div>
      <div><button class="btn solid rep" id="pSave">Change password</button></div></div>
    <div class="panel"><h2>Rep app on your phone</h2><p class="muted">Install it for one-tap access.</p><div><button class="btn" type="button" data-install>Download rep app</button></div></div>
    <p class="muted" id="buildLine" style="text-align:center;font-size:.75rem"></p>`;
  fetch("/api/build").then((r) => r.json()).then((b) => { $("buildLine").textContent = `Rep app v${b.version} · updated ${when(b.updated)}`; }).catch(() => {});
  $("pSave").onclick = async () => {
    const r = await fetch("/api/admin/password", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ current: $("pc").value, next: $("pn").value }) });
    const j = await r.json(); toast(r.ok ? "Password changed" : j.error); if (r.ok) { $("pc").value = $("pn").value = ""; paneDirty = false; }
  };
}

/* ---------- auto refresh ---------- */
if (window.AppRefresh) window.AppRefresh.init({
  version: "/api/version",
  canAuto: () => !!me && !paneDirty && !document.querySelector("dialog[open]") && !/^(INPUT|TEXTAREA|SELECT)$/.test((document.activeElement || {}).tagName || "") && view !== "neworder",
  refresh: async () => { if (me) go(view, { keepScroll: true, silent: true }); }
});

(async () => {
  if (new URLSearchParams(location.search).get("embed") === "1") document.body.classList.add("embed");
  if (/^#(account|customers|orders|commissions)$/.test(location.hash)) { view = location.hash.slice(1); history.replaceState(null, "", location.pathname); }
  const res = await fetch("/api/admin/me");
  if (res.ok) { me = (await res.json()).user; HUB = await fetch("/api/admin/hub", { credentials: "same-origin" }).then((r) => r.ok ? r.json() : HUB).catch(() => HUB); if (me.role !== "rep") await loadRepList(); shell(); } else drawLogin();
})();
})();
