/* Reads a lab report (PDF or image) and pulls out the fields the Lab reports form wants.
   PDF: the text layer. JPG/PNG: OCR (tesseract, English data shipped in server/tessdata so nothing is downloaded at runtime).
   Everything is "best effort": the form shows what was found and the person checks it against the document. */
"use strict";
const path = require("path");
let ocrWorker = null;
async function worker() {
  const { createWorker } = require("tesseract.js");
  if (!ocrWorker) ocrWorker = await createWorker("eng", 1, { langPath: path.join(__dirname, "tessdata"), gzip: true, cachePath: path.join(__dirname, "tessdata"), logger: () => {} });
  return ocrWorker;
}
// two passes: the whole page, then the results table on its own (cropped between "Results" and "Comments", enlarged, as one block) —
// the small bordered table is what the page-level pass gets wrong
async function ocr(buf) {
  const { PSM } = require("tesseract.js");
  const w = await worker();
  await w.setParameters({ tessedit_pageseg_mode: PSM.AUTO });
  const { data } = await w.recognize(buf);
  let text = data.text || "", results = null;
  try {
    const sharp = require("sharp");
    const words = data.words || [], find = (s) => words.find((x) => x.text.toLowerCase().startsWith(s));
    const r = find("results"), c = find("comments") || find("analysis");
    if (r && c && c.bbox.y0 > r.bbox.y1 + 20) {
      const meta = await sharp(buf).metadata();
      const top = r.bbox.y1 + Math.round(meta.height * 0.018), height = Math.min(c.bbox.y0 - top - 4, meta.height - top), mid = Math.round(meta.width / 2);
      const cols = [];
      for (const [left, width] of [[Math.round(meta.width * 0.09), mid - Math.round(meta.width * 0.1)], [mid + 4, Math.round(meta.width * 0.9) - mid - 4]]) {
        // each column on its own, enlarged, with the green table borders thresholded away (text is black, the borders are mid-grey)
        const crop = await sharp(buf).extract({ left, top, width, height }).resize({ width: width * 3 }).grayscale().threshold(100).png().toBuffer();
        await w.setParameters({ tessedit_pageseg_mode: PSM.SINGLE_BLOCK });
        const { data: d2 } = await w.recognize(crop);
        cols.push((d2.text || "").split("\n").map((x) => x.trim()).filter(Boolean));
      }
      results = cols[0].map((name, i) => [name, cols[1][i] || ""]).filter(([n, v]) => n && v);
      if (results.length) text = text.replace(/(results\s*[>:]?[^\n]*\n)([\s\S]*?)(\n\s*(comments|analysis\s*conducted))/i, (m, a, body, cEnd) => a + results.map(([n, v]) => n + "  " + v).join("\n") + "\n" + cEnd);
    }
  } catch (e) { /* no sharp or no table found: the page text is still used */ }
  return text;
}
async function pdfText(buf) {
  const pdfParse = require("pdf-parse");
  const d = await pdfParse(buf);
  return d.text || "";
}
async function extractText(buf, type) {
  if (/pdf/i.test(type) || buf.slice(0, 4).toString() === "%PDF") { const t = await pdfText(buf); if (t.replace(/\s+/g, "").length > 40) return { text: t, how: "pdf text" }; return { text: "", how: "pdf without a text layer" }; }
  return { text: await ocr(buf), how: "ocr" };
}
const MONTHS = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12 };
// "31 JUL '26", "12 AUG 2026", "2026-08-12", "08/12/2026" → 2026-08-12
function isoDate(s) {
  if (!s) return "";
  s = String(s).trim();
  let m = /(\d{1,2})\s*([A-Za-z]{3,4})\.?\s*['’]?\s*(\d{2,4})/.exec(s);
  if (m && MONTHS[m[2].toLowerCase()]) { const y = m[3].length === 2 ? 2000 + +m[3] : +m[3]; return `${y}-${String(MONTHS[m[2].toLowerCase()]).padStart(2, "0")}-${String(+m[1]).padStart(2, "0")}`; }
  m = /(\d{4})-(\d{1,2})-(\d{1,2})/.exec(s); if (m) return `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
  m = /(\d{1,2})\/(\d{1,2})\/(\d{2,4})/.exec(s); if (m) { const y = m[3].length === 2 ? 2000 + +m[3] : +m[3]; return `${y}-${m[1].padStart(2, "0")}-${m[2].padStart(2, "0")}`; }
  return "";
}
const clean = (s) => String(s || "").replace(/[|_]+/g, " ").replace(/\s+/g, " ").trim();
// value printed after a label, on the same line ("Client XINTpeptides") — tolerant of OCR noise around ">" and ":"
function after(text, label) {
  const re = new RegExp(label.replace(/\s+/g, "\\s*") + "\\s*[>:\\-]?\\s*([^\\n]+)", "i");
  const m = re.exec(text); return m ? clean(m[1]) : "";
}
function parseCoa(text) {
  const t = text.replace(/\r/g, "");
  const f = {};
  const task = /task\s*number\s*[>:#]*\s*#?\s*(\d{4,})/i.exec(t); if (task) f.task = task[1];
  f.ordered = isoDate(after(t, "testing ordered")); f.received = isoDate(after(t, "sample received")); f.tested = isoDate(after(t, "analysis conducted"));
  // the four boxed lines: label at the start of a line, and not the "Sample received" / "Sample description" lines
  const line = (label) => { const re = new RegExp("^\\s*" + label + "(?!\\s*(received|description|requested))\\b\\s*[>:\\-]?\\s*(.+)$", "im"); const m = re.exec(t); const v = m ? clean(m[2]) : ""; return /^(testing|sample|analysis|client|manufacturer|batch|results|comments)\b/i.test(v) ? "" : v; };
  f.client = line("client"); f.sample = line("sample"); f.manufacturer = line("manufacturer"); f.batch = line("batch");
  if (/^unknown$/i.test(f.batch)) f.batch = "Unknown";
  // tests requested: the line(s) between "Tests requested" and "Results"
  const tr = /tests\s*requested\s*[>:]?\s*\n?([\s\S]*?)\n\s*results/i.exec(t); if (tr) f.testsRequested = clean(tr[1].split("\n").map((x) => x.trim()).filter(Boolean).join("; "));
  // results table: between "Results" and "Comments" — "BPC -157 10.95 mg", "Purity 99.849%"
  const rs = /results\s*[>:]?\s*\n([\s\S]*?)\n\s*(comments|analysis\s*conducted|signature|verify)/i.exec(t);
  const results = [];
  if (rs) for (const raw of rs[1].split("\n")) {
    const l = clean(raw); if (!l || /^[\W_]+$/.test(l)) continue;
    const m = /^(.*?)\s+([\d.,]+\s*(?:%|mg|mcg|µg|ug|iu|ml)?)\s*$/i.exec(l) || /^(purity)\s*[:>]?\s*([\d.,]+\s*%?)/i.exec(l);
    if (m) results.push([clean(m[1]).replace(/\s*-\s*/g, "-"), clean(m[2]).replace(/\s+/g, " ")]);
  }
  if (results.length) f.results = results;
  const key = /unique\s*key[^\n]*\n+\s*([A-Z0-9]{8,20})\s*$/im.exec(t) || /\n\s*([A-Z0-9]{10,16})\s*$/m.exec(t); if (key) f.key = key[1];
  if (/janoshik/i.test(t)) { f.lab = "Janoshik"; f.verifyUrl = "https://www.janoshik.com/verify/"; }
  // peptide + size from the sample line: "BPC-157 10mg", "CJC-1295 + Ipamorelin 20mg", "KLOW Blend 70 mg"
  if (f.sample) { const m = /^(.*?)\s*(\d+(?:\.\d+)?)\s*(mg|mcg|iu|ml)\b/i.exec(f.sample); if (m) { f.product = clean(m[1]).replace(/\s*-\s*/g, "-"); f.strength = `${m[2]} ${m[3].toLowerCase()}`; } else f.product = f.sample; }
  for (const k of Object.keys(f)) if (f[k] === "" || f[k] === undefined) delete f[k];
  return f;
}
module.exports = { extractText, parseCoa };
