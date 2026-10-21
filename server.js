// Storefront + admin server. Static pages in /public, JSON API under /api.
const path = require("path");
const crypto = require("crypto");
const express = require("express");
const bcrypt = require("bcryptjs");
const { q, init, getSettings, DEFAULT_SETTINGS } = require("./server/db");

const app = express();
app.set("trust proxy", 1);
app.disable("x-powered-by");
app.use(express.json({ limit: "8mb" }));
app.use((req, res, next) => {
  res.set("X-Content-Type-Options", "nosniff");
  res.set("Referrer-Policy", "same-origin");
  res.set("X-Frame-Options", "DENY");
  next();
});

/* ---------- helpers ---------- */
const STATUSES = ["new", "confirmed", "paid", "shipped", "delivered", "cancelled"];
const str = (v, max = 500) => String(v ?? "").trim().slice(0, max);
const intOrNull = (v) => (v === "" || v === null || v === undefined ? null : Number.isFinite(+v) ? Math.round(+v) : null);
const centsOrNull = (v) => (v === "" || v === null || v === undefined ? null : Number.isFinite(+v) ? Math.round(+v * 100) : null);
const isEmail = (s) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
const bad = (res, msg, code = 400) => res.status(code).json({ error: msg });
const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
const parseCookies = (h) => Object.fromEntries(String(h || "").split(/;\s*/).filter(Boolean).map((p) => { const i = p.indexOf("="); return [p.slice(0, i), decodeURIComponent(p.slice(i + 1))]; }));
const SECURE = process.env.NODE_ENV === "production" || !!process.env.RENDER;

function publicSettings(s) {
  const keys = ["brand", "tagline", "distributorOf", "brandUrl", "contact", "announcement", "announcementOn", "bannerScroll", "heroEyebrow", "headline", "storeOpen", "minAge", "ageGate", "minOrderCents", "priceNote", "intro", "disclaimers", "paymentInstructions", "footerNotice", "policyTerms", "policyReturns", "policyShipping", "policyPrivacy"];
  return Object.fromEntries(keys.map((k) => [k, s[k]]));
}
const reportOut = (r) => ({
  id: r.id, product: r.product, strength: r.strength, sample: r.sample, task: r.task, key: r.key, verifyUrl: r.verify_url,
  lab: r.lab, client: r.client, manufacturer: r.manufacturer, batch: r.batch,
  ordered: r.ordered ? r.ordered.toISOString().slice(0, 10) : "", received: r.received ? r.received.toISOString().slice(0, 10) : "",
  tested: r.tested ? r.tested.toISOString().slice(0, 10) : "", testsRequested: r.tests_requested, results: r.results,
  image: r.has_image ? `/coa/${r.id}` : "", active: r.active
});
const REPORT_COLS = "id,product,strength,sample,task,key,verify_url,lab,client,manufacturer,batch,ordered,received,tested,tests_requested,results,active,(image is not null) has_image";

/* tiny in-memory rate limit */
const hits = new Map();
function limit(name, max, windowMs) {
  return (req, res, next) => {
    const k = name + req.ip, now = Date.now();
    const arr = (hits.get(k) || []).filter((t) => now - t < windowMs);
    if (arr.length >= max) return bad(res, "Too many tries. Wait a few minutes and try again.", 429);
    arr.push(now); hits.set(k, arr); next();
  };
}

/* ---------- auth ---------- */
async function auth(req, res, next) {
  const token = parseCookies(req.headers.cookie).sid;
  if (!token) return bad(res, "Sign in first", 401);
  const { rows } = await q("select u.id, u.email, u.name, u.role from sessions s join users u on u.id = s.user_id where s.token = $1 and s.expires > now() and u.active", [token]);
  if (!rows[0]) return bad(res, "Sign in first", 401);
  req.user = rows[0];
  // admin API only accepts JSON, which a plain cross-site form cannot send
  if (req.method !== "GET" && !req.is("application/json")) return bad(res, "Bad request");
  next();
}
const owner = (req, res, next) => (req.user.role === "owner" ? next() : bad(res, "Only the owner can do that", 403));

/* ---------- public API ---------- */
app.get("/api/store", wrap(async (req, res) => {
  const s = await getSettings();
  const [{ rows: products }, { rows: reports }, { rows: shipping }] = await Promise.all([
    q("select id,name,strength,sku,category,description,price_cents,stock,max_per_order from products where active order by sort, name, strength"),
    q(`select ${REPORT_COLS} from reports where active order by product, tested desc nulls last`),
    q("select id,name,detail,price_cents,free_over_cents from shipping_methods where active order by sort, price_cents")
  ]);
  res.set("Cache-Control", "no-store");
  res.json({ settings: publicSettings(s), products, reports: reports.map(reportOut), shipping });
}));

