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
create table if not exists customers (
  id serial primary key,
  email text unique not null,
  name text not null default '',
  phone text not null default '',
  address jsonb not null default '{}',
  pass_hash text not null,
  active boolean not null default true,
  created_at timestamptz not null default now()
);
create table if not exists customer_sessions (
  token text primary key,
  customer_id int not null references customers(id) on delete cascade,
  expires timestamptz not null
);
alter table products add column if not exists show_code boolean not null default false;
alter table orders add column if not exists customer_id int references customers(id) on delete set null;
create index if not exists orders_customer_idx on orders(customer_id);
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
  announcementOn: false,
  pinOn: false,
  productLabel: "name",
  bannerScroll: true,
  heroEyebrow: "Third-party tested",
  headline: "Research peptides with the lab report on every vial",
  storeOpen: true,
  minAge: 21,
  ageGate: true,
  minOrderCents: 0,
  priceNote: "Prices in US dollars, per vial.",
  paymentInstructions: "We'll review your order and reach out with the total and payment options. Your order ships once payment is received.",
  intro: "Every product here is backed by an independent lab report. Open any listing to see the results, then check the report on the lab's own site with the key printed on it.",
  // Short notice in the footer of every page (one paragraph per line).
  footerNotice: [
    "Every product on this site is sold for laboratory research and development only and is not for human or animal consumption of any kind. Statements on this site have not been evaluated by the U.S. Food and Drug Administration, and no product or statement here is intended to diagnose, treat, cure or prevent any disease.",
    "We supply research chemicals. We are not a compounding pharmacy or chemical compounding facility under Section 503A of the Federal Food, Drug, and Cosmetic Act, and not an outsourcing facility under Section 503B of that Act."
  ],
  // Full policy pages. One paragraph per line; "Heading: text" shows the heading in bold.
  disclaimers: [
    "Research use only: All products are sold strictly for in vitro research, laboratory and analytical use. They are not for human or veterinary use and must not be consumed, injected, inhaled, implanted, applied to the skin or given to animals.",
    "Not a drug, food or supplement: These products are not drugs, foods, dietary supplements, cosmetics or medical devices, and they are not labeled for any of those uses.",
    "FDA status: These products have not been approved, cleared or evaluated by the U.S. Food and Drug Administration (FDA). Some compounds sold here are also the active ingredient in prescription medicines; the products sold here are not those medicines and are not a substitute for them.",
    "No medical claims or advice: Nothing on this site is intended to diagnose, treat, cure, mitigate or prevent any disease or condition. Nothing here is medical, dosing or health advice. Talk to a licensed healthcare professional about any medical question.",
    "Chemical supplier, not a pharmacy: We are a research chemical supplier. We are not a pharmacy, not a compounding pharmacy or chemical compounding facility under Section 503A of the Federal Food, Drug, and Cosmetic Act, and not an outsourcing facility under Section 503B. We do not fill prescriptions, compound products or give dosing, reconstitution or administration guidance.",
    "Age and qualified buyers: You must be 21 or older to enter this site or buy from it. Products are intended for qualified researchers and trained laboratory personnel who know how to handle research chemicals safely.",
    "Handling and storage: Handle every product as a potentially hazardous chemical, using proper protective equipment, in a suitable laboratory setting. Store as directed and keep away from children and pets.",
    "Lab reports: Certificates of analysis are issued by an independent testing lab and show results only for the sample tested. They are not an approval, and not a guarantee of safety, effectiveness or fitness for any purpose. Results may vary between batches.",
    "Product information: Descriptions, images and specifications are for identification only. Vial and label images on this site are illustrations. We try to keep information accurate but do not warrant that it is complete or error-free.",
    "Distributor: We are an independent authorized distributor. Brand names and trademarks belong to their owners. Prices on this site are set by us, not by the brand."
  ],
  policyTerms: [
    "Agreement: By using this site or placing an order you agree to these terms, the Disclaimer, and our Shipping, Refund and Returns, and Privacy policies.",
    "Eligibility: You must be at least 21 years old and buying for lawful laboratory research. You may not buy for resale to anyone you know or suspect intends human or animal use.",
    "Buyer responsibility: You confirm the products are for research only, and you are responsible for knowing and following all federal, state and local laws that apply to buying, owning, storing, using and disposing of them where you are.",
    "Orders: Submitting a cart is a request, not a completed sale. An order is accepted only when we confirm it with you and receive payment. Prices, stock and product offerings may change without notice, and obvious pricing errors may be corrected before we accept an order.",
    "Right to refuse: We may refuse or cancel any order, at any time and without explanation, including where anything suggests human or animal use, possible illegality, or a buyer we cannot verify. Any payment received for a cancelled order is refunded.",
    "No warranty: Products are provided as is, without any warranty, express or implied, including any warranty of merchantability or fitness for a particular purpose, except where the law does not allow this to be excluded.",
    "Limitation of liability: To the fullest extent allowed by law, we are not liable for any injury, loss or damage arising from misuse of any product, from use contrary to these terms, or from reliance on information on this site. Our total liability for any order is limited to the amount paid for it.",
    "Indemnity: You agree to hold us harmless from any claim, loss or expense arising from your purchase, handling or use of products, or from your breach of these terms.",
    "Changes: We may update these terms at any time. The version posted when you place an order applies to that order."
  ],
  policyReturns: [
    "Research products: Because of their nature and to protect product integrity, opened, used or improperly stored products cannot be returned or refunded.",
    "Problems with an order: If an item arrives damaged, missing or different from what you ordered, contact us within 48 hours of delivery with your order number and photos of the package and vials. We will replace the item or refund it once we confirm the problem.",
    "Unopened items: Unopened, sealed items in their original condition may be returned within 14 days of delivery with our approval first. Contact us before sending anything back; returns sent without approval may not be accepted. Return shipping is paid by the buyer unless the error was ours.",
    "Refunds: Approved refunds are sent back by the same method used to pay, normally within 5 business days of approval. Original shipping charges are not refunded unless the error was ours.",
    "Cancellations: You may cancel an order any time before it ships. Once it ships, the returns rules above apply."
  ],
  policyShipping: [
    "Where we ship: We ship within the United States only. We may decline to ship to any address or region where we believe the products may not be legally received.",
    "Processing: Orders ship after payment is received and confirmed, usually within 1 to 3 business days. Orders are not processed on weekends or holidays.",
    "Rates and tracking: Shipping options and costs are shown at checkout and confirmed with your order. A tracking number is added to your order when it ships; check it any time under Check an order.",
    "Address: You are responsible for giving a correct, complete address. We are not responsible for packages delivered to an incorrect address you supplied. Address changes are only possible before the order ships.",
    "Risk of loss: Risk of loss passes to you once the package is handed to the carrier. We are not responsible for carrier delays, weather or other events outside our control, but we will help you file a claim with the carrier for a lost package.",
    "Storage on arrival: Products ship in lyophilized (freeze-dried) form unless stated otherwise. Store them as directed as soon as they arrive."
  ],
  policyPrivacy: [
    "What we collect: When you order we collect your name, email, phone number (optional), shipping address and order details. We do not collect or store card numbers on this site.",
    "How we use it: Only to process, ship and support your orders, contact you about them, and keep records the law requires.",
    "Sharing: We share your details only with the carrier that delivers your order and with service providers who host this site, or where the law requires it. We do not sell or rent your information.",
    "On your device: The site remembers your cart, your checkout details and your age confirmation in your own browser so you don't retype them. Clearing your browser data removes them.",
    "Security and retention: Your details are stored on secured servers and kept only as long as needed for orders, support and legal records.",
    "Your choices: Contact us to see, correct or delete the personal information we hold about you, except records we must keep by law."
  ]
};

