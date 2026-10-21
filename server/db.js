// Database: schema, first-run seed, and a small query helper.
const fs = require("fs");
const path = require("path");
const { Pool } = require("pg");

const url = process.env.DATABASE_URL || "";
const pool = new Pool({
  connectionString: url,
  ssl: url && !/localhost|127\.0\.0\.1|host=\//.test(url) && !process.env.PGSSL_OFF ? { rejectUnauthorized: false } : false,
  max: 8
});

const q = (text, params) => pool.query(text, params);

const SCHEMA = `
create table if not exists users (
  id serial primary key,
  email text unique not null,
  name text not null default '',
  role text not null check (role in ('owner','staff')),
  pass_hash text not null,
  active boolean not null default true,
  created_at timestamptz not null default now()
);
create table if not exists sessions (
  token text primary key,
  user_id int not null references users(id) on delete cascade,
  expires timestamptz not null
);
create table if not exists products (
  id serial primary key,
  name text not null,
  strength text not null default '',
  sku text not null default '',
  category text not null default 'Research peptide',
  description text not null default '',
  price_cents int,
  stock int,
  max_per_order int,
  active boolean not null default true,
  sort int not null default 0,
  created_at timestamptz not null default now()
);
create table if not exists reports (
  id serial primary key,
  product text not null,
  strength text not null default '',
  sample text not null default '',
  task text not null default '',
  key text not null default '',
  verify_url text not null default '',
  lab text not null default '',
  client text not null default '',
  manufacturer text not null default '',
  batch text not null default '',
  ordered date, received date, tested date,
  tests_requested text not null default '',
  results jsonb not null default '[]',
  image_type text,
  image bytea,
  active boolean not null default true,
  created_at timestamptz not null default now()
);
create table if not exists shipping_methods (
  id serial primary key,
  name text not null,
  detail text not null default '',
  price_cents int not null default 0,
  free_over_cents int,
  active boolean not null default true,
  sort int not null default 0
);
create table if not exists settings (
  key text primary key,
  value jsonb not null
);
create table if not exists orders (
  id serial primary key,
  number text unique not null,
  status text not null default 'new',
  name text not null, email text not null, phone text not null default '',
  address jsonb not null,
  shipping_method text not null default '',
  shipping_cents int not null default 0,
  subtotal_cents int not null default 0,
  discount_cents int not null default 0,
  total_cents int not null default 0,
  customer_note text not null default '',
  internal_note text not null default '',
  carrier text not null default '',
  tracking text not null default '',
  paid_at timestamptz, shipped_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table if not exists order_items (
  id serial primary key,
  order_id int not null references orders(id) on delete cascade,
  product_id int,
  name text not null, strength text not null default '',
  unit_cents int not null, qty int not null
);
create table if not exists order_events (
  id serial primary key,
  order_id int not null references orders(id) on delete cascade,
  at timestamptz not null default now(),
  who text not null default '',
  text text not null
);
create index if not exists orders_status_idx on orders(status);
create index if not exists orders_created_idx on orders(created_at desc);
`;

const DEFAULT_SETTINGS = {
  brand: "",
  tagline: "",
  distributorOf: "XINT",
  brandUrl: "https://xintpeptides.com/",
  contact: "",
  announcement: "",
  storeOpen: true,
  minAge: 21,
  ageGate: true,
  minOrderCents: 0,
  priceNote: "Prices in US dollars, per vial.",
  paymentInstructions: "We'll review your order and reach out with the total and payment options. Your order ships once payment is received.",
  intro: "Every product here is backed by an independent lab report. Open any listing to see the results, then check the report on the lab's own site with the key printed on it.",
  disclaimers: [
    "All products are sold strictly for in vitro research and laboratory use only. They are not for human or veterinary use, and must not be consumed, injected, inhaled, applied to the body or given to animals.",
    "These products are not drugs, foods, dietary supplements or cosmetics. They have not been approved or evaluated by the U.S. Food and Drug Administration (FDA).",
    "Nothing on this site is intended to diagnose, treat, cure, mitigate or prevent any disease or condition, and nothing here is medical advice.",
    "We are not a pharmacy, compounding pharmacy or outsourcing facility, and we do not fill prescriptions or provide dosing guidance.",
    "You must be 21 or older to enter this site or buy from it. By ordering you confirm you are a qualified researcher purchasing for lawful laboratory research.",
    "The buyer is responsible for knowing and following all laws that apply where they are. We may cancel any order where the intended use does not appear to be research.",
    "Lab reports show results for the tested sample only. They are not an approval, and not a claim of safety or effectiveness.",
    "We are an independent authorized distributor. Brand names belong to their owners. Prices on this site are set by us."
  ]
};

function readSeedReports() {
  // Seed lab reports from the original static page so nothing is retyped.
  const file = path.join(__dirname, "..", "seed", "reports.json");
  if (!fs.existsSync(file)) return [];
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

async function init() {
  await q(SCHEMA);
  for (const [k, v] of Object.entries(DEFAULT_SETTINGS)) {
    await q("insert into settings(key, value) values ($1, $2) on conflict (key) do nothing", [k, JSON.stringify(v)]);
  }
  const { rows: [{ n: rc }] } = await q("select count(*)::int n from reports");
  if (rc === 0) {
    for (const r of readSeedReports()) {
      const imgPath = path.join(__dirname, "..", "coa", r.image || "");
      const img = r.image && fs.existsSync(imgPath) ? fs.readFileSync(imgPath) : null;
      await q(`insert into reports(product,strength,sample,task,key,verify_url,lab,client,manufacturer,batch,ordered,received,tested,tests_requested,results,image_type,image)
        values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)`,
        [r.product, r.strength, r.sample, r.task, r.key, r.verifyUrl, r.lab, r.client, r.manufacturer, r.batch,
         r.ordered || null, r.received || null, r.tested || null, r.testsRequested, JSON.stringify(r.results || []),
         img ? "image/jpeg" : null, img]);
    }
  }
  const { rows: [{ n: pc }] } = await q("select count(*)::int n from products");
  if (pc === 0) {
    const seen = new Set(); let i = 0;
    for (const r of readSeedReports()) {
      const k = r.product + "|" + r.strength;
      if (seen.has(k)) continue; seen.add(k);
      await q("insert into products(name, strength, sort) values ($1,$2,$3)", [r.product, r.strength, i++]);
    }
  }
  const { rows: [{ n: sc }] } = await q("select count(*)::int n from shipping_methods");
  if (sc === 0) {
    await q("insert into shipping_methods(name, detail, price_cents, active, sort) values ('Standard shipping', 'Ships in 1 to 3 business days', 0, false, 0)");
  }
  await q("delete from sessions where expires < now()");
}

async function getSettings() {
  const { rows } = await q("select key, value from settings");
  const out = { ...DEFAULT_SETTINGS };
  rows.forEach((r) => { out[r.key] = r.value; });
  return out;
}

module.exports = { pool, q, init, getSettings, DEFAULT_SETTINGS };