app.get("/coa/:id", wrap(async (req, res) => {
  const { rows } = await q("select image, image_type from reports where id = $1 and image is not null", [intOrNull(req.params.id)]);
  if (!rows[0]) return res.status(404).send("Not found");
  res.set("Content-Type", rows[0].image_type || "image/jpeg");
  res.set("Cache-Control", "public, max-age=3600");
  res.send(rows[0].image);
}));

app.post("/api/orders", limit("order", 6, 15 * 60 * 1000), wrap(async (req, res) => {
  const s = await getSettings();
  if (!s.storeOpen) return bad(res, "Ordering is paused right now. Please check back soon.");
  const b = req.body || {};
  if (b.website) return res.json({ ok: true, number: "0" }); // honeypot field bots fill in
  if (!b.confirmResearch || !b.confirmAge) return bad(res, "Please confirm both statements before placing the order.");
  const name = str(b.name, 120), email = str(b.email, 160).toLowerCase(), phone = str(b.phone, 40);
  const a = b.address || {};
  const address = { line1: str(a.line1, 160), line2: str(a.line2, 160), city: str(a.city, 80), state: str(a.state, 40), zip: str(a.zip, 20), country: str(a.country || "US", 40) };
  if (!name || !isEmail(email)) return bad(res, "Enter your name and a valid email.");
  if (!address.line1 || !address.city || !address.state || !address.zip) return bad(res, "Enter a full shipping address.");
  const items = Array.isArray(b.items) ? b.items.slice(0, 50) : [];
  if (!items.length) return bad(res, "Your cart is empty.");

  const client = await require("./server/db").pool.connect();
  try {
    await client.query("begin");
    let subtotal = 0; const lines = [];
    for (const it of items) {
      const qty = Math.max(1, Math.min(99, intOrNull(it.qty) || 1));
      const { rows: [p] } = await client.query("select * from products where id = $1 and active for update", [intOrNull(it.id)]);
      if (!p) throw new Error("An item in your cart is no longer available. Remove it and try again.");
      if (p.price_cents === null) throw new Error(`${p.name} ${p.strength} has no price yet. Remove it and contact us for a quote.`);
      if (p.max_per_order && qty > p.max_per_order) throw new Error(`${p.name} ${p.strength} is limited to ${p.max_per_order} per order.`);
      if (p.stock !== null && qty > p.stock) throw new Error(p.stock > 0 ? `Only ${p.stock} of ${p.name} ${p.strength} left.` : `${p.name} ${p.strength} is sold out.`);
      if (p.stock !== null) await client.query("update products set stock = stock - $1 where id = $2", [qty, p.id]);
      subtotal += p.price_cents * qty;
      lines.push({ p, qty });
    }
    if (s.minOrderCents && subtotal < s.minOrderCents) throw new Error(`The minimum order is $${(s.minOrderCents / 100).toFixed(2)}.`);
    let shipName = "", shipCents = 0;
    const { rows: methods } = await client.query("select * from shipping_methods where active");
    if (methods.length) {
      const m = methods.find((x) => x.id === intOrNull(b.shippingMethodId));
      if (!m) throw new Error("Choose a shipping option.");
      shipName = m.name; shipCents = m.free_over_cents !== null && subtotal >= m.free_over_cents ? 0 : m.price_cents;
    }
    const cust = await customerFrom(req);
    const number = String(Date.now()).slice(-6) + crypto.randomInt(10, 99);
    const { rows: [o] } = await client.query(
      `insert into orders(number,name,email,phone,address,shipping_method,shipping_cents,subtotal_cents,total_cents,customer_note,customer_id)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) returning id`,
      [number, name, email, phone, JSON.stringify(address), shipName, shipCents, subtotal, subtotal + shipCents, str(b.note, 1000), cust ? cust.id : null]);
    for (const { p, qty } of lines) {
      await client.query("insert into order_items(order_id,product_id,name,strength,unit_cents,qty) values ($1,$2,$3,$4,$5,$6)", [o.id, p.id, p.name, p.strength, p.price_cents, qty]);
    }
    await client.query("insert into order_events(order_id, who, text) values ($1, 'Customer', 'Order placed; customer confirmed research use and age')", [o.id]);
    await client.query("commit");
    res.json({ ok: true, number, subtotalCents: subtotal, shippingCents: shipCents, totalCents: subtotal + shipCents, paymentInstructions: s.paymentInstructions });
  } catch (e) {
    await client.query("rollback").catch(() => {});
    bad(res, e.message || "Could not place the order.");
  } finally { client.release(); }
}));

