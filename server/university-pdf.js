/* 360 University → PDF. A course (lessons, diagrams, uploaded pictures, the question bank) laid out on Letter pages with pdfkit.
   Admins get the answer key at the back; reps get the same book without it. Pure JS (no browser needed on the host). */
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const PDFDocument = require("pdfkit");
const SVGtoPDF = require("svg-to-pdfkit");

const FONT = path.join(__dirname, "fonts", "DejaVuSans.ttf"), FONT_B = path.join(__dirname, "fonts", "DejaVuSans-Bold.ttf");
const NAVY = "#0f1b33", BLUE = "#0b4d96", INK = "#121c2f", INK2 = "#5d6879", LINE = "#d9e0e8", WASH = "#e9f1fb";

// the lesson diagrams are drawn by public/uni-render.js (browser code); run it once here with a stand-in window to get the SVG
let diagrams = null, organs = [];
function loadDiagrams() {
  if (diagrams) return diagrams;
  try {
    const src = fs.readFileSync(path.join(__dirname, "..", "public", "uni-render.js"), "utf8");
    const el = () => ({ appendChild() {}, textContent: "", style: {} });
    const sandbox = { window: {}, document: { addEventListener() {}, createElement: el, head: el() } };
    vm.runInNewContext(src, sandbox);
    diagrams = sandbox.window.UniRender.diagrams || {}; organs = sandbox.window.UniRender.organs || [];
  } catch (e) { console.error("University PDF: diagrams unavailable:", e.message); diagrams = {}; }
  return diagrams;
}
const svgOf = (html) => { const m = /<svg[\s\S]*?<\/svg>/.exec(html || ""); return m ? m[0].replace(/<title>[\s\S]*?<\/title>/g, "") : ""; };
const captionOf = (html) => { const m = /<figcaption[^>]*>([\s\S]*?)<\/figcaption>/.exec(html || ""); return m ? m[1].replace(/<[^>]+>/g, "").replace(/&amp;/g, "&") : ""; };
const strip = (s) => String(s || "").replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}]/gu, "").trim(); // emoji don't exist in the PDF font

// "a **bold** word" → [{ t, b }]
function parts(s) {
  const out = []; const re = /\*\*(.+?)\*\*/g; let i = 0, m;
  while ((m = re.exec(s))) { if (m.index > i) out.push({ t: s.slice(i, m.index), b: false }); out.push({ t: m[1], b: true }); i = m.index + m[0].length; }
  if (i < s.length) out.push({ t: s.slice(i), b: false });
  return out.length ? out : [{ t: s, b: false }];
}

