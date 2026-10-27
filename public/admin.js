/* Store admin: dashboard, orders, products, lab reports, shipping, settings, staff, account. */
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
let me = null, view = "dashboard", orderId = null, stats = null, BUILD = null;
const isOwner = () => me && me.role === "owner";

/* ---------- login ---------- */
function drawLogin(msg) {
  app.innerHTML = `<div class="login"><form id="lf">
    <img src="/site-logo" alt="360 Medical" style="height:3.2rem;width:auto;max-width:16rem;object-fit:contain;justify-self:start">
    <h1>Peptides Admin</h1><p class="muted">Sign in to manage orders, prices and the site.</p>
    <div class="field"><label class="eyebrow" for="le">Email</label><input id="le" type="email" autocomplete="username" required></div>
    <div class="field"><label class="eyebrow" for="lp">Password</label><input id="lp" type="password" autocomplete="current-password" required></div>
    ${msg ? `<div class="err">${esc(msg)}</div>` : ""}
    <button class="btn solid wide">Sign in</button><button class="btn wide" type="button" data-install>Download admin app</button>
    <p class="muted" style="text-align:center;margin:0">Sales rep? <a href="/rep">Sign in to the rep app</a> to fill orders.</p></form></div>`;
  document.getElementById("lf").onsubmit = async (e) => {
    e.preventDefault();
    const res = await fetch("/api/admin/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: le.value, password: lp.value }) });
    const j = await res.json();
    if (!res.ok) return drawLogin(j.error);
    if (j.user.role === "rep") { location.href = "/rep"; return; }
    me = j.user; shell();
  };
}

/* ---------- shell ---------- */
const NAV = [["dashboard", "Dashboard"], ["orders", "Orders"], ["customers", "Customers"], ["reps", "Sales reps", true], ["commissions", "Commissions", true], ["products", "Products & prices"], ["inventory", "Inventory"], ["reports", "Lab reports"], ["discounts", "Discount codes", true], ["page", "Page setup"], ["settings", "Site settings"], ["staff", "Staff logins", true], ["account", "My account"]];
function shell() {
  app.innerHTML = `<div class="mtop"><strong>360 Peptides Admin</strong><span><button type="button" data-refresh title="Refresh"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M20 12a8 8 0 1 1-2.3-5.7M20 4v5h-5"/></svg></button> <button type="button" id="mm">Menu</button></span></div>
  <div class="adm" id="adm"><aside class="side">
    <div class="logobox"><img src="/site-logo" alt="360 Medical"></div><div class="logo"><small>Peptides admin</small><span class="ver" id="buildTop">v…</span></div>
    <button type="button" class="sref" data-refresh title="Reload this screen"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" style="vertical-align:-2px"><path d="M20 12a8 8 0 1 1-2.3-5.7M20 4v5h-5"/></svg> Refresh</button>
    <nav id="nav"></nav>
    <div class="who"><span>${esc(me.name || me.email)} · ${esc(me.role)}</span><a href="/" target="_blank" style="color:#fff">View store ↗</a><button type="button" data-refresh><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" style="vertical-align:-2px"><path d="M20 12a8 8 0 1 1-2.3-5.7M20 4v5h-5"/></svg> Refresh</button><button type="button" data-install>Download admin app</button><button type="button" id="lo">Sign out</button><span id="buildLine" style="font-size:.7rem;opacity:.7"></span></div>
  </aside><section class="pane" id="pane"></section></div>`;
  document.getElementById("lo").onclick = async () => { await fetch("/api/admin/logout", { method: "POST" }); me = null; drawLogin(); };
  fetch("/api/build").then((r) => r.json()).then((b) => { BUILD = b; const line = `v${b.version} · updated ${when(b.updated)}`; document.getElementById("buildLine").textContent = line; document.getElementById("buildTop").textContent = line; const d = document.getElementById("dashBuild"); if (d) d.textContent = line; }).catch(() => {});
  document.getElementById("mm").onclick = () => document.getElementById("adm").classList.toggle("menu");
  go(view, orderId);
}
async function drawNav() {
  try { stats = await api("/stats"); } catch (e) { return; }
  const n = stats.byStatus.new || 0;
  document.getElementById("nav").innerHTML = NAV.filter(([, , o]) => !o || isOwner()).map(([k, label]) => `<button type="button" data-nav="${k}" class="${view === k ? "on" : ""}">${label}${k === "orders" && n ? `<span class="badge">${n}</span>` : ""}</button>`).join("");
}
let paneDirty = false; // something typed on this screen and not saved yet
document.addEventListener("input", (e) => { if (e.target.closest("#pane")) paneDirty = true; });
function go(v, id, opts = {}) {
  if (!opts.silent && unsaved && !confirm("You have unsaved product changes. Leave without saving?")) return;
  unsaved = false; paneDirty = false;
  const pn = document.getElementById("pane"); if (pn) { pn.onclick = null; pn.oninput = null; pn.onchange = null; } // drop the last screen's handlers
  view = v; orderId = id || null;
  const adm = document.getElementById("adm"); if (adm) adm.classList.remove("menu");
  drawNav();
  ({ dashboard, orders, customers, reps, commissions, products, inventory, reports, discounts, page, settings, staff, account }[v] || dashboard)();
  if (!opts.keepScroll) window.scrollTo(0, 0);
}
const pane = () => document.getElementById("pane");
const ro = () => (isOwner() ? "" : " disabled");

/* ---------- dashboard ---------- */
async function dashboard() {
  const s = stats || (await api("/stats"));
  Promise.all([api("/reports"), api("/products")]).then(([{ reports: R }, { products: P }]) => {
    const box = document.getElementById("linkCheck"); if (!box) return;
    const lone = R.filter((r) => r.active && !P.some((p) => p.active && reportMatches(p, r)));
    box.innerHTML = lone.length ? `<div class="panel"><strong>${lone.length} lab report${lone.length === 1 ? " isn't" : "s aren't"} attached to a product:</strong><span class="muted">${lone.map((r) => esc(`${r.product} ${r.strength}${r.sample ? " (" + r.sample + ")" : ""}`)).join(", ")}</span><div><button class="btn" data-nav="reports">Open lab reports</button></div></div>` : "";
  }).catch(() => {});
  const b = s.byStatus;
  pane().innerHTML = `<header><h1>Dashboard</h1><span class="muted" id="dashBuild">${BUILD ? `v${BUILD.version} · updated ${when(BUILD.updated)}` : ""}</span></header>
    <dl class="kpis">
      <div class="kpi" data-go="orders:new"><dt>New orders</dt><dd>${b.new || 0}</dd></div>
      <div class="kpi" data-go="orders:confirmed"><dt>Waiting for payment</dt><dd>${b.confirmed || 0}</dd></div>
      <div class="kpi" data-go="orders:paid"><dt>Paid, to ship</dt><dd>${b.paid || 0}</dd></div>
      <div class="kpi" data-go="orders:shipped"><dt>Shipped</dt><dd>${b.shipped || 0}</dd></div>
      <div class="kpi"><dt>Paid this month</dt><dd>${money(s.month.paid_cents)}</dd></div>
    </dl>
    <div id="linkCheck"></div>
    ${s.unpriced ? `<div class="panel"><strong>${s.unpriced} product${s.unpriced === 1 ? " has" : "s have"} no price.</strong><span class="muted">They show "Ask for price" and can't be added to the cart.</span><div><button class="btn" data-nav="products">Set prices</button></div></div>` : ""}
    ${s.lowStock.length ? `<div class="panel"><h2>Low stock</h2><div class="tblwrap"><table class="tbl"><tr><th>Product</th><th class="num">Left</th><th class="num">Reorder at</th></tr>${s.lowStock.map((p) => `<tr><td>${esc(p.name)} ${esc(p.strength)}${p.manufacturer ? ` · ${esc(p.manufacturer)}` : ""}</td><td class="num">${p.stock}</td><td class="num">${p.reorder_at}</td></tr>`).join("")}</table></div><div><button class="btn" data-nav="inventory">Open inventory</button></div></div>` : ""}
    <div class="panel"><h2>How orders flow</h2><p class="muted">New → Confirmed (you've sent the total and payment info) → Paid → Shipped (add carrier and tracking) or Delivered. Orders paid by card through Stripe arrive already <em>paid</em>. Cancelling puts the stock back. Every order is also emailed to the address under Site settings → Order emails.</p></div>`;
}

/* ---------- orders ---------- */
let oFilter = { status: "", q: "" };
async function orders() {
  if (orderId) return orderDetail(orderId);
  pane().innerHTML = `<header><h1>Orders</h1><a class="btn" href="/api/admin/orders.csv" style="display:inline-grid;place-items:center;text-decoration:none">Export CSV</a></header>
    <div class="filters"><select id="of"><option value="">All statuses</option>${STATUSES.map((s) => `<option${oFilter.status === s ? " selected" : ""}>${s}</option>`).join("")}</select>
      <input id="oq" type="search" placeholder="Name, email, order # or tracking" value="${esc(oFilter.q)}"></div>
    <div class="tblwrap" id="ot"><p class="muted">Loading…</p></div>`;
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
  pane().innerHTML = `<header><h1>Order ${esc(o.number)}</h1><button class="btn" data-nav="orders">← All orders</button></header>
  <div class="two">
    <div class="stack">
      <div class="panel"><h2>Items</h2><div class="tblwrap"><table class="tbl"><tr><th>Product</th><th class="num">Qty</th><th class="num">Each</th><th class="num">Line</th></tr>
        ${items.map((i) => `<tr><td class="namecol">${esc(i.name)} ${esc(i.strength)}</td><td class="num">${i.qty}</td><td class="num">${money(i.unit_cents)}</td><td class="num">${money(i.unit_cents * i.qty)}</td></tr>`).join("")}
        <tr><td colspan="3">Subtotal</td><td class="num">${money(o.subtotal_cents)}</td></tr>
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
        <div class="row2"><button class="btn" id="resendMail">Send order email again</button></div></div>
      <div class="panel"><h2>Customer</h2>
        <p><strong>${esc(o.name)}</strong><br><a href="mailto:${esc(o.email)}?subject=${encodeURIComponent("Your order " + o.number)}">${esc(o.email)}</a>${o.phone ? `<br><a href="tel:${esc(o.phone)}">${esc(o.phone)}</a>` : ""}</p>
        <p class="eyebrow">${delivery ? "Deliver to" : "Ship to"}</p><p>${addr}</p>
        ${o.customer_note ? `<p class="muted"><strong>Customer note:</strong> ${esc(o.customer_note)}</p>` : ""}
        <div class="row2"><button class="btn" id="copyAddr">Copy ${delivery ? "delivery" : "shipping label"} address</button></div></div>
    </div>
    <div class="stack">
      <div class="panel"><h2>Status &amp; delivery</h2>
        <div class="grid2"><div class="field"><label class="eyebrow" for="ost">Status</label><select id="ost">${STATUSES.map((s) => `<option${s === o.status ? " selected" : ""}>${s}</option>`).join("")}</select></div>
        <div class="field"><label class="eyebrow" for="oful">Ship or deliver</label><select id="oful"><option value="ship"${!delivery ? " selected" : ""}>Ship</option><option value="delivery"${delivery ? " selected" : ""}>Local delivery (free)</option></select></div></div>
        ${!delivery && fedexAccount ? `<p class="muted">FedEx account <span class="mono">${esc(fedexAccount)}</span> <button class="linkbtn" type="button" id="copyFedex">copy</button> — use it when you make the label.</p>` : ""}
        <div class="field"><label class="eyebrow" for="ocar">Carrier</label><input id="ocar" list="carriers" value="${esc(o.carrier || (!delivery && fedexAccount ? "FedEx" : ""))}"><datalist id="carriers"><option>FedEx</option><option>USPS</option><option>UPS</option><option>DHL</option><option>Hand delivered</option></datalist></div>
        <div class="field"><label class="eyebrow" for="otr">Tracking number</label><input id="otr" value="${esc(o.tracking)}"></div>
        <div class="field"><label class="eyebrow" for="oin">Internal note (staff only)</label><textarea id="oin">${esc(o.internal_note)}</textarea></div>
        <button class="btn solid" id="saveO">Save</button>
        <p class="muted">${o.paid_at ? "Paid " + when(o.paid_at) + ". " : ""}${o.shipped_at ? "Shipped " + when(o.shipped_at) + "." : ""}</p></div>
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
  $("saveO").onclick = async () => {
    if ($("ost").value === "shipped" && $("oful").value === "ship" && !$("otr").value.trim() && !confirm("Mark shipped without a tracking number?")) return;
    await api("/orders/" + id, { method: "PATCH", body: { status: $("ost").value, fulfillment: $("oful").value, carrier: $("ocar").value, tracking: $("otr").value, internalNote: $("oin").value } });
    toast("Saved"); orderDetail(id); drawNav();
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
  $("resendMail").onclick = async () => { $("resendMail").disabled = true; try { const r = await api(`/orders/${id}/email`, { method: "POST" }); toast(`Sent ${r.sent} email${r.sent === 1 ? "" : "s"}`); } finally { $("resendMail").disabled = false; } };
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


/* ---------- customers ---------- */
async function customers() {
  pane().innerHTML = `<header><h1>Customers</h1>${isOwner() ? `<button class="btn solid" id="addC">Add customer</button>` : ""}</header>
    <p class="muted">Give a customer their own PIN to let them into the site. Their PIN works only for them: it unlocks the store and signs them into their account. Changing or revoking it, or turning the account off, ends their access right away. Turn the lock on under Site settings → Site PIN.</p>
    <div id="cNew"></div><div id="pinShow"></div>
    <div class="filters"><input id="cq" type="search" placeholder="Name or email"></div>
    <div class="tblwrap" id="ct"><p class="muted">Loading…</p></div>`;
  let term = "";
  const { reps: repList } = await api("/reps").catch(() => ({ reps: [] }));
  const activeReps = repList.filter((r) => r.active);
  const repCell = (c) => isOwner()
    ? `<select data-rep style="min-width:8rem"><option value="">— none —</option>${repList.filter((r) => r.active || r.id === c.rep_id).map((r) => `<option value="${r.id}"${r.id === c.rep_id ? " selected" : ""}>${esc(r.name)}${r.active ? "" : " (off)"}</option>`).join("")}</select>`
    : esc(c.rep_name || "");
  const pinCell = (c) => {
    if (!isOwner()) return c.has_pin ? "Set" : "";
    return c.has_pin
      ? `<span class="pill st-shipped">PIN set</span><div class="muted" style="font-size:.75rem">${c.pin_used_at ? "Last used " + when(c.pin_used_at) : "Not used yet"}</div>
         <div class="row2" style="flex-wrap:nowrap;margin-top:.3rem"><button class="btn" data-pin="set">Change</button><button class="btn" data-pin="revoke">Revoke</button></div>`
      : `<button class="btn" data-pin="set">Give PIN</button>`;
  };
  const load = async () => {
    const { customers: list } = await api("/customers?q=" + encodeURIComponent(term));
    document.getElementById("ct").innerHTML = list.length ? `<table class="tbl"><tr><th>Name</th><th>Email</th><th>Phone</th><th>Sales rep</th><th>Site PIN</th><th>Joined</th><th class="num">Orders</th><th class="num">Paid total</th><th>Last order</th><th>Active</th>${isOwner() ? "<th></th>" : ""}</tr>
      ${list.map((c) => `<tr data-cid="${c.id}" data-cname="${esc(c.name || c.email)}"><td>${esc(c.name)}</td><td><a href="#" data-cust-orders="${esc(c.email)}">${esc(c.email)}</a></td><td>${esc(c.phone)}</td>
        <td>${repCell(c)}</td><td>${pinCell(c)}</td><td>${when(c.created_at)}</td>
        <td class="num">${c.orders}</td><td class="num">${money(c.spent_cents)}</td><td>${c.last_order ? when(c.last_order) : ""}</td>
        <td><input type="checkbox" data-cact${c.active ? " checked" : ""}${ro()}></td>
        ${isOwner() ? `<td class="row2" style="flex-wrap:nowrap"><button class="btn" data-cedit>Edit</button><button class="btn" data-cdel>Delete</button></td>` : ""}</tr>`).join("")}</table>` : `<p class="muted">No customers yet.${isOwner() ? " Use Add customer to set one up and give them a PIN." : ""}</p>`;
    lastList = list;
  };
  let lastList = [];
  const editForm = (c) => {
    const a = c.address || {};
    const f = (id, label, val = "", type = "text") => `<div class="field"><label class="eyebrow" for="${id}">${label}</label><input id="${id}" type="${type}" value="${esc(val)}"></div>`;
    document.getElementById("cNew").innerHTML = `<div class="panel" style="border-color:var(--blue)"><h2>Edit customer</h2><div class="grid2">${f("ec-n", "Name", c.name)}${f("ec-e", "Email", c.email, "email")}${f("ec-p", "Phone", c.phone, "tel")}</div>
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
  const askPin = (name) => new Promise((done) => {
    document.getElementById("pinShow").innerHTML = `<div class="panel"><h2>PIN for ${esc(name)}</h2>
      <div class="row2" style="align-items:end"><div class="field" style="max-width:16rem"><label class="eyebrow" for="pinIn">Type a 6 to 8 digit PIN, or leave blank to make one up</label><input id="pinIn" inputmode="numeric" maxlength="8" autocomplete="off"></div>
      <button class="btn solid" type="button" id="pinOk">Save PIN</button><button class="btn" type="button" id="pinNo">Cancel</button></div></div>`;
    window.scrollTo(0, 0); document.getElementById("pinIn").focus();
    document.getElementById("pinOk").onclick = () => done(document.getElementById("pinIn").value.trim());
    document.getElementById("pinNo").onclick = () => { document.getElementById("pinShow").innerHTML = ""; done(null); };
  });
  const givePin = async (id, name) => {
    const typed = await askPin(name); if (typed === null) return;
    if (typed && !/^\d{6,8}$/.test(typed)) { toast("Use 6 to 8 digits"); return givePin(id, name); }
    try { const r = await api(`/customers/${id}/pin`, { method: "POST", body: { pin: typed } }); showPin(name, r.pin); load(); } catch (e) { /* toast shown */ }
  };
  let t; document.getElementById("cq").oninput = (e) => { clearTimeout(t); t = setTimeout(() => { term = e.target.value; load(); }, 250); };
  if (document.getElementById("addC")) document.getElementById("addC").onclick = () => {
    const box = document.getElementById("cNew");
    if (box.innerHTML) { box.innerHTML = ""; return; }
    const f = (id, label, type = "text") => `<div class="field"><label class="eyebrow" for="${id}">${label}</label><input id="${id}" type="${type}"></div>`;
    box.innerHTML = `<div class="panel"><h2>Add customer</h2><div class="grid2">${f("nc-n", "Name")}${f("nc-e", "Email", "email")}${f("nc-p", "Phone", "tel")}</div>
      <div class="grid2">${f("nc-1", "Street address")}${f("nc-2", "Apt, suite")}${f("nc-c", "City")}${f("nc-s", "State")}${f("nc-z", "ZIP")}</div>
      <div class="field" style="max-width:20rem"><label class="eyebrow" for="nc-rep">Sales rep (for commission)</label><select id="nc-rep"><option value="">— none —</option>${activeReps.map((r) => `<option value="${r.id}">${esc(r.name)} · ${r.commission_rate}%</option>`).join("")}</select></div>
      <label class="chk"><input type="checkbox" id="nc-pin" checked> Give them a PIN now</label>
      <div class="row2"><button class="btn solid" type="button" id="ncSave">Add customer</button><button class="btn" type="button" id="ncCancel">Cancel</button></div></div>`;
    document.getElementById("ncCancel").onclick = () => { box.innerHTML = ""; };
    document.getElementById("ncSave").onclick = async () => {
      const g = (x) => document.getElementById(x).value;
      const r = await api("/customers", { method: "POST", body: { name: g("nc-n"), email: g("nc-e"), phone: g("nc-p"), repId: g("nc-rep") || null, address: { line1: g("nc-1"), line2: g("nc-2"), city: g("nc-c"), state: g("nc-s"), zip: g("nc-z") } } });
      const wantPin = document.getElementById("nc-pin").checked, name = g("nc-n");
      box.innerHTML = ""; toast("Customer added"); await load();
      if (wantPin) givePin(r.id, name);
    };
  };
  document.getElementById("ct").onclick = async (e) => {
    const link = e.target.closest("[data-cust-orders]");
    if (link) { e.preventDefault(); oFilter = { status: "", q: link.dataset.custOrders }; go("orders"); return; }
    const tr = e.target.closest("tr[data-cid]");
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
    const sel = e.target.closest("[data-rep]"); if (!sel) return;
    await api("/customers/" + sel.closest("tr").dataset.cid, { method: "PATCH", body: { repId: sel.value || null } });
    toast(sel.value ? "Sales rep assigned. New orders from this customer earn them commission." : "Sales rep removed");
  };
  load();
}

/* ---------- sales reps ---------- */
async function reps() {
  if (!isOwner()) return dashboard();
  const $ = (x) => document.getElementById(x);
  const { reps: list } = await api("/reps");
  pane().innerHTML = `<header><h1>Sales reps</h1><button class="btn solid" id="addRep">Add sales rep</button></header>
    <p class="muted">Reps sign in at <a href="/rep" target="_blank">/rep</a> (the rep app). They add their own customers and place orders for them; every order from one of their customers earns their commission rate, whether the rep or the customer placed it. Change the rate here; it applies to new orders.</p>
    <div id="repForm"></div>
    <div class="tblwrap"><table class="tbl" id="rt"><tr><th>Name</th><th>Email</th><th>Phone</th><th class="num">Rate %</th><th class="num">Customers</th><th class="num">Orders</th><th class="num">Sales (all)</th><th class="num">This month</th><th class="num">Owed now</th><th class="num">Paid out</th><th>Active</th><th>New password</th><th></th></tr>
    ${list.map((r) => `<tr data-rid="${r.id}"><td><input data-k="name" value="${esc(r.name)}"></td><td>${esc(r.email)}</td><td><input data-k="phone" value="${esc(r.phone)}" style="min-width:7rem"></td>
      <td class="num"><input data-k="rate" value="${r.commission_rate}" inputmode="decimal" style="width:4.5rem;text-align:right"></td>
      <td class="num">${r.customers}</td><td class="num">${r.orders}</td><td class="num">${money(r.sales_cents)}</td><td class="num">${money(r.month_cents)}</td><td class="num"><strong>${money(r.commission.earned)}</strong></td><td class="num">${money(r.commission.paid)}</td>
      <td><input type="checkbox" data-k="active"${r.active ? " checked" : ""}></td><td><input data-k="password" type="password" placeholder="Leave blank" autocomplete="new-password" style="min-width:7rem"></td>
      <td class="row2" style="flex-wrap:nowrap"><button class="btn" data-save>Save</button><button class="btn" data-comm="${r.id}">Commissions</button></td></tr>`).join("")}
    ${list.length ? "" : '<tr><td colspan="13" class="muted">No sales reps yet.</td></tr>'}</table></div>`;
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
  $("rt").onclick = async (e) => {
    const c = e.target.closest("[data-comm]"); if (c) { commFilter.rep = c.dataset.comm; go("commissions"); return; }
    if (!e.target.closest("[data-save]")) return;
    const tr = e.target.closest("tr"), body = {};
    tr.querySelectorAll("[data-k]").forEach((i) => { if (i.type === "checkbox") body.active = i.checked; else if (i.dataset.k !== "password" || i.value) body[i.dataset.k] = i.value; });
    await api("/reps/" + tr.dataset.rid, { method: "PATCH", body }); toast("Saved"); paneDirty = false; reps();
  };
}

/* ---------- commissions ---------- */
let commFilter = { rep: "", from: "", to: "", status: "" };
async function commissions() {
  if (!isOwner()) return dashboard();
  const $ = (x) => document.getElementById(x);
  const { reps: repList } = await api("/reps");
  pane().innerHTML = `<header><h1>Commissions</h1><a class="btn" id="cmCsv" href="#" style="display:inline-grid;place-items:center;text-decoration:none">Export CSV</a></header>
    <div class="filters"><select id="cm-rep"><option value="">All reps</option>${repList.map((r) => `<option value="${r.id}"${String(r.id) === String(commFilter.rep) ? " selected" : ""}>${esc(r.name)}</option>`).join("")}</select>
      <input id="cm-from" type="date" value="${esc(commFilter.from)}"><input id="cm-to" type="date" value="${esc(commFilter.to)}">
      <select id="cm-st"><option value="">All statuses</option>${["pending", "earned", "paid", "void"].map((x) => `<option value="${x}"${commFilter.status === x ? " selected" : ""}>${x}</option>`).join("")}</select>
      <button class="btn" id="cm-month" type="button">This month</button><button class="btn" id="cm-clear" type="button">Clear</button></div>
    <dl class="kpis" id="cmK"></dl>
    <div class="panel" id="cmPay" hidden></div>
    <div class="tblwrap" id="cmT"></div>
    <div id="cmHist"></div>
    <p class="muted"><strong>Pending</strong> = order not paid yet. <strong>Earned</strong> = order paid, commission owed. <strong>Paid</strong> = included in a payout. <strong>Void</strong> = order cancelled. Commission = product total after discount × the rep's rate when the order was placed.</p>`;
  const qs = () => new URLSearchParams(Object.fromEntries(Object.entries({ rep: commFilter.rep, from: commFilter.from, to: commFilter.to, status: commFilter.status }).filter(([, v]) => v))).toString();
  const load = async () => {
    const d = await api("/commissions?" + qs());
    $("cmCsv").href = "/api/admin/commissions.csv?" + qs();
    $("cmK").innerHTML = [["Sales (product total)", d.totals.sales], ["Pending", d.totals.pending], ["Earned, owed now", d.totals.earned], ["Paid out", d.totals.paid]].map(([k, v]) => `<div class="kpi"><dt>${k}</dt><dd>${money(v)}</dd></div>`).join("");
    const earned = d.rows.filter((r) => r.comm_status === "earned");
    $("cmT").innerHTML = d.rows.length ? `<table class="tbl"><tr><th>${earned.length ? '<input type="checkbox" id="cmAll" title="Select all earned">' : ""}</th><th>Date</th><th>Order</th><th>Rep</th><th>Customer</th><th>Order status</th><th class="num">Sales</th><th class="num">Rate</th><th class="num">Commission</th><th>Status</th></tr>
      ${d.rows.map((r) => `<tr><td>${r.comm_status === "earned" ? `<input type="checkbox" data-pick="${r.id}" data-rep="${r.rep_id}">` : ""}</td><td>${when(r.created_at)}</td><td class="mono"><a href="#" data-order="${r.id}">${esc(r.number)}</a></td><td>${esc(r.rep_name)}</td><td>${esc(r.customer)}</td><td>${pill(r.status)}</td>
        <td class="num">${money(r.subtotal_cents - r.discount_cents)}</td><td class="num">${r.commission_rate}%</td><td class="num"><strong>${money(r.commission_cents)}</strong></td><td><span class="pill st-${r.comm_status === "earned" ? "shipped" : r.comm_status === "paid" ? "delivered" : r.comm_status === "void" ? "cancelled" : "new"}">${r.comm_status}</span>${r.payout_date ? `<div class="muted" style="font-size:.72rem">${when(r.payout_date)}</div>` : ""}</td></tr>`).join("")}</table>` : `<p class="muted">No commissions match.</p>`;
    $("cmHist").innerHTML = d.payouts.length ? `<div class="panel"><h2>Payouts</h2><div class="tblwrap"><table class="tbl"><tr><th>Date</th><th>Rep</th><th class="num">Amount</th><th class="num">Orders</th><th>Note</th><th>By</th><th></th></tr>
      ${d.payouts.map((p) => `<tr><td>${when(p.paid_at)}</td><td>${esc(p.rep_name || "")}</td><td class="num"><strong>${money(p.amount_cents)}</strong></td><td class="num">${p.orders}</td><td>${esc(p.note)}</td><td>${esc(p.who)}</td><td><button class="btn" data-undo="${p.id}">Undo</button></td></tr>`).join("")}</table></div></div>` : "";
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
}

/* ---------- products ---------- */
async function products() {
  const [{ products: list }, { reports: reps }] = await Promise.all([api("/products"), api("/reports")]);
  const repFor = (p) => reps.filter((r) => r.active && reportMatches(p, r));
  const COLS = [["name", "Name"], ["strength", "Size"], ["category", "Category"], ["manufacturer", "Manufacturer"], ["cost", "Cost $"], ["price", "Price $"], ["stock", "Stock"], ["maxPerOrder", "Max/order"], ["sort", "Sort"], ["active", "Active"], ["description", "Description"], ["report", "Lab report"], ["docs", "Docs"]];
  const NUM = new Set(["cost", "price", "stock", "maxPerOrder", "sort"]);
  const inp = (k, v, ph = "", extra = "") => `<input data-k="${k}" value="${esc(v)}" placeholder="${ph}"${extra}${ro()}>`;
  const row = (p) => `<tr data-id="${p ? p.id : ""}"${p ? "" : ' class="dirty"'}>
    <td>${inp("name", p?.name, "Name", ' style="min-width:16rem"')}</td>
    <td>${inp("strength", p?.strength, "10 mg", ' style="min-width:4.5rem"')}</td>
    <td>${inp("category", p?.category ?? "Research peptide", "Category", ' list="catlist" style="min-width:9rem"')}</td>
    <td>${inp("manufacturer", p?.manufacturer, "", ' list="mfrlist" style="min-width:7rem"')}</td>
    <td>${inp("cost", dollars(p?.cost_cents), "—", ' inputmode="decimal" style="min-width:4.5rem" title="Our cost per vial (staff never see it on the store)"')}</td>
    <td>${inp("price", dollars(p?.price_cents), "Ask", ' inputmode="decimal" style="min-width:5rem"')}</td>
    <td>${inp("stock", p?.stock ?? "", "∞", ' inputmode="numeric" style="min-width:4rem"')}</td>
    <td>${inp("maxPerOrder", p?.max_per_order ?? "", "—", ' inputmode="numeric" style="min-width:4rem"')}</td>
    <td>${inp("sort", p?.sort ?? 0, "", ' inputmode="numeric" style="min-width:3.5rem"')}</td>
    <td><input type="checkbox" data-k="active"${!p || p.active ? " checked" : ""}${ro()}></td>
    <td>${inp("description", p?.description, "Short line under the name")}</td>
    <td data-rep>${p ? (repFor(p).length ? repFor(p).map((r) => `<span class="pill st-shipped" title="Task ${esc(r.task)}">${esc(r.sample || r.product + " " + r.strength)}</span>`).join(" ") : '<span class="pill st-cancelled">No report</span>') : ""}</td>
    <td data-docs>${p ? `<button class="btn" type="button" data-manage="${p.id}" title="COA and documents for this peptide">${p.doc_count ? `${p.doc_count} doc${p.doc_count === 1 ? "" : "s"} · ` : ""}Manage</button>` : '<span class="muted">Save first</span>'}</td>
    ${isOwner() ? `<td class="row2" style="flex-wrap:nowrap"><button class="btn" data-save>Save</button><button class="btn" data-del>${p ? "Delete" : "Remove"}</button></td>` : ""}
  </tr>`;
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
  pane().innerHTML = `<header><h1>Products &amp; prices</h1><div class="row2">${isOwner() ? `<button class="btn" id="impP">Import from file</button><button class="btn" id="addP">Add product</button>${list.length ? `<button class="btn danger" id="clrP">Remove all products</button>` : ""}` : ""}</div></header>
    <div id="impBox"></div><div id="manageBox"></div>
    <p class="muted">Click a column name to sort. Cost = what you pay per vial (never shown on the store). Price blank = "Ask for price" (not buyable). Stock blank = not tracked. Max per order blank = no limit. "Sort" sets the order on the store (lower shows first). Untick Active to hide a product. A lab report attaches to a product when the peptide name, size and manufacturer match.</p>
    ${(() => { const n = list.filter((p) => p.active && !repFor(p).length).length; return n ? `<p class="muted"><strong>${n} active product${n === 1 ? " has" : "s have"} no lab report.</strong> Sort by the Lab report column to see them.</p>` : ""; })()}
    ${markupBar}
    ${saveBar}
    <datalist id="catlist">${cats.map((c) => `<option value="${esc(c)}">`).join("")}</datalist>
    <datalist id="mfrlist">${[...new Set(list.map((p) => p.manufacturer).filter(Boolean))].map((c) => `<option value="${esc(c)}">`).join("")}</datalist>
    <div class="tblwrap"><table class="tbl" id="pt"><thead><tr>${COLS.map(([k, l]) => `<th class="sortable" data-sort="${k}">${l}<span class="arr"></span></th>`).join("")}${isOwner() ? "<th></th>" : ""}</tr></thead>
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
  if (document.getElementById("addP")) document.getElementById("addP").onclick = () => { pb.insertAdjacentHTML("afterbegin", row(null)); refresh(); pb.querySelector("tr input").focus(); };
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
async function inventory() {
  const { items } = await api("/inventory");
  const own = isOwner();
  const label = (p) => `${p.name} ${p.strength}`.trim();
  const sub = (p) => [p.manufacturer, p.active ? "" : "hidden"].filter(Boolean).join(" · ");
  const soon = (d) => d && (new Date(d) - Date.now()) / 864e5 <= 60;
  const status = (p) => p.stock === null ? "untracked" : p.stock <= 0 ? "out" : p.stock <= (p.reorder_point ?? 5) ? "low" : "ok";
  const pillFor = { ok: '<span class="pill st-shipped">In stock</span>', low: '<span class="pill st-new">Low</span>', out: '<span class="pill st-cancelled">Out</span>', untracked: '<span class="pill">Not tracked</span>' };
  const tracked = items.filter((p) => p.stock !== null);
  const value = tracked.reduce((t, p) => t + (p.cost_cents ? p.cost_cents * Math.max(0, p.stock) : 0), 0);
  const counts = { low: items.filter((p) => status(p) === "low").length, out: items.filter((p) => status(p) === "out").length, untracked: items.filter((p) => p.stock === null).length, expiring: items.filter((p) => soon(p.next_expiry)).length };
  const weeksLeft = (p) => (p.stock > 0 && p.sold_30d > 0 ? Math.round((p.stock / p.sold_30d) * 30 / 7) : null);
  pane().innerHTML = `<header><h1>Inventory</h1><div class="row2"><button class="btn solid" id="rcvBtn">Receive shipment</button><a class="btn" href="/api/admin/inventory.csv" style="display:inline-grid;place-items:center;text-decoration:none">Export CSV</a></div></header>
    <dl class="kpis">
      <div class="kpi"><dt>Products tracked</dt><dd>${tracked.length}</dd></div>
      <div class="kpi"><dt>Units available</dt><dd>${tracked.reduce((t, p) => t + Math.max(0, p.stock), 0)}</dd></div>
      ${own ? `<div class="kpi"><dt>Stock value at cost</dt><dd>${money(value)}</dd></div>` : ""}
      <div class="kpi" data-invf="low"><dt>Low stock</dt><dd>${counts.low}</dd></div>
      <div class="kpi" data-invf="out"><dt>Out of stock</dt><dd>${counts.out}</dd></div>
      <div class="kpi" data-invf="expiring"><dt>Lots expiring ≤ 60 days</dt><dd>${counts.expiring}</dd></div>
    </dl>
    <div id="invPanel"></div>
    <div class="filters"><input id="invQ" type="search" placeholder="Search name, maker or code">
      ${[["all", "All"], ["low", "Low"], ["out", "Out"], ["expiring", "Expiring"], ["untracked", "Not tracked"]].map(([k, l]) => `<button class="chip${invFilter === k ? " on" : ""}" type="button" data-invf="${k}">${l}${counts[k] ? ` (${counts[k]})` : ""}</button>`).join("")}</div>
    <p class="muted">Available is what customers can still buy. Stock comes off when an order is placed and goes back if it's cancelled; "In orders" is stock held by orders not yet shipped, so On shelf = Available + In orders. Every change is kept in each product's History.</p>
    <div class="tblwrap"><table class="tbl compact" id="invT"><thead><tr><th>Product</th><th class="num">Available</th><th class="num">In orders</th><th class="num">On shelf</th><th class="num">Sold 30d</th><th class="num">Reorder at</th>${own ? '<th class="num">Cost each</th><th class="num">Value</th>' : ""}<th>Next expiry</th><th>Status</th><th></th></tr></thead><tbody id="invB"></tbody></table></div>`;
  const draw = () => {
    const term = (document.getElementById("invQ").value || "").toLowerCase();
    const list = items.filter((p) => (invFilter === "all" || (invFilter === "expiring" ? soon(p.next_expiry) : status(p) === invFilter))
      && (!term || [p.name, p.strength, p.manufacturer].join(" ").toLowerCase().includes(term)));
    document.getElementById("invB").innerHTML = list.length ? list.map((p) => `<tr data-iid="${p.id}">
      <td class="namecol" title="${esc(label(p))}"><strong>${esc(label(p))}</strong>${sub(p) ? `<div class="muted" style="font-size:.78rem">${esc(sub(p))}</div>` : ""}</td>
      <td class="num"><strong>${p.stock ?? "—"}</strong></td><td class="num">${p.committed || ""}</td><td class="num">${p.stock === null ? "" : p.stock + p.committed}</td>
      <td class="num">${p.sold_30d || ""}${weeksLeft(p) !== null ? `<div class="muted" style="font-size:.72rem">~${weeksLeft(p)} wk left</div>` : ""}</td>
      <td class="num">${own ? `<input data-reorder value="${p.reorder_point ?? ""}" placeholder="5" inputmode="numeric" style="width:4.2rem;text-align:right">` : (p.reorder_point ?? 5)}</td>
      ${own ? `<td class="num"><input data-cost value="${dollars(p.cost_cents)}" placeholder="—" inputmode="decimal" style="width:5.5rem;text-align:right"></td><td class="num">${p.cost_cents !== null && p.stock !== null ? money(p.cost_cents * Math.max(0, p.stock)) : ""}</td>` : ""}
      <td>${p.next_expiry ? `<span${soon(p.next_expiry) ? ' class="pill st-new"' : ""}>${esc(String(p.next_expiry).slice(0, 10))}</span>` : ""}</td>
      <td>${pillFor[status(p)]}</td>
      <td><div class="acts"><button class="btn" data-act="receive">Receive</button>${p.stock === null ? (own ? '<button class="btn" data-act="track">Track</button>' : "") : '<button class="btn" data-act="adjust">Adjust</button>'}<button class="btn" data-act="history">History</button></div></td></tr>`).join("")
      : `<tr><td colspan="11" class="muted">Nothing here.</td></tr>`;
  };
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
        <td class="mono">${esc(m.lot)}</td><td>${m.expires ? esc(String(m.expires).slice(0, 10)) : ""}</td>${own ? `<td class="num">${m.cost_cents !== null ? money(m.cost_cents) : ""}</td>` : ""}<td class="mono">${m.ref ? (m.reason.startsWith("Order") ? `<a href="#" data-orderq="${esc(m.ref)}">${esc(m.ref)}</a>` : esc(m.ref)) : ""}</td><td>${esc(m.who)}</td><td>${esc(m.note)}</td></tr>`).join("")}</table></div>`
      : `<p class="muted">No stock changes recorded yet.</p>`}</div>`;
    panel.querySelectorAll("[data-orderq]").forEach((a) => (a.onclick = (e) => { e.preventDefault(); oFilter = { status: "", q: a.dataset.orderq }; go("orders"); }));
    panel.scrollIntoView({ behavior: "smooth", block: "start" });
  };
  document.getElementById("rcvBtn").onclick = () => receiveForm(null);
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
  return new Promise((ok, no) => { const sc = document.createElement("script"); sc.src = "https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js"; sc.onload = ok; sc.onerror = () => no(new Error("Couldn't load the spreadsheet reader")); document.head.appendChild(sc); });
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
      <div class="grid2">${f("product", "Peptide (as listed)", r.product)}${f("strength", "Size, e.g. 10 mg", r.strength)}${f("sample", "Sample line", r.sample)}
      ${f("task", "Task number", r.task)}${f("key", "Unique key", r.key)}${f("verifyUrl", "Verify link (https)", r.verifyUrl)}
      ${f("lab", "Lab", r.lab)}${f("client", "Client", r.client)}${f("manufacturer", "Manufacturer", r.manufacturer)}${f("batch", "Batch", r.batch)}
      ${f("ordered", "Testing ordered", r.ordered, 'type="date"')}${f("received", "Sample received", r.received, 'type="date"')}${f("tested", "Analysis conducted", r.tested, 'type="date"')}
      ${f("testsRequested", "Tests requested", r.testsRequested)}</div>
      <div class="field"><label class="eyebrow">Results rows (name, value)</label><div id="rres" class="stack">${(r.results || []).map(([n, v]) => `<div class="row2"><input value="${esc(n)}" placeholder="BPC-157 or Purity" style="flex:1;height:2.4rem;padding:0 .7rem;border:1px solid var(--line-strong);border-radius:8px"${ro()}><input value="${esc(v)}" placeholder="10.95 mg" style="flex:1;height:2.4rem;padding:0 .7rem;border:1px solid var(--line-strong);border-radius:8px"${ro()}></div>`).join("")}</div>
      ${isOwner() ? `<button class="linkbtn" type="button" id="addRow" style="justify-self:start">+ Add a results row</button>` : ""}</div>
      <div class="field"><label class="eyebrow">Report file (PDF, JPG or PNG, under 10 MB)${r.image ? ` — leave empty to keep the current one (<a href="${esc(r.image)}" target="_blank" rel="noopener">open current</a>)` : ""}</label><input type="file" id="rimg" accept="application/pdf,image/jpeg,image/png,image/webp"${ro()}></div>
      <label class="chk"><input type="checkbox" id="ract"${r.active ? " checked" : ""}${ro()}> Show on the site</label>
      ${isOwner() ? `<div class="row2"><button class="btn solid" id="rsave">Save report</button>${r.id ? `<button class="btn" id="rdel">Delete</button>` : ""}<button class="btn" id="rcancel">Cancel</button></div>` : ""}</div>`;
    const $ = (x) => document.getElementById(x);
    if (!isOwner()) return;
    $("addRow").onclick = () => $("rres").insertAdjacentHTML("beforeend", `<div class="row2"><input placeholder="Name" style="flex:1;height:2.4rem;padding:0 .7rem;border:1px solid var(--line-strong);border-radius:8px"><input placeholder="Value" style="flex:1;height:2.4rem;padding:0 .7rem;border:1px solid var(--line-strong);border-radius:8px"></div>`);
    $("rcancel").onclick = () => { $("rform").innerHTML = ""; };
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
        <div class="field"><label class="eyebrow" for="dcKind">Type</label><select id="dcKind"><option value="percent">Percent off</option><option value="amount">Dollars off</option></select></div>
        <div class="field"><label class="eyebrow" for="dcValue">Amount</label><input id="dcValue" inputmode="decimal" placeholder="%"></div>
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
  $("dcKind").onchange = () => { $("dcValue").placeholder = $("dcKind").value === "percent" ? "%" : "$"; };
  $("dcGen").onclick = async () => { const r = await api("/discounts/new-code?prefix=" + encodeURIComponent($("dcCode").value.replace(/-.*$/, "").trim())); $("dcCode").value = r.code; };
  $("dcSave").onclick = async () => {
    const body = { code: $("dcCode").value, kind: $("dcKind").value, value: $("dcValue").value, minSubtotal: $("dcMin").value, maxUses: $("dcUses").value, expires: $("dcExp").value, note: $("dcNote").value };
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
async function settings() {
  const { settings: s, stripe: st, mail: ml, baseUrl } = await api("/settings");
  const t = (k, label, help = "") => `<div class="field"><label class="eyebrow" for="s-${k}">${label}</label><input id="s-${k}" value="${esc(s[k])}"${ro()}>${help ? `<span class="muted">${help}</span>` : ""}</div>`;
  const ta = (k, label, help = "") => `<div class="field"><label class="eyebrow" for="s-${k}">${label}</label><textarea id="s-${k}"${ro()}>${esc(s[k])}</textarea>${help ? `<span class="muted">${help}</span>` : ""}</div>`;
  const site = baseUrl || location.origin;
  // which sending account is picked: what's saved, else Microsoft 365 (so the login boxes show right away), unless the host already has settings
  const prov0 = s.mailMode === "resend" ? "resend" : s.mailMode === "graph" ? "graph" : s.mailMode === "smtp" ? (/office365|outlook/i.test(s.mailHost || "") ? "microsoft" : /gmail|google/i.test(s.mailHost || "") ? "google" : "smtp") : (ml && ml.ready && ml.source === "host" ? "" : "graph");
  pane().innerHTML = `<header><h1>Site settings</h1></header>
    <div class="panel"><h2>Store</h2>
      <label class="chk"><input type="checkbox" id="s-storeOpen"${s.storeOpen ? " checked" : ""}${ro()}> Taking orders (untick to pause checkout)</label>
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
    <div class="panel"><h2>Order emails</h2>
      <p>${ml && ml.ready ? `<span class="pill st-shipped">Email connected</span> Sending through ${esc(ml.detail)} as ${esc(ml.from)}${ml.source === "host" ? " (from the settings on the host)" : ""}.` : `<span class="pill st-cancelled">Email not connected</span> Orders are saved here, but no emails go out until a sending account is saved below.`}</p>
      <div class="grid2">${t("orderEmail", "Send every order to", "You get a message for each new order and each card payment")}</div>
      <label class="chk"><input type="checkbox" id="s-orderEmailOn"${s.orderEmailOn ? " checked" : ""}${ro()}> Email me every order</label>
      <label class="chk"><input type="checkbox" id="s-customerEmailOn"${s.customerEmailOn ? " checked" : ""}${ro()}> Email the customer a confirmation (and a receipt when they pay by card)</label>
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
      ${isOwner() ? `<div class="row2" style="align-items:center"><button class="btn solid" id="mailSave">Save sending account</button><button class="btn" id="mailTest">Send a test email</button>${s.mailPassSet || s.resendKeySet || s.graphSecretSet ? `<button class="btn" id="mailClear">Forget saved password / secret</button>` : ""}<span class="muted" id="mailTestOut"></span></div>` : ""}
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
        <p class="muted" style="margin-top:.6rem"><strong>Resend</strong> (no mailbox password needed): sign up at resend.com, add and verify the domain 360medical.net with the DNS records they show, create an API key and paste it here with a From address on that domain.</p></details></div>
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
    <div class="panel"><h2>Disclaimers &amp; policies</h2><p class="muted">One paragraph per line. Start a line with "Heading: " to show a bold heading. Have your attorney review these before you rely on them.</p>
      ${[["footerNotice", "Footer notice (every page)"], ["disclaimers", "Disclaimer"], ["policyTerms", "Terms of service"], ["policyReturns", "Refund and returns policy"], ["policyShipping", "Shipping policy"], ["policyPrivacy", "Privacy policy"]]
        .map(([k, label]) => `<div class="field"><label class="eyebrow" for="s-${k}">${label}</label><textarea id="s-${k}" style="min-height:12rem"${ro()}>${esc((s[k] || []).join("\n"))}</textarea></div>`).join("")}</div>
    ${isOwner() ? `<div><button class="btn solid" id="sSave">Save settings</button></div>` : `<p class="muted">Only the owner can change settings.</p>`}`;
  if (!isOwner()) return;
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
    const v = (k) => document.getElementById("s-" + k);
    const body = {};
    ["brand", "tagline", "contact", "distributorOf", "brandUrl", "paymentInstructions", "priceNote", "shippingLabel", "shippingNote", "fedexAccount", "deliveryLabel", "deliveryNote", "orderEmail"].forEach((k) => { body[k] = v(k).value; });
    ["storeOpen", "ageGate", "shippingOn", "deliveryOn", "cardPayments", "orderEmailOn", "customerEmailOn"].forEach((k) => { body[k] = v(k).checked; });
    body.minAge = v("minAge").value;
    const cents = (id) => Math.max(0, Math.round(parseFloat(String(v(id).value).replace(/[$,]/g, "") || 0) * 100));
    body.minOrderCents = cents("minOrder"); body.shippingCents = cents("shippingAmt"); body.shippingFreeOverCents = cents("shippingFree");
    ["footerNotice", "disclaimers", "policyTerms", "policyReturns", "policyShipping", "policyPrivacy"].forEach((k) => { body[k] = v(k).value.split("\n").map((x) => x.trim()).filter(Boolean); });
    body.announcementOn = false;
    if (!v("shippingOn").checked && !v("deliveryOn").checked && !confirm("Neither shipping nor delivery is offered: checkout will say shipping is confirmed with the order. Save anyway?")) return;
    await api("/settings", { method: "PUT", body }); toast("Settings saved"); paneDirty = false;
  };
  const prov = document.getElementById("s-mailProvider");
  const mailFields = () => {
    const p = prov.value;
    const isSmtp = p === "microsoft" || p === "google" || p === "smtp";
    pane().querySelectorAll(".mail-smtp, .mail-resend, .mail-graph").forEach((el) => { el.hidden = !((el.classList.contains("mail-smtp") && isSmtp) || (el.classList.contains("mail-resend") && p === "resend") || (el.classList.contains("mail-graph") && p === "graph")); });
    const host = document.getElementById("s-mailHost"), port = document.getElementById("s-mailPort");
    if (p === "microsoft") { host.value = "smtp.office365.com"; port.value = "587"; }
    if (p === "google") { host.value = "smtp.gmail.com"; port.value = "465"; }
    host.readOnly = port.readOnly = p === "microsoft" || p === "google";
  };
  mailFields(); prov.onchange = mailFields;
  const mailBody = () => {
    const v = (k) => document.getElementById("s-" + k);
    const p = prov.value;
    return { mailMode: p === "resend" ? "resend" : p === "graph" ? "graph" : p ? "smtp" : "", mailHost: v("mailHost").value, mailPort: v("mailPort").value, mailUser: v("mailUser").value, mailPass: v("mailPass").value, mailFrom: v("mailFrom").value, resendKey: v("resendKey").value,
      graphTenant: v("graphTenant").value, graphClient: v("graphClient").value, graphSecret: v("graphSecret").value,
      orderEmail: v("orderEmail").value, orderEmailOn: v("orderEmailOn").checked, customerEmailOn: v("customerEmailOn").checked };
  };
  if (document.getElementById("mailSave")) document.getElementById("mailSave").onclick = async () => {
    const b = mailBody();
    if (b.mailMode === "smtp" && (!b.mailUser || (!b.mailPass && !s.mailPassSet))) return toast("Enter the login email and password");
    if (b.mailMode === "resend" && !b.resendKey && !s.resendKeySet) return toast("Paste the Resend API key");
    if (b.mailMode === "graph" && (!b.graphTenant || !b.graphClient || !b.mailUser || (!b.graphSecret && !s.graphSecretSet))) return toast("Enter the tenant ID, client ID, secret and the mailbox");
    await api("/settings", { method: "PUT", body: b }); toast("Sending account saved"); paneDirty = false; settings();
  };
  if (document.getElementById("mailClear")) document.getElementById("mailClear").onclick = async () => {
    if (!confirm("Forget the saved mail password / API key? The store stops sending until a new one is saved (unless the host has its own settings).")) return;
    await api("/mail/clear", { method: "POST" }); toast("Forgotten"); settings();
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

/* ---------- staff ---------- */
async function staff() {
  if (!isOwner()) return dashboard();
  const { users } = await api("/users");
  pane().innerHTML = `<header><h1>Staff logins</h1></header>
    <p class="muted">Staff can view and work orders (status, tracking, notes). Only owners can change prices, charges, reports, shipping, settings and logins. Sales reps have their own logins under <button class="linkbtn" data-nav="reps">Sales reps</button>.</p>
    <div class="tblwrap"><table class="tbl" id="ut"><tr><th>Name</th><th>Email</th><th>Role</th><th>Active</th><th>New password</th><th></th></tr>
    ${users.map((u) => `<tr data-id="${u.id}"><td><input data-k="name" value="${esc(u.name)}"></td><td>${esc(u.email)}</td>
      <td><select data-k="role"><option${u.role === "staff" ? " selected" : ""}>staff</option><option${u.role === "owner" ? " selected" : ""}>owner</option></select></td>
      <td><input type="checkbox" data-k="active"${u.active ? " checked" : ""}></td><td><input data-k="password" type="password" placeholder="Leave blank" autocomplete="new-password"></td>
      <td><button class="btn" data-save>Save</button></td></tr>`).join("")}</table></div>
    <div class="panel"><h2>Add a login</h2><div class="grid2">
      <div class="field"><label class="eyebrow" for="nu-n">Name</label><input id="nu-n"></div>
      <div class="field"><label class="eyebrow" for="nu-e">Email</label><input id="nu-e" type="email"></div>
      <div class="field"><label class="eyebrow" for="nu-p">Temporary password (10+ characters)</label><input id="nu-p" type="password" autocomplete="new-password"></div>
      <div class="field"><label class="eyebrow" for="nu-r">Role</label><select id="nu-r"><option>staff</option><option>owner</option></select></div></div>
      <div><button class="btn solid" id="nuAdd">Add login</button></div></div>`;
  document.getElementById("ut").onclick = async (e) => {
    if (!e.target.closest("[data-save]")) return;
    const tr = e.target.closest("tr"), body = {};
    tr.querySelectorAll("[data-k]").forEach((i) => { if (i.type === "checkbox") body.active = i.checked; else if (i.dataset.k !== "password" || i.value) body[i.dataset.k] = i.value; });
    await api("/users/" + tr.dataset.id, { method: "PATCH", body }); toast("Saved"); staff();
  };
  document.getElementById("nuAdd").onclick = async () => {
    const g = (x) => document.getElementById(x).value;
    await api("/users", { method: "POST", body: { name: g("nu-n"), email: g("nu-e"), password: g("nu-p"), role: g("nu-r") } });
    toast("Login added"); staff();
  };
}

/* ---------- account ---------- */
function account() {
  pane().innerHTML = `<header><h1>My account</h1></header>
    <div class="panel" style="max-width:28rem"><h2>Change password</h2>
      <div class="field"><label class="eyebrow" for="pc">Current password</label><input id="pc" type="password" autocomplete="current-password"></div>
      <div class="field"><label class="eyebrow" for="pn">New password (10+ characters)</label><input id="pn" type="password" autocomplete="new-password"></div>
      <div><button class="btn solid" id="pSave">Change password</button></div>
      <p class="muted">Changing it signs you out everywhere else.</p></div>`;
  document.getElementById("pSave").onclick = async () => {
    await fetch("/api/admin/password", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ current: pc.value, next: pn.value }) })
      .then(async (r) => { const j = await r.json(); toast(r.ok ? "Password changed" : j.error); if (r.ok) { pc.value = pn.value = ""; } });
  };
}

/* ---------- clicks ---------- */
document.addEventListener("click", (e) => {
  const n = e.target.closest("[data-nav]"); if (n) { go(n.dataset.nav); return; }
  const k = e.target.closest("[data-go]"); if (k) { const [v, st] = k.dataset.go.split(":"); if (st) oFilter = { status: st, q: "" }; go(v); return; }
  const o = e.target.closest("[data-order]"); if (o) { go("orders", o.dataset.order); }
});

if (window.AppRefresh) window.AppRefresh.init({
  version: "/api/version",
  canAuto: () => !!me && !unsaved && !paneDirty && !document.querySelector("dialog[open]") && !/^(INPUT|TEXTAREA|SELECT)$/.test((document.activeElement || {}).tagName || "") && !document.getElementById("impPrev"),
  refresh: async () => { if (me) go(view, orderId, { keepScroll: true, silent: true }); }
});

(async () => {
  // order emails link straight to an order: /admin#order-123
  const m = /^#order-(\d+)$/.exec(location.hash);
  if (m) { view = "orders"; orderId = m[1]; history.replaceState(null, "", location.pathname); }
  const res = await fetch("/api/admin/me");
  if (res.ok) { me = (await res.json()).user; shell(); } else drawLogin();
})();
})();
