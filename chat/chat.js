(function () {
  var scales = {small: ".9", normal: "1", large: "1.1", xlarge: "1.2"};
  function setChatFontSize(value) {
    document.documentElement.style.fontSize = (scales[value] || scales.normal) + "rem";
    try { localStorage.setItem("mcfly-chat-font-size", value); } catch (error) {}
  }
  window.setChatFontSize = setChatFontSize;
  var saved = "normal";
  try { saved = localStorage.getItem("mcfly-chat-font-size") || "normal"; } catch (error) {}
  var select = document.getElementById("font-size");
  if (select) select.value = saved;
  setChatFontSize(saved);
  document.querySelectorAll(".dash-chat form").forEach(function (form) {
    form.addEventListener("submit", function (event) { event.preventDefault(); });
  });
  document.querySelectorAll("[data-copy-text]").forEach(function (button) {
    button.addEventListener("click", function () {
      var text = button.getAttribute("data-copy-text") || "";
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).catch(function () {});
      }
    });
  });
})();
