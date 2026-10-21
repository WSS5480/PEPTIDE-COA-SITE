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
  const res = await fetch("/api/admin" + path, { method: opts.method || "GET", headers: opts.body ? { "Content-Type": "application/json" } : {}, body: opts.body ? JSON.stringify(opts.body) : undefined, credentials: "same-origin" });
  if (res.status === 401) { me = null; drawLogin(); throw new Error("signed out"); }
  const j = await res.json().catch(() => ({}));
  if (!res.ok) { toast(j.error || "That didn't work"); throw new Error(j.error || "error"); }
  return j;
}

let me = null, view = "dashboard", orderId = null, stats = null;
const isOwner = () => me && me.role === "owner";

/* ---------- login ---------- */
function drawLogin(msg) {
  app.innerHTML = `<div class="login"><form id="lf">
    <h1>Store admin</h1><p class="muted">Sign in to manage orders, prices and the site.</p>
    <div class="field"><label class="eyebrow" for="le">Email</label><input id="le" type="email" autocomplete="username" required></div>
    <div class="field"><label class="eyebrow" for="lp">Password</label><input id="lp" type="password" autocomplete="current-password" required></div>
    ${msg ? `<div class="err">${esc(msg)}</div>` : ""}
    <button class="btn solid wide">Sign in</button><button class="btn wide" type="button" data-install>Download admin app</button></form></div>`;
  document.getElementById("lf").onsubmit = async (e) => {
    e.preventDefault();
    const res = await fetch("/api/admin/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: le.value, password: lp.value }) });
    const j = await res.json();
    if (!res.ok) return drawLogin(j.error);
    me = j.user; shell();
  };
}

/* ---------- shell ---------- */
const NAV = [["dashboard", "Dashboard"], ["orders", "Orders"], ["customers", "Customers"], ["products", "Products & prices"], ["reports", "Lab reports"], ["shipping", "Shipping"], ["settings", "Site settings"], ["staff", "Staff logins", true], ["account", "My account"]];
function shell() {
  app.innerHTML = `<div class="mtop"><strong>Store admin</strong><button type="button" id="mm">Menu</button></div>
  <div class="adm" id="adm"><aside class="side">
    <div class="logo"><span>Admin</span><small>Store manager</small></div>
    <nav id="nav"></nav>
    <div class="who"><span>${esc(me.name || me.email)} · ${esc(me.role)}</span><a href="/" target="_blank" style="color:#fff">View store ↗</a><button type="button" data-install>Download admin app</button><button type="button" id="lo">Sign out</button></div>
  </aside><section class="pane" id="pane"></section></div>`;
  document.getElementById("lo").onclick = async () => { await fetch("/api/admin/logout", { method: "POST" }); me = null; drawLogin(); };
  document.getElementById("mm").onclick = () => document.getElementById("adm").classList.toggle("menu");
  go(view);
}
async function drawNav() {
  try { stats = await api("/stats"); } catch (e) { return; }
  const n = stats.byStatus.new || 0;
  document.getElementById("nav").innerHTML = NAV.filter(([, , o]) => !o || isOwner()).map(([k, label]) => `<button type="button" data-nav="${k}" class="${view === k ? "on" : ""}">${label}${k === "orders" && n ? `<span class="badge">${n}</span>` : ""}</button>`).join("");
}
function go(v, id) {
  view = v; orderId = id || null;
  const adm = document.getElementById("adm"); if (adm) adm.classList.remove("menu");
  drawNav();
  ({ dashboard, orders, customers, products, reports, shipping, settings, staff, account }[v] || dashboard)();
  window.scrollTo(0, 0);
}
const pane = () => document.getElementById("pane");
const ro = () => (isOwner() ? "" : " disabled");

/* ---------- dashboard ---------- */
async function dashboard() {
  const s = stats || (await api("/stats"));
  const b = s.byStatus;
  pane().innerHTML = `<header><h1>Dashboard</h1></header>
    <dl class="kpis">
      <div class="kpi" data-go="orders:new"><dt>New orders</dt><dd>${b.new || 0}</dd></div>
      <div class="kpi" data-go="orders:confirmed"><dt>Waiting for payment</dt><dd>${b.confirmed || 0}</dd></div>
      <div class="kpi" data-go="orders:paid"><dt>Paid, to ship</dt><dd>${b.paid || 0}</dd></div>
      <div class="kpi" data-go="orders:shipped"><dt>Shipped</dt><dd>${b.shipped || 0}</dd></div>
      <div class="kpi"><dt>Paid this month</dt><dd>${money(s.month.paid_cents)}</dd></div>
    </dl>
    ${s.unpriced ? `<div class="panel"><strong>${s.unpriced} product${s.unpriced === 1 ? " has" : "s have"} no price.</strong><span class="muted">They show "Ask for price" and can't be added to the cart.</span><div><button class="btn" data-nav="products">Set prices</button></div></div>` : ""}
    ${s.lowStock.length ? `<div class="panel"><h2>Low stock</h2><div class="tblwrap"><table class="tbl"><tr><th>Product</th><th class="num">Left</th></tr>${s.lowStock.map((p) => `<tr><td>${esc(p.name)} ${esc(p.strength)}</td><td class="num">${p.stock}</td></tr>`).join("")}</table></div></div>` : ""}
    <div class="panel"><h2>How orders flow</h2><p class="muted">New → Confirmed (you've sent the total and payment info) → Paid → Shipped (add carrier and tracking) → Delivered. Cancelling puts the stock back.</p></div>`;
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
    document.getElementById("ot").innerHTML = list.length ? `<table class="tbl"><tr><th>Order</th><th>Placed</th><th>Customer</th><th class="num">Items</th><th class="num">Total</th><th>Status</th><th>Tracking</th></tr>
      ${list.map((o) => `<tr class="click" data-order="${o.id}"><td class="mono">${esc(o.number)}</td><td>${when(o.created_at)}</td><td>${esc(o.name)}<br><span class="muted">${esc(o.email)}</span></td><td class="num">${o.items}</td><td class="num">${money(o.total_cents)}</td><td>${pill(o.status)}</td><td class="mono">${esc(o.tracking)}</td></tr>`).join("")}</table>` : `<p class="muted">No orders${oFilter.status || oFilter.q ? " match" : " yet"}.</p>`;
  };
  document.getElementById("of").onchange = (e) => { oFilter.status = e.target.value; load(); };
  let t; document.getElementById("oq").oninput = (e) => { clearTimeout(t); t = setTimeout(() => { oFilter.q = e.target.value; load(); }, 250); };
  load();
}
async function orderDetail(id) {
  const { order: o, items, events } = await api("/orders/" + id);
  const a = o.address || {};
  const addr = [a.line1, a.line2, `${a.city || ""}, ${a.state || ""} ${a.zip || ""}`].filter((x) => x && x.trim() !== ",").map(esc).join("<br>");
  pane().innerHTML = `<header><h1>Order ${esc(o.number)}</h1><button class="btn" data-nav="orders">← All orders</button></header>
  <div class="two">
    <div class="stack">
      <div class="panel"><h2>Items</h2><div class="tblwrap"><table class="tbl"><tr><th>Product</th><th class="num">Qty</th><th class="num">Each</th><th class="num">Line</th></tr>
        ${items.map((i) => `<tr><td>${esc(i.name)} ${esc(i.strength)}</td><td class="num">${i.qty}</td><td class="num">${money(i.unit_cents)}</td><td class="num">${money(i.unit_cents * i.qty)}</td></tr>`).join("")}
        <tr><td colspan="3">Subtotal</td><td class="num">${money(o.subtotal_cents)}</td></tr>
        <tr><td colspan="3">Discount</td><td class="num">${isOwner() ? `<input id="odisc" value="${dollars(o.discount_cents)}" inputmode="decimal" style="max-width:7rem;margin-left:auto">` : money(o.discount_cents)}</td></tr>
        <tr><td colspan="3">Shipping${o.shipping_method ? ` (${esc(o.shipping_method)})` : ""}</td><td class="num">${isOwner() ? `<input id="oship" value="${dollars(o.shipping_cents)}" inputmode="decimal" style="max-width:7rem;margin-left:auto">` : money(o.shipping_cents)}</td></tr>
        <tr><td colspan="3"><strong>Total</strong></td><td class="num"><strong>${money(o.total_cents)}</strong></td></tr></table></div>
        ${isOwner() ? `<div><button class="btn" id="saveMoney">Update charges</button></div>` : ""}</div>
      <div class="panel"><h2>Customer</h2>
        <p><strong>${esc(o.name)}</strong><br><a href="mailto:${esc(o.email)}?subject=${encodeURIComponent("Your order " + o.number)}">${esc(o.email)}</a>${o.phone ? `<br><a href="tel:${esc(o.phone)}">${esc(o.phone)}</a>` : ""}</p>
        <p>${addr}</p>
        ${o.customer_note ? `<p class="muted"><strong>Customer note:</strong> ${esc(o.customer_note)}</p>` : ""}
        <div class="row2"><button class="btn" id="copyAddr">Copy shipping label address</button></div></div>
    </div>
    <div class="stack">
      <div class="panel"><h2>Status &amp; delivery</h2>
        <div class="field"><label class="eyebrow" for="ost">Status</label><select id="ost">${STATUSES.map((s) => `<option${s === o.status ? " selected" : ""}>${s}</option>`).join("")}</select></div>
        <div class="field"><label class="eyebrow" for="ocar">Carrier</label><input id="ocar" list="carriers" value="${esc(o.carrier)}"><datalist id="carriers"><option>USPS</option><option>UPS</option><option>FedEx</option><option>DHL</option></datalist></div>
        <div class="field"><label class="eyebrow" for="otr">Tracking number</label><input id="otr" value="${esc(o.tracking)}"></div>
        <div class="field"><label class="eyebrow" for="oin">Internal note (staff only)</label><textarea id="oin">${esc(o.internal_note)}</textarea></div>
        <button class="btn solid" id="saveO">Save</button>
        <p class="muted">${o.paid_at ? "Paid " + when(o.paid_at) + ". " : ""}${o.shipped_at ? "Shipped " + when(o.shipped_at) + "." : ""}</p></div>
      <div class="panel"><h2>History</h2>
        <div class="row2"><input id="onote" placeholder="Add a note (e.g. payment received via Zelle)" style="flex:1;height:2.4rem;padding:0 .7rem;border:1px solid var(--line-strong);border-radius:8px"><button class="btn" id="addNote">Add</button></div>
        <ul class="hist">${events.map((e) => `<li>${esc(e.text)}<small>${esc(e.who)} · ${when(e.at)}</small></li>`).join("")}</ul></div>
    </div>
  </div>`;
  const $ = (x) => document.getElementById(x);
  $("saveO").onclick = async () => {
    if ($("ost").value === "shipped" && !$("otr").value.trim() && !confirm("Mark shipped without a tracking number?")) return;
    await api("/orders/" + id, { method: "PATCH", body: { status: $("ost").value, carrier: $("ocar").value, tracking: $("otr").value, internalNote: $("oin").value } });
    toast("Saved"); orderDetail(id); drawNav();
  };
  if ($("saveMoney")) $("saveMoney").onclick = async () => {
    await api("/orders/" + id, { method: "PATCH", body: { shippingCents: Math.round(parseFloat($("oship").value || 0) * 100), discountCents: Math.round(parseFloat($("odisc").value || 0) * 100) } });
    toast("Charges updated"); orderDetail(id);
  };
  $("addNote").onclick = async () => { if (!$("onote").value.trim()) return; await api(`/orders/${id}/note`, { method: "POST", body: { text: $("onote").value } }); orderDetail(id); };
  $("copyAddr").onclick = () => {
    const txt = [o.name, a.line1, a.line2, `${a.city}, ${a.state} ${a.zip}`].filter(Boolean).join("\n");
    navigator.clipboard?.writeText(txt).then(() => toast("Address copied"), () => toast("Copy failed"));
  };
}


/* ---------- customers ---------- */
async function customers() {
  pane().innerHTML = `<header><h1>Customers</h1></header>
    <div class="filters"><input id="cq" type="search" placeholder="Name or email"></div>
    <div class="tblwrap" id="ct"><p class="muted">Loading…</p></div>`;
  const load = async (term = "") => {
    const { customers: list } = await api("/customers?q=" + encodeURIComponent(term));
    document.getElementById("ct").innerHTML = list.length ? `<table class="tbl"><tr><th>Name</th><th>Email</th><th>Phone</th><th>Joined</th><th class="num">Orders</th><th class="num">Paid total</th><th>Last order</th><th>Active</th></tr>
      ${list.map((c) => `<tr data-cid="${c.id}"><td>${esc(c.name)}</td><td><a href="#" data-cust-orders="${esc(c.email)}">${esc(c.email)}</a></td><td>${esc(c.phone)}</td><td>${when(c.created_at)}</td>
        <td class="num">${c.orders}</td><td class="num">${money(c.spent_cents)}</td><td>${c.last_order ? when(c.last_order) : ""}</td>
        <td><input type="checkbox" data-cact${c.active ? " checked" : ""}${ro()}></td></tr>`).join("")}</table>` : `<p class="muted">No customer accounts yet.</p>`;
  };
  let t; document.getElementById("cq").oninput = (e) => { clearTimeout(t); t = setTimeout(() => load(e.target.value), 250); };
  document.getElementById("ct").onclick = async (e) => {
    const link = e.target.closest("[data-cust-orders]");
    if (link) { e.preventDefault(); oFilter = { status: "", q: link.dataset.custOrders }; go("orders"); return; }
    const box = e.target.closest("[data-cact]");
    if (box) { await api("/customers/" + box.closest("tr").dataset.cid, { method: "PATCH", body: { active: box.checked } }); toast(box.checked ? "Account turned on" : "Account turned off"); }
  };
  load();
}

/* ---------- products ---------- */
async function products() {
  const { products: list } = await api("/products");
  const row = (p) => `<tr data-id="${p ? p.id : ""}">
    <td><input data-k="name" value="${esc(p?.name)}" placeholder="Name"${ro()}></td>
    <td><input data-k="strength" value="${esc(p?.strength)}" placeholder="10 mg" style="min-width:4.5rem"${ro()}></td>
    <td><input data-k="sku" value="${esc(p?.sku)}" placeholder="SKU"${ro()}></td>
    <td><input data-k="price" value="${dollars(p?.price_cents)}" placeholder="Ask" inputmode="decimal" style="min-width:5rem"${ro()}></td>
    <td><input data-k="stock" value="${p?.stock ?? ""}" placeholder="∞" inputmode="numeric" style="min-width:4rem"${ro()}></td>
    <td><input data-k="maxPerOrder" value="${p?.max_per_order ?? ""}" placeholder="—" inputmode="numeric" style="min-width:4rem"${ro()}></td>
    <td><input data-k="sort" value="${p?.sort ?? 0}" inputmode="numeric" style="min-width:3.5rem"${ro()}></td>
    <td><input type="checkbox" data-k="active"${!p || p.active ? " checked" : ""}${ro()}></td>
    <td><input data-k="description" value="${esc(p?.description)}" placeholder="Short line under the name"${ro()}></td>
    ${isOwner() ? `<td class="row2" style="flex-wrap:nowrap"><button class="btn" data-save>Save</button>${p ? `<button class="btn" data-del>Delete</button>` : ""}</td>` : ""}
  </tr>`;
  pane().innerHTML = `<header><h1>Products &amp; prices</h1>${isOwner() ? `<button class="btn solid" id="addP">Add product</button>` : ""}</header>
    <p class="muted">Price blank = "Ask for price" (not buyable). Stock blank = not tracked. Max per order blank = no limit. Lower sort number shows first. Untick Active to hide a product. Products match their lab report by name and size.</p>
    <div class="tblwrap"><table class="tbl" id="pt"><tr><th>Name</th><th>Size</th><th>SKU</th><th>Price $</th><th>Stock</th><th>Max/order</th><th>Sort</th><th>Active</th><th>Description</th>${isOwner() ? "<th></th>" : ""}</tr>${list.map(row).join("")}</table></div>`;
  const pt = document.getElementById("pt");
  if (document.getElementById("addP")) document.getElementById("addP").onclick = () => pt.insertAdjacentHTML("beforeend", row(null));
  pt.onclick = async (e) => {
    const tr = e.target.closest("tr"); if (!tr) return;
    const id = tr.dataset.id;
    if (e.target.closest("[data-del]")) { if (!confirm("Delete this product? Past orders keep their line items.")) return; await api("/products/" + id, { method: "DELETE" }); toast("Deleted"); return products(); }
    if (!e.target.closest("[data-save]")) return;
    const body = {}; tr.querySelectorAll("[data-k]").forEach((i) => { body[i.dataset.k] = i.type === "checkbox" ? i.checked : i.value; });
    await api(id ? "/products/" + id : "/products", { method: id ? "PATCH" : "POST", body });
    toast("Saved"); products(); drawNav();
  };
}

/* ---------- lab reports ---------- */
async function reports() {
  const { reports: list } = await api("/reports");
  pane().innerHTML = `<header><h1>Lab reports</h1>${isOwner() ? `<button class="btn solid" id="addR">Add report</button>` : ""}</header>
    <p class="muted">Copy each field from the lab's document exactly as printed. A report shows on a product when its peptide name and size match.</p>
    <div id="rform"></div>
    <div class="tblwrap"><table class="tbl"><tr><th></th><th>Peptide</th><th>Size</th><th>Task</th><th>Batch</th><th>Tested</th><th>Results</th><th>Shown</th></tr>
    ${list.map((r) => `<tr class="click" data-rid="${r.id}"><td>${r.image ? `<img class="thumbimg" src="${esc(r.image)}" alt="">` : ""}</td><td>${esc(r.product)}</td><td>${esc(r.strength)}</td><td class="mono">${esc(r.task)}</td><td class="mono">${esc(r.batch)}</td><td>${esc(r.tested)}</td><td class="muted">${(r.results || []).map(([n, v]) => esc(n + " " + v)).join(" · ")}</td><td>${r.active ? "Yes" : "Hidden"}</td></tr>`).join("")}</table></div>`;
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
      <div class="field"><label class="eyebrow">Report image (JPG/PNG, under 6 MB)${r.image ? " — leave empty to keep the current one" : ""}</label><input type="file" id="rimg" accept="image/jpeg,image/png,image/webp"${ro()}></div>
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
        if (file.size > 6 * 1024 * 1024) return toast("Image is over 6 MB");
        body.imageData = await new Promise((ok) => { const fr = new FileReader(); fr.onload = () => ok(fr.result); fr.readAsDataURL(file); });
      }
      await api(r.id ? "/reports/" + r.id : "/reports", { method: r.id ? "PATCH" : "POST", body });
      toast("Report saved"); reports();
    };
  };
  if (document.getElementById("addR")) document.getElementById("addR").onclick = () => form(null);
  pane().querySelector(".tbl").onclick = (e) => { const tr = e.target.closest("[data-rid]"); if (tr) { form(list.find((x) => String(x.id) === tr.dataset.rid)); window.scrollTo(0, 0); } };
}

