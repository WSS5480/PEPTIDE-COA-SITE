/* 360 University: turns lesson text into a page (shared by the rep app and the admin editor).
   Markup: "## Heading", "- bullet", "Term :: meaning", "! note", "[diagram:torso|skin|arm]", "[img:ID]", "[file:ID Title]", blank line = new paragraph. */
(function () {
  "use strict";
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const inline = (s) => esc(s).replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");

  /* ---------- diagrams (drawn here, original artwork) ---------- */
  // Organ map, front view. The patient's right is on the viewer's left, as on every chart and scan.
  const ORGANS = [
    // [label, quadrant/area, svg shape, fill, label x, label y]
    ["Right lung", "Chest", '<path d="M88 52 C70 60 62 100 64 150 L120 150 L122 60 C112 50 98 48 88 52Z"/>', "#9cc3e6"],
    ["Left lung", "Chest", '<path d="M232 52 C250 60 258 100 256 150 L206 150 L204 60 C214 50 222 48 232 52Z"/>', "#9cc3e6"],
    ["Heart", "Chest (center, tilted left)", '<path d="M150 98 C150 86 170 82 178 94 C190 88 206 98 198 116 C192 132 172 144 166 150 C156 140 144 128 146 112Z"/>', "#e06666"],
    ["Diaphragm", "Between chest and abdomen", '<path d="M64 156 C110 138 210 138 256 156 L256 162 C210 146 110 146 64 162Z"/>', "#b48a6b"],
    ["Liver", "RUQ", '<path d="M66 166 C100 158 168 160 176 172 C170 196 130 212 96 214 C78 212 66 196 66 166Z"/>', "#9b4a3c"],
    ["Gallbladder", "RUQ", '<ellipse cx="120" cy="212" rx="9" ry="6"/>', "#4f9a4a"],
    ["Stomach", "LUQ", '<path d="M182 168 C210 160 236 170 234 196 C232 220 206 230 190 222 C176 214 186 196 178 184Z"/>', "#e8a87c"],
    ["Spleen", "LUQ (behind the stomach, left side)", '<ellipse cx="244" cy="188" rx="9" ry="20"/>', "#7b3f61"],
    ["Pancreas", "Behind the stomach (head RUQ, tail LUQ)", '<path d="M136 222 C160 214 200 214 232 208 L234 216 C200 224 164 228 138 232Z"/>', "#e9c46a"],
    ["Right kidney", "RUQ (behind, retroperitoneal)", '<ellipse cx="104" cy="236" rx="11" ry="18" opacity=".85"/>', "#a0522d"],
    ["Left kidney", "LUQ (behind, retroperitoneal)", '<ellipse cx="216" cy="232" rx="11" ry="18" opacity=".85"/>', "#a0522d"],
    ["Small intestine", "Center of the abdomen", '<path d="M118 250 C140 240 180 240 202 250 C214 270 210 300 196 312 C170 322 148 322 124 312 C110 300 106 270 118 250Z"/>', "#f2b5a7"],
    ["Ascending colon", "Right side (RLQ → RUQ)", '<path d="M88 316 L88 238 L102 238 L102 316Z"/>', "#c98b5b"],
    ["Transverse colon", "Across the upper abdomen", '<path d="M88 238 C120 228 200 228 232 238 L232 250 C200 240 120 240 88 250Z"/>', "#c98b5b"],
    ["Descending colon", "Left side (LUQ → LLQ)", '<path d="M218 244 L232 244 L232 320 L218 320Z"/>', "#c98b5b"],
    ["Sigmoid colon", "LLQ", '<path d="M232 320 C232 344 206 352 186 344 C176 340 172 350 166 358 L156 354 C162 340 176 330 192 336 C208 340 220 334 218 320Z"/>', "#c98b5b"],
    ["Cecum & appendix", "RLQ", '<path d="M86 316 C84 334 102 340 106 324 L102 316Z M96 334 C96 346 92 352 88 356" stroke-width="5" stroke-linecap="round"/>', "#a86b3c"],
    ["Rectum", "Pelvis (behind the bladder)", '<path d="M156 354 L166 358 L166 392 L156 392Z" opacity=".8"/>', "#8c5a3c"],
    ["Bladder", "Pelvis (midline)", '<ellipse cx="160" cy="372" rx="20" ry="14"/>', "#f4d35e"],
  ];
  function torso() {
    const shapes = ORGANS.map(([n, where, d, fill]) => `<g class="u-org" tabindex="0" data-n="${esc(n)}" data-w="${esc(where)}" fill="${fill}" stroke="${fill}"><title>${esc(n)}: ${esc(where)}</title>${d}</g>`).join("");
    return `<figure class="u-fig"><svg viewBox="0 0 320 420" role="img" aria-label="Map of the organs in the chest and abdomen, front view">
      <path d="M160 18 C200 18 236 34 262 50 C278 120 274 210 268 300 C264 360 236 404 160 410 C84 404 56 360 52 300 C46 210 42 120 58 50 C84 34 120 18 160 18Z" fill="#fbeee6" stroke="#c9b3a6" stroke-width="2"/>
      ${shapes}
      <line x1="160" y1="164" x2="160" y2="352" stroke="#334" stroke-width="1.5" stroke-dasharray="5 4"/><line x1="60" y1="258" x2="260" y2="258" stroke="#334" stroke-width="1.5" stroke-dasharray="5 4"/>
      <g font-size="13" font-weight="800" fill="#123" opacity=".85"><text x="62" y="182">RUQ</text><text x="224" y="182" text-anchor="start">LUQ</text><text x="62" y="300">RLQ</text><text x="226" y="300">LLQ</text></g>
      <text x="8" y="414" font-size="11" font-weight="700" fill="#555">◀ Patient's RIGHT</text><text x="312" y="414" font-size="11" font-weight="700" fill="#555" text-anchor="end">Patient's LEFT ▶</text>
    </svg><figcaption class="u-cap">Tap an organ to see its name and where it sits. Dashed lines split the abdomen into the four quadrants.</figcaption><div class="u-pick" aria-live="polite"></div></figure>`;
  }
  function skin() {
    return `<figure class="u-fig"><svg viewBox="0 0 380 210" role="img" aria-label="Layers of the skin">
      <rect x="20" y="20" width="240" height="24" fill="#f3d2b8"/><rect x="20" y="44" width="240" height="66" fill="#e8a99a"/><rect x="20" y="110" width="240" height="56" fill="#f6e6a6"/>
      <path d="M118 110 C120 86 122 62 126 20" stroke="#8a5a44" stroke-width="3" fill="none"/><ellipse cx="118" cy="104" rx="6" ry="8" fill="#8a5a44"/>
      <path d="M200 106 c-6 -10 6 -14 0 -24 c-6 -10 6 -14 0 -24" stroke="#c0392b" stroke-width="3" fill="none"/>
      <g font-size="12" font-weight="700" fill="#222"><text x="270" y="36">Epidermis</text><text x="270" y="81">Dermis</text><text x="270" y="142">Hypodermis (fat)</text></g>
      <g font-size="10" fill="#333"><text x="132" y="72">hair follicle</text><text x="208" y="62">blood vessels</text></g>
      <line x1="44" y1="20" x2="44" y2="80" stroke="#1f6fb2" stroke-width="3"/><line x1="70" y1="20" x2="70" y2="150" stroke="#b21f4b" stroke-width="3"/>
      <text x="20" y="184" font-size="11" font-weight="700" fill="#1f6fb2">▮ partial-thickness: into the dermis</text><text x="20" y="200" font-size="11" font-weight="700" fill="#b21f4b">▮ full-thickness: through the dermis</text>
    </svg><figcaption class="u-cap">Partial-thickness wounds stop in the dermis; full-thickness wounds go through it.</figcaption></figure>`;
  }
  function arm() {
    const bone = (label, shape, fill) => `<g class="u-org" tabindex="0" data-n="${label}" data-w="" fill="${fill || "#e9e2cf"}" stroke="#8d846c" stroke-width="1.5"><title>${label}</title>${shape}</g>`;
    const L = (x, y, t, c, anchor) => `<text x="${x}" y="${y}" font-size="11" font-weight="700" fill="${c || "#222"}" text-anchor="${anchor || "start"}">${t}</text>`;
    const line = (x1, y1, x2, y2, c) => `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${c || "#9aa"}" stroke-width="1"/>`;
    return `<figure class="u-fig"><svg viewBox="0 0 360 320" role="img" aria-label="Bones of the right arm and hand, palm facing forward">
      ${bone("Humerus", '<rect x="166" y="10" width="22" height="100" rx="10"/>')}
      ${bone("Radius (thumb side)", '<rect x="150" y="118" width="13" height="94" rx="6"/>')}
      ${bone("Ulna (pinky side)", '<rect x="191" y="114" width="13" height="98" rx="6"/>')}
      ${bone("Carpals (wrist)", '<rect x="146" y="216" width="62" height="18" rx="6"/>', "#d9cfb4")}
      ${bone("Metacarpals (palm)", '<rect x="140" y="238" width="9" height="30" rx="4" transform="rotate(-28 144 238)"/><rect x="156" y="238" width="9" height="34" rx="4"/><rect x="169" y="238" width="9" height="36" rx="4"/><rect x="182" y="238" width="9" height="34" rx="4"/><rect x="195" y="238" width="9" height="30" rx="4"/>')}
      ${bone("Phalanges (fingers)", '<rect x="128" y="266" width="8" height="22" rx="4" transform="rotate(-28 132 266)"/><rect x="156" y="276" width="9" height="30" rx="4"/><rect x="169" y="278" width="9" height="34" rx="4"/><rect x="182" y="276" width="9" height="30" rx="4"/><rect x="195" y="272" width="9" height="24" rx="4"/>')}
      <circle cx="156" cy="121" r="7" fill="#f4a261" opacity=".85"/><rect x="146" y="194" width="21" height="18" fill="none" stroke="#b21f4b" stroke-width="2" stroke-dasharray="3 2"/>
      ${line(214, 58, 192, 58)}${L(218, 62, "Humerus (upper arm)")}
      ${line(140, 118, 150, 121, "#e08a3c")}${L(136, 115, "Radial head", "#9a4a12", "end")}${L(136, 128, "elbow · ALIGN", "#9a4a12", "end")}
      ${line(140, 165, 150, 165)}${L(136, 162, "Radius", "#222", "end")}${L(136, 175, "thumb side", "#555", "end")}
      ${line(208, 165, 218, 165)}${L(222, 162, "Ulna")}${L(222, 175, "pinky side", "#555")}
      ${line(140, 203, 146, 203, "#b21f4b")}${L(136, 200, "Distal radius", "#b21f4b", "end")}${L(136, 213, "wrist · GEMINUS plate", "#b21f4b", "end")}
      ${line(212, 225, 222, 225)}${L(226, 229, "Carpals (wrist)")}
      ${line(208, 255, 222, 255)}${L(226, 259, "Metacarpals (palm)")}
      ${line(208, 292, 222, 292)}${L(226, 296, "Phalanges (fingers)")}
    </svg><figcaption class="u-cap">Right arm, palm facing forward (anatomical position). The radius is on the thumb side; volar = palm side.</figcaption><div class="u-pick" aria-live="polite"></div></figure>`;
  }
  const DIAGRAMS = { torso, skin, arm };

  function render(body) {
    const out = []; let list = null, terms = null, para = [];
    const flush = () => { if (para.length) { out.push(`<p>${inline(para.join(" "))}</p>`); para = []; } if (list) { out.push(`<ul>${list.join("")}</ul>`); list = null; } if (terms) { out.push(`<dl class="u-terms">${terms.join("")}</dl>`); terms = null; } };
    String(body || "").split("\n").forEach((raw) => {
      const line = raw.trim();
      if (!line) { flush(); return; }
      let m;
      if ((m = /^##\s+(.+)/.exec(line))) { flush(); out.push(`<h3>${inline(m[1])}</h3>`); return; }
      if ((m = /^\[diagram:(\w+)\]$/.exec(line))) { flush(); out.push(DIAGRAMS[m[1]] ? DIAGRAMS[m[1]]() : ""); return; }
      if ((m = /^\[img:(u[0-9a-f]+)\]$/.exec(line))) { flush(); out.push(`<figure class="u-fig"><img src="/api/uni/file/${m[1]}" alt="" style="max-width:100%;border-radius:10px"></figure>`); return; }
      if ((m = /^\[file:(u[0-9a-f]+)(?:\s+(.+))?\]$/.exec(line))) { flush(); out.push(`<p><a class="btn" href="/api/uni/file/${m[1]}" target="_blank" rel="noopener">📄 ${esc(m[2] || "Open the document")}</a></p>`); return; }
      if ((m = /^!\s*(.+)/.exec(line))) { flush(); out.push(`<div class="u-note">${inline(m[1])}</div>`); return; }
      if ((m = /^[-•*]\s+(.+)/.exec(line))) { if (para.length || terms) { const l = list; list = null; flush(); list = l; } (list = list || []).push(`<li>${inline(m[1])}</li>`); return; }
      if ((m = /^(.{1,80}?)\s+::\s+(.+)$/.exec(line))) { if (para.length || list) { const t = terms; terms = null; flush(); terms = t; } (terms = terms || []).push(`<div><dt>${inline(m[1])}</dt><dd>${inline(m[2])}</dd></div>`); return; }
      if (list || terms) flush();
      para.push(line);
    });
    flush();
    return out.join("");
  }
  // tapping an organ / bone shows its name under the drawing
  document.addEventListener("click", (e) => { const g = e.target.closest(".u-org"); if (!g) return; const fig = g.closest(".u-fig"); fig.querySelectorAll(".u-org.on").forEach((x) => x.classList.remove("on")); g.classList.add("on"); const p = fig.querySelector(".u-pick"); if (p) p.innerHTML = `<strong>${esc(g.dataset.n)}</strong>${g.dataset.w ? " · " + esc(g.dataset.w) : ""}`; });
  const css = document.createElement("style");
  css.textContent = `.u-lesson{line-height:1.55;font-size:1rem}.u-lesson h3{margin:1.1rem 0 .4rem;font-size:1.05rem}.u-lesson p{margin:.5rem 0}.u-lesson ul{margin:.4rem 0 .6rem 1.2rem;padding:0}.u-lesson li{margin:.2rem 0}
    .u-terms{display:grid;gap:6px;margin:.5rem 0}.u-terms>div{display:grid;grid-template-columns:minmax(7rem,12rem) 1fr;gap:2px 12px;padding:6px 10px;border:1px solid var(--line,#e3e8ec);border-radius:10px;background:var(--card,#fff)}.u-terms dt{font-weight:700}.u-terms dd{margin:0}
    @media (max-width:560px){.u-terms>div{grid-template-columns:1fr}}
    .u-note{margin:.7rem 0;padding:10px 12px;border-left:4px solid #0b4d96;background:rgba(11,77,150,.07);border-radius:8px;font-weight:600}
    .u-fig{margin:.8rem 0;padding:10px;border:1px solid var(--line,#e3e8ec);border-radius:14px;background:#fff;color:#123}.u-fig svg{width:100%;max-width:440px;display:block;margin:0 auto}.u-cap{font-size:.82rem;color:#5f6b76;text-align:center;margin-top:6px}
    .u-org{cursor:pointer;transition:opacity .15s}.u-org:hover,.u-org:focus,.u-org.on{opacity:1;filter:brightness(1.08) drop-shadow(0 0 3px rgba(0,0,0,.45));outline:none}.u-pick{text-align:center;min-height:1.4em;margin-top:4px}`;
  document.head.appendChild(css);
  window.UniRender = { render, esc };
})();
