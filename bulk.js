/* ============================================================
   CURB CREW - bulk.js  (bulk / junk pickup quote)
   Quote calculator + city schedule lookup + request to Supabase.
   ============================================================ */
(function () {
  "use strict";

  var SUPABASE_URL = "https://hezahtnfyhqfucixzqxi.supabase.co";
  var SUPABASE_KEY = "sb_publishable_9l4_Bqgjg7qBapvYlLPJSA_pHOk0nMB";
  var TRIP_FEE = 2500; // cents, added once any item is selected

  function $(s, c) { return (c || document).querySelector(s); }
  function $all(s, c) { return Array.prototype.slice.call((c || document).querySelectorAll(s)); }
  function money(cents) { return "$" + Math.round(cents / 100); }

  /* ---------- quote calculator ---------- */
  var estimateEl = $("[data-estimate]");

  function currentItems() {
    return $all("[data-item]").map(function (row) {
      var qty = parseInt($("[data-qty]", row).textContent, 10) || 0;
      return {
        key: row.getAttribute("data-key"),
        label: row.getAttribute("data-label"),
        qty: qty,
        unit_cents: parseInt(row.getAttribute("data-unit"), 10)
      };
    }).filter(function (i) { return i.qty > 0; });
  }

  function recalc() {
    var items = currentItems();
    var sum = items.reduce(function (a, i) { return a + i.qty * i.unit_cents; }, 0);
    if (sum === 0) { estimateEl.textContent = "$0"; return { low: 0, high: 0, items: items }; }
    var low = sum + TRIP_FEE;
    var high = Math.round(low * 1.25);
    estimateEl.textContent = money(low) + " - " + money(high);
    return { low: low, high: high, items: items };
  }

  $all("[data-item]").forEach(function (row) {
    var qtyEl = $("[data-qty]", row);
    function set(n) {
      n = Math.max(0, n);
      qtyEl.textContent = n;
      row.classList.toggle("is-on", n > 0);
      recalc();
    }
    $("[data-inc]", row).addEventListener("click", function () { set((parseInt(qtyEl.textContent, 10) || 0) + 1); });
    $("[data-dec]", row).addEventListener("click", function () { set((parseInt(qtyEl.textContent, 10) || 0) - 1); });
  });
  recalc();

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
            ' yet. Use the quote above and we will handle it directly.</p>';
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

  /* ---------- request submit ---------- */
  var form = $("[data-bulk-form]");
  var msg = $("[data-bulk-msg]");
  function val(n) { var el = form.querySelector('[name="' + n + '"]'); return el ? el.value.trim() : ""; }

  form.addEventListener("submit", function (e) {
    e.preventDefault();
    var q = recalc();
    var name = val("name"), email = val("email"), address = val("address");
    if (q.items.length === 0) { msg.textContent = "Add at least one item above to get a quote."; msg.className = "bulk__msg is-error"; return; }
    if (!name || !email || email.indexOf("@") === -1 || !address) { msg.textContent = "Add your name, a valid email, and the pickup address."; msg.className = "bulk__msg is-error"; return; }

    msg.textContent = "Sending your request..."; msg.className = "bulk__msg";
    fetch(SUPABASE_URL + "/rest/v1/bulk_requests", {
      method: "POST",
      headers: { "apikey": SUPABASE_KEY, "Authorization": "Bearer " + SUPABASE_KEY, "Content-Type": "application/json", "Prefer": "return=minimal" },
      body: JSON.stringify({
        name: name, email: email, phone: val("phone"), address: address,
        zip: (address.match(/\b\d{5}\b/) || [null])[0],
        items: q.items, estimate_low_cents: q.low, estimate_high_cents: q.high,
        preferred_date: val("preferred_date") || null, notes: val("notes"), source: "bulk_page"
      })
    }).then(function (res) {
      if (!res.ok) throw new Error("failed");
      form.innerHTML = '<div class="bulk__done"><div class="check"><svg viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg></div>' +
        "<h2>Request received!</h2><p>We'll confirm your price (" + money(q.low) + " - " + money(q.high) +
        ") and a time by email.</p>" + '<p class="bulk__fine" style="margin-top:16px"><a href="index.html">Back to the site</a></p></div>';
    }).catch(function () { msg.textContent = "Something went wrong. Please try again."; msg.className = "bulk__msg is-error"; });
  });
})();
