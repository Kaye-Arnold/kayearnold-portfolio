/* ============================================================
   PORTFOLIO ASSISTANT — front-end chat widget
   ------------------------------------------------------------
   Talks ONLY to this site's own serverless endpoint (/api/chat).
   The browser never sees the Gemini key, the system prompt, the
   portfolio context or any model configuration — it just sends
   { message, history } and renders { reply }.

   Contract:  POST /api/chat
              → { message: string, history: [{ role: 'user'|'assistant', content }] }
              ← { reply: string }

   Rendering: model output is treated as untrusted text. It is turned
   into DOM nodes with textContent (a tiny, safe subset: paragraphs,
   "- " bullets, **bold**, and auto-linked http(s)/mailto URLs).
============================================================ */
(function () {
  "use strict";

  var ENDPOINT = "/api/chat";
  var CONTACT_EMAIL = "contact.ArnoldDev@proton.me";
  var GREETING = "Hi — I’m Kaye’s portfolio assistant. Ask me about Kaye’s projects, skills, experience, or how to get in touch.";
  var FALLBACK = "Sorry — the assistant is temporarily unavailable. You can still reach Kaye directly at " + CONTACT_EMAIL + ".";
  var MAX_MESSAGE_CHARS = 1000;   // mirrors the server limit
  var MAX_HISTORY_TURNS = 10;     // messages (not pairs) sent to the server
  var REQUEST_TIMEOUT_MS = 25000;

  var fab = document.getElementById("chat-fab");
  var panel = document.getElementById("chat-panel");
  var closeBtn = document.getElementById("chat-close");
  var log = document.getElementById("chat-log");
  var chips = document.getElementById("chat-chips");
  var form = document.getElementById("chat-form");
  var input = document.getElementById("chat-input");
  var sendBtn = document.getElementById("chat-send");

  if (!fab || !panel || !log || !form || !input || !sendBtn || !window.fetch) return;

  // Signals to the inline FAB fallback that the assistant is live.
  window.KA_CHAT = true;

  var reduceMotion = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var isOpen = false;
  var pending = false;
  var greeted = false;
  var history = [];          // [{ role, content }] — kept in memory only, never persisted
  var lastSent = null;       // guards against accidental duplicate submits
  var lastSentAt = 0;

  /* ---------- safe rendering ---------- */
  var URL_RE = /(https?:\/\/[^\s<>()"']+[^\s<>()"'.,;:!?]|mailto:[^\s<>()"']+|[\w.+-]+@[\w-]+\.[\w.-]+\w)/g;

  function appendInline(parent, text) {
    // **bold** segments
    var parts = text.split(/(\*\*[^*]+\*\*)/g);
    parts.forEach(function (part) {
      if (!part) return;
      if (/^\*\*[^*]+\*\*$/.test(part)) {
        var strong = document.createElement("strong");
        appendLinked(strong, part.slice(2, -2));
        parent.appendChild(strong);
      } else {
        appendLinked(parent, part);
      }
    });
  }

  function appendLinked(parent, text) {
    var lastIndex = 0;
    var match;
    URL_RE.lastIndex = 0;
    while ((match = URL_RE.exec(text)) !== null) {
      if (match.index > lastIndex) {
        parent.appendChild(document.createTextNode(text.slice(lastIndex, match.index)));
      }
      var raw = match[0];
      var a = document.createElement("a");
      if (/^https?:\/\//i.test(raw)) {
        a.href = raw;
        a.target = "_blank";
        a.rel = "noopener noreferrer";
      } else if (/^mailto:/i.test(raw)) {
        a.href = raw;
      } else {
        a.href = "mailto:" + raw;
      }
      a.textContent = raw.replace(/^mailto:/i, "");
      parent.appendChild(a);
      lastIndex = match.index + raw.length;
    }
    if (lastIndex < text.length) {
      parent.appendChild(document.createTextNode(text.slice(lastIndex)));
    }
  }

  function renderRich(container, text) {
    var lines = String(text).replace(/\r\n?/g, "\n").split("\n");
    var para = [];
    var list = null;

    function flushPara() {
      if (!para.length) return;
      var p = document.createElement("p");
      appendInline(p, para.join("\n"));
      container.appendChild(p);
      para = [];
    }
    function flushList() { list = null; }

    lines.forEach(function (line) {
      var bullet = /^\s*(?:[-*•]|\d{1,2}[.)])\s+(.*)$/.exec(line);
      if (bullet) {
        flushPara();
        if (!list) { list = document.createElement("ul"); container.appendChild(list); }
        var li = document.createElement("li");
        appendInline(li, bullet[1]);
        list.appendChild(li);
      } else if (!line.trim()) {
        flushPara(); flushList();
      } else {
        flushList();
        para.push(line.replace(/^#{1,6}\s+/, ""));
      }
    });
    flushPara();
  }

  /* ---------- log helpers ---------- */
  function scrollToEnd() {
    if (reduceMotion) { log.scrollTop = log.scrollHeight; return; }
    if (typeof log.scrollTo === "function") log.scrollTo({ top: log.scrollHeight, behavior: "smooth" });
    else log.scrollTop = log.scrollHeight;
  }

  function addMessage(role, text, opts) {
    var el = document.createElement("div");
    el.className = "chat-msg " + (role === "user" ? "from-user" : "from-assistant");
    if (opts && opts.error) el.classList.add("is-error");
    if (role === "user") {
      el.textContent = text;              // user text: plain
    } else {
      renderRich(el, text);               // assistant text: safe subset
    }
    log.appendChild(el);
    scrollToEnd();
    return el;
  }

  var typingEl = null;
  function showTyping() {
    if (typingEl) return;
    typingEl = document.createElement("div");
    typingEl.className = "chat-typing";
    // static markup only — never contains model or user data
    typingEl.innerHTML = '<i class="dot"></i><i class="dot"></i><i class="dot"></i>' +
                         '<span class="sr-only">Assistant is typing…</span>';
    log.appendChild(typingEl);
    scrollToEnd();
  }
  function hideTyping() {
    if (typingEl && typingEl.parentNode) typingEl.parentNode.removeChild(typingEl);
    typingEl = null;
  }

  /* ---------- open / close ---------- */
  // Non-modal dialog (no backdrop, page stays usable): Escape closes, focus is
  // NOT trapped so keyboard users can always tab back out to the page.
  function onKeydown(e) {
    if (e.key === "Escape") { e.preventDefault(); closePanel(); }
  }

  function onDocClick(e) {
    if (!isOpen) return;
    if (panel.contains(e.target) || fab.contains(e.target)) return;
    closePanel({ restoreFocus: false });
  }

  function openPanel() {
    if (isOpen) return;
    isOpen = true;
    fab.classList.remove("is-tucked");
    panel.hidden = false;
    // next frame so the transition runs
    requestAnimationFrame(function () { panel.classList.add("open"); });
    fab.setAttribute("aria-expanded", "true");
    fab.setAttribute("aria-label", "Close portfolio assistant");
    if (!greeted) { greeted = true; addMessage("assistant", GREETING); }
    document.addEventListener("keydown", onKeydown);
    document.addEventListener("click", onDocClick, true);
    // Desktop: focus the input. Touch devices: focus the panel itself so the
    // on-screen keyboard doesn't pop up (and shift the layout) uninvited.
    var coarse = window.matchMedia && window.matchMedia("(pointer: coarse)").matches;
    setTimeout(function () {
      (coarse ? panel : input).focus({ preventScroll: true });
    }, reduceMotion ? 0 : 120);
  }

  function closePanel(opts) {
    if (!isOpen) return;
    isOpen = false;
    panel.classList.remove("open");
    fab.setAttribute("aria-expanded", "false");
    fab.setAttribute("aria-label", "Open portfolio assistant");
    document.removeEventListener("keydown", onKeydown);
    document.removeEventListener("click", onDocClick, true);
    var hide = function () { if (!isOpen) panel.hidden = true; };
    if (reduceMotion) hide(); else setTimeout(hide, 300);
    if (!opts || opts.restoreFocus !== false) {
      // The FAB is the dialog's only invoker, so focus always returns to it
      // (WAI-ARIA dialog pattern). On small screens it is hidden while the
      // panel is open, so wait until it is visible again before focusing.
      var restore = function () { fab.focus({ preventScroll: true }); queueTuck(); };
      if (reduceMotion) restore(); else setTimeout(restore, 0);
    } else {
      queueTuck();
    }
  }

  function togglePanel() { isOpen ? closePanel() : openPanel(); }

  /* ---------- sending ---------- */
  function setPending(on) {
    pending = on;
    input.disabled = on;
    sendBtn.disabled = on || !input.value.trim();
    sendBtn.setAttribute("aria-busy", on ? "true" : "false");
    if (chips) Array.prototype.forEach.call(chips.querySelectorAll("button"), function (b) { b.disabled = on; });
    if (!on) input.focus({ preventScroll: true });
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

  function send(text) {
    text = String(text || "").trim();
    if (!text || pending) return;
    if (text.length > MAX_MESSAGE_CHARS) text = text.slice(0, MAX_MESSAGE_CHARS);

    // Ignore an identical message fired twice within a second (double-tap / double Enter)
    var now = Date.now();
    if (text === lastSent && now - lastSentAt < 1000) return;
    lastSent = text; lastSentAt = now;

    if (chips) chips.hidden = true;
    addMessage("user", text);
    input.value = "";
    autosize();

    var payload = { message: text, history: history.slice(-MAX_HISTORY_TURNS) };
    history.push({ role: "user", content: text });

    setPending(true);
    showTyping();

    fetchWithTimeout(ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Accept": "application/json" },
      body: JSON.stringify(payload)
    })
      .then(function (res) {
        return res.json().catch(function () { return {}; }).then(function (data) {
          return { ok: res.ok, status: res.status, data: data || {} };
        });
      })
      .then(function (result) {
        hideTyping();
        var reply = typeof result.data.reply === "string" ? result.data.reply.trim() : "";
        if (result.ok && reply) {
          history.push({ role: "assistant", content: reply });
          addMessage("assistant", reply);
        } else if (result.status === 429) {
          addMessage("assistant", "You’re sending messages a little fast — give it a moment and try again, or email " + CONTACT_EMAIL + ".", { error: true });
        } else {
          addMessage("assistant", reply || FALLBACK, { error: true });
        }
      })
      .catch(function () {
        hideTyping();
        addMessage("assistant", FALLBACK, { error: true });
      })
      .then(function () {
        // keep the history bounded so the payload never grows unbounded
        if (history.length > MAX_HISTORY_TURNS * 2) history = history.slice(-MAX_HISTORY_TURNS * 2);
        setPending(false);
      });
  }

  /* ---------- input behaviour ---------- */
  function autosize() {
    input.style.height = "auto";
    input.style.height = Math.min(input.scrollHeight, 120) + "px";
  }

  input.addEventListener("input", function () {
    sendBtn.disabled = pending || !input.value.trim();
    autosize();
  });

  input.addEventListener("keydown", function (e) {
    if (e.key === "Enter" && !e.shiftKey && !e.isComposing) {
      e.preventDefault();
      if (!pending && input.value.trim()) send(input.value);
    }
  });

  form.addEventListener("submit", function (e) {
    e.preventDefault();
    send(input.value);
  });

  if (chips) {
    chips.addEventListener("click", function (e) {
      var btn = e.target.closest("[data-chat-prompt]");
      if (!btn || btn.disabled) return;
      send(btn.getAttribute("data-chat-prompt"));
    });
  }

  fab.addEventListener("click", function (e) {
    e.preventDefault();
    togglePanel();
  });
  if (closeBtn) closeBtn.addEventListener("click", function () { closePanel(); });

  window.addEventListener("orientationchange", function () { if (isOpen) scrollToEnd(); });

  /* ---------- keep the launcher clear of the contact form & footer ----------
     A fixed button inevitably passes over content while scrolling. Whenever the
     FAB's resting spot would overlap something interactive in the contact form
     or the footer, it slides out of the way and comes back afterwards. */
  var obstacles = Array.prototype.slice.call(document.querySelectorAll(
    "#contact-form .form-field, #contact-form .form-footer, #contact-success, .site-footer a, .site-footer p"
  ));
  var tucked = false, tuckQueued = false;

  function fabRestingRect() {
    // independent of transforms/visibility so a tucked FAB doesn't "un-overlap" itself
    var cs = getComputedStyle(fab);
    var right = parseFloat(cs.right) || 0, bottom = parseFloat(cs.bottom) || 0;
    var w = fab.offsetWidth || 56, h = fab.offsetHeight || 56;
    return { left: window.innerWidth - right - w, right: window.innerWidth - right,
             top: window.innerHeight - bottom - h, bottom: window.innerHeight - bottom };
  }

  function updateTuck() {
    tuckQueued = false;
    var hit = false;
    if (!isOpen && obstacles.length && document.activeElement !== fab) {
      var f = fabRestingRect(), vh = window.innerHeight, gap = 8;
      for (var i = 0; i < obstacles.length; i++) {
        var el = obstacles[i];
        if (el.hidden || el.offsetParent === null) continue;          // hidden state (e.g. form vs success)
        var r = el.getBoundingClientRect();
        if (!r.width || r.bottom < f.top - gap || r.top > vh) continue; // nowhere near the FAB
        if (!(r.right <= f.left - gap || r.left >= f.right + gap || r.bottom <= f.top - gap || r.top >= f.bottom + gap)) {
          hit = true; break;
        }
      }
    }
    if (hit !== tucked) {
      tucked = hit;
      fab.classList.toggle("is-tucked", hit);
    }
  }

  function queueTuck() {
    if (tuckQueued) return;
    tuckQueued = true;
    requestAnimationFrame(updateTuck);
  }

  fab.addEventListener("blur", queueTuck);
  window.addEventListener("scroll", queueTuck, { passive: true });
  window.addEventListener("resize", queueTuck);
  document.addEventListener("ka:contact-state", queueTuck); // form ⇄ success swap
  queueTuck();
})();
