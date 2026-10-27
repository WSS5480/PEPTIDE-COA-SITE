// Outgoing email. The sending account comes from Site settings → Order emails (saved in the database), or,
// when nothing is saved there, from the host's environment variables:
//   SMTP:    SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, MAIL_FROM
//   Resend:  RESEND_API_KEY, MAIL_FROM
// Microsoft 365: smtp.office365.com, 587, a real mailbox's email + password (Authenticated SMTP on for that mailbox)
// Google Workspace: smtp.gmail.com, 465, an app password
// With neither set, nothing is sent and every call reports "not configured".
const nodemailer = require("nodemailer");

// Works out which account to send with. `s` is the store's settings object (may be undefined).
function resolve(s = {}) {
  const env = process.env;
  const from = (fallback) => String(s.mailFrom || "").trim() || fallback;
  if (s.mailMode === "resend" && s.resendKey) return { kind: "resend", key: s.resendKey, from: from("onboarding@resend.dev"), detail: "Resend", source: "admin" };
  if (s.mailMode === "smtp" && s.mailHost && s.mailUser && s.mailPass) {
    const port = parseInt(s.mailPort, 10) || 587;
    return { kind: "smtp", host: String(s.mailHost).trim(), port, user: String(s.mailUser).trim(), pass: s.mailPass, from: from(s.mailUser), detail: `SMTP (${String(s.mailHost).trim()}:${port})`, source: "admin" };
  }
  if (s.mailMode === "smtp" || s.mailMode === "resend") return null; // chosen in admin but incomplete: don't fall back silently
  if (env.RESEND_API_KEY) return { kind: "resend", key: env.RESEND_API_KEY, from: env.MAIL_FROM || "onboarding@resend.dev", detail: "Resend", source: "host" };
  if (env.SMTP_HOST && env.SMTP_USER && env.SMTP_PASS) {
    const port = parseInt(env.SMTP_PORT, 10) || 465;
    return { kind: "smtp", host: env.SMTP_HOST, port, user: env.SMTP_USER, pass: env.SMTP_PASS, from: env.MAIL_FROM || env.SMTP_USER, detail: `SMTP (${env.SMTP_HOST}:${port})`, source: "host" };
  }
  return null;
}
const info = (s) => { const c = resolve(s); return c ? { ready: true, kind: c.kind, from: c.from, detail: c.detail, source: c.source } : { ready: false, kind: "", from: "", detail: "", source: "" }; };

let transport = null, transportKey = "";
function smtpTransport(c) {
  const key = [c.host, c.port, c.user, c.pass].join("|");
  if (!transport || transportKey !== key) {
    // 465 = TLS from the start (Google); 587 = STARTTLS (Microsoft 365, most others)
    transport = nodemailer.createTransport({ host: c.host, port: c.port, secure: c.port === 465, requireTLS: c.port !== 465, auth: { user: c.user, pass: c.pass }, connectionTimeout: 15000, greetingTimeout: 15000, socketTimeout: 30000 });
    transportKey = key;
  }
  return transport;
}

// Sends one message with the account from settings `s`. Never throws: returns { ok: true } or { ok: false, error }.
async function send({ to, subject, text, html, replyTo }, s) {
  const c = resolve(s);
  if (!c) return { ok: false, error: "Email isn't set up yet. Add the sending account under Site settings → Order emails." };
  const list = (Array.isArray(to) ? to : [to]).map((x) => String(x || "").trim()).filter(Boolean);
  if (!list.length) return { ok: false, error: "No address to send to." };
  try {
    if (c.kind === "resend") {
      const r = await fetch("https://api.resend.com/emails", {
        method: "POST", headers: { Authorization: "Bearer " + c.key, "Content-Type": "application/json" },
        body: JSON.stringify({ from: c.from, to: list, subject, text, html, ...(replyTo ? { reply_to: replyTo } : {}) })
      });
      if (!r.ok) { const j = await r.json().catch(() => ({})); return { ok: false, error: j.message || `Resend answered ${r.status}` }; }
      return { ok: true };
    }
    await smtpTransport(c).sendMail({ from: c.from, to: list.join(", "), subject, text, html, ...(replyTo ? { replyTo } : {}) });
    return { ok: true };
  } catch (e) {
    return { ok: false, error: friendly(e.message || String(e)) };
  }
}
// Turns the usual mail-server replies into something a store owner can act on.
function friendly(msg) {
  if (/5\.7\.139|SmtpClientAuthentication is disabled/i.test(msg)) return "Microsoft says SMTP sending is turned off for this mailbox. In the Microsoft 365 admin center open the user → Mail → Manage email apps → tick Authenticated SMTP. (" + msg.slice(0, 120) + ")";
  if (/5\.7\.3|5\.7\.57|Authentication unsuccessful|535/i.test(msg)) return "The mail server rejected the login. Check the email and password; on Microsoft 365 the account may also need app sign-ins allowed (Security defaults / MFA). (" + msg.slice(0, 120) + ")";
  if (/5\.7\.60|SendAsDenied/i.test(msg)) return "The login isn't allowed to send from that From address. Use the login's own address as From, or give it Send as permission. (" + msg.slice(0, 120) + ")";
  if (/ECONNREFUSED|ENOTFOUND|ETIMEDOUT|Greeting never received|Connection timeout/i.test(msg)) return "Couldn't reach the mail server. Check the host name and port. (" + msg.slice(0, 120) + ")";
  return msg;
}

module.exports = { send, info };