// Customers check an order with its number + the email used.
app.post("/api/orders/lookup", limit("lookup", 20, 15 * 60 * 1000), wrap(async (req, res) => {
  const number = str(req.body?.number, 20), email = str(req.body?.email, 160).toLowerCase();
  const { rows: [o] } = await q("select id,number,status,shipping_method,shipping_cents,subtotal_cents,total_cents,carrier,tracking,created_at,shipped_at from orders where number = $1 and lower(email) = $2", [number, email]);
  if (!o) return bad(res, "No order matches that number and email.", 404);
  const { rows: items } = await q("select name,strength,unit_cents,qty from order_items where order_id = $1 order by id", [o.id]);
  delete o.id;
  res.json({ order: o, items });
}));

/* ---------- customer accounts ---------- */
async function customerFrom(req) {
  const token = parseCookies(req.headers.cookie).cid;
  if (!token) return null;
  const { rows } = await q("select c.id, c.email, c.name, c.phone, c.address from customer_sessions s join customers c on c.id = s.customer_id where s.token = $1 and s.expires > now() and c.active", [token]);
  return rows[0] || null;
}
async function startCustomerSession(res, id) {
  const token = crypto.randomBytes(32).toString("hex");
  await q("insert into customer_sessions(token, customer_id, expires) values ($1, $2, now() + interval '60 days')", [token, id]);
  res.set("Set-Cookie", `cid=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${60 * 86400}${SECURE ? "; Secure" : ""}`);
}
const cleanAddress = (a = {}) => ({ line1: str(a.line1, 160), line2: str(a.line2, 160), city: str(a.city, 80), state: str(a.state, 40), zip: str(a.zip, 20), country: "US" });
const jsonOnly = (req, res, next) => (req.is("application/json") ? next() : bad(res, "Bad request"));

app.post("/api/account/register", jsonOnly, limit("register", 8, 60 * 60 * 1000), wrap(async (req, res) => {
  const b = req.body || {}, email = str(b.email, 160).toLowerCase(), pass = String(b.password || "");
  if (!str(b.name, 120) || !isEmail(email)) return bad(res, "Enter your name and a valid email.");
  if (String(b.phone || "").replace(/\D/g, "").length < 10) return bad(res, "Enter a phone number with area code.");
  const addr = cleanAddress(b.address);
  if (!addr.line1 || !addr.city || !addr.state || !addr.zip) return bad(res, "Enter your full shipping address.");
  if (pass.length < 8) return bad(res, "Use a password of at least 8 characters.");
  if (!b.confirmAge || !b.confirmResearch) return bad(res, "Please confirm both statements to create an account.");
  const { rows: [ex] } = await q("select id from customers where lower(email) = $1", [email]);
  if (ex) return bad(res, "An account with that email already exists. Sign in instead.");
  const { rows: [c] } = await q("insert into customers(email, name, phone, address, pass_hash) values ($1,$2,$3,$4,$5) returning id",
    [email, str(b.name, 120), str(b.phone, 40), JSON.stringify(addr), await bcrypt.hash(pass, 11)]);
  // attach earlier guest orders placed with this email
  await q("update orders set customer_id = $1 where customer_id is null and lower(email) = $2", [c.id, email]);
  await startCustomerSession(res, c.id);
  res.json({ ok: true });
}));
app.post("/api/account/login", jsonOnly, limit("clogin", 12, 15 * 60 * 1000), wrap(async (req, res) => {
  const email = str(req.body?.email, 160).toLowerCase();
  const { rows: [c] } = await q("select id, pass_hash from customers where lower(email) = $1 and active", [email]);
  if (!c || !(await bcrypt.compare(String(req.body?.password || ""), c.pass_hash))) return bad(res, "Email or password is wrong.", 401);
  await startCustomerSession(res, c.id);
  res.json({ ok: true });
}));
app.post("/api/account/logout", wrap(async (req, res) => {
  const token = parseCookies(req.headers.cookie).cid;
  if (token) await q("delete from customer_sessions where token = $1", [token]);
  res.set("Set-Cookie", `cid=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${SECURE ? "; Secure" : ""}`);
  res.json({ ok: true });
}));
app.get("/api/account", wrap(async (req, res) => {
  const c = await customerFrom(req);
  res.set("Cache-Control", "no-store");
  if (!c) return res.json({ customer: null });
  const { rows: orders } = await q(`select o.id, o.number, o.status, o.total_cents, o.carrier, o.tracking, o.created_at,
      (select json_agg(json_build_object('name', i.name, 'strength', i.strength, 'qty', i.qty) order by i.id) from order_items i where i.order_id = o.id) items
    from orders o where o.customer_id = $1 order by o.created_at desc limit 100`, [c.id]);
  orders.forEach((o) => delete o.id);
  res.json({ customer: c, orders });
}));
app.patch("/api/account", jsonOnly, wrap(async (req, res) => {
  const c = await customerFrom(req); if (!c) return bad(res, "Sign in first", 401);
  const b = req.body || {};
  await q("update customers set name = $1, phone = $2, address = $3 where id = $4",
    [str(b.name, 120) || c.name, str(b.phone, 40), JSON.stringify(cleanAddress(b.address)), c.id]);
  if (b.newPassword) {
    if (String(b.newPassword).length < 8) return bad(res, "Use a password of at least 8 characters.");
    const { rows: [x] } = await q("select pass_hash from customers where id = $1", [c.id]);
    if (!(await bcrypt.compare(String(b.currentPassword || ""), x.pass_hash))) return bad(res, "Current password is wrong.");
    await q("update customers set pass_hash = $1 where id = $2", [await bcrypt.hash(String(b.newPassword), 11), c.id]);
  }
  res.json({ ok: true });
}));

