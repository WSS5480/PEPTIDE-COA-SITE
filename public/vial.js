/* Draws the product vial as an SVG string. Shared by the store and the admin preview, so they always match.
   drawVial({ title, sub, style, logoUrl }) — style comes from Page setup → Vial look, per-product label colour overrides it. */
(() => {
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const hex = (v, d) => (/^#[0-9a-f]{6}$/i.test(String(v || "")) ? v : d);
  const DEFAULT = { shape: "vial", cap: "#0f1b33", band: "#c9d1dc", glass: "#ffffff", label: "#0b4d96", text: "#ffffff", sub: "#cfdcf0", liquid: "#e9f1fb", labelShows: "name" };
  // each shape: cap, metal band, glass outline, label area, liquid line
  const SHAPES = {
    vial: { cap: [38, 6, 44, 22, 4], band: [34, 26, 52, 10, 3], body: "M30 40h60v140a14 14 0 0 1-14 14H44a14 14 0 0 1-14-14z", label: [30, 78, 60, 80], liquid: [30, 162, 60, 4] },
    tall: { cap: [44, 4, 32, 20, 4], band: [40, 22, 40, 9, 3], body: "M38 34h44v150a12 12 0 0 1-12 12H50a12 12 0 0 1-12-12z", label: [38, 70, 44, 88], liquid: [38, 166, 44, 4] },
    round: { cap: [42, 6, 36, 18, 4], band: [38, 22, 44, 9, 3], body: "M44 31h32v8c12 4 18 12 18 24v113a14 14 0 0 1-14 14H40a14 14 0 0 1-14-14V63c0-12 6-20 18-24z", label: [26, 80, 68, 78], liquid: [26, 164, 68, 4] }
  };
  window.VIAL_DEFAULT = DEFAULT;
  window.drawVial = function drawVial(o = {}) {
    const st = Object.assign({}, DEFAULT, o.style || {});
    const sh = SHAPES[st.shape] || SHAPES.vial;
    const c = { cap: hex(st.cap, DEFAULT.cap), band: hex(st.band, DEFAULT.band), glass: hex(st.glass, DEFAULT.glass), label: hex(st.label, DEFAULT.label), text: hex(st.text, DEFAULT.text), sub: hex(st.sub, DEFAULT.sub), liquid: hex(st.liquid, DEFAULT.liquid) };
    const [lx, ly, lw, lh] = sh.label;
    const raw = String(o.title || "");
    const logo = o.logoUrl ? `<image href="${esc(o.logoUrl)}" x="${lx + (lw - 30) / 2}" y="${ly + 6}" width="30" height="30" preserveAspectRatio="xMidYMid meet"/>` : "";
    const ty = ly + (o.logoUrl ? 50 : 32), cx = lx + lw / 2;
    const fit = raw.length > 8 ? ` textLength="${lw - 8}" lengthAdjust="spacingAndGlyphs"` : "";
    return `<svg viewBox="0 0 120 200" aria-hidden="true">
      <rect x="${sh.cap[0]}" y="${sh.cap[1]}" width="${sh.cap[2]}" height="${sh.cap[3]}" rx="${sh.cap[4]}" fill="${c.cap}"/>
      <rect x="${sh.band[0]}" y="${sh.band[1]}" width="${sh.band[2]}" height="${sh.band[3]}" rx="${sh.band[4]}" fill="${c.band}"/>
      <path d="${sh.body}" fill="${c.glass}" stroke="${c.band}" stroke-width="2"/>
      <rect x="${lx}" y="${ly}" width="${lw}" height="${lh}" fill="${c.label}"/>
      ${logo}
      <text x="${cx}" y="${ty}" text-anchor="middle" font-family="Barlow Condensed, Arial Narrow, sans-serif" font-weight="700" font-size="14"${fit} fill="${c.text}">${esc(raw.slice(0, 22))}</text>
      <text x="${cx}" y="${ty + 20}" text-anchor="middle" font-family="Poppins, sans-serif" font-weight="600" font-size="11" fill="${c.sub}">${esc(o.sub || "")}</text>
      <rect x="${sh.liquid[0]}" y="${sh.liquid[1]}" width="${sh.liquid[2]}" height="${sh.liquid[3]}" fill="${c.liquid}"/>
    </svg>`;
  };
})();