/* ---------- shipping ---------- */
async function shipping() {
  const { shipping: list } = await api("/shipping");
  const row = (m) => `<tr data-id="${m ? m.id : ""}">
    <td><input data-k="name" value="${esc(m?.name)}" placeholder="USPS Priority"${ro()}></td>
    <td><input data-k="detail" value="${esc(m?.detail)}" placeholder="2 to 3 business days"${ro()}></td>
    <td><input data-k="price" value="${dollars(m?.price_cents ?? 0)}" inputmode="decimal"${ro()}></td>
    <td><input data-k="freeOver" value="${dollars(m?.free_over_cents)}" placeholder="—" inputmode="decimal"${ro()}></td>
    <td><input data-k="sort" value="${m?.sort ?? 0}" inputmode="numeric"${ro()}></td>
    <td><input type="checkbox" data-k="active"${!m || m.active ? " checked" : ""}${ro()}></td>
    ${isOwner() ? `<td class="row2" style="flex-wrap:nowrap"><button class="btn" data-save>Save</button>${m ? `<button class="btn" data-del>Delete</button>` : ""}</td>` : ""}</tr>`;
  pane().innerHTML = `<header><h1>Shipping</h1>${isOwner() ? `<button class="btn solid" id="addS">Add option</button>` : ""}</header>
    <p class="muted">Customers pick one active option at checkout. "Free over" makes it free once the subtotal reaches that amount. With no active options, checkout says shipping is confirmed with the order and you set it on the order.</p>
    <div class="tblwrap"><table class="tbl" id="st"><tr><th>Name</th><th>Detail shown</th><th>Price $</th><th>Free over $</th><th>Sort</th><th>Active</th>${isOwner() ? "<th></th>" : ""}</tr>${list.map(row).join("")}</table></div>`;
  const st = document.getElementById("st");
  if (document.getElementById("addS")) document.getElementById("addS").onclick = () => st.insertAdjacentHTML("beforeend", row(null));
  st.onclick = async (e) => {
    const tr = e.target.closest("tr"); if (!tr) return; const id = tr.dataset.id;
    if (e.target.closest("[data-del]")) { if (!confirm("Delete this shipping option?")) return; await api("/shipping/" + id, { method: "DELETE" }); return shipping(); }
    if (!e.target.closest("[data-save]")) return;
    const body = {}; tr.querySelectorAll("[data-k]").forEach((i) => { body[i.dataset.k] = i.type === "checkbox" ? i.checked : i.value; });
    await api(id ? "/shipping/" + id : "/shipping", { method: id ? "PATCH" : "POST", body }); toast("Saved"); shipping();
  };
}

