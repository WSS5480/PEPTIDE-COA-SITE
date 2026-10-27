/* Storefront: products, cart, order request, lab report library, order lookup, age gate. */
(() => {
const $ = (id) => document.getElementById(id);
const LAB = location.pathname.replace(/\/+$/, "") === "/lab-reports";
document.body.classList.add(LAB ? "pg-lab" : "pg-home");
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const norm = (s) => String(s ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
const sizeKey = (s) => norm(s).replace(/mg$/, "");
const money = (c) => "$" + (c / 100).toFixed(2);
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const fmtDate = (iso) => { const [y, m, d] = String(iso || "").slice(0, 10).split("-").map(Number); return y && m && d ? `${MONTHS[m - 1]} ${d}, ${y}` : ""; };
const plural = (n, w) => `${n} ${w}${n === 1 ? "" : "s"}`;
const para = (t) => { const m = /^([^:]{2,40}):\s+(.*)$/.exec(String(t)); return m ? `<strong>${esc(m[1])}.</strong> ${esc(m[2])}` : esc(t); };
const isPurity = (n) => /^purity$/i.test(String(n).trim());
const store = { get(k) { try { return JSON.parse(localStorage.getItem(k)); } catch (e) { return null; } }, set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* storage off */ } } };
const openD = (d) => { if (d.showModal) { if (!d.open) d.showModal(); } else d.setAttribute("open", ""); };
const closeD = (d) => { if (d.close) d.close(); else d.removeAttribute("open"); };
function toast(msg) { const t = document.createElement("div"); t.className = "toast"; t.textContent = msg; document.body.appendChild(t); setTimeout(() => t.remove(), 1800); }

let cat = "";
let coaOnly = !!store.get("coaOnly");
/* top banner: plain, or scrolling right to left when bannerScroll is on */
function banner(el, S) {
  el.hidden = false;
  if (!S.bannerScroll) { el.textContent = S.announcement; return; }
  const item = `<span>${esc(S.announcement)}</span>`;
  el.classList.add("scroll");
  el.innerHTML = `<div class="mq">${item.repeat(6)}</div><div class="mq" aria-hidden="true">${item.repeat(6)}</div>`;
  el.setAttribute("aria-label", S.announcement);
}
let S = {}, PRODUCTS = [], REPORTS = [], SHIP = [], DOCS = [];
let cart = store.get("cart") || [];   // [{id, qty}]
const saveCart = () => { store.set("cart", cart); drawCartCount(); };

/* ---------- age gate ---------- */
function gate() {
  if (!S.ageGate || store.get("ageOk") === S.minAge) return;
  const g = $("gate");
  $("gAgeText").textContent = `I am ${S.minAge} years of age or older.`;
  const sync = () => { $("gEnter").disabled = !($("gAge").checked && $("gRes").checked); };
  $("gAge").onchange = $("gRes").onchange = sync;
  $("gExit").onclick = () => { location.href = "https://www.google.com/"; };
  $("gEnter").onclick = () => { if ($("gRemember").checked) store.set("ageOk", S.minAge); closeD(g); };
  g.addEventListener("cancel", (e) => e.preventDefault()); // no closing with Esc
  openD(g);
}

/* ---------- products ---------- */
function vialSVG(name, size) {
  const raw = String(name), label = esc(raw.slice(0, 22)), mg = esc(size), fit = raw.length > 8 ? ` textLength="52" lengthAdjust="spacingAndGlyphs"` : "";
  return `<svg viewBox="0 0 120 200" aria-hidden="true">
    <rect x="38" y="6" width="44" height="22" rx="4" fill="#0f1b33"/>
    <rect x="34" y="26" width="52" height="10" rx="3" fill="#c9d1dc"/>
    <path d="M30 40h60v140a14 14 0 0 1-14 14H44a14 14 0 0 1-14-14z" fill="#ffffff" stroke="#c9d1dc" stroke-width="2"/>
    <rect x="30" y="78" width="60" height="78" fill="#0b4d96"/>
    <text x="60" y="108" text-anchor="middle" font-family="Barlow Condensed, Arial Narrow, sans-serif" font-weight="700" font-size="14"${fit} fill="#fff">${label}</text>
    <text x="60" y="130" text-anchor="middle" font-family="Poppins, sans-serif" font-weight="600" font-size="11" fill="#cfdcf0">${mg}</text>
    <rect x="30" y="160" width="60" height="4" fill="#e9f1fb"/>
  </svg>`;
}
// A product's lab report matches by name + size, or by its code (e.g. RT30) against the report's Sample line.
const reportFor = (p) => REPORTS.find((r) => norm(r.product) === norm(p.name) && sizeKey(r.strength) === sizeKey(p.strength))
  || (p.sku ? REPORTS.find((r) => norm(r.sample) === norm(p.sku)) : undefined);
// How a product is named on the store: "name" (Retatrutide 30 mg), "code" (RT30) or "both" (Retatrutide 30 mg · RT30)
const codeMode = (p) => !!p.sku && (p.show_code || S.productLabel === "code");
const labelOf = (p) => {
  const nm = `${p.name} ${p.strength}`.trim(), mode = p.show_code && p.sku ? "code" : S.productLabel || "name";
  if (!p.sku || mode === "name") return nm;
  return mode === "code" ? p.sku : `${nm} · ${p.sku}`;
};
const inCart = (id) => (cart.find((c) => c.id === id) || {}).qty || 0;

function drawChips() {
  const cats = [...new Set(PRODUCTS.map((p) => p.category || "Research peptide"))].sort();
  $("chips").innerHTML = (cats.length > 1 ? [["", "All"], ...cats.map((c) => [c, c])].map(([v, l]) => `<button class="chip${cat === v ? " on" : ""}" type="button" data-cat="${esc(v)}">${esc(l)}</button>`).join("") : "")
    + `<label class="chip coachip${coaOnly ? " on" : ""}"><input type="checkbox" data-coaonly${coaOnly ? " checked" : ""}> Only with lab report</label>`;
  document.querySelectorAll("[data-coaonly]").forEach((b) => { b.checked = coaOnly; });
}
function drawProducts() {
  drawChips();
  const words = norm($("hq").value) ? $("hq").value.toLowerCase().split(/\s+/).map(norm).filter(Boolean) : [];
  const list = PRODUCTS.filter((p) => (!coaOnly || reportFor(p)) && (!cat || (p.category || "Research peptide") === cat) && words.every((w) => norm([p.name, p.strength, p.sku, p.category, (reportFor(p) || {}).sample].join(" ")).includes(w)));
  $("pgrid").innerHTML = list.length ? list.map((p) => {
    const r = reportFor(p);
    const purity = r ? ((r.results || []).find(([n]) => isPurity(n)) || [])[1] : "";
    const sold = p.stock !== null && p.stock <= 0;
    const price = p.price_cents !== null ? `<p class="p-price">${money(p.price_cents)}</p>` : `<p class="p-price ask">Ask for price</p>`;
    const stock = sold ? `<span class="soldout">Sold out</span>` : p.stock !== null && p.stock <= 5 ? `<span class="stockline low">Only ${p.stock} left</span>` : "";
    const buy = p.price_cents === null ? (S.contact ? `<span class="stockline">Contact us: ${esc(S.contact)}</span>` : "")
      : sold ? "" : `<button class="btn solid" type="button" data-add="${p.id}">Add to cart${inCart(p.id) ? ` (${inCart(p.id)})` : ""}</button>`;
    return `<article class="pcard">
      <div class="thumb">${vialSVG(codeMode(p) ? p.sku : p.name, p.strength)}</div>
      <div class="pbody">
        <span class="pcat">${esc(p.category || "Research peptide")}</span>
        <h3 class="pname">${esc(codeMode(p) ? p.sku : p.name)}</h3>
        <span class="pmeta">${[codeMode(p) ? `${p.name} ${p.strength}`.trim() : p.strength, !codeMode(p) && S.productLabel === "both" && p.sku ? p.sku : "", purity ? `${purity} purity` : ""].filter(Boolean).map(esc).join(" · ")}</span>
        ${p.description ? `<p class="stockline">${esc(p.description)}</p>` : ""}
        ${price}${stock}
        <p class="research">For laboratory research use only. Not for human or animal use.</p>
        <div class="pact">${buy}${r ? `<a class="btn" href="/lab-reports#${esc(rid(r))}" data-report="${r.id}" data-pid="${p.id}">Lab report</a>` : `<span class="stockline">No report yet</span>`}${docsFor(p).length ? `<button class="btn" type="button" data-docs="${p.id}">Documents (${docsFor(p).length})</button>` : ""}</div>
      </div>
    </article>`;
  }).join("") : `<div class="card empty"><p><strong>No product matches.</strong> ${coaOnly ? "You're showing only products with a lab report. Untick it to see everything." : "Try another name or size."}</p></div>`;
}

/* ---------- cart ---------- */
function cartLines() {
  return cart.map((c) => ({ ...c, p: PRODUCTS.find((p) => p.id === c.id) })).filter((l) => l.p && l.p.price_cents !== null);
}
function drawCartCount() { $("cartN").textContent = cart.reduce((n, c) => n + c.qty, 0); }
function shipCost(m, sub) { return !m ? 0 : m.free_over_cents !== null && sub >= m.free_over_cents ? 0 : m.price_cents; }
function drawCart() {
  const lines = cartLines();
  if (lines.length !== cart.length) { cart = lines.map(({ id, qty }) => ({ id, qty })); saveCart(); }
  if (!lines.length) {
    $("cartBody").innerHTML = `<div class="empty"><p>Your cart is empty.</p></div>`;
    $("cartFoot").innerHTML = `<button class="btn wide" type="button" data-close data-goto="products">Browse products</button>`;
    return;
  }
  const sub = lines.reduce((s, l) => s + l.p.price_cents * l.qty, 0);
  $("cartBody").innerHTML = lines.map((l) => `<div class="line">
    <div class="nm">${esc(labelOf(l.p))}<small>${money(l.p.price_cents)} each</small></div>
    <div class="amt">${money(l.p.price_cents * l.qty)}</div>
    <div class="ctl"><span class="qty"><button type="button" data-dec="${l.id}" aria-label="One less">−</button><span>${l.qty}</span><button type="button" data-inc="${l.id}" aria-label="One more">+</button></span>
      <button class="linkbtn" type="button" data-rm="${l.id}">Remove</button></div>
  </div>`).join("");
  const min = S.minOrderCents || 0;
  $("cartFoot").innerHTML = `<div class="totals"><div class="big"><span>Subtotal</span><span>${money(sub)}</span></div>
    <div class="dist"><span>Shipping is added at checkout.</span></div></div>
    <p class="research">All items are sold for laboratory research only and are not for human or animal use.</p>
    ${min && sub < min ? `<div class="err">The minimum order is ${money(min)}.</div>` : ""}
    ${S.storeOpen ? `<button class="btn solid wide" type="button" id="toCheckout" ${min && sub < min ? "disabled" : ""}>Checkout</button>` : `<div class="err">Ordering is paused right now. Please check back soon.</div>`}`;
}
function addToCart(id, n = 1) {
  const p = PRODUCTS.find((x) => x.id === id); if (!p) return;
  const line = cart.find((c) => c.id === id);
  let qty = (line ? line.qty : 0) + n;
  if (p.max_per_order) qty = Math.min(qty, p.max_per_order);
  if (p.stock !== null) qty = Math.min(qty, p.stock);
  if (qty <= 0) cart = cart.filter((c) => c.id !== id);
  else if (line) line.qty = qty; else cart.push({ id, qty });
  saveCart();
}

/* ---------- checkout ---------- */
function drawTotals() {
  const lines = cartLines(), sub = lines.reduce((s, l) => s + l.p.price_cents * l.qty, 0);
  const m = SHIP.find((x) => String(x.id) === $("ship").value);
  const sc = shipCost(m, sub);
  $("coTotals").innerHTML = `<div><span>${plural(lines.reduce((n, l) => n + l.qty, 0), "item")}</span><span>${money(sub)}</span></div>
    ${SHIP.length ? `<div><span>Shipping</span><span>${sc ? money(sc) : "Free"}</span></div>` : `<div><span>Shipping</span><span>Confirmed with your order</span></div>`}
    <div class="big"><span>Estimated total</span><span>${money(sub + sc)}</span></div>`;
}
function openCheckout() {
  closeD($("cart"));
  $("coForm").hidden = false; $("coDone").hidden = true; $("coErr").hidden = true;
  $("cfAgeText").textContent = `I am ${S.minAge} or older.`;
  $("shipField").hidden = !SHIP.length;
  $("ship").innerHTML = SHIP.map((m) => `<option value="${m.id}">${esc(m.name)}${m.detail ? " · " + esc(m.detail) : ""} · ${m.price_cents ? money(m.price_cents) : "Free"}${m.free_over_cents !== null ? ` (free over ${money(m.free_over_cents)})` : ""}</option>`).join("");
  const saved = ME ? { name: ME.name, email: ME.email, phone: ME.phone, ...(ME.address || {}) } : (store.get("buyer") || {});
  [["cName", "name"], ["cEmail", "email"], ["cPhone", "phone"], ["a1", "line1"], ["a2", "line2"], ["aCity", "city"], ["aState", "state"], ["aZip", "zip"]].forEach(([id, k]) => { if (saved[k] && !$(id).value) $(id).value = saved[k]; });
  drawTotals();
  openD($("checkout"));
}
async function submitOrder(e) {
  e.preventDefault();
  const err = (m) => { $("coErr").textContent = m; $("coErr").hidden = false; $("coErr").scrollIntoView({ block: "nearest" }); };
  const v = (id) => $(id).value.trim();
  if (!v("cName") || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v("cEmail"))) return err("Enter your name and a valid email.");
  if (!v("a1") || !v("aCity") || !v("aState") || !v("aZip")) return err("Enter your full shipping address.");
  if (!$("cfAge").checked || !$("cfRes").checked) return err("Please confirm both statements to place the order.");
  const body = {
    name: v("cName"), email: v("cEmail"), phone: v("cPhone"),
    address: { line1: v("a1"), line2: v("a2"), city: v("aCity"), state: v("aState"), zip: v("aZip"), country: "US" },
    shippingMethodId: SHIP.length ? +$("ship").value : null, note: v("cNote"), website: $("website").value,
    confirmAge: true, confirmResearch: true, items: cart
  };
  $("coSubmit").disabled = true; $("coSubmit").textContent = "Sending…";
  try {
    const res = await fetch("/api/orders", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const j = await res.json();
    if (!res.ok) return err(j.error || "Could not place the order.");
    store.set("buyer", { name: body.name, email: body.email, phone: body.phone, ...body.address });
    cart = []; saveCart(); drawProducts();
    $("coForm").hidden = true;
    $("coDone").hidden = false;
    $("coDone").innerHTML = `<div class="sectionhead" style="padding:0"><h2>Order received</h2><button class="btn" type="button" data-close>Close</button></div>
      <div class="okbox"><span class="eyebrow">Your order number</span><span class="num">${esc(j.number)}</span>
      <span>Estimated total ${money(j.totalCents)}</span></div>
      <p>${esc(j.paymentInstructions)}</p>
      <p class="dist">${ME ? "This order is saved under My account." : "Save your order number. You can check its status any time under \"Check an order\" with the email you used, or create an account to keep all your orders in one place."}</p>`;
    load(); loadAccount(); // refresh stock and order history
  } catch (x) { err("Couldn't reach the store. Check your connection and try again."); }
  finally { $("coSubmit").disabled = false; $("coSubmit").textContent = "Submit order request"; }
}

/* ---------- lab report library ---------- */
const rid = (r) => "r-" + r.id;
const state = { q: "", pick: "", size: "" };
const openIds = new Set();
function sheetHTML(r) {
  const pair = (dt, dd) => (dd ? `<div><dt>${dt}</dt><dd>${dd}</dd></div>` : "");
  const title = `${r.product} ${r.strength}`.trim();
  const details = [pair("Lab", esc(r.lab)), pair("Task number", r.task ? `<span class="mono">#${esc(r.task)}</span>` : ""), pair("Size", esc(r.strength)),
    pair("Sample", esc(r.sample)), pair("Batch", r.batch ? `<span class="mono">${esc(r.batch)}</span>` : "Unknown (not given to the lab)"),
    pair("Client", esc(r.client)), pair("Manufacturer", esc(r.manufacturer)), pair("Testing ordered", fmtDate(r.ordered)),
    pair("Sample received", fmtDate(r.received)), pair("Analysis conducted", fmtDate(r.tested)), pair("Tests requested", esc(r.testsRequested))].join("");
  const doc = !r.image ? `<p class="eyebrow">No document attached yet.</p>`
    : r.isPdf ? `<a class="doc" href="${esc(r.image)}" target="_blank" rel="noopener" aria-label="Open the PDF report for ${esc(title)}"><span class="page pdfpage"><span>PDF</span></span><span class="eyebrow">Open the report (PDF)</span></a>`
    : `<button class="doc" type="button" data-doc="${r.id}" aria-label="Open the report for ${esc(title)}"><span class="page"><img src="${esc(r.image)}" loading="lazy" alt="${esc(`${r.lab || "Lab"} test report for ${title}`)}"></span><span class="eyebrow">Open the report</span></button>`;
  const check = r.key || r.verifyUrl ? `<div class="block"><h3 class="eyebrow">Check it with the lab</h3>
    ${r.key ? `<p class="keyline"><span>Unique key</span><code class="key">${esc(r.key)}</code><button class="btn" type="button" data-copy="${esc(r.key)}">Copy key</button></p>` : ""}
    ${r.verifyUrl ? `<p><a href="${esc(r.verifyUrl)}" target="_blank" rel="noopener">Open this report on the lab's own site</a></p>` : ""}</div>` : "";
  return `<div class="sheet"><div>
    <div class="block"><h3 class="eyebrow">Results</h3><dl class="pairs lab">${(r.results || []).map(([n, v]) => pair(esc(n), esc(v))).join("")}</dl></div>
    <div class="block"><h3 class="eyebrow">Report details</h3><dl class="pairs">${details}</dl></div></div>
    <div><div class="block"><h3 class="eyebrow">Lab document</h3>${doc}</div>${check}</div></div>`;
}
const docsFor = (p) => (p ? DOCS.filter((d) => d.product_id === p.id) : []);
function docsHTML(list) {
  if (!list.length) return "";
  return `<div class="block"><h3 class="eyebrow">Documents</h3><ul class="doclist">${list.map((d) => `<li><a href="/doc/${d.id}" target="_blank" rel="noopener">
    <span class="dtype">${d.file_type === "application/pdf" ? "PDF" : "IMG"}</span><span><strong>${esc(d.title)}</strong><small>${esc(d.kind)}</small></span></a></li>`).join("")}</ul></div>`;
}
function drawReports() {
  const words = state.q.toLowerCase().split(/\s+/).map(norm).filter(Boolean);
  const hay = (r) => norm([r.product, r.strength, r.sample, r.batch, r.task, r.key, r.lab].join(" "));
  const list = REPORTS.filter((r) => (!state.pick || r.product === state.pick) && (!state.size || r.strength === state.size) && words.every((w) => hay(r).includes(w)));
  const filtering = words.length || state.pick || state.size;
  if (filtering && list.length === 1) openIds.add(rid(list[0]));
  const groups = new Map();
  list.forEach((r) => { if (!groups.has(r.product)) groups.set(r.product, []); groups.get(r.product).push(r); });
  $("groups").innerHTML = !REPORTS.length ? `<div class="card empty"><p><strong>No reports have been published yet.</strong></p></div>`
    : !list.length ? `<div class="card empty"><p><strong>No report matches.</strong> Check the name, size or code, or clear the filters.</p><button class="btn" type="button" id="clear">Clear filters</button></div>`
    : [...groups].map(([name, rs]) => `<section class="group"><header><h2>${esc(name)}</h2><span class="eyebrow">${plural(rs.length, "report")}</span></header>
      <div class="rows">${rs.map((r) => {
        const purity = ((r.results || []).find(([n]) => isPurity(n)) || [])[1] || "";
        const amounts = (r.results || []).filter(([n]) => !isPurity(n));
        const amount = amounts.length === 1 ? `${esc(amounts[0][1])} measured` : amounts.map(([n, v]) => `${esc(n)} ${esc(v)}`).join(" · ");
        return `<details class="report" id="${rid(r)}"${openIds.has(rid(r)) ? " open" : ""}><summary><span class="row">
          <span class="r-name">${esc(`${r.product} ${r.strength}`)}</span>
          <span class="r-batch${r.batch ? "" : " none"}">${r.batch ? esc(r.batch) : "Batch not stated"}</span>
          <span class="r-date">${fmtDate(r.tested)}</span><span class="r-purity">${esc(purity)}</span><span class="r-amount">${amount}</span>
          <span class="chev" aria-hidden="true"></span></span></summary>${sheetHTML(r)}</details>`;
      }).join("")}</div></section>`).join("");
  $("count").textContent = !REPORTS.length ? "" : filtering ? `Showing ${list.length} of ${plural(REPORTS.length, "report")}` : `${plural(REPORTS.length, "report")} across ${plural(new Set(REPORTS.map((r) => r.product)).size, "peptide")}`;
}
function fillSizes() {
  const pool = REPORTS.filter((r) => r.strength && (!state.pick || r.product === state.pick));
  const sizes = [...new Map(pool.map((r) => [r.strength, parseFloat(r.strength) || 0]))].sort((a, b) => a[1] - b[1]).map(([s]) => s);
  $("size").innerHTML = `<option value="">All sizes</option>` + sizes.map((s) => `<option value="${esc(s)}">${esc(s)}</option>`).join("");
  $("size").value = state.size;
}
function showDoc(r) {
  $("vTitle").innerHTML = `${esc(`${r.product} ${r.strength}`)}<small>${esc(r.lab || "Lab")} report${r.task ? " · task #" + esc(r.task) : ""} · analysed ${fmtDate(r.tested)}</small>`;
  $("vBody").innerHTML = `<img src="${esc(r.image)}" alt="${esc(`Lab report for ${r.product} ${r.strength}`)}">`;
  $("vOpen").href = r.image;
  $("vVerify").hidden = !r.verifyUrl; if (r.verifyUrl) $("vVerify").href = r.verifyUrl;
  openD($("viewer"));
}
function jumpTo(id) {
  state.q = ""; state.pick = ""; state.size = ""; $("q").value = ""; $("product").value = ""; fillSizes();
  openIds.add(id); drawReports();
  const el = $(id); if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
  history.replaceState(null, "", "#" + id);
}

/* ---------- order lookup ---------- */
const STATUS_TEXT = { new: "Received, waiting for review", confirmed: "Confirmed, waiting for payment", paid: "Paid, getting ready to ship", shipped: "Shipped", delivered: "Delivered", cancelled: "Cancelled" };
async function lookup(e) {
  e.preventDefault();
  const out = $("trackOut");
  try {
    const res = await fetch("/api/orders/lookup", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ number: $("tNum").value.trim(), email: $("tEmail").value.trim() }) });
    const j = await res.json();
    if (!res.ok) { out.innerHTML = `<div class="err">${esc(j.error)}</div>`; return; }
    const o = j.order;
    out.innerHTML = `<div class="okbox"><span class="eyebrow">Order ${esc(o.number)} · placed ${fmtDate(o.created_at)}</span>
      <strong>${esc(STATUS_TEXT[o.status] || o.status)}</strong>
      ${o.tracking ? `<span>${esc(o.carrier || "Tracking")}: <span class="mono">${esc(o.tracking)}</span></span>` : ""}
      <span>${j.items.map((i) => `${i.qty} × ${esc(i.name)} ${esc(i.strength)}`).join(", ")}</span>
      <span>Total ${money(o.total_cents)}</span></div>`;
  } catch (x) { out.innerHTML = `<div class="err">Couldn't reach the store. Try again.</div>`; }
}


