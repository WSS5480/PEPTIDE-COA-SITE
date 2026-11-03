/* Text messages (SMS) through Twilio. Off until the host has the keys:
   TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN and either TWILIO_FROM (the Twilio number, +1…) or TWILIO_MESSAGING_SERVICE_SID.
   SMS_MOCK_FILE (tests only) writes each text to a file instead of sending it. */
const fs = require("fs");
const cfg = () => ({ sid: String(process.env.TWILIO_ACCOUNT_SID || "").trim(), token: String(process.env.TWILIO_AUTH_TOKEN || "").trim(), from: String(process.env.TWILIO_FROM || "").trim(), svc: String(process.env.TWILIO_MESSAGING_SERVICE_SID || "").trim() });
function ready() { const c = cfg(); return !!process.env.SMS_MOCK_FILE || !!(c.sid && c.token && (c.from || c.svc)); }
// US numbers: (956) 555-1234, 956.555.1234, 19565551234 → +19565551234; anything already +… is kept
function norm(n) {
  const raw = String(n || "").trim(); if (!raw) return null;
  const d = raw.replace(/\D/g, "");
  if (raw.startsWith("+") && d.length >= 10 && d.length <= 15) return "+" + d;
  if (d.length === 10) return "+1" + d;
  if (d.length === 11 && d[0] === "1") return "+" + d;
  return null;
}
function info() {
  const c = cfg();
  if (process.env.SMS_MOCK_FILE) return { ready: true, from: "test mode", detail: "Test mode (texts are written to a file)" };
  if (!ready()) return { ready: false, missing: [!c.sid && "TWILIO_ACCOUNT_SID", !c.token && "TWILIO_AUTH_TOKEN", !(c.from || c.svc) && "TWILIO_FROM"].filter(Boolean) };
  return { ready: true, from: c.from || "messaging service", detail: "Twilio" + (c.from ? " · " + c.from : " messaging service") };
}
async function send(to, body) {
  const num = norm(to); if (!num) return { ok: false, error: "Not a valid cell number: " + to };
  const text = String(body || "").replace(/\s+\n/g, "\n").trim().slice(0, 640);
  if (!text) return { ok: false, error: "Empty message" };
  if (process.env.SMS_MOCK_FILE) { fs.appendFileSync(process.env.SMS_MOCK_FILE, JSON.stringify({ to: num, body: text, at: new Date().toISOString() }) + "\n"); return { ok: true, to: num, sid: "mock" }; }
  if (!ready()) return { ok: false, error: "Texting isn't set up (add the Twilio keys on the host)." };
  const c = cfg(), form = new URLSearchParams({ To: num, Body: text });
  if (c.svc) form.set("MessagingServiceSid", c.svc); else form.set("From", c.from);
  try {
    const r = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(c.sid)}/Messages.json`, {
      method: "POST", body: form, signal: AbortSignal.timeout(15000),
      headers: { Authorization: "Basic " + Buffer.from(c.sid + ":" + c.token).toString("base64"), "Content-Type": "application/x-www-form-urlencoded" } });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) return { ok: false, to: num, error: (j.message || "Twilio answered " + r.status) + (j.code ? ` (code ${j.code})` : "") };
    return { ok: true, to: num, sid: j.sid };
  } catch (e) { return { ok: false, to: num, error: e.message }; }
}
module.exports = { ready, norm, info, send };
