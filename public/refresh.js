/* Keeps a page current. Polls /api/version; when anything in the store changes, the page reloads its data
   (unless the person is in the middle of typing). Also wires refresh buttons ([data-refresh]) for desktop and
   pull-down-to-refresh on touch screens.
   AppRefresh.init({ version, refresh, canAuto, interval }) */
(() => {
  let seen = null, timer = null, busy = false, cfg = null, lastShown = 0, build0 = null;
  const coarse = matchMedia("(pointer: coarse)").matches;
  const style = document.createElement("style");
  style.textContent = `
    .ptr { position: fixed; top: 0; left: 0; right: 0; z-index: 60; display: grid; place-items: center; height: 0; overflow: hidden; color: #fff; font: 600 .8rem/1 system-ui, sans-serif; background: #0f1b33; transition: height .15s; }
    .ptr span { display: inline-flex; align-items: center; gap: .4rem; padding: .5rem 0; }
    .ptr svg { width: 1rem; height: 1rem; fill: none; stroke: currentColor; stroke-width: 2.2; stroke-linecap: round; }
    .ptr.go svg { animation: spin .8s linear infinite; }
    [data-refresh].spin svg { animation: spin .8s linear infinite; }
    @keyframes spin { to { transform: rotate(360deg); } }
    .upd { position: fixed; top: .8rem; left: 50%; z-index: 60; transform: translateX(-50%); padding: .55rem 1rem; background: #0b4d96; color: #fff; border: 0; border-radius: 999px; font: 600 .84rem/1 system-ui, sans-serif; box-shadow: 0 10px 30px -12px rgba(0,0,0,.5); cursor: pointer; }`;
  document.head.appendChild(style);

  // The app's own code: when a newer version has been deployed, a refresh reloads the whole page so the new
  // screens show up (the data refresh alone keeps the old code running).
  async function buildStamp() {
    try { const r = await fetch("/api/build", { cache: "no-store" }); if (!r.ok) return null; const b = await r.json(); return b.version + "|" + b.updated; } catch (e) { return null; }
  }
  async function newBuild() { const b = await buildStamp(); if (b === null) return false; if (build0 === null) { build0 = b; return false; } return b !== build0; }
  async function doRefresh(source) {
    if (busy || !cfg) return;
    if (source !== "auto" && (await newBuild())) { location.reload(); return; }
    busy = true;
    document.querySelectorAll("[data-refresh]").forEach((b) => b.classList.add("spin"));
    try { await cfg.refresh(source); } catch (e) { /* the page shows its own errors */ }
    finally { setTimeout(() => document.querySelectorAll("[data-refresh]").forEach((b) => b.classList.remove("spin")), 400); busy = false; hideNudge(); }
  }
  function hideNudge() { const n = document.getElementById("updNudge"); if (n) n.remove(); }
  function nudge(text) {
    if (document.getElementById("updNudge")) return;
    const b = document.createElement("button"); b.id = "updNudge"; b.className = "upd"; b.type = "button"; b.textContent = text || "New updates · tap to refresh";
    b.onclick = () => doRefresh("nudge"); document.body.appendChild(b);
  }
  async function check() {
    if (!cfg || document.visibilityState !== "visible") return;
    try {
      const r = await fetch(cfg.version, { cache: "no-store", credentials: "same-origin" });
      if (!r.ok) return;
      const { v } = await r.json();
      if (seen === null) { seen = v; return; }
      if (v !== seen) { seen = v; if (cfg.canAuto()) doRefresh("auto"); else nudge(); }
    } catch (e) { /* offline: try again next time */ }
    // a new version of the app itself: reload when nothing is being typed, otherwise offer it
    if (++ticks % 4 === 0 && (await newBuild())) { if (cfg.canAuto()) location.reload(); else nudge("A new version is ready · tap to update"); }
  }
  let ticks = 0;
  function start() { stop(); timer = setInterval(check, cfg.interval || 15000); }
  function stop() { if (timer) clearInterval(timer); timer = null; }

  // pull down from the top of the page to refresh (touch screens; also inside the installed app, which has no browser pull-to-refresh)
  function pullToRefresh() {
    const bar = document.createElement("div"); bar.className = "ptr";
    bar.innerHTML = `<span><svg viewBox="0 0 24 24"><path d="M20 12a8 8 0 1 1-2.3-5.7M20 4v5h-5"/></svg><b></b></span>`;
    document.body.appendChild(bar);
    const label = bar.querySelector("b");
    let y0 = null, pulled = 0; const NEED = 70;
    addEventListener("touchstart", (e) => { y0 = window.scrollY <= 0 && !document.querySelector("dialog[open]") ? e.touches[0].clientY : null; pulled = 0; }, { passive: true });
    addEventListener("touchmove", (e) => {
      if (y0 === null || busy) return;
      pulled = Math.max(0, e.touches[0].clientY - y0);
      if (pulled > 10) { bar.style.height = Math.min(pulled, 90) * 0.6 + "px"; label.textContent = pulled >= NEED ? "Release to refresh" : "Pull to refresh"; }
    }, { passive: true });
    const end = async () => {
      if (y0 === null) return;
      const go = pulled >= NEED; y0 = null;
      if (go) { bar.classList.add("go"); label.textContent = "Refreshing…"; bar.style.height = "40px"; await doRefresh("pull"); }
      bar.classList.remove("go"); bar.style.height = "0";
    };
    addEventListener("touchend", end); addEventListener("touchcancel", end);
  }

  window.AppRefresh = {
    init(options) {
      cfg = options;
      document.addEventListener("click", (e) => { const b = e.target.closest("[data-refresh]"); if (b) { e.preventDefault(); doRefresh("button"); } });
      document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") { check(); start(); } else stop(); });
      if (coarse) pullToRefresh();
      buildStamp().then((b) => { build0 = b; });
      check(); start();
    },
    refresh: () => doRefresh("call"),
    // after the page itself saved something, remember the new version so the save doesn't trigger a second reload
    settle: async () => { try { const r = await fetch(cfg.version, { cache: "no-store", credentials: "same-origin" }); if (r.ok) seen = (await r.json()).v; } catch (e) { /* ignore */ } }
  };
})();
