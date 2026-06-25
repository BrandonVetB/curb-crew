/* ============================================================
   CURB CREW - bulk.js  (bulk / junk pickup)
   Contact-for-quote request + city schedule lookup.
   ============================================================ */
(function () {
  "use strict";

  var SUPABASE_URL = "https://hezahtnfyhqfucixzqxi.supabase.co";
  var SUPABASE_KEY = "sb_publishable_9l4_Bqgjg7qBapvYlLPJSA_pHOk0nMB";

  function $(s, c) { return (c || document).querySelector(s); }
  function $all(s, c) { return Array.prototype.slice.call((c || document).querySelectorAll(s)); }

  /* ---------- city schedule lookup ---------- */
  var zipInput = $("[data-city-zip]");
  var resultEl = $("[data-city-result]");

  function fmtDate(d) {
    if (!d) return "TBD";
    var dt = new Date(d + "T00:00:00");
    return dt.toLocaleDateString("en-US", { weekday: "short", month: "long", day: "numeric", year: "numeric" });
  }

  function checkCity() {
    var zip = (zipInput.value.match(/\d{5}/) || [""])[0];
    if (!zip) { resultEl.innerHTML = '<p class="city-result__empty">Enter a 5-digit ZIP.</p>'; return; }
    resultEl.innerHTML = '<p class="city-result__empty">Checking...</p>';
    var url = SUPABASE_URL + "/rest/v1/city_bulk_schedules?select=city,service,next_date,frequency,notes,source_url&zips=cs." +
      encodeURIComponent("{" + zip + "}") + "&order=next_date.asc";
    fetch(url, { headers: { "apikey": SUPABASE_KEY, "Authorization": "Bearer " + SUPABASE_KEY } })
      .then(function (r) { return r.json(); })
      .then(function (rows) {
        if (!rows || !rows.length) {
          resultEl.innerHTML = '<p class="city-result__empty">We do not have a schedule for ' + zip +
            ' yet. Contact us above and we will handle it directly.</p>';
          return;
        }
        resultEl.innerHTML = rows.map(function (r) {
          return '<div class="city-result__row">' +
            '<div class="svc">' + r.service + " &middot; " + (r.city || "") + '</div>' +
            '<div class="date">Next: ' + fmtDate(r.next_date) + "</div>" +
            '<div class="meta">' + (r.frequency || "") + (r.notes ? " &middot; " + r.notes : "") + "</div>" +
            (r.source_url ? '<a href="' + r.source_url + '" target="_blank" rel="noopener">City details &rarr;</a>' : "") +
            "</div>";
        }).join("");
      })
      .catch(function () { resultEl.innerHTML = '<p class="city-result__empty">Could not check right now. Try again.</p>'; });
  }
  if ($("[data-city-check]")) $("[data-city-check]").addEventListener("click", checkCity);
  if (zipInput) zipInput.addEventListener("keydown", function (e) { if (e.key === "Enter") { e.preventDefault(); checkCity(); } });

  /* ---------- quote request ---------- */
  var form = $("[data-bulk-form]");
  var msg = $("[data-bulk-msg]");
  function val(n) { var el = form.querySelector('[name="' + n + '"]'); return el ? el.value.trim() : ""; }

  form.addEventListener("submit", function (e) {
    e.preventDefault();
    var name = val("name"), email = val("email"), address = val("address"), notes = val("notes");
    if (!name || !email || email.indexOf("@") === -1) {
      msg.textContent = "Add your name and a valid email so we can reply with a quote.";
      msg.className = "bulk__msg is-error"; return;
    }

    msg.textContent = "Sending your request..."; msg.className = "bulk__msg";
    fetch(SUPABASE_URL + "/rest/v1/bulk_requests", {
      method: "POST",
      headers: { "apikey": SUPABASE_KEY, "Authorization": "Bearer " + SUPABASE_KEY, "Content-Type": "application/json", "Prefer": "return=minimal" },
      body: JSON.stringify({
        name: name, email: email, phone: val("phone"), address: address,
        zip: (address.match(/\b\d{5}\b/) || [null])[0],
        notes: notes, preferred_date: val("preferred_date") || null, source: "bulk_page"
      })
    }).then(function (res) {
      if (!res.ok) throw new Error("failed");
      form.innerHTML = '<div class="bulk__done"><div class="check"><svg viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg></div>' +
        "<h2>Got it!</h2><p>We'll review what you need and email you a quote and a time shortly.</p>" +
        '<p class="bulk__fine" style="margin-top:16px"><a href="index.html">Back to the site</a></p></div>';
    }).catch(function () { msg.textContent = "Something went wrong. Please email hello@curbcrew.com."; msg.className = "bulk__msg is-error"; });
  });
})();
