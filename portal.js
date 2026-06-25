/* ============================================================
   CURB CREW - portal.js  (LIVE client portal)
   Real Supabase auth + data. Each customer sees only their own
   rows (enforced by row-level security in the database).
   ============================================================ */
(function () {
  "use strict";

  /* ---------- Supabase client ---------- */
  var SUPABASE_URL = "https://hezahtnfyhqfucixzqxi.supabase.co";
  var SUPABASE_KEY = "sb_publishable_9l4_Bqgjg7qBapvYlLPJSA_pHOk0nMB";
  var sb = (window.supabase && window.supabase.createClient)
    ? window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY)
    : null;

  function $(s, c) { return (c || document).querySelector(s); }
  function $all(s, c) { return Array.prototype.slice.call((c || document).querySelectorAll(s)); }

  var authView = $('[data-view="auth"]');
  var appView = $('[data-view="app"]');

  /* Add-on catalog (price in cents). Slugs match subscriptions.addon_* columns. */
  var ADDONS = [
    { slug: "recycling",   col: "addon_recycling",   name: "Recycling can", desc: "Rolled out on recycling days",      cents: 800 },
    { slug: "yard_waste",  col: "addon_yard_waste",  name: "Yard-waste can", desc: "Rolled out on collection days",    cents: 800 },
    { slug: "cleaning",    col: "addon_cleaning",    name: "Can cleaning",   desc: "Monthly deep clean & deodorize",   cents: 1200 }
  ];

  var TITLES = { overview: "Overview", schedule: "Schedule", plan: "Plan & payments", account: "Account" };

  /* current user's loaded data */
  var DATA = { user: null, profile: null, address: null, sub: null, invoices: [], events: [] };

  /* ---------- helpers ---------- */
  function money(cents) {
    if (cents == null || isNaN(cents)) return "$0.00";
    return "$" + (cents / 100).toFixed(2);
  }
  function initialsOf(name) {
    if (!name) return "CC";
    var p = name.trim().split(/\s+/);
    return ((p[0] || "")[0] || "" ) + ((p[1] || "")[0] || "");
  }
  function fmtDate(d) {
    if (!d) return "";
    var dt = new Date(d);
    if (isNaN(dt)) return "";
    return dt.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  }
  function setText(key, val) {
    $all('[data-bind="' + key + '"]').forEach(function (el) { el.textContent = (val == null || val === "") ? "—" : val; });
  }

  /* ============================================================
     AUTH
     ============================================================ */
  var loginForm = $("[data-login-form]");
  var authMsg = $("[data-auth-msg]");
  var authMode = "signin"; // or "signup"

  function setAuthMsg(text, kind) {
    if (!authMsg) return;
    authMsg.textContent = text || "";
    authMsg.className = "auth__msg" + (kind ? " is-" + kind : "");
  }

  function setAuthMode(mode) {
    authMode = mode;
    var title = $("[data-auth-title]");
    var sub = $("[data-auth-sub]");
    var submit = $("[data-auth-submit]");
    var nameField = $("[data-name-field]");
    var toggle = $("[data-auth-toggle]");
    if (mode === "signup") {
      if (title) title.textContent = "Create your account";
      if (sub) sub.textContent = "Set up access to manage your service.";
      if (submit) submit.textContent = "Create account";
      if (nameField) nameField.hidden = false;
      if (toggle) toggle.innerHTML = 'Already have an account? <button type="button" class="link-btn" data-auth-switch="signin">Sign in</button>';
    } else {
      if (title) title.textContent = "Welcome back";
      if (sub) sub.textContent = "Sign in to manage your service.";
      if (submit) submit.textContent = "Sign in";
      if (nameField) nameField.hidden = true;
      if (toggle) toggle.innerHTML = 'New customer? <button type="button" class="link-btn" data-auth-switch="signup">Create an account</button>';
    }
    setAuthMsg("");
  }

  document.addEventListener("click", function (e) {
    var sw = e.target.closest("[data-auth-switch]");
    if (sw) { e.preventDefault(); setAuthMode(sw.getAttribute("data-auth-switch")); }
  });

  if (loginForm && sb) {
    loginForm.addEventListener("submit", function (e) {
      e.preventDefault();
      var email = (loginForm.querySelector('input[name="email"]').value || "").trim();
      var pass = (loginForm.querySelector('input[name="password"]').value || "");
      var nameInput = loginForm.querySelector('input[name="full_name"]');
      var fullName = nameInput ? nameInput.value.trim() : "";
      var submit = $("[data-auth-submit]");

      if (!email || email.indexOf("@") === -1) { setAuthMsg("Enter a valid email address.", "error"); return; }
      if (pass.length < 6) { setAuthMsg("Password must be at least 6 characters.", "error"); return; }

      if (submit) { submit.disabled = true; }
      setAuthMsg(authMode === "signup" ? "Creating your account…" : "Signing you in…");

      if (authMode === "signup") {
        sb.auth.signUp({
          email: email, password: pass,
          options: { data: { full_name: fullName } }
        }).then(function (res) {
          if (submit) submit.disabled = false;
          if (res.error) { setAuthMsg(res.error.message, "error"); return; }
          if (res.data && res.data.session) {
            enterApp(); // confirmation disabled -> straight in
          } else {
            setAuthMsg("Account created. Check your email to confirm, then sign in.", "success");
            setAuthMode("signin");
          }
        });
      } else {
        sb.auth.signInWithPassword({ email: email, password: pass }).then(function (res) {
          if (submit) submit.disabled = false;
          if (res.error) { setAuthMsg(res.error.message, "error"); return; }
          enterApp();
        });
      }
    });
  } else if (loginForm && !sb) {
    loginForm.addEventListener("submit", function (e) {
      e.preventDefault();
      setAuthMsg("Could not reach the login service. Please refresh and try again.", "error");
    });
  }

  /* sign out */
  document.addEventListener("click", function (e) {
    var so = e.target.closest("[data-signout]");
    if (!so || !sb) return;
    e.preventDefault();
    sb.auth.signOut().then(function () { showAuth(); });
  });

  function showAuth() {
    if (appView) appView.hidden = true;
    if (authView) authView.hidden = false;
    window.scrollTo(0, 0);
  }

  function enterApp() {
    if (authView) authView.hidden = true;
    if (appView) appView.hidden = false;
    window.scrollTo(0, 0);
    loadData();
  }

  /* ============================================================
     DATA LOADING
     ============================================================ */
  function loadData() {
    if (!sb) return;
    sb.auth.getUser().then(function (u) {
      var user = u && u.data ? u.data.user : null;
      if (!user) { showAuth(); return; }
      DATA.user = user;
      var uid = user.id;
      Promise.all([
        sb.from("profiles").select("*").eq("id", uid).maybeSingle(),
        sb.from("service_addresses").select("*").eq("profile_id", uid).limit(1),
        sb.from("subscriptions").select("*").eq("profile_id", uid).maybeSingle(),
        sb.from("invoices").select("*").eq("profile_id", uid).order("invoice_date", { ascending: false }),
        sb.from("service_events").select("*").eq("profile_id", uid).order("occurred_at", { ascending: false }).limit(6)
      ]).then(function (r) {
        DATA.profile = (r[0] && r[0].data) || { email: user.email };
        DATA.address = (r[1] && r[1].data && r[1].data[0]) || null;
        DATA.sub = (r[2] && r[2].data) || null;
        DATA.invoices = (r[3] && r[3].data) || [];
        DATA.events = (r[4] && r[4].data) || [];
        render();
      });
    });
  }

  /* ============================================================
     RENDER
     ============================================================ */
  function planName(sub) {
    if (!sub) return "Curb Crew";
    var extras = ADDONS.filter(function (a) { return sub[a.col]; }).map(function (a) { return a.name.replace(" can", ""); });
    return extras.length ? "Curb Crew + " + extras.join(" + ") : "Curb Crew";
  }
  function monthlyTotalCents(sub) {
    if (!sub) return 0;
    if (sub.monthly_total_cents != null) return sub.monthly_total_cents;
    var base = sub.base_price_cents || 0;
    ADDONS.forEach(function (a) { if (sub[a.col]) base += a.cents; });
    return base;
  }
  function statusLabel(sub) {
    var s = sub && sub.status ? sub.status : "active";
    return s.charAt(0).toUpperCase() + s.slice(1);
  }

  function render() {
    var p = DATA.profile || {}, a = DATA.address || {}, s = DATA.sub || {};
    var name = p.full_name || (DATA.user && DATA.user.email) || "there";
    var firstName = (p.full_name || "").split(/\s+/)[0] || "there";

    // sidebar + greeting
    setText("user.name", p.full_name || "Your account");
    setText("user.addr", a.line1 || "");
    $all('[data-bind="user.initials"]').forEach(function (el) { el.textContent = initialsOf(p.full_name); });
    setText("greeting.first", firstName);

    // plan card / overview
    setText("plan.name", planName(s));
    setText("plan.price_month", money(monthlyTotalCents(s)) + " / month");
    var statusEls = $all('[data-bind="plan.status"]');
    statusEls.forEach(function (el) {
      el.textContent = statusLabel(s);
      el.className = "pill " + (s.status === "paused" ? "pill--amber" : s.status === "cancelled" ? "pill--grey" : "pill--green");
    });

    // account
    setText("account.name", p.full_name);
    setText("account.email", p.email || (DATA.user && DATA.user.email));
    setText("account.phone", p.phone);
    setText("addr.line", a.line1);
    setText("addr.city", [a.city, a.state, a.zip].filter(Boolean).join(", "));
    setText("addr.return", a.can_return_location);

    // plan & payments: line items
    var plan_lines = $('[data-list="plan_lines"]');
    if (plan_lines) {
      var rows = ['<div class="line"><span>Curb Crew Plan</span><strong>' + money(s.base_price_cents || 3500) + "</strong></div>"];
      ADDONS.forEach(function (ad) { if (s[ad.col]) rows.push('<div class="line"><span>' + ad.name + "</span><strong>" + money(ad.cents) + "</strong></div>"); });
      rows.push('<div class="line line--total"><span>Total monthly</span><strong>' + money(monthlyTotalCents(s)) + "</strong></div>");
      plan_lines.innerHTML = rows.join("");
    }
    setText("plan.next_charge", s.current_period_end ? fmtDate(s.current_period_end) : "—");

    // pause/resume button label
    $all('[data-action="pause"]').forEach(function (b) { b.textContent = (s.status === "paused") ? "Resume" : "Pause"; });

    // add-ons
    var addonList = $('[data-list="addons"]');
    if (addonList) {
      addonList.innerHTML = ADDONS.map(function (ad) {
        var on = !!s[ad.col];
        if (on) {
          return '<div class="addon-row addon-row--on"><div><strong>' + ad.name + "</strong><span>Active on your plan</span></div>" +
                 '<button class="btn btn--ghost btn--sm" data-addon-remove="' + ad.col + '">Remove</button></div>';
        }
        return '<div class="addon-row"><div><strong>' + ad.name + "</strong><span>" + ad.desc + "</span></div>" +
               '<button class="btn btn--ghost btn--sm" data-addon-add="' + ad.col + '">Add ' + money(ad.cents) + "/mo</button></div>";
      }).join("");
    }

    // invoices
    var inv = $('[data-list="invoices"]');
    if (inv) {
      if (!DATA.invoices.length) {
        inv.innerHTML = '<tr><td colspan="4" class="muted">No invoices yet.</td></tr>';
      } else {
        inv.innerHTML = DATA.invoices.map(function (i) {
          var receipt = i.receipt_url
            ? '<a class="link-btn" href="' + i.receipt_url + '" target="_blank" rel="noopener">Download</a>'
            : '<span class="muted">—</span>';
          return "<tr><td>" + fmtDate(i.invoice_date) + "</td><td>" + (i.description || "Monthly subscription") +
                 "</td><td>" + money(i.amount_cents) + "</td><td>" + receipt + "</td></tr>";
        }).join("");
      }
    }

    // activity
    var act = $('[data-list="activity"]');
    if (act) {
      if (!DATA.events.length) {
        act.innerHTML = '<li class="muted">No activity yet.</li>';
      } else {
        act.innerHTML = DATA.events.map(function (ev) {
          var dot = /pay|invoice|charge/i.test(ev.event_type || "") ? "dot-pay" : "dot-ok";
          var label = ev.event_type || ev.notes || "Service update";
          return '<li><span class="' + dot + '"></span> ' + label + ' &middot; <span class="muted">' + fmtDate(ev.occurred_at) + "</span></li>";
        }).join("");
      }
    }

    renderSchedule();
  }

  /* schedule: derive from a pickup day on the address if present */
  function renderSchedule() {
    var a = DATA.address || {};
    var dayName = a.pickup_day || a.collection_day || a.day || null;
    var nextEl = $('[data-bind="pickup.next"]');
    var dateEl = $('[data-bind="pickup.date"]');
    var schedBody = $('[data-list="schedule"]');

    var DAYS = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];
    function dayIndex(name) {
      if (!name) return -1;
      var n = String(name).toLowerCase().slice(0, 3);
      for (var i = 0; i < DAYS.length; i++) if (DAYS[i].toLowerCase().slice(0, 3) === n) return i;
      return -1;
    }
    var di = dayIndex(dayName);
    if (di === -1) {
      if (nextEl) nextEl.textContent = "Pending";
      if (dateEl) dateEl.textContent = "Set once your route is assigned";
      if (schedBody) schedBody.innerHTML = '<tr><td colspan="4" class="muted">Your pickup schedule will appear here once your route is assigned.</td></tr>';
      return;
    }
    // next 4 occurrences
    var today = new Date(); today.setHours(0,0,0,0);
    var dates = [];
    var d = new Date(today);
    while (dates.length < 4) {
      if (d.getDay() === di && d >= today) dates.push(new Date(d));
      d.setDate(d.getDate() + 1);
    }
    var items = (a.addon_recycling || (DATA.sub && DATA.sub.addon_recycling)) ? "Trash + Recycling" : "Trash";
    if (nextEl) nextEl.textContent = DAYS[di];
    if (dateEl) dateEl.textContent = fmtDate(dates[0]);
    if (schedBody) {
      schedBody.innerHTML = dates.map(function (dt) {
        var night = new Date(dt); night.setDate(night.getDate() - 1);
        return "<tr><td>" + fmtDate(dt) + "</td><td>" + fmtDate(night) + "</td><td>" + items +
               '</td><td><span class="tag tag--scheduled">Scheduled</span></td></tr>';
      }).join("");
    }
  }

  /* ============================================================
     PANEL NAVIGATION
     ============================================================ */
  function showPanel(name) {
    if (!TITLES[name]) return;
    $all(".panel").forEach(function (p) { p.hidden = p.getAttribute("data-panel") !== name; });
    $all(".side__link").forEach(function (l) { l.classList.toggle("is-active", l.getAttribute("data-nav") === name); });
    $all(".tabbar__item").forEach(function (t) { t.classList.toggle("is-active", t.getAttribute("data-nav") === name); });
    var title = $("[data-page-title]"); if (title) title.textContent = TITLES[name];
    var sel = $("[data-mobile-nav]"); if (sel) sel.value = name;
    var main = $(".main"); if (main) main.scrollTop = 0;
    window.scrollTo(0, 0);
  }
  document.addEventListener("click", function (e) {
    var navEl = e.target.closest("[data-nav]");
    if (navEl) { e.preventDefault(); showPanel(navEl.getAttribute("data-nav")); }
  });
  var mobileNav = $("[data-mobile-nav]");
  if (mobileNav) mobileNav.addEventListener("change", function () { showPanel(mobileNav.value); });

  /* ============================================================
     MODAL  (supports confirm + custom form body)
     ============================================================ */
  var modal = $("[data-modal]");
  var modalTitle = $("[data-modal-title]");
  var modalBody = $("[data-modal-body]");
  var modalConfirm = $("[data-modal-confirm]");
  var pendingConfirm = null;

  function openModal(title, bodyHTML, confirmLabel, onConfirm, danger) {
    modalTitle.textContent = title;
    modalBody.innerHTML = bodyHTML;
    modalConfirm.textContent = confirmLabel || "Confirm";
    modalConfirm.classList.toggle("btn--danger-ghost", !!danger);
    pendingConfirm = onConfirm || null;
    modal.hidden = false;
  }
  function closeModal() { modal.hidden = true; pendingConfirm = null; modalConfirm.classList.remove("btn--danger-ghost"); }
  $all("[data-modal-close]").forEach(function (el) { el.addEventListener("click", closeModal); });
  if (modalConfirm) modalConfirm.addEventListener("click", function () { var fn = pendingConfirm; if (fn) fn(); });
  document.addEventListener("keydown", function (e) { if (e.key === "Escape" && modal && !modal.hidden) closeModal(); });

  /* ---------- toast ---------- */
  var toast = $("[data-toast]"); var toastTimer = null;
  function showToast(text) {
    if (!toast) return;
    toast.textContent = text; toast.classList.add("is-show");
    clearTimeout(toastTimer); toastTimer = setTimeout(function () { toast.classList.remove("is-show"); }, 3200);
  }

  /* ============================================================
     WRITE ACTIONS  (update the customer's own rows)
     ============================================================ */
  function updateSub(patch) {
    if (!sb || !DATA.user) return Promise.resolve({ error: "no session" });
    return sb.from("subscriptions").update(patch).eq("profile_id", DATA.user.id).then(function (r) {
      if (!r.error) { Object.assign(DATA.sub = DATA.sub || {}, patch); render(); }
      return r;
    });
  }
  function recalcTotal(sub) {
    var base = sub.base_price_cents || 3500;
    ADDONS.forEach(function (a) { if (sub[a.col]) base += a.cents; });
    return base;
  }

  function setAddon(col, on) {
    var next = Object.assign({}, DATA.sub || {});
    next[col] = on;
    var patch = {}; patch[col] = on;
    patch.monthly_total_cents = recalcTotal(next);
    updateSub(patch).then(function (r) {
      showToast(r.error ? "Could not update add-on." : (on ? "Add-on added to your plan." : "Add-on removed."));
    });
  }

  var ACTIONS = {
    pause: function () {
      var paused = DATA.sub && DATA.sub.status === "paused";
      if (paused) {
        updateSub({ status: "active" }).then(function (r) { showToast(r.error ? "Could not resume." : "Service resumed."); });
        return;
      }
      openModal("Pause your service?", "We'll stop pickups and pause billing until you resume. You can come back anytime.", "Pause service", function () {
        updateSub({ status: "paused" }).then(function (r) { closeModal(); showToast(r.error ? "Could not pause." : "Service paused."); });
      });
    },
    cancel: function () {
      openModal("Cancel your plan?", "No contract and no fee. Your service ends after your current billing period.", "Cancel plan", function () {
        updateSub({ status: "cancelled" }).then(function (r) { closeModal(); showToast(r.error ? "Could not cancel." : "Plan cancelled."); });
      }, true);
    },
    "edit-profile": function () {
      var p = DATA.profile || {};
      openModal("Edit profile",
        formRow("Full name", "f_name", p.full_name) +
        formRow("Phone", "f_phone", p.phone),
        "Save", function () {
          var patch = { full_name: val("f_name"), phone: val("f_phone") };
          sb.from("profiles").update(patch).eq("id", DATA.user.id).then(function (r) {
            closeModal();
            if (r.error) { showToast("Could not save profile."); return; }
            Object.assign(DATA.profile, patch); render(); showToast("Profile updated.");
          });
        });
    },
    "edit-address": function () {
      var a = DATA.address || {};
      openModal("Edit service address",
        formRow("Street", "a_line1", a.line1) +
        formRow("City", "a_city", a.city) +
        formRow("State", "a_state", a.state) +
        formRow("ZIP", "a_zip", a.zip) +
        formRow("Where we return cans", "a_ret", a.can_return_location),
        "Save", function () {
          var patch = { line1: val("a_line1"), city: val("a_city"), state: val("a_state"), zip: val("a_zip"), can_return_location: val("a_ret") };
          if (!DATA.address) { showToast("No address on file to edit yet."); closeModal(); return; }
          sb.from("service_addresses").update(patch).eq("id", DATA.address.id).then(function (r) {
            closeModal();
            if (r.error) { showToast("Could not save address."); return; }
            Object.assign(DATA.address, patch); render(); showToast("Address updated.");
          });
        });
    },
    payment: function () { showToast("Online payment management is coming soon."); },
    support: function () { window.location.href = "mailto:hello@curbcrew.example?subject=Portal%20support"; }
  };

  function formRow(label, id, value) {
    return '<label class="field"><span>' + label + '</span><input type="text" data-f="' + id + '" value="' + (value == null ? "" : String(value).replace(/"/g, "&quot;")) + '" /></label>';
  }
  function val(id) { var el = $('[data-f="' + id + '"]'); return el ? el.value.trim() : ""; }

  document.addEventListener("click", function (e) {
    var add = e.target.closest("[data-addon-add]");
    if (add) { setAddon(add.getAttribute("data-addon-add"), true); return; }
    var rem = e.target.closest("[data-addon-remove]");
    if (rem) { setAddon(rem.getAttribute("data-addon-remove"), false); return; }
    var actEl = e.target.closest("[data-action]");
    if (actEl) { var fn = ACTIONS[actEl.getAttribute("data-action")]; if (fn) fn(); }
  });

  /* ============================================================
     BOOT
     ============================================================ */
  setAuthMode("signin");
  if (sb) {
    sb.auth.getSession().then(function (r) {
      if (r && r.data && r.data.session) enterApp();
      else showAuth();
    });
    sb.auth.onAuthStateChange(function (_evt, session) {
      if (session) { if (appView && appView.hidden) enterApp(); }
      else showAuth();
    });
  } else {
    showAuth();
  }
})();