/* ---------- customer account ---------- */
let ME = null, MY_ORDERS = [];
async function loadAccount() {
  try { const j = await (await fetch("/api/account", { credentials: "same-origin" })).json(); ME = j.customer; MY_ORDERS = j.orders || []; } catch (e) { ME = null; }
  $("acctLabel").textContent = ME ? (ME.name || "Account").split(" ")[0] : "Sign in";
}
async function post(url, body, method = "POST") {
  const r = await fetch(url, { method, headers: { "Content-Type": "application/json" }, credentials: "same-origin", body: JSON.stringify(body) });
  const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(j.error || "That didn't work."); return j;
}
function acctView(mode) {
  const b = $("acBody"), close = `<button class="btn" type="button" data-close>Close</button>`;
  const fld = (id, label, type = "text", ac = "", val = "") => `<div class="field"><label class="eyebrow" for="${id}">${label}</label><input id="${id}" type="${type}" autocomplete="${ac}" value="${esc(val)}"></div>`;
  if (!ME && mode !== "register") {
    b.innerHTML = `<div class="sectionhead" style="padding:0"><h2 id="acTitle">Sign in</h2>${close}</div>
      <div class="tabs"><button class="on" type="button">Sign in</button><button type="button" data-acct="register">Create account</button></div>
      <form id="acForm" class="stack">${fld("acE", "Email", "email", "username")}${fld("acP", "Password", "password", "current-password")}
      <div class="err" id="acErr" hidden></div><button class="btn solid wide">Sign in</button></form>
      <p class="dist">No account? <button class="linkbtn" type="button" data-acct="register">Create one</button> to save your address and see your orders.</p>`;
    $("acForm").onsubmit = async (e) => { e.preventDefault(); try { await post("/api/account/login", { email: $("acE").value, password: $("acP").value }); await loadAccount(); toast("Signed in"); acctView(); } catch (x) { $("acErr").textContent = x.message; $("acErr").hidden = false; } };
    return;
  }
  if (!ME) {
    b.innerHTML = `<div class="sectionhead" style="padding:0"><h2 id="acTitle">Create account</h2>${close}</div>
      <div class="tabs"><button type="button" data-acct="signin">Sign in</button><button class="on" type="button">Create account</button></div>
      <form id="acForm" class="stack"><div class="grid2">${fld("rN", "Full name", "text", "name")}${fld("rE", "Email", "email", "email")}${fld("rPh", "Phone number", "tel", "tel")}${fld("rP", "Password (8+ characters)", "password", "new-password")}</div>
      <span class="eyebrow">Shipping address</span>
      <div class="grid2"><div class="field" style="grid-column:1/-1"><label class="eyebrow" for="r1">Street address</label><input id="r1" autocomplete="address-line1"></div>
      ${fld("r2", "Apt, suite (optional)", "text", "address-line2")}${fld("rC", "City", "text", "address-level2")}${fld("rS", "State", "text", "address-level1")}${fld("rZ", "ZIP", "text", "postal-code")}</div>
      <label class="check"><input type="checkbox" id="rAge"><span>I am ${esc(S.minAge || 21)} or older.</span></label>
      <label class="check"><input type="checkbox" id="rRes"><span>I am buying for laboratory research only, not for human or animal use, and I agree to the <a href="/policy#terms" target="_blank">terms of service</a> and <a href="/policy#privacy" target="_blank">privacy policy</a>.</span></label>
      <div class="err" id="acErr" hidden></div><button class="btn solid wide">Create account</button></form>`;
    $("acForm").onsubmit = async (e) => {
      e.preventDefault();
      if (!$("r1").value.trim() || !$("rC").value.trim() || !$("rS").value.trim() || !$("rZ").value.trim()) { $("acErr").textContent = "Enter your full shipping address."; $("acErr").hidden = false; return; }
      if ($("rPh").value.replace(/\D/g, "").length < 10) { $("acErr").textContent = "Enter a phone number with area code."; $("acErr").hidden = false; return; }
      try { await post("/api/account/register", { name: $("rN").value, email: $("rE").value, phone: $("rPh").value, password: $("rP").value, address: { line1: $("r1").value, line2: $("r2").value, city: $("rC").value, state: $("rS").value, zip: $("rZ").value }, confirmAge: $("rAge").checked, confirmResearch: $("rRes").checked }); await loadAccount(); toast("Account created"); acctView(); }
      catch (x) { $("acErr").textContent = x.message; $("acErr").hidden = false; }
    };
    return;
  }
  const a = ME.address || {};
  const tab = mode === "details" ? "details" : "orders";
  b.innerHTML = `<div class="sectionhead" style="padding:0"><h2 id="acTitle">My account</h2>${close}</div>
    <p class="dist">Signed in as ${esc(ME.email)} · <button class="linkbtn" type="button" id="acOut">Sign out</button></p>
    <div class="tabs"><button type="button" class="${tab === "orders" ? "on" : ""}" data-acct="orders">My orders</button><button type="button" class="${tab === "details" ? "on" : ""}" data-acct="details">Details &amp; address</button></div>
    ${tab === "orders" ? `<div class="olist">${MY_ORDERS.length ? MY_ORDERS.map((o) => `<div class="orow"><div class="top2"><span>Order ${esc(o.number)}</span><span>${money(o.total_cents)}</span></div>
        <span>${fmtDate(o.created_at)} · ${esc(STATUS_TEXT[o.status] || o.status)}</span>
        <span class="dist">${(o.items || []).map((i) => `${i.qty} × ${esc(i.name)} ${esc(i.strength)}`).join(", ")}</span>
        ${o.tracking ? `<span>${esc(o.carrier || "Tracking")}: <span class="mono">${esc(o.tracking)}</span></span>` : ""}</div>`).join("") : `<p class="dist">No orders yet.</p>`}</div>`
    : `<form id="acForm" class="stack"><div class="grid2">${fld("mN", "Full name", "text", "name", ME.name)}${fld("mPh", "Phone", "tel", "tel", ME.phone)}</div>
      <div class="grid2">${fld("m1", "Street address", "text", "address-line1", a.line1)}${fld("m2", "Apt, suite", "text", "address-line2", a.line2)}${fld("mC", "City", "text", "address-level2", a.city)}${fld("mS", "State", "text", "address-level1", a.state)}${fld("mZ", "ZIP", "text", "postal-code", a.zip)}</div>
      <details><summary class="eyebrow" style="cursor:pointer">Change password</summary><div class="grid2" style="margin-top:.7rem">${fld("mPc", "Current password", "password", "current-password")}${fld("mPn", "New password", "password", "new-password")}</div></details>
      <div class="err" id="acErr" hidden></div><button class="btn solid wide">Save</button></form>`}`;
  $("acOut").onclick = async () => { await post("/api/account/logout", {}); await loadAccount(); toast("Signed out"); closeD($("acct")); };
  if (tab === "details") $("acForm").onsubmit = async (e) => {
    e.preventDefault();
    try {
      await post("/api/account", { name: $("mN").value, phone: $("mPh").value, address: { line1: $("m1").value, line2: $("m2").value, city: $("mC").value, state: $("mS").value, zip: $("mZ").value }, currentPassword: $("mPc").value, newPassword: $("mPn").value }, "PATCH");
      await loadAccount(); toast("Saved"); acctView("details");
    } catch (x) { $("acErr").textContent = x.message; $("acErr").hidden = false; }
  };
}