// lesson text → blocks, the same rules as the app (uni-render.js)
function blocks(body) {
  const out = []; let list = null, terms = null, para = [];
  const flush = () => { if (para.length) { out.push({ k: "p", t: para.join(" ") }); para = []; } if (list) { out.push({ k: "ul", items: list }); list = null; } if (terms) { out.push({ k: "dl", items: terms }); terms = null; } };
  String(body || "").split("\n").forEach((raw) => {
    const line = raw.trim(); let m;
    if (!line) { flush(); return; }
    if ((m = /^##\s+(.+)/.exec(line))) { flush(); out.push({ k: "h", t: m[1] }); return; }
    if ((m = /^\[diagram:(\w+)\]$/.exec(line))) { flush(); out.push({ k: "diagram", name: m[1] }); return; }
    if ((m = /^\[img:(u[0-9a-f]+)\]$/.exec(line))) { flush(); out.push({ k: "img", id: m[1] }); return; }
    if ((m = /^\[file:(u[0-9a-f]+)(?:\s+(.+))?\]$/.exec(line))) { flush(); out.push({ k: "file", t: m[2] || "Document" }); return; }
    if ((m = /^!\s*(.+)/.exec(line))) { flush(); out.push({ k: "note", t: m[1] }); return; }
    if ((m = /^[-•*]\s+(.+)/.exec(line))) { if (para.length || terms) { const l = list; list = null; flush(); list = l; } (list = list || []).push(m[1]); return; }
    if ((m = /^(.{1,80}?)\s+::\s+(.+)$/.exec(line))) { if (para.length || list) { const t = terms; terms = null; flush(); terms = t; } (terms = terms || []).push([m[1], m[2]]); return; }
    if (list || terms) flush();
    para.push(line);
  });
  flush();
  return out;
}

/* course: { title, blurb, icon, audience, minutes, pass_pct, test_count, max_attempts, lessons:[{title, body}], questions:[{q, options, correct, why, lesson, active}] }
   opts: { answers: bool, brand, who, images: async (id) => Buffer|null, audienceLabel } → Promise<Buffer> */
async function coursePdf(course, opts = {}) {
  const doc = new PDFDocument({ size: "LETTER", margins: { top: 60, bottom: 64, left: 58, right: 58 }, bufferPages: true, info: { Title: `360 University · ${course.title}`, Author: opts.brand || "360 Peptides" } });
  const chunks = []; doc.on("data", (c) => chunks.push(c));
  const done = new Promise((resolve, reject) => { doc.on("end", () => resolve(Buffer.concat(chunks))); doc.on("error", reject); });
  doc.registerFont("Body", FONT); doc.registerFont("Bold", FONT_B);
  const W = doc.page.width - doc.page.margins.left - doc.page.margins.right, L = doc.page.margins.left;
  const bottom = () => doc.page.height - doc.page.margins.bottom;
  const need = (h) => { if (doc.y + h > bottom()) doc.addPage(); };
  const rich = (text, size, color, x, width, extra = {}) => { // inline **bold**
    const ps = parts(text); doc.fontSize(size).fillColor(color);
    ps.forEach((p, i) => doc.font(p.b ? "Bold" : "Body").text(p.t, i === 0 ? x : undefined, i === 0 ? undefined : undefined, { width, continued: i < ps.length - 1, lineGap: 2, ...extra }));
  };
  const plain = (s) => String(s).replace(/\*\*(.+?)\*\*/g, "$1");

  /* cover */
  doc.rect(0, 0, doc.page.width, 150).fill(NAVY);
  doc.font("Bold").fontSize(11).fillColor("#9fc6ee").text("360 UNIVERSITY", L, 46, { characterSpacing: 2 });
  doc.font("Bold").fontSize(26).fillColor("#fff").text(strip(course.title), L, 66, { width: W });
  doc.y = 176;
  if (course.blurb) { doc.font("Body").fontSize(12.5).fillColor(INK).text(strip(course.blurb), L, doc.y, { width: W, lineGap: 3 }); doc.moveDown(0.6); }
  const active = (course.questions || []).filter((x) => x.active !== false);
  const facts = [
    [`${(course.lessons || []).length} lesson${(course.lessons || []).length === 1 ? "" : "s"}`, `about ${course.minutes || 15} minutes`],
    [`Test`, `${Math.min(course.test_count || active.length, active.length)} questions drawn from ${active.length} · pass at ${course.pass_pct || 80}% · ${course.max_attempts || 2} tries, then it locks for an admin`],
    [`For`, opts.audienceLabel || course.audience || ""],
    [`Copy`, opts.answers ? "Admin review copy — answer key at the back" : "Rep copy — no answer key"],
    [`Printed`, new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "America/Chicago" })]
  ].filter((f) => f[1]);
  facts.forEach(([k, v]) => { const y = doc.y; doc.font("Bold").fontSize(9.5).fillColor(INK2).text(k.toUpperCase(), L, y + 1, { width: 70, characterSpacing: 1 }); doc.font("Body").fontSize(11).fillColor(INK).text(v, L + 76, y, { width: W - 76, lineGap: 2 }); doc.y += 4; });
  doc.moveDown(0.8);
  doc.font("Bold").fontSize(13).fillColor(NAVY).text("In this course", L, doc.y); doc.moveDown(0.3);
  (course.lessons || []).forEach((l, i) => { doc.font("Body").fontSize(11.5).fillColor(INK).text(`${i + 1}.  ${strip(l.title)}`, L + 6, doc.y, { width: W - 6, lineGap: 2 }); });
  doc.font("Body").fontSize(11.5).fillColor(INK).text(`${(course.lessons || []).length + 1}.  Knowledge check`, L + 6, doc.y, { width: W - 6, lineGap: 2 });

  /* lessons */
  const dg = loadDiagrams();
  for (const [i, lesson] of (course.lessons || []).entries()) {
    doc.addPage();
    doc.font("Bold").fontSize(10).fillColor(BLUE).text(`LESSON ${i + 1} OF ${course.lessons.length}`, L, doc.y, { characterSpacing: 1.5 });
    doc.font("Bold").fontSize(19).fillColor(NAVY).text(strip(lesson.title), L, doc.y + 2, { width: W });
    doc.moveTo(L, doc.y + 6).lineTo(L + W, doc.y + 6).lineWidth(1).strokeColor(LINE).stroke(); doc.y += 16;
    for (const b of blocks(lesson.body)) {
      if (b.k === "h") { need(40); doc.moveDown(0.5); doc.font("Bold").fontSize(13.5).fillColor(NAVY).text(strip(b.t), L, doc.y, { width: W }); doc.moveDown(0.25); }
      else if (b.k === "p") { need(30); rich(b.t, 11, INK, L, W); doc.moveDown(0.45); }
      else if (b.k === "ul") {
        for (const it of b.items) { need(24); const y = doc.y; doc.circle(L + 7, y + 6.5, 2.2).fill(BLUE); rich(it, 11, INK, L + 18, W - 18); doc.moveDown(0.15); }
        doc.moveDown(0.35);
      } else if (b.k === "dl") {
        for (const [term, mean] of b.items) {
          const h = Math.max(doc.font("Bold").fontSize(11).heightOfString(plain(term), { width: 150 }), doc.font("Body").fontSize(11).heightOfString(plain(mean), { width: W - 170 })) + 12;
          need(h + 4); const y = doc.y;
          doc.roundedRect(L, y, W, h, 6).fillAndStroke("#fff", LINE);
          doc.font("Bold").fontSize(11).fillColor(INK).text(plain(term), L + 10, y + 6, { width: 150 });
          doc.font("Body").fontSize(11).fillColor(INK).text(plain(mean), L + 170, y + 6, { width: W - 180, lineGap: 1 });
          doc.y = y + h + 4;
        }
        doc.moveDown(0.3);
      } else if (b.k === "note") {
        const t = plain(b.t), h = doc.font("Bold").fontSize(11).heightOfString(t, { width: W - 26 }) + 16;
        need(h + 6); const y = doc.y;
        doc.roundedRect(L, y, W, h, 6).fill(WASH); doc.rect(L, y, 4, h).fill(BLUE);
        doc.font("Bold").fontSize(11).fillColor(INK).text(t, L + 16, y + 8, { width: W - 26, lineGap: 1 });
        doc.y = y + h + 8;
      } else if (b.k === "diagram") {
        const html = dg[b.name] ? dg[b.name]() : "", svg = svgOf(html);
        if (!svg) continue;
        const vb = /viewBox="0 0 (\d+) (\d+)"/.exec(svg), vw = vb ? +vb[1] : 320, vh = vb ? +vb[2] : 420;
        const dw = Math.min(W, 340), dh = dw * vh / vw;
        need(dh + 40); const y = doc.y, x = L + (W - dw) / 2;
        doc.roundedRect(x - 8, y - 6, dw + 16, dh + 12, 10).fillAndStroke("#fff", LINE);
        try { SVGtoPDF(doc, svg, x, y, { width: dw, height: dh, assumePt: true, fontCallback: (family, bold) => (bold ? "Bold" : "Body") }); } catch (e) { console.error("University PDF: diagram failed:", e.message); }
        doc.y = y + dh + 12;
        const cap = captionOf(html).replace(/^Tap an organ[^.]*\.\s*/, "");
        if (cap) doc.font("Body").fontSize(9.5).fillColor(INK2).text(cap, L, doc.y, { width: W, align: "center" });
        if (b.name === "torso" && organs.length) { // on screen you tap an organ for its name; on paper, list them
          doc.moveDown(0.4); doc.font("Bold").fontSize(10.5).fillColor(NAVY).text("Where each organ sits", L, doc.y);
          const col = (W - 10) / 2, startY = doc.y + 4; let yy = startY, c = 0;
          organs.forEach(([n, where, , fill], k) => {
            if (k === Math.ceil(organs.length / 2)) { c = 1; yy = startY; }
            const x0 = L + c * (col + 10);
            doc.circle(x0 + 5, yy + 6, 4).fill(fill);
            doc.font("Bold").fontSize(9.5).fillColor(INK).text(n, x0 + 14, yy, { width: col - 14, continued: true }).font("Body").fillColor(INK2).text(` — ${where}`);
            yy = Math.max(yy + 14, doc.y);
          });
          doc.y = Math.max(yy, doc.y) + 4;
        }
        doc.moveDown(0.5);
      } else if (b.k === "img") {
        const buf = opts.images ? await opts.images(b.id).catch(() => null) : null;
        if (!buf) continue;
        try { const img = doc.openImage(buf); const dw = Math.min(W, img.width * 0.75), dh = dw * img.height / img.width; need(Math.min(dh, 600) + 20); doc.image(buf, L + (W - dw) / 2, doc.y, { width: dw }); doc.y += dh + 10; }
        catch (e) { doc.font("Body").fontSize(10).fillColor(INK2).text("[picture: open the lesson in the app to see it]", L, doc.y); doc.moveDown(0.5); }
      } else if (b.k === "file") { need(20); doc.font("Body").fontSize(10.5).fillColor(INK2).text(`Attached document: ${strip(b.t)} (open it from the lesson in the app)`, L, doc.y, { width: W }); doc.moveDown(0.5); }
    }
  }

  /* the knowledge check */
  doc.addPage();
  doc.font("Bold").fontSize(10).fillColor(BLUE).text("KNOWLEDGE CHECK", L, doc.y, { characterSpacing: 1.5 });
  doc.font("Bold").fontSize(19).fillColor(NAVY).text(strip(course.title), L, doc.y + 2, { width: W });
  doc.font("Body").fontSize(10.5).fillColor(INK2).text(`The app gives each rep ${Math.min(course.test_count || active.length, active.length)} of these ${active.length} questions in a random order. Pass mark ${course.pass_pct || 80}%; ${course.max_attempts || 2} tries, then an admin unlocks the course.`, L, doc.y + 6, { width: W, lineGap: 2 });
  doc.moveDown(0.8);
  const letters = "ABCDEF";
  active.forEach((x, n) => {
    const opts_ = Array.isArray(x.options) ? x.options : [];
    const h = doc.font("Bold").fontSize(11).heightOfString(`${n + 1}. ${x.q}`, { width: W }) + opts_.reduce((t, o) => t + doc.font("Body").fontSize(10.5).heightOfString(`A.  ${o}`, { width: W - 20 }) + 3, 0) + 14;
    need(Math.min(h, 400));
    doc.font("Bold").fontSize(11).fillColor(INK).text(`${n + 1}. ${strip(x.q)}`, L, doc.y, { width: W, lineGap: 2 });
    opts_.forEach((o, k) => { doc.font("Body").fontSize(10.5).fillColor(INK).text(`${letters[k]}.  ${strip(o)}`, L + 20, doc.y + 1, { width: W - 20, lineGap: 1 }); });
    if (x.lesson !== null && x.lesson !== undefined && course.lessons[x.lesson]) doc.font("Body").fontSize(8.5).fillColor(INK2).text(`From lesson ${Number(x.lesson) + 1}: ${strip(course.lessons[x.lesson].title)}`, L + 20, doc.y + 1);
    doc.moveDown(0.7);
  });

  /* answer key (admins) */
  if (opts.answers && active.length) {
    doc.addPage();
    doc.font("Bold").fontSize(10).fillColor(BLUE).text("ANSWER KEY · ADMIN COPY", L, doc.y, { characterSpacing: 1.5 });
    doc.font("Bold").fontSize(19).fillColor(NAVY).text(strip(course.title), L, doc.y + 2, { width: W }); doc.moveDown(0.6);
    active.forEach((x, n) => {
      const opts_ = Array.isArray(x.options) ? x.options : [], c = Number(x.correct);
      const t = `${n + 1}.  ${letters[c] || "?"} — ${strip(opts_[c] || "")}`;
      const h = doc.font("Bold").fontSize(10.5).heightOfString(t, { width: W }) + (x.why ? doc.font("Body").fontSize(10).heightOfString(x.why, { width: W - 24 }) : 0) + 10;
      need(h);
      doc.font("Bold").fontSize(10.5).fillColor(INK).text(t, L, doc.y, { width: W });
      if (x.why) doc.font("Body").fontSize(10).fillColor(INK2).text(strip(x.why), L + 24, doc.y + 1, { width: W - 24, lineGap: 1 });
      doc.moveDown(0.5);
    });
  }

  /* footer on every page */
  const range = doc.bufferedPageRange();
  for (let i = range.start; i < range.start + range.count; i++) {
    doc.switchToPage(i); doc.page.margins.bottom = 0; // the footer sits inside the bottom margin
    doc.font("Body").fontSize(8.5).fillColor(INK2);
    const yy = doc.page.height - 40;
    doc.text(`${opts.brand || "360 Peptides"} · 360 University · ${strip(course.title)}${opts.answers ? " · admin copy" : ""}`, L, yy, { width: W - 80, lineBreak: false });
    doc.text(`Page ${i - range.start + 1} of ${range.count}`, L + W - 80, yy, { width: 80, align: "right", lineBreak: false });
  }
  doc.end();
  return done;
}

module.exports = { coursePdf };
