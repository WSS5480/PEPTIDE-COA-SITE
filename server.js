// Storefront + admin server. Static pages in /public, JSON API under /api.
const path = require("path");
const crypto = require("crypto");
const express = require("express");
const bcrypt = require("bcryptjs");
const { q, pool, init, getSettings, DEFAULT_SETTINGS } = require("./server/db");

const app = express();
app.set("trust proxy", 1);
app.disable("x-powered-by");
app.use(express.json({ limit: "16mb" }));
app.use((req, res, next) => {
  res.set("X-Content-Type-Options", "nosniff");
  res.set("Referrer-Policy", "same-origin");
  res.set("X-Frame-Options", "DENY");
  // keep every page, image and file out of search engines
  res.set("X-Robots-Tag", "noindex, nofollow, noarchive, nosnippet, noimageindex");
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
  const keys = ["brand", "tagline", "distributorOf", "brandUrl", "contact", "announcement", "announcementOn", "bannerScroll", "productLabel", "perksOn", "perks", "vial", "vialLogoV", "siteLogoV", "vialPhotoV", "heroEyebrow", "headline", "storeOpen", "minAge", "ageGate", "minOrderCents", "priceNote", "intro", "disclaimers", "paymentInstructions", "footerNotice", "policyTerms", "policyReturns", "policyShipping", "policyPrivacy"];
  return Object.fromEntries(keys.map((k) => [k, s[k]]));
}
const reportOut = (r) => ({
  id: r.id, product: r.product, strength: r.strength, sample: r.sample, task: r.task, key: r.key, verifyUrl: r.verify_url,
  lab: r.lab, client: r.client, manufacturer: r.manufacturer, batch: r.batch,
  ordered: r.ordered ? r.ordered.toISOString().slice(0, 10) : "", received: r.received ? r.received.toISOString().slice(0, 10) : "",
  tested: r.tested ? r.tested.toISOString().slice(0, 10) : "", testsRequested: r.tests_requested, results: r.results,
  image: r.has_image ? `/coa/${r.id}` : "", isPdf: r.image_type === "application/pdf", active: r.active
});
const REPORT_COLS = "id,product,strength,sample,task,key,verify_url,lab,client,manufacturer,batch,ordered,received,tested,tests_requested,results,active,image_type,(image is not null) has_image";

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

/* ---------- site PIN ---------- */
// When the owner turns the PIN on, nothing on the store (pages, products, lab reports, orders)
// is served until the visitor enters it. The admin, its login and the files it needs stay open.
const PIN_OPEN = [/^\/admin(\.html|\.js|\.webmanifest)?$/, /^\/api\/admin\//, /^\/rep(\.html|\.js|\.webmanifest)?$/, /^\/api\/rep\//, /^\/rep-(icon-\d+|apple-touch-icon)\.png$/, /^\/pin(\.html)?$/, /^\/api\/pin$/,
  /^\/store\.css$/, /^\/install\.js$/, /^\/refresh\.js$/, /^\/sw\.js$/, /^\/manifest\.webmanifest$/, /^\/vial\.js$/, /^\/vial-logo$/, /^\/site-logo$/, /^\/vial-photo$/, /^\/vial-photo\.jpg$/, /^\/brand-(logo|mark|vial-logo)\.png$/, /^\/robots\.txt$/, /^\/(admin-)?(icon-\d+|apple-touch-icon)\.png$/, /^\/favicon\.ico$/];
let pinCache = { at: 0, on: false, hash: "", secret: "", customerPins: 0 };
async function pinState() {
  if (Date.now() - pinCache.at < 5000) return pinCache;
  const { rows } = await q("select key, value from settings where key in ('pinOn','pinHash','pinSecret')");
  const m = Object.fromEntries(rows.map((r) => [r.key, r.value]));
  let secret = m.pinSecret;
  if (!secret) { secret = crypto.randomBytes(32).toString("hex"); await q("insert into settings(key,value) values ('pinSecret',$1) on conflict (key) do nothing", [JSON.stringify(secret)]); }
  const { rows: [c] } = await q("select count(*)::int n from customers where access_pin_key is not null and active");
  // once the owner turns the lock on it stays on, even if every PIN is later revoked (then nobody gets in)
  pinCache = { at: Date.now(), on: !!m.pinOn, hash: m.pinHash || "", secret, customerPins: c.n };
  return pinCache;
}
const hmac = (secret, text) => crypto.createHmac("sha256", secret).update(text).digest("hex");
// shared-PIN pass: tied to the current shared PIN, so changing it signs everyone out
const pinToken = (st) => hmac(st.secret, st.hash);
// a customer's personal pass: tied to that customer and their PIN version, so changing or revoking it ends their access
const customerPinKey = (st, pin) => hmac(st.secret, "pin:" + pin);
const customerPass = (st, id, ver) => `c${id}.${ver}.${hmac(st.secret, `c:${id}:${ver}`)}`;
const sameStr = (a, b) => a.length === b.length && crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
async function passOk(st, t) {
  if (!t) return false;
  if (st.hash && sameStr(t, pinToken(st))) return true;
  const m = /^c(\d+)\.(\d+)\.[0-9a-f]{64}$/.exec(t);
  if (!m || !sameStr(t, customerPass(st, m[1], m[2]))) return false;
  const { rows: [c] } = await q("select 1 from customers where id = $1 and active and access_pin_key is not null and pin_version = $2", [+m[1], +m[2]]);
  return !!c;
}
app.use(wrap(async (req, res, next) => {
  if (PIN_OPEN.some((r) => r.test(req.path))) return next();
  const st = await pinState();
  if (!st.on) return next();
  if (await passOk(st, parseCookies(req.headers.cookie).spin)) return next();
  // signed-in admins can always see the store
  const sid = parseCookies(req.headers.cookie).sid;
  if (sid && (await q("select 1 from sessions s join users u on u.id = s.user_id where s.token = $1 and s.expires > now() and u.active", [sid])).rows.length) return next();
  if (/^\/(api|coa|doc|pimg|plogo)\//.test(req.path)) return bad(res, "PIN required", 401);
  res.set("Cache-Control", "no-store");
  res.sendFile(path.join(__dirname, "public", "pin.html"));
}));
app.post("/api/pin", limit("pin", 10, 15 * 60 * 1000), wrap(async (req, res) => {
  const st = await pinState();
  if (!st.on) return res.json({ ok: true });
  const pin = String(req.body?.pin || "").replace(/\D/g, "").slice(0, 12);
  if (!pin) return bad(res, "Wrong PIN.", 401);
  const passCookie = (v) => `spin=${v}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${30 * 86400}${SECURE ? "; Secure" : ""}`;
  if (st.hash && (await bcrypt.compare(pin, st.hash))) { res.append("Set-Cookie", passCookie(pinToken(st))); return res.json({ ok: true }); }
  // a customer's own PIN unlocks the site and signs them into their account
  const { rows: [c] } = await q("select id, pin_version from customers where access_pin_key = $1 and active", [customerPinKey(st, pin)]);
  if (!c) return bad(res, "Wrong PIN.", 401);
  await q("update customers set pin_used_at = now() where id = $1", [c.id]);
  res.append("Set-Cookie", passCookie(customerPass(st, c.id, c.pin_version)));
  await startCustomerSession(res, c.id);
  res.json({ ok: true });
}));

/* ---------- inventory: every stock change is logged ---------- */
// change: + adds, - removes. setTo: set the count exactly (for counts). Starts tracking an untracked product.
async function moveStock(db, productId, change, info = {}) {
  const sql = info.setTo !== undefined
    ? ["update products set stock = $1 where id = $2 returning stock, (select coalesce(stock, 0) from products where id = $2) before", [info.setTo, productId]]
    : ["update products set stock = coalesce(stock, 0) + $1 where id = $2 returning stock, stock - $1 before", [change, productId]];
  const { rows: [r] } = await db.query(sql[0], sql[1]);
  if (!r) return null;
  const delta = info.setTo !== undefined ? info.setTo - r.before : change;
  if (delta === 0 && info.setTo === undefined) return r.stock;
  await db.query(`insert into stock_moves(product_id, change, balance, reason, ref, lot, expires, cost_cents, supplier, note, who)
    values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
    [productId, delta, r.stock, info.reason || "Adjustment", info.ref || "", info.lot || "", info.expires || null, info.costCents ?? null, info.supplier || "", info.note || "", info.who || ""]);
  return r.stock;
}

/* ---------- build info: version from package.json, "last updated" = when these files were deployed ---------- */
const BUILD = (() => {
  const fs = require("fs");
  let version = "0.0.0"; try { version = require("./package.json").version; } catch (e) { /* keep */ }
  const files = ["server.js", "server/db.js", ...fs.readdirSync(path.join(__dirname, "public")).map((f) => "public/" + f)];
  let updated = 0; for (const f of files) { try { updated = Math.max(updated, fs.statSync(path.join(__dirname, f)).mtimeMs); } catch (e) { /* skip */ } }
  return { version, updated: new Date(updated).toISOString(), commit: String(process.env.RENDER_GIT_COMMIT || "").slice(0, 7) };
})();
app.get("/api/build", (req, res) => { res.set("Cache-Control", "no-store"); res.json(BUILD); });

/* ---------- public API ---------- */
// changes whenever anything in the store changes; pages poll it and reload their data when it moves
app.get("/api/version", wrap(async (req, res) => {
  const { rows: [r] } = await q("select version from app_state where id = 1");
  res.set("Cache-Control", "no-store");
  res.json({ v: r ? Number(r.version) : 0 });
}));
app.get("/api/store", wrap(async (req, res) => {
  const s = await getSettings();
  const [{ rows: products }, { rows: reports }, { rows: shipping }] = await Promise.all([
    q("select id,name,strength,sku,show_code,manufacturer,category,description,price_cents,stock,max_per_order,vial_label,media_v,(image is not null) has_image,(logo is not null) has_logo from products where active order by sort, name, strength, manufacturer, id"),
    q(`select ${REPORT_COLS} from reports where active order by product, tested desc nulls last`),
    q("select id,name,detail,price_cents,free_over_cents from shipping_methods where active order by sort, price_cents")
  ]);
  const { rows: documents } = await q("select d.id, d.product_id, d.title, d.kind, d.file_type, d.size from documents d join products p on p.id = d.product_id where d.public and p.active order by d.sort, d.created_at");
  res.set("Cache-Control", "no-store");
  res.json({ settings: publicSettings(s), products, reports: reports.map(reportOut), shipping, documents });
}));

app.get("/coa/:id", wrap(async (req, res) => {
  const { rows } = await q("select image, image_type from reports where id = $1 and image is not null", [intOrNull(req.params.id)]);
  if (!rows[0]) return res.status(404).send("Not found");
  res.set("Content-Type", rows[0].image_type || "image/jpeg");
  res.set("Content-Disposition", "inline");
  res.set("Cache-Control", "private, max-age=600");
  res.send(rows[0].image);
}));
const sendMedia = (res, buf, type) => { res.set("Content-Type", type); res.set("Cache-Control", "public, max-age=86400"); res.set("Content-Disposition", "inline"); res.send(buf); };
app.get("/pimg/:id", wrap(async (req, res) => {
  const { rows: [m] } = await q("select image, image_type from products where id = $1 and image is not null", [intOrNull(req.params.id)]);
  m ? sendMedia(res, m.image, m.image_type) : res.status(404).send("Not found");
}));
app.get("/plogo/:id", wrap(async (req, res) => {
  const { rows: [m] } = await q("select logo, logo_type from products where id = $1 and logo is not null", [intOrNull(req.params.id)]);
  m ? sendMedia(res, m.logo, m.logo_type) : res.status(404).send("Not found");
}));
// logos: an uploaded one from Page setup, otherwise the bundled brand files
async function sendLogo(res, key, fallback) {
  const { rows: [m] } = await q("select value from settings where key = $1", [key]);
  if (m && m.value && m.value.data) return sendMedia(res, Buffer.from(m.value.data, "base64"), m.value.type);
  res.set("Cache-Control", "public, max-age=86400");
  res.sendFile(path.join(__dirname, "public", fallback));
}
app.get("/vial-logo", wrap((req, res) => sendLogo(res, "vialLogo", "brand-vial-logo.png")));
app.get("/site-logo", wrap((req, res) => sendLogo(res, "siteLogo", "brand-logo.png")));
app.get("/vial-photo", wrap((req, res) => sendLogo(res, "vialPhoto", "vial-photo.jpg")));
// a product document (SDS, spec sheet, certificate…); hidden ones open only for signed-in admins
app.get("/doc/:id", wrap(async (req, res) => {
  const { rows: [d] } = await q("select d.file, d.file_type, d.file_name, d.public, p.active from documents d left join products p on p.id = d.product_id where d.id = $1", [intOrNull(req.params.id)]);
  if (!d) return res.status(404).send("Not found");
  if (!d.public || !d.active) {
    const token = parseCookies(req.headers.cookie).sid;
    const { rows: [u] } = token ? await q("select 1 from sessions s join users u on u.id = s.user_id where s.token = $1 and s.expires > now() and u.active", [token]) : { rows: [] };
    if (!u) return res.status(404).send("Not found");
  }
  res.set("Content-Type", d.file_type);
  res.set("Content-Disposition", `inline; filename="${String(d.file_name || "document").replace(/[^\w.\- ]/g, "_")}"`);
  res.set("Cache-Control", "private, max-age=600");
  res.send(d.file);
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
  // the order belongs to the signed-in customer, or to a customer with the same email; their sales rep gets the commission
  let cust = await customerFrom(req);
  if (!cust) cust = (await q("select id, rep_id from customers where lower(email) = $1 and active", [email])).rows[0] || null;
  else cust.rep_id = (await q("select rep_id from customers where id = $1", [cust.id])).rows[0]?.rep_id ?? null;
  try {
    const r = await createOrder({ name, email, phone, address, items, shippingMethodId: b.shippingMethodId, note: b.note, customerId: cust ? cust.id : null, repId: cust ? cust.rep_id : null,
      placedBy: "Customer", event: "Order placed; customer confirmed research use and age", settings: s });
    res.json({ ok: true, ...r, paymentInstructions: s.paymentInstructions });
  } catch (e) { bad(res, e.message || "Could not place the order."); }
}));

// Creates an order in one transaction: checks price, limits and stock, takes the stock, records the rep and their rate.
async function createOrder({ name, email, phone, address, items, shippingMethodId, note, customerId, repId, placedBy, event, settings }) {
  const client = await pool.connect();
  try {
    await client.query("begin");
    let subtotal = 0; const lines = [];
    for (const it of items) {
      const qty = Math.max(1, Math.min(999, intOrNull(it.qty) || 1));
      const { rows: [p] } = await client.query("select id, name, strength, manufacturer, price_cents, stock, max_per_order from products where id = $1 and active for update", [intOrNull(it.id)]);
      if (!p) throw new Error("An item in the order is no longer available. Remove it and try again.");
      if (p.price_cents === null) throw new Error(`${p.name} ${p.strength} has no price yet. Remove it or set a price first.`);
      if (p.max_per_order && qty > p.max_per_order) throw new Error(`${p.name} ${p.strength} is limited to ${p.max_per_order} per order.`);
      if (p.stock !== null && qty > p.stock) throw new Error(p.stock > 0 ? `Only ${p.stock} of ${p.name} ${p.strength} left.` : `${p.name} ${p.strength} is sold out.`);
      subtotal += p.price_cents * qty;
      lines.push({ p, qty });
    }
    if (settings.minOrderCents && subtotal < settings.minOrderCents) throw new Error(`The minimum order is $${(settings.minOrderCents / 100).toFixed(2)}.`);
    let shipName = "", shipCents = 0;
    const { rows: methods } = await client.query("select * from shipping_methods where active");
    if (methods.length) {
      const m = methods.find((x) => x.id === intOrNull(shippingMethodId));
      if (!m) throw new Error("Choose a shipping option.");
      shipName = m.name; shipCents = m.free_over_cents !== null && subtotal >= m.free_over_cents ? 0 : m.price_cents;
    }
    let rate = null;
    if (repId) rate = (await client.query("select commission_rate from users where id = $1 and role = 'rep'", [repId])).rows[0]?.commission_rate ?? null;
    if (rate === null) repId = null;
    const number = String(Date.now()).slice(-6) + crypto.randomInt(10, 99);
    const { rows: [o] } = await client.query(
      `insert into orders(number,name,email,phone,address,shipping_method,shipping_cents,subtotal_cents,total_cents,customer_note,customer_id,rep_id,commission_rate,placed_by)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) returning id`,
      [number, name, email, phone, JSON.stringify(address), shipName, shipCents, subtotal, subtotal + shipCents, str(note, 1000), customerId, repId, rate, placedBy]);
    for (const { p, qty } of lines) {
      // the maker goes into the line name so orders show which one was bought
      await client.query("insert into order_items(order_id,product_id,name,strength,unit_cents,qty) values ($1,$2,$3,$4,$5,$6)", [o.id, p.id, p.manufacturer ? `${p.name} (${p.manufacturer})` : p.name, p.strength, p.price_cents, qty]);
      if (p.stock !== null) await moveStock(client, p.id, -qty, { reason: "Order", ref: number, who: placedBy === "Customer" ? name : placedBy });
    }
    await client.query("insert into order_events(order_id, who, text) values ($1, $2, $3)", [o.id, placedBy, event]);
    await client.query("commit");
    return { number, subtotalCents: subtotal, shippingCents: shipCents, totalCents: subtotal + shipCents };
  } catch (e) { await client.query("rollback").catch(() => {}); throw e; }
  finally { client.release(); }
}

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
  res.append("Set-Cookie", `cid=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${60 * 86400}${SECURE ? "; Secure" : ""}`);
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

/* ---------- commissions ---------- */
// commission = order subtotal after discount (not shipping) x the rep's rate when the order was placed.
// pending: not paid by the customer yet · earned: paid/shipped/delivered, not paid out · paid: in a payout · void: cancelled
const COMM_SQL = `select o.id, o.number, o.created_at, o.status, o.name customer, o.subtotal_cents, o.discount_cents, o.commission_rate, o.payout_id, o.rep_id,
    u.name rep_name, u.email rep_email, p.paid_at payout_date,
    round((o.subtotal_cents - o.discount_cents) * coalesce(o.commission_rate, 0) / 100.0)::int commission_cents,
    case when o.status = 'cancelled' then 'void' when o.payout_id is not null then 'paid' when o.status in ('paid','shipped','delivered') then 'earned' else 'pending' end comm_status
  from orders o join users u on u.id = o.rep_id left join commission_payouts p on p.id = o.payout_id`;
async function commissionRows({ repId, from, to, status }) {
  const where = [], args = [];
  if (repId) { args.push(repId); where.push(`o.rep_id = $${args.length}`); }
  if (/^\d{4}-\d{2}-\d{2}$/.test(from || "")) { args.push(from); where.push(`o.created_at >= $${args.length}::date`); }
  if (/^\d{4}-\d{2}-\d{2}$/.test(to || "")) { args.push(to); where.push(`o.created_at < $${args.length}::date + 1`); }
  const { rows } = await q(`${COMM_SQL} ${where.length ? "where " + where.join(" and ") : ""} order by o.created_at desc limit 2000`, args);
  return ["pending", "earned", "paid", "void"].includes(status) ? rows.filter((r) => r.comm_status === status) : rows;
}
const commTotals = (rows) => rows.reduce((t, r) => { t[r.comm_status] = (t[r.comm_status] || 0) + r.commission_cents; t.sales += r.comm_status === "void" ? 0 : r.subtotal_cents - r.discount_cents; return t; }, { sales: 0, pending: 0, earned: 0, paid: 0, void: 0 });

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
admin.use((req, res, next) => (req.user.role === "rep" ? bad(res, "Sales reps use the rep app at /rep", 403) : next()));

/* ---------- admin: dashboard ---------- */
admin.get("/stats", wrap(async (req, res) => {
  const { rows: byStatus } = await q("select status, count(*)::int n from orders group by status");
  const { rows: [m] } = await q("select coalesce(sum(total_cents),0)::int paid_cents, count(*)::int paid_n from orders where paid_at >= date_trunc('month', now())");
  const { rows: low } = await q("select id,name,strength,manufacturer,stock,coalesce(reorder_point,5) reorder_at from products where active and stock is not null and stock <= coalesce(reorder_point,5) order by stock");
  const { rows: [np] } = await q("select count(*)::int n from products where active and price_cents is null");
  res.json({ byStatus: Object.fromEntries(byStatus.map((r) => [r.status, r.n])), month: m, lowStock: low, unpriced: np.n });
}));

/* ---------- admin: orders (owner + staff) ---------- */
admin.get("/orders", wrap(async (req, res) => {
  const status = str(req.query.status, 20), term = str(req.query.q, 80);
  const where = [], args = [];
  if (STATUSES.includes(status)) { args.push(status); where.push(`status = $${args.length}`); }
  if (term) { args.push("%" + term.toLowerCase() + "%"); where.push(`(lower(name) like $${args.length} or lower(email) like $${args.length} or number like $${args.length} or lower(tracking) like $${args.length})`); }
  const { rows } = await q(`select id,number,status,name,email,total_cents,shipping_method,tracking,created_at,placed_by,(select name from users where id = o.rep_id) rep_name,
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
  o.rep_name = o.rep_id ? (await q("select name from users where id = $1", [o.rep_id])).rows[0]?.name || "" : "";
  const { rows: reps } = await q("select id, name, commission_rate from users where role = 'rep' and active order by name");
  res.json({ order: o, items, events, reps });
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
      const { rows: its } = await q("select i.product_id, i.qty from order_items i join products p on p.id = i.product_id where i.order_id = $1 and p.stock is not null", [id]);
      for (const it of its) await moveStock(pool, it.product_id, sign === "+" ? it.qty : -it.qty, { reason: sign === "+" ? "Order cancelled" : "Order reinstated", ref: o.number, who: req.user.name || req.user.email });
      log.push(b.status === "cancelled" ? "Stock returned" : "Stock taken again");
    }
  }
  for (const [k, col] of [["carrier", "carrier"], ["tracking", "tracking"], ["internalNote", "internal_note"]]) {
    if (b[k] !== undefined && str(b[k], 2000) !== o[col]) { set(col, str(b[k], 2000)); if (k !== "internalNote") log.push(`${k === "carrier" ? "Carrier" : "Tracking"} set to ${str(b[k], 200) || "(blank)"}`); else log.push("Internal note updated"); }
  }
  if (b.repId !== undefined && req.user.role === "owner" && (intOrNull(b.repId) || null) !== o.rep_id) {
    const rid = intOrNull(b.repId) || null;
    const rate = rid ? (await q("select commission_rate from users where id = $1 and role = 'rep'", [rid])).rows[0]?.commission_rate : null;
    if (rid && rate === undefined) return bad(res, "Rep not found");
    if (o.payout_id) return bad(res, "This commission is already paid out. Undo the payout first.");
    set("rep_id", rid); set("commission_rate", rid ? rate : null); log.push(rid ? "Sales rep changed" : "Sales rep removed");
  }
  if (b.commissionRate !== undefined && req.user.role === "owner" && o.rep_id && !o.payout_id) {
    const r = rateOf(b.commissionRate); if (r !== null && Number(r) !== Number(o.commission_rate)) { set("commission_rate", r); log.push(`Commission rate set to ${r}%`); }
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
  const { rows } = await q(`select c.id, c.name, c.email, c.phone, c.active, c.created_at, (c.access_pin_key is not null) has_pin, c.pin_set_at, c.pin_used_at, c.rep_id, (select name from users where id = c.rep_id) rep_name,
      count(o.id)::int orders, coalesce(sum(o.total_cents) filter (where o.status in ('paid','shipped','delivered')), 0)::int spent_cents, max(o.created_at) last_order
    from customers c left join orders o on o.customer_id = c.id
    where ($1 = '' or lower(c.name) like '%' || $1 || '%' or lower(c.email) like '%' || $1 || '%')
    group by c.id order by c.created_at desc limit 500`, [term]);
  res.json({ customers: rows });
}));
admin.post("/customers", owner, wrap(async (req, res) => {
  const b = req.body || {}, email = str(b.email, 160).toLowerCase();
  if (!str(b.name, 120) || !isEmail(email)) return bad(res, "Enter a name and a valid email.");
  const { rows: [ex] } = await q("select id from customers where lower(email) = $1", [email]);
  if (ex) return bad(res, "A customer with that email already exists.");
  // they sign in with the PIN you give them; this random password is never shown to anyone
  const repId = intOrNull(b.repId) && (await q("select 1 from users where id = $1 and role = 'rep'", [intOrNull(b.repId)])).rows.length ? intOrNull(b.repId) : null;
  const { rows: [c] } = await q("insert into customers(email, name, phone, address, pass_hash, rep_id) values ($1,$2,$3,$4,$5,$6) returning id",
    [email, str(b.name, 120), str(b.phone, 40), JSON.stringify(cleanAddress(b.address)), await bcrypt.hash(crypto.randomBytes(24).toString("hex"), 10), repId]);
  await q("update orders set customer_id = $1 where customer_id is null and lower(email) = $2", [c.id, email]);
  res.json({ ok: true, id: c.id });
}));
admin.post("/customers/:id/pin", owner, wrap(async (req, res) => {
  const id = intOrNull(req.params.id), st = await pinState();
  let pin = String(req.body?.pin || "").trim();
  const taken = async (p) => (await q("select 1 from customers where access_pin_key = $1 and id <> $2", [customerPinKey(st, p), id])).rows.length > 0 || (st.hash && (await bcrypt.compare(p, st.hash)));
  if (pin) {
    if (!/^\d{6,8}$/.test(pin)) return bad(res, "Customer PINs must be 6 to 8 digits.");
    if (await taken(pin)) return bad(res, "That PIN is already in use. Pick another.");
  } else {
    do { pin = String(crypto.randomInt(100000, 1000000)); } while (await taken(pin));
  }
  const { rowCount } = await q("update customers set access_pin_key = $1, pin_version = pin_version + 1, pin_set_at = now() where id = $2", [customerPinKey(st, pin), id]);
  if (!rowCount) return bad(res, "Customer not found", 404);
  await q("delete from customer_sessions where customer_id = $1", [id]);
  pinCache.at = 0;
  res.json({ ok: true, pin }); // shown once to the owner so it can be given to the customer
}));
admin.delete("/customers/:id/pin", owner, wrap(async (req, res) => {
  const id = intOrNull(req.params.id);
  await q("update customers set access_pin_key = null, pin_version = pin_version + 1, pin_set_at = null where id = $1", [id]);
  await q("delete from customer_sessions where customer_id = $1", [id]);
  pinCache.at = 0;
  res.json({ ok: true });
}));
admin.patch("/customers/:id", owner, wrap(async (req, res) => {
  const id = intOrNull(req.params.id);
  if (req.body?.edit) {
    const b = req.body, email = str(b.email, 160).toLowerCase();
    if (!str(b.name, 120) || !isEmail(email)) return bad(res, "Enter a name and a valid email.");
    const { rows: [dup] } = await q("select 1 from customers where lower(email) = $1 and id <> $2", [email, id]);
    if (dup) return bad(res, "Another customer already uses that email.");
    await q("update customers set name = $1, email = $2, phone = $3, address = $4 where id = $5", [str(b.name, 120), email, str(b.phone, 40), JSON.stringify(cleanAddress(b.address)), id]);
    return res.json({ ok: true });
  }
  if (req.body?.repId !== undefined) {
    const rid = intOrNull(req.body.repId);
    if (rid && !(await q("select 1 from users where id = $1 and role = 'rep'", [rid])).rows.length) return bad(res, "Rep not found");
    await q("update customers set rep_id = $1 where id = $2", [rid, id]);
    return res.json({ ok: true });
  }
  const active = req.body?.active !== false;
  await q("update customers set active = $1 where id = $2", [active, id]);
  if (!active) await q("delete from customer_sessions where customer_id = $1", [id]);
  pinCache.at = 0;
  res.json({ ok: true });
}));

