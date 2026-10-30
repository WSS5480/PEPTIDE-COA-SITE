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
  if (!el) return;
  if (!S.announcementOn || !S.announcement) { el.hidden = true; el.innerHTML = ""; return; }
  el.hidden = false; el.className = "announce tone-" + (S.bannerTone || "navy");
  if (S.bannerLink) { el.classList.add("linked"); el.onclick = () => { location.href = S.bannerLink; }; el.setAttribute("role", "link"); el.tabIndex = 0; } else { el.onclick = null; el.removeAttribute("role"); }
  if (!S.bannerScroll) { el.textContent = S.announcement; return; }
  const item = `<span>${esc(S.announcement)}</span>`;
  el.classList.add("scroll");
  el.innerHTML = `<div class="mq">${item.repeat(6)}</div><div class="mq" aria-hidden="true">${item.repeat(6)}</div>`;
  el.querySelectorAll(".mq").forEach((m) => { m.style.animationDuration = (S.bannerSpeed || 30) + "s"; });
  el.setAttribute("aria-label", S.announcement);
}
let S = {}, PRODUCTS = [], REPORTS = [], FUL = [], DOCS = [];
let CODE = null; // discount code applied at checkout: { code, kind, value, label, minSubtotalCents }
let PRICING = null; // { markup } when the signed-in customer has their own pricing
let HIDDEN = false; // prices are shown only after a customer signs in
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
// product picture: the uploaded photo if there is one, otherwise the drawn vial (Page setup → Vial look)
const ICON_PATHS = {
  flask: '<path d="M9 3h6M10 3v6l-5 9a2 2 0 0 0 2 3h10a2 2 0 0 0 2-3l-5-9V3"/>',
  doc: '<path d="M7 3h7l5 5v13H7z"/><path d="M14 3v5h5M10 13h6M10 17h6"/>',
  key: '<circle cx="8" cy="15" r="4"/><path d="M11 12l9-9M17 6l3 3M15 8l2 2"/>',
  shield: '<path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z"/><path d="M8.5 12l2.5 2.5 4.5-5"/>',
  truck: '<path d="M3 6h11v10H3zM14 10h4l3 3v3h-7"/><circle cx="7" cy="18" r="2"/><circle cx="17" cy="18" r="2"/>',
  star: '<path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z"/>',
  lock: '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
  chat: '<path d="M4 5h16v11H8l-4 4z"/>',
  box: '<path d="M3 7l9-4 9 4v10l-9 4-9-4z"/><path d="M3 7l9 4 9-4M12 11v10"/>',
  check: '<circle cx="12" cy="12" r="9"/><path d="M8 12l3 3 5-6"/>'
};
function productArt(p) {
  if (p.has_image) return `<img class="pimg" src="/pimg/${p.id}?v=${p.media_v}" alt="${esc(`${p.name} ${p.strength}`)}" loading="lazy">`;
  const v = S.vial || {};
  const style = Object.assign({}, v, p.vial_label ? { label: p.vial_label, photoTint: true } : {});
  const logoUrl = p.has_logo ? `/plogo/${p.id}?v=${p.media_v}` : S.vialLogoV ? `/vial-logo?v=${S.vialLogoV}` : "";
  return window.drawVial({ title: p.name, sub: p.strength, style, logoUrl, photoUrl: `/vial-photo?v=${S.vialPhotoV || 1}` });
}
// A product's lab report matches by name + size, or by its code (e.g. RT30) against the report's Sample line.
const mfrOk = (p, r) => { const a = norm(p.manufacturer), b = norm(r.manufacturer); return !a || !b || a.includes(b) || b.includes(a); };
const reportFor = (p) => REPORTS.find((r) => mfrOk(p, r) && norm(r.product) === norm(p.name) && sizeKey(r.strength) === sizeKey(p.strength))
  ;
// How a product is named on the store: "name" (Retatrutide 30 mg), "code" (RT30) or "both" (Retatrutide 30 mg · RT30)
const withMfr = (p, t) => (p.manufacturer ? `${t} · ${p.manufacturer}` : t);
const labelOf = (p) => `${p.name} ${p.strength}`.trim();
const inCart = (id) => (cart.find((c) => c.id === id) || {}).qty || 0;

