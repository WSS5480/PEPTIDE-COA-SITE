/* "Download app" button: uses the browser's install prompt where it exists (Android, Chrome, Edge),
   and shows Add to Home Screen steps on iPhone/iPad where there is no prompt. */
(() => {
  if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(() => {});
  const standalone = matchMedia("(display-mode: standalone)").matches || navigator.standalone;
  const btns = { forEach: (f) => document.querySelectorAll("[data-install]").forEach(f) };
  if (standalone) { const st = document.createElement("style"); st.textContent = "[data-install]{display:none!important}"; document.head.appendChild(st); return; }
  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  let deferred = null;
  addEventListener("beforeinstallprompt", (e) => { e.preventDefault(); deferred = e; });
  addEventListener("appinstalled", () => btns.forEach((b) => (b.hidden = true)));
  function help(msg) {
    let d = document.getElementById("installHelp");
    if (!d) {
      d = document.createElement("dialog"); d.id = "installHelp"; d.className = "modal";
      d.innerHTML = `<div class="mbody"><h2>Download the app</h2><div id="ihBody"></div><button class="btn solid wide" type="button">Got it</button></div>`;
      d.querySelector("button").onclick = () => d.close();
      d.addEventListener("click", (e) => { if (e.target === d) d.close(); });
      document.body.appendChild(d);
    }
    d.querySelector("#ihBody").innerHTML = msg;
    d.showModal ? d.showModal() : d.setAttribute("open", "");
  }
  document.addEventListener("click", async (ev) => {
    if (!ev.target.closest("[data-install]")) return;
    if (deferred) { deferred.prompt(); await deferred.userChoice.catch(() => {}); deferred = null; return; }
    if (ios) return help(`<p>On iPhone or iPad, in <strong>Safari</strong>:</p><ol><li>Tap the <strong>Share</strong> button (square with an arrow).</li><li>Scroll down and tap <strong>Add to Home Screen</strong>.</li><li>Tap <strong>Add</strong>.</li></ol><p class="dist">The app icon then appears on your home screen.</p>`);
    help(`<p>Open this page in <strong>Chrome</strong> or <strong>Edge</strong>, then choose <strong>Install app</strong> from the browser menu (⋮) or the install icon in the address bar.</p><p class="dist">On Android, the menu option may say <strong>Add to Home screen</strong>.</p>`);
  });
})();
