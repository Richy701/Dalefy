(function () {
  var theme = "dim";
  try {
    var saved = localStorage.getItem("daf-theme");
    if (saved === "light" || saved === "dim" || saved === "dark") theme = saved;
  } catch (e) {}
  // The shared itinerary keeps its own theme and follows the device, so it paints right first time
  if (location.hash.indexOf("#/shared/") === 0) {
    theme = window.matchMedia("(prefers-color-scheme: dark)").matches ? "dim" : "light";
    try {
      var own = localStorage.getItem("daf-itinerary-theme");
      if (own === "light" || own === "dim") theme = own;
    } catch (e) {}
  }
  document.documentElement.classList.add(theme);
  document.documentElement.style.colorScheme = theme === "light" ? "light" : "dark";
})();
