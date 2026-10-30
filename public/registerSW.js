// Mirrors vite-plugin-pwa's generated register script. Kept in public/ because the
// plugin's generateBundle asset is dropped under Vite 8, and the CSP no longer allows inline scripts.
//
// After a deploy the page still runs the copy it loaded with, even once the new worker takes over, so
// it took several refreshes to see changes. Now: look for a new version every 15 minutes and on return
// to the tab; when one takes over, reload a tab nobody is looking at, else tell the app so it can offer
// a Refresh button (never a surprise reload mid-edit).
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    const hadController = !!navigator.serviceWorker.controller;
    navigator.serviceWorker.register("/sw.js", { scope: "/" }).then(reg => {
      const check = () => { reg.update().catch(() => {}); };
      setInterval(check, 15 * 60 * 1000);
      document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") check(); });
    }).catch(() => {});

    let handled = false;
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      // The first install isn't an update
      if (!hadController || handled) return;
      handled = true;
      if (document.visibilityState === "hidden") { window.location.reload(); return; }
      window.__dafUpdateReady = true;
      window.dispatchEvent(new Event("daf-update-ready"));
      // Left open in the background later: catch up then
      document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "hidden") window.location.reload();
      });
    });
  });
}
