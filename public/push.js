/* Phone notifications panel (admin My account and rep app Account): turn notifications on for this device, off, or send a test. */
(function () {
  "use strict";
  const b64u = (s) => { const p = "=".repeat((4 - (s.length % 4)) % 4); const b = atob((s + p).replace(/-/g, "+").replace(/_/g, "/")); return Uint8Array.from(b, (c) => c.charCodeAt(0)); };
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  const standalone = (window.matchMedia && matchMedia("(display-mode: standalone)").matches) || navigator.standalone === true;
  const supported = "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
  const ready = () => Promise.race([navigator.serviceWorker.register("/sw.js").then(() => navigator.serviceWorker.ready), new Promise((_, no) => setTimeout(() => no(new Error("The app's background helper didn't start. Reload the page and try again.")), 10000))]);
  async function call(path, body) {
    const r = await fetch("/api/admin/" + path, { method: body ? "POST" : "GET", headers: body ? { "Content-Type": "application/json" } : {}, body: body ? JSON.stringify(body) : undefined, credentials: "same-origin" });
    const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(j.error || "That didn't work"); return j;
  }
  const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
  // turn on for this device: ask (only from a tap), subscribe, tell the server
  async function enable() {
    if ((await Notification.requestPermission()) !== "granted") throw new Error("Notifications weren't allowed. Tap Turn on again and choose Allow.");
    const reg = await ready(), k = await call("my-push");
    const s = (await reg.pushManager.getSubscription()) || (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64u(k.key) }));
    await call("my-push", { sub: s.toJSON() });
  }
  // after signing in (and every time the installed app opens): offer to turn them on, unless they're on or "Not now" was tapped this week
  async function nudge(opts) {
    const o = Object.assign({ toast: () => {}, btn: "btn solid", what: "new orders, PIN requests and low stock" }, opts || {});
    if (!supported || Notification.permission === "denied" || document.getElementById("pushNudge")) return;
    try { if (Number(localStorage.getItem("pushNudgeUntil") || 0) > Date.now()) return; } catch (e) {}
    let reg; try { reg = await ready(); } catch (e) { return; }
    const sub = await reg.pushManager.getSubscription().catch(() => null);
    if (sub) { call("my-push", { sub: sub.toJSON() }).catch(() => {}); return; } // already on: keep this device on file
    if (Notification.permission === "granted") { try { await enable(); } catch (e) {} return; } // allowed before: turn on quietly
    const card = document.createElement("div"); card.id = "pushNudge"; card.setAttribute("role", "dialog"); card.setAttribute("aria-label", "Turn on notifications");
    card.style.cssText = "position:fixed;left:50%;bottom:calc(16px + env(safe-area-inset-bottom));transform:translateX(-50%);z-index:9999;width:min(26rem,calc(100% - 32px));background:#fff;color:#0f172a;border-radius:16px;box-shadow:0 12px 40px rgba(15,23,42,.28);padding:16px 16px 14px;font-size:15px;line-height:1.4";
    card.innerHTML = `<div style="display:flex;gap:12px;align-items:flex-start"><div style="font-size:26px;line-height:1" aria-hidden="true">🔔</div><div style="min-width:0"><strong style="display:block;font-size:16px">Turn on notifications?</strong><span style="color:#475569">Get a pop-up on this ${/Mobi|Android|iPhone|iPad/.test(navigator.userAgent) ? "phone" : "computer"} for ${esc(o.what)}, even when the app is closed.</span></div></div>
      <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:12px;flex-wrap:wrap"><button class="btn" type="button" data-later>Not now</button><button class="${o.btn}" type="button" data-yes>Turn on</button></div>`;
    document.body.appendChild(card);
    card.querySelector("[data-later]").onclick = () => { try { localStorage.setItem("pushNudgeUntil", String(Date.now() + 7 * 864e5)); } catch (e) {} card.remove(); };
    card.querySelector("[data-yes]").onclick = async (ev) => {
      ev.target.disabled = true;
      try { await enable(); card.remove(); o.toast("Notifications on"); }
      catch (e) { ev.target.disabled = false; o.toast(e.message); if (Notification.permission === "denied") card.remove(); }
    };
  }
  function mount(box, opts) {
    if (!box) return; const o = Object.assign({ toast: (m) => alert(m), btn: "btn solid", what: "new orders, PIN requests and low stock" }, opts || {});
    const draw = async (msg) => {
      let sub = null, info = { devices: 0 };
      if (supported) { try { sub = await (await ready()).pushManager.getSubscription(); } catch (e) { msg = msg || e.message; } }
      try { info = await call("my-push"); } catch (e) {}
      const perm = supported ? Notification.permission : "unsupported";
      let body;
      if (!supported) body = isIOS && !standalone
        ? `<p><strong>On iPhone:</strong> tap the Share button <span aria-hidden="true">⬆︎</span> → <strong>Add to Home Screen</strong>, open the app from your home screen, then come back to this page and tap Turn on.</p>`
        : `<p class="muted">This browser can't show notifications. Use Chrome, Edge or Safari, or the installed app.</p>`;
      else if (perm === "denied") body = `<p class="muted">Notifications are blocked for this site. Allow them in the browser's site settings (the lock or ⓘ next to the address), then reload.</p>`;
      else if (sub) body = `<p><span class="pill st-shipped">On for this device</span></p><div class="row2" style="gap:.4rem;flex-wrap:wrap"><button class="${o.btn}" type="button" data-pt>Send a test</button><button class="btn" type="button" data-poff>Turn off on this device</button></div>`;
      else body = `<div><button class="${o.btn}" type="button" data-pon>Turn on notifications</button></div>`;
      box.innerHTML = `<h2>Phone notifications</h2><p class="muted">Pop-up alerts on this phone or computer for ${esc(o.what)}, even when the app is closed. Free, any carrier. Turn them on once on each device you use.${info.devices ? ` <strong>On for ${info.devices} device${info.devices === 1 ? "" : "s"}.</strong>` : ""}</p>${body}${msg ? `<p class="err">${esc(msg)}</p>` : ""}`;
      const on = box.querySelector("[data-pon]"), off = box.querySelector("[data-poff]"), t = box.querySelector("[data-pt]");
      if (on) on.onclick = async () => {
        on.disabled = true;
        try { await enable(); o.toast("Notifications on"); const n = document.getElementById("pushNudge"); if (n) n.remove(); draw(); } catch (e) { draw(e.message); }
      };
      if (off) off.onclick = async () => { try { const s = await (await ready()).pushManager.getSubscription(); if (s) { await call("my-push/off", { endpoint: s.endpoint }); await s.unsubscribe(); } o.toast("Notifications off"); draw(); } catch (e) { draw(e.message); } };
      if (t) t.onclick = async () => { try { const s = await (await ready()).pushManager.getSubscription(); if (s) await call("my-push", { sub: s.toJSON() }); await call("my-push/test", {}); o.toast("Test sent"); } catch (e) { draw(e.message); } };
    };
    draw();
  }
  window.PushUI = { mount, nudge };
})();
