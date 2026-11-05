/* Admin → 360 University: who has which course and how they did (unlock, reset, assign), and the course editor
   (lessons, uploads, questions: add / edit / delete / reorder, CSV upload, course file import / export). Uses admin.js helpers. */
// admin.js keeps its helpers inside its own scope and shares them as window.ADM
const api = (...a) => window.ADM.api(...a), pane = () => window.ADM.pane(), toast = (m) => window.ADM.toast(m), esc = (v) => window.ADM.esc(v), when = (v) => window.ADM.when(v), isOwner = () => window.ADM.isOwner();
let UNI_TAB = "progress", UNI_FILTER = "all", UNI_OPEN = {};
const UNI_PILL = { passed: ["Passed", "ok"], locked: ["Locked", "bad"], retry: ["Try again", "warn"], in_progress: ["In progress", "info"], not_started: ["Not started", "mute"] };
(function () {
  const css = document.createElement("style");
  css.textContent = `.uq{display:inline-block;padding:2px 9px;border-radius:999px;font-size:.72rem;font-weight:800}.uq.ok{background:#e3f4eb;color:#15734a}.uq.bad{background:#fdecec;color:#9b1c1c}.uq.warn{background:#faefd6;color:#8a5a00}.uq.info{background:#e9f1fb;color:#0b4d96}.uq.mute{background:#eef1f5;color:#5d6879}
    .ug{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,18rem),1fr));gap:10px}.uc{border:1px solid var(--line,#e3e8ec);border-radius:14px;padding:12px;background:var(--card,#fff);display:flex;flex-direction:column;gap:6px;min-width:0}
    .urow{display:flex;flex-wrap:wrap;gap:6px;align-items:center}.uni-det{border:1px solid var(--line,#e3e8ec);border-radius:14px;background:var(--card,#fff);margin-bottom:8px}.uni-det>summary{cursor:pointer;padding:10px 14px;display:flex;flex-wrap:wrap;gap:8px;align-items:center;list-style:none}
    .uni-det>summary::-webkit-details-marker{display:none}.uni-det>summary:before{content:"▸";color:#5d6879}.uni-det[open]>summary:before{content:"▾"}.uni-det .body{padding:0 14px 12px}
    .ule{border:1px solid var(--line,#e3e8ec);border-radius:12px;padding:10px;margin:8px 0;background:var(--card,#fff)}.ule textarea{width:100%;min-height:12rem;font:13px/1.45 ui-monospace,Menlo,Consolas,monospace}
    .uqe{border:1px solid var(--line,#e3e8ec);border-radius:12px;padding:10px 12px;margin:6px 0;background:var(--card,#fff)}.uqe.off{opacity:.55}.uqe ol{margin:.3rem 0 .2rem 1.2rem;padding:0}.uqe li.c{font-weight:700;color:#15734a}
    .uf{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,12rem),1fr));gap:8px 12px}.uf label{display:flex;flex-direction:column;gap:3px;font-size:.8rem;font-weight:600}
    .uni-sticky{position:sticky;bottom:0;background:var(--bg,#f4f6f8);padding:8px 0;z-index:5;display:flex;gap:8px;flex-wrap:wrap;justify-content:flex-end}`;
  document.head.appendChild(css);
})();
const uPill = (s) => { const p = UNI_PILL[s] || UNI_PILL.not_started; return `<span class="uq ${p[1]}">${p[0]}</span>`; };
const uWhen = (iso) => (iso ? new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" }) : "");
const uFile = (accept) => new Promise((ok) => { const i = document.createElement("input"); i.type = "file"; i.accept = accept; i.onchange = () => ok(i.files[0] || null); i.click(); });
const uData = (file) => new Promise((ok, no) => { const fr = new FileReader(); fr.onload = () => ok(fr.result); fr.onerror = () => no(new Error("Couldn't read the file")); fr.readAsDataURL(file); });
const uText = (file) => new Promise((ok, no) => { const fr = new FileReader(); fr.onload = () => ok(fr.result); fr.onerror = () => no(new Error("Couldn't read the file")); fr.readAsText(file); });
function uCsv(text) { // small CSV reader: quotes, commas and new lines inside quotes
  const rows = []; let row = [], cell = "", q = false;
  for (let i = 0; i < text.length; i++) { const ch = text[i];
    if (q) { if (ch === '"' && text[i + 1] === '"') { cell += '"'; i++; } else if (ch === '"') q = false; else cell += ch; }
    else if (ch === '"') q = true; else if (ch === ",") { row.push(cell); cell = ""; } else if (ch === "\n" || ch === "\r") { if (ch === "\r" && text[i + 1] === "\n") i++; row.push(cell); rows.push(row); row = []; cell = ""; } else cell += ch; }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows.filter((r) => r.some((c) => String(c).trim()));
}
function uDownload(name, text, type) { const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([text], { type: type || "text/plain" })); a.download = name; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500); }
const UNI_TEMPLATE = 'question,option_a,option_b,option_c,option_d,option_e,option_f,correct,explanation,lesson\n"Which skin layer contains collagen and blood vessels?",Epidermis,Dermis,Hypodermis,,,,B,"The dermis holds collagen, vessels and nerves.",5\n';

