// Trip link pages: on to the itinerary in the app. Kept out of the page itself, which the CSP forbids running inline.
(function () {
  var to = document.currentScript && document.currentScript.getAttribute("data-to");
  if (to && to.charAt(0) === "/") location.replace(to);
})();