function drawChips() {
  const cats = [...new Set(PRODUCTS.map((p) => p.category || "Research peptide"))].sort();
  $("chips").innerHTML = (cats.length > 1 ? [["", "All"], ...cats.map((c) => [c, c])].map(([v, l]) => `<button class="chip${cat === v ? " on" : ""}" type="button" data-cat="${esc(v)}">${esc(l)}</button>`).join("") : "")
    + `<label class="chip coachip${coaOnly ? " on" : ""}"><input type="checkbox" data-coaonly${coaOnly ? " checked" : ""}> Only with lab report</label>`;
  document.querySelectorAll("[data-coaonly]").forEach((b) => { b.checked = coaOnly; });
}
// A product description: the first line(s) say what's in the vial; lines starting with "- " are the benefit bullets.
const descHtml = (d) => {
  const lines = String(d || "").split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const isB = (l) => /^[-•*]\s*/.test(l);
  const text = lines.filter((l) => !isB(l)), bullets = lines.filter(isB).map((l) => l.replace(/^[-•*]\s*/, ""));
  const keepMg = (l) => esc(l).replace(/(\d) (mg|mcg|iu)\b/gi, "$1\u00a0$2"); // "5 mg" never splits across lines
  return `${text.length ? `<p class="stockline pdesc">${text.map(keepMg).join("<br>")}</p>` : ""}${bullets.length ? `<ul class="benefits">${bullets.map((b) => `<li>${esc(b)}</li>`).join("")}</ul>` : ""}`;
};
function drawProducts() {
  drawChips();
  const words = norm($("hq").value) ? $("hq").value.toLowerCase().split(/\s+/).map(norm).filter(Boolean) : [];
  const list = PRODUCTS.filter((p) => (!coaOnly || reportFor(p)) && (!cat || (p.category || "Research peptide") === cat) && words.every((w) => norm([p.name, p.strength, p.manufacturer, p.category, (reportFor(p) || {}).sample].join(" ")).includes(w)));
  $("pgrid").innerHTML = list.length ? list.map((p) => {
    const r = reportFor(p);
    const purity = r ? ((r.results || []).find(([n]) => isPurity(n)) || [])[1] : "";
    const sold = !!S.showSoldOut && p.stock !== null && p.stock <= 0; // "sold out" only when the office turns it on; otherwise it's a backorder
    const price = HIDDEN ? `<p class="p-price ask">Sign in for pricing</p>` : p.price_cents !== null ? `<p class="p-price">${money(p.price_cents)}</p>` : `<p class="p-price ask">Ask for price</p>`;
    const stock = (p.store_note ? `<span class="stockline note">${esc(p.store_note)}</span>` : "") + (sold ? `<span class="soldout">Sold out</span>` : p.stock !== null && p.stock > 0 && p.stock <= 5 ? `<span class="stockline low">Only ${p.stock} left</span>` : "");
    const buy = HIDDEN ? `<button class="btn solid" type="button" data-signin>Sign in to order</button>`
      : p.price_cents === null ? (S.contact ? `<span class="stockline">Contact us: ${esc(S.contact)}</span>` : "")
      : sold ? "" : `<button class="btn solid" type="button" data-add="${p.id}">Add to cart${inCart(p.id) ? ` (${inCart(p.id)})` : ""}</button>`;
    return `<article class="pcard">
      <div class="thumb${!p.has_image && (S.vial || {}).shape !== "vial" && (S.vial || {}).shape !== "tall" && (S.vial || {}).shape !== "round" ? " photo" : ""}">${productArt(p)}</div>
      <div class="pbody">
        <span class="pcat">${esc(p.category || "Research peptide")}${p.manufacturer ? ` · ${esc(p.manufacturer)}` : ""}</span>
        <h3 class="pname">${esc(p.name)}</h3>
        <span class="pmeta">${[p.strength, purity ? `${purity} purity` : ""].filter(Boolean).map(esc).join(" · ")}</span>
        ${descHtml(p.description)}
        <div class="pbuy">${price}${stock}
        <p class="research">For laboratory research use only.</p>
        <div class="pact">${buy}${r ? `<a class="btn" href="/lab-reports#${esc(rid(r))}" data-report="${r.id}" data-pid="${p.id}">Lab report</a>` : `<span class="stockline">No report yet</span>`}${docsFor(p).length ? `<button class="btn" type="button" data-docs="${p.id}">Documents (${docsFor(p).length})</button>` : ""}</div></div>
      </div>
    </article>`;
  }).join("") : `<div class="card empty"><p><strong>No product matches.</strong> ${coaOnly ? "You're showing only products with a lab report. Untick it to see everything." : "Try another name or size."}</p></div>`;
}

