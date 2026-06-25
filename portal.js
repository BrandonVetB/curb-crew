/* ============================================================
   CURB CREW - portal.js  (real Supabase Auth + live data)
   ============================================================ */
(function () {
  "use strict";

  var SUPABASE_URL = "https://hezahtnfyhqfucixzqxi.supabase.co";
  var SUPABASE_KEY = "sb_publishable_9l4_Bqgjg7qBapvYlLPJSA_pHOk0nMB";
  var sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

  function $(s, c) { return (c || document).querySelector(s); }
  function $all(s, c) { return Array.prototype.slice.call((c || document).querySelectorAll(s)); }
  function money(cents) { return cents == null ? "$0" : "$" + (cents / 100).toFixed(2); }
  function bind(key, val) { var el = $('[data-bind="' + key + '"]'); if (el) el.textContent = val; }
  function bindHTML(key, html) { var el = $('[data-bind="' + key + '"]'); if (el) el.innerHTML = html; }

  var authView = $('[data-view="auth"]');
  var appView = $('[data-view="app"]');
  var TITLES = { overview: "Overview", schedule: "Schedule", plan: "Plan & payments", account: "Account" };

  /* ================= AUTH ================= */
  var form = $("[data-auth-form]");
  var msg = $("[data-auth-msg]");
  var mode = "signin";

  function setMode(m) {
    mode = m;
    $("[data-auth-title]").textContent = m === "signin" ? "Welcome back" : "Create your account";
    $("[data-auth-sub]").textContent = m === "signin" ? "Sign in to manage your service." : "Set up your Curb Crews account.";
    $("[data-auth-submit]").textContent = m === "signin" ? "Sign in" : "Create account";
    $("[data-name-field]").hidden = m !== "signup";
    $('[data-mode="signin"]').hidden = m !== "signin";
    $('[data-mode="signup"]').hidden = m !== "signup";
    msg.textContent = "";
  }
  $("[data-toggle-mode]").addEventListener("click", function (e) { e.preventDefault(); setMode(mode === "signin" ? "signup" : "signin"); });

  form.addEventListener("submit", function (e) {
    e.preventDefault();
    var email = form.querySelector('[name="email"]').value.trim();
    var password = form.querySelector('[name="password"]').value;
    var name = (form.querySelector('[name="name"]') || {}).value || "";
    if (!email || email.indexOf("@") === -1) { return fail("Enter a valid email."); }
    if (!password || password.length < 8) { return fail("Password must be at least 8 characters."); }
    msg.className = "auth__msg"; msg.textContent = mode === "signin" ? "Signing in..." : "Creating account...";

    if (mode === "signup") {
      sb.auth.signUp({ email: email, password: password, options: { data: { full_name: name.trim() } } })
        .then(function (r) {
          if (r.error) return fail(r.error.message);
          if (r.data.session) { enterApp(); }
          else { setMode("signin"); ok("Account created. Check your email to confirm, then sign in."); }
        });
    } else {
      sb.auth.signInWithPassword({ email: email, password: password })
        .then(function (r) {
          if (r.error) return fail(r.error.message);
          enterApp();
        });
    }
  });
  function fail(t) { msg.className = "auth__msg is-error"; msg.textContent = t; }
  function ok(t) { msg.className = "auth__msg is-success"; msg.textContent = t; }

  $("[data-signout]").addEventListener("click", function () {
    sb.auth.signOut().then(function () { appView.hidden = true; authView.hidden = false; form.reset(); });
  });

  function enterApp() { authView.hidden = true; appView.hidden = false; window.scrollTo(0, 0); loadData(); }

  // session on load
  sb.auth.getSession().then(function (r) {
    if (r.data.session) { authView.hidden = true; appView.hidden = false; loadData(); }
    else { authView.hidden = false; appView.hidden = true; }
  });

  /* ================= LOAD DATA ================= */
  function fmtDay(d) { return new Date(d + "T00:00:00").toLocaleDateString("en-US", { weekday: "long" }); }
  function fmtDate(d) { return new Date(d + "T00:00:00").toLocaleDateString("en-US", { month: "long", day: "numeric" }); }
  function fmtShort(d) { return new Date(d + "T00:00:00").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" }); }
  function relDays(d) { var diff = Math.round((new Date(d + "T00:00:00") - new Date(new Date().toDateString())) / 86400000); return diff <= 0 ? "today" : diff === 1 ? "tomorrow" : "in " + diff + " days"; }
  function initials(n) { return (n || "CC").split(" ").map(function (p) { return p[0]; }).join("").slice(0, 2).toUpperCase(); }
  function greet() { var h = new Date().getHours(); return h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening"; }

  function loadData() {
    sb.auth.getUser().then(function (u) {
      var uid = u.data.user && u.data.user.id;
      var email = u.data.user && u.data.user.email;
      if (!uid) return;

      Promise.all([
        sb.from("profiles").select("*").eq("id", uid).maybeSingle(),
        sb.from("service_addresses").select("*").eq("profile_id", uid).order("is_primary", { ascending: false }).limit(1).maybeSingle(),
        sb.from("subscriptions").select("*").eq("profile_id", uid).order("created_at", { ascending: false }).limit(1).maybeSingle(),
        sb.from("pickups").select("*").eq("profile_id", uid).gte("pickup_date", new Date().toISOString().slice(0, 10)).order("pickup_date", { ascending: true }).limit(8),
        sb.from("invoices").select("*").eq("profile_id", uid).order("invoice_date", { ascending: false }).limit(8),
        sb.from("service_events").select("*").eq("profile_id", uid).order("occurred_at", { ascending: false }).limit(5)
      ]).then(function (res) {
        var p = res[0].data || {}, addr = res[1].data, sub = res[2].data, pickups = res[3].data || [], invoices = res[4].data || [], events = res[5].data || [];
        var name = p.full_name || (email ? email.split("@")[0] : "there");

        // identity
        bind("greeting", greet() + ", " + name.split(" ")[0]);
        bind("avatar", initials(p.full_name));
        bind("side_name", p.full_name || name);
        bind("side_addr", addr ? addr.line1 : "No address yet");
        bind("name", p.full_name || "Not set");
        bind("email", p.email || email || "");
        bind("phone", p.phone || "Not set");
        bind("address", addr ? addr.line1 : "Not set");
        bind("city", addr ? [addr.city, addr.state, addr.zip].filter(Boolean).join(", ") : "Not set");
        bind("can_return", (addr && addr.can_return_location) || "Not set");
        bind("crew", "Assigning to your street");
        bind("ontime", "");

        // plan
        renderPlan(sub);

        // next pickup
        renderNext(pickups[0]);

        // lists
        renderActivity(events);
        renderSchedule(pickups);
        renderInvoices(invoices);
      });
    });
  }

  function renderPlan(sub) {
    var pillEl = $('[data-bind="plan_pill"]');
    if (!sub || sub.status === "pending") {
      bind("plan_name", "No active plan yet");
      bind("plan_name2", "Curb Crews Plan");
      bind("plan_price", "Add payment to start");
      bind("plan_base", "$35.00");
      bind("plan_total", "$35.00");
      bind("next_charge", "Not billing yet");
      if (pillEl) { pillEl.textContent = "Inactive"; pillEl.className = "pill"; }
      return;
    }
    var addons = [];
    if (sub.addon_recycling) addons.push("Recycling");
    if (sub.addon_yard_waste) addons.push("Yard-waste");
    if (sub.addon_cleaning) addons.push("Cleaning");
    var label = "Curb Crews" + (addons.length ? " + " + addons.join(" + ") : "");
    bind("plan_name", label);
    bind("plan_name2", "Curb Crews Plan");
    bind("plan_price", money(sub.monthly_total_cents) + " / month");
    bind("plan_base", money(sub.base_price_cents));
    bind("plan_total", money(sub.monthly_total_cents));
    var addonCents = (sub.monthly_total_cents || 0) - (sub.base_price_cents || 0);
    if (addonCents > 0) { var l = $('[data-bind="addons_line"]'); if (l) l.hidden = false; bind("addons_total", money(addonCents)); }
    bind("next_charge", sub.current_period_end ? "Next charge: " + fmtDate(sub.current_period_end) : "Billing starts when Stripe is connected");
    if (pillEl) {
      var map = { active: ["Active", "pill pill--green"], paused: ["Paused", "pill"], canceled: ["Canceled", "pill"] };
      var m = map[sub.status] || ["Active", "pill pill--green"];
      pillEl.textContent = m[0]; pillEl.className = m[1];
    }
    if (sub.stripe_subscription_id) { /* real card hookup later */ }
  }

  function renderNext(pk) {
    if (!pk) {
      bind("next_day", "—"); bind("next_date_rel", "No pickup scheduled yet");
      bind("next_note", "Your schedule appears here once your service starts.");
      return;
    }
    bind("next_day", fmtDay(pk.pickup_date));
    bind("next_date_rel", fmtDate(pk.pickup_date) + " · " + relDays(pk.pickup_date));
    var t = (pk.types || []).join(" + ") || "Trash";
    bind("next_note", "Going out: " + t + ". We roll your cans out " + (pk.out_night ? "the night before" : "the evening prior") + ".");
  }

  function renderActivity(events) {
    var el = $('[data-list="activity"]');
    if (!el) return;
    if (!events.length) { el.innerHTML = '<li><span class="muted">No activity yet.</span></li>'; return; }
    var labels = { rolled_out: ["dot-ok", "Cans rolled out"], brought_in: ["dot-ok", "Cans returned"] };
    el.innerHTML = events.map(function (e) {
      var L = labels[e.event_type] || ["dot-ok", e.event_type];
      var d = new Date(e.occurred_at).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
      return '<li><span class="' + L[0] + '"></span> ' + L[1] + ' &middot; <span class="muted">' + d + "</span></li>";
    }).join("");
  }

  function renderSchedule(pickups) {
    var el = $('[data-list="schedule"]');
    if (!el) return;
    if (!pickups.length) { el.innerHTML = '<tr><td colspan="4" class="muted">No upcoming pickups scheduled yet.</td></tr>'; return; }
    el.innerHTML = pickups.map(function (pk) {
      var tag = pk.is_holiday_shift ? '<span class="tag tag--holiday">Holiday shift</span>' : '<span class="tag tag--scheduled">Scheduled</span>';
      return "<tr><td>" + fmtShort(pk.pickup_date) + "</td><td>" + (pk.out_night ? fmtShort(pk.out_night) : "—") +
        "</td><td>" + ((pk.types || []).join(" + ") || "Trash") + "</td><td>" + tag + "</td></tr>";
    }).join("");
  }

  function renderInvoices(invoices) {
    var el = $('[data-list="invoices"]');
    if (!el) return;
    if (!invoices.length) { el.innerHTML = '<tr><td colspan="4" class="muted">No invoices yet.</td></tr>'; return; }
    el.innerHTML = invoices.map(function (inv) {
      return "<tr><td>" + fmtDate(inv.invoice_date) + "</td><td>" + (inv.description || "Monthly subscription") +
        "</td><td>" + money(inv.amount_cents) + '</td><td><button class="link-btn" data-action="receipt">Download</button></td></tr>';
    }).join("");
  }

  /* ================= NAV ================= */
  function showPanel(name) {
    if (!TITLES[name]) return;
    $all(".panel").forEach(function (p) { p.hidden = p.getAttribute("data-panel") !== name; });
    $all(".side__link").forEach(function (l) { l.classList.toggle("is-active", l.getAttribute("data-nav") === name); });
    $all(".tabbar__item").forEach(function (t) { t.classList.toggle("is-active", t.getAttribute("data-nav") === name); });
    var title = $("[data-page-title]"); if (title) title.textContent = TITLES[name];
    window.scrollTo(0, 0);
  }
  document.addEventListener("click", function (e) {
    var navEl = e.target.closest("[data-nav]");
    if (navEl) { e.preventDefault(); showPanel(navEl.getAttribute("data-nav")); }
  });

  /* ================= MODAL + ACTIONS ================= */
  var modal = $("[data-modal]"), modalTitle = $("[data-modal-title]"), modalBody = $("[data-modal-body]"), modalConfirm = $("[data-modal-confirm]");
  var pending = null;
  function openModal(title, body, label, onConfirm, danger) {
    modalTitle.textContent = title; modalBody.textContent = body; modalConfirm.textContent = label || "Confirm";
    modalConfirm.classList.toggle("btn--danger-ghost", !!danger); pending = onConfirm; modal.hidden = false;
  }
  function closeModal() { modal.hidden = true; pending = null; modalConfirm.classList.remove("btn--danger-ghost"); }
  $all("[data-modal-close]").forEach(function (el) { el.addEventListener("click", closeModal); });
  modalConfirm.addEventListener("click", function () { var fn = pending; closeModal(); if (fn) fn(); });
  document.addEventListener("keydown", function (e) { if (e.key === "Escape" && !modal.hidden) closeModal(); });

  var toast = $("[data-toast]"), toastTimer = null;
  function showToast(t) { toast.textContent = t; toast.classList.add("is-show"); clearTimeout(toastTimer); toastTimer = setTimeout(function () { toast.classList.remove("is-show"); }, 3200); }

  function updateSub(status, done) {
    sb.auth.getUser().then(function (u) {
      var uid = u.data.user && u.data.user.id; if (!uid) return;
      sb.from("subscriptions").update({ status: status, updated_at: new Date().toISOString() }).eq("profile_id", uid).select().then(function (r) {
        if (r.error || !r.data || !r.data.length) { showToast("No active plan to update yet."); return; }
        loadData(); if (done) done();
      });
    });
  }

  var ACTIONS = {
    pause: function () { openModal("Pause your service?", "We'll stop pickups and pause billing until you resume.", "Pause service", function () { updateSub("paused", function () { showToast("Service paused."); }); }); },
    cancel: function () { openModal("Cancel your plan?", "No contract and no fee. Service ends after your current period.", "Cancel plan", function () { updateSub("canceled", function () { showToast("Plan canceled."); }); }, true); },
    payment: function () { showToast("Card management opens here once Stripe is connected."); },
    receipt: function () { showToast("Receipts available once Stripe is connected."); },
    edit: function () { showToast("Inline editing is coming next."); },
    support: function () { window.location.href = "mailto:hello@curbcrews.com?subject=Support"; }
  };
  document.addEventListener("click", function (e) {
    var a = e.target.closest("[data-action]"); if (!a) return;
    var fn = ACTIONS[a.getAttribute("data-action")]; if (fn) fn();
  });
})();