/* ---------- admin: sessions ---------- */
app.post("/api/admin/login", limit("login", 10, 15 * 60 * 1000), wrap(async (req, res) => {
  const email = str(req.body?.email, 160).toLowerCase(), pass = String(req.body?.password || "");
  const { rows: [u] } = await q("select * from users where lower(email) = $1 and active", [email]);
  if (!u || !(await bcrypt.compare(pass, u.pass_hash))) return bad(res, "Email or password is wrong.", 401);
  const token = crypto.randomBytes(32).toString("hex");
  await q("insert into sessions(token, user_id, expires) values ($1, $2, now() + interval '14 days')", [token, u.id]);
  res.set("Set-Cookie", `sid=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${14 * 86400}${SECURE ? "; Secure" : ""}`);
  res.json({ ok: true, user: { name: u.name, email: u.email, role: u.role } });
}));
app.post("/api/admin/logout", wrap(async (req, res) => {
  const token = parseCookies(req.headers.cookie).sid;
  if (token) await q("delete from sessions where token = $1", [token]);
  res.set("Set-Cookie", `sid=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0${SECURE ? "; Secure" : ""}`);
  res.json({ ok: true });
}));
app.get("/api/admin/me", wrap(auth), (req, res) => res.json({ user: req.user }));
app.post("/api/admin/password", wrap(auth), wrap(async (req, res) => {
  const { current, next } = req.body || {};
  if (String(next || "").length < 10) return bad(res, "Use at least 10 characters.");
  const { rows: [u] } = await q("select pass_hash from users where id = $1", [req.user.id]);
  if (!(await bcrypt.compare(String(current || ""), u.pass_hash))) return bad(res, "Current password is wrong.");
  await q("update users set pass_hash = $1 where id = $2", [await bcrypt.hash(String(next), 11), req.user.id]);
  await q("delete from sessions where user_id = $1 and token <> $2", [req.user.id, parseCookies(req.headers.cookie).sid]);
  res.json({ ok: true });
}));

const admin = express.Router();
admin.use(wrap(auth));

/* ---------- admin: dashboard ---------- */
admin.get("/stats", wrap(async (req, res) => {
  const { rows: byStatus } = await q("select status, count(*)::int n from orders group by status");
  const { rows: [m] } = await q("select coalesce(sum(total_cents),0)::int paid_cents, count(*)::int paid_n from orders where paid_at >= date_trunc('month', now())");
  const { rows: low } = await q("select id,name,strength,stock from products where active and stock is not null and stock <= 5 order by stock");
  const { rows: [np] } = await q("select count(*)::int n from products where active and price_cents is null");
  res.json({ byStatus: Object.fromEntries(byStatus.map((r) => [r.status, r.n])), month: m, lowStock: low, unpriced: np.n });
}));

