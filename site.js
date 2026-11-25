(function () {
  var promptNode = document.getElementById("prompt-text");
  var copyButton = document.getElementById("copy-prompt");
  var copyStatus = document.getElementById("copy-status");

  function setCopyStatus(message) {
    if (copyStatus) copyStatus.textContent = message;
  }

  function legacyCopy(text) {
    return new Promise(function (resolve, reject) {
      var area = document.createElement("textarea");
      area.value = text;
      area.setAttribute("readonly", "");
      area.style.position = "fixed";
      area.style.top = "0";
      area.style.left = "0";
      area.style.opacity = "0";
      document.body.appendChild(area);
      area.focus();
      area.select();
      area.setSelectionRange(0, text.length);
      var ok = false;
      try {
        ok = document.execCommand("copy");
      } catch (error) {
        ok = false;
      }
      document.body.removeChild(area);
      if (ok) resolve();
      else reject(new Error("copy failed"));
    });
  }

  function copyText(text) {
    if (navigator.clipboard && window.isSecureContext && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(text).catch(function () {
        return legacyCopy(text);
      });
    }
    return legacyCopy(text);
  }

  if (copyButton && promptNode) {
    copyButton.addEventListener("click", function () {
      var text = promptNode.textContent;
      copyText(text).then(function () {
        setCopyStatus("Kopiert.");
        copyButton.textContent = "Kopiert";
        window.setTimeout(function () {
          if (copyButton.textContent === "Kopiert") copyButton.textContent = "Kopieren";
        }, 2000);
      }).catch(function () {
        setCopyStatus("Kopieren nicht möglich. Der Prompt steht im Feld und kann markiert werden.");
      });
    });
  }

  var filter = document.querySelector("[data-origin-filter]");
  if (!filter) return;

  var originStatus = document.getElementById("origin-status");
  var buttons = Array.prototype.slice.call(filter.querySelectorAll("button[data-origin]"));

  function rowMatches(origin, filterValue) {
    if (filterValue === "alles") return true;
    if (filterValue === "cursor") return origin === "cursor" || origin === "xai";
    return origin === filterValue;
  }

  function apply(filterValue, label) {
    var rows = document.querySelectorAll("#results-table tr[data-herkunft]");
    var shown = 0;
    Array.prototype.forEach.call(rows, function (row) {
      var origin = row.getAttribute("data-herkunft") || "";
      var match = rowMatches(origin, filterValue);
      row.hidden = !match;
      if (match) shown += 1;
    });
    var empty = document.getElementById("no-results");
    if (empty) empty.hidden = shown > 0;
    if (originStatus) originStatus.textContent = "Angezeigt: " + label + ".";
  }

  buttons.forEach(function (button) {
    button.addEventListener("click", function () {
      buttons.forEach(function (other) {
        other.setAttribute("aria-pressed", other === button ? "true" : "false");
      });
      apply(button.getAttribute("data-origin"), button.textContent.replace(/\s+/g, " ").trim());
    });
  });
})();
