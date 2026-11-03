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
        try {
          if ((await Notification.requestPermission()) !== "granted") return draw("Notifications weren't allowed. Tap Turn on again and choose Allow.");
          const reg = await ready(), k = await call("my-push");
          const s = (await reg.pushManager.getSubscription()) || (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64u(k.key) }));
          await call("my-push", { sub: s.toJSON() }); o.toast("Notifications on"); draw();
        } catch (e) { draw(e.message); }
      };
      if (off) off.onclick = async () => { try { const s = await (await ready()).pushManager.getSubscription(); if (s) { await call("my-push/off", { endpoint: s.endpoint }); await s.unsubscribe(); } o.toast("Notifications off"); draw(); } catch (e) { draw(e.message); } };
      if (t) t.onclick = async () => { try { const s = await (await ready()).pushManager.getSubscription(); if (s) await call("my-push", { sub: s.toJSON() }); await call("my-push/test", {}); o.toast("Test sent"); } catch (e) { draw(e.message); } };
    };
    draw();
  }
  window.PushUI = { mount };
})();