/* ---------- admin: products ---------- */
admin.get("/products", wrap(async (req, res) => {
  const { rows } = await q(`select p.id, p.name, p.strength, p.sku, p.show_code, p.manufacturer, p.category, p.description, p.price_cents, p.stock, p.max_per_order,
      p.active, p.sort, p.created_at, p.reorder_point, p.cost_cents, p.vial_label, p.media_v, (p.image is not null) has_image, (p.logo is not null) has_logo,
      (select count(*)::int from documents d where d.product_id = p.id) doc_count from products p order by sort, name, strength, manufacturer, id`);
  res.json({ products: rows });
}));
function productFields(b) {
  return {
    name: str(b.name, 120), strength: str(b.strength, 40), sku: str(b.sku, 60).toUpperCase(), manufacturer: str(b.manufacturer, 80), category: str(b.category, 60) || "Research peptide",
    description: str(b.description, 2000), price_cents: centsOrNull(b.price), stock: intOrNull(b.stock), max_per_order: intOrNull(b.maxPerOrder),
    active: b.active !== false, sort: intOrNull(b.sort) ?? 0, show_code: b.showCode === true
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
  const pid = intOrNull(req.params.id);
  const { rows: [before] } = await q("select stock from products where id = $1", [pid]);
  if (before && f.stock !== null && f.stock !== before.stock) {
    await moveStock(pool, pid, 0, { setTo: f.stock, reason: "Edited in Products", who: req.user.name || req.user.email });
  }
  const cols = Object.keys(f);
  await q(`update products set ${cols.map((c, i) => `${c} = $${i + 1}`)} where id = $${cols.length + 1}`, [...Object.values(f), intOrNull(req.params.id)]);
  res.json({ ok: true });
}));
// Bulk import from a spreadsheet. Matches existing products by name + size; blank cells keep current values.
admin.post("/products/import", owner, wrap(async (req, res) => {
  const rows = Array.isArray(req.body?.rows) ? req.body.rows.slice(0, 1000) : [];
  if (!rows.length) return bad(res, "The file has no product rows.");
  const sk = (v) => String(v ?? "").toLowerCase().replace(/[^a-z0-9.]/g, "").replace(/mg$/, "");
  const has = (v) => v !== undefined && v !== null && String(v).trim() !== "";
  const { rows: existing } = await q("select id, name, strength, manufacturer, stock from products");
  let created = 0, updated = 0; const problems = [];
  for (const [i, r] of rows.entries()) {
    const name = str(r.name, 120), strength = str(r.strength, 40);
    if (!name) { problems.push(`Row ${i + 2}: no product name`); continue; }
    const price = has(r.price) ? centsOrNull(String(r.price).replace(/[$,\s]/g, "")) : undefined;
    if (has(r.price) && price === null) { problems.push(`Row ${i + 2}: price "${r.price}" isn't a number`); continue; }
    const f = {};
    if (has(r.category)) f.category = str(r.category, 60);
    if (has(r.manufacturer)) f.manufacturer = str(r.manufacturer, 80);
    if (has(r.sku)) f.sku = str(r.sku, 60).toUpperCase();
    if (has(r.description)) f.description = str(r.description, 2000);
    if (price !== undefined) f.price_cents = price;
    if (has(r.stock)) f.stock = /^(∞|unlimited|untracked|-)$/i.test(String(r.stock).trim()) ? null : intOrNull(r.stock);
    if (has(r.maxPerOrder)) f.max_per_order = intOrNull(r.maxPerOrder);
    if (has(r.sort)) f.sort = intOrNull(r.sort) ?? 0;
    if (has(r.showCode)) f.show_code = /^(yes|y|true|1|on|x)$/i.test(String(r.showCode).trim());
    if (has(r.active)) f.active = !/^(no|n|false|0|off|hidden|hide)$/i.test(String(r.active).trim());
    // same peptide + size can exist once per manufacturer
    const nm = (v) => String(v ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
    const same = existing.filter((p) => p.name.toLowerCase() === name.toLowerCase() && sk(p.strength) === sk(strength));
    let match;
    if (has(r.manufacturer)) match = same.find((p) => nm(p.manufacturer) === nm(r.manufacturer));
    else if (same.length > 1) { problems.push(`Row ${i + 2}: ${name} ${strength} comes from more than one manufacturer; add a Manufacturer column so it updates the right one`); continue; }
    else match = same[0];
    if (match) {
      if (f.stock !== undefined && f.stock !== null && f.stock !== match.stock) await moveStock(pool, match.id, 0, { setTo: f.stock, reason: "Spreadsheet import", who: req.user.name || req.user.email });
      const cols = Object.keys(f);
      if (cols.length) await q(`update products set ${cols.map((c, j) => `${c} = $${j + 1}`)} where id = $${cols.length + 1}`, [...Object.values(f), match.id]);
      updated++;
    } else {
      const g = { name, strength, category: "Research peptide", ...f };
      const cols = Object.keys(g);
      const { rows: [n] } = await q(`insert into products(${cols}) values (${cols.map((_, j) => "$" + (j + 1))}) returning *`, Object.values(g));
      if (n.stock) await q("insert into stock_moves(product_id, change, balance, reason, who) values ($1,$2,$2,'Opening count (import)',$3)", [n.id, n.stock, req.user.name || req.user.email]);
      existing.push(n); created++;
    }
  }
  res.json({ ok: true, created, updated, problems });
}));
// picture (shown instead of the drawn vial) or logo (printed on the vial label); JPG, PNG or WEBP up to 5 MB
function pictureFrom(data) {
  const m = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/.exec(String(data || ""));
  if (!m) return null;
  const buf = Buffer.from(m[2], "base64");
  return buf.length && buf.length <= 5 * 1024 * 1024 ? { type: m[1], buf } : null;
}
admin.post("/products/:id/media", owner, wrap(async (req, res) => {
  const id = intOrNull(req.params.id), b = req.body || {};
  if (b.vialLabel !== undefined) {
    const c = /^#[0-9a-f]{6}$/i.test(String(b.vialLabel)) ? b.vialLabel : "";
    await q("update products set vial_label = $1, media_v = media_v + 1 where id = $2", [c, id]);
    return res.json({ ok: true });
  }
  const kind = b.kind === "logo" ? "logo" : "image";
  const f = pictureFrom(b.fileData); if (!f) return bad(res, "Use a JPG, PNG or WEBP under 5 MB.");
  await q(`update products set ${kind} = $1, ${kind}_type = $2, media_v = media_v + 1 where id = $3`, [f.buf, f.type, id]);
  res.json({ ok: true });
}));
admin.delete("/products/:id/media/:kind", owner, wrap(async (req, res) => {
  const kind = req.params.kind === "logo" ? "logo" : "image";
  await q(`update products set ${kind} = null, ${kind}_type = null, media_v = media_v + 1 where id = $1`, [intOrNull(req.params.id)]);
  res.json({ ok: true });
}));
admin.put("/vial-photo", owner, wrap(async (req, res) => {
  const f = pictureFrom(req.body?.fileData); if (!f) return bad(res, "Use a JPG, PNG or WEBP under 5 MB.");
  await q("insert into settings(key,value) values ('vialPhoto',$1) on conflict (key) do update set value = excluded.value", [JSON.stringify({ type: f.type, data: f.buf.toString("base64") })]);
  await q("update settings set value = to_jsonb(coalesce((value #>> '{}')::int, 0) + 1) where key = 'vialPhotoV'");
  res.json({ ok: true });
}));
admin.delete("/vial-photo", owner, wrap(async (req, res) => {
  await q("delete from settings where key = 'vialPhoto'");
  await q("update settings set value = '1' where key = 'vialPhotoV'");
  res.json({ ok: true });
}));
admin.put("/site-logo", owner, wrap(async (req, res) => {
  const f = pictureFrom(req.body?.fileData); if (!f) return bad(res, "Use a JPG, PNG or WEBP under 5 MB.");
  if (f.buf.length > 2 * 1024 * 1024) return bad(res, "Keep the logo under 2 MB.");
  await q("insert into settings(key,value) values ('siteLogo',$1) on conflict (key) do update set value = excluded.value", [JSON.stringify({ type: f.type, data: f.buf.toString("base64") })]);
  await q("update settings set value = to_jsonb(coalesce((value #>> '{}')::int, 0) + 1) where key = 'siteLogoV'");
  res.json({ ok: true });
}));
// "remove" the site logo = show the store name as text instead; the bundled logo comes back with restore
admin.delete("/site-logo", owner, wrap(async (req, res) => {
  await q("delete from settings where key = 'siteLogo'");
  await q("update settings set value = $1 where key = 'siteLogoV'", [req.query.restore ? "1" : "0"]);
  res.json({ ok: true });
}));
admin.put("/vial-logo", owner, wrap(async (req, res) => {
  const f = pictureFrom(req.body?.fileData); if (!f) return bad(res, "Use a JPG, PNG or WEBP under 5 MB.");
  if (f.buf.length > 1024 * 1024) return bad(res, "Keep the logo under 1 MB.");
  await q("insert into settings(key,value) values ('vialLogo',$1) on conflict (key) do update set value = excluded.value", [JSON.stringify({ type: f.type, data: f.buf.toString("base64") })]);
  await q("update settings set value = to_jsonb(coalesce((value #>> '{}')::int, 0) + 1) where key = 'vialLogoV'");
  res.json({ ok: true });
}));
admin.delete("/vial-logo", owner, wrap(async (req, res) => {
  await q("delete from settings where key = 'vialLogo'");
  await q("update settings set value = $1 where key = 'vialLogoV'", [req.query.restore ? "1" : "0"]);
  res.json({ ok: true });
}));
admin.post("/products/clear", owner, wrap(async (req, res) => {
  if (req.body?.confirm !== "DELETE") return bad(res, "Type DELETE to confirm.");
  const { rowCount } = await q("delete from products");
  res.json({ ok: true, removed: rowCount });
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
const MAX_FILE = 10 * 1024 * 1024;
// accepts a JPG, PNG, WEBP or PDF sent from the admin as a data: URL
function fileFrom(data) {
  const m = /^data:(image\/(?:jpeg|png|webp)|application\/pdf);base64,([A-Za-z0-9+/=]+)$/.exec(String(data || ""));
  if (!m) return null;
  const buf = Buffer.from(m[2], "base64");
  if (!buf.length || buf.length > MAX_FILE) return null;
  if (m[1] === "application/pdf" && buf.subarray(0, 5).toString() !== "%PDF-") return null;
  return { type: m[1], buf };
}
const imageFrom = (b) => fileFrom(b.imageData);
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

admin.post("/reports/clear", owner, wrap(async (req, res) => {
  if (req.body?.confirm !== "DELETE") return bad(res, "Type DELETE to confirm.");
  const { rowCount } = await q("delete from reports");
  res.json({ ok: true, removed: rowCount });
}));

/* ---------- admin: sales reps ---------- */
admin.get("/reps", wrap(async (req, res) => {
  const { rows } = await q(`select u.id, u.name, u.email, u.phone, u.commission_rate, u.active, u.created_at,
      (select count(*)::int from customers c where c.rep_id = u.id) customers,
      (select count(*)::int from orders o where o.rep_id = u.id and o.status <> 'cancelled') orders,
      coalesce((select sum(o.subtotal_cents - o.discount_cents) from orders o where o.rep_id = u.id and o.status <> 'cancelled'), 0)::int sales_cents,
      coalesce((select sum(o.subtotal_cents - o.discount_cents) from orders o where o.rep_id = u.id and o.status <> 'cancelled' and o.created_at >= date_trunc('month', now())), 0)::int month_cents
    from users u where u.role = 'rep' order by u.active desc, u.name`);
  for (const r of rows) r.commission = commTotals(await commissionRows({ repId: r.id }));
  res.json({ reps: rows });
}));
const rateOf = (v) => { const n = Number(String(v ?? "").replace(/[%\s]/g, "")); return Number.isFinite(n) ? Math.min(100, Math.max(0, Math.round(n * 100) / 100)) : null; };
admin.post("/reps", owner, wrap(async (req, res) => {
  const b = req.body || {}, email = str(b.email, 160).toLowerCase(), pass = String(b.password || "");
  if (!str(b.name, 80) || !isEmail(email)) return bad(res, "Enter the rep's name and a valid email.");
  if (pass.length < 8) return bad(res, "Give the rep a password of at least 8 characters.");
  const rate = rateOf(b.rate); if (rate === null) return bad(res, "Enter the commission as a percent, e.g. 10.");
  try {
    const { rows: [u] } = await q("insert into users(email,name,role,pass_hash,phone,commission_rate) values ($1,$2,'rep',$3,$4,$5) returning id", [email, str(b.name, 80), await bcrypt.hash(pass, 11), str(b.phone, 40), rate]);
    res.json({ ok: true, id: u.id });
  } catch (e) { bad(res, "That email already has a login."); }
}));
admin.patch("/reps/:id", owner, wrap(async (req, res) => {
  const id = intOrNull(req.params.id), b = req.body || {};
  const { rows: [u] } = await q("select id from users where id = $1 and role = 'rep'", [id]);
  if (!u) return bad(res, "Rep not found", 404);
  if (b.name !== undefined) await q("update users set name = $1 where id = $2", [str(b.name, 80), id]);
  if (b.phone !== undefined) await q("update users set phone = $1 where id = $2", [str(b.phone, 40), id]);
  if (b.rate !== undefined) { const r = rateOf(b.rate); if (r === null) return bad(res, "Enter the commission as a percent."); await q("update users set commission_rate = $1 where id = $2", [r, id]); }
  if (b.active !== undefined) { await q("update users set active = $1 where id = $2", [!!b.active, id]); if (!b.active) await q("delete from sessions where user_id = $1", [id]); }
  if (b.password) {
    if (String(b.password).length < 8) return bad(res, "Password needs at least 8 characters.");
    await q("update users set pass_hash = $1 where id = $2", [await bcrypt.hash(String(b.password), 11), id]);
    await q("delete from sessions where user_id = $1", [id]);
  }
  res.json({ ok: true });
}));
admin.get("/commissions", wrap(async (req, res) => {
  const rows = await commissionRows({ repId: intOrNull(req.query.rep), from: req.query.from, to: req.query.to, status: req.query.status });
  const { rows: payouts } = await q("select p.*, u.name rep_name from commission_payouts p left join users u on u.id = p.rep_id order by p.paid_at desc limit 200");
  res.json({ rows, totals: commTotals(rows), payouts });
}));
admin.post("/commissions/payout", owner, wrap(async (req, res) => {
  const b = req.body || {}, repId = intOrNull(b.repId);
  const ids = (Array.isArray(b.orderIds) ? b.orderIds : []).map(intOrNull).filter(Boolean);
  if (!repId || !ids.length) return bad(res, "Pick a rep and at least one earned commission.");
  const client = await pool.connect();
  try {
    await client.query("begin");
    const { rows } = await client.query(`select o.id, round((o.subtotal_cents - o.discount_cents) * coalesce(o.commission_rate,0) / 100.0)::int c from orders o
      where o.id = any($1) and o.rep_id = $2 and o.payout_id is null and o.status in ('paid','shipped','delivered') for update`, [ids, repId]);
    if (!rows.length) throw new Error("None of those commissions are earned and unpaid.");
    const amount = rows.reduce((t, r) => t + r.c, 0);
    const { rows: [p] } = await client.query("insert into commission_payouts(rep_id, amount_cents, orders, note, who) values ($1,$2,$3,$4,$5) returning id", [repId, amount, rows.length, str(b.note, 300), req.user.name || req.user.email]);
    await client.query("update orders set payout_id = $1 where id = any($2)", [p.id, rows.map((r) => r.id)]);
    await client.query("commit");
    res.json({ ok: true, amountCents: amount, orders: rows.length });
  } catch (e) { await client.query("rollback").catch(() => {}); bad(res, e.message); }
  finally { client.release(); }
}));
admin.delete("/commissions/payout/:id", owner, wrap(async (req, res) => {
  await q("update orders set payout_id = null where payout_id = $1", [intOrNull(req.params.id)]);
  await q("delete from commission_payouts where id = $1", [intOrNull(req.params.id)]);
  res.json({ ok: true });
}));
admin.get("/commissions.csv", owner, wrap(async (req, res) => {
  const rows = await commissionRows({ repId: intOrNull(req.query.rep), from: req.query.from, to: req.query.to, status: req.query.status });
  const cell = (v) => { const x = String(v ?? ""); return /[",\n]/.test(x) || /^[=+\-@]/.test(x) ? `"${x.replace(/^([=+\-@])/, "'$1").replace(/"/g, '""')}"` : x; };
  const head = ["Order", "Date", "Rep", "Customer", "Order status", "Sales (after discount)", "Rate %", "Commission", "Commission status", "Paid out on"];
  const out = rows.map((r) => [r.number, r.created_at.toISOString().slice(0, 10), r.rep_name, r.customer, r.status, ((r.subtotal_cents - r.discount_cents) / 100).toFixed(2), r.commission_rate ?? "", (r.commission_cents / 100).toFixed(2), r.comm_status, r.payout_date ? r.payout_date.toISOString().slice(0, 10) : ""].map(cell).join(","));
  res.set("Content-Type", "text/csv"); res.set("Content-Disposition", "attachment; filename=commissions.csv");
  res.send([head.join(","), ...out].join("\n"));
}));

// deleting a customer keeps their past orders (the orders keep the name and address they were placed with)
admin.delete("/customers/:id", owner, wrap(async (req, res) => {
  const id = intOrNull(req.params.id);
  const { rows: [c] } = await q("select name from customers where id = $1", [id]);
  if (!c) return bad(res, "Customer not found", 404);
  await q("delete from customers where id = $1", [id]);
  res.json({ ok: true });
}));

/* ---------- admin: product documents ---------- */
const DOC_KINDS = ["COA", "SDS / safety sheet", "Spec sheet", "Certificate", "Storage & handling", "Other"];
admin.get("/documents", wrap(async (req, res) => {
  const pid = intOrNull(req.query.productId);
  const { rows } = await q(`select id, product_id, title, kind, file_name, file_type, size, public, sort, created_at from documents
    ${pid ? "where product_id = $1" : ""} order by sort, created_at`, pid ? [pid] : []);
  res.json({ documents: rows, kinds: DOC_KINDS });
}));
admin.post("/documents", owner, wrap(async (req, res) => {
  const b = req.body || {}, pid = intOrNull(b.productId);
  if (!pid || !(await q("select 1 from products where id = $1", [pid])).rows.length) return bad(res, "Pick a product first.");
  const f = fileFrom(b.fileData);
  if (!f) return bad(res, "Attach a PDF, JPG or PNG under 10 MB.");
  const title = str(b.title, 140) || str(b.fileName, 140) || "Document";
  const kind = DOC_KINDS.includes(b.kind) ? b.kind : "Other";
  const { rows: [d] } = await q("insert into documents(product_id, title, kind, file_name, file_type, file, size, public) values ($1,$2,$3,$4,$5,$6,$7,$8) returning id",
    [pid, title, kind, str(b.fileName, 200), f.type, f.buf, f.buf.length, b.public !== false]);
  res.json({ ok: true, id: d.id });
}));
admin.patch("/documents/:id", owner, wrap(async (req, res) => {
  const b = req.body || {};
  await q("update documents set title = coalesce(nullif($1, ''), title), kind = $2, public = $3 where id = $4",
    [str(b.title, 140), DOC_KINDS.includes(b.kind) ? b.kind : "Other", b.public !== false, intOrNull(req.params.id)]);
  res.json({ ok: true });
}));
admin.delete("/documents/:id", owner, wrap(async (req, res) => {
  await q("delete from documents where id = $1", [intOrNull(req.params.id)]);
  res.json({ ok: true });
}));

/* ---------- admin: inventory ---------- */
const OPEN_ORDER = "('new','confirmed','paid')";
admin.get("/inventory", wrap(async (req, res) => {
  const { rows } = await q(`select p.id, p.name, p.strength, p.manufacturer, p.sku, p.active, p.stock, p.reorder_point, p.cost_cents, p.price_cents,
      coalesce((select sum(i.qty) from order_items i join orders o on o.id = i.order_id where i.product_id = p.id and o.status in ${OPEN_ORDER}), 0)::int committed,
      (select max(at) from stock_moves m where m.product_id = p.id and m.change > 0 and m.reason = 'Received') last_received,
      (select min(expires) from stock_moves m where m.product_id = p.id and m.reason = 'Received' and m.expires >= current_date) next_expiry,
      coalesce((select sum(-m.change) from stock_moves m where m.product_id = p.id and m.reason = 'Order' and m.at > now() - interval '30 days'), 0)::int sold_30d
    from products p order by p.sort, p.name, p.strength, p.manufacturer, p.id`);
  res.json({ items: rows, role: req.user.role });
}));
admin.get("/inventory/:id/moves", wrap(async (req, res) => {
  const { rows } = await q("select at, change, balance, reason, ref, lot, expires, cost_cents, supplier, note, who from stock_moves where product_id = $1 order by at desc, id desc limit 300", [intOrNull(req.params.id)]);
  res.json({ moves: rows });
}));
const dateOrNull = (v) => (/^\d{4}-\d{2}-\d{2}$/.test(String(v || "")) ? v : null);
// receive one or more lines in a single shipment; updates the average cost per unit
admin.post("/inventory/receive", wrap(async (req, res) => {
  const b = req.body || {};
  const lines = (Array.isArray(b.lines) ? b.lines : []).map((l) => ({ id: intOrNull(l.productId), qty: intOrNull(l.qty), cost: centsOrNull(String(l.costEach ?? "").replace(/[$,\s]/g, "")), lot: str(l.lot, 60), expires: dateOrNull(l.expires) }))
    .filter((l) => l.id && l.qty > 0);
  if (!lines.length) return bad(res, "Enter a quantity for at least one product.");
  const client = await pool.connect();
  try {
    await client.query("begin");
    for (const l of lines) {
      const { rows: [p] } = await client.query("select stock, cost_cents from products where id = $1 for update", [l.id]);
      if (!p) throw new Error("A product in this shipment no longer exists.");
      if (l.cost !== null && l.cost !== undefined) {
        const have = Math.max(0, p.stock || 0);
        const avg = p.cost_cents === null || !have ? l.cost : Math.round((p.cost_cents * have + l.cost * l.qty) / (have + l.qty));
        await client.query("update products set cost_cents = $1 where id = $2", [avg, l.id]);
      }
      await moveStock(client, l.id, l.qty, { reason: "Received", lot: l.lot, expires: l.expires, costCents: l.cost, supplier: str(b.supplier, 120), ref: str(b.ref, 60), note: str(b.note, 500), who: req.user.name || req.user.email });
    }
    await client.query("commit");
    res.json({ ok: true, lines: lines.length });
  } catch (e) { await client.query("rollback").catch(() => {}); bad(res, e.message || "Couldn't receive that shipment."); }
  finally { client.release(); }
}));
const ADJUST_REASONS = ["Count correction", "Damaged", "Expired", "Lost", "Sample / testing", "Returned by customer", "Other"];
admin.post("/inventory/:id/adjust", wrap(async (req, res) => {
  const id = intOrNull(req.params.id), b = req.body || {};
  const reason = ADJUST_REASONS.includes(b.reason) ? b.reason : "Other";
  const who = req.user.name || req.user.email, note = str(b.note, 500);
  if (b.mode === "set") {
    const n = intOrNull(b.qty); if (n === null || n < 0) return bad(res, "Enter the counted quantity (0 or more).");
    await moveStock(pool, id, 0, { setTo: n, reason, note, who });
  } else {
    const n = intOrNull(b.qty); if (!n) return bad(res, "Enter how many to add (+) or remove (−).");
    await moveStock(pool, id, n, { reason, note, who });
  }
  const { rows: [p] } = await q("select stock from products where id = $1", [id]);
  res.json({ ok: true, stock: p ? p.stock : null });
}));
admin.patch("/inventory/:id", owner, wrap(async (req, res) => {
  const id = intOrNull(req.params.id), b = req.body || {};
  if (b.reorderPoint !== undefined) await q("update products set reorder_point = $1 where id = $2", [b.reorderPoint === "" ? null : Math.max(0, intOrNull(b.reorderPoint) ?? 0), id]);
  if (b.costEach !== undefined) await q("update products set cost_cents = $1 where id = $2", [centsOrNull(String(b.costEach).replace(/[$,\s]/g, "")), id]);
  if (b.track === false) { await q("update products set stock = null where id = $1", [id]); await q("insert into stock_moves(product_id, change, balance, reason, who) values ($1,0,null,'Stopped tracking',$2)", [id, req.user.name || req.user.email]); }
  if (b.track === true) await moveStock(pool, id, 0, { setTo: Math.max(0, intOrNull(b.startAt) ?? 0), reason: "Started tracking", who: req.user.name || req.user.email });
  res.json({ ok: true });
}));
admin.get("/inventory.csv", wrap(async (req, res) => {
  const { rows } = await q(`select p.name, p.strength, p.manufacturer, p.sku, p.stock, p.reorder_point, p.cost_cents, p.price_cents,
      coalesce((select sum(i.qty) from order_items i join orders o on o.id = i.order_id where i.product_id = p.id and o.status in ${OPEN_ORDER}), 0)::int committed
    from products p order by p.name, p.strength, p.manufacturer`);
  const cell = (v) => { const x = String(v ?? ""); return /[",\n]/.test(x) || /^[=+\-@]/.test(x) ? `"${x.replace(/^([=+\-@])/, "'$1").replace(/"/g, '""')}"` : x; };
  const showCost = req.user.role === "owner";
  const head = ["Name", "Size", "Manufacturer", "Code", "Available", "In open orders", "On shelf", "Reorder at", ...(showCost ? ["Cost each", "Stock value"] : []), "Price"];
  const out = rows.map((r) => [r.name, r.strength, r.manufacturer, r.sku, r.stock ?? "not tracked", r.committed, r.stock === null ? "" : r.stock + r.committed, r.reorder_point ?? "",
    ...(showCost ? [r.cost_cents === null ? "" : (r.cost_cents / 100).toFixed(2), r.cost_cents === null || r.stock === null ? "" : ((r.cost_cents * Math.max(0, r.stock)) / 100).toFixed(2)] : []),
    r.price_cents === null ? "" : (r.price_cents / 100).toFixed(2)].map(cell).join(","));
  res.set("Content-Type", "text/csv"); res.set("Content-Disposition", "attachment; filename=inventory.csv");
  res.send([head.join(","), ...out].join("\n"));
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
admin.get("/settings", wrap(async (req, res) => { const st = await getSettings(); delete st.pinHash; delete st.pinSecret; res.json({ settings: st }); }));
admin.put("/settings", owner, wrap(async (req, res) => {
  const b = req.body || {};
  for (const k of Object.keys(DEFAULT_SETTINGS)) {
    if (b[k] === undefined || k === "pinOn") continue; // the PIN has its own endpoint
    let v = b[k];
    if (k === "vialLogoV" || k === "siteLogoV" || k === "vialPhotoV") continue; // changed only by uploading or removing a logo
    if (k === "perks") {
      const ICONS = ["flask", "doc", "key", "shield", "truck", "star", "lock", "chat", "box", "check"];
      v = (Array.isArray(v) ? v : []).slice(0, 6).map((c) => ({ icon: ICONS.includes(c && c.icon) ? c.icon : "check", title: str(c && c.title, 60), text: str(c && c.text, 160) })).filter((c) => c.title || c.text);
    } else if (k === "vial") {
      const d = DEFAULT_SETTINGS.vial, x = v && typeof v === "object" ? v : {};
      v = Object.fromEntries(Object.keys(d).map((key) => [key, key === "shape" ? (["photo", "vial", "tall", "round"].includes(x.shape) ? x.shape : "photo")
        : key === "labelShows" ? (["name", "code"].includes(x.labelShows) ? x.labelShows : "name")
        : key === "photoTint" ? !!x.photoTint
        : /^#[0-9a-f]{6}$/i.test(String(x[key] || "")) ? x[key] : d[key]]));
    } else if (typeof DEFAULT_SETTINGS[k] === "boolean") v = !!v;
    else if (typeof DEFAULT_SETTINGS[k] === "number") v = Math.max(0, intOrNull(v) ?? DEFAULT_SETTINGS[k]);
    else if (Array.isArray(DEFAULT_SETTINGS[k])) v = (Array.isArray(v) ? v : []).map((x) => str(x, 1000)).filter(Boolean).slice(0, 30);
    else v = str(v, 3000);
    if (k === "brandUrl" && v && !/^https:\/\//i.test(v)) v = "";
    if (k === "productLabel" && !["name", "code", "both"].includes(v)) v = "name";
    await q("insert into settings(key, value) values ($1,$2) on conflict (key) do update set value = excluded.value", [k, JSON.stringify(v)]);
  }
  res.json({ ok: true });
}));

/* ---------- admin: site PIN ---------- */
admin.get("/pin", owner, wrap(async (req, res) => { pinCache.at = 0; const st = await pinState(); res.json({ on: st.on, set: !!st.hash, customerPins: st.customerPins }); }));
admin.put("/pin", owner, wrap(async (req, res) => {
  const b = req.body || {};
  if (b.clearShared) await q("delete from settings where key = 'pinHash'");
  if (b.pin !== undefined && b.pin !== "") {
    const pin = String(b.pin);
    if (!/^\d{4,8}$/.test(pin)) return bad(res, "The PIN must be 4 to 8 digits.");
    const st0 = await pinState();
    if ((await q("select 1 from customers where access_pin_key = $1", [customerPinKey(st0, pin)])).rows.length) return bad(res, "A customer already uses that PIN. Pick another.");
    await q("insert into settings(key,value) values ('pinHash',$1) on conflict (key) do update set value = excluded.value", [JSON.stringify(await bcrypt.hash(pin, 10))]);
  }
  const { rows: [h] } = await q("select value from settings where key = 'pinHash'");
  const { rows: [cp] } = await q("select count(*)::int n from customers where access_pin_key is not null and active");
  if (b.on && !h && !cp.n) return bad(res, "Set a shared PIN or give at least one customer a PIN first.");
  await q("insert into settings(key,value) values ('pinOn',$1) on conflict (key) do update set value = excluded.value", [JSON.stringify(!!b.on)]);
  pinCache.at = 0;
  res.json({ ok: true });
}));

/* ---------- admin: users (owner only) ---------- */
admin.get("/users", owner, wrap(async (req, res) => {
  const { rows } = await q("select id,email,name,role,active,created_at from users where role <> 'rep' order by role, name");
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

/* ---------- sales rep app (/rep): a rep sees and works only their own customers and orders ---------- */
const rep = express.Router();
rep.use(wrap(auth));
rep.use((req, res, next) => (req.user.role === "rep" ? next() : bad(res, "This page is for sales reps. Use /admin.", 403)));
rep.get("/me", wrap(async (req, res) => {
  const { rows: [u] } = await q("select id, name, email, phone, commission_rate from users where id = $1", [req.user.id]);
  const rows = await commissionRows({ repId: req.user.id });
  const month = rows.filter((r) => r.comm_status !== "void" && new Date(r.created_at) >= new Date(new Date().getFullYear(), new Date().getMonth(), 1));
  const { rows: [c] } = await q("select count(*)::int n from customers where rep_id = $1", [req.user.id]);
  const s = await getSettings();
  res.json({ rep: u, customers: c.n, totals: commTotals(rows), month: { orders: month.length, sales: month.reduce((t, r) => t + r.subtotal_cents - r.discount_cents, 0), commission: month.reduce((t, r) => t + r.commission_cents, 0) }, brand: s.brand });
}));
rep.get("/customers", wrap(async (req, res) => {
  const { rows } = await q(`select c.id, c.name, c.email, c.phone, c.address, c.created_at, c.active,
      (select count(*)::int from orders o where o.customer_id = c.id and o.status <> 'cancelled') orders,
      coalesce((select sum(o.subtotal_cents - o.discount_cents) from orders o where o.customer_id = c.id and o.status <> 'cancelled'), 0)::int sales_cents,
      (select max(created_at) from orders o where o.customer_id = c.id) last_order
    from customers c where c.rep_id = $1 order by c.name`, [req.user.id]);
  res.json({ customers: rows });
}));
rep.post("/customers", wrap(async (req, res) => {
  const b = req.body || {}, email = str(b.email, 160).toLowerCase();
  if (!str(b.name, 120) || !isEmail(email)) return bad(res, "Enter the customer's name and a valid email.");
  const addr = cleanAddress(b.address);
  if (!addr.line1 || !addr.city || !addr.state || !addr.zip) return bad(res, "Enter the customer's full shipping address.");
  const { rows: [ex] } = await q("select id, rep_id from customers where lower(email) = $1", [email]);
  if (ex) return bad(res, ex.rep_id === req.user.id ? "That customer is already on your list." : "A customer with that email already exists. Ask the office to assign them to you.");
  const { rows: [c] } = await q("insert into customers(email, name, phone, address, pass_hash, rep_id) values ($1,$2,$3,$4,$5,$6) returning id",
    [email, str(b.name, 120), str(b.phone, 40), JSON.stringify(addr), await bcrypt.hash(crypto.randomBytes(24).toString("hex"), 10), req.user.id]);
  await q("update orders set customer_id = $1 where customer_id is null and lower(email) = $2", [c.id, email]);
  res.json({ ok: true, id: c.id });
}));
rep.patch("/customers/:id", wrap(async (req, res) => {
  const b = req.body || {}, id = intOrNull(req.params.id);
  const { rows: [c] } = await q("select id from customers where id = $1 and rep_id = $2", [id, req.user.id]);
  if (!c) return bad(res, "Customer not found", 404);
  const addr = cleanAddress(b.address);
  await q("update customers set name = coalesce(nullif($1,''), name), phone = $2, address = $3 where id = $4", [str(b.name, 120), str(b.phone, 40), JSON.stringify(addr), id]);
  res.json({ ok: true });
}));
rep.get("/catalog", wrap(async (req, res) => {
  const [{ rows: products }, { rows: shipping }] = await Promise.all([
    q("select id, name, strength, manufacturer, sku, category, price_cents, stock, max_per_order from products where active order by sort, name, strength, manufacturer, id"),
    q("select id, name, detail, price_cents, free_over_cents from shipping_methods where active order by sort, price_cents")
  ]);
  res.json({ products, shipping });
}));
rep.post("/orders", wrap(async (req, res) => {
  const b = req.body || {};
  const { rows: [c] } = await q("select id, name, email, phone, address from customers where id = $1 and rep_id = $2 and active", [intOrNull(b.customerId), req.user.id]);
  if (!c) return bad(res, "Pick one of your customers.");
  const items = (Array.isArray(b.items) ? b.items : []).filter((i) => intOrNull(i.qty) > 0).slice(0, 100);
  if (!items.length) return bad(res, "Add at least one product.");
  const a = c.address || {};
  if (!a.line1 || !a.city || !a.state || !a.zip) return bad(res, "This customer has no full shipping address yet. Edit the customer first.");
  try {
    const r = await createOrder({ name: c.name, email: c.email, phone: c.phone, address: a, items, shippingMethodId: b.shippingMethodId, note: b.note, customerId: c.id, repId: req.user.id,
      placedBy: `Rep: ${req.user.name || req.user.email}`, event: `Order placed by sales rep ${req.user.name || req.user.email}`, settings: await getSettings() });
    res.json({ ok: true, ...r });
  } catch (e) { bad(res, e.message || "Could not place the order."); }
}));
rep.get("/orders", wrap(async (req, res) => {
  const { rows } = await q(`select o.number, o.status, o.name, o.total_cents, o.subtotal_cents, o.discount_cents, o.carrier, o.tracking, o.created_at, o.placed_by,
      (select json_agg(json_build_object('name', i.name, 'strength', i.strength, 'qty', i.qty, 'unit', i.unit_cents) order by i.id) from order_items i where i.order_id = o.id) items
    from orders o where o.rep_id = $1 order by o.created_at desc limit 300`, [req.user.id]);
  res.json({ orders: rows });
}));
rep.get("/commissions", wrap(async (req, res) => {
  const rows = await commissionRows({ repId: req.user.id, from: req.query.from, to: req.query.to });
  const { rows: payouts } = await q("select amount_cents, orders, note, paid_at from commission_payouts where rep_id = $1 order by paid_at desc", [req.user.id]);
  res.json({ rows: rows.map(({ rep_email, ...r }) => r), totals: commTotals(rows), payouts });
}));
app.use("/api/rep", rep);


/* ---------- pages ---------- */
app.use(express.static(path.join(__dirname, "public"), {
  extensions: ["html"], maxAge: "5m",
  // pages and the service worker must never be cached, or visitors keep seeing an old version
  setHeaders: (res, file) => { if (/\.(html|webmanifest)$|[\\/]sw\.js$/.test(file)) res.set("Cache-Control", "no-cache"); }
}));
app.get("/lab-reports", (req, res) => res.set("Cache-Control", "no-cache").sendFile(path.join(__dirname, "public", "index.html")));
app.get("/admin", (req, res) => res.set("Cache-Control", "no-cache").sendFile(path.join(__dirname, "public", "admin.html")));
app.get("/rep", (req, res) => res.set("Cache-Control", "no-cache").sendFile(path.join(__dirname, "public", "rep.html")));
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
  // ADMIN_LOGIN_RESET on the host: each new value applies OWNER_EMAIL / OWNER_PASSWORD once, creating that
  // owner login or resetting its password, and signs that login out everywhere. Other logins are left alone.
  const loginTag = String(process.env.ADMIN_LOGIN_RESET || "").trim();
  if (loginTag && process.env.OWNER_EMAIL && process.env.OWNER_PASSWORD) {
    const { rows: [done] } = await q("select value from settings where key = 'adminLoginResetMark'");
    if (!done || done.value !== loginTag) {
      const email = process.env.OWNER_EMAIL.trim().toLowerCase();
      const { rows: [u] } = await q(`insert into users(email,name,role,pass_hash) values ($1,'Owner','owner',$2)
        on conflict (email) do update set role = 'owner', active = true, pass_hash = excluded.pass_hash returning id`, [email, await bcrypt.hash(process.env.OWNER_PASSWORD, 11)]);
      await q("delete from sessions where user_id = $1", [u.id]);
      await q("insert into settings(key,value) values ('adminLoginResetMark',$1) on conflict (key) do update set value = excluded.value", [JSON.stringify(loginTag)]);
      console.log("Owner login set for", email);
    }
  }
  // CATALOG_RESET on the host: each new value wipes every lab report and product (with their documents
  // and stock history) once, then adds a few sample products to edit. Orders, customers and settings stay.
  const resetTag = String(process.env.CATALOG_RESET || "").trim();
  if (resetTag) {
    const { rows: [done] } = await q("select value from settings where key = 'catalogResetMark'");
    if (!done || done.value !== resetTag) {
      const client = await pool.connect();
      try {
        await client.query("begin");
        const { rowCount: rr } = await client.query("delete from reports");
        const { rowCount: pr } = await client.query("delete from products");
        const SAMPLES = [
          ["BPC-157", "10 mg", "Tissue repair research", "BC10", 4500],
          ["TB-500", "10 mg", "Tissue repair research", "TB10", 5000],
          ["GHK-Cu", "50 mg", "Skin and hair research", "CU50", 4000],
          ["Ipamorelin", "10 mg", "Growth hormone research", "IP10", 3800],
          ["Epithalon", "10 mg", "Longevity research", "ET10", 4200]
        ];
        for (const [i, [name, strength, category, sku, price]] of SAMPLES.entries()) {
          await client.query("insert into products(name, strength, category, sku, price_cents, sort, description) values ($1,$2,$3,$4,$5,$6,$7)",
            [name, strength, category, sku, price, i, "Sample listing. Edit or delete it in admin."]);
        }
        await client.query("insert into settings(key,value) values ('catalogResetMark',$1) on conflict (key) do update set value = excluded.value", [JSON.stringify(resetTag)]);
        await client.query("commit");
        console.log(`Catalog reset (${resetTag}): removed ${rr} lab reports and ${pr} products, added ${SAMPLES.length} samples`);
      } catch (e) { await client.query("rollback").catch(() => {}); console.error("Catalog reset failed:", e.message); }
      finally { client.release(); }
    }
  }
  // CATALOG_IMPORT on the host names a list in seed/catalog-<name>.json. Each new value adds those products once
  // (no prices); a product with the same name, size and no manufacturer is updated instead of duplicated.
  const importTag = String(process.env.CATALOG_IMPORT || "").trim().replace(/[^a-z0-9-]/gi, "");
  if (importTag) {
    const { rows: [done] } = await q("select value from settings where key = 'catalogImportMark'");
    const file = path.join(__dirname, "seed", `catalog-${importTag}.json`);
    if ((!done || done.value !== importTag) && require("fs").existsSync(file)) {
      const list = JSON.parse(require("fs").readFileSync(file, "utf8"));
      const sz = (v) => String(v || "").toLowerCase().replace(/[^a-z0-9.]/g, "").replace(/mg$/, "");
      const { rows: have } = await q("select id, name, strength, manufacturer, sort from products");
      let added = 0, updated = 0, sort = have.reduce((m, p) => Math.max(m, p.sort || 0), 0);
      for (const r of list) {
        const m = have.find((p) => p.name.toLowerCase() === r.name.toLowerCase() && sz(p.strength) === sz(r.strength) && !p.manufacturer);
        if (m) { await q(`update products set category = $1,
            price_cents = case when description like 'Sample listing%' then null else price_cents end,
            description = case when $2 <> '' then $2 when description like 'Sample listing%' then '' else description end where id = $3`, [r.category, r.description || "", m.id]); updated++; }
        else { await q("insert into products(name, strength, category, description, sort) values ($1,$2,$3,$4,$5)", [r.name, r.strength, r.category, r.description || "", ++sort]); added++; }
      }
      await q("insert into settings(key,value) values ('catalogImportMark',$1) on conflict (key) do update set value = excluded.value", [JSON.stringify(importTag)]);
      console.log(`Catalog import (${importTag}): added ${added}, updated ${updated}`);
    }
  }
  // SITE_PIN on the host sets the shared store PIN. It's applied once per new value, so a PIN
  // changed later in admin isn't overwritten on restart. It doesn't turn the lock on or off.
  const envPin = String(process.env.SITE_PIN || "").trim();
  if (/^\d{4,8}$/.test(envPin)) {
    const st = await pinState();
    const mark = crypto.createHmac("sha256", st.secret).update("env:" + envPin).digest("hex");
    const { rows: [m] } = await q("select value from settings where key = 'pinEnvMark'");
    if (!m || m.value !== mark) {
      await q("insert into settings(key,value) values ('pinHash',$1) on conflict (key) do update set value = excluded.value", [JSON.stringify(await bcrypt.hash(envPin, 10))]);
      await q("insert into settings(key,value) values ('pinEnvMark',$1) on conflict (key) do update set value = excluded.value", [JSON.stringify(mark)]);
      pinCache.at = 0;
      console.log("Shared store PIN set from SITE_PIN");
    }
  }
  const port = process.env.PORT || 3000;
  app.listen(port, () => console.log("Store running on port " + port));
})().catch((e) => { console.error(e); process.exit(1); });
