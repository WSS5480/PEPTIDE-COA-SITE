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
create table if not exists documents (
  id serial primary key,
  product_id int references products(id) on delete cascade,
  title text not null,
  kind text not null default 'Other',
  file_name text not null default '',
  file_type text not null,
  file bytea not null,
  size int not null default 0,
  public boolean not null default true,
  sort int not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists documents_product_idx on documents(product_id);
alter table users drop constraint if exists users_role_check;
alter table users add constraint users_role_check check (role in ('owner','staff','rep'));
alter table users add column if not exists phone text not null default '';
alter table users add column if not exists commission_rate numeric(5,2) not null default 0;
alter table users add column if not exists apps jsonb not null default '{"store": true}';
alter table users add column if not exists pin_hash text;
alter table users add column if not exists pin_version int not null default 0;
create table if not exists commission_payouts (
  id serial primary key,
  rep_id int references users(id) on delete set null,
  amount_cents int not null,
  orders int not null default 0,
  note text not null default '',
  who text not null default '',
  paid_at timestamptz not null default now()
);
alter table customers add column if not exists access_pin_key text unique;
alter table customers add column if not exists pin_version int not null default 0;
alter table customers add column if not exists pin_set_at timestamptz;
alter table customers add column if not exists pin_used_at timestamptz;
alter table products add column if not exists reorder_point int;
alter table products add column if not exists image bytea;
alter table products add column if not exists image_type text;
alter table products add column if not exists logo bytea;
alter table products add column if not exists logo_type text;
alter table products add column if not exists vial_label text not null default '';
alter table products add column if not exists media_v int not null default 0;
alter table products add column if not exists cost_cents int;
create table if not exists stock_moves (
  id serial primary key,
  product_id int not null references products(id) on delete cascade,
  at timestamptz not null default now(),
  change int not null,
  balance int,
  reason text not null,
  ref text not null default '',
  lot text not null default '',
  expires date,
  cost_cents int,
  supplier text not null default '',
  note text not null default '',
  who text not null default ''
);
create index if not exists stock_moves_product_idx on stock_moves(product_id, at desc);
create index if not exists stock_moves_expiry_idx on stock_moves(expires) where expires is not null;
-- physical counts (the weekly reconciliation): one row per posted count sheet, one line per product counted
create table if not exists stock_counts (
  id serial primary key,
  at timestamptz not null default now(),
  who text not null default '',
  note text not null default '',
  lines int not null default 0,
  varied int not null default 0,
  units_over int not null default 0,
  units_short int not null default 0,
  value_cents int not null default 0
);
create table if not exists stock_count_lines (
  id serial primary key,
  count_id int not null references stock_counts(id) on delete cascade,
  product_id int not null references products(id) on delete cascade,
  expected int,
  counted int not null,
  variance int,
  cost_cents int
);
create index if not exists stock_count_lines_idx on stock_count_lines(count_id);
alter table stock_moves add column if not exists count_id int;
alter table products add column if not exists manufacturer text not null default '';
alter table products add column if not exists show_code boolean not null default false;
alter table orders add column if not exists customer_id int references customers(id) on delete set null;
alter table customers add column if not exists rep_id int references users(id) on delete set null;
alter table orders add column if not exists rep_id int references users(id) on delete set null;
alter table orders add column if not exists commission_rate numeric(5,2);
alter table orders add column if not exists payout_id int references commission_payouts(id) on delete set null;
alter table orders add column if not exists placed_by text not null default '';
alter table orders add column if not exists fulfillment text not null default 'ship';
alter table orders add column if not exists pay_method text not null default 'request';
alter table orders add column if not exists stripe_session text;
alter table orders add column if not exists stripe_pi text;
alter table orders add column if not exists paid_cents int;
alter table orders add column if not exists discount_code text not null default '';
-- a customer may have no email (phone-only clinic contact): it is only needed for emails and password sign-in
alter table customers alter column email drop not null;
-- customer pricing: a markup % over our cost that replaces the store price for that customer (null = store prices)
alter table customers add column if not exists markup numeric(6,2);
alter table orders add column if not exists price_markup numeric(6,2);
-- visitors without a PIN can ask for one; the office turns a request into a customer + PIN
create table if not exists pin_requests (
  id serial primary key,
  name text not null,
  company text not null default '',
  email text not null default '',
  phone text not null default '',
  note text not null default '',
  status text not null default 'new',
  customer_id int references customers(id) on delete set null,
  created_at timestamptz not null default now()
);
-- discount codes customers type at checkout; made in admin
create table if not exists discount_codes (
  id serial primary key,
  code text unique not null,
  kind text not null default 'percent',
  value int not null default 0,
  min_subtotal_cents int not null default 0,
  max_uses int,
  used int not null default 0,
  expires date,
  active boolean not null default true,
  note text not null default '',
  created_at timestamptz not null default now()
);
create index if not exists orders_rep_idx on orders(rep_id);
create index if not exists orders_customer_idx on orders(customer_id);
create index if not exists orders_status_idx on orders(status);
create index if not exists orders_created_idx on orders(created_at desc);
-- a counter that moves whenever store data changes; pages poll it to know when to refresh
create table if not exists app_state (id int primary key, version bigint not null default 1, at timestamptz not null default now());
insert into app_state(id) values (1) on conflict (id) do nothing;
create or replace function bump_app_version() returns trigger language plpgsql as $$
begin update app_state set version = version + 1, at = now() where id = 1; return null; end $$;
drop trigger if exists t_bump on orders; create trigger t_bump after insert or update or delete on orders for each statement execute function bump_app_version();
drop trigger if exists t_bump on order_items; create trigger t_bump after insert or update or delete on order_items for each statement execute function bump_app_version();
drop trigger if exists t_bump on order_events; create trigger t_bump after insert or update or delete on order_events for each statement execute function bump_app_version();
drop trigger if exists t_bump on products; create trigger t_bump after insert or update or delete on products for each statement execute function bump_app_version();
drop trigger if exists t_bump on customers; create trigger t_bump after insert or update or delete on customers for each statement execute function bump_app_version();
drop trigger if exists t_bump on reports; create trigger t_bump after insert or update or delete on reports for each statement execute function bump_app_version();
drop trigger if exists t_bump on documents; create trigger t_bump after insert or update or delete on documents for each statement execute function bump_app_version();
drop trigger if exists t_bump on shipping_methods; create trigger t_bump after insert or update or delete on shipping_methods for each statement execute function bump_app_version();
drop trigger if exists t_bump on stock_moves; create trigger t_bump after insert or update or delete on stock_moves for each statement execute function bump_app_version();
drop trigger if exists t_bump on stock_counts; create trigger t_bump after insert or update or delete on stock_counts for each statement execute function bump_app_version();
drop trigger if exists t_bump on commission_payouts; create trigger t_bump after insert or update or delete on commission_payouts for each statement execute function bump_app_version();
drop trigger if exists t_bump on users; create trigger t_bump after insert or update or delete on users for each statement execute function bump_app_version();
drop trigger if exists t_bump on settings; create trigger t_bump after insert or update or delete on settings for each statement execute function bump_app_version();
drop trigger if exists t_bump on discount_codes; create trigger t_bump after insert or update or delete on discount_codes for each statement execute function bump_app_version();
drop trigger if exists t_bump on pin_requests; create trigger t_bump after insert or update or delete on pin_requests for each statement execute function bump_app_version();
`;

const DEFAULT_SETTINGS = {
  brand: "360 Medical Peptides",
  tagline: "",
  distributorOf: "XINT",
  brandUrl: "https://xintpeptides.com/",
  contact: "",
  announcement: "",
  announcementOn: false,
  pinOn: false,
  // Page setup: the feature cards under the home page header
  perksOn: true,
  perks: [
    { icon: "flask", title: "Independently tested", text: "Products are tested by an outside laboratory." },
    { icon: "doc", title: "Lab reports online", text: "Open a product's lab report right from its listing." },
    { icon: "key", title: "Easy to verify", text: "Check a report with the testing lab directly." },
    { icon: "truck", title: "Tracked shipping", text: "Every order ships with a tracking number." }
  ],
  // Page setup: how the drawn product vial looks
  vial: { shape: "photo", cap: "#0f1b33", band: "#c9d1dc", glass: "#ffffff", label: "#0b4d96", text: "#ffffff", sub: "#cfdcf0", liquid: "#e9f1fb", labelShows: "name", photoName: "#0f1b33", photoMg: "#0097b2", photoTint: false },
  vialPhotoV: 1,  // 1 = the bundled vial photo; uploads bump it
  vialLogoV: 1,   // 1 = the bundled brand mark; uploads bump it
  siteLogoV: 1,   // header logo: 1 = bundled brand logo, 0 = show the store name as text
  bannerScroll: true,
  heroEyebrow: "Third-party tested",
  headline: "Research peptides with the lab report on every vial",
  storeOpen: true,
  pricesRequireLogin: true,   // prices (and the cart) show only once a customer signs in with their PIN
  minAge: 21,
  ageGate: true,
  minOrderCents: 0,
  // Shipping & delivery: customers choose one at checkout. Shipping is charged, local delivery is free.
  shippingOn: true,
  shippingLabel: "FedEx shipping",
  shippingNote: "Ships in 1 to 3 business days",
  shippingCents: 1500,
  shippingFreeOverCents: 0,   // 0 = never free
  deliveryOn: true,
  deliveryLabel: "Local delivery",
  deliveryNote: "Free. We'll contact you to set a time.",
  fedexAccount: "",           // your FedEx account number (staff see it on orders; never shown to customers)
  // Payments: card payments run through Stripe once STRIPE_SECRET_KEY is set on the host
  cardPayments: false,
  // Order emails
  orderEmail: "orders@360medical.net",
  cooEmail: "", // the case tracker's approval emails go here (managed from this admin)
  orderEmailOn: true,
  customerEmailOn: true,
  // The account the store sends from (set under Site settings → Order emails). mailMode "" = use the host's settings, if any.
  mailMode: "",            // "" | "smtp" | "resend"
  mailHost: "smtp.office365.com",
  mailPort: 587,
  mailUser: "",            // login email
  mailPass: "",            // never sent to the browser
  mailFrom: "",            // e.g. 360 Medical Peptides <noreply@360medical.net>; blank = the login address
  resendKey: "",           // never sent to the browser
  graphTenant: "",         // Microsoft 365 app (Graph): Directory (tenant) ID
  graphClient: "",         // Application (client) ID
  graphSecret: "",         // client secret; never sent to the browser
  priceNote: "Prices in US dollars, per vial.",
  paymentInstructions: "We'll review your order and reach out with the total and payment options. Your order ships once payment is received.",
  intro: "Many of our products come with an independent lab report. Open one to see the results, then check it on the lab's own site with the key printed on it.",
  // Short notice in the footer of every page (one paragraph per line).
  footerNotice: [
    "Every product on this site is sold for laboratory research and development only. Statements on this site have not been evaluated by the U.S. Food and Drug Administration, and no product or statement here is intended to diagnose, treat, cure or prevent any disease.",
    "We supply research chemicals. We are not a compounding pharmacy or chemical compounding facility under Section 503A of the Federal Food, Drug, and Cosmetic Act, and not an outsourcing facility under Section 503B of that Act."
  ],
  // Full policy pages. One paragraph per line; "Heading: text" shows the heading in bold.
  disclaimers: [
    "Research use only: All products are sold strictly for in vitro research, laboratory and analytical use.",
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
    "Eligibility: You must be at least 21 years old and buying for lawful laboratory research.",
    "Buyer responsibility: You confirm the products are for research only, and you are responsible for knowing and following all federal, state and local laws that apply to buying, owning, storing, using and disposing of them where you are.",
    "Orders: Submitting a cart is a request, not a completed sale. An order is accepted only when we confirm it with you and receive payment. Prices, stock and product offerings may change without notice, and obvious pricing errors may be corrected before we accept an order.",
    "Right to refuse: We may refuse or cancel any order, at any time and without explanation, including where anything suggests possible illegality or a buyer we cannot verify. Any payment received for a cancelled order is refunded.",
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
  // Starter COAs and products are loaded once, on the very first start. After that, an empty
  // catalog stays empty (the owner can clear everything and rebuild by CSV or by hand).
  const { rows: [seeded] } = await q("select 1 from settings where key = 'catalogSeeded'");
  const { rows: [{ n: rc }] } = await q("select count(*)::int n from reports");
  const { rows: [{ n: pc0 }] } = await q("select count(*)::int n from products");
  const firstRun = !seeded && rc === 0 && pc0 === 0;
  await q("insert into settings(key, value) values ('catalogSeeded', 'true') on conflict (key) do nothing");
  // one-time: take "not for human / animal use" wording out of the saved disclaimer and policy texts
  const { rows: [hs] } = await q("select 1 from settings where key = 'humanUseScrubbed'");
  if (!hs) {
    const BAD = /not for human|human (or|and) (animal|veterinary)|human (use|consumption)|given to animals|animal use/i;
    const scrub = (t) => {
      let x = String(t)
        .replace(/\s*and (is|are) not for human or animal (consumption|use)( of any kind)?/gi, "")
        .replace(/\s*They are not for human or veterinary use and must not be consumed[^.]*\./gi, "")
        .replace(/\s*You may not buy for resale to anyone you know or suspect intends human or animal use\./gi, "")
        .replace(/including where anything suggests human or animal use, possible illegality, or a buyer we cannot verify/gi, "including where anything suggests possible illegality or a buyer we cannot verify");
      if (BAD.test(x)) x = x.split(/(?<=[.!?])\s+/).filter((sentence) => !BAD.test(sentence)).join(" "); // drop any sentence still mentioning it
      return x.replace(/\s{2,}/g, " ").trim();
    };
    const { rows: texts } = await q("select key, value from settings where key in ('footerNotice','disclaimers','policyTerms','policyReturns','policyShipping','policyPrivacy','intro','paymentInstructions','headline','heroEyebrow','priceNote','perks')");
    for (const r of texts) {
      let v = r.value, changed = false;
      if (typeof v === "string") { const n = scrub(v); changed = n !== v; v = n; }
      else if (Array.isArray(v)) {
        const n = v.map((item) => typeof item === "string" ? scrub(item) : item && typeof item === "object" ? { ...item, title: scrub(item.title || ""), text: scrub(item.text || "") } : item)
          .filter((item) => typeof item !== "string" || !/^[^:]{2,40}:\s*$/.test(item)); // a heading left with no text is dropped
        changed = JSON.stringify(n) !== JSON.stringify(v); v = n;
      }
      if (changed) await q("update settings set value = $1 where key = $2", [JSON.stringify(v), r.key]);
    }
    await q("insert into settings(key, value) values ('humanUseScrubbed', 'true') on conflict (key) do nothing");
  }
  // one-time: stores set up with the drawn vial switch to the real vial photo
  const { rows: [vp] } = await q("select 1 from settings where key = 'vialPhotoSeeded'");
  if (!vp) {
    await q(`update settings set value = jsonb_set(value, '{shape}', '"photo"') where key = 'vial' and value->>'shape' = 'vial'`);
    await q("insert into settings(key, value) values ('vialPhotoSeeded', 'true') on conflict (key) do nothing");
  }
  // one-time: stores set up before the brand logo existed start showing it on vials
  const { rows: [vl] } = await q("select 1 from settings where key = 'vialLogoSeeded'");
  if (!vl) {
    await q("update settings set value = '1' where key = 'vialLogoV' and value::text = '0' and not exists (select 1 from settings where key = 'vialLogo')");
    await q("insert into settings(key, value) values ('vialLogoSeeded', 'true') on conflict (key) do nothing");
  }
  // one-time rename: a store still on the old default name becomes 360 Medical Peptides
  const { rows: [renamed] } = await q("select 1 from settings where key = 'brandRenamed360'");
  if (!renamed) {
    await q(`update settings set value = '"360 Medical Peptides"' where key = 'brand' and value::text in ('""', '"Research Peptides"')`);
    await q("insert into settings(key, value) values ('brandRenamed360', 'true') on conflict (key) do nothing");
  }
  if (firstRun) {
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
  if (firstRun) {
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
  // Product codes were removed from the store (Oct 2026): clear any saved ones once.
  const { rows: [codesGone] } = await q("select 1 from settings where key = 'codesRemoved'");
  if (!codesGone) {
    await q("update products set sku = '', show_code = false where sku <> '' or show_code");
    await q("delete from settings where key = 'productLabel'");
    await q(`update settings set value = jsonb_set(value, '{labelShows}', '"name"') where key = 'vial'`);
    await q("insert into settings(key, value) values ('codesRemoved', 'true') on conflict (key) do nothing");
  }
  // The bundled logo now reads "360 PEPTIDES" (Oct 2026): bump its version once so browsers fetch the new file.
  const { rows: [logoV2] } = await q("select 1 from settings where key = 'logoPeptides'");
  if (!logoV2) {
    await q("update settings set value = '2' where key = 'siteLogoV' and value = '1'");
    await q("insert into settings(key, value) values ('logoPeptides', 'true') on conflict (key) do nothing");
  }
  // Shipping moved from the old shipping-options table to Site settings (Oct 2026): carry over a charge set there once.
  const { rows: [shipMoved] } = await q("select 1 from settings where key = 'shippingMoved'");
  if (!shipMoved) {
    const { rows: [m] } = await q("select price_cents, free_over_cents from shipping_methods where active and price_cents > 0 order by price_cents limit 1");
    if (m) {
      await q("update settings set value = $1 where key = 'shippingCents'", [JSON.stringify(m.price_cents)]);
      if (m.free_over_cents) await q("update settings set value = $1 where key = 'shippingFreeOverCents'", [JSON.stringify(m.free_over_cents)]);
    }
    await q("insert into settings(key, value) values ('shippingMoved', 'true') on conflict (key) do nothing");
  }
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