/* ---------- cart ---------- */
function cartLines() {
  return cart.map((c) => ({ ...c, p: PRODUCTS.find((p) => p.id === c.id) })).filter((l) => l.p && l.p.price_cents !== null);
}
function drawCartCount() { $("cartN").textContent = cart.reduce((n, c) => n + c.qty, 0); }
// what the chosen way of getting the order costs on this subtotal (shipping can be free over an amount; delivery is free)
function shipCost(f, sub) { return !f ? 0 : f.freeOverCents > 0 && sub >= f.freeOverCents ? 0 : f.cents; }
const chosenFul = () => FUL.find((f) => f.key === ($("fulfil").querySelector("input:checked") || {}).value) || FUL[0] || null;
// what the applied discount code takes off a subtotal (the server checks it again when the order is placed)
function codeOff(sub) {
  if (!CODE || !sub) return 0;
  if (CODE.minSubtotalCents && sub < CODE.minSubtotalCents) return 0;
  return Math.max(0, Math.min(sub, CODE.kind === "percent" ? Math.round(sub * CODE.value / 100) : CODE.value));
}
function drawCart() {
  const lines = cartLines();
  if (lines.length !== cart.length) { cart = lines.map(({ id, qty }) => ({ id, qty })); saveCart(); }
  if (HIDDEN) {
    $("cartBody").innerHTML = `<div class="empty"><p>Sign in with your PIN to see prices and order.</p></div>`;
    $("cartFoot").innerHTML = `<button class="btn solid wide" type="button" data-close data-signin>Sign in</button>`;
    return;
  }
  if (!lines.length) {
    $("cartBody").innerHTML = `<div class="empty"><p>Your cart is empty.</p></div>`;
    $("cartFoot").innerHTML = `<button class="btn wide" type="button" data-close data-goto="products">Browse products</button>`;
    return;
  }
  const sub = lines.reduce((s, l) => s + l.p.price_cents * l.qty, 0);
  $("cartBody").innerHTML = lines.map((l) => `<div class="line">
    <div class="nm">${esc(withMfr(l.p, labelOf(l.p)))}<small>${money(l.p.price_cents)} each</small></div>
    <div class="amt">${money(l.p.price_cents * l.qty)}</div>
    <div class="ctl"><span class="qty"><button type="button" data-dec="${l.id}" aria-label="One less">−</button><span>${l.qty}</span><button type="button" data-inc="${l.id}" aria-label="One more">+</button></span>
      <button class="linkbtn" type="button" data-rm="${l.id}">Remove</button></div>
  </div>`).join("");
  const min = S.minOrderCents || 0;
  $("cartFoot").innerHTML = `<div class="totals"><div class="big"><span>Subtotal</span><span>${money(sub)}</span></div>
    <div class="dist"><span>${FUL.some((f) => f.key === "delivery") ? "Shipping or free local delivery is chosen at checkout." : "Shipping is added at checkout."}</span></div></div>
    <p class="research">All items are sold for laboratory research only.</p>
    ${min && sub < min ? `<div class="err">The minimum order is ${money(min)}.</div>` : ""}
    ${S.storeOpen ? `<button class="btn solid wide" type="button" id="toCheckout" ${min && sub < min ? "disabled" : ""}>Checkout</button>` : `<div class="err">Ordering is paused right now. Please check back soon.</div>`}`;
}
function addToCart(id, n = 1) {
  const p = PRODUCTS.find((x) => x.id === id); if (!p) return;
  const line = cart.find((c) => c.id === id);
  let qty = (line ? line.qty : 0) + n;
  if (p.max_per_order) qty = Math.min(qty, p.max_per_order);
  if (S.showSoldOut && p.stock !== null) qty = Math.min(qty, p.stock); // with sold-out hidden, orders beyond stock are backorders
  if (qty <= 0) cart = cart.filter((c) => c.id !== id);
  else if (line) line.qty = qty; else cart.push({ id, qty });
  saveCart();
}