/* ---------- admin: orders (owner + staff) ---------- */
admin.get("/orders", wrap(async (req, res) => {
  const status = str(req.query.status, 20), term = str(req.query.q, 80);
  const where = [], args = [];
  if (STATUSES.includes(status)) { args.push(status); where.push(`status = $${args.length}`); }
  if (term) { args.push("%" + term.toLowerCase() + "%"); where.push(`(lower(name) like $${args.length} or lower(email) like $${args.length} or number like $${args.length} or lower(tracking) like $${args.length})`); }
  const { rows } = await q(`select id,number,status,name,email,total_cents,shipping_method,tracking,created_at,
      (select coalesce(sum(qty),0)::int from order_items i where i.order_id = o.id) items
    from orders o ${where.length ? "where " + where.join(" and ") : ""} order by created_at desc limit 300`, args);
  res.json({ orders: rows });
}));
admin.get("/orders.csv", wrap(async (req, res) => {
  const { rows } = await q(`select o.number, o.created_at, o.status, o.name, o.email, o.phone, o.address, o.shipping_method, o.subtotal_cents, o.shipping_cents, o.total_cents, o.carrier, o.tracking,
     (select string_agg(i.qty || ' x ' || i.name || ' ' || i.strength, '; ') from order_items i where i.order_id = o.id) items from orders o order by o.created_at desc`);
  const cell = (v) => { const s = String(v ?? ""); return /[",\n]/.test(s) || /^[=+\-@]/.test(s) ? `"${s.replace(/^([=+\-@])/, "'$1").replace(/"/g, '""')}"` : s; };
  const head = ["Order", "Date", "Status", "Name", "Email", "Phone", "Address", "Shipping", "Subtotal", "Shipping cost", "Total", "Carrier", "Tracking", "Items"];
  const lines = rows.map((r) => [r.number, r.created_at.toISOString(), r.status, r.name, r.email, r.phone,
    [r.address.line1, r.address.line2, r.address.city, r.address.state, r.address.zip].filter(Boolean).join(", "),
    r.shipping_method, (r.subtotal_cents / 100).toFixed(2), (r.shipping_cents / 100).toFixed(2), (r.total_cents / 100).toFixed(2), r.carrier, r.tracking, r.items].map(cell).join(","));
  res.set("Content-Type", "text/csv");
  res.set("Content-Disposition", "attachment; filename=orders.csv");
  res.send([head.join(","), ...lines].join("\n"));
}));
admin.get("/orders/:id", wrap(async (req, res) => {
  const id = intOrNull(req.params.id);
  const { rows: [o] } = await q("select * from orders where id = $1", [id]);
  if (!o) return bad(res, "Not found", 404);
  const { rows: items } = await q("select * from order_items where order_id = $1 order by id", [id]);
  const { rows: events } = await q("select at, who, text from order_events where order_id = $1 order by at desc", [id]);
  res.json({ order: o, items, events });
}));
admin.patch("/orders/:id", wrap(async (req, res) => {
  const id = intOrNull(req.params.id), b = req.body || {};
  const { rows: [o] } = await q("select * from orders where id = $1", [id]);
  if (!o) return bad(res, "Not found", 404);
  const log = [];
  const sets = [], args = [];
  const set = (col, val) => { args.push(val); sets.push(`${col} = $${args.length}`); };
  if (b.status !== undefined && b.status !== o.status) {
    if (!STATUSES.includes(b.status)) return bad(res, "Unknown status");
    set("status", b.status); log.push(`Status ${o.status} → ${b.status}`);
    if (b.status === "paid" && !o.paid_at) sets.push("paid_at = now()");
    if (b.status === "shipped" && !o.shipped_at) sets.push("shipped_at = now()");
    // put stock back when an order is cancelled, take it again if un-cancelled
    if (b.status === "cancelled" || o.status === "cancelled") {
      const sign = b.status === "cancelled" ? "+" : "-";
      await q(`update products p set stock = p.stock ${sign} i.qty from order_items i where i.order_id = $1 and i.product_id = p.id and p.stock is not null`, [id]);
      log.push(b.status === "cancelled" ? "Stock returned" : "Stock taken again");
    }
  }
  for (const [k, col] of [["carrier", "carrier"], ["tracking", "tracking"], ["internalNote", "internal_note"]]) {
    if (b[k] !== undefined && str(b[k], 2000) !== o[col]) { set(col, str(b[k], 2000)); if (k !== "internalNote") log.push(`${k === "carrier" ? "Carrier" : "Tracking"} set to ${str(b[k], 200) || "(blank)"}`); else log.push("Internal note updated"); }
  }
  if (b.shippingCents !== undefined && req.user.role === "owner") {
    const sc = Math.max(0, intOrNull(b.shippingCents) ?? o.shipping_cents);
    if (sc !== o.shipping_cents) { set("shipping_cents", sc); set("total_cents", o.subtotal_cents - o.discount_cents + sc); log.push(`Shipping charge set to $${(sc / 100).toFixed(2)}`); }
  }
  if (b.discountCents !== undefined && req.user.role === "owner") {
    const dc = Math.max(0, Math.min(o.subtotal_cents, intOrNull(b.discountCents) ?? 0));
    const sc = b.shippingCents !== undefined ? Math.max(0, intOrNull(b.shippingCents) ?? o.shipping_cents) : o.shipping_cents;
    if (dc !== o.discount_cents) { set("discount_cents", dc); set("total_cents", o.subtotal_cents - dc + sc); log.push(`Discount set to $${(dc / 100).toFixed(2)}`); }
  }
  if (sets.length) {
    sets.push("updated_at = now()"); args.push(id);
    await q(`update orders set ${sets.join(", ")} where id = $${args.length}`, args);
    for (const t of log) await q("insert into order_events(order_id, who, text) values ($1,$2,$3)", [id, req.user.name || req.user.email, t]);
  }
  res.json({ ok: true });
}));
admin.post("/orders/:id/note", wrap(async (req, res) => {
  const t = str(req.body?.text, 1000); if (!t) return bad(res, "Write a note first");
  await q("insert into order_events(order_id, who, text) values ($1,$2,$3)", [intOrNull(req.params.id), req.user.name || req.user.email, t]);
  res.json({ ok: true });
}));

/* ---------- admin: customers ---------- */
admin.get("/customers", wrap(async (req, res) => {
  const term = str(req.query.q, 80).toLowerCase();
  const { rows } = await q(`select c.id, c.name, c.email, c.phone, c.active, c.created_at,
      count(o.id)::int orders, coalesce(sum(o.total_cents) filter (where o.status in ('paid','shipped','delivered')), 0)::int spent_cents, max(o.created_at) last_order
    from customers c left join orders o on o.customer_id = c.id
    where ($1 = '' or lower(c.name) like '%' || $1 || '%' or lower(c.email) like '%' || $1 || '%')
    group by c.id order by c.created_at desc limit 500`, [term]);
  res.json({ customers: rows });
}));
admin.patch("/customers/:id", owner, wrap(async (req, res) => {
  const id = intOrNull(req.params.id), active = req.body?.active !== false;
  await q("update customers set active = $1 where id = $2", [active, id]);
  if (!active) await q("delete from customer_sessions where customer_id = $1", [id]);
  res.json({ ok: true });
}));

/* ---------- admin: products ---------- */
admin.get("/products", wrap(async (req, res) => {
  const { rows } = await q("select * from products order by sort, name, strength");
  res.json({ products: rows });
}));
function productFields(b) {
  return {
    name: str(b.name, 120), strength: str(b.strength, 40), sku: str(b.sku, 60), category: str(b.category, 60) || "Research peptide",
    description: str(b.description, 2000), price_cents: centsOrNull(b.price), stock: intOrNull(b.stock), max_per_order: intOrNull(b.maxPerOrder),
    active: b.active !== false, sort: intOrNull(b.sort) ?? 0
  };
}
admin.post("/products", owner, wrap(async (req, res) => {
  const f = productFields(req.body || {}); if (!f.name) return bad(res, "Name is required");
  const cols = Object.keys(f);
  const { rows: [p] } = await q(`insert into products(${cols}) values (${cols.map((_, i) => "$" + (i + 1))}) returning id`, Object.values(f));
  res.json({ ok: true, id: p.id });
}));
admin.patch("/products/:id", owner, wrap(async (req, res) => {
  const f = productFields(req.body || {}); if (!f.name) return bad(res, "Name is required");
  const cols = Object.keys(f);
  await q(`update products set ${cols.map((c, i) => `${c} = $${i + 1}`)} where id = $${cols.length + 1}`, [...Object.values(f), intOrNull(req.params.id)]);
  res.json({ ok: true });
}));
admin.delete("/products/:id", owner, wrap(async (req, res) => {
  await q("delete from products where id = $1", [intOrNull(req.params.id)]);
  res.json({ ok: true });
}));

/* ---------- admin: lab reports ---------- */
admin.get("/reports", wrap(async (req, res) => {
  const { rows } = await q(`select ${REPORT_COLS} from reports order by product, tested desc nulls last`);
  res.json({ reports: rows.map(reportOut) });
}));
function reportFields(b) {
  const d = (v) => (/^\d{4}-\d{2}-\d{2}$/.test(String(v || "")) ? v : null);
  const results = Array.isArray(b.results) ? b.results.filter((r) => Array.isArray(r) && r[0]).slice(0, 20).map(([n, v]) => [str(n, 80), str(v, 80)]) : [];
  return {
    product: str(b.product, 120), strength: str(b.strength, 40), sample: str(b.sample, 120), task: str(b.task, 40), key: str(b.key, 60),
    verify_url: /^https:\/\//i.test(str(b.verifyUrl, 300)) ? str(b.verifyUrl, 300) : "", lab: str(b.lab, 80), client: str(b.client, 80),
    manufacturer: str(b.manufacturer, 80), batch: str(b.batch, 80), ordered: d(b.ordered), received: d(b.received), tested: d(b.tested),
    tests_requested: str(b.testsRequested, 200), results: JSON.stringify(results), active: b.active !== false
  };
}
function imageFrom(b) {
  const m = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/.exec(String(b.imageData || ""));
  if (!m) return null;
  const buf = Buffer.from(m[2], "base64");
  return buf.length && buf.length <= 6 * 1024 * 1024 ? { type: m[1], buf } : null;
}
admin.post("/reports", owner, wrap(async (req, res) => {
  const f = reportFields(req.body || {}); if (!f.product) return bad(res, "Peptide name is required");
  const img = imageFrom(req.body || {});
  const cols = Object.keys(f), vals = Object.values(f);
  if (img) { cols.push("image_type", "image"); vals.push(img.type, img.buf); }
  const { rows: [r] } = await q(`insert into reports(${cols}) values (${cols.map((_, i) => "$" + (i + 1))}) returning id`, vals);
  res.json({ ok: true, id: r.id });
}));
admin.patch("/reports/:id", owner, wrap(async (req, res) => {
  const f = reportFields(req.body || {}); if (!f.product) return bad(res, "Peptide name is required");
  const img = imageFrom(req.body || {});
  const cols = Object.keys(f), vals = Object.values(f);
  if (img) { cols.push("image_type", "image"); vals.push(img.type, img.buf); }
  vals.push(intOrNull(req.params.id));
  await q(`update reports set ${cols.map((c, i) => `${c} = $${i + 1}`)} where id = $${vals.length}`, vals);
  res.json({ ok: true });
}));
admin.delete("/reports/:id", owner, wrap(async (req, res) => {
  await q("delete from reports where id = $1", [intOrNull(req.params.id)]);
  res.json({ ok: true });
}));

/* ---------- admin: shipping ---------- */
admin.get("/shipping", wrap(async (req, res) => {
  const { rows } = await q("select * from shipping_methods order by sort, price_cents");
  res.json({ shipping: rows });
}));
const shipFields = (b) => ({ name: str(b.name, 80), detail: str(b.detail, 160), price_cents: centsOrNull(b.price) ?? 0, free_over_cents: centsOrNull(b.freeOver), active: b.active !== false, sort: intOrNull(b.sort) ?? 0 });
admin.post("/shipping", owner, wrap(async (req, res) => {
  const f = shipFields(req.body || {}); if (!f.name) return bad(res, "Name is required");
  const cols = Object.keys(f);
  await q(`insert into shipping_methods(${cols}) values (${cols.map((_, i) => "$" + (i + 1))})`, Object.values(f));
  res.json({ ok: true });
}));
admin.patch("/shipping/:id", owner, wrap(async (req, res) => {
  const f = shipFields(req.body || {}); if (!f.name) return bad(res, "Name is required");
  const cols = Object.keys(f);
  await q(`update shipping_methods set ${cols.map((c, i) => `${c} = $${i + 1}`)} where id = $${cols.length + 1}`, [...Object.values(f), intOrNull(req.params.id)]);
  res.json({ ok: true });
}));
admin.delete("/shipping/:id", owner, wrap(async (req, res) => {
  await q("delete from shipping_methods where id = $1", [intOrNull(req.params.id)]);
  res.json({ ok: true });
}));

/* ---------- admin: settings ---------- */
admin.get("/settings", wrap(async (req, res) => res.json({ settings: await getSettings() })));
admin.put("/settings", owner, wrap(async (req, res) => {
  const b = req.body || {};
  for (const k of Object.keys(DEFAULT_SETTINGS)) {
    if (b[k] === undefined) continue;
    let v = b[k];
    if (typeof DEFAULT_SETTINGS[k] === "boolean") v = !!v;
    else if (typeof DEFAULT_SETTINGS[k] === "number") v = Math.max(0, intOrNull(v) ?? DEFAULT_SETTINGS[k]);
    else if (Array.isArray(DEFAULT_SETTINGS[k])) v = (Array.isArray(v) ? v : []).map((x) => str(x, 1000)).filter(Boolean).slice(0, 30);
    else v = str(v, 3000);
    if (k === "brandUrl" && v && !/^https:\/\//i.test(v)) v = "";
    await q("insert into settings(key, value) values ($1,$2) on conflict (key) do update set value = excluded.value", [k, JSON.stringify(v)]);
  }
  res.json({ ok: true });
}));

/* ---------- admin: users (owner only) ---------- */
admin.get("/users", owner, wrap(async (req, res) => {
  const { rows } = await q("select id,email,name,role,active,created_at from users order by role, name");
  res.json({ users: rows });
}));
admin.post("/users", owner, wrap(async (req, res) => {
  const b = req.body || {}, email = str(b.email, 160).toLowerCase(), pass = String(b.password || "");
  if (!isEmail(email)) return bad(res, "Enter a valid email");
  if (pass.length < 10) return bad(res, "Password needs at least 10 characters");
  const role = b.role === "owner" ? "owner" : "staff";
  try {
    await q("insert into users(email,name,role,pass_hash) values ($1,$2,$3,$4)", [email, str(b.name, 80), role, await bcrypt.hash(pass, 11)]);
  } catch (e) { return bad(res, "That email already has a login"); }
  res.json({ ok: true });
}));
admin.patch("/users/:id", owner, wrap(async (req, res) => {
  const id = intOrNull(req.params.id), b = req.body || {};
  if (id === req.user.id && (b.active === false || b.role === "staff")) return bad(res, "You can't remove your own owner access");
  if (b.active !== undefined) { await q("update users set active = $1 where id = $2", [!!b.active, id]); if (!b.active) await q("delete from sessions where user_id = $1", [id]); }
  if (b.role) await q("update users set role = $1 where id = $2", [b.role === "owner" ? "owner" : "staff", id]);
  if (b.name !== undefined) await q("update users set name = $1 where id = $2", [str(b.name, 80), id]);
  if (b.password) {
    if (String(b.password).length < 10) return bad(res, "Password needs at least 10 characters");
    await q("update users set pass_hash = $1 where id = $2", [await bcrypt.hash(String(b.password), 11), id]);
    await q("delete from sessions where user_id = $1", [id]);
  }
  res.json({ ok: true });
}));

app.use("/api/admin", admin);

/* ---------- pages ---------- */
app.use(express.static(path.join(__dirname, "public"), {
  extensions: ["html"], maxAge: "5m",
  // pages and the service worker must never be cached, or visitors keep seeing an old version
  setHeaders: (res, file) => { if (/\.(html|webmanifest)$|[\\/]sw\.js$/.test(file)) res.set("Cache-Control", "no-cache"); }
}));
app.get("/admin", (req, res) => res.set("Cache-Control", "no-cache").sendFile(path.join(__dirname, "public", "admin.html")));
app.use("/api", (req, res) => bad(res, "Not found", 404));
app.use((err, req, res, next) => { console.error(err); bad(res, "Something went wrong on our end.", 500); });

/* ---------- start ---------- */
(async () => {
  await init();
  // First owner login comes from OWNER_EMAIL / OWNER_PASSWORD set on the host. Only used while no owner exists.
  const { rows: [{ n }] } = await q("select count(*)::int n from users where role = 'owner'");
  if (n === 0 && process.env.OWNER_EMAIL && process.env.OWNER_PASSWORD) {
    await q("insert into users(email,name,role,pass_hash) values ($1,'Owner','owner',$2) on conflict (email) do update set role='owner', active=true",
      [process.env.OWNER_EMAIL.trim().toLowerCase(), await bcrypt.hash(process.env.OWNER_PASSWORD, 11)]);
    console.log("Owner login created for", process.env.OWNER_EMAIL);
  } else if (n === 0) console.log("No owner yet: set OWNER_EMAIL and OWNER_PASSWORD and restart.");
  const port = process.env.PORT || 3000;
  app.listen(port, () => console.log("Store running on port " + port));
})().catch((e) => { console.error(e); process.exit(1); });