/* ---------- settings ---------- */
async function settings() {
  const { settings: s } = await api("/settings");
  const t = (k, label, help = "") => `<div class="field"><label class="eyebrow" for="s-${k}">${label}</label><input id="s-${k}" value="${esc(s[k])}"${ro()}>${help ? `<span class="muted">${help}</span>` : ""}</div>`;
  const ta = (k, label, help = "") => `<div class="field"><label class="eyebrow" for="s-${k}">${label}</label><textarea id="s-${k}"${ro()}>${esc(s[k])}</textarea>${help ? `<span class="muted">${help}</span>` : ""}</div>`;
  pane().innerHTML = `<header><h1>Site settings</h1></header>
    <div class="panel"><h2>Store</h2>
      <label class="chk"><input type="checkbox" id="s-storeOpen"${s.storeOpen ? " checked" : ""}${ro()}> Taking orders (untick to pause checkout)</label>
      <div class="grid2">${t("brand", "Store name", "Shown top left and in the footer")}${t("tagline", "Tagline (optional)")}${t("contact", "Contact for customers", "Phone, text or email")}
      ${t("distributorOf", "Brand you distribute", 'Shows "Authorized ___ distributor"')}${t("brandUrl", "Brand's website (https)")}</div>
      ${ta("paymentInstructions", "What customers see after ordering", "Explain how you'll confirm and how they pay")}
      <div class="grid2">${t("priceNote", "Note under products")}
        <div class="field"><label class="eyebrow" for="s-minOrder">Minimum order $</label><input id="s-minOrder" value="${dollars(s.minOrderCents) || ""}" placeholder="None" inputmode="decimal"${ro()}></div></div></div>
    <div class="panel"><h2>Banner</h2>
      <label class="chk"><input type="checkbox" id="s-announcementOn"${s.announcementOn ? " checked" : ""}${ro()}> Show the banner across the top of every page</label>
      <label class="chk"><input type="checkbox" id="s-bannerScroll"${s.bannerScroll ? " checked" : ""}${ro()}> Scroll the text across the banner</label>
      ${t("announcement", "Banner text")}</div>
    <div class="panel"><h2>Home page header</h2>
      ${t("heroEyebrow", "Small line above the headline")}
      ${t("headline", "Headline")}
      ${ta("intro", "Text under the headline")}</div>
    <div class="panel"><h2>Age gate</h2>
      <label class="chk"><input type="checkbox" id="s-ageGate"${s.ageGate ? " checked" : ""}${ro()}> Ask visitors to confirm age and research use before entering</label>
      <div class="field" style="max-width:10rem"><label class="eyebrow" for="s-minAge">Minimum age</label><input id="s-minAge" value="${esc(s.minAge)}" inputmode="numeric"${ro()}></div></div>
    <div class="panel"><h2>Disclaimers &amp; policies</h2><p class="muted">One paragraph per line. Start a line with "Heading: " to show a bold heading. Have your attorney review these before you rely on them.</p>
      ${[["footerNotice", "Footer notice (every page)"], ["disclaimers", "Disclaimer"], ["policyTerms", "Terms of service"], ["policyReturns", "Refund and returns policy"], ["policyShipping", "Shipping policy"], ["policyPrivacy", "Privacy policy"]]
        .map(([k, label]) => `<div class="field"><label class="eyebrow" for="s-${k}">${label}</label><textarea id="s-${k}" style="min-height:12rem"${ro()}>${esc((s[k] || []).join("\n"))}</textarea></div>`).join("")}</div>
    ${isOwner() ? `<div><button class="btn solid" id="sSave">Save settings</button></div>` : `<p class="muted">Only the owner can change settings.</p>`}`;
  if (!isOwner()) return;
  document.getElementById("sSave").onclick = async () => {
    const v = (k) => document.getElementById("s-" + k);
    const body = {};
    ["brand", "tagline", "contact", "distributorOf", "brandUrl", "announcement", "intro", "paymentInstructions", "priceNote", "heroEyebrow", "headline"].forEach((k) => { body[k] = v(k).value; });
    body.storeOpen = v("storeOpen").checked; body.ageGate = v("ageGate").checked; body.minAge = v("minAge").value;
    body.minOrderCents = Math.round(parseFloat(v("minOrder").value || 0) * 100);
    ["footerNotice", "disclaimers", "policyTerms", "policyReturns", "policyShipping", "policyPrivacy"].forEach((k) => { body[k] = v(k).value.split("\n").map((x) => x.trim()).filter(Boolean); });
    body.announcementOn = v("announcementOn").checked; body.bannerScroll = v("bannerScroll").checked;
    await api("/settings", { method: "PUT", body }); toast("Settings saved");
  };
}

/* ---------- staff ---------- */
async function staff() {
  if (!isOwner()) return dashboard();
  const { users } = await api("/users");
  pane().innerHTML = `<header><h1>Staff logins</h1></header>
    <p class="muted">Staff can view and work orders (status, tracking, notes). Only owners can change prices, charges, reports, shipping, settings and logins.</p>
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

(async () => {
  const res = await fetch("/api/admin/me");
  if (res.ok) { me = (await res.json()).user; shell(); } else drawLogin();
})();
})();