/* ---------- events ---------- */
document.addEventListener("click", (e) => {
  const t = e.target;
  const close = t.closest("[data-close]");
  if (close) { const d = close.closest("dialog"); if (d) closeD(d); if (close.dataset.goto) $(close.dataset.goto).scrollIntoView({ behavior: "smooth" }); if (close.tagName !== "A") return; }
  const ac = t.closest("[data-acct]");
  if (ac) { acctView(ac.dataset.acct); return; }
  const c = t.closest("[data-cat]");
  if (c && LAB) { location.href = "/#products"; return; }
  if (c) { e.preventDefault(); cat = c.dataset.cat; drawProducts(); $("products").scrollIntoView({ behavior: "smooth" }); return; }
  const add = t.closest("[data-add]");
  if (add) { addToCart(+add.dataset.add); drawProducts(); toast("Added to cart"); return; }
  const inc = t.closest("[data-inc]"), dec = t.closest("[data-dec]"), rm = t.closest("[data-rm]");
  if (inc || dec || rm) { const id = +(inc || dec || rm).dataset[inc ? "inc" : dec ? "dec" : "rm"]; if (rm) { cart = cart.filter((c) => c.id !== id); saveCart(); } else addToCart(id, inc ? 1 : -1); drawCart(); drawProducts(); return; }
  if (t.closest("#toCheckout")) { openCheckout(); return; }
  const jump = t.closest("[data-jump]"); if (jump) { e.preventDefault(); jumpTo(jump.dataset.jump); return; }
  const rep = t.closest("[data-report]");
  if (rep) { const r = REPORTS.find((x) => String(x.id) === rep.dataset.report); if (r) { e.preventDefault(); const pr = PRODUCTS.find((x) => String(x.id) === rep.dataset.pid); $("rmTitle").textContent = `${r.product} ${r.strength}`.trim() + " · lab report"; $("rmBody").innerHTML = sheetHTML(r) + docsHTML(docsFor(pr)); openD($("repModal")); } return; }
  const dk = t.closest("[data-docs]");
  if (dk) { const pr = PRODUCTS.find((x) => String(x.id) === dk.dataset.docs); if (pr) { $("rmTitle").textContent = `${pr.name} ${pr.strength}`.trim() + " · documents"; $("rmBody").innerHTML = docsHTML(docsFor(pr)); openD($("repModal")); } return; }
  const doc = t.closest("[data-doc]"); if (doc) { const r = REPORTS.find((x) => String(x.id) === doc.dataset.doc); if (r && r.image) showDoc(r); return; }
  const copy = t.closest("[data-copy]");
  if (copy) {
    const flash = (w) => { copy.textContent = w; setTimeout(() => { copy.textContent = "Copy key"; }, 1600); };
    (navigator.clipboard && navigator.clipboard.writeText ? navigator.clipboard.writeText(copy.dataset.copy) : Promise.reject()).then(() => flash("Copied")).catch(() => {
      const range = document.createRange(); range.selectNodeContents(copy.previousElementSibling);
      const sel = getSelection(); sel.removeAllRanges(); sel.addRange(range); flash("Selected");
    });
    return;
  }
  if (t.closest("#clear")) { state.q = ""; state.pick = ""; state.size = ""; $("q").value = ""; $("product").value = ""; fillSizes(); drawReports(); }
});
document.addEventListener("toggle", (e) => { const d = e.target; if (d.classList && d.classList.contains("report")) { if (d.open) openIds.add(d.id); else openIds.delete(d.id); } }, true);
document.querySelectorAll("dialog").forEach((d) => d.addEventListener("click", (e) => { if (e.target === d && d.id !== "gate") closeD(d); }));
$("acctOpen").onclick = async () => { await loadAccount(); acctView(); openD($("acct")); };
$("cartOpen").onclick = () => { drawCart(); openD($("cart")); };
$("stoggle").onclick = () => { $("top").classList.toggle("searching"); if ($("top").classList.contains("searching")) $("hq").focus(); };
$("hq").addEventListener("input", () => { if (LAB) { state.q = $("hq").value; $("q").value = $("hq").value; drawReports(); } else drawProducts(); });
$("hq").addEventListener("keydown", (e) => { if (e.key === "Enter") $(LAB ? "reports" : "products").scrollIntoView({ behavior: "smooth" }); });
$("q").addEventListener("input", (e) => { state.q = e.target.value; drawReports(); });
$("product").addEventListener("change", (e) => { state.pick = e.target.value; state.size = ""; fillSizes(); drawReports(); });
$("size").addEventListener("change", (e) => { state.size = e.target.value; drawReports(); });
$("ship").addEventListener("change", drawTotals);
document.addEventListener("change", (e) => { if (e.target.matches("[data-coaonly]")) { coaOnly = e.target.checked; store.set("coaOnly", coaOnly); if (LAB) location.href = "/#products"; else drawProducts(); } });
$("coForm").addEventListener("submit", submitOrder);
$("trackForm").addEventListener("submit", lookup);
$("vClose").onclick = () => closeD($("viewer"));

