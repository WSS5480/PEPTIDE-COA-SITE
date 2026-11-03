/* 360 University: training courses, tests and assignments for reps.
   Courses live in the database (seeded once from university-content.js, then edited in Admin → 360 University).
   A test draws random questions from the course's bank; the rep has max_attempts tries (default 2) to reach pass_pct,
   then the course locks until an admin unlocks it. Admins are told when a rep passes or gets locked. */
const crypto = require("crypto");
const { COURSES } = require("./university-content");

const SCHEMA = `
create table if not exists uni_courses (
  id serial primary key, builtin_key text unique, title text not null, blurb text not null default '', icon text not null default '🎓',
  audience text not null default 'none', minutes int not null default 20, pass_pct int not null default 80, test_count int not null default 10,
  max_attempts int not null default 2, lessons jsonb not null default '[]', active boolean not null default true, sort int not null default 0,
  updated_at timestamptz not null default now(), updated_by text
);
create table if not exists uni_questions (
  id serial primary key, course_id int not null references uni_courses(id) on delete cascade, q text not null, options jsonb not null,
  correct int not null default 0, why text not null default '', lesson int, active boolean not null default true, sort int not null default 0
);
create index if not exists uni_questions_course on uni_questions(course_id, sort);
create table if not exists uni_assign (
  id serial primary key, user_id int not null references users(id) on delete cascade, course_id int not null references uni_courses(id) on delete cascade,
  assigned_at timestamptz not null default now(), assigned_by text, attempts int not null default 0, best int, last_score int,
  passed_at timestamptz, locked_at timestamptz, lessons_read jsonb not null default '[]', draw jsonb, unlocks int not null default 0,
  unique (user_id, course_id)
);
create table if not exists uni_attempts (
  id serial primary key, assign_id int references uni_assign(id) on delete set null, user_id int not null, course_id int not null,
  score int not null, total int not null, pct int not null, passed boolean not null, answers jsonb, at timestamptz not null default now()
);
create table if not exists uni_files (id text primary key, name text, type text, data bytea, size int, at timestamptz not null default now());
`;

const AUDIENCES = { surgical: "Surgical reps (case tracker)", wound: "Wound care reps (case tracker)", all: "Every case-tracker rep", peptide: "Peptide store reps", none: "Assign by hand only" };
const SAFE_TYPES = /^(image\/(png|jpeg|webp|gif)|application\/pdf|text\/plain)$/;

