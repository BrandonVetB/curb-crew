/* ============================================================
   CURB CREWS - join.js  (multi-step onboarding wizard)
   Address -> Details/Account -> Plan -> Confirm -> Dashboard
   ============================================================ */
(function () {
  "use strict";

  var SUPABASE_URL = "https://hezahtnfyhqfucixzqxi.supabase.co";
  var SUPABASE_KEY = "sb_publishable_9l4_Bqgjg7qBapvYlLPJSA_pHOk0nMB";
  var sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

  // Soft coverage list (placeholder until a real coverage table exists).
  var SERVED_ZIPS = ["78732", "78730", "78726", "78734", "78738"];

  function $(s, c) { return (c || document).querySelector(s); }
  function $all(s, c) { return Array.prototype.slice.call((c || document).querySelectorAll(s)); }

  var form = $("[data-onboard]");
  var nextBtn = $("[data-next]");
  var backBtn = $("[data-back]");
  var msg = $("[data-msg]");
  var totalEl = $("[data-total]");
  var coverageEl = $("[data-coverage]");
  var reviewEl = $("[data-review]");

  var step = 1;
  var MAX = 4;
  var BASE = 3500;
  var ADDON = { recycling: 800, yard: 800, cleaning: 2500 };

  function val(name) { var el = form.querySelector('[name="' + name + '"]'); return el ? el.value.trim() : ""; }
  function checked(name) { var el = form.querySelector('[name="' + name + '"]'); return !!(el && el.checked); }
  function money(c) { return "$" + (c / 100).toFixed(0); }

  function totalCents() {
    var t = BASE;
    $all("[data-addon]").forEach(function (a) { if (a.checked) t += ADDON[a.getAttribute("data-key")] || 0; });
    return t;
  }
  function refreshTotal() {
    if (totalEl) totalEl.innerHTML = money(totalCents()) + "<small>/mo</small>";
  }
  $all("[data-addon]").forEach(function (a) { a.addEventListener("change", refreshTotal); });

  function setMsg(t, kind) { msg.textContent = t || ""; msg.className = "join__msg" + (kind ? " is-" + kind : ""); }

  function showStep(n) {
    step = n;
    $all("[data-step]").forEach(function (s) { s.hidden = s.getAttribute("data-step") !== String(n); });
    $all("[data-step-dot]").forEach(function (d) {
      var i = Number(d.getAttribute("data-step-dot"));
      d.classList.toggle("is-active", i === n);
      d.classList.toggle("is-done", i < n);
    });
    backBtn.hidden = n === 1;
    nextBtn.textContent = n === MAX ? "Create my account" : "Continue";
    if (n === MAX) buildReview();
    setMsg("");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function validateStep(n) {
    if (n === 1) {
      if (!val("address")) return "Enter your street address.";
      if (!/^\d{5}$/.test(val("zip"))) return "Enter a valid 5-digit ZIP.";
      if (!val("pickup_day")) return "Pick your trash pickup day.";
      // soft coverage note (never blocks)
      coverageEl.hidden = false;
      if (SERVED_ZIPS.indexOf(val("zip")) === -1) {
        coverageEl.className = "coverage-note is-wait";
        coverageEl.textContent = "We are not on your street yet, but you can still sign up and we will prioritize your area.";
      } else {
        coverageEl.className = "coverage-note is-ok";
        coverageEl.textContent = "Good news, we service your area.";
      }
      return "";
    }
    if (n === 2) {
      if (!val("name")) return "Enter your name.";
      if (val("email").indexOf("@") === -1) return "Enter a valid email.";
      if (val("password").length < 8) return "Password must be at least 8 characters.";
      return "";
    }
    return "";
  }

  function buildReview() {
    var addons = [];
    if (checked("recycling")) addons.push("Recycling +$8");
    if (checked("yard")) addons.push("Yard-waste +$8");
    if (checked("cleaning")) addons.push("Cleaning +$25");
    var rows = [
      ["Address", val("address")],
      ["Pickup day", val("pickup_day")],
      ["Name", val("name")],
      ["Email", val("email")],
      ["Plan", "Curb Crews Plan"],
      ["Add-ons", addons.length ? addons.join(", ") : "None"],
      ["Total", money(totalCents()) + " / month"]
    ];
    reviewEl.innerHTML = rows.map(function (r) {
      return '<li><span class="review__k">' + r[0] + '</span><span class="review__v">' + (r[1] || "&mdash;") + "</span></li>";
    }).join("");
  }

  nextBtn.addEventListener("click", function () {
    var err = validateStep(step);
    if (err) { setMsg(err, "error"); return; }
    if (step < MAX) { showStep(step + 1); return; }
    submit();
  });
  backBtn.addEventListener("click", function () { if (step > 1) showStep(step - 1); });

  function submit() {
    nextBtn.disabled = true;
    setMsg("Creating your account...");

    var email = val("email"), password = val("password"), name = val("name");

    sb.auth.signUp({ email: email, password: password, options: { data: { full_name: name } } })
      .then(function (r) {
        if (r.error) {
          nextBtn.disabled = false;
          if (/registered|already/i.test(r.error.message)) return setMsg("That email already has an account. Sign in instead.", "error");
          return setMsg(r.error.message, "error");
        }
        var uid = r.data.user && r.data.user.id;
        if (!uid) { nextBtn.disabled = false; return setMsg("Could not start your account. Try again.", "error"); }

        // Update profile (name, phone) and save the address. Capture plan choice as a lead record.
        var planLabel = "Curb Crews Plan";
        var leadRow = {
          name: name, email: email, phone: val("phone"), address: val("address"), zip: val("zip"),
          plan: planLabel, addon_recycling: checked("recycling"), addon_yard_waste: checked("yard"),
          addon_cleaning: checked("cleaning"), source: "onboarding", user_agent: navigator.userAgent
        };

        Promise.all([
          sb.from("profiles").update({ full_name: name, phone: val("phone") }).eq("id", uid),
          sb.from("service_addresses").insert({
            profile_id: uid, line1: val("address"), zip: val("zip"),
            can_return_location: val("can_return"), pickup_day: val("pickup_day"),
            gate_code: val("gate_code"), garage_code: val("garage_code"), access_notes: val("access_notes"),
            is_primary: true, is_prospect: false
          }),
          sb.from("leads").insert(leadRow)
        ]).then(function () {
          setMsg("Account created. Opening secure checkout...", "success");
          sb.functions.invoke("create-checkout-session", {
            body: { addons: { recycling: checked("recycling"), yard: checked("yard"), cleaning: checked("cleaning") } }
          }).then(function (res) {
            if (res.error || !res.data || !res.data.url) {
              nextBtn.disabled = false;
              return setMsg("Your account is created, but checkout could not start. Sign in to add payment.", "error");
            }
            window.location.href = res.data.url;
          });
        });
      });
  }

  // Prefill address/zip when funneled from the homepage (?address=...)
  try {
    var qp = new URLSearchParams(location.search);
    var qAddr = qp.get("address");
    if (qAddr) {
      var aEl = form.querySelector('[name="address"]'); if (aEl) aEl.value = qAddr;
      var z = (qAddr.match(/\b\d{5}\b/) || [])[0];
      if (z) { var zEl = form.querySelector('[name="zip"]'); if (zEl) zEl.value = z; }
    }
  } catch (e) {}

  showStep(1);
  refreshTotal();
})();
