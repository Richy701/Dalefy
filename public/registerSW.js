// Mirrors vite-plugin-pwa's generated register script. Kept in public/ because the
// plugin's generateBundle asset is dropped under Vite 8, and the CSP no longer allows inline scripts.
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js", { scope: "/" });
  });
}