module.exports = function university({ app, admin, rep, q, wrap, bad, str, intOrNull, mail, getSettings, emailHtml, escHtml, isEmail, BASE_URL, notifyTracker }) {
  /* ---------- setup + seed ---------- */
  async function init() {
    await q(SCHEMA);
    const { rows: [mark] } = await q("select value from settings where key = 'uniDeletedBuiltins'");
    const deleted = new Set((mark && mark.value) || []);
    for (const [i, c] of COURSES.entries()) {
      if (deleted.has(c.key)) continue;
      const { rows: [ex] } = await q("select id from uni_courses where builtin_key = $1", [c.key]);
      if (ex) continue;
      const { rows: [n] } = await q(`insert into uni_courses(builtin_key, title, blurb, icon, audience, minutes, pass_pct, test_count, max_attempts, lessons, sort, updated_by)
        values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'360 University') returning id`, [c.key, c.title, c.blurb, c.icon, c.audience, c.minutes, c.pass_pct, c.test_count, c.max_attempts, JSON.stringify(c.lessons), i]);
      for (const [j, x] of c.questions.entries()) await q("insert into uni_questions(course_id, q, options, correct, why, lesson, sort) values ($1,$2,$3,$4,$5,$6,$7)", [n.id, x.q, JSON.stringify(x.options), x.correct, x.why || "", x.lesson || null, j]);
    }
  }

  /* ---------- helpers ---------- */
  const shuffle = (a) => { const b = a.slice(); for (let i = b.length - 1; i > 0; i--) { const j = crypto.randomInt(i + 1); [b[i], b[j]] = [b[j], b[i]]; } return b; };
  const status = (a) => (a.passed_at ? "passed" : a.locked_at ? "locked" : a.attempts > 0 ? "retry" : (a.lessons_read || []).length ? "in_progress" : "not_started");
  const cleanLessons = (ls) => (Array.isArray(ls) ? ls : []).slice(0, 60).map((l) => ({ title: str(l && l.title, 160) || "Lesson", body: String((l && l.body) || "").slice(0, 60000) }));
  const cleanQuestion = (b) => {
    const options = (Array.isArray(b.options) ? b.options : []).map((o) => String(o || "").trim().slice(0, 400)).filter(Boolean).slice(0, 6);
    const correct = intOrNull(b.correct);
    if (!String(b.q || "").trim()) throw new Error("Type the question.");
    if (options.length < 2) throw new Error("Give at least two answer choices.");
    if (correct === null || correct < 0 || correct >= options.length) throw new Error("Mark which answer is correct.");
    return { q: String(b.q).trim().slice(0, 1000), options, correct, why: str(b.why, 1000), lesson: intOrNull(b.lesson) || null, active: b.active !== false };
  };
  async function catalogText() {
    const { rows } = await q("select name, strength, manufacturer from products where active and price_cents is not null order by name, strength limit 300");
    if (!rows.length) return "Our current catalog is on the store page.";
    const by = {}; rows.forEach((r) => { (by[r.name] = by[r.name] || []).push([r.strength, r.manufacturer].filter(Boolean).join(" · ")); });
    return Object.entries(by).map(([n, v]) => `${n} :: ${v.join(", ")}`).join("\n");
  }
  async function admins() { const { rows } = await q("select email from users where role = 'owner' and active and email is not null"); return rows.map((r) => r.email).filter(isEmail); }
  async function tellAdmins(kind, who, course, pct, attempts) {
    const title = kind === "passed" ? `${who} passed ${course.title}` : `${who} is locked out of ${course.title}`;
    const body = kind === "passed" ? `${who} passed "${course.title}" with ${pct}% on attempt ${attempts}.` : `${who} did not reach ${course.pass_pct}% in ${attempts} attempts on "${course.title}" (last score ${pct}%). The course is locked until you unlock it in Admin → 360 University.`;
    try { if (notifyTracker) notifyTracker(title, body); } catch (e) {}
    try {
      const s = await getSettings(), to = await admins(); if (!to.length) return;
      const html = emailHtml(s, { eyebrow: "360 University", kicker: kind === "passed" ? "Course passed" : "Course locked", title, badge: { text: kind === "passed" ? "Passed" : "Locked", tone: kind === "passed" ? "ok" : "bad" },
        intro: escHtml(body), facts: [["Rep", escHtml(who)], ["Course", escHtml(course.title)], ["Score", pct + "%"], ["Attempts", String(attempts)]],
        button: BASE_URL ? { text: "Open 360 University", url: `${BASE_URL}/admin#university` } : null, footer: "Sent to the store's admins." });
      await mail.send({ to: to.join(", "), subject: `360 University · ${title}`, text: body, html }, s);
    } catch (e) { console.error("University email failed:", e.message); }
  }

  // default courses for a new rep: case-tracker reps get the surgical / wound / all courses, store reps the peptide course
  async function autoAssign(userId, apps, by) {
    const want = [];
    if (!apps || apps.tracker !== false) want.push("surgical", "wound", "all");
    if (!apps || apps.store !== false) want.push("peptide");
    const { rows } = await q("select id from uni_courses where active and audience = any($1)", [want]);
    for (const r of rows) await q("insert into uni_assign(user_id, course_id, assigned_by) values ($1,$2,$3) on conflict do nothing", [userId, r.id, by || "Auto"]);
    return rows.length;
  }
  async function setAssignments(userId, courseIds, by) {
    const ids = (Array.isArray(courseIds) ? courseIds : []).map(intOrNull).filter(Boolean);
    await q("delete from uni_assign where user_id = $1 and not (course_id = any($2::int[]))", [userId, ids]);
    for (const id of ids) await q("insert into uni_assign(user_id, course_id, assigned_by) values ($1,$2,$3) on conflict do nothing", [userId, id, by]);
  }

  /* ---------- rep side ---------- */
  rep.get("/uni", wrap(async (req, res) => {
    const { rows } = await q(`select a.*, c.title, c.icon, c.blurb, c.minutes, c.pass_pct, c.max_attempts, c.test_count, jsonb_array_length(c.lessons) lessons
      from uni_assign a join uni_courses c on c.id = a.course_id where a.user_id = $1 and c.active order by c.sort, c.id`, [req.repId]);
    res.json({ preview: !!req.asRep, courses: rows.map((r) => ({ id: r.course_id, title: r.title, icon: r.icon, blurb: r.blurb, minutes: r.minutes, pass_pct: r.pass_pct, max_attempts: r.max_attempts, test_count: r.test_count, lessons: r.lessons, read: (r.lessons_read || []).length, attempts: r.attempts, best: r.best, last: r.last_score, status: status(r), passed_at: r.passed_at, locked_at: r.locked_at })) });
  }));
  async function mine(req, courseId) {
    const { rows: [a] } = await q("select a.*, c.title, c.icon, c.blurb, c.minutes, c.pass_pct, c.max_attempts, c.test_count, c.lessons from uni_assign a join uni_courses c on c.id = a.course_id where a.user_id = $1 and a.course_id = $2 and c.active", [req.repId, courseId]);
    return a;
  }
  rep.get("/uni/:id", wrap(async (req, res) => {
    const a = await mine(req, intOrNull(req.params.id)); if (!a) return bad(res, "That course isn't assigned to you.", 404);
    const cat = (a.lessons || []).some((l) => (l.body || "").includes("{{catalog}}")) ? await catalogText() : "";
    res.json({ preview: !!req.asRep, course: { id: a.course_id, title: a.title, icon: a.icon, blurb: a.blurb, minutes: a.minutes, pass_pct: a.pass_pct, max_attempts: a.max_attempts, test_count: a.test_count,
      lessons: (a.lessons || []).map((l) => ({ title: l.title, body: (l.body || "").replace("{{catalog}}", cat) })), read: a.lessons_read || [], attempts: a.attempts, best: a.best, last: a.last_score, status: status(a), passed_at: a.passed_at, locked_at: a.locked_at, open: !!a.draw } });
  }));
  rep.post("/uni/:id/read", wrap(async (req, res) => {
    const a = await mine(req, intOrNull(req.params.id)); if (!a) return bad(res, "That course isn't assigned to you.", 404);
    if (req.asRep) return res.json({ ok: true, preview: true });
    const n = intOrNull((req.body || {}).lesson); if (n === null || n < 0 || n >= (a.lessons || []).length) return bad(res, "Which lesson?");
    const read = Array.from(new Set([...(a.lessons_read || []), n])).sort((x, y) => x - y);
    await q("update uni_assign set lessons_read = $1 where id = $2", [JSON.stringify(read), a.id]);
    res.json({ ok: true, read });
  }));
  rep.post("/uni/:id/start", wrap(async (req, res) => {
    const a = await mine(req, intOrNull(req.params.id)); if (!a) return bad(res, "That course isn't assigned to you.", 404);
    if (req.asRep) return bad(res, "This is a preview of the rep's view. Only the rep can take the test.");
    if (a.passed_at) return bad(res, "You already passed this course.");
    if (a.locked_at) return bad(res, "This course is locked. Your admin has been told and can unlock it.");
    if ((a.lessons_read || []).length < (a.lessons || []).length) return bad(res, "Read every lesson first, then take the test.");
    let draw = a.draw;
    if (!draw || !Array.isArray(draw.q) || !draw.q.length) {
      const { rows: bank } = await q("select id, options from uni_questions where course_id = $1 and active order by random()", [a.course_id]);
      if (!bank.length) return bad(res, "This course has no test questions yet. Tell your admin.");
      draw = { q: bank.slice(0, Math.max(1, a.test_count)).map((x) => ({ id: x.id, order: shuffle(x.options.map((_, i) => i)) })), at: new Date().toISOString() };
      await q("update uni_assign set draw = $1 where id = $2", [JSON.stringify(draw), a.id]);
    }
    const { rows: qs } = await q("select id, q, options from uni_questions where id = any($1::int[])", [draw.q.map((x) => x.id)]);
    const byId = Object.fromEntries(qs.map((x) => [x.id, x]));
    res.json({ attempt: a.attempts + 1, of: a.max_attempts, pass_pct: a.pass_pct, questions: draw.q.filter((d) => byId[d.id]).map((d) => ({ id: d.id, q: byId[d.id].q, options: d.order.filter((i) => i < byId[d.id].options.length).map((i) => ({ i, text: byId[d.id].options[i] })) })) });
  }));
  rep.post("/uni/:id/submit", wrap(async (req, res) => {
    const a = await mine(req, intOrNull(req.params.id)); if (!a) return bad(res, "That course isn't assigned to you.", 404);
    if (req.asRep) return bad(res, "Preview only.");
    if (a.passed_at || a.locked_at || !a.draw) return bad(res, "There's no test open for this course.");
    const ans = (req.body || {}).answers || {};
    const ids = a.draw.q.map((x) => x.id);
    const { rows: qs } = await q("select id, q, options, correct, why, lesson from uni_questions where id = any($1::int[])", [ids]);
    const byId = Object.fromEntries(qs.map((x) => [x.id, x]));
    const graded = ids.filter((id) => byId[id]).map((id) => { const x = byId[id], pick = intOrNull(ans[id]); return { id, q: x.q, pick, ok: pick === x.correct, correct: x.correct, options: x.options, why: x.why, lesson: x.lesson }; });
    if (graded.some((g) => g.pick === null)) return bad(res, "Answer every question before you submit.");
    const score = graded.filter((g) => g.ok).length, total = graded.length, pct = Math.round(score / total * 100), passed = pct >= a.pass_pct, attempts = a.attempts + 1;
    const locked = !passed && attempts >= a.max_attempts;
    await q("insert into uni_attempts(assign_id, user_id, course_id, score, total, pct, passed, answers) values ($1,$2,$3,$4,$5,$6,$7,$8)", [a.id, req.repId, a.course_id, score, total, pct, passed, JSON.stringify(graded.map((g) => ({ id: g.id, pick: g.pick, ok: g.ok })))]);
    await q(`update uni_assign set attempts = $1, last_score = $2, best = greatest(coalesce(best, 0), $2), draw = null, passed_at = case when $3 then now() else passed_at end, locked_at = case when $4 then now() else locked_at end where id = $5`, [attempts, pct, passed, locked, a.id]);
    if (passed || locked) tellAdmins(passed ? "passed" : "locked", req.user.name || req.user.email, a, pct, attempts);
    const lessons = a.lessons || [];
    // answers are shown once the course is finished (passed or locked); before a retry, only which lessons to review
    res.json({ score, total, pct, passed, locked, attempts, of: a.max_attempts, pass_pct: a.pass_pct,
      review: passed || locked ? graded.map((g) => ({ q: g.q, ok: g.ok, picked: g.options[g.pick], answer: g.options[g.correct], why: g.why })) : null,
      study: !passed ? Array.from(new Set(graded.filter((g) => !g.ok && g.lesson).map((g) => g.lesson))).sort((x, y) => x - y).map((n) => ({ n, title: (lessons[n - 1] || {}).title || "Lesson " + n })) : [] });
  }));

  /* ---------- files (lesson images and PDFs) ---------- */
  app.get("/api/uni/file/:id", wrap(async (req, res) => {
    const { rows: [f] } = await q("select name, type, data from uni_files where id = $1", [String(req.params.id).slice(0, 40)]);
    if (!f) return res.status(404).end();
    res.set("Content-Type", f.type); res.set("Cache-Control", "private, max-age=86400"); res.set("Content-Disposition", `inline; filename="${String(f.name || "file").replace(/[^\w. -]/g, "")}"`); res.send(f.data);
  }));

  /* ---------- admin side ---------- */
  const team = (req, res, next) => (req.user.role === "rep" ? bad(res, "Admins only.", 403) : next());
  admin.get("/uni", team, wrap(async (req, res) => {
    const { rows: courses } = await q(`select c.id, c.builtin_key, c.title, c.icon, c.blurb, c.audience, c.minutes, c.pass_pct, c.test_count, c.max_attempts, c.active, c.sort, c.updated_at, c.updated_by,
        jsonb_array_length(c.lessons) lessons, (select count(*)::int from uni_questions x where x.course_id = c.id and x.active) questions,
        (select count(*)::int from uni_assign a where a.course_id = c.id) assigned, (select count(*)::int from uni_assign a where a.course_id = c.id and a.passed_at is not null) passed
      from uni_courses c order by c.sort, c.id`);
    const { rows: reps } = await q("select id, name, email, apps from users where role = 'rep' and active order by name");
    const { rows: asg } = await q("select a.id, a.user_id, a.course_id, a.attempts, a.best, a.last_score, a.passed_at, a.locked_at, a.lessons_read, a.assigned_at, a.unlocks, a.draw is not null open from uni_assign a join users u on u.id = a.user_id where u.active");
    res.json({ audiences: AUDIENCES, courses, reps: reps.map((r) => ({ ...r, courses: asg.filter((a) => a.user_id === r.id).map((a) => ({ ...a, status: status(a), read: (a.lessons_read || []).length })) })) });
  }));
  admin.get("/uni/attempts/:assignId", team, wrap(async (req, res) => {
    const { rows } = await q("select id, score, total, pct, passed, at from uni_attempts where assign_id = $1 order by at", [intOrNull(req.params.assignId)]);
    res.json({ attempts: rows });
  }));
  admin.post("/uni/assign", team, wrap(async (req, res) => {
    const uid = intOrNull((req.body || {}).userId); const { rows: [u] } = await q("select id from users where id = $1", [uid]); if (!u) return bad(res, "Pick a rep.");
    await setAssignments(uid, (req.body || {}).courseIds, req.user.name || req.user.email); res.json({ ok: true });
  }));
  admin.post("/uni/assign-course", team, wrap(async (req, res) => { // give one course to several reps at once
    const cid = intOrNull((req.body || {}).courseId), ids = ((req.body || {}).userIds || []).map(intOrNull).filter(Boolean);
    for (const id of ids) await q("insert into uni_assign(user_id, course_id, assigned_by) values ($1,$2,$3) on conflict do nothing", [id, cid, req.user.name || req.user.email]);
    res.json({ ok: true, added: ids.length });
  }));
  admin.post("/uni/assign/:id/:act", team, wrap(async (req, res) => {
    const id = intOrNull(req.params.id), act = req.params.act;
    if (act === "unlock") await q("update uni_assign set attempts = 0, locked_at = null, draw = null, unlocks = unlocks + 1 where id = $1", [id]);
    else if (act === "reset") await q("update uni_assign set attempts = 0, locked_at = null, passed_at = null, best = null, last_score = null, draw = null, lessons_read = '[]' where id = $1", [id]);
    else if (act === "remove") await q("delete from uni_assign where id = $1", [id]);
    else return bad(res, "Unknown action.");
    res.json({ ok: true });
  }));
  // courses
  const owner = (req, res, next) => (req.user.role === "owner" ? next() : bad(res, "Only an admin can edit courses.", 403));
  async function fullCourse(id) {
    const { rows: [c] } = await q("select * from uni_courses where id = $1", [id]); if (!c) return null;
    const { rows: qs } = await q("select id, q, options, correct, why, lesson, active, sort from uni_questions where course_id = $1 order by sort, id", [id]);
    return { ...c, questions: qs };
  }
  admin.get("/uni/courses/:id", team, wrap(async (req, res) => { const c = await fullCourse(intOrNull(req.params.id)); if (!c) return bad(res, "Course not found.", 404); res.json({ course: c, audiences: AUDIENCES }); }));
  async function saveCourse(id, b, by) {
    const title = str(b.title, 160); if (!title) throw new Error("Give the course a title.");
    const audience = AUDIENCES[b.audience] ? b.audience : "none";
    const pass = Math.min(100, Math.max(1, intOrNull(b.pass_pct) || 80)), count = Math.min(100, Math.max(1, intOrNull(b.test_count) || 10)), tries = Math.min(10, Math.max(1, intOrNull(b.max_attempts) || 2));
    const vals = [title, str(b.blurb, 600), str(b.icon, 8) || "🎓", audience, Math.max(1, intOrNull(b.minutes) || 20), pass, count, tries, JSON.stringify(cleanLessons(b.lessons)), b.active !== false, by];
    if (id) { await q("update uni_courses set title=$1, blurb=$2, icon=$3, audience=$4, minutes=$5, pass_pct=$6, test_count=$7, max_attempts=$8, lessons=$9, active=$10, updated_by=$11, updated_at=now() where id=$12", [...vals, id]); return id; }
    const { rows: [n] } = await q("insert into uni_courses(title, blurb, icon, audience, minutes, pass_pct, test_count, max_attempts, lessons, active, updated_by, sort) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,(select coalesce(max(sort),0)+1 from uni_courses)) returning id", vals);
    return n.id;
  }
  admin.post("/uni/courses", owner, wrap(async (req, res) => { // new course, blank or from an uploaded course file (with its questions)
    const b = (req.body || {}).course || req.body || {};
    let id; try { id = await saveCourse(null, b, req.user.name || req.user.email); } catch (e) { return bad(res, e.message); }
    let added = 0, skipped = 0;
    for (const [i, x] of (Array.isArray(b.questions) ? b.questions : []).entries()) { try { const c = cleanQuestion(x); await q("insert into uni_questions(course_id, q, options, correct, why, lesson, active, sort) values ($1,$2,$3,$4,$5,$6,$7,$8)", [id, c.q, JSON.stringify(c.options), c.correct, c.why, c.lesson, c.active, i]); added++; } catch (e) { skipped++; } }
    res.json({ ok: true, id, added, skipped });
  }));
  admin.put("/uni/courses/:id", owner, wrap(async (req, res) => { try { await saveCourse(intOrNull(req.params.id), req.body || {}, req.user.name || req.user.email); } catch (e) { return bad(res, e.message); } res.json({ ok: true }); }));
  admin.post("/uni/courses/:id/move", owner, wrap(async (req, res) => {
    const { rows } = await q("select id from uni_courses order by sort, id"); const ids = rows.map((r) => r.id), i = ids.indexOf(intOrNull(req.params.id)), j = i + ((req.body || {}).dir === "up" ? -1 : 1);
    if (i >= 0 && j >= 0 && j < ids.length) { [ids[i], ids[j]] = [ids[j], ids[i]]; for (const [k, id] of ids.entries()) await q("update uni_courses set sort = $1 where id = $2", [k, id]); }
    res.json({ ok: true });
  }));
  admin.post("/uni/courses/:id/duplicate", owner, wrap(async (req, res) => {
    const c = await fullCourse(intOrNull(req.params.id)); if (!c) return bad(res, "Course not found.", 404);
    const id = await saveCourse(null, { ...c, title: c.title + " (copy)", active: false }, req.user.name || req.user.email);
    for (const x of c.questions) await q("insert into uni_questions(course_id, q, options, correct, why, lesson, active, sort) values ($1,$2,$3,$4,$5,$6,$7,$8)", [id, x.q, JSON.stringify(x.options), x.correct, x.why, x.lesson, x.active, x.sort]);
    res.json({ ok: true, id });
  }));
  admin.delete("/uni/courses/:id", owner, wrap(async (req, res) => {
    const { rows: [c] } = await q("select builtin_key from uni_courses where id = $1", [intOrNull(req.params.id)]); if (!c) return bad(res, "Course not found.", 404);
    if (c.builtin_key) await q(`insert into settings(key, value) values ('uniDeletedBuiltins', $1) on conflict (key) do update set value = (select to_jsonb(array(select distinct jsonb_array_elements_text(settings.value || $1))))`, [JSON.stringify([c.builtin_key])]);
    await q("delete from uni_courses where id = $1", [intOrNull(req.params.id)]); res.json({ ok: true });
  }));
  // the course as a PDF: admins get the answer key at the back, reps the same book without it
  const { coursePdf } = require("./university-pdf");
  const pdfName = (t) => `360 University - ${String(t).replace(/[^\w .,&+()-]/g, "").trim() || "course"}.pdf`;
  async function uniImage(id) { // a lesson's uploaded picture, as PNG/JPEG for the PDF
    const { rows: [f] } = await q("select type, data from uni_files where id = $1", [String(id).slice(0, 40)]); if (!f || !f.data) return null;
    if (/^image\/(png|jpeg)$/.test(f.type || "")) return f.data;
    if (/^image\//.test(f.type || "")) { try { return await require("sharp")(f.data).png().toBuffer(); } catch (e) { return null; } }
    return null;
  }
  async function sendPdf(res, course, answers) {
    const s = await getSettings();
    const cat = (course.lessons || []).some((l) => (l.body || "").includes("{{catalog}}")) ? await catalogText() : "";
    const lessons = (course.lessons || []).map((l) => ({ title: l.title, body: (l.body || "").replace("{{catalog}}", cat) }));
    const pdf = await coursePdf({ ...course, lessons }, { answers, brand: s.brand || "360 Peptides", audienceLabel: AUDIENCES[course.audience], images: uniImage });
    res.set("Content-Type", "application/pdf"); res.set("Content-Disposition", `attachment; filename="${pdfName(course.title)}"`); res.set("Cache-Control", "no-store"); res.send(pdf);
  }
  admin.get("/uni/courses/:id/pdf", team, wrap(async (req, res) => {
    const c = await fullCourse(intOrNull(req.params.id)); if (!c) return bad(res, "Course not found.", 404);
    await sendPdf(res, c, true);
  }));
  rep.get("/uni/:id/pdf", wrap(async (req, res) => {
    const a = await mine(req, intOrNull(req.params.id)); if (!a) return bad(res, "That course isn't assigned to you.", 404);
    const c = await fullCourse(a.course_id); if (!c) return bad(res, "Course not found.", 404);
    await sendPdf(res, c, false);
  }));
  admin.get("/uni/courses/:id/export", team, wrap(async (req, res) => {
    const c = await fullCourse(intOrNull(req.params.id)); if (!c) return bad(res, "Course not found.", 404);
    const out = { format: "360-university-course", version: 1, title: c.title, blurb: c.blurb, icon: c.icon, audience: c.audience, minutes: c.minutes, pass_pct: c.pass_pct, test_count: c.test_count, max_attempts: c.max_attempts, lessons: c.lessons,
      questions: c.questions.map((x) => ({ q: x.q, options: x.options, correct: x.correct, why: x.why, lesson: x.lesson, active: x.active })) };
    res.set("Content-Disposition", `attachment; filename="${c.title.replace(/[^\w -]/g, "").trim() || "course"}.json"`); res.json(out);
  }));
  // questions
  admin.post("/uni/courses/:id/questions", owner, wrap(async (req, res) => {
    let c; try { c = cleanQuestion(req.body || {}); } catch (e) { return bad(res, e.message); }
    const { rows: [n] } = await q("insert into uni_questions(course_id, q, options, correct, why, lesson, active, sort) values ($1,$2,$3,$4,$5,$6,$7,(select coalesce(max(sort),0)+1 from uni_questions where course_id = $1)) returning id", [intOrNull(req.params.id), c.q, JSON.stringify(c.options), c.correct, c.why, c.lesson, c.active]);
    res.json({ ok: true, id: n.id });
  }));
  admin.put("/uni/questions/:qid", owner, wrap(async (req, res) => {
    let c; try { c = cleanQuestion(req.body || {}); } catch (e) { return bad(res, e.message); }
    await q("update uni_questions set q=$1, options=$2, correct=$3, why=$4, lesson=$5, active=$6 where id=$7", [c.q, JSON.stringify(c.options), c.correct, c.why, c.lesson, c.active, intOrNull(req.params.qid)]);
    res.json({ ok: true });
  }));
  admin.delete("/uni/questions/:qid", owner, wrap(async (req, res) => { await q("delete from uni_questions where id = $1", [intOrNull(req.params.qid)]); res.json({ ok: true }); }));
  admin.post("/uni/questions/:qid/move", owner, wrap(async (req, res) => {
    const { rows: [x] } = await q("select course_id from uni_questions where id = $1", [intOrNull(req.params.qid)]); if (!x) return bad(res, "Not found", 404);
    const { rows } = await q("select id from uni_questions where course_id = $1 order by sort, id", [x.course_id]); const ids = rows.map((r) => r.id), i = ids.indexOf(intOrNull(req.params.qid)), j = i + ((req.body || {}).dir === "up" ? -1 : 1);
    if (j >= 0 && j < ids.length) { [ids[i], ids[j]] = [ids[j], ids[i]]; for (const [k, id] of ids.entries()) await q("update uni_questions set sort = $1 where id = $2", [k, id]); }
    res.json({ ok: true });
  }));
  admin.post("/uni/courses/:id/questions/import", owner, wrap(async (req, res) => { // rows parsed from a CSV upload: question, A..F, correct letter, explanation, lesson
    const id = intOrNull(req.params.id), rows = Array.isArray((req.body || {}).rows) ? req.body.rows.slice(0, 500) : [];
    if ((req.body || {}).replace) await q("delete from uni_questions where course_id = $1", [id]);
    let added = 0; const errors = [];
    for (const [i, r] of rows.entries()) { try { const c = cleanQuestion(r); await q("insert into uni_questions(course_id, q, options, correct, why, lesson, active, sort) values ($1,$2,$3,$4,$5,$6,true,(select coalesce(max(sort),0)+1 from uni_questions where course_id = $1))", [id, c.q, JSON.stringify(c.options), c.correct, c.why, c.lesson]); added++; } catch (e) { errors.push(`Row ${i + 2}: ${e.message}`); } }
    res.json({ ok: true, added, errors: errors.slice(0, 20) });
  }));
  // uploads: a lesson from a PDF / text file (text pulled out for editing), or an image / PDF to show inside a lesson
  admin.post("/uni/extract", owner, wrap(async (req, res) => {
    const m = /^data:([\w/.+-]+);base64,(.+)$/.exec(String((req.body || {}).data || "")); if (!m) return bad(res, "Choose a file.");
    const buf = Buffer.from(m[2], "base64"), name = str((req.body || {}).name, 160);
    let text = "";
    if (/pdf/.test(m[1]) || /\.pdf$/i.test(name)) { try { text = (await require("pdf-parse")(buf)).text || ""; } catch (e) { return bad(res, "Couldn't read that PDF. Try saving it again, or paste the text."); } }
    else if (/^text\//.test(m[1]) || /\.(txt|md|csv)$/i.test(name)) text = buf.toString("utf8");
    else return bad(res, "Upload a PDF, .txt or .md file. For Word documents, save as PDF first.");
    text = text.replace(/\r/g, "").replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
    res.json({ ok: true, text: text.slice(0, 60000), title: name.replace(/\.[^.]+$/, "") });
  }));
  admin.post("/uni/files", owner, wrap(async (req, res) => {
    const m = /^data:([\w/.+-]+);base64,(.+)$/.exec(String((req.body || {}).data || "")); if (!m || !SAFE_TYPES.test(m[1])) return bad(res, "Upload an image (PNG, JPG, WEBP) or a PDF.");
    const buf = Buffer.from(m[2], "base64"); if (buf.length > 12e6) return bad(res, "That file is over 12 MB.");
    const id = "u" + crypto.randomBytes(8).toString("hex");
    await q("insert into uni_files(id, name, type, data, size) values ($1,$2,$3,$4,$5)", [id, str((req.body || {}).name, 160), m[1], buf, buf.length]);
    res.json({ ok: true, id, kind: /pdf/.test(m[1]) ? "file" : "img" });
  }));
  return { init, autoAssign, setAssignments, AUDIENCES,
    async summary(userIds) { const { rows } = await q("select a.user_id, count(*)::int n, count(a.passed_at)::int passed, count(a.locked_at)::int locked from uni_assign a join uni_courses c on c.id = a.course_id and c.active where a.user_id = any($1::int[]) group by 1", [userIds]); return rows; },
    async lockedCount() { const { rows: [r] } = await q("select count(*)::int n from uni_assign a join users u on u.id = a.user_id and u.active join uni_courses c on c.id = a.course_id and c.active where a.locked_at is not null"); return r.n; } };
};
