/* ============================================================
   CURB CREW - portal.js  (real Supabase Auth + live data)
   ============================================================ */
(function () {
  "use strict";

  var SUPABASE_URL = "https://hezahtnfyhqfucixzqxi.supabase.co";
  var SUPABASE_KEY = "sb_publishable_9l4_Bqgjg7qBapvYlLPJSA_pHOk0nMB";
  var sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
  var CURRENT = { profile: {}, addr: {} };

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
  var toggleEl = $("[data-toggle-mode]"); if (toggleEl) toggleEl.addEventListener("click", function (e) { e.preventDefault(); setMode(mode === "signin" ? "signup" : "signin"); });

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
        CURRENT.profile = p; CURRENT.addr = addr || {};
        var name = p.full_name || (email ? email.split("@")[0] : "there");

        // identity
        bind("greeting", greet() + ", " + name.split(" ")[0]);
        bind("avatar", initials(p.full_name));
        bind("side_name", p.full_name || name);
        bind("side_addr", addr ? addr.line1 : "No address yet");
        bind("name", p.full_name || "Not set");
        bind("email", p.email || email || "");
        window.__cc_email = p.email || email || "";
        bind("phone", p.phone || "Not set");
        bind("address", addr ? addr.line1 : "Not set");
        bind("city", addr ? [addr.city, addr.state, addr.zip].filter(Boolean).join(", ") : "Not set");
        bind("can_return", (addr && addr.can_return_location) || "Not set");
        bind("gate_code", (addr && addr.gate_code) || "Not set");
        bind("access_notes", (addr && addr.access_notes) || "None");
        bind("crew", "Assigning to your street");
        bind("ontime", "");
        sb.rpc("get_my_crew_first_name").then(function (cr) {
          if (cr && cr.data) { bind("crew", cr.data); bind("ontime", "Your crew on the street"); }
        });

        // plan
        renderPlan(sub);

        // next pickup (skip paused/skipped days)
        var nextPk = pickups.filter(function (x) { return x.status !== "skipped"; })[0];
        renderNext(nextPk, sub);

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
    var paused = sub.status === "paused";
    var resumeBtn = $("[data-resume-btn]"), pauseBtn = $("[data-pause-btn]"), holdBtn = $("[data-hold-btn]"), cancelBtn = $("[data-cancel-btn]"), pnote = $("[data-pause-note]");
    if (resumeBtn) resumeBtn.hidden = !paused;
    if (pauseBtn) pauseBtn.hidden = paused;
    if (holdBtn) holdBtn.hidden = paused;
    if (cancelBtn) cancelBtn.hidden = paused;
    if (pnote) {
      if (paused) { pnote.hidden = false; pnote.textContent = sub.pause_end ? ("Paused for vacation. Service resumes " + fmtDate(sub.pause_end) + ".") : "Your membership is on hold. Resume whenever you are ready."; }
      else pnote.hidden = true;
    }
  }

  function renderNext(pk, sub) {
    if (!pk) {
      if (sub && sub.status === "paused") {
        bind("next_day", "Paused");
        bind("next_date_rel", sub.pause_end ? ("Service resumes " + fmtDate(sub.pause_end)) : "Membership on hold");
        bind("next_note", "Your pickups are paused. Resume anytime from Plan & payments.");
        return;
      }
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
      var tag;
      if (pk.status === "skipped") tag = '<span class="tag tag--paused">Paused</span>';
      else if (pk.status === "completed") tag = '<span class="tag tag--done">Done</span>';
      else if (pk.is_holiday_shift) tag = '<span class="tag tag--holiday">Holiday shift</span>';
      else tag = '<span class="tag tag--scheduled">Scheduled</span>';
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
  var modal = $("[data-modal]"), modalTitle = $("[data-modal-title]"), modalBody = $("[data-modal-body]"), modalConfirm = $("[data-modal-confirm]"), modalSecondary = $("[data-modal-secondary]");
  var pending = null, pendingSecondary = null;
  function openModal(o) {
    modalTitle.textContent = o.title || "";
    modalBody.innerHTML = o.html || "";
    modalConfirm.textContent = o.confirmLabel || "Confirm";
    modalConfirm.classList.toggle("btn--danger-ghost", !!o.danger);
    pending = o.onConfirm || null;
    if (o.secondaryLabel) { modalSecondary.textContent = o.secondaryLabel; modalSecondary.hidden = false; modalSecondary.classList.toggle("btn--danger-ghost", !!o.secondaryDanger); pendingSecondary = o.onSecondary || null; }
    else { modalSecondary.hidden = true; pendingSecondary = null; }
    modal.hidden = false;
  }
  function closeModal() { modal.hidden = true; pending = null; pendingSecondary = null; modalConfirm.classList.remove("btn--danger-ghost"); modalSecondary.classList.remove("btn--danger-ghost"); }
  $all("[data-modal-close]").forEach(function (el) { el.addEventListener("click", closeModal); });
  modalConfirm.addEventListener("click", function () { if (pending && pending() === false) return; closeModal(); });
  modalSecondary.addEventListener("click", function () { var fn = pendingSecondary; closeModal(); if (fn) fn(); });
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

  function callFn(name, body) { return sb.functions.invoke(name, { body: body || {} }); }
  function callManage(action, extra, okMsg) {
    showToast("Working...");
    var body = { action: action };
    if (extra) Object.keys(extra).forEach(function (k) { body[k] = extra[k]; });
    return callFn("manage-subscription", body).then(function (res) {
      if (res.error || !res.data || res.data.error) { showToast("Something went wrong. Please try again."); return; }
      showToast(okMsg || "Done.");
      loadData();
    });
  }

  var ACTIONS = {
    payment: function () {
      showToast("Opening secure billing...");
      callFn("create-billing-portal-session").then(function (res) {
        if (res.data && res.data.url) { window.location.href = res.data.url; return; }
        if (res.data && res.data.no_customer) {
          callFn("create-checkout-session", { addons: {} }).then(function (r2) {
            if (r2.data && r2.data.url) { window.location.href = r2.data.url; } else { showToast("Could not open checkout."); }
          });
          return;
        }
        showToast("Could not open billing. Try again.");
      });
    },
    cancel: function () {
      openModal({
        title: "Before you go: 3 months of recycling, free?",
        html: '<p style="margin-bottom:10px;color:var(--ink-70)">We would hate to see you go. Stay with us and your recycling pickup is <strong>free for 3 months</strong> (a $24 value), credited to your bills automatically.</p>'
          + '<p style="color:var(--ink-70)">Or cancel anyway, no contract and no fee. Your service runs through the period you have already paid for.</p>',
        confirmLabel: "Keep my plan",
        onConfirm: function () { callManage("recycling_offer", null, "Done. 3 months of free recycling applied."); },
        secondaryLabel: "Cancel anyway",
        secondaryDanger: true,
        onSecondary: function () { callManage("cancel", null, "Your plan will cancel at the end of the period."); }
      });
    },
    pause: function () {
      var min = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
      openModal({
        title: "Heading out of town?",
        html: '<p style="margin-bottom:12px;color:var(--ink-70)">Away for a bit? Give us your return date and we will pause your pickups and your billing until then, so you only pay for service you actually get. We pick right back up the day you are home.</p>'
          + '<label style="display:flex;flex-direction:column;gap:6px;font-size:13px;font-weight:600;color:var(--ink-70)"><span>Resume service on</span>'
          + '<input type="date" data-pause-date min="' + min + '" value="' + min + '" style="font:inherit;font-size:15px;padding:12px 13px;border:1px solid var(--line-strong);border-radius:11px"></label>',
        confirmLabel: "Pause until then",
        onConfirm: function () {
          var d = modalBody.querySelector("[data-pause-date]");
          var rd = d && d.value;
          if (!rd) { showToast("Pick a return date."); return false; }
          callManage("pause", { resume_date: rd }, "Service paused. We resume on " + fmtDate(rd) + ".");
        }
      });
    },
    resume: function () { callManage("resume", null, "Welcome back. Service resumed."); },
    hold: function () {
      openModal({
        title: "Put your membership on hold?",
        html: '<p style="margin-bottom:10px;color:var(--ink-70)">This stops your billing right away, we will not charge you again until you choose to resume. Your pickups pause with no end date, so it is perfect if you are not sure when you will be back.</p><p style="color:var(--ink-70)">You can resume anytime from this page.</p>',
        confirmLabel: "Hold my membership",
        onConfirm: function () { callManage("hold", null, "Your membership is on hold. Billing is stopped until you resume."); }
      });
    },
    receipt: function () { ACTIONS.payment(); },
    edit: function () {
      var p = CURRENT.profile || {}, a = CURRENT.addr || {};
      var DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
      function ef(label, key, val, ph) {
        return '<label style="display:flex;flex-direction:column;gap:5px;margin-bottom:10px;font-size:13px;font-weight:600;color:var(--ink-70)"><span>' + label + '</span>'
          + '<input data-ef="' + key + '" value="' + (val == null ? "" : String(val).replace(/"/g, "&quot;")) + '" placeholder="' + (ph || "") + '" style="font:inherit;font-size:15px;padding:11px 12px;border:1px solid var(--line-strong);border-radius:10px"></label>';
      }
      function efDay(label, key, val) {
        var opts = DAYS.map(function (d) { return '<option' + (d === val ? " selected" : "") + ">" + d + "</option>"; }).join("");
        return '<label style="display:flex;flex-direction:column;gap:5px;margin-bottom:10px;font-size:13px;font-weight:600;color:var(--ink-70)"><span>' + label + '</span>'
          + '<select data-ef="' + key + '" style="font:inherit;font-size:15px;padding:11px 12px;border:1px solid var(--line-strong);border-radius:10px;background:#fff">' + opts + '</select></label>';
      }
      var html = ef("Full name", "name", p.full_name, "")
        + ef("Phone", "phone", p.phone, "")
        + ef("Street address", "line1", a.line1, "123 Maple St")
        + ef("ZIP", "zip", a.zip, "")
        + efDay("Trash pickup day", "pickup_day", a.pickup_day)
        + ef("Where the cans live", "can_return_location", a.can_return_location, "Left side, behind the gate")
        + ef("Gate / community code", "gate_code", a.gate_code, "optional")
        + ef("Garage code", "garage_code", a.garage_code, "optional")
        + ef("Anything else for the crew", "access_notes", a.access_notes, "optional");
      openModal({
        title: "Edit your profile",
        html: '<div style="max-height:54vh;overflow:auto;padding-right:4px">' + html + '</div>',
        confirmLabel: "Save changes",
        onConfirm: function () {
          var g = function (k) { var el = modalBody.querySelector('[data-ef="' + k + '"]'); return el ? el.value.trim() : ""; };
          var oldDay = a.pickup_day || "";
          var newDay = g("pickup_day");
          showToast("Saving...");
          sb.auth.getUser().then(function (u) {
            var uid = u.data.user && u.data.user.id; if (!uid) { showToast("Please sign in again."); return; }
            var addrFields = { line1: g("line1"), zip: g("zip"), pickup_day: newDay, can_return_location: g("can_return_location"), gate_code: g("gate_code"), garage_code: g("garage_code"), access_notes: g("access_notes") };
            var aP = (CURRENT.addr && CURRENT.addr.id)
              ? sb.from("service_addresses").update(addrFields).eq("id", CURRENT.addr.id).select()
              : sb.from("service_addresses").insert(Object.assign({ profile_id: uid, is_primary: true, is_prospect: false }, addrFields)).select();
            Promise.all([
              sb.from("profiles").update({ full_name: g("name"), phone: g("phone") }).eq("id", uid).select(),
              aP
            ]).then(function (r) {
              var err = (r[0] && r[0].error) || (r[1] && r[1].error);
              if (err) { showToast("Could not save: " + (err.message || "please try again.")); return; }
              if (newDay && newDay !== oldDay) {
                sb.rpc("regenerate_my_pickups").then(function () { showToast("Saved. Your schedule was updated."); loadData(); });
              } else {
                showToast("Saved."); loadData();
              }
            });
          });
        }
      });
    },
    support: function () { if (window.openSupport) { window.openSupport(); } }
  };
  document.addEventListener("click", function (e) {
    var a = e.target.closest("[data-action]"); if (!a) return;
    var fn = ACTIONS[a.getAttribute("data-action")]; if (fn) fn();
  });
})();
