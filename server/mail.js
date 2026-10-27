// Outgoing email. Two ways to send, picked from the host's environment variables:
//   Resend (HTTP):  RESEND_API_KEY, MAIL_FROM            e.g. "360 Medical Peptides <orders@360medical.net>"
//   SMTP:           SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, MAIL_FROM   (Google Workspace: smtp.gmail.com, 465, an app password)
// With neither set, nothing is sent and every call reports "not configured".
const nodemailer = require("nodemailer");

function config() {
  const env = process.env;
  if (env.RESEND_API_KEY) return { kind: "resend", from: env.MAIL_FROM || "onboarding@resend.dev", detail: "Resend" };
  if (env.SMTP_HOST && env.SMTP_USER && env.SMTP_PASS) {
    const port = parseInt(env.SMTP_PORT, 10) || 465;
    return { kind: "smtp", from: env.MAIL_FROM || env.SMTP_USER, host: env.SMTP_HOST, port, user: env.SMTP_USER, pass: env.SMTP_PASS, detail: `SMTP (${env.SMTP_HOST}:${port})` };
  }
  return null;
}
const info = () => { const c = config(); return c ? { ready: true, kind: c.kind, from: c.from, detail: c.detail } : { ready: false, kind: "", from: "", detail: "" }; };

let transport = null, transportKey = "";
function smtpTransport(c) {
  const key = [c.host, c.port, c.user, c.pass].join("|");
  if (!transport || transportKey !== key) {
    transport = nodemailer.createTransport({ host: c.host, port: c.port, secure: c.port === 465, auth: { user: c.user, pass: c.pass }, connectionTimeout: 15000, greetingTimeout: 15000, socketTimeout: 30000 });
    transportKey = key;
  }
  return transport;
}

// Sends one message. Never throws: returns { ok: true } or { ok: false, error }.
async function send({ to, subject, text, html, replyTo }) {
  const c = config();
  if (!c) return { ok: false, error: "Email isn't set up yet (no SMTP or Resend settings on the host)." };
  const list = (Array.isArray(to) ? to : [to]).map((x) => String(x || "").trim()).filter(Boolean);
  if (!list.length) return { ok: false, error: "No address to send to." };
  try {
    if (c.kind === "resend") {
      const r = await fetch("https://api.resend.com/emails", {
        method: "POST", headers: { Authorization: "Bearer " + process.env.RESEND_API_KEY, "Content-Type": "application/json" },
        body: JSON.stringify({ from: c.from, to: list, subject, text, html, ...(replyTo ? { reply_to: replyTo } : {}) })
      });
      if (!r.ok) { const j = await r.json().catch(() => ({})); return { ok: false, error: j.message || `Resend answered ${r.status}` }; }
      return { ok: true };
    }
    await smtpTransport(c).sendMail({ from: c.from, to: list.join(", "), subject, text, html, ...(replyTo ? { replyTo } : {}) });
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.message || String(e) };
  }
}

module.exports = { send, info };
