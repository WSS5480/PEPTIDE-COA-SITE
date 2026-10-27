// Outgoing email. The sending account comes from Site settings → Order emails (saved in the database), or,
// when nothing is saved there, from the host's environment variables:
//   SMTP:    SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, MAIL_FROM
//   Resend:  RESEND_API_KEY, MAIL_FROM
// Microsoft 365 app (Graph): an Entra app registration with Mail.Send; sends as any mailbox (even a shared one), no password, MFA irrelevant
// Microsoft 365: smtp.office365.com, 587, a real mailbox's email + password (Authenticated SMTP on for that mailbox)
// Google Workspace: smtp.gmail.com, 465, an app password
// With neither set, nothing is sent and every call reports "not configured".
const nodemailer = require("nodemailer");

// Works out which account to send with. `s` is the store's settings object (may be undefined).
function resolve(s = {}) {
  const env = process.env;
  const from = (fallback) => String(s.mailFrom || "").trim() || fallback;
  if (s.mailMode === "resend" && s.resendKey) return { kind: "resend", key: s.resendKey, from: from("onboarding@resend.dev"), detail: "Resend", source: "admin" };
  if (s.mailMode === "graph" && s.graphTenant && s.graphClient && s.graphSecret && s.mailUser) {
    return { kind: "graph", tenant: String(s.graphTenant).trim(), client: String(s.graphClient).trim(), secret: s.graphSecret, mailbox: String(s.mailUser).trim(), from: from(s.mailUser), detail: "Microsoft 365 app (Graph)", source: "admin" };
  }
  if (s.mailMode === "smtp" && s.mailHost && s.mailUser && s.mailPass) {
    const port = parseInt(s.mailPort, 10) || 587;
    return { kind: "smtp", host: String(s.mailHost).trim(), port, user: String(s.mailUser).trim(), pass: s.mailPass, from: from(s.mailUser), detail: `SMTP (${String(s.mailHost).trim()}:${port})`, source: "admin" };
  }
  if (s.mailMode === "smtp" || s.mailMode === "resend" || s.mailMode === "graph") return null; // chosen in admin but incomplete: don't fall back silently
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

// Microsoft Graph: an app token (cached until it expires), then /users/{mailbox}/sendMail
let graphTok = { key: "", token: "", exp: 0 };
async function graphToken(c) {
  const key = [c.tenant, c.client, c.secret].join("|");
  if (graphTok.key === key && graphTok.exp > Date.now() + 60000) return graphTok.token;
  const r = await fetch(`https://login.microsoftonline.com/${encodeURIComponent(c.tenant)}/oauth2/v2.0/token`, {
    method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: c.client, client_secret: c.secret, scope: "https://graph.microsoft.com/.default", grant_type: "client_credentials" })
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j.access_token) throw new Error("Microsoft wouldn't issue a token: " + (j.error_description || j.error || r.status).toString().split("\n")[0].slice(0, 200));
  graphTok = { key, token: j.access_token, exp: Date.now() + (j.expires_in || 3600) * 1000 };
  return j.access_token;
}
async function graphSend(c, { to, subject, text, html, replyTo }) {
  const token = await graphToken(c);
  const m = /^(.*?)<([^>]+)>$/.exec(c.from);
  const fromAddr = m ? m[2].trim() : c.from, fromName = m ? m[1].trim().replace(/^"|"$/g, "") : "";
  const message = {
    subject, body: { contentType: html ? "HTML" : "Text", content: html || text },
    toRecipients: to.map((address) => ({ emailAddress: { address } })),
    ...(replyTo ? { replyTo: [{ emailAddress: { address: replyTo } }] } : {}),
    ...(fromAddr && fromAddr.toLowerCase() !== c.mailbox.toLowerCase() ? { from: { emailAddress: { address: fromAddr, ...(fromName ? { name: fromName } : {}) } } } : fromName ? { from: { emailAddress: { address: c.mailbox, name: fromName } } } : {})
  };
  const r = await fetch(`https://graph.microsoft.com/v1.0/users/${encodeURIComponent(c.mailbox)}/sendMail`, {
    method: "POST", headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" }, body: JSON.stringify({ message, saveToSentItems: true })
  });
  if (r.status === 202) return;
  const j = await r.json().catch(() => ({}));
  const msg = (j.error && j.error.message) || `Graph answered ${r.status}`;
  if (r.status === 401 || r.status === 403) throw new Error("Microsoft refused: " + msg + " — check the app has Mail.Send (application) permission with admin consent, and the mailbox address.");
  if (r.status === 404) throw new Error("Microsoft can't find that mailbox: " + c.mailbox);
  throw new Error(msg);
}
// Sends one message with the account from settings `s`. Never throws: returns { ok: true } or { ok: false, error }.
async function send({ to, subject, text, html, replyTo }, s) {
  const c = resolve(s);
  if (!c) return { ok: false, error: "Email isn't set up yet. Add the sending account under Site settings → Order emails." };
  const list = (Array.isArray(to) ? to : [to]).map((x) => String(x || "").trim()).filter(Boolean);
  if (!list.length) return { ok: false, error: "No address to send to." };
  try {
    if (c.kind === "graph") { await graphSend(c, { to: list, subject, text, html, replyTo }); return { ok: true }; }
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
  if (/ECONNREFUSED|ENOTFOUND|ETIMEDOUT|Greeting never received|Connection timeout/i.test(msg)) return "Couldn't reach the mail server (" + msg.slice(0, 60) + "). On Render's free plan outgoing mail-server connections are blocked, so use the Microsoft 365 app or Resend option instead.";
  return msg;
}

module.exports = { send, info };
