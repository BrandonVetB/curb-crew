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
        sb.from("service_addresses"