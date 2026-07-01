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
  // Greater Austin + Georgetown / Williamson County (soft list; never blocks signup)
  var SERVED_ZIPS = ["78701","78702","78703","78704","78705","78717","78719","78721","78722","78723","78724","78725","78726","78727","78728","78729","78730","78731","78732","78733","78734","78735","78736","78737","78738","78739","78741","78742","78744","78745","78746","78747","78748","78749","78750","78751","78752","78753","78754","78756","78757","78758","78759","78660","78664","78665","78681","78613","78626","78628","78633","78634"];

  function $(s, c) { return (c || document).querySelector(s); }
  function $all(s, c) { return Array.prototype.slice.call((c || document).querySelectorAll(s)); }

  var SESSION_ID = (function () { try { var k = "cc_sess", s = sessionStorage.getItem(k); if (!s) { s = Math.random().toString(36).slice(2) + Date.now().toString(36); sessionStorage.setItem(k, s); } return s; } catch (e) { return null; } })();
  function track(event, props) { try { sb.from("analytics_events").insert({ event: event, session_id: SESSION_ID, page: "signup", props: props || null, user_agent: navigator.userAgent }).then(function () {}, function () {}); } catch (e) {} }

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
  var ADDON = { trash2: 800, recycling: 800, yard: 800, cleaning: 2500 };
  var PROMO = "";
  var REF = "";

  function val(name) { var el = form.querySelector('[name="' + name + '"]'); return el ? el.value.trim() : ""; }
  function checked(name) { var el = form.querySelector('[name="' + name + '"]'); return !!(el && el.checked); }
  function money(c) { return "$" + (c / 100).toFixed(0); }

  // Recycling runs every other week. Map the This/Next choice to an absolute
  // alternating-week letter (A = even week since epoch, B = odd). This anchor
  // never drifts. The OS scheduler rolls recycling on weeks whose parity matches.
  function recycleWeekLetter() {
    var sel = form.querySelector('[name="recycle_week"]:checked');
    if (!sel) return null;
    var parity = Math.floor(Date.now() / (7 * 86400000)) % 2; // 0 even, 1 odd (this week)
    var thisLetter = parity === 0 ? "A" : "B";
    return sel.value === "this" ? thisLetter : (thisLetter === "A" ? "B" : "A");
  }

  function totalCents() {
    var t = BASE;
    $all("[data-addon]").forEach(function (a) { if (a.checked) t += ADDON[a.getAttribute("data-key")] || 0; });
    return t;
  }
  function refreshTotal() {
    if (totalEl) totalEl.innerHTML = money(totalCents()) + "<small>/mo</small>";
  }
  $all("[data-addon]").forEach(function (a) { a.addEventListener("change", refreshTotal); });

  // Auto-fill trash day + recycling week from the City of Austin schedule dataset.
  var SCHED = { collection_week: null, schedule_source: null };
  function runScheduleLookup() {
    var addr = val("address"), zip = val("zip");
    if (!addr || !/^\s*\d/.test(addr)) return;
    sb.functions.invoke("lookup-austin-schedule", { body: { address: addr, zip: zip } }).then(function (res) {
      var d = res && res.data;
      if (d && d.matched) {
        SCHED.collection_week = d.collection_week || null;
        SCHED.schedule_source = "austin_dataset";
        var daySel = form.querySelector('[name="pickup_day"]');
        if (daySel && d.collection_day) daySel.value = d.collection_day;
        if (d.zip) { var zEl = form.querySelector('[name="zip"]'); if (zEl && !zEl.value) zEl.value = d.zip; }
        if (coverageEl) {
          coverageEl.hidden = false;
          coverageEl.className = "coverage-note is-ok";
          coverageEl.innerHTML = "Found your City of Austin schedule: trash on <strong>" + d.collection_day + "</strong>" +
            (d.collection_week ? ", recycling on <strong>week " + d.collection_week + "</strong>" : "") +
            ". We set your pickup day, adjust below if needed.";
        }
      } else {
        SCHED.collection_week = null;
        SCHED.schedule_source = "self_reported";
      }
    }).catch(function () {});
  }
  (function () {
    var a = form.querySelector('[name="address"]'); if (a) a.addEventListener("blur", runScheduleLookup);
    var z = form.querySelector('[name="zip"]'); if (z) z.addEventListener("blur", runScheduleLookup);
  })();

  // Phone auto-format: digits -> (xxx) xxx-xxxx
  (function () {
    var pe = form.querySelector('[name="phone"]');
    if (!pe) return;
    pe.addEventListener("input", function () {
      var d = (pe.value || "").replace(/\D/g, "").slice(0, 10);
      if (d.length < 4) pe.value = d;
      else if (d.length < 7) pe.value = "(" + d.slice(0, 3) + ") " + d.slice(3);
      else pe.value = "(" + d.slice(0, 3) + ") " + d.slice(3, 6) + "-" + d.slice(6);
    });
  })();

  // Per-can locations: only show boxes for cans on the plan; update as add-ons change.
  (function () {
    var sp = form.querySelector("[data-cans-split]");
    var spf = form.querySelector("[data-cans-split-fields]");
    function syncCanFields() {
      var t2 = form.querySelector('[data-canfield="trash2"]'); if (t2) t2.hidden = !checked("trash2");
      var rf = form.querySelector('[data-canfield="recycling"]'); if (rf) rf.hidden = !checked("recycling");
      var yf = form.querySelector('[data-canfield="yard"]'); if (yf) yf.hidden = !checked("yard");
      var rw = form.querySelector("[data-recycle-week-wrap]"); if (rw) rw.hidden = !checked("recycling");
    }
    if (sp && spf) sp.addEventListener("change", function () { spf.style.display = sp.checked ? "block" : "none"; syncCanFields(); });
    $all("[data-addon]").forEach(function (a) { a.addEventListener("change", syncCanFields); });
    syncCanFields();
  })();

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
      return "";
    }
    if (n === 2) {
      if (!val("first_name") || !val("last_name")) return "Enter your first and last name.";
      if (val("email").indexOf("@") === -1) return "Enter a valid email.";
      if (val("password").length < 8) return "Password must be at least 8 characters.";
      return "";
    }
    return "";
  }

  function buildReview() {
    var addons = [];
    if (checked("trash2")) addons.push("2nd trash can +$8");
    if (checked("recycling")) addons.push("Recycling +$8");
    if (checked("yard")) addons.push("Yard-waste +$8");
    if (checked("cleaning")) addons.push("Cleaning +$25");
    var rows = [
      ["Address", val("address")],
      ["Pickup day", val("pickup_day")],
      ["Name", (val("first_name") + " " + val("last_name")).trim()],
      ["Email", val("email")],
      ["Plan", "Curb Crews Plan"],
      ["Add-ons", addons.length ? addons.join(", ") : "None"],
      ["Total", money(totalCents()) + " / month"]
    ];
    reviewEl.innerHTML = rows.map(function (r) {
      return '<li><span class="review__k">' + r[0] + '</span><span class="review__v">' + (r[1] || "&mdash;") + "</span></li>";
    }).join("");
  }

  function checkServed(zip) {
    return sb.from("served_zips").select("zip").eq("zip", zip).eq("active", true).limit(1).maybeSingle()
      .then(function (r) { return !!(r && r.data); }).catch(function () { return false; });
  }
  function recordWaitlist(source, extra) {
    var row = { zip: val("zip") || null, address: val("address") || null, source: source };
    if (extra) Object.keys(extra).forEach(function (k) { row[k] = extra[k]; });
    return sb.from("waitlist").insert(row);
  }
  function showWaitlist() {
    if (form) form.style.display = "none";
    var steps = $("[data-steps]"); if (steps) steps.style.display = "none";
    var wl = $("[data-waitlist]"); if (wl) wl.hidden = false;
    var zEl = $("[data-waitlist-zip]"); if (zEl) zEl.textContent = val("zip") || "your area";
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
  function hideWaitlist() {
    var wl = $("[data-waitlist]"); if (wl) wl.hidden = true;
    var steps = $("[data-steps]"); if (steps) steps.style.display = "";
    if (form) form.style.display = "";
    showStep(1);
  }

  nextBtn.addEventListener("click", function () {
    var err = validateStep(step);
    if (err) { setMsg(err, "error"); return; }
    if (step === 1) {
      nextBtn.disabled = true; setMsg("Checking your area...");
      checkServed(val("zip")).then(function (served) {
        nextBtn.disabled = false; setMsg("");
        if (served) { track("signup_zip_served", { zip: val("zip") }); showStep(2); }
        else { track("signup_zip_blocked", { zip: val("zip") }); recordWaitlist("coverage_block"); showWaitlist(); }
      });
      return;
    }
    if (step < MAX) { showStep(step + 1); return; }
    submit();
  });
  backBtn.addEventListener("click", function () { if (step > 1) showStep(step - 1); });

  var wlBtn = $("[data-waitlist-submit]");
  if (wlBtn) wlBtn.addEventListener("click", function () {
    var emEl = $("[data-waitlist-email]"); var em = (emEl && emEl.value || "").trim();
    var msgEl = $("[data-waitlist-msg]");
    if (em.indexOf("@") === -1) { if (msgEl) { msgEl.textContent = "Enter a valid email."; msgEl.className = "join__msg is-error"; } return; }
    wlBtn.disabled = true;
    track("waitlist_join", { zip: val("zip") });
    recordWaitlist("waitlist_email", { email: em }).then(function () {
      var wl = $("[data-waitlist]");
      if (wl) wl.innerHTML = '<div style="text-align:center;padding:10px 0"><h2 class="join__h2">You are on the list</h2><p class="step-sub">We will email you the moment Curb Crews reaches your area. Thanks for your interest.</p></div>';
    });
  });
  document.addEventListener("click", function (e) {
    var b = e.target.closest("[data-waitlist-back]"); if (!b) return;
    e.preventDefault(); hideWaitlist();
  });

  function submit() {
    nextBtn.disabled = true;
    setMsg("Creating your account...");

    var email = val("email"), password = val("password"), name = (val("first_name") + " " + val("last_name")).trim();

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
          addon_cleaning: checked("cleaning"), addon_second_trash: checked("trash2"), source: "onboarding", user_agent: navigator.userAgent
        };

        Promise.all([
          sb.from("profiles").update({ full_name: name, phone: val("phone") }).eq("id", uid),
          sb.from("service_addresses").insert({
            profile_id: uid, line1: val("address"), zip: val("zip"),
            can_return_location: val("can_return"), pickup_day: val("pickup_day"),
            cans_split: !!((form.querySelector("[data-cans-split]") || {}).checked),
            can_loc_trash: val("can_loc_trash") || null, can_loc_trash2: val("can_loc_trash2") || null, can_loc_recycling: val("can_loc_recycling") || null, can_loc_yard: val("can_loc_yard") || null,
            gate_code: val("gate_code"), garage_code: val("garage_code"), access_notes: val("access_notes"),
            collection_week: (checked("recycling") && recycleWeekLetter()) || SCHED.collection_week,
            schedule_source: SCHED.schedule_source || "self_reported",
            is_primary: true, is_prospect: false
          }),
          sb.from("leads").insert(leadRow)
        ]).then(function () {
          setMsg("Account created. Opening secure checkout...", "success");
          sb.functions.invoke("create-checkout-session", {
            body: { addons: { trash2: checked("trash2"), recycling: checked("recycling"), yard: checked("yard"), cleaning: checked("cleaning") }, promo: PROMO, ref: REF }
          }).then(function (res) {
            if (res.error || !res.data || !res.data.url) {
              nextBtn.disabled = false;
              return setMsg("Your account is created, but checkout could not start. Sign in to add payment.", "error");
            }
            track("checkout_start", { recycling: checked("recycling"), yard: checked("yard"), cleaning: checked("cleaning") });
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
      runScheduleLookup();
    }
    var qZip = qp.get("zip");
    if (qZip) { var zEl2 = form.querySelector('[name="zip"]'); if (zEl2 && !zEl2.value) zEl2.value = qZip; }
    var qName = qp.get("name");
    if (qName) {
      var parts = qName.trim().split(/\s+/);
      var fnEl = form.querySelector('[name="first_name"]'); if (fnEl) fnEl.value = parts.shift() || "";
      var lnEl = form.querySelector('[name="last_name"]'); if (lnEl) lnEl.value = parts.join(" ");
    }
    var qEmail = qp.get("email");
    if (qEmail) { var emEl = form.querySelector('[name="email"]'); if (emEl) emEl.value = qEmail; }
    PROMO = (qp.get("promo") || "").toLowerCase();
    REF = (qp.get("ref") || "").trim();
    var banner = null;
    if (REF) banner = "&#127881; <strong>A friend referred you</strong> &mdash; 50% off your first month. Finish signing up to lock it in.";
    else if (PROMO === "flyer50") banner = "&#127881; <strong>50% off your first 2 months</strong> applied. Finish signing up to lock it in.";
    if (banner) {
      var b = document.createElement("div");
      b.className = "join-promo";
      b.innerHTML = banner;
      var steps = $("[data-steps]");
      if (steps && steps.parentNode) steps.parentNode.insertBefore(b, steps);
    }
  } catch (e) {}

  showStep(1);
  refreshTotal();
  track("signup_start");
})();
