/* ============================================================
   CURB CREW - portal.js  (real Supabase Auth + live data)
   ============================================================ */
(function () {
  "use strict";

  var SUPABASE_URL = "https://hezahtnfyhqfucixzqxi.supabase.co";
  var SUPABASE_KEY = "sb_publishable_9l4_Bqgjg7qBapvYlLPJSA_pHOk0nMB";
  var sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
  var CURRENT = { profile: {}, addr: {} };

  // ---- lightweight analytics ----
  var SESSION_ID = (function () { try { var k = "cc_sess", s = sessionStorage.getItem(k); if (!s) { s = Math.random().toString(36).slice(2) + Date.now().toString(36); sessionStorage.setItem(k, s); } return s; } catch (e) { return null; } })();
  function track(event, props) {
    try { sb.from("analytics_events").insert({ event: event, profile_id: (CURRENT.profile && CURRENT.profile.id) || null, session_id: SESSION_ID, page: "portal", props: props || null, user_agent: navigator.userAgent }).then(function () {}, function () {}); } catch (e) {}
  }

  function $(s, c) { return (c || document).querySelector(s); }
  function $all(s, c) { return Array.prototype.slice.call((c || document).querySelectorAll(s)); }
  function money(cents) { return cents == null ? "$0" : "$" + (cents / 100).toFixed(2); }
  function curWeekLetter() { return (Math.floor(Date.now() / (7 * 86400000)) % 2) === 0 ? "A" : "B"; }
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
        CURRENT.profile = p; CURRENT.addr = addr || {}; CURRENT.sub = sub || {};
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
        if (addr && addr.cans_split) {
          var parts = ["Trash: " + (addr.can_loc_trash || "—")];
          if (sub && sub.addon_second_trash) parts.push("Trash 2: " + (addr.can_loc_trash2 || "—"));
          if (sub && sub.addon_recycling) parts.push("Recycling: " + (addr.can_loc_recycling || "—"));
          if (sub && sub.addon_yard_waste) parts.push("Yard: " + (addr.can_loc_yard || "—"));
          bind("can_return", parts.join(" · "));
        } else {
          bind("can_return", (addr && addr.can_return_location) || "Not set");
        }
        bind("gate_code", (addr && addr.gate_code) || "Not set");
        bind("access_notes", (addr && addr.access_notes) || "None");
        bind("crew", "Assigning to your street");
        bind("ontime", "");
        sb.rpc("get_my_crew_first_name").then(function (cr) {
          if (cr && cr.data) { bind("crew", cr.data); bind("ontime", "Your crew on the street"); }
        });
        sb.rpc("get_my_referral_code").then(function (rc) {
          if (rc && rc.data) { var link = "https://curbcrews.com/join.html?ref=" + rc.data; CURRENT.refer_link = link; var el = $('[data-bind="refer_link"]'); if (el) el.value = link; }
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
        callFn("get-billing-info").then(function (rb) { if (rb && rb.data && !rb.data.error) renderBilling(rb.data); });
      });
    });
  }

  function renderPlan(sub) {
    var pillEl = $('[data-bind="plan_pill"]');
    if (!sub || sub.status === "pending") {
      bind("plan_name", "No active plan yet");
      bind("plan_name2", "Base plan");
      bind("plan_price", "Add payment to start");
      bind("plan_base", "$35.00");
      bind("plan_total", "$35.00");
      bind("next_charge", "Not billing yet");
      if (pillEl) { pillEl.textContent = "Inactive"; pillEl.className = "pill"; }
      setAddonControls(null);
      return;
    }
    var addons = [];
    if (sub.addon_second_trash) addons.push("2nd trash");
    if (sub.addon_recycling) addons.push("Recycling");
    if (sub.addon_yard_waste) addons.push("Yard-waste");
    if (sub.addon_cleaning) addons.push("Cleaning");
    var label = "Curb Crews" + (addons.length ? " + " + addons.join(" + ") : "");
    bind("plan_name", label);
    bind("plan_name2", "Base plan");
    bind("plan_price", money(sub.monthly_total_cents) + " / month");
    bind("plan_base", money(sub.base_price_cents));
    bind("plan_total", money(sub.monthly_total_cents));
    var alist = $("[data-addons-list]");
    if (alist) {
      var items = [];
      if (sub.addon_second_trash) items.push(["Second trash can", 800]);
      if (sub.addon_recycling) items.push(["Recycling can", 800]);
      if (sub.addon_yard_waste) items.push(["Yard-waste can", 800]);
      if (sub.addon_cleaning) items.push(["Monthly can cleaning", 2500]);
      alist.innerHTML = items.map(function (it) { return '<div class="line"><span>' + it[0] + '</span><strong>' + money(it[1]) + "</strong></div>"; }).join("");
    }
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
    setAddonControls(sub);
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
        "</td><td>" + money(inv.amount_cents) + '</td><td><button class="link-btn" data-action="receipt">View</button></td></tr>';
    }).join("");
  }

  // Live card + invoices straight from Stripe (overrides the DB invoice table once loaded).
  function renderBilling(b) {
    var payEl = $('[data-bind="pay"]');
    if (payEl) {
      if (b.card) {
        var brand = String(b.card.brand || "Card").replace(/\b\w/g, function (c) { return c.toUpperCase(); });
        var yy = String(b.card.exp_year || "").slice(-2);
        payEl.innerHTML = '<span class="pay-card">' + brand + ' &bull;&bull;&bull;&bull; ' + b.card.last4 + '</span> <span class="muted">exp ' + b.card.exp_month + '/' + yy + '</span>';
      } else {
        payEl.innerHTML = '<span class="muted">No card on file yet. Add one to start service.</span>';
      }
    }
    var el = $('[data-list="invoices"]');
    if (el) {
      if (!b.invoices || !b.invoices.length) { el.innerHTML = '<tr><td colspan="4" class="muted">No invoices yet.</td></tr>'; }
      else {
        el.innerHTML = b.invoices.map(function (inv) {
          var d = inv.date ? new Date(inv.date * 1000).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "—";
          var receipt = inv.url ? '<a class="link-btn" href="' + inv.url + '" target="_blank" rel="noopener">Download</a>' : '<span class="muted">—</span>';
          return "<tr><td>" + d + "</td><td>" + (inv.description || "Subscription") + "</td><td>" + money(inv.amount_cents) + "</td><td>" + receipt + "</td></tr>";
        }).join("");
      }
    }
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
  var modal = $("[data-modal]"), modalTitle = $("[data-modal-title]"), modalBody = $("[data-modal-body]"), modalConfirm = $("[data-modal-confirm]"), modalSecondary = $("[data-modal-secondary]"), modalCancel = $("[data-modal-cancelbtn]");
  var pending = null, pendingSecondary = null;
  function openModal(o) {
    modalTitle.textContent = o.title || "";
    modalBody.innerHTML = o.html || "";
    modalConfirm.textContent = o.confirmLabel || "Confirm";
    modalConfirm.classList.toggle("btn--danger-ghost", !!o.danger);
    pending = o.onConfirm || null;
    if (modalCancel) { modalCancel.textContent = o.cancelLabel || "Never mind"; modalCancel.hidden = !!o.hideCancel; }
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

  // NOTE: subscription writes must go through the manage-subscription edge function
  // (service role), never directly from the client. RLS now allows customers to
  // SELECT their subscription only. callManage() below is the single write path.

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

  function planLabel() {
    var s = CURRENT.sub || {};
    if (!s.status || s.status === "pending") return "Curb Crews";
    var addons = [];
    if (s.addon_second_trash) addons.push("2nd trash");
    if (s.addon_recycling) addons.push("Recycling");
    if (s.addon_yard_waste) addons.push("Yard-waste");
    if (s.addon_cleaning) addons.push("Cleaning");
    return "Curb Crews" + (addons.length ? " + " + addons.join(" + ") : "");
  }
  function showRetentionOffer() {
    track("cancel_offer_shown");
    openModal({
      title: "🎁 A gift, just for you",
      html: '<div style="text-align:center">'
        + '<div class="gift-badge">3 MONTHS FREE</div>'
        + '<p style="margin:16px 0 8px;color:var(--ink-80);font-size:1.05rem">Your <strong>recycling pickup is on us</strong> for the next 3 months, a <strong>$24 value</strong>, credited to your bills automatically.</p>'
        + '<p style="color:var(--ink-60);font-size:.92rem">No catch and no contract. Stay with us and keep trash day handled.</p></div>',
      confirmLabel: "Claim my 3 months free",
      hideCancel: true,
      onConfirm: function () { track("cancel_offer_accepted"); callManage("recycling_offer", null, "Enjoy! 3 months of free recycling is on your account."); },
      secondaryLabel: "No thanks, cancel anyway",
      secondaryDanger: true,
      onSecondary: function () { track("cancel_confirmed"); callManage("cancel", null, "Your plan will cancel at the end of the period."); }
    });
    fireConfetti();
  }

  function fireConfetti() {
    try {
      var c = document.createElement("canvas");
      c.style.cssText = "position:fixed;inset:0;width:100%;height:100%;pointer-events:none;z-index:100000";
      document.body.appendChild(c);
      var ctx = c.getContext("2d");
      var W = c.width = window.innerWidth, H = c.height = window.innerHeight;
      var colors = ["#0066FF", "#22C55E", "#FFD23F", "#FF5DA2", "#7C3AED", "#FFFFFF"];
      var parts = [];
      for (var i = 0; i < 150; i++) {
        parts.push({ x: W / 2 + (Math.random() - 0.5) * 140, y: H * 0.4, vx: (Math.random() - 0.5) * 15, vy: -9 - Math.random() * 11, g: 0.28 + Math.random() * 0.12, size: 5 + Math.random() * 6, color: colors[(Math.random() * colors.length) | 0], rot: Math.random() * 6.28, vr: (Math.random() - 0.5) * 0.4 });
      }
      var start = Date.now(), DUR = 2600;
      (function frame() {
        var t = Date.now() - start;
        ctx.clearRect(0, 0, W, H);
        parts.forEach(function (p) {
          p.vy += p.g; p.x += p.vx; p.y += p.vy; p.vx *= 0.99; p.rot += p.vr;
          ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot);
          ctx.globalAlpha = Math.max(0, 1 - t / DUR); ctx.fillStyle = p.color;
          ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.6); ctx.restore();
        });
        if (t < DUR) requestAnimationFrame(frame); else c.remove();
      })();
    } catch (e) {}
  }

  /* ---- Manage add-ons ---- */
  var ADDON_CENTS = { trash2: 800, recycling: 800, yard: 800, cleaning: 2500 };
  function refreshAddonTotal() {
    var total = 3500;
    $all("[data-addon]").forEach(function (cb) { if (cb.checked) total += ADDON_CENTS[cb.getAttribute("data-addon")] || 0; });
    var t = $("[data-addon-total]"); if (t) t.textContent = money(total);
    var s = CURRENT.sub || {};
    var cur = { trash2: !!s.addon_second_trash, recycling: !!s.addon_recycling, yard: !!s.addon_yard_waste, cleaning: !!s.addon_cleaning };
    var changed = false;
    $all("[data-addon]").forEach(function (cb) { if (cb.checked !== cur[cb.getAttribute("data-addon")]) changed = true; });
    var sv = $("[data-addon-save]"); if (sv) sv.disabled = !changed;
  }
  function setAddonControls(sub) {
    var s = sub || {};
    var map = { trash2: !!s.addon_second_trash, recycling: !!s.addon_recycling, yard: !!s.addon_yard_waste, cleaning: !!s.addon_cleaning };
    $all("[data-addon]").forEach(function (cb) { cb.checked = !!map[cb.getAttribute("data-addon")]; });
    refreshAddonTotal();
  }
  document.addEventListener("change", function (e) { if (e.target && e.target.matches && e.target.matches("[data-addon]")) refreshAddonTotal(); });

  /* ---- Manage cans modal (add/remove cans + locations together) ---- */
  function escAttr(v) { return v == null ? "" : String(v).replace(/"/g, "&quot;"); }
  function cansTotal() { var total = 3500; if (CURRENT.sub && CURRENT.sub.addon_cleaning) total += 2500; $all("[data-can]").forEach(function (cb) { if (cb.checked) total += 800; }); return total; }
  function refreshCansTotal() { var t = $("[data-cans-total]"); if (t) t.textContent = money(cansTotal()); }
  function openCansModal() {
    var s = CURRENT.sub || {}, a = CURRENT.addr || {};
    function loc(key, val, on) { return '<input class="cans-loc" data-canloc="' + key + '" placeholder="Where this can lives (optional)" value="' + escAttr(val) + '"' + (on ? "" : " hidden") + ">"; }
    function row(key, label, on, val) {
      return '<label class="cans-row"><input type="checkbox" data-can="' + key + '"' + (on ? " checked" : "") + '><span class="cans-row__name">' + label + '</span><strong class="cans-row__price">+$8/mo</strong></label>' + loc(key, val, on);
    }
    var html = '<p style="color:var(--ink-70);margin-bottom:14px">Add or remove cans and tell us where each one lives. Plan changes are prorated on your next bill.</p>'
      + '<div class="cans-list">'
      + '<div class="cans-row cans-row--base"><span class="cans-row__name">Trash can</span><strong class="cans-row__price">Included</strong></div>'
      + loc("trash", a.can_loc_trash, true)
      + row("trash2", "Second trash can", s.addon_second_trash, a.can_loc_trash2)
      + row("recycling", "Recycling can", s.addon_recycling, a.can_loc_recycling)
      + row("yard", "Yard-waste can", s.addon_yard_waste, a.can_loc_yard)
      + '</div>'
      + '<div class="line line--total" style="margin-top:14px"><span>New monthly total</span><strong data-cans-total>' + money(cansTotal()) + '</strong></div>';
    openModal({ title: "Manage your cans", html: html, confirmLabel: "Save cans", cancelLabel: "Cancel", onConfirm: function () { saveCans(); } });
    $all("[data-can]").forEach(function (cb) {
      cb.addEventListener("change", function () {
        var l = modalBody.querySelector('[data-canloc="' + cb.getAttribute("data-can") + '"]');
        if (l) l.hidden = !cb.checked;
        refreshCansTotal();
      });
    });
    refreshCansTotal();
  }
  function saveCans() {
    var s = CURRENT.sub || {};
    var want = { cleaning: !!s.addon_cleaning };
    $all("[data-can]").forEach(function (cb) { want[cb.getAttribute("data-can")] = cb.checked; });
    function lv(key) { var el = modalBody.querySelector('[data-canloc="' + key + '"]'); return el ? el.value.trim() : ""; }
    showToast("Saving your cans...");
    sb.auth.getUser().then(function (u) {
      var uid = u.data.user && u.data.user.id; if (!uid) { showToast("Please sign in again."); return; }
      var addrFields = { cans_split: true, can_loc_trash: lv("trash") || null, can_loc_trash2: want.trash2 ? (lv("trash2") || null) : null, can_loc_recycling: want.recycling ? (lv("recycling") || null) : null, can_loc_yard: want.yard ? (lv("yard") || null) : null };
      var aP = (CURRENT.addr && CURRENT.addr.id)
        ? sb.from("service_addresses").update(addrFields).eq("id", CURRENT.addr.id).select()
        : sb.from("service_addresses").insert(Object.assign({ profile_id: uid, is_primary: true, is_prospect: false }, addrFields)).select();
      var changed = (want.trash2 !== !!s.addon_second_trash) || (want.recycling !== !!s.addon_recycling) || (want.yard !== !!s.addon_yard_waste);
      aP.then(function () {
        if (!changed) { showToast("Your cans are saved."); loadData(); return; }
        track("addon_update", want);
        if (!CURRENT.sub || !CURRENT.sub.stripe_subscription_id) {
          showToast("Starting secure checkout...");
          callFn("create-checkout-session", { addons: want }).then(function (r2) { if (r2.data && r2.data.url) { window.location.href = r2.data.url; } else { showToast("Could not start checkout."); loadData(); } });
          return;
        }
        callFn("manage-subscription", { action: "update_addons", addons: want }).then(function (res) {
          var d = res && res.data;
          if (res.error || !d || d.error) { showToast("Cans saved, but the plan update failed. Please try again."); loadData(); return; }
          showToast("Cans updated. Plan changes are prorated on your next bill.");
          loadData();
        });
      });
    });
  }

  var ACCT_DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
  function acctFieldsHTML() {
    var p = CURRENT.profile || {}, a = CURRENT.addr || {}, s = CURRENT.sub || {};
    function f(label, key, val, ph) {
      return '<label class="acct-field"><span>' + label + '</span><input data-ef="' + key + '" value="' + (val == null ? "" : String(val).replace(/"/g, "&quot;")) + '" placeholder="' + (ph || "") + '"></label>';
    }
    function fday(label, key, val) {
      var opts = ACCT_DAYS.map(function (d) { return '<option' + (d === val ? " selected" : "") + ">" + d + "</option>"; }).join("");
      return '<label class="acct-field"><span>' + label + '</span><select data-ef="' + key + '">' + opts + '</select></label>';
    }
    function frecycle(val) {
      var cur = curWeekLetter(), isThis = (val || cur) === cur;
      return '<label class="acct-field"><span>Recycling week (every other week)</span><select data-ef="recycle_week">'
        + '<option value="this"' + (isThis ? " selected" : "") + '>This week</option>'
        + '<option value="next"' + (!isThis ? " selected" : "") + '>Next week</option></select></label>';
    }
    return '<div class="acct-edit-grid">'
      + f("Full name", "name", p.full_name, "")
      + f("Phone", "phone", p.phone, "")
      + f("Street address", "line1", a.line1, "123 Maple St")
      + f("ZIP", "zip", a.zip, "")
      + fday("Trash pickup day", "pickup_day", a.pickup_day)
      + (s.addon_recycling ? frecycle(a.collection_week) : "")
      + f("Where the cans live (default)", "can_return_location", a.can_return_location, "Left side, behind the gate")
      + '<label class="acct-field" style="grid-column:1 / -1;flex-direction:row;align-items:center;gap:8px"><input type="checkbox" data-ef-split style="width:auto"' + (a.cans_split ? " checked" : "") + ' /> <span>My cans are kept in different spots</span></label>'
      + '<div data-ef-split-fields style="grid-column:1 / -1;display:' + (a.cans_split ? "grid" : "none") + ';gap:14px">'
      + f("Trash can location", "can_loc_trash", a.can_loc_trash, "")
      + (s.addon_second_trash ? f("Second trash can location", "can_loc_trash2", a.can_loc_trash2, "") : "")
      + (s.addon_recycling ? f("Recycling can location", "can_loc_recycling", a.can_loc_recycling, "") : "")
      + (s.addon_yard_waste ? f("Yard-waste can location", "can_loc_yard", a.can_loc_yard, "") : "")
      + '</div>'
      + f("Gate / community code", "gate_code", a.gate_code, "optional")
      + f("Garage code", "garage_code", a.garage_code, "optional")
      + f("Anything else for the crew", "access_notes", a.access_notes, "optional")
      + '</div>';
  }
  function acctToggle(editing) {
    var v = $("[data-acct-view]"), e = $("[data-acct-edit]");
    var eb = $("[data-acct-editbtn]"), cb = $("[data-acct-cancelbtn]"), sv = $("[data-acct-savebtn]");
    if (v) v.hidden = editing;
    if (e) e.hidden = !editing;
    if (eb) eb.hidden = editing;
    if (cb) cb.hidden = !editing;
    if (sv) sv.hidden = !editing;
  }
  function acctSave() {
    var root = $("[data-acct-edit]"); if (!root) return;
    var g = function (k) { var el = root.querySelector('[data-ef="' + k + '"]'); return el ? el.value.trim() : ""; };
    var a = CURRENT.addr || {};
    var oldDay = a.pickup_day || "", newDay = g("pickup_day");
    showToast("Saving...");
    sb.auth.getUser().then(function (u) {
      var uid = u.data.user && u.data.user.id; if (!uid) { showToast("Please sign in again."); return; }
      var splitEl = root.querySelector("[data-ef-split]");
    var addrFields = { line1: g("line1"), zip: g("zip"), pickup_day: newDay, can_return_location: g("can_return_location"), cans_split: !!(splitEl && splitEl.checked), can_loc_trash: g("can_loc_trash") || null, can_loc_trash2: g("can_loc_trash2") || null, can_loc_recycling: g("can_loc_recycling") || null, can_loc_yard: g("can_loc_yard") || null, gate_code: g("gate_code"), garage_code: g("garage_code"), access_notes: g("access_notes") };
      var recSel = root.querySelector('[data-ef="recycle_week"]');
      if (recSel) { var cw = curWeekLetter(); addrFields.collection_week = recSel.value === "this" ? cw : (cw === "A" ? "B" : "A"); }
      var aP = (CURRENT.addr && CURRENT.addr.id)
        ? sb.from("service_addresses").update(addrFields).eq("id", CURRENT.addr.id).select()
        : sb.from("service_addresses").insert(Object.assign({ profile_id: uid, is_primary: true, is_prospect: false }, addrFields)).select();
      Promise.all([
        sb.from("profiles").update({ full_name: g("name"), phone: g("phone") }).eq("id", uid).select(),
        aP
      ]).then(function (r) {
        var err = (r[0] && r[0].error) || (r[1] && r[1].error);
        if (err) { showToast("Could not save: " + (err.message || "please try again.")); return; }
        acctToggle(false);
        if (newDay && newDay !== oldDay) {
          sb.rpc("regenerate_my_pickups").then(function () { showToast("Saved. Your schedule was updated."); loadData(); });
        } else { showToast("Saved."); loadData(); }
      });
    });
  }

  var ACTIONS = {
    payment: function () {
      track("payment_opened");
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
      track("cancel_click");
      openModal({
        title: "Cancel your subscription?",
        html: '<p style="color:var(--ink-70)">You are about to cancel your <strong>' + planLabel() + '</strong> plan'
          + (CURRENT.sub && CURRENT.sub.monthly_total_cents ? ' (' + money(CURRENT.sub.monthly_total_cents) + '/month)' : '') + '.'
          + ' Your service stays active through the period you have already paid for, then stops. No contract, no cancellation fee.</p>',
        confirmLabel: "Continue to cancel",
        danger: true,
        cancelLabel: "Keep my plan",
        onConfirm: function () { setTimeout(showRetentionOffer, 0); }
      });
    },
    "save-addons": function () {
      var want = {};
      $all("[data-addon]").forEach(function (cb) { want[cb.getAttribute("data-addon")] = cb.checked; });
      var sv = $("[data-addon-save]"); if (sv) sv.disabled = true;
      // No live subscription yet: send them to checkout with these add-ons selected.
      if (!CURRENT.sub || !CURRENT.sub.stripe_subscription_id) {
        showToast("Starting secure checkout...");
        callFn("create-checkout-session", { addons: want }).then(function (r2) {
          if (r2.data && r2.data.url) { window.location.href = r2.data.url; } else { showToast("Could not start checkout. Try again."); if (sv) sv.disabled = false; }
        });
        return;
      }
      showToast("Updating your plan...");
      callFn("manage-subscription", { action: "update_addons", addons: want }).then(function (res) {
        var d = res && res.data;
        if (res.error || !d || d.error) { showToast("Could not update your plan. Please try again."); if (sv) sv.disabled = false; return; }
        track("addon_update", want);
        showToast("Plan updated. Changes are prorated on your next bill.");
        loadData();
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
          track("pause"); callManage("pause", { resume_date: rd }, "Service paused. We resume on " + fmtDate(rd) + ".");
        }
      });
    },
    resume: function () { track("resume"); callManage("resume", null, "Welcome back. Service resumed."); },
    hold: function () {
      openModal({
        title: "Put your membership on hold?",
        html: '<p style="margin-bottom:10px;color:var(--ink-70)">This stops your billing right away, we will not charge you again until you choose to resume. Your pickups pause with no end date, so it is perfect if you are not sure when you will be back.</p><p style="color:var(--ink-70)">You can resume anytime from this page.</p>',
        confirmLabel: "Hold my membership",
        onConfirm: function () { track("hold"); callManage("hold", null, "Your membership is on hold. Billing is stopped until you resume."); }
      });
    },
    receipt: function () { ACTIONS.payment(); },
    edit: function () { openCansModal(); },
    "account-edit": function () {
      var e = $("[data-acct-edit]"); if (e) e.innerHTML = acctFieldsHTML();
      var sp = e && e.querySelector("[data-ef-split]"), spf = e && e.querySelector("[data-ef-split-fields]");
      if (sp && spf) sp.addEventListener("change", function () { spf.style.display = sp.checked ? "grid" : "none"; });
      acctToggle(true);
    },
    "account-cancel": function () { acctToggle(false); },
    "account-save": function () { acctSave(); },
    support: function () { if (window.openSupport) { window.openSupport(); } },
    "copy-refer": function () {
      var el = $('[data-bind="refer_link"]');
      var link = CURRENT.refer_link || (el && el.value) || "";
      if (!link || link.indexOf("http") !== 0) { showToast("Your link is still loading, try again in a second."); return; }
      function done() { showToast("Referral link copied. Send it to a friend!"); }
      function fallback() { if (el) { el.focus(); el.select(); try { document.execCommand("copy"); done(); } catch (e) { showToast("Copy your link: " + link); } } }
      try {
        if (navigator.clipboard && navigator.clipboard.writeText) { navigator.clipboard.writeText(link).then(done, fallback); }
        else fallback();
      } catch (e) { fallback(); }
    }
  };
  document.addEventListener("click", function (e) {
    var a = e.target.closest("[data-action]"); if (!a) return;
    var fn = ACTIONS[a.getAttribute("data-action")]; if (fn) fn();
  });
})();
