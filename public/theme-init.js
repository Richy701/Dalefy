(function () {
  var theme = "dim";
  try {
    var saved = localStorage.getItem("daf-theme");
    if (saved === "light" || saved === "dim" || saved === "dark") theme = saved;
  } catch (e) {}
  document.documentElement.classList.add(theme);
  document.documentElement.style.colorScheme = theme === "light" ? "light" : "dark";
})();