function drawHelix() {
  let out = "";
  for (let i = 0; i <= 46; i++) {
    const x = 430 + i * 19, t = i * 0.36, depth = Math.cos(t);
    const y1 = (200 + Math.sin(t) * 92).toFixed(1), y2 = (200 - Math.sin(t) * 92).toFixed(1);
    if (i % 2 === 0) out += `<line class="h-rung" x1="${x}" y1="${y1}" x2="${x}" y2="${y2}"/>`;
    out += `<circle class="h-dot" cx="${x}" cy="${y1}" r="${(5.5 + depth * 2.6).toFixed(1)}" opacity="${(0.5 + depth * 0.3).toFixed(2)}"/>`;
    out += `<circle class="h-dot" cx="${x}" cy="${y2}" r="${(5.5 - depth * 2.6).toFixed(1)}" opacity="${(0.5 - depth * 0.3).toFixed(2)}"/>`;
  }
  $("helix").innerHTML = `<g transform="rotate(-24 880 200)">${out}</g>`;
}

/* ---------- start ---------- */
let first = true;
async function load() {
  const res = await fetch("/api/store"); const j = await res.json();
  S = j.settings; PRODUCTS = j.products; REPORTS = j.reports; SHIP = j.shipping; DOCS = j.documents || [];
  if (first) {
    first = false;
    const name = S.brand || "Research Peptides";
    document.title = LAB ? `Lab reports · ${name}` : name;
    if (LAB) $("hq").placeholder = "Search lab reports";
    $("brand").textContent = name; $("footBrand").textContent = name;
    if (S.tagline) { $("tagline").textContent = S.tagline; $("tagline").hidden = false; }
    if (S.announcementOn && S.announcement) banner($("announce"), S);
    if (S.headline) $("headline").textContent = S.headline;
    if (S.heroEyebrow) $("heroEyebrow").textContent = S.heroEyebrow; else $("heroEyebrow").hidden = true;
    if (S.intro) $("lede").textContent = S.intro; else $("lede").hidden = true;
    if (S.distributorOf) {
      $("topLine").textContent = `Authorized ${S.distributorOf} distributor`;
      $("perkDist").textContent = `Authorized ${S.distributorOf} distributor`;
      // (distributor line above the product grid removed at owner request)
    }
    $("pNote").textContent = S.priceNote || "";
    if (S.contact) { $("pContact").innerHTML = `<strong>Questions:</strong> ${esc(S.contact)}`; $("footContact").textContent = S.contact; }
    if (S.distributorOf) $("footContact").insertAdjacentText("afterbegin", `Authorized ${S.distributorOf} distributor. `);
    $("legalList").innerHTML = (S.disclaimers || []).map(para).map((h) => `<li>${h}</li>`).join("");
    $("footFine").innerHTML = (S.footerNotice || []).map((t) => `<p>${esc(t)}</p>`).join("");
    const cats = [...new Set(PRODUCTS.map((p) => p.category || "Research peptide"))].sort();
    $("footCats").innerHTML = cats.map((c) => `<li><a href="#products" data-cat="${esc(c)}">${esc(c)}</a></li>`).join("");
    $("footCopy").textContent = `© ${new Date().getFullYear()} ${name}`;
    drawHelix();
    const names = [...new Set(REPORTS.map((r) => r.product))];
    $("product").insertAdjacentHTML("beforeend", names.map((n) => `<option value="${esc(n)}">${esc(n)}</option>`).join(""));
    fillSizes();
    // (product / report counts under the headline removed at owner request)
    let hash = location.hash.slice(1); try { hash = decodeURIComponent(hash); } catch (x) { /* raw */ }
    const h = norm(hash);
    const target = h && (REPORTS.find((r) => rid(r) === hash) || REPORTS.find((r) => norm(r.task) === h) || REPORTS.find((r) => r.batch && norm(r.batch) === h));
    if (target) openIds.add(rid(target));
    drawReports();
    if (target) requestAnimationFrame(() => { const el = $(rid(target)); if (el) el.scrollIntoView({ block: "center" }); });
    gate();
  } else drawReports();
  drawProducts(); drawCartCount();
}
loadAccount();
load().catch(() => { $("pgrid").innerHTML = `<div class="card empty"><p><strong>The store couldn't load.</strong> Refresh the page to try again.</p></div>`; });
})();
