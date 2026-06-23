/* ============================================================
   CURB CREW - portal.js  (demo client portal)
   All data is sample data. No real auth, billing, or network calls.
   ============================================================ */
(function () {
  "use strict";

  function $(s, c) { return (c || document).querySelector(s); }
  function $all(s, c) { return Array.prototype.slice.call((c || document).querySelectorAll(s)); }

  var authView = $('[data-view="auth"]');
  var appView = $('[data-view="app"]');

  var TITLES = {
    overview: "Overview",
    schedule: "Schedule",
    plan: "Plan & payments",
    account: "Account"
  };

  /* ---------- sign in (demo) ---------- */
  var loginForm = $("[data-login-form]");
  if (loginForm) {
    loginForm.addEventListener("submit", function (e) {
      e.preventDefault();
      var email = loginForm.querySelector('input[name="email"]').value.trim();
      var msg = $("[data-auth-msg]");
      if (!email || email.indexOf("@") === -1) {
        msg.textContent = "Enter any email to continue (this is a demo).";
        return;
      }
      authView.hidden = true;
      appView.hidden = false;
      window.scrollTo(0, 0);
    });
  }

  /* ---------- panel navigation ---------- */
  function showPanel(name) {
    if (!TITLES[name]) return;
    $all(".panel").forEach(function (p) { p.hidden = p.getAttribute("data-panel") !== name; });
    $all(".side__link").forEach(function (l) { l.classList.toggle("is-active", l.getAttribute("data-nav") === name); });
    var title = $("[data-page-title]");
    if (title) title.textContent = TITLES[name];
    var sel = $("[data-mobile-nav]");
    if (sel) sel.value = name;
    var main = $(".main");
    if (main) main.scrollTop = 0;
    window.scrollTo(0, 0);
  }

  // any element with data-nav switches panels (sidebar + in-card links)
  document.addEventListener("click", function (e) {
    var navEl = e.target.closest("[data-nav]");
    if (navEl) { e.preventDefault(); showPanel(navEl.getAttribute("data-nav")); }
  });

  var mobileNav = $("[data-mobile-nav]");
  if (mobileNav) {
    mobileNav.addEventListener("change", function () { showPanel(mobileNav.value); });
  }

  /* ---------- modal ---------- */
  var modal = $("[data-modal]");
  var modalTitle = $("[data-modal-title]");
  var modalBody = $("[data-modal-body]");
  var modalConfirm = $("[data-modal-confirm]");
  var pendingConfirm = null;

  function openModal(title, body, confirmLabel, onConfirm, danger) {
    modalTitle.textContent = title;
    modalBody.textContent = body;
    modalConfirm.textContent = confirmLabel || "Confirm";
    modalConfirm.classList.toggle("btn--danger-ghost", !!danger);
    pendingConfirm = onConfirm || null;
    modal.hidden = false;
  }
  function closeModal() { modal.hidden = true; pendingConfirm = null; modalConfirm.classList.remove("btn--danger-ghost"); }

  $all("[data-modal-close]").forEach(function (el) { el.addEventListener("click", closeModal); });
  if (modalConfirm) {
    modalConfirm.addEventListener("click", function () {
      var fn = pendingConfirm;
      closeModal();
      if (fn) fn();
    });
  }
  document.addEventListener("keydown", function (e) { if (e.key === "Escape" && modal && !modal.hidden) closeModal(); });

  /* ---------- toast ---------- */
  var toast = $("[data-toast]");
  var toastTimer = null;
  function showToast(text) {
    if (!toast) return;
    toast.textContent = text;
    toast.classList.add("is-show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toast.classList.remove("is-show"); }, 3200);
  }

  /* ---------- demo actions ---------- */
  var ACTIONS = {
    pause: function () {
      openModal("Pause your service?", "We'll stop pickups and pause billing until you resume. You can come back anytime.", "Pause service", function () {
        showToast("Service paused. We'll email you to resume.");
      });
    },
    cancel: function () {
      openModal("Cancel your plan?", "No contract and no fee. Your service ends after your current billing period. You can reactivate whenever you like.", "Cancel plan", function () {
        showToast("Plan cancelled. Sorry to see you go!");
      }, true);
    },
    addon: function () { showToast("Add-on added to your next invoice (demo)."); },
    payment: function () { showToast("Opening secure payment update (demo)."); },
    receipt: function () { showToast("Receipt downloaded (demo)."); },
    edit: function () { showToast("Editing is disabled in this demo."); },
    support: function () { showToast("Support chat would open here (demo)."); }
  };

  document.addEventListener("click", function (e) {
    var actEl = e.target.closest("[data-action]");
    if (!actEl) return;
    var fn = ACTIONS[actEl.getAttribute("data-action")];
    if (fn) fn();
  });
})();
