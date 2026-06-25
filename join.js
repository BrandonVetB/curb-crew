/* ============================================================
   CURB CREW - join.js  (QR signup landing page)
   Plan total calc + capture signup to Supabase.
   ============================================================ */
(function () {
  "use strict";

  var SUPABASE_URL = "https://hezahtnfyhqfucixzqxi.supabase.co";
  var SUPABASE_KEY = "sb_publishable_9l4_Bqgjg7qBapvYlLPJSA_pHOk0nMB";
  var BASE = 35;

  function $(s, c) { return (c || document).querySelector(s); }
  function $all(s, c) { return Array.prototype.slice.call((c || document).querySelectorAll(s)); }

  var form = $("[data-join-form]");
  if (!form) return;
  var totalEl = $("[data-total]");
  var msg = $("[data-join-msg]");

  function recalc() {
    var extra = 0;
    $all("[data-addon]").forEach(function (cb) { if (cb.checked) extra += parseInt(cb.getAttribute("data-price"), 10); });
    totalEl.innerHTML = "$" + (BASE + extra) + "<small>/mo</small>";
  }
  $all("[data-addon]").forEach(function (cb) { cb.addEventListener("change", recalc); });
  recalc();

  function val(name) { var el = form.querySelector('[name="' + name + '"]'); return el ? el.value.trim() : ""; }

  form.addEventListener("submit", function (e) {
    e.preventDefault();
    var name = val("name"), email = val("email"), address = val("address"), zip = val("zip");

    if (!name || !email || email.indexOf("@") === -1 || !address) {
      msg.textContent = "Please add your name, a valid email, and your street address.";
      msg.className = "join__msg is-error";
      return;
    }

    var addons = {
      recycling: form.querySelector('[name="recycling"]').checked,
      yard: form.querySelector('[name="yard"]').checked,
      cleaning: form.querySelector('[name="cleaning"]').checked
    };
    var parsedZip = zip || (address.match(/\b\d{5}\b/) || [null])[0];

    var payload = {
      name: name,
      email: email,
      phone: val("phone"),
      address: address,
      zip: parsedZip,
      plan: "Curb Crews Plan",
      addon_recycling: addons.recycling,
      addon_yard_waste: addons.yard,
      addon_cleaning: addons.cleaning,
      raw_input: address,
      source: "qr_join",
      user_agent: navigator.userAgent
    };

    msg.textContent = "Saving your spot...";
    msg.className = "join__msg";

    fetch(SUPABASE_URL + "/rest/v1/leads", {
      method: "POST",
      headers: {
        "apikey": SUPABASE_KEY,
        "Authorization": "Bearer " + SUPABASE_KEY,
        "Content-Type": "application/json",
        "Prefer": "return=minimal"
      },
      body: JSON.stringify(payload)
    }).then(function (res) {
      if (!res.ok) throw new Error("save failed");
      showDone(name);
    }).catch(function () {
      msg.textContent = "Something went wrong. Please try again or email hello@curbcrew.example.";
      msg.className = "join__msg is-error";
    });
  });

  function showDone(name) {
    form.innerHTML =
      '<div class="join__done">' +
      '<div class="check"><svg viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg></div>' +
      '<h2>You are on the list' + (name ? ", " + name.split(" ")[0] : "") + "!</h2>" +
      "<p>We'll confirm your street and email you to finish setup. Welcome to Curb Crews.</p>" +
      '<p class="join__fine" style="margin-top:18px"><a href="index.html">Back to the site</a></p>' +
      "</div>";
  }
})();
