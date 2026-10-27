(function () {
  var theme = "dark";
  try {
    if (localStorage.getItem("daf-theme") === "light") theme = "light";
  } catch (e) {}
  document.documentElement.classList.add(theme);
})();