/* ---------- checkout ---------- */
const submitLabel = () => (S.cardPayments ? "Pay with card" : "Submit order request");
function drawTotals() {
  const lines = cartLines(), sub = lines.reduce((s, l) => s + l.p.price_cents * l.qty, 0);
  const f = chosenFul(), sc = shipCost(f, sub), off = codeOff(sub);
  $("coTotals").innerHTML = `<div><span>${plural(lines.reduce((n, l) => n + l.qty, 0), "item")}</span><span>${money(sub)}</span></div>
    ${off ? `<div class="off"><span>Discount (${esc(CODE.code)})</span><span>−${money(off)}</span></div>` : ""}
    ${f ? `<div><span>${esc(f.label)}</span><span>${sc ? money(sc) : "Free"}</span></div>` : `<div><span>Shipping</span><span>Confirmed with your order</span></div>`}
    <div class="big"><span>${S.cardPayments ? "Total" : "Estimated total"}</span><span>${money(sub - off + sc)}</span></div>`;
  if (CODE && CODE.minSubtotalCents && sub < CODE.minSubtotalCents) $("cCodeMsg").textContent = `${CODE.code} needs an order of at least ${money(CODE.minSubtotalCents)}.`;
}
function drawFulfillment() {
  const lines = cartLines(), sub = lines.reduce((s, l) => s + l.p.price_cents * l.qty, 0);
  const keep = ($("fulfil").querySelector("input:checked") || {}).value || store.get("fulfil") || (FUL[0] || {}).key;
  $("fulfilField").hidden = !FUL.length;
  $("fulfil").innerHTML = FUL.map((f, i) => `<label class="choice-opt"><input type="radio" name="fulfil" value="${esc(f.key)}"${f.key === keep || (!FUL.some((x) => x.key === keep) && i === 0) ? " checked" : ""}>
    <span><strong>${esc(f.label)}</strong>${f.note || (f.key === "ship" && f.freeOverCents > 0) ? `<small>${esc(f.note)}${f.key === "ship" && f.freeOverCents > 0 ? `${f.note ? " · " : ""}Free over ${money(f.freeOverCents)}` : ""}</small>` : ""}</span>
    <span class="amt">${shipCost(f, sub) ? money(shipCost(f, sub)) : "Free"}</span></label>`).join("");
}
async function applyCode() {
  const code = $("cCode").value.trim().toUpperCase();
  $("cCodeMsg").textContent = "";
  if (!code) { CODE = null; drawTotals(); return; }
  const lines = cartLines(), sub = lines.reduce((s, l) => s + l.p.price_cents * l.qty, 0);
  try {
    const j = await post("/api/discount", { code, subtotalCents: sub });
    CODE = { code: j.code, kind: j.kind, value: j.value, label: j.label, minSubtotalCents: j.minSubtotalCents || 0 };
    $("cCode").value = j.code;
    $("cCodeMsg").textContent = `${j.label} applied.`;
  } catch (x) { CODE = null; $("cCodeMsg").textContent = x.message; }
  drawTotals();
}
function openCheckout() {
  closeD($("cart"));
  $("coForm").hidden = false; $("coDone").hidden = true; $("coErr").hidden = true;
  $("cfAgeText").textContent = `I am ${S.minAge} or older.`;
  $("coIntro").textContent = S.cardPayments ? "You'll pay securely by card on the next screen. We never see your card number." : "No payment is taken here. We review your order, then contact you with the total and how to pay.";
  $("coSubmit").textContent = submitLabel();
  $("cEmailLabel").textContent = ME ? "Email (optional)" : "Email";
  drawFulfillment();
  const saved = ME ? { name: ME.name, email: ME.email, phone: ME.phone, ...(ME.address || {}) } : (store.get("buyer") || {});
  [["cName", "name"], ["cEmail", "email"], ["cPhone", "phone"], ["a1", "line1"], ["a2", "line2"], ["aCity", "city"], ["aState", "state"], ["aZip", "zip"]].forEach(([id, k]) => { if (saved[k] && !$(id).value) $(id).value = saved[k]; });
  if (CODE) applyCode(); else drawTotals();
  openD($("checkout"));
}
async function submitOrder(e) {
  e.preventDefault();
  const err = (m) => { $("coErr").textContent = m; $("coErr").hidden = false; $("coErr").scrollIntoView({ block: "nearest" }); };
  const v = (id) => $(id).value.trim();
  if (!v("cName")) return err("Enter your name.");
  if (v("cEmail") ? !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v("cEmail")) : !ME) return err(v("cEmail") ? "That email doesn't look right." : "Enter your email.");
  if (!v("a1") || !v("aCity") || !v("aState") || !v("aZip")) return err("Enter your full address.");
  if (!$("cfAge").checked || !$("cfRes").checked) return err("Please confirm both statements to place the order.");
  const f = chosenFul();
  const body = {
    name: v("cName"), email: v("cEmail"), phone: v("cPhone"),
    address: { line1: v("a1"), line2: v("a2"), city: v("aCity"), state: v("aState"), zip: v("aZip"), country: "US" },
    fulfillment: f ? f.key : "ship", discountCode: CODE ? CODE.code : "", pay: S.cardPayments ? "card" : "request",
    note: v("cNote"), website: $("website").value, confirmAge: true, confirmResearch: true, items: cart
  };
  $("coSubmit").disabled = true; $("coSubmit").textContent = S.cardPayments ? "Opening the payment page…" : "Sending…";
  try {
    const res = await fetch("/api/orders", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const j = await res.json();
    if (!res.ok) return err(j.error || "Could not place the order.");
    store.set("buyer", { name: body.name, email: body.email, phone: body.phone, ...body.address });
    if (f) store.set("fulfil", f.key);
    cart = []; saveCart(); drawProducts(); CODE = null; $("cCode").value = ""; $("cCodeMsg").textContent = "";
    if (j.payUrl) { store.set("pendingPay", { number: j.number, email: body.email }); location.href = j.payUrl; return; }
    $("coForm").hidden = true;
    $("coDone").hidden = false;
    $("coDone").innerHTML = `<div class="sectionhead" style="padding:0"><h2>Order received</h2><button class="btn" type="button" data-close>Close</button></div>
      <div class="okbox"><span class="eyebrow">Your order number</span><span class="num">${esc(j.number)}</span>
      <span>${esc(j.shippingName || "")}${j.shippingName ? " · " : ""}Estimated total ${money(j.totalCents)}</span></div>
      <p>${esc(j.paymentInstructions)}</p>
      <p class="dist">${ME ? "This order is saved under My account." : "Save your order number. You can check its status any time under \"Check an order\" with the email you used, or create an account to keep all your orders in one place."}</p>`;
    load(); loadAccount(); // refresh stock and order history
  } catch (x) { err("Couldn't reach the store. Check your connection and try again."); }
  finally { $("coSubmit").disabled = false; $("coSubmit").textContent = submitLabel(); }
}
// Back from Stripe: ?paid=NUMBER (paid), ?pay=cancelled&o=NUMBER (left without paying), ?pay=pending (not confirmed yet)
function afterPayment() {
  const u = new URL(location.href), paid = u.searchParams.get("paid"), pay = u.searchParams.get("pay"), num = u.searchParams.get("o") || paid;
  if (!paid && !pay) return;
  history.replaceState(null, "", u.pathname + u.hash);
  const pending = store.get("pendingPay") || {};
  const payBtn = num && pending.number === num && pending.email ? `<button class="btn solid" type="button" id="payAgain">Pay now by card</button>` : "";
  $("coForm").hidden = true; $("coDone").hidden = false;
  $("coDone").innerHTML = `<div class="sectionhead" style="padding:0"><h2>${paid ? "Payment received" : pay === "cancelled" ? "Order saved, not paid" : "Checking your payment"}</h2><button class="btn" type="button" data-close>Close</button></div>
    ${paid ? `<div class="okbox"><span class="eyebrow">Your order number</span><span class="num">${esc(num)}</span><span>Thank you! Your payment went through and your order is being prepared. A confirmation is on its way to your email.</span></div>`
      : pay === "cancelled" ? `<div class="okbox"><span class="eyebrow">Order ${esc(num)}</span><span>We saved your order, but no payment was made. You can pay now, or later under "Check an order" with your order number and email.</span>${payBtn ? `<div>${payBtn}</div>` : ""}</div>`
      : pay === "pending" ? `<div class="okbox"><span class="eyebrow">Order ${esc(num)}</span><span>Your payment hasn't been confirmed yet. If you paid, it will show within a few minutes under "Check an order". If not, you can pay there by card.</span></div>`
      : `<div class="err">We couldn't match that payment to an order. Check your order under "Check an order", or contact us.</div>`}`;
  if (paid) store.set("pendingPay", null);
  const b = $("payAgain"); if (b) b.onclick = () => payOrder(num, pending.email, b);
  openD($("checkout"));
}
async function payOrder(number, email, btn) {
  if (btn) { btn.disabled = true; btn.textContent = "Opening the payment page…"; }
  try { const j = await post("/api/orders/pay", { number, email }); store.set("pendingPay", { number, email }); location.href = j.payUrl; }
  catch (x) { toast(x.message); if (btn) { btn.disabled = false; btn.textContent = "Pay now by card"; } }
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
      <strong>${esc(o.paid_at && o.status === "paid" ? "Paid, getting ready" + (o.fulfillment === "delivery" ? " for delivery" : " to ship") : STATUS_TEXT[o.status] || o.status)}</strong>
      ${o.tracking ? `<span>${esc(o.carrier || "Tracking")}: <span class="mono">${esc(o.tracking)}</span></span>` : ""}${o.eta && o.status === "shipped" ? `<span>Estimated arrival: ${esc(new Date(String(o.eta).slice(0, 10) + "T12:00:00Z").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" }))}</span>` : ""}
      <span>${j.items.map((i) => `${i.qty} × ${esc(i.name)} ${esc(i.strength)}`).join(", ")}</span>
      <span>${o.shipping_method ? esc(o.shipping_method) + (o.shipping_cents ? ` ${money(o.shipping_cents)}` : " (free)") + " · " : ""}${o.discount_cents ? `Discount −${money(o.discount_cents)} · ` : ""}Total ${money(o.total_cents)}${o.paid_at ? " · paid by card" : ""}</span>
      ${o.canPay ? `<div><button class="btn solid" type="button" id="payLookup">Pay now by card</button></div>` : ""}</div>`;
    const b = $("payLookup"); if (b) b.onclick = () => payOrder(o.number, $("tEmail").value.trim(), b);
  } catch (x) { out.innerHTML = `<div class="err">Couldn't reach the store. Try again.</div>`; }
}


/* ---------- customer account ---------- */
let ME = null, MY_ORDERS = [], HOUSE = false; // HOUSE: signed in with the store's own PIN (the office), no customer account
async function loadAccount() {
  try { const j = await (await fetch("/api/account", { credentials: "same-origin" })).json(); ME = j.customer; MY_ORDERS = j.orders || []; HOUSE = !ME && !!j.house; } catch (e) { ME = null; HOUSE = false; }
  $("acctLabel").textContent = ME ? (ME.name || "Account").split(" ")[0] : HOUSE ? "Office" : "Sign in";
  whoBar();
}
// a shared or borrowed phone: say plainly who this browser is signed in as, with a one-tap way out
function whoBar() {
  let bar = document.getElementById("whoBar");
  if (!ME) { if (bar) bar.remove(); return; }
  if (!bar) { bar = document.createElement("div"); bar.id = "whoBar"; bar.className = "whobar"; document.getElementById("top").insertAdjacentElement("afterend", bar); }
  bar.innerHTML = `<span>Signed in as <strong>${esc(ME.name || ME.email)}</strong></span> <button class="linkbtn" type="button" id="whoOut">Not you? Sign out</button>`;
  document.getElementById("whoOut").onclick = async () => { await post("/api/account/logout", {}); await loadAccount(); await load(); toast("Signed out"); };
}
// coming back to the tab after a while: re-check who's signed in (idle sign-out may have happened)
if (new URLSearchParams(location.search).get("signin") === "1") { history.replaceState(null, "", location.pathname); window.addEventListener("load", () => { setTimeout(() => { loadAccount().then(() => { if (!ME) { const b = document.getElementById("acctLabel"); const t = b && b.closest("button, a"); if (t) t.click(); } }); }, 400); }); }
document.addEventListener("visibilitychange", () => { if (!document.hidden && (ME || HOUSE)) loadAccount().then(() => { if (!ME && !HOUSE) load(); }); });
async function post(url, body, method = "POST") {
  const r = await fetch(url, { method, headers: { "Content-Type": "application/json" }, credentials: "same-origin", body: JSON.stringify(body) });
  const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(j.error || "That didn't work."); return j;
}
function acctView(mode) {
  const b = $("acBody"), close = `<button class="btn" type="button" data-close>Close</button>`;
  const fld = (id, label, type = "text", ac = "", val = "") => `<div class="field"><label class="eyebrow" for="${id}">${label}</label><input id="${id}" type="${type}" autocomplete="${ac}" value="${esc(val)}"></div>`;
  if (!ME && mode === "request") {
    b.innerHTML = `<div class="sectionhead" style="padding:0"><h2 id="acTitle">Request a PIN</h2>${close}</div>
      <div class="tabs"><button type="button" data-acct="signin">Sign in</button><button class="on" type="button">Request a PIN</button></div>
      <p class="dist">Tell us who you are and we'll set you up with a PIN. Accounts are created by ${esc(S.brand || "the store")}, not online.</p>
      <form id="acForm" class="stack"><div class="grid2">${fld("rqN", "Your name", "text", "name")}${fld("rqC", "Company or clinic (optional)", "text", "organization")}${fld("rqE", "Email", "email", "email")}${fld("rqP", "Phone", "tel", "tel")}</div>
      <div class="field"><label class="eyebrow" for="rqM">Message (optional)</label><textarea id="rqM" maxlength="1000" placeholder="Anything we should know, e.g. who referred you"></textarea></div>
      <label class="hp">Leave this empty <input id="rqW" tabindex="-1" autocomplete="off"></label>
      <div class="err" id="acErr" hidden></div><button class="btn solid wide">Send request</button></form>`;
    $("acForm").onsubmit = async (e) => {
      e.preventDefault();
      try {
        await post("/api/pin-request", { name: $("rqN").value, company: $("rqC").value, email: $("rqE").value, phone: $("rqP").value, note: $("rqM").value, website: $("rqW").value });
        b.innerHTML = `<div class="sectionhead" style="padding:0"><h2 id="acTitle">Request sent</h2>${close}</div><div class="okbox"><strong>Thanks, ${esc($("rqN").value.trim() || "we got it")}.</strong><span>We'll be in touch with your PIN${S.contact ? ` — or reach us at ${esc(S.contact)}` : ""}. Until then you can order as a guest.</span></div>`;
      } catch (x) { $("acErr").textContent = x.message; $("acErr").hidden = false; }
    };
    return;
  }
  if (!ME && HOUSE) {
    b.innerHTML = `<div class="sectionhead" style="padding:0"><h2 id="acTitle">Office sign-in</h2>${close}</div>
      <p class="dist">You're signed in with the store PIN. Store prices are showing and the cart is open; checkout asks for the customer's name and email, like a walk-in order. Customers with their own PIN see their own pricing instead.</p>
      <div class="row2" style="margin:.4rem 0"><a class="btn solid" href="/admin" style="display:inline-grid;place-items:center;text-decoration:none">Open Admin</a><a class="btn" href="/rep" style="display:inline-grid;place-items:center;text-decoration:none">Rep app</a></div>
      <p class="dist">Admin and the rep app ask for your email and password (team logins). <button class="linkbtn" type="button" id="acOut">Sign out</button></p>
      <form id="acForm" class="stack" style="margin-top:.6rem;padding-top:.6rem;border-top:1px solid var(--line)"><div class="field"><label class="eyebrow" for="acPin">Sign in as a customer with their PIN (to see their pricing or order for them)</label><input id="acPin" inputmode="numeric" autocomplete="one-time-code" maxlength="8" placeholder="Customer's PIN"></div>
      <div class="err" id="acErr" hidden></div><button class="btn wide" type="submit">Switch to that customer</button></form>`;
    $("acOut").onclick = async () => { await post("/api/account/logout", {}); await loadAccount(); await load(); toast("Signed out"); closeD($("acct")); };
    $("acForm").onsubmit = async (e) => { e.preventDefault(); try { await post("/api/account/pin", { pin: $("acPin").value }); await loadAccount(); await load(); toast(ME ? "Signed in as " + (ME.name || "customer") : "Signed in"); acctView(); } catch (x) { $("acErr").textContent = x.message; $("acErr").hidden = false; } };
    return;
  }
  if (!ME) {
    b.innerHTML = `<div class="sectionhead" style="padding:0"><h2 id="acTitle">Sign in</h2>${close}</div>
      <div class="tabs"><button class="on" type="button">Sign in</button><button type="button" data-acct="request">Request a PIN</button></div>
      <p class="dist">Enter the PIN ${esc(S.brand || "we")} gave you. It signs you in, shows your pricing and keeps your orders in one place.</p>
      <form id="acForm" class="stack"><div class="field"><label class="eyebrow" for="acPin">Your PIN</label><input id="acPin" inputmode="numeric" autocomplete="one-time-code" maxlength="8" placeholder="4 to 8 digits" style="font:600 1.4rem/1 var(--mono);letter-spacing:.3em;text-align:center"></div>
      <div class="err" id="acErr" hidden></div><button class="btn solid wide">Sign in</button></form>
      <p class="dist">No PIN yet? <button class="linkbtn" type="button" data-acct="request">Request one</button> — accounts are set up by us, not online. You can still order as a guest.</p>
      <p class="dist" style="margin-top:.6rem">Staff: the store PIN signs the office in here; <a href="/admin">Admin</a> and the <a href="/rep">rep app</a> use your email and password.</p>`;
    $("acPin").focus();
    $("acForm").onsubmit = async (e) => { e.preventDefault(); try { await post("/api/account/pin", { pin: $("acPin").value }); await loadAccount(); await load(); toast("Signed in"); acctView(); } catch (x) { $("acErr").textContent = x.message; $("acErr").hidden = false; } };
    return;
  }
  const a = ME.address || {};
  const tab = mode === "details" ? "details" : "orders";
  b.innerHTML = `<div class="sectionhead" style="padding:0"><h2 id="acTitle">My account</h2>${close}</div>
    <p class="dist">Signed in as ${esc(ME.name || ME.email)}${ME.email ? ` (${esc(ME.email)})` : ""} · <button class="linkbtn" type="button" id="acOut">Sign out</button></p>
    <div class="tabs"><button type="button" class="${tab === "orders" ? "on" : ""}" data-acct="orders">My orders</button><button type="button" class="${tab === "details" ? "on" : ""}" data-acct="details">Details &amp; address</button></div>
    ${tab === "orders" ? `<div class="olist">${MY_ORDERS.length ? MY_ORDERS.map((o) => `<div class="orow"><div class="top2"><span>Order ${esc(o.number)}</span><span>${money(o.total_cents)}</span></div>
        <span>${fmtDate(o.created_at)} · ${esc(STATUS_TEXT[o.status] || o.status)}${o.shipping_method ? ` · ${esc(o.shipping_method)}` : ""}${o.paid_at ? " · paid by card" : ""}</span>
        <span class="dist">${(o.items || []).map((i) => `${i.qty} × ${esc(i.name)} ${esc(i.strength)}`).join(", ")}</span>
        ${o.tracking ? `<span>${esc(o.carrier || "Tracking")}: <span class="mono">${esc(o.tracking)}</span></span>` : ""}${o.eta && o.status === "shipped" ? `<span>Estimated arrival: ${esc(new Date(String(o.eta).slice(0, 10) + "T12:00:00Z").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" }))}</span>` : ""}
        ${o.canPay ? `<span><button class="btn solid" type="button" data-payorder="${esc(o.number)}">Pay now by card</button></span>` : ""}</div>`).join("") : `<p class="dist">No orders yet.</p>`}</div>`
    : `<form id="acForm" class="stack"><div class="grid2">${fld("mN", "Full name", "text", "name", ME.name)}${fld("mPh", "Phone", "tel", "tel", ME.phone)}</div>
      <div class="grid2">${fld("m1", "Street address", "text", "address-line1", a.line1)}${fld("m2", "Apt, suite", "text", "address-line2", a.line2)}${fld("mC", "City", "text", "address-level2", a.city)}${fld("mS", "State", "text", "address-level1", a.state)}${fld("mZ", "ZIP", "text", "postal-code", a.zip)}</div>
      <div class="err" id="acErr" hidden></div><button class="btn solid wide">Save</button></form>`}`;
  $("acOut").onclick = async () => { await post("/api/account/logout", {}); await loadAccount(); await load(); toast("Signed out"); closeD($("acct")); };
  if (tab === "details") $("acForm").onsubmit = async (e) => {
    e.preventDefault();
    try {
      await post("/api/account", { name: $("mN").value, phone: $("mPh").value, address: { line1: $("m1").value, line2: $("m2").value, city: $("mC").value, state: $("mS").value, zip: $("mZ").value } }, "PATCH");
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
  const po = t.closest("[data-payorder]");
  if (po && ME) { payOrder(po.dataset.payorder, ME.email, po); return; }
  if (t.closest("[data-signin]")) { loadAccount().then(() => { acctView(); openD($("acct")); }); return; }
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
$("fulfil").addEventListener("change", drawTotals);
$("cCodeApply").onclick = applyCode;
$("cCode").addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); applyCode(); } });
$("cCode").addEventListener("input", () => { if (CODE && $("cCode").value.trim().toUpperCase() !== CODE.code) { CODE = null; $("cCodeMsg").textContent = ""; drawTotals(); } });
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
  S = j.settings; PRODUCTS = j.products; REPORTS = j.reports; FUL = j.fulfillment || []; DOCS = j.documents || [];
  banner(document.getElementById("announce"), S);
  PRICING = j.pricing || null; HIDDEN = !!j.pricesHidden;
  if (first) {
    first = false;
    afterPayment();
    const name = S.brand || "360 Medical Peptides";
    document.title = LAB ? `Lab reports · ${name}` : name;
    if (LAB) $("hq").placeholder = "Search lab reports";
    $("brand").textContent = name; $("footBrand").textContent = name;
    if (S.siteLogoV) { $("brandImg").src = "/site-logo?v=" + S.siteLogoV; $("brandImg").alt = name; $("brandImg").hidden = false; $("brand").classList.add("hp"); $("tagline").classList.add("hp"); }
    if (S.tagline) { $("tagline").textContent = S.tagline; $("tagline").hidden = false; }
    if (S.headline) $("headline").textContent = S.headline;
    if (S.heroEyebrow) $("heroEyebrow").textContent = S.heroEyebrow; else $("heroEyebrow").hidden = true;
    if (S.intro) $("lede").textContent = S.intro; else $("lede").hidden = true;
    const perks = (S.perks || []).filter((c) => c.title || c.text);
    if (S.perksOn !== false && perks.length) {
      $("perks").innerHTML = perks.map((c) => `<li><svg viewBox="0 0 24 24" aria-hidden="true">${ICON_PATHS[c.icon] || ICON_PATHS.check}</svg><div><strong>${esc(c.title)}</strong><span>${esc(c.text)}</span></div></li>`).join("");
      $("perks").hidden = false;
    }
    if (S.distributorOf) {
      $("topLine").textContent = `Authorized ${S.distributorOf} distributor`;
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
    fetch("/api/build").then((r) => r.json()).then((b) => { $("footVer").textContent = `Version ${b.version} · updated ${fmtDate(b.updated)}`; $("footVer").hidden = false; }).catch(() => {});
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
  { const base = S.priceNote || ""; $("pNote").textContent = HIDDEN ? "Prices show once you sign in with your PIN." : PRICING ? `${base}${base ? " · " : ""}Your account pricing is applied.` : base; }
  drawProducts(); drawCartCount();
}
if (window.AppRefresh) window.AppRefresh.init({
  version: "/api/version", interval: 30000,
  canAuto: () => !document.querySelector("dialog[open]") && !/^(INPUT|TEXTAREA|SELECT)$/.test((document.activeElement || {}).tagName || ""),
  refresh: async () => { await load(); await loadAccount(); }
});
loadAccount();
load().catch(() => { $("pgrid").innerHTML = `<div class="card empty"><p><strong>The store couldn't load.</strong> Refresh the page to try again.</p></div>`; });
})();
