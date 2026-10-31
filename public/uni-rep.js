/* 360 University, rep side: assigned courses, lessons, the test and results. Uses UniRender for lesson pages. */
(function () {
  "use strict";
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const when = (iso) => (iso ? new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }) : "");
  const PILL = { passed: ["Passed", "#15734a", "#e3f4eb"], locked: ["Locked", "#9b1c1c", "#fdecec"], retry: ["Try again", "#8a5a00", "#faefd6"], in_progress: ["In progress", "#0b4d96", "#e9f1fb"], not_started: ["Not started", "#5d6879", "#eef1f5"] };
  const pill = (s) => { const p = PILL[s] || PILL.not_started; return `<span style="display:inline-block;padding:3px 10px;border-radius:999px;font-size:.75rem;font-weight:800;color:${p[1]};background:${p[2]}">${p[0]}</span>`; };
  const css = document.createElement("style");
  css.textContent = `.uni-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,17rem),1fr));gap:12px}
    .uni-card{border:1px solid var(--line,#e3e8ec);border-radius:16px;padding:14px;background:var(--card,#fff);display:flex;flex-direction:column;gap:8px;cursor:pointer}
    .uni-card:hover{border-color:#0b4d96}.uni-card h3{margin:0;font-size:1.05rem;display:flex;gap:8px;align-items:flex-start}.uni-card .ic{font-size:1.5rem;line-height:1}
    .uni-bar{height:6px;border-radius:99px;background:var(--line,#e3e8ec);overflow:hidden}.uni-bar i{display:block;height:100%;background:#0b4d96}
    .uni-chips{display:flex;flex-wrap:wrap;gap:6px;margin:6px 0 12px}.uni-chips button{border:1px solid var(--line,#e3e8ec);background:var(--card,#fff);border-radius:999px;padding:6px 12px;font:inherit;font-size:.82rem;cursor:pointer}
    .uni-chips button.on{background:#0f1b33;color:#fff;border-color:#0f1b33}.uni-chips button.done:not(.on){border-color:#15734a;color:#15734a}
    .uni-q{border:1px solid var(--line,#e3e8ec);border-radius:14px;padding:12px 14px;background:var(--card,#fff);margin-bottom:10px}
    .uni-q h4{margin:0 0 8px;font-size:1rem}.uni-q label{display:flex;gap:10px;align-items:flex-start;padding:8px 10px;border-radius:10px;cursor:pointer;border:1px solid transparent}
    .uni-q label:hover{background:rgba(11,77,150,.05)}.uni-q input{margin-top:3px}.uni-q label:has(input:checked){border-color:#0b4d96;background:rgba(11,77,150,.07)}
    .uni-res{border-radius:16px;padding:16px;color:#fff;background:#0f1b33}.uni-res b{font-size:2rem}
    .uni-rv{border:1px solid var(--line,#e3e8ec);border-radius:12px;padding:10px 12px;margin:6px 0;background:var(--card,#fff)}`;
  document.head.appendChild(css);

  let PANE = null, API = null, TOAST = (m) => alert(m);
  async function list() {
    const j = await API("/uni");
    const done = j.courses.filter((c) => c.status === "passed").length;
    PANE.innerHTML = `<header><h1>🎓 360 University</h1><span class="muted">${done} of ${j.courses.length} passed</span></header>
      ${j.preview ? `<div class="panel" data-nofold style="border-color:#d97706">Preview: you are looking at this rep's courses. Only the rep can take the tests.</div>` : ""}
      <p class="muted">Read each lesson, then take the test. You need the pass mark within the allowed attempts; after that the course locks and your admin is told.</p>
      ${j.courses.length ? `<div class="uni-grid">${j.courses.map((c) => `<div class="uni-card" data-c="${c.id}" role="button" tabindex="0">
          <h3><span class="ic">${esc(c.icon)}</span><span>${esc(c.title)}</span></h3>
          <div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center">${pill(c.status)}<span class="muted" style="font-size:.8rem">${c.lessons} lessons · about ${c.minutes} min</span></div>
          <div class="muted" style="font-size:.86rem">${esc(c.blurb)}</div>
          <div class="uni-bar"><i style="width:${c.lessons ? Math.round(c.read / c.lessons * 100) : 0}%"></i></div>
          <div class="muted" style="font-size:.8rem">${c.status === "passed" ? `Passed ${when(c.passed_at)} · best ${c.best}%` : c.status === "locked" ? `Locked after ${c.attempts} attempts · best ${c.best}%` : `${c.read} of ${c.lessons} lessons read · test: ${c.test_count} questions, ${c.pass_pct}% to pass, ${c.max_attempts - c.attempts} ${c.max_attempts - c.attempts === 1 ? "try" : "tries"} left`}</div>
        </div>`).join("")}</div>` : `<div class="panel" data-nofold><p class="muted">No courses assigned to you yet.</p></div>`}`;
    PANE.onclick = (e) => { const c = e.target.closest("[data-c]"); if (c) course(+c.dataset.c); };
  }
  async function course(id, at) {
    const { course: c, preview } = await API("/uni/" + id);
    let i = at != null ? at : Math.max(0, c.read.length < c.lessons.length ? [...c.lessons.keys()].find((k) => !c.read.includes(k)) : 0);
    const draw = () => {
      const allRead = c.lessons.every((_, k) => c.read.includes(k));
      PANE.innerHTML = `<header><h1>${esc(c.icon)} ${esc(c.title)}</h1><button class="btn" type="button" id="uBack">‹ All courses</button></header>
        <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-bottom:6px">${pill(c.status)}<span class="muted" style="font-size:.85rem">Test: ${c.test_count} questions · ${c.pass_pct}% to pass · ${c.max_attempts} attempts${c.attempts ? ` · ${c.attempts} used, best ${c.best}%` : ""}</span></div>
        <div class="uni-chips">${c.lessons.map((l, k) => `<button type="button" data-l="${k}" class="${k === i ? "on" : ""} ${c.read.includes(k) ? "done" : ""}">${c.read.includes(k) ? "✓ " : ""}${k + 1}. ${esc(l.title)}</button>`).join("")}</div>
        <div class="panel" data-nofold><h2 style="margin-top:0">Lesson ${i + 1} of ${c.lessons.length}: ${esc(c.lessons[i].title)}</h2><div class="u-lesson">${window.UniRender.render(c.lessons[i].body)}</div>
          <div style="display:flex;gap:8px;flex-wrap:wrap;justify-content:space-between;margin-top:14px">
            <button class="btn" type="button" id="uPrev"${i === 0 ? " disabled" : ""}>‹ Back</button>
            ${i < c.lessons.length - 1 ? `<button class="btn solid rep" type="button" id="uNext">Got it · next lesson ›</button>` : `<button class="btn solid rep" type="button" id="uDone">Got it · ${c.status === "passed" ? "done" : "go to the test"} ›</button>`}
          </div></div>
        ${c.status === "passed" ? `<div class="panel" data-nofold style="border-color:#15734a">✓ You passed this course ${when(c.passed_at)} with ${c.best}%. You can re-read the lessons any time.</div>`
          : c.status === "locked" ? `<div class="panel" data-nofold style="border-color:#9b1c1c">🔒 This course is locked after ${c.attempts} attempts. Your admin has been told and can unlock it for you.</div>`
          : `<div class="panel" data-nofold><h2 style="margin-top:0">Test</h2><p class="muted">${allRead ? "You've read every lesson. Take the test when you're ready." : `Read all ${c.lessons.length} lessons to open the test (${c.read.length} done).`} You have ${c.max_attempts - c.attempts} ${c.max_attempts - c.attempts === 1 ? "attempt" : "attempts"} left.</p>
            <button class="btn solid rep" type="button" id="uTest"${allRead && !preview ? "" : " disabled"}>${c.open ? "Continue the test" : "Start the test"}</button></div>`}`;
      window.scrollTo(0, 0);
      PANE.onclick = async (e) => {
        const l = e.target.closest("[data-l]"); if (l) { i = +l.dataset.l; return draw(); }
        if (e.target.id === "uBack") return list();
        if (e.target.id === "uPrev") { i--; return draw(); }
        if (e.target.id === "uNext" || e.target.id === "uDone") {
          if (!c.read.includes(i)) { const r = await API("/uni/" + id + "/read", { method: "POST", body: { lesson: i } }); if (r.read) c.read = r.read; else c.read.push(i); }
          if (e.target.id === "uNext") { i++; return draw(); }
          if (c.status === "passed" || c.status === "locked") return list();
          draw(); const t = document.getElementById("uTest"); if (t) t.scrollIntoView({ behavior: "smooth", block: "center" }); return;
        }
        if (e.target.id === "uTest") return test(id, c);
      };
    };
    draw();
  }
  async function test(id, c) {
    const t = await API("/uni/" + id + "/start", { method: "POST", body: {} });
    PANE.innerHTML = `<header><h1>${esc(c.icon)} ${esc(c.title)} · test</h1></header>
      <div class="panel" data-nofold><strong>Attempt ${t.attempt} of ${t.of}</strong> · ${t.questions.length} questions · ${t.pass_pct}% to pass. Pick one answer for each question.</div>
      <form id="uForm">${t.questions.map((x, n) => `<div class="uni-q"><h4>${n + 1}. ${esc(x.q)}</h4>${x.options.map((o) => `<label><input type="radio" name="q${x.id}" value="${o.i}" required><span>${esc(o.text)}</span></label>`).join("")}</div>`).join("")}
        <div class="panel" data-nofold style="display:flex;gap:10px;flex-wrap:wrap;align-items:center;justify-content:space-between"><span class="muted" id="uLeft"></span><button class="btn solid rep" type="submit">Submit answers</button></div></form>`;
    window.scrollTo(0, 0);
    const form = document.getElementById("uForm"), left = () => { const n = t.questions.filter((x) => form.querySelector(`input[name="q${x.id}"]:checked`)).length; document.getElementById("uLeft").textContent = `${n} of ${t.questions.length} answered`; };
    form.onchange = left; left();
    PANE.onclick = null;
    form.onsubmit = async (e) => {
      e.preventDefault();
      const answers = {}; t.questions.forEach((x) => { const v = form.querySelector(`input[name="q${x.id}"]:checked`); if (v) answers[x.id] = +v.value; });
      if (Object.keys(answers).length < t.questions.length) return TOAST("Answer every question first.");
      if (!confirm("Submit your answers? This uses attempt " + t.attempt + " of " + t.of + ".")) return;
      const r = await API("/uni/" + id + "/submit", { method: "POST", body: { answers } });
      result(id, c, r);
    };
  }
  function result(id, c, r) {
    const left = r.of - r.attempts;
    PANE.innerHTML = `<header><h1>${esc(c.icon)} ${esc(c.title)}</h1><button class="btn" type="button" id="uBack">‹ All courses</button></header>
      <div class="uni-res" style="background:${r.passed ? "#15734a" : r.locked ? "#9b1c1c" : "#0f1b33"}"><b>${r.pct}%</b> <span>${r.score} of ${r.total} correct · ${r.pass_pct}% needed</span>
        <div style="margin-top:6px;font-weight:700">${r.passed ? "🎉 You passed. Your admin has been told." : r.locked ? "🔒 Not passed, and that was your last attempt. The course is locked; your admin has been told and can unlock it." : `Not passed yet. You have ${left} ${left === 1 ? "attempt" : "attempts"} left; the next test draws new questions.`}</div></div>
      ${r.study && r.study.length && !r.passed ? `<div class="panel" data-nofold><h2 style="margin-top:0">Review these lessons</h2><div class="uni-chips">${r.study.map((s) => `<button type="button" data-l="${s.n - 1}">${s.n}. ${esc(s.title)}</button>`).join("")}</div></div>` : ""}
      ${r.review ? `<div class="panel" data-nofold><h2 style="margin-top:0">Your answers</h2>${r.review.map((x, n) => `<div class="uni-rv"><div><strong>${n + 1}. ${esc(x.q)}</strong></div><div style="color:${x.ok ? "#15734a" : "#9b1c1c"}">${x.ok ? "✓" : "✗"} Your answer: ${esc(x.picked)}</div>${x.ok ? "" : `<div>Correct: <strong>${esc(x.answer)}</strong></div>`}${x.why ? `<div class="muted" style="font-size:.86rem">${esc(x.why)}</div>` : ""}</div>`).join("")}</div>` : ""}
      ${!r.passed && !r.locked ? `<button class="btn solid rep" type="button" id="uAgain">Back to the lessons</button>` : ""}`;
    window.scrollTo(0, 0);
    PANE.onclick = (e) => { const l = e.target.closest("[data-l]"); if (l) return course(id, +l.dataset.l); if (e.target.id === "uBack") return list(); if (e.target.id === "uAgain") return course(id, 0); };
  }
  window.UniRep = { open(pane, api, toast) { PANE = pane; TOAST = toast || TOAST; API = (p, o) => api(p, o); return list(); } };
})();