const CATEGORY = {
  "Tirzepatide": "Metabolic research", "Retatrutide": "Metabolic research", "MOTS-C": "Metabolic research",
  "BPC-157": "Tissue repair research", "BPC-157 + TB-500": "Tissue repair research",
  "Tesamorelin": "Growth hormone research", "Ipamorelin": "Growth hormone research",
  "Epithalon": "Longevity research"
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
      await q("insert into products(name, strength, category, sort) values ($1,$2,$3,$4)", [r.product, r.strength, CATEGORY[r.product] || "Research peptide", i++]);
    }
  }
  const { rows: [{ n: sc }] } = await q("select count(*)::int n from shipping_methods");
  if (sc === 0) {
    await q("insert into shipping_methods(name, detail, price_cents, active, sort) values ('Standard shipping', 'Ships in 1 to 3 business days', 0, false, 0)");
  }
  // Give products a code from their lab report's Sample line when it is a code like RT30 (only fills blanks).
  await q(`update products p set sku = upper(r.sample) from reports r
    where p.sku = '' and lower(p.name) = lower(r.product)
      and regexp_replace(lower(p.strength), '[^0-9.]', '', 'g') = regexp_replace(lower(r.strength), '[^0-9.]', '', 'g')
      and r.sample ~* '^[a-z]{1,5}[0-9]{1,4}$'`);
  await q("delete from sessions where expires < now()");
  await q("delete from customer_sessions where expires < now()");
}

async function getSettings() {
  const { rows } = await q("select key, value from settings");
  const out = { ...DEFAULT_SETTINGS };
  rows.forEach((r) => { out[r.key] = r.value; });
  return out;
}

module.exports = { pool, q, init, getSettings, DEFAULT_SETTINGS };
