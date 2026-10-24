/*
 * tv-nav.js: remote-control (D-pad) navigation for the Home Assistant frontend.
 * Only activates on Samsung/Tizen TVs, so phones and computers are unaffected.
 *
 * Arrow keys  = move the orange highlight to the nearest button/card in that direction
 * OK / Enter  = press the highlighted item (text fields get focus, which opens the TV keyboard)
 * RETURN      = close an open dialog, otherwise go back
 */
(function () {
  "use strict";
  if (!/Tizen|SMART-TV|SMARTTV/i.test(navigator.userAgent)) return;
  if (window.__tvNavLoaded) return;
  window.__tvNavLoaded = true;

  var KEY = { LEFT: 37, UP: 38, RIGHT: 39, DOWN: 40, ENTER: 13, BACK: 10009, ESC: 27 };

  var SELECTOR = [
    "button", "a[href]", "input", "select", "textarea", "summary",
    "[role=button]", "[role=switch]", "[role=tab]", "[role=menuitem]",
    "[role=option]", "[role=checkbox]", "[role=radio]", "[role=slider]",
    "[tabindex]:not([tabindex='-1'])",
    "ha-switch", "ha-icon-button", "mwc-list-item", "ha-list-item",
    "ha-button", "mwc-button", "md-list-item"
  ].join(",");

  // ---- highlight overlay -------------------------------------------------
  var box = document.createElement("div");
  box.style.cssText =
    "position:fixed;z-index:2147483647;pointer-events:none;display:none;" +
    "border:4px solid #ff9800;border-radius:10px;box-sizing:border-box;" +
    "box-shadow:0 0 0 3px rgba(0,0,0,.55),0 0 18px 4px rgba(255,152,0,.7);" +
    "transition:left .08s,top .08s,width .08s,height .08s;";
  function attachBox() {
    if (!box.isConnected && document.body) document.body.appendChild(box);
  }

  var current = null;
  var lastRect = null;

  // Hide the highlight after a few seconds without a key press.
  var IDLE_MS = 4000;
  var idleHidden = false;
  var idleTimer = null;
  function wake() {
    idleHidden = false;
    clearTimeout(idleTimer);
    idleTimer = setTimeout(function () {
      idleHidden = true;
      box.style.display = "none";
    }, IDLE_MS);
  }

  function placeBox() {
    attachBox();
    if (idleHidden) { box.style.display = "none"; return; }
    if (!current || !current.isConnected) { box.style.display = "none"; return; }
    var r = current.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) { box.style.display = "none"; return; }
    lastRect = r;
    box.style.display = "block";
    box.style.left = (r.left - 3) + "px";
    box.style.top = (r.top - 3) + "px";
    box.style.width = (r.width + 6) + "px";
    box.style.height = (r.height + 6) + "px";
  }
  setInterval(placeBox, 250);
  window.addEventListener("resize", placeBox);
  window.addEventListener("scroll", placeBox, true);

  // ---- deep DOM helpers (HA uses lots of shadow DOM) ---------------------
  function walk(root, out) {
    var all = root.querySelectorAll("*");
    for (var i = 0; i < all.length; i++) {
      var el = all[i];
      out.push(el);
      if (el.shadowRoot) walk(el.shadowRoot, out);
    }
    return out;
  }

  function parentOf(el) {
    var p = el.parentNode;
    if (p && p.nodeType === 11 && p.host) return p.host; // shadow root -> host
    return p && p.nodeType === 1 ? p : null;
  }

  function deepActive() {
    var a = document.activeElement;
    while (a && a.shadowRoot && a.shadowRoot.activeElement) a = a.shadowRoot.activeElement;
    return a;
  }

  function isTextField(el) {
    if (!el) return false;
    var t = el.tagName;
    if (t === "TEXTAREA") return true;
    if (t !== "INPUT") return false;
    var type = (el.type || "text").toLowerCase();
    return ["button", "checkbox", "radio", "submit", "reset", "range", "file", "image"].indexOf(type) === -1;
  }

  function findOpenDialog(all) {
    for (var i = all.length - 1; i >= 0; i--) {
      var el = all[i];
      var tag = el.tagName;
      if (tag === "DIALOG" && el.open) return el;
      if ((tag === "HA-DIALOG" || tag === "MWC-DIALOG" || tag === "HA-WA-DIALOG" || tag === "HA-MORE-INFO-DIALOG" || tag === "DIALOG-HOME-ASSISTANT-MORE-INFO") &&
          (el.open === true || el.hasAttribute("open"))) {
        var r = el.getBoundingClientRect();
        if (r.width > 20 && r.height > 20) return el;
      }
    }
    return null;
  }

  function contains(container, el) {
    var n = el;
    while (n) {
      if (n === container) return true;
      n = parentOf(n);
    }
    return false;
  }

  function candidates() {
    var all = walk(document, []);
    var dialog = findOpenDialog(all);
    var vw = window.innerWidth, vh = window.innerHeight;
    var out = [];
    for (var i = 0; i < all.length; i++) {
      var el = all[i];
      if (el === box) continue;
      var tag = el.tagName;
      if (tag === "STYLE" || tag === "SCRIPT" || tag === "HEAD" || tag === "META" || tag === "LINK") continue;

      var match = false;
      try { match = el.matches(SELECTOR); } catch (e) {}
      var cs = null;
      if (!match) {
        // clickable-looking things: cursor:pointer whose parent is not already pointer (cursor inherits)
        cs = getComputedStyle(el);
        if (cs.cursor === "pointer") {
          var par = parentOf(el);
          var pcs = par ? getComputedStyle(par) : null;
          match = !pcs || pcs.cursor !== "pointer";
        }
      }
      if (!match) continue;
      if (el.disabled || el.getAttribute("aria-disabled") === "true") continue;

      var r = el.getBoundingClientRect();
      if (r.width < 12 || r.height < 12) continue;
      if (r.width * r.height > vw * vh * 0.6) continue;           // page-sized containers
      if (r.bottom < -2000 || r.top > vh + 4000) continue;
      if (r.right < 0 || r.left > vw) continue;
      cs = cs || getComputedStyle(el);
      if (cs.visibility === "hidden" || cs.display === "none" || cs.pointerEvents === "none") continue;
      if (dialog && !contains(dialog, el)) continue;
      out.push({ el: el, r: r });
    }
    return out;
  }

  function center(r) { return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; }

  function pickNext(list, dir) {
    var from = current && current.isConnected ? current.getBoundingClientRect() : lastRect;
    if (!from) {
      // nothing selected yet: top-most, left-most candidate that is on screen
      var best = null, bs = Infinity;
      for (var i = 0; i < list.length; i++) {
        var r = list[i].r;
        if (r.bottom < 0 || r.top > window.innerHeight) continue;
        var s = Math.max(r.top, 0) * 3 + r.left;
        if (s < bs) { bs = s; best = list[i]; }
      }
      return best || list[0] || null;
    }
    var c = center(from);
    var pick = null, score = Infinity;
    for (var j = 0; j < list.length; j++) {
      var item = list[j];
      if (item.el === current) continue;
      var rc = center(item.r);
      var dx = rc.x - c.x, dy = rc.y - c.y;
      var primary, secondary, overlap;
      if (dir === KEY.RIGHT)      { primary = item.r.left - from.right;  secondary = Math.abs(dy); overlap = item.r.bottom > from.top && item.r.top < from.bottom; if (dx <= 4) continue; }
      else if (dir === KEY.LEFT)  { primary = from.left - item.r.right;  secondary = Math.abs(dy); overlap = item.r.bottom > from.top && item.r.top < from.bottom; if (dx >= -4) continue; }
      else if (dir === KEY.DOWN)  { primary = item.r.top - from.bottom;  secondary = Math.abs(dx); overlap = item.r.right > from.left && item.r.left < from.right; if (dy <= 4) continue; }
      else                        { primary = from.top - item.r.bottom;  secondary = Math.abs(dx); overlap = item.r.right > from.left && item.r.left < from.right; if (dy >= -4) continue; }
      if (primary < -from.width) continue;
      var sc = Math.max(primary, 0) + secondary * (overlap ? 1 : 3);
      if (sc < score) { score = sc; pick = item; }
    }
    return pick;
  }

  function select(el) {
    current = el;
    try { el.scrollIntoView({ block: "center", inline: "center", behavior: "auto" }); } catch (e) {}
    placeBox();
  }

  function fire(el, type, Ctor) {
    try {
      el.dispatchEvent(new Ctor(type, { bubbles: true, cancelable: true, composed: true, view: window, button: 0 }));
    } catch (e) {}
  }

  function press(el) {
    if (isTextField(el) || el.tagName === "SELECT") { el.focus(); return; }
    fire(el, "pointerdown", window.PointerEvent || window.MouseEvent);
    fire(el, "mousedown", window.MouseEvent);
    fire(el, "pointerup", window.PointerEvent || window.MouseEvent);
    fire(el, "mouseup", window.MouseEvent);
    if (typeof el.click === "function") el.click(); else fire(el, "click", window.MouseEvent);
  }

  function closeDialogOrBack() {
    var all = walk(document, []);
    var dlg = findOpenDialog(all);
    if (dlg) {
      try { dlg.close ? dlg.close() : dlg.removeAttribute("open"); } catch (e) {}
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", keyCode: 27, bubbles: true, composed: true }));
      current = null;
      return;
    }
    history.back();
  }

  // ---- WallPanel screensaver awareness ----------------------------------
  // The first key press while the screensaver is showing should only wake it,
  // not also press whatever is underneath.
  var ssEl = null, ssLastActive = 0;
  function findScreensaver() {
    var all = walk(document, []);
    for (var i = 0; i < all.length; i++) {
      if (all[i].id === "wallpanel-screensaver-container") return all[i];
    }
    return null;
  }
  function screensaverShowing() {
    if (!ssEl || !ssEl.isConnected) ssEl = findScreensaver();
    if (!ssEl) return false;
    var cs = getComputedStyle(ssEl);
    var r = ssEl.getBoundingClientRect();
    return cs.display !== "none" && cs.visibility !== "hidden" && parseFloat(cs.opacity || "1") > 0.05 && r.width > 50 && r.height > 50;
  }
  setInterval(function () { if (screensaverShowing()) ssLastActive = Date.now(); }, 300);

  window.addEventListener("keydown", function (e) {
    var k = e.keyCode;
    if (screensaverShowing() || Date.now() - ssLastActive < 900) {
      ssLastActive = Date.now();
      current = null; box.style.display = "none"; idleHidden = false;
      return; // let WallPanel wake up; do nothing else
    }
    var active = deepActive();

    if (k === KEY.BACK) {
      e.preventDefault();
      if (isTextField(active)) { active.blur(); return; }
      closeDialogOrBack();
      return;
    }

    if (isTextField(active)) {
      // let the caret and the TV keyboard work; only Up/Down leave the field
      if (k === KEY.LEFT || k === KEY.RIGHT || k === KEY.ENTER) return;
      if (k === KEY.UP || k === KEY.DOWN) active.blur();
    }

    // First arrow/OK press after the highlight has faded only brings it back
    // (so nothing is pressed or moved while you can't see the selection).
    if ((k === KEY.ENTER || k === KEY.LEFT || k === KEY.UP || k === KEY.RIGHT || k === KEY.DOWN) &&
        idleHidden && current && current.isConnected) {
      e.preventDefault();
      wake();
      placeBox();
      return;
    }

    if (k === KEY.ENTER) {
      if (current && current.isConnected) { e.preventDefault(); wake(); press(current); }
      return;
    }

    if (k === KEY.LEFT || k === KEY.UP || k === KEY.RIGHT || k === KEY.DOWN) {
      e.preventDefault();
      wake();
      var list = candidates();
      if (!list.length) return;
      var next = pickNext(list, k);
      if (next) select(next.el);
      else if (current) {
        // nothing further in that direction on screen: scroll the page a bit and try again next press
        var dy = k === KEY.DOWN ? 300 : k === KEY.UP ? -300 : 0;
        if (dy) window.scrollBy(0, dy);
      }
    }
  }, true);

  // Re-find a selection if the page re-rendered under us
  setInterval(function () {
    if (current && !current.isConnected) { current = null; box.style.display = "none"; }
  }, 1000);
})();