async function university() {
  const j = await api("/uni");
  const reps = j.reps, courses = j.courses, all = reps.flatMap((r) => r.courses);
  const locked = all.filter((a) => a.status === "locked").length, passed = all.filter((a) => a.status === "passed").length;
  pane().innerHTML = `<header><h1>🎓 360 University</h1><div class="row2"><div class="seg"><button type="button" data-ut="progress"${UNI_TAB === "progress" ? ' class="on"' : ""}>Reps & progress</button><button type="button" data-ut="courses"${UNI_TAB === "courses" ? ' class="on"' : ""}>Courses</button></div></div></header>
    <dl class="kpis"><div class="kpi"><dt>Courses assigned</dt><dd>${all.length}</dd></div><div class="kpi green"><dt>Passed</dt><dd>${passed}</dd></div><div class="kpi"${locked ? ' style="border-color:#9b1c1c"' : ""}><dt>Locked (need you)</dt><dd>${locked}</dd></div><div class="kpi"><dt>Courses</dt><dd>${courses.filter((c) => c.active).length}</dd></div></dl>
    <div id="uBody"></div>`;
  pane().onclick = (e) => { const t = e.target.closest("[data-ut]"); if (t) { UNI_TAB = t.dataset.ut; university(); } };
  if (UNI_TAB === "courses") return uniCourses(j); else return uniProgress(j);
}

