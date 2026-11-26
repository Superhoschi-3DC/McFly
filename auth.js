(function () {
  var SESSION_KEY = "mcfly-pages-session";
  var VERIFIER_URL = "auth/verifier.json";
  var ALLOWED_NEXT = {
    "index.html": true,
    "pelikan.html": true,
    "mmlu.html": true,
    "mk25.html": true,
    "macbook.html": true,
    "chat.html": true,
    "openclaw.html": true
  };

  function all(selector) {
    return Array.prototype.slice.call(document.querySelectorAll(selector));
  }

  function bytesToBase64(bytes) {
    var binary = "";
    var view = new Uint8Array(bytes);
    for (var i = 0; i < view.length; i += 1) binary += String.fromCharCode(view[i]);
    return btoa(binary);
  }

  function base64ToBytes(value) {
    var binary = atob(value);
    var bytes = new Uint8Array(binary.length);
    for (var i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
    return bytes;
  }

  function constantTimeEqual(left, right) {
    var a = String(left);
    var b = String(right);
    var length = Math.max(a.length, b.length);
    var diff = a.length === b.length ? 0 : 1;
    for (var i = 0; i < length; i += 1) {
      var ca = i < a.length ? a.charCodeAt(i) : 0;
      var cb = i < b.length ? b.charCodeAt(i) : 0;
      diff |= ca ^ cb;
    }
    return diff === 0;
  }

  function sha256Hex(text) {
    return crypto.subtle.digest("SHA-256", new TextEncoder().encode(text)).then(function (digest) {
      var view = new Uint8Array(digest);
      var hex = "";
      for (var i = 0; i < view.length; i += 1) hex += view[i].toString(16).padStart(2, "0");
      return hex;
    });
  }

  function safeNext(value) {
    return ALLOWED_NEXT[value] ? value : "index.html";
  }

  function requestedNext() {
    return new URLSearchParams(window.location.search).get("next") || "";
  }

  function applySession(signedIn) {
    all("[data-auth='internal']").forEach(function (node) {
      node.hidden = !signedIn;
    });
    all("[data-auth='out']").forEach(function (node) {
      node.hidden = signedIn;
    });
    all("[data-auth='in']").forEach(function (node) {
      node.hidden = !signedIn;
    });

    if (!document.querySelector("meta[name='mcfly-auth'][content='required']")) return;

    var pending = document.querySelector("[data-auth-pending]");
    if (pending) pending.hidden = true;
    all("[data-auth-shell]").forEach(function (node) {
      node.hidden = !signedIn;
    });
    all("[data-auth-locked]").forEach(function (node) {
      node.hidden = signedIn;
    });
  }

  function readSession() {
    try {
      return sessionStorage.getItem(SESSION_KEY) || "";
    } catch (error) {
      return "";
    }
  }

  function writeSession(value) {
    try {
      if (value) sessionStorage.setItem(SESSION_KEY, value);
      else sessionStorage.removeItem(SESSION_KEY);
    } catch (error) {
      /* Storage can be blocked. The gate then stays closed. */
    }
  }

  function fail(code) {
    var error = new Error(code);
    error.code = code;
    return error;
  }

  function loadVerifier() {
    return fetch(VERIFIER_URL, { cache: "no-store", credentials: "same-origin" }).then(function (response) {
      if (!response.ok) throw fail("missing");
      return response.json();
    }).then(function (data) {
      if (!data || data.kdf !== "PBKDF2" || data.hash !== "SHA-256") throw fail("invalid");
      if (!data.salt || !data.digest) throw fail("unconfigured");
      var iterations = Number(data.iterations);
      if (!Number.isInteger(iterations) || iterations < 100000 || iterations > 2000000) throw fail("invalid");
      data.iterations = iterations;
      return data;
    });
  }

  function sessionProof(verifier) {
    return sha256Hex(verifier.digest + ":" + verifier.salt);
  }

  function deriveDigest(password, verifier) {
    var encoded = new TextEncoder().encode(String(password).normalize("NFC"));
    return crypto.subtle.importKey("raw", encoded, "PBKDF2", false, ["deriveBits"]).then(function (key) {
      return crypto.subtle.deriveBits({
        name: "PBKDF2",
        hash: "SHA-256",
        salt: base64ToBytes(verifier.salt),
        iterations: verifier.iterations
      }, key, 256);
    }).then(bytesToBase64);
  }

  function setFormMessage(message) {
    var error = document.getElementById("auth-error");
    if (error) error.textContent = message || "";
  }

  function showSignedInForm() {
    var form = document.querySelector("[data-auth-form]");
    var intro = document.querySelector("[data-auth-intro]");
    var signed = document.querySelector("[data-auth-signed-in]");
    if (form) form.hidden = true;
    if (intro) intro.hidden = true;
    if (signed) signed.hidden = false;
  }

  function messageFor(error) {
    if (error && (error.code === "unconfigured" || error.code === "missing")) {
      return "Die Anmeldung ist noch nicht eingerichtet.";
    }
    return "Die Anmeldung konnte nicht geprüft werden.";
  }

  function bindLogout() {
    all("[data-auth='logout']").forEach(function (button) {
      button.addEventListener("click", function () {
        writeSession("");
        if (document.querySelector("meta[name='mcfly-auth'][content='required']") || document.querySelector("[data-auth-form]")) {
          window.location.href = "anmelden.html";
          return;
        }
        applySession(false);
      });
    });
  }

  function bindForm(verifierPromise) {
    var form = document.querySelector("[data-auth-form]");
    if (!form) return;
    var input = document.getElementById("passwort");
    var submit = form.querySelector("button[type='submit']");

    form.addEventListener("submit", function (event) {
      event.preventDefault();
      var password = input ? input.value : "";
      if (!password) {
        setFormMessage("Bitte das Passwort eingeben.");
        if (input) input.focus();
        return;
      }
      if (!window.crypto || !window.crypto.subtle) {
        setFormMessage("Die Anmeldung konnte nicht geprüft werden.");
        return;
      }
      if (submit) {
        submit.disabled = true;
        submit.textContent = "Wird geprüft…";
      }
      verifierPromise.then(function (verifier) {
        return deriveDigest(password, verifier).then(function (digest) {
          if (!constantTimeEqual(digest, verifier.digest)) {
            setFormMessage("Das Passwort ist nicht korrekt.");
            if (input) {
              input.focus();
              input.select();
            }
            return;
          }
          return sessionProof(verifier).then(function (proof) {
            writeSession(proof);
            window.location.href = safeNext(requestedNext());
          });
        });
      }).catch(function (error) {
        setFormMessage(messageFor(error));
      }).then(function () {
        if (submit && document.body.contains(submit)) {
          submit.disabled = false;
          submit.textContent = "Anmelden";
        }
      });
    });
  }

  function start() {
    bindLogout();
    if (!window.crypto || !window.crypto.subtle) {
      applySession(false);
      setFormMessage("Die Anmeldung konnte nicht geprüft werden.");
      return;
    }

    var verifierPromise = loadVerifier();
    bindForm(verifierPromise);
    verifierPromise.then(function (verifier) {
      return sessionProof(verifier).then(function (proof) {
        var signedIn = constantTimeEqual(readSession(), proof);
        applySession(signedIn);
        if (!signedIn || !document.querySelector("[data-auth-form]")) return;
        if (requestedNext()) {
          window.location.href = safeNext(requestedNext());
          return;
        }
        showSignedInForm();
      });
    }).catch(function (error) {
      writeSession("");
      applySession(false);
      setFormMessage(messageFor(error));
    });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start);
  else start();
})();
