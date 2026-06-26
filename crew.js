/* ============================================================
   Curb Crew OS — crew.js  (mobile crew app, live Supabase)
   Today's route -> tap house -> photo-backed "rolled out" /
   "brought in" service events, with gelocation. Pay screen.
   ============================================================ */
(function () {
  "use strict";

  var SUPABASE_URL = "https://hezahtnfyhqfucixzqxi.supabase.co";
  var SUPABASE_KEY = "sb_publishable_9l4_Bqgjg7qBapvYlLPJSA_pHOk0nMB";
  var sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
  var BUCKET = "service-photos";

  function $(s, c) { return (c || document).querySelector(s); }
  function $all(s, c) { return Array.prototype.slice.call((c || document).querySelectorAll(s)); }
  function bind(k, v) { var e = $('[data-bind="' + k + '"]'); if (e) e.textContent = v; }
  function esc(s) { return (s == null ? "" : String(s)).replace(/[&<>"]/g, function (m) { return ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[m]; }); }
  function todayISO() { return new Date().toISOString().slice(0, 10); }
  function startOfToday() { var d = new Date(); d.setHours(0, 0, 0, 0); return d.getTime(); }
  function timeStr(d) { return new Date(d).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }); }

  var authView = $('[data-view="auth"]'), appView = $('[data-view="app"]');
  var me = { uid: null, email: null, role: null, name: null };
  var S = { houses: [], events: [], current: null };

  /* ============ AUTH ============ */
  var form = $("[data-auth-form]"), amsg = $("[data-auth-msg]");
  function fail(t) { amsg.className = "auth__msg is-error"; amsg.textContent = t; }
  form.addEventListener("submit", function (e) {
    e.preventDefault();
    var email = form.querySelector('[name="email"]').value.trim();
    var pw = form.querySelector('[name="password"]').value;
    if (!email || email.indexOf("@") === -1) return fail("Enter a valid email.");
    if (!pw) return fail("Enter your password.");
    amsg.className = "auth__msg"; amsg.textContent = "Signing in...";
    sb.auth.signInWithPassword({ email: email, password: pw }).then(function (r) {
      if (r.error) return fail(r.error.message); gate();
    });
  });
  $("[data-signout]").addEventListener("click", function () { sb.auth.signOut().then(showAuth); });
  function showAuth() { appView.hidden = true; authView.hidden = false; if (form) form.reset(); }
  function showApp() { authView.hidden = true; appView.hidden = false; }

  function gate() {
    sb.auth.getUser().then(function (u) {
      var user = u.data && u.data.user; if (!user) return showAuth();
      me.uid = user.id; me.email = (user.email || "").toLowerCase();
      sb.from("staff_roles").select("role, full_name").ilike("email", me.email).maybeSingle().then(function (r) {
        var row = r.data;
        if (!row || ["crew_member", "crew_lead", "admin"].indexOf(row.role) === -1) {
          showAuth(); fail("This account isn't set up as crew. Ask an admin to add you."); sb.auth.signOut(); return;
        }
        me.role = row.role; me.name = row.full_name || me.email;
        me.effectiveId = me.uid; me.impersonating = false;
        var asId = new URLSearchParams(location.search).get("as");
        if (asId && me.role === "admin" && asId !== me.uid) { me.effectiveId = asId; me.impersonating = true; }
        bind("today_str", new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" }));
        showApp();
        if (me.impersonating) setupImpersonation(asId);
        loadRoute();
      });
    });
  }
  sb.auth.getSession().then(function (r) { if (r.data.session) gate(); else showAuth(); });

  // Admin "view as": read-only preview of a crew member's route.
  function setupImpersonation(asId) {
    $all("[data-act]").forEach(function (b) { b.style.display = "none"; });
    var b = document.createElement("div");
    b.className = "offline"; b.style.background = "#0066FF"; b.style.color = "#fff";
    b.textContent = "Admin preview — read-only";
    var app = $('[data-view="app"]'); app.insertBefore(b, app.firstChild);
    sb.from("profiles").select("full_name").eq("id", asId).maybeSingle().then(function (r) {
      var nm = (r.data && r.data.full_name) || "this crew member";
      b.textContent = "Admin preview — viewing " + nm + "'s route (read-only)";
    });
  }
  window.addEventListener("online", function () { $("[data-offline]").hidden = true; });
  window.addEventListener("offline", function () { $("[data-offline]").hidden = false; });

  /* ============ LOAD ROUTE ============ */
  function loadRoute() {
    Promise.all([
      sb.from("address_assignments").select("*"),
      sb.from("service_addresses").select("*"),
      sb.from("routes").select("*"),
      sb.from("service_events").select("*").gte("occurred_at", new Date(startOfToday()).toISOString())
    ]).then(function (res) {
      var assigns = res[0].data || [], addrs = res[1].data || [], routes = res[2].data || [], events = res[3].data || [];
      var addrById = {}; addrs.forEach(function (a) { addrById[a.id] = a; });
      var who = me.effectiveId || me.uid;
      var myRouteIds = routes.filter(function (r) { return r.lead_id === who; }).map(function (r) { return r.id; });
      var mine = assigns.filter(function (a) { return a.assigned_to === who || (a.route_id && myRouteIds.indexOf(a.route_id) !== -1); });
      S.events = events;
      S.houses = mine.map(function (a) {
        var addr = addrById[a.address_id] || {};
        return { asg: a, addr: addr, addrId: a.address_id, profileId: addr.profile_id };
      });
      renderRoute(); renderPay();
    }).catch(function (e) { toast("Load error: " + (e.message || e)); });
  }

  function todaysEventsFor(addrId) { return S.events.filter(function (e) { return e.address_id === addrId; }); }
  function statusFor(addrId) {
    var ev = todaysEventsFor(addrId);
    if (ev.some(function (e) { return e.event_type === "brought_in"; })) return "done";
    if (ev.some(function (e) { return e.event_type === "rolled_out"; })) return "out";
    return "pending";
  }

  function renderRoute() {
    var total = S.houses.length;
    var done = S.houses.filter(function (h) { return statusFor(h.addrId) === "done"; }).length;
    bind("total_count", total); bind("done_count", done);
    var labels = { pending: "Pending", out: "At curb", done: "Done" };
    $('[data-list="route"]').innerHTML = total ? S.houses.map(function (h, i) {
      var st = statusFor(h.addrId);
      return "<div class='hcard' data-house-open='" + i + "'><div class='hcard__l'>" +
        "<div class='hcard__addr'>" + esc(h.addr.line1 || "Address") + "</div>" +
        "<div class='hcard__meta'>" + esc(h.addr.city || "") + ((h.asg.cans) ? " · " + h.asg.cans + " can" + (h.asg.cans > 1 ? "s" : "") : "") +
        (h.asg.gate_code ? " · 🔒 gate" : "") + "</div></div>" +
        "<span class='chip chip--" + st + "'>" + labels[st] + "</span></div>";
    }).join("") : "<p class='muted'>No houses assigned to you today. An admin assigns routes in the OS.</p>";
  }

  /* ============ HOUSE DETAIL ============ */
  function openHouse(i) {
    var h = S.houses[i]; if (!h) return; S.current = h;
    bind("h_addr", h.addr.line1 || "Address");
    bind("h_city", [h.addr.city, h.addr.state, h.addr.zip].filter(Boolean).join(", "));
    var chips = [];
    if (h.asg.cans) chips.push("<span class='chip chip--pending'>" + h.asg.cans + " can" + (h.asg.cans > 1 ? "s" : "") + "</span>");
    if (h.asg.gate_code) chips.push("<span class='chip chip--out'>🔒 " + esc(h.asg.gate_code) + "</span>");
    if (h.asg.placement) chips.push("<span class='chip chip--pending'>" + esc(h.asg.placement) + "</span>");
    bind("h_chips", ""); $('[data-bind="h_chips"]').innerHTML = chips.join("");
    var noteEl = $('[data-bind="h_note"]');
    if (h.asg.special_instructions) { noteEl.hidden = false; noteEl.textContent = "⚠ " + h.asg.special_instructions; } else noteEl.hidden = true;
    renderHouseEvents();
    $("[data-house]").hidden = false;
  }
  function renderHouseEvents() {
    var ev = todaysEventsFor(S.current.addrId).sort(function (a, b) { return new Date(b.occurred_at) - new Date(a.occurred_at); });
    var st = statusFor(S.current.addrId);
    bind("h_status", st === "done" ? "✅ Service complete for today." : st === "out" ? "🟡 Cans are out — bring them back this evening." : "⚪ Not started yet.");
    $('[data-list="h_events"]').innerHTML = ev.map(function (e) {
      var img = e.photo_url ? "<img src='" + esc(e.photo_url) + "' alt='proof'>" : "";
      return "<div class='evt'>" + img + "<div><div class='evt__t'>" + esc(e.event_type.replace("_", " ")) + "</div>" +
        "<div class='evt__d'>" + timeStr(e.occurred_at) + (e.flagged ? " · flagged" : "") + "</div></div></div>";
    }).join("");
  }
  $("[data-house-close]").addEventListener("click", function () { $("[data-house]").hidden = true; S.current = null; });

  /* ============ CAPTURE + LOG EVENT ============ */
  var pendingType = null, photoInput = $("[data-photo]");
  $all("[data-act]").forEach(function (b) {
    b.addEventListener("click", function () { pendingType = b.getAttribute("data-act"); photoInput.value = ""; photoInput.click(); });
  });
  photoInput.addEventListener("change", function () {
    var file = photoInput.files && photoInput.files[0];
    if (!file || !S.current) return;
    logEvent(S.current, pendingType, file);
  });

  function getGeo() {
    return new Promise(function (resolve) {
      if (!navigator.geolocation) return resolve({});
      navigator.geolocation.getCurrentPosition(
        function (p) { resolve({ geo_lat: p.coords.latitude, geo_lng: p.coords.longitude }); },
        function () { resolve({}); }, { timeout: 6000, maximumAge: 60000 });
    });
  }

  function logEvent(house, type, file) {
    spinner(true);
    var ext = (file.name.split(".").pop() || "jpg").toLowerCase();
    var path = me.uid + "/" + house.addrId + "/" + Date.now() + "." + ext;
    getGeo().then(function (geo) {
      sb.storage.from(BUCKET).upload(path, file, { upsert: false, contentType: file.type || "image/jpeg" }).then(function (up) {
        if (up.error) { spinner(false); return toast("Photo upload failed: " + up.error.message); }
        var url = sb.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
        var rec = {
          address_id: house.addrId, profile_id: house.profileId || null, pickup_id: null,
          event_type: type, crew_member_id: me.uid, crew: me.name,
          occurred_at: new Date().toISOString(), photo_url: url,
          geo_lat: geo.geo_lat || null, geo_lng: geo.geo_lng || null,
          approved: false, flagged: false, offline_queued: false
        };
        sb.from("service_events").insert([rec]).select().then(function (r) {
          spinner(false);
          if (r.error) return toast(r.error.message);
          if (r.data && r.data[0]) S.events.push(r.data[0]);
          toast(type === "rolled_out" ? "Rolled out ✔" : "Brought in ✔");
          renderHouseEvents(); renderRoute(); renderPay();
        });
      });
    });
  }

  /* ============ PAY ============ */
  function renderPay() {
    var weekAgo = Date.now() - 7 * 86400000;
    // pay screen counts ALL of my events this week, not just today's cache
    sb.from("service_events").select("event_type, occurred_at").eq("crew_member_id", me.effectiveId || me.uid).gte("occurred_at", new Date(weekAgo).toISOString())
      .then(function (r) {
        var ev = r.data || [];
        var out = ev.filter(function (e) { return e.event_type === "rolled_out"; }).length;
        var inn = ev.filter(function (e) { return e.event_type === "brought_in"; }).length;
        bind("pay_out", out); bind("pay_in", inn); bind("pay_actions", out + inn);
      });
  }

  /* ============ NAV ============ */
  document.addEventListener("click", function (e) {
    var tab = e.target.closest("[data-tab]");
    if (tab) {
      var name = tab.getAttribute("data-tab");
      $all(".screen").forEach(function (s) { s.hidden = s.getAttribute("data-screen") !== name; });
      $all(".tabbar__item").forEach(function (t) { t.classList.toggle("is-active", t === tab); });
      bind("screen_title", name === "pay" ? "Your pay" : "Today's route");
      return;
    }
    var hc = e.target.closest("[data-house-open]");
    if (hc) openHouse(parseInt(hc.getAttribute("data-house-open"), 10));
  });

  /* ============ UI helpers ============ */
  var toastEl = $("[data-toast]"), toastTimer = null;
  function toast(t) { toastEl.textContent = t; toastEl.classList.add("is-show"); clearTimeout(toastTimer); toastTimer = setTimeout(function () { toastEl.classList.remove("is-show"); }, 3000); }
  function spinner(on) { $("[data-spinner]").hidden = !on; }
})();