function uniProgress(j) {
  const box = document.getElementById("uBody"), cById = Object.fromEntries(j.courses.map((c) => [c.id, c]));
  const show = j.reps.filter((r) => UNI_FILTER === "all" || (UNI_FILTER === "locked" ? r.courses.some((a) => a.status === "locked") : r.courses.some((a) => a.status !== "passed")));
  show.sort((a, b) => (b.courses.some((x) => x.status === "locked") - a.courses.some((x) => x.status === "locked")) || a.name.localeCompare(b.name));
  box.innerHTML = `<div class="row2" style="margin:4px 0 10px"><select id="uFilt" style="width:auto"><option value="all">All reps</option><option value="locked">Locked first / only locked</option><option value="todo">Not finished</option></select><span class="muted">Tap a rep to see each course. New reps get courses automatically from Team.</span></div>
    ${show.length ? show.map((r) => { const n = r.courses.length, p = r.courses.filter((a) => a.status === "passed").length, lk = r.courses.filter((a) => a.status === "locked").length;
      return `<details class="uni-det" data-rep="${r.id}"${UNI_OPEN[r.id] ? " open" : ""}><summary><strong>${esc(r.name || r.email)}</strong><span class="muted">${p} of ${n} passed</span>${lk ? `<span class="uq bad">${lk} locked</span>` : ""}${n && p === n ? '<span class="uq ok">All passed</span>' : ""}</summary><div class="body">
        <div class="ug">${r.courses.map((a) => { const c = cById[a.course_id] || {}; return `<div class="uc"><div class="urow"><strong>${esc(c.icon || "🎓")} ${esc(c.title || "Course")}</strong></div>
          <div class="urow">${uPill(a.status)}<span class="muted" style="font-size:.8rem">${a.read}/${c.lessons || 0} lessons · ${a.attempts}/${c.max_attempts || 2} attempts${a.best != null ? ` · best ${a.best}%` : ""}${a.passed_at ? ` · passed ${uWhen(a.passed_at)}` : a.locked_at ? ` · locked ${uWhen(a.locked_at)}` : ""}${a.unlocks ? ` · unlocked ${a.unlocks}×` : ""}</span></div>
          <div class="urow">${a.status === "locked" ? `<button class="btn solid" type="button" data-ua="unlock" data-id="${a.id}">Unlock (2 more tries)</button>` : ""}<button class="btn" type="button" data-hist="${a.id}">History</button><button class="btn" type="button" data-ua="reset" data-id="${a.id}">Reset</button><button class="btn danger" type="button" data-ua="remove" data-id="${a.id}">Remove</button></div><div data-histbox="${a.id}"></div></div>`; }).join("") || '<p class="muted">No courses assigned.</p>'}</div>
        <div class="urow" style="margin-top:8px"><button class="btn" type="button" data-assign="${r.id}">Assign courses…</button></div><div data-assignbox="${r.id}"></div></div></details>`; }).join("") : '<div class="panel" data-nofold><p class="muted">No reps match. Add reps under Team.</p></div>'}`;
  const f = document.getElementById("uFilt"); f.value = UNI_FILTER; f.onchange = () => { UNI_FILTER = f.value; uniProgress(j); };
  box.querySelectorAll("details[data-rep]").forEach((d) => d.addEventListener("toggle", () => { UNI_OPEN[d.dataset.rep] = d.open; }));
  box.onclick = async (e) => {
    const a = e.target.closest("[data-ua]");
    if (a) { const act = a.dataset.ua; if (act === "remove" && !confirm("Remove this course from the rep? Their attempts stay in the history.")) return; if (act === "reset" && !confirm("Reset this course? Lessons read, scores and attempts start over.")) return;
      await api(`/uni/assign/${a.dataset.id}/${act}`, { method: "POST", body: {} }); toast(act === "unlock" ? "Unlocked: two more tries" : act === "reset" ? "Reset" : "Removed"); return university(); }
    const h = e.target.closest("[data-hist]");
    if (h) { const r = await api("/uni/attempts/" + h.dataset.hist); const bx = box.querySelector(`[data-histbox="${h.dataset.hist}"]`); bx.innerHTML = r.attempts.length ? `<div class="muted" style="font-size:.82rem">${r.attempts.map((x, n) => `Attempt ${n + 1}: <strong style="color:${x.passed ? "#15734a" : "#9b1c1c"}">${x.pct}%</strong> (${x.score}/${x.total}) · ${when(x.at)}`).join("<br>")}</div>` : '<div class="muted" style="font-size:.82rem">No attempts yet.</div>'; return; }
    const as = e.target.closest("[data-assign]");
    if (as) { const r = j.reps.find((x) => String(x.id) === as.dataset.assign), have = new Set(r.courses.map((x) => x.course_id)), bx = box.querySelector(`[data-assignbox="${r.id}"]`);
      bx.innerHTML = `<div class="uc" style="margin-top:8px"><strong>Courses for ${esc(r.name)}</strong>${j.courses.map((c) => `<label class="chk"><input type="checkbox" value="${c.id}"${have.has(c.id) ? " checked" : ""}> ${esc(c.icon)} ${esc(c.title)}${c.active ? "" : " (hidden)"}</label>`).join("")}<div class="urow"><button class="btn solid" type="button" data-saveas="${r.id}">Save</button><span class="muted" style="font-size:.8rem">Unticking a course removes it from the rep (their past attempts stay in the history).</span></div></div>`; return; }
    const sv = e.target.closest("[data-saveas]");
    if (sv) { const ids = [...box.querySelectorAll(`[data-assignbox="${sv.dataset.saveas}"] input:checked`)].map((i) => +i.value); await api("/uni/assign", { method: "POST", body: { userId: +sv.dataset.saveas, courseIds: ids } }); toast("Courses saved"); UNI_OPEN[sv.dataset.saveas] = true; return university(); }
  };
}

function uniCourses(j) {
  const box = document.getElementById("uBody"), own = isOwner();
  box.innerHTML = `<div class="row2" style="margin:4px 0 10px">${own ? `<button class="btn solid" type="button" id="uNew">+ New course</button><button class="btn" type="button" id="uImp">⬆ Upload a course file (.json)</button>` : ""}<button class="btn" type="button" id="uTpl">⬇ Question template (.csv)</button></div>
    <p class="muted">Who gets a course automatically: <strong>Surgical / Wound / Every portal rep</strong> courses go to new reps with the portal; <strong>Peptide</strong> courses to new reps with the peptide store. You can always assign by hand on the Reps & progress tab.</p>
    <div class="ug">${j.courses.map((c, i) => `<div class="uc"><div class="urow"><strong style="font-size:1.02rem">${esc(c.icon)} ${esc(c.title)}</strong>${c.active ? "" : '<span class="uq mute">Hidden</span>'}</div>
      <div class="muted" style="font-size:.85rem">${esc(c.blurb)}</div>
      <div class="urow"><span class="uq info">${esc(j.audiences[c.audience] || c.audience)}</span><span class="muted" style="font-size:.8rem">${c.lessons} lessons · ${c.questions} questions · test ${c.test_count} · ${c.pass_pct}% · ${c.max_attempts} tries</span></div>
      <div class="muted" style="font-size:.8rem">${c.assigned} assigned · ${c.passed} passed${c.updated_by ? ` · edited by ${esc(c.updated_by)}` : ""}</div>
      <div class="urow"><button class="btn solid" type="button" data-ce="${c.id}">${own ? "Edit" : "View"}</button><button class="btn" type="button" data-cto="${c.id}">Assign to reps…</button><a class="btn" href="/api/admin/uni/courses/${c.id}/pdf" download title="The whole course as a PDF, with the answer key at the back">⬇ PDF</a>${own ? `<button class="btn" type="button" data-cdup="${c.id}">Duplicate</button><button class="btn" type="button" data-cmv="up" data-id="${c.id}"${i === 0 ? " disabled" : ""}>↑</button><button class="btn" type="button" data-cmv="down" data-id="${c.id}"${i === j.courses.length - 1 ? " disabled" : ""}>↓</button>` : ""}</div><div data-ctobox="${c.id}"></div></div>`).join("")}</div>`;
  document.getElementById("uTpl").onclick = () => uDownload("360-university-questions-template.csv", UNI_TEMPLATE, "text/csv");
  if (own) {
    document.getElementById("uNew").onclick = async () => { const r = await api("/uni/courses", { method: "POST", body: { title: "New course", blurb: "", icon: "🎓", audience: "none", active: false, lessons: [{ title: "Lesson 1", body: "## Start here\nType the lesson here." }] } }); uniEdit(r.id); };
    document.getElementById("uImp").onclick = async () => { const f = await uFile(".json,application/json"); if (!f) return; let c; try { c = JSON.parse(await uText(f)); } catch (e) { return toast("That file isn't a course file (.json)."); }
      const r = await api("/uni/courses", { method: "POST", body: { course: { ...c, active: false } } }); toast(`Course added (hidden until you turn it on) · ${r.added} questions${r.skipped ? `, ${r.skipped} skipped` : ""}`); uniEdit(r.id); };
  }
  box.onclick = async (e) => {
    const ed = e.target.closest("[data-ce]"); if (ed) return uniEdit(+ed.dataset.ce);
    const d = e.target.closest("[data-cdup]"); if (d) { const r = await api(`/uni/courses/${d.dataset.cdup}/duplicate`, { method: "POST", body: {} }); toast("Copied (hidden until you turn it on)"); return uniEdit(r.id); }
    const m = e.target.closest("[data-cmv]"); if (m) { await api(`/uni/courses/${m.dataset.id}/move`, { method: "POST", body: { dir: m.dataset.cmv } }); return university(); }
    const to = e.target.closest("[data-cto]");
    if (to) { const bx = box.querySelector(`[data-ctobox="${to.dataset.cto}"]`), cid = +to.dataset.cto; bx.innerHTML = `<div style="border-top:1px solid var(--line,#e3e8ec);padding-top:8px">${j.reps.map((r) => { const has = r.courses.some((a) => a.course_id === cid); return `<label class="chk"><input type="checkbox" value="${r.id}"${has ? " checked disabled" : ""}> ${esc(r.name || r.email)}${has ? " (has it)" : ""}</label>`; }).join("") || '<p class="muted">No reps yet.</p>'}<div class="urow"><button class="btn solid" type="button" data-ctosave="${cid}">Assign</button></div></div>`; return; }
    const ts = e.target.closest("[data-ctosave]");
    if (ts) { const ids = [...box.querySelectorAll(`[data-ctobox="${ts.dataset.ctosave}"] input:checked:not(:disabled)`)].map((i) => +i.value); if (!ids.length) return toast("Tick at least one rep."); await api("/uni/assign-course", { method: "POST", body: { courseId: +ts.dataset.ctosave, userIds: ids } }); toast(`Assigned to ${ids.length}`); return university(); }
  };
}

async function uniEdit(id) {
  const { course: c, audiences } = await api("/uni/courses/" + id), own = isOwner();
  let lessons = (c.lessons || []).map((l) => ({ ...l })), dirty = false;
  const ro = own ? "" : " disabled";
  const lessonOpts = () => `<option value="">— any —</option>` + lessons.map((l, i) => `<option value="${i + 1}">${i + 1}. ${esc(l.title)}</option>`).join("");
  const qHtml = (x, n) => `<div class="uqe${x.active ? "" : " off"}" data-q="${x.id}"><div class="urow" style="justify-content:space-between"><strong>${n + 1}. ${esc(x.q)}</strong>${own ? `<span class="urow"><button class="btn" type="button" data-qmv="up" data-id="${x.id}"${n === 0 ? " disabled" : ""}>↑</button><button class="btn" type="button" data-qmv="down" data-id="${x.id}"${n === c.questions.length - 1 ? " disabled" : ""}>↓</button><button class="btn" type="button" data-qe="${x.id}">Edit</button><button class="btn danger" type="button" data-qd="${x.id}">Delete</button></span>` : ""}</div>
    <ol type="A">${x.options.map((o, i) => `<li class="${i === x.correct ? "c" : ""}">${esc(o)}${i === x.correct ? " ✓" : ""}</li>`).join("")}</ol>
    <div class="muted" style="font-size:.8rem">${x.why ? "Why: " + esc(x.why) + " · " : ""}${x.lesson ? `Connected to lesson ${x.lesson}${lessons[x.lesson - 1] ? ": " + esc(lessons[x.lesson - 1].title) : ""}` : "Any lesson"}${x.active ? "" : " · not used in tests"}</div></div>`;
  const qForm = (x) => `<div class="uqe" data-qform="${x ? x.id : "new"}"><div class="uf" style="grid-template-columns:1fr">
      <label>Question<textarea data-f="q" rows="2">${esc(x ? x.q : "")}</textarea></label></div>
      <div data-opts>${(x ? x.options : ["", "", "", ""]).map((o, i) => `<div class="urow" style="margin:4px 0"><input type="radio" name="corr" value="${i}"${x && x.correct === i ? " checked" : ""} title="Correct answer"><span style="width:1.2rem;font-weight:700">${"ABCDEF"[i]}</span><input data-opt style="flex:1;min-width:10rem" value="${esc(o)}"><button class="btn" type="button" data-optdel title="Remove this choice">×</button></div>`).join("")}</div>
      <div class="urow"><button class="btn" type="button" data-optadd>+ Add a choice</button><span class="muted" style="font-size:.8rem">Tick the circle next to the correct answer (2 to 6 choices).</span></div>
      <div class="uf" style="margin-top:6px"><label>Why (shown after the test)<input data-f="why" value="${esc(x ? x.why : "")}"></label><label>Connected lesson (to review if missed)<select data-f="lesson">${lessonOpts()}</select></label><label class="chk" style="flex-direction:row;align-items:center"><input type="checkbox" data-f="active"${!x || x.active ? " checked" : ""}> Use in tests</label></div>
      <div class="urow" style="margin-top:6px"><button class="btn solid" type="button" data-qsave="${x ? x.id : "new"}">Save question</button><button class="btn" type="button" data-qcancel>Cancel</button></div></div>`;
  const lessonHtml = (l, i) => `<div class="ule" data-li="${i}"><div class="urow" style="justify-content:space-between"><input data-lt value="${esc(l.title)}" style="flex:1;min-width:12rem;font-weight:700"${ro}>${own ? `<span class="urow"><button class="btn" type="button" data-lmv="up" data-i="${i}"${i === 0 ? " disabled" : ""}>↑</button><button class="btn" type="button" data-lmv="down" data-i="${i}"${i === lessons.length - 1 ? " disabled" : ""}>↓</button><button class="btn" type="button" data-lprev="${i}">Preview</button><button class="btn danger" type="button" data-ldel="${i}">Delete</button></span>` : `<button class="btn" type="button" data-lprev="${i}">Preview</button>`}</div>
    <textarea data-lb${ro}>${esc(l.body)}</textarea>
    ${own ? `<div class="urow"><select data-ldiag style="width:auto"><option value="">Insert a diagram…</option><option value="torso">Organ map (abdomen & chest)</option><option value="skin">Skin layers</option><option value="arm">Arm & hand bones</option></select><button class="btn" type="button" data-lfile="${i}">+ Image or PDF</button></div>` : ""}
    <div data-lpv="${i}" class="u-lesson" hidden style="margin-top:8px;border-top:1px dashed var(--line,#e3e8ec);padding-top:8px"></div></div>`;
  const draw = () => {
    pane().innerHTML = `<header><h1>${esc(c.icon)} ${esc(c.title)}</h1><div class="row2"><button class="btn" type="button" id="ueBack">‹ Courses</button></div></header>
      <div class="panel" data-nofold><h2 style="margin-top:0">Course</h2><div class="uf">
        <label>Title<input id="ceTitle" value="${esc(c.title)}"${ro}></label><label>Icon (emoji)<input id="ceIcon" value="${esc(c.icon)}" maxlength="8"${ro}></label>
        <label>Gets it automatically<select id="ceAud"${ro}>${Object.entries(audiences).map(([k, v]) => `<option value="${k}"${c.audience === k ? " selected" : ""}>${esc(v)}</option>`).join("")}</select></label>
        <label>Minutes to complete<input id="ceMin" type="number" min="1" value="${c.minutes}"${ro}></label><label>Pass mark (%)<input id="cePass" type="number" min="1" max="100" value="${c.pass_pct}"${ro}></label>
        <label>Questions per test<input id="ceCount" type="number" min="1" max="100" value="${c.test_count}"${ro}></label><label>Attempts before it locks<input id="ceTries" type="number" min="1" max="10" value="${c.max_attempts}"${ro}></label>
        <label class="chk" style="flex-direction:row;align-items:center"><input type="checkbox" id="ceActive"${c.active ? " checked" : ""}${ro}> Course is live (reps can see it)</label></div>
        <label style="display:flex;flex-direction:column;gap:3px;font-size:.8rem;font-weight:600;margin-top:8px">Short description<textarea id="ceBlurb" rows="2"${ro}>${esc(c.blurb)}</textarea></label></div>
      <div class="panel" data-nofold><h2 style="margin-top:0">Lessons</h2>
        <details><summary class="muted">How to format a lesson</summary><div class="muted" style="font-size:.85rem;line-height:1.6"><code>## Heading</code> a sub-heading · <code>- item</code> a bullet · <code>Term :: meaning</code> a vocabulary row · <code>! text</code> a highlighted note · <code>**bold**</code> · a blank line starts a new paragraph · <code>[diagram:torso]</code>, <code>[diagram:skin]</code>, <code>[diagram:arm]</code> drawings · images and PDFs you add show as <code>[img:…]</code> / <code>[file:…]</code> · <code>{{catalog}}</code> lists the store's current products.</div></details>
        <div id="ueLessons">${lessons.map(lessonHtml).join("")}</div>
        ${own ? `<div class="urow"><button class="btn" type="button" id="ueAddL">+ Add lesson</button><button class="btn" type="button" id="ueUpL">⬆ Lesson from a PDF or text file</button><span class="muted" style="font-size:.8rem">The file's text becomes a new lesson you can tidy up. Word files: save as PDF first.</span></div>` : ""}</div>
      ${own ? `<div class="uni-sticky"><span class="muted" id="ueDirty" style="align-self:center"></span><button class="btn solid" type="button" id="ueSave">Save course & lessons</button></div>` : ""}
      <div class="panel" data-nofold><h2 style="margin-top:0">Test questions · ${c.questions.length}</h2><p class="muted" style="margin-top:0">Each test draws ${c.test_count} at random from the ones marked "use in tests" (${c.questions.filter((x) => x.active).length}). Keep the bank bigger than the test so retakes get new questions.</p>
        ${own ? `<div class="urow" style="margin-bottom:8px"><button class="btn solid" type="button" id="ueAddQ">+ Add question</button><button class="btn" type="button" id="ueUpQ">⬆ Upload questions (.csv)</button><label class="chk"><input type="checkbox" id="ueRepl"> Replace all questions</label><button class="btn" type="button" id="ueTpl">⬇ Template</button></div><div id="ueNewQ"></div>` : ""}
        <div id="ueQs">${c.questions.map(qHtml).join("") || '<p class="muted">No questions yet.</p>'}</div></div>
      ${own ? `<div class="panel" data-nofold style="border-color:#e7b4b4"><h2 style="margin-top:0">Delete this course</h2><p class="muted">Removes the course, its questions and every rep's progress on it. Save a course file first if you may want it back (it re-uploads under Upload a course file).</p><div class="row2" style="gap:.5rem;flex-wrap:wrap"><a class="btn" href="/api/admin/uni/courses/${id}/export" download>⬇ Course file (.json)</a><button class="btn danger" type="button" id="ueDel">Delete course</button></div></div>` : ""}`;
    window.scrollTo(0, 0);
    wire();
  };
  const markDirty = () => { dirty = true; const d = document.getElementById("ueDirty"); if (d) d.textContent = "Unsaved changes"; };
  const readLessons = () => { lessons = [...document.querySelectorAll("[data-li]")].map((el) => ({ title: el.querySelector("[data-lt]").value, body: el.querySelector("[data-lb]").value })); };
  const insertLine = (i, line) => { readLessons(); const ta = document.querySelector(`[data-li="${i}"] [data-lb]`); const pos = ta.selectionStart || ta.value.length; ta.value = ta.value.slice(0, pos) + (pos && ta.value[pos - 1] !== "\n" ? "\n" : "") + line + "\n" + ta.value.slice(pos); markDirty(); };
  const save = async () => { readLessons(); await api("/uni/courses/" + id, { method: "PUT", body: { title: document.getElementById("ceTitle").value, icon: document.getElementById("ceIcon").value, blurb: document.getElementById("ceBlurb").value, audience: document.getElementById("ceAud").value, minutes: document.getElementById("ceMin").value, pass_pct: document.getElementById("cePass").value, test_count: document.getElementById("ceCount").value, max_attempts: document.getElementById("ceTries").value, active: document.getElementById("ceActive").checked, lessons } }); dirty = false; toast("Saved"); };
  function wire() {
    const P = pane();
    P.oninput = (e) => { if (e.target.closest(".panel") && !e.target.closest("[data-qform]")) markDirty(); };
    P.onchange = (e) => { const dg = e.target.closest("[data-ldiag]"); if (dg && dg.value) { insertLine(+dg.closest("[data-li]").dataset.li, `[diagram:${dg.value}]`); dg.value = ""; } };
    P.onclick = async (e) => {
      const t = e.target;
      if (t.id === "ueBack") { if (dirty && !confirm("Leave without saving the course and lessons?")) return; UNI_TAB = "courses"; return university(); }
      if (t.id === "ueSave") { await save(); return; }
      if (t.id === "ueAddL") { readLessons(); lessons.push({ title: `Lesson ${lessons.length + 1}`, body: "" }); markDirty(); return redrawLessons(); }
      if (t.id === "ueUpL") { const f = await uFile(".pdf,.txt,.md,application/pdf,text/plain"); if (!f) return; toast("Reading the file…"); const r = await api("/uni/extract", { method: "POST", body: { data: await uData(f), name: f.name } }); readLessons(); lessons.push({ title: r.title || "New lesson", body: r.text }); markDirty(); redrawLessons(); toast("Added as a new lesson. Tidy it up, then Save."); return; }
      const lm = t.closest("[data-lmv]"); if (lm) { readLessons(); const i = +lm.dataset.i, k = i + (lm.dataset.lmv === "up" ? -1 : 1); [lessons[i], lessons[k]] = [lessons[k], lessons[i]]; markDirty(); return redrawLessons(); }
      const ld = t.closest("[data-ldel]"); if (ld) { if (!confirm("Delete this lesson? (Questions connected to it keep their lesson number; check them after.)")) return; readLessons(); lessons.splice(+ld.dataset.ldel, 1); markDirty(); return redrawLessons(); }
      const lp = t.closest("[data-lprev]"); if (lp) { const i = +lp.dataset.lprev, box = document.querySelector(`[data-lpv="${i}"]`); box.hidden = !box.hidden; if (!box.hidden) box.innerHTML = window.UniRender.render(document.querySelector(`[data-li="${i}"] [data-lb]`).value.replace("{{catalog}}", "(the store's current product list shows here)")); return; }
      const lf = t.closest("[data-lfile]"); if (lf) { const f = await uFile("image/*,application/pdf"); if (!f) return; const r = await api("/uni/files", { method: "POST", body: { data: await uData(f), name: f.name } }); insertLine(+lf.dataset.lfile, r.kind === "img" ? `[img:${r.id}]` : `[file:${r.id} ${f.name.replace(/\.[^.]+$/, "")}]`); toast("Added. Save the course to keep it."); return; }
      if (t.id === "ueTpl") return uDownload("360-university-questions-template.csv", UNI_TEMPLATE, "text/csv");
      if (t.id === "ueAddQ") { document.getElementById("ueNewQ").innerHTML = qForm(null); return; }
      if (t.id === "ueUpQ") {
        const f = await uFile(".csv,text/csv"); if (!f) return; const rows = uCsv(await uText(f)); if (rows.length < 2) return toast("The file has no question rows.");
        const head = rows[0].map((h) => String(h).trim().toLowerCase()), col = (n) => head.indexOf(n);
        const optCols = ["option_a", "option_b", "option_c", "option_d", "option_e", "option_f"].map(col).filter((k) => k >= 0);
        const parsed = rows.slice(1).map((r) => { const opts = optCols.map((k) => String(r[k] || "").trim()); const kept = opts.filter(Boolean); const raw = String(r[col("correct")] || "").trim().toUpperCase(); const at = /^[A-F]$/.test(raw) ? "ABCDEF".indexOf(raw) : (parseInt(raw, 10) || 0) - 1; const correct = at >= 0 && opts[at] ? kept.indexOf(opts[at]) : -1;
          return { q: String(r[col("question")] || "").trim(), options: kept, correct, why: col("explanation") >= 0 ? String(r[col("explanation")] || "").trim() : "", lesson: col("lesson") >= 0 ? parseInt(r[col("lesson")], 10) || null : null }; });
        const repl = document.getElementById("ueRepl").checked; if (repl && !confirm(`Replace all ${c.questions.length} questions with the ${parsed.length} in this file?`)) return;
        const r = await api(`/uni/courses/${id}/questions/import`, { method: "POST", body: { rows: parsed, replace: repl } });
        toast(`${r.added} questions added${r.errors.length ? `, ${r.errors.length} skipped` : ""}`); if (r.errors.length) alert("Skipped:\n" + r.errors.join("\n")); return reload();
      }
      const qe = t.closest("[data-qe]"); if (qe) { const x = c.questions.find((y) => String(y.id) === qe.dataset.qe); const el = document.querySelector(`[data-q="${x.id}"]`); el.outerHTML = qForm(x); const s = document.querySelector(`[data-qform="${x.id}"] [data-f="lesson"]`); if (s) s.value = x.lesson || ""; return; }
      if (t.closest("[data-qcancel]")) return reload();
      if (t.closest("[data-optadd]")) { const box = t.closest("[data-qform]").querySelector("[data-opts]"), n = box.children.length; if (n >= 6) return toast("Six choices at most."); box.insertAdjacentHTML("beforeend", `<div class="urow" style="margin:4px 0"><input type="radio" name="corr" value="${n}" title="Correct answer"><span style="width:1.2rem;font-weight:700">${"ABCDEF"[n]}</span><input data-opt style="flex:1;min-width:10rem"><button class="btn" type="button" data-optdel>×</button></div>`); return; }
      if (t.closest("[data-optdel]")) { const box = t.closest("[data-opts]"); if (box.children.length <= 2) return toast("Keep at least two choices."); t.closest(".urow").remove(); [...box.children].forEach((r, i) => { r.querySelector('input[type="radio"]').value = i; r.querySelector("span").textContent = "ABCDEF"[i]; }); return; }
      const qs = t.closest("[data-qsave]");
      if (qs) { const f = t.closest("[data-qform]"), opts = [...f.querySelectorAll("[data-opts] .urow")], corr = f.querySelector('input[name="corr"]:checked');
        const kept = opts.map((r) => r.querySelector("[data-opt]").value.trim()), body = { q: f.querySelector('[data-f="q"]').value, options: kept.filter(Boolean), correct: corr && kept[+corr.value] ? kept.filter(Boolean).indexOf(kept[+corr.value]) : -1, why: f.querySelector('[data-f="why"]').value, lesson: f.querySelector('[data-f="lesson"]').value || null, active: f.querySelector('[data-f="active"]').checked };
        if (qs.dataset.qsave === "new") await api(`/uni/courses/${id}/questions`, { method: "POST", body }); else await api(`/uni/questions/${qs.dataset.qsave}`, { method: "PUT", body });
        toast("Question saved"); return reload(); }
      const qd = t.closest("[data-qd]"); if (qd) { if (!confirm("Delete this question?")) return; await api(`/uni/questions/${qd.dataset.qd}`, { method: "DELETE" }); toast("Deleted"); return reload(); }
      const qm = t.closest("[data-qmv]"); if (qm) { await api(`/uni/questions/${qm.dataset.id}/move`, { method: "POST", body: { dir: qm.dataset.qmv } }); return reload(); }
      if (t.id === "ueDel") { if (!confirm(`Delete "${c.title}" with its ${c.questions.length} questions and all rep progress? This can't be undone.`)) return; await api("/uni/courses/" + id, { method: "DELETE" }); toast("Course deleted"); UNI_TAB = "courses"; return university(); }
    };
  }
  function redrawLessons() { document.getElementById("ueLessons").innerHTML = lessons.map(lessonHtml).join(""); }
  async function reload() { if (dirty && isOwner()) await save(); const r = await api("/uni/courses/" + id); Object.assign(c, r.course); lessons = (c.lessons || []).map((l) => ({ ...l })); const y = window.scrollY; draw(); window.scrollTo(0, y); } // unsaved lesson edits are saved first so nothing is lost
  draw();
}
