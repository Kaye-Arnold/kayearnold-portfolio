/* ============================================================
   CONTACT FORM — FormSubmit (AJAX) with native-POST fallback
   ------------------------------------------------------------
   • Recipient: contact.ArnoldDev@proton.me (form `action` + AJAX endpoint)
   • Without JS the form POSTs to FormSubmit normally; with JS we submit
     via fetch() so the visitor never leaves the page.
   • Client-side validation mirrors the native `required`/`type=email`
     rules and shows inline messages per field.
   • Double submissions are blocked while a request is in flight.
   NOTE: FormSubmit e-mails an activation link to the recipient address on
   the first submission; deliveries start once that link is confirmed.
============================================================ */
(function () {
  "use strict";

  var RECIPIENT = "contact.ArnoldDev@proton.me";
  var AJAX_ENDPOINT = "https://formsubmit.co/ajax/" + RECIPIENT;
  var REQUEST_TIMEOUT_MS = 20000;

  var form = document.getElementById("contact-form");
  if (!form || !window.fetch) return; // no form, or ancient browser → native POST

  var submitBtn = document.getElementById("contact-submit");
  var submitLabel = submitBtn ? submitBtn.querySelector(".form-submit-label") : null;
  var statusBox = document.getElementById("contact-status");
  var successBox = document.getElementById("contact-success");
  var resetBtn = document.getElementById("contact-reset");

  var fields = {
    name: form.querySelector("#f-name"),
    email: form.querySelector("#f-email"),
    message: form.querySelector("#f-msg")
  };

  var pending = false;

  /* ---------- helpers ---------- */
  function errorEl(input) {
    return document.getElementById(input.id + "-error");
  }

  function setFieldError(input, msg) {
    var wrap = input.closest(".form-field");
    var el = errorEl(input);
    if (msg) {
      if (wrap) wrap.classList.add("is-invalid");
      input.setAttribute("aria-invalid", "true");
      if (el) el.textContent = msg;
    } else {
      if (wrap) wrap.classList.remove("is-invalid");
      input.removeAttribute("aria-invalid");
      if (el) el.textContent = "";
    }
  }

  function showStatus(msg, kind) {
    if (!statusBox) return;
    statusBox.textContent = "";
    statusBox.className = "form-status";
    if (!msg) return;
    statusBox.classList.add("is-visible", kind === "info" ? "is-info" : "is-error");
    var text = document.createTextNode(msg + " ");
    statusBox.appendChild(text);
    if (kind !== "info") {
      var a = document.createElement("a");
      a.href = "mailto:" + RECIPIENT;
      a.textContent = RECIPIENT;
      statusBox.appendChild(document.createTextNode("You can also email "));
      statusBox.appendChild(a);
      statusBox.appendChild(document.createTextNode(" directly."));
    }
  }

  var EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

  function validateField(input) {
    var value = (input.value || "").trim();
    var name = input.name;
    var msg = "";

    if (!value) {
      msg = name === "name" ? "Please enter your name."
          : name === "email" ? "Please enter your email address."
          : "Please write a short message.";
    } else if (name === "name" && value.length < 2) {
      msg = "Name looks too short.";
    } else if (name === "email" && !EMAIL_RE.test(value)) {
      msg = "That email address doesn’t look right.";
    } else if (name === "message" && value.length < 10) {
      msg = "Please add a little more detail (at least 10 characters).";
    }
    setFieldError(input, msg);
    return !msg;
  }

  function validateAll() {
    var firstInvalid = null;
    ["name", "email", "message"].forEach(function (key) {
      var input = fields[key];
      if (!input) return;
      var ok = validateField(input);
      if (!ok && !firstInvalid) firstInvalid = input;
    });
    if (firstInvalid) firstInvalid.focus();
    return !firstInvalid;
  }

  function setPending(on) {
    pending = on;
    if (!submitBtn) return;
    submitBtn.disabled = on;
    submitBtn.setAttribute("aria-busy", on ? "true" : "false");
    submitBtn.classList.toggle("is-loading", on);
    if (submitLabel) submitLabel.textContent = on ? "Sending…" : "Send Message";
  }

  function notifyStateChange() {
    try { document.dispatchEvent(new Event("ka:contact-state")); } catch (_) { /* old browsers */ }
  }

  function showSuccess() {
    form.hidden = true;
    if (successBox) {
      successBox.hidden = false;
      successBox.focus();
    }
    notifyStateChange();
  }

  function resetToForm() {
    form.reset();
    ["name", "email", "message"].forEach(function (key) {
      if (fields[key]) setFieldError(fields[key], "");
    });
    showStatus("");
    if (successBox) successBox.hidden = true;
    form.hidden = false;
    if (fields.name) fields.name.focus();
    notifyStateChange();
  }

  function fetchWithTimeout(url, options) {
    var controller = typeof AbortController === "function" ? new AbortController() : null;
    if (controller) options.signal = controller.signal;
    var timer = controller ? setTimeout(function () { controller.abort(); }, REQUEST_TIMEOUT_MS) : null;
    return fetch(url, options).then(
      function (res) { if (timer) clearTimeout(timer); return res; },
      function (err) { if (timer) clearTimeout(timer); throw err; }
    );
  }

  /* ---------- submission ---------- */
  function submit(event) {
    event.preventDefault();
    if (pending) return;

    showStatus("");
    if (!validateAll()) return;

    // Honeypot filled → silently pretend success (bots only)
    var honey = form.querySelector('input[name="_honey"]');
    if (honey && honey.value) { showSuccess(); return; }

    var payload = {
      name: fields.name.value.trim(),
      email: fields.email.value.trim(),
      message: fields.message.value.trim(),
      _subject: (form.querySelector('input[name="_subject"]') || {}).value || "New message from kayearnold-portfolio",
      _template: "table",
      _captcha: "false"
    };

    setPending(true);

    fetchWithTimeout(AJAX_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Accept": "application/json" },
      body: JSON.stringify(payload)
    })
      .then(function (res) {
        return res.json().catch(function () { return {}; }).then(function (data) {
          return { ok: res.ok, data: data || {} };
        });
      })
      .then(function (result) {
        // FormSubmit returns `success` as the string "true"/"false"
        var ok = result.ok && String(result.data.success) === "true";
        if (ok) {
          showSuccess();
        } else {
          var detail = typeof result.data.message === "string" && result.data.message
            ? result.data.message
            : "Something went wrong while sending your message.";
          showStatus(detail, "error");
        }
      })
      .catch(function () {
        showStatus("Your message couldn’t be sent right now — please check your connection and try again.", "error");
      })
      .then(function () { setPending(false); });
  }

  /* ---------- wiring ---------- */
  form.setAttribute("novalidate", ""); // we render our own messages
  form.addEventListener("submit", submit);

  ["name", "email", "message"].forEach(function (key) {
    var input = fields[key];
    if (!input) return;
    input.addEventListener("blur", function () { if (input.value) validateField(input); });
    input.addEventListener("input", function () {
      if (input.closest(".form-field") && input.closest(".form-field").classList.contains("is-invalid")) {
        validateField(input);
      }
    });
  });

  if (resetBtn) resetBtn.addEventListener("click", resetToForm);
})();
