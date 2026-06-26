/* ============================================================
   Curb Crew OS — admin.js  (admin web app, live Supabase)
   Loads core tables into memory and joins in JS (small dataset,
   pre-launch). All writes go through RLS (admin-only).
   ============================================================ */
(function () {
  "use strict";

  var SUPABASE_URL = "https://hezahtnfyhqfucixzqxi.supabase.co";
  var SUPABASE_KEY = "sb_publishable_9l4_Bqgjg7qBapvYlLPJSA_pHOk0nMB";
  var sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

  function $(s, c) { return (c || document).querySelector(s); }
  function $all(s, c) { return Array.prototype.slice.call((c || document).querySelectorAll(s)); }
  function el(key) { return $('[data-bind="' + key + '"]'); }
  function bind(key, val) { var e = el(key); if (e) e.textContent = val; }
  function list(name) { return $('[data-list="' + name + '"]'); }
  function money(c) { return c == null ? "$0" : "$" + (c / 100).toFixed(2); }
  function esc(s) { return (s == null ? "" : String(s)).replace(/[&<>"]/g, function (m) { return ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[m]; }); }
  function initials(n) { return (n || "CC").split(" ").map(function (p) { return p[0]; }).join("").slice(0, 2).toUpperCase(); }
  function fmtDateTime(d) { return d ? new Date(d).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : "—"; }
  function todayISO() { return new Date().toISOString().slice(0, 10); }

  var authView = $('[data-view="auth"]'), appView = $('[data-view="app"]');
  var S = {}; // state cache of tables
  var me = { uid: null, email: null, role: null, name: null };

  /* ================= AUTH ================= */
  var form = $("[data-auth-form]"), amsg = $("[data-auth-msg]");
  function fail(t) { amsg.className = "auth__msg is-error"; amsg.textContent = t; }
  function ok(t) { amsg.className = "auth__msg is-success"; amsg.textContent = t; }

  form.addEventListener("submit", function (e) {
    e.preventDefault();
    var email = form.querySelector('[name="email"]').value.trim();
    var pw = form.querySelector('[name="password"]').value;
    if (!email || email.indexOf("@") === -1) return fail("Enter a valid email.");
    if (!pw) return fail("Enter your password.");
    amsg.className = "auth__msg"; amsg.textContent = "Signing in...";
    sb.auth.signInWithPassword({ email: email, password: pw }).then(function (r) {
      if (r.error) return fail(r.error.message);
      gate();
    });
  });

  $("[data-signout]").addEventListener("click", function () {
    sb.auth.signOut().then(function () { showAuth(); });
  });

  function showAuth() { appView.hidden = true; authView.hidden = false; if (form) form.reset(); }
  function showApp() { authView.hidden = true; appView.hidden = false; }

  // Verify the signed-in user is an admin before entering.
  function gate() {
    sb.auth.getUser().then(function (u) {
      var user = u.data && u.data.user;
      if (!user) return showAuth();
      me.uid = user.id; me.email = (user.email || "").toLowerCase();
      sb.from("staff_roles").select("role, full_name").ilike("email", me.email).maybeSingle().then(function (r) {
        var row = r.data;
        if (!row || row.role !== "admin") {
          showAuth();
          fail("This account isn't an admin. Ask an owner to add you in Crew & users.");
          sb.auth.signOut();
          return;
        }
        me.role = row.role; me.name = row.full_name || me.email;
        bind("me_name", me.name); bind("avatar", initials(me.name)); bind("role_pill", me.role);
        showApp();
        loadAll();
      });
    });
  }

  sb.auth.getSession().then(function (r) { if (r.data.session) gate(); else showAuth(); });

  /* ================= DATA ================= */
  function loadAll() {
    Promise.all([
      sb.from("profiles").select("*"),
      sb.from("staff_roles").select("*").order("created_at", { ascending: true }),
      sb.from("service_addresses").select("*"),
      sb.from("address_assignments").select("*"),
      sb.from("routes").select("*").order("name", { ascending: true }),
      sb.from("subscriptions").select("*"),
      sb.from("pickups").select("*"),
      sb.from("service_events").select("*").order("occurred_at", { ascending: false }).limit(400),
      sb.from("ops_audit_log").select("*").order("created_at", { ascending: false }).limit(100)
    ]).then(function (res) {
      S.profiles = res[0].data || [];
      S.staff = res[1].data || [];
      S.addresses = res[2].data || [];
      S.assignments = res[3].data || [];
      S.routes = res[4].data || [];
      S.subs = res[5].data || [];
      S.pickups = res[6].data || [];
      S.events = res[7].data || [];
      S.audit = res[8].data || [];
      // index helpers
      S.profileById = {}; S.profiles.forEach(function (p) { S.profileById[p.id] = p; });
      S.staffEmails = {}; S.staff.forEach(function (s) { S.staffEmails[(s.email || "").toLowerCase()] = s; });
      S.subByProfile = {}; S.subs.forEach(function (s) { S.subByProfile[s.profile_id] = s; });
      S.routeById = {}; S.routes.forEach(function (r) { S.routeById[r.id] = r; });
      renderAll();
    }).catch(function (e) { toast("Load error: " + (e.message || e)); });
  }

  function isStaffProfile(p) { return !!S.staffEmails[(p.email || "").toLowerCase()]; }

  function renderAll() {
    renderDashboard(); renderClients(); renderHouses(); renderRoutes();
    renderCrew(); renderPhotos(); renderPayroll(); renderAudit();
  }

  /* ---------- dashboard ---------- */
  function renderDashboard() {
    var clients = S.profiles.filter(function (p) { return !isStaffProfile(p); });
    bind("k_clients", clients.length);
    bind("k_active", S.subs.filter(function (s) { return s.status === "active"; }).length);
    bind("k_houses", S.addresses.length);
    bind("k_today", S.pickups.filter(function (p) { return p.pickup_date === todayISO(); }).length);

    var flagged = S.events.filter(function (e) { return e.flagged; });
    var fb = list("flagged");
    var fc = el("flag_count");
    if (flagged.length && fc) { fc.hidden = false; fc.textContent = flagged.length; }
    fb.innerHTML = flagged.length ? flagged.map(function (e) {
      return "<tr><td>" + fmtDateTime(e.occurred_at) + "</td><td>" + esc(crewName(e)) + "</td><td>" + esc(e.event_type) +
        "</td><td class='muted'>" + esc(e.notes || "—") + "</td><td><button class='link-btn' data-resolve='" + e.id + "'>Resolve</button></td></tr>";
    }).join("") : "<tr><td colspan='5' class='muted'>Nothing flagged. </td></tr>";

    var rb = list("recent");
    rb.innerHTML = S.events.slice(0, 8).map(function (e) {
      var d = e.event_type === "rolled_out" ? "dot" : "dot";
      return "<li><span class='" + d + "'></span> " + esc(crewName(e)) + " · " + esc(e.event_type.replace("_", " ")) +
        " · <span class='muted'>" + fmtDateTime(e.occurred_at) + "</span></li>";
    }).join("") || "<li class='muted'>No activity yet.</li>";
  }
  function crewName(e) {
    var p = e.crew_member_id && S.profileById[e.crew_member_id];
    return (p && p.full_name) || e.crew || "Crew";
  }

  /* ---------- clients ---------- */
  function renderClients(q) {
    var clients = S.profiles.filter(function (p) { return !isStaffProfile(p); });
    if (q) { q = q.toLowerCase(); clients = clients.filter(function (p) { return ((p.full_name || "") + " " + (p.email || "")).toLowerCase().indexOf(q) !== -1; }); }
    list("clients").innerHTML = clients.length ? clients.map(function (p) {
      var sub = S.subByProfile[p.id];
      var status = sub ? sub.status : "none";
      var cls = status === "active" ? "pill--green" : status === "paused" ? "pill--amber" : "";
      var plan = sub ? planLabel(sub) : "—";
      return "<tr><td>" + esc(p.full_name || "—") + "</td><td>" + esc(p.email || "—") + "</td><td>" + esc(p.phone || "—") +
        "</td><td>" + esc(plan) + "</td><td><span class='pill " + cls + "'>" + esc(status) + "</span></td>" +
        "<td><button class='link-btn' data-viewas-client='" + esc(p.id) + "'>View as</button></td></tr>";
    }).join("") : "<tr><td colspan='5' class='muted'>No clients yet.</td></tr>";
  }
  function planLabel(s) {
    var a = []; if (s.addon_recycling) a.push("Recycling"); if (s.addon_yard_waste) a.push("Yard"); if (s.addon_cleaning) a.push("Cleaning");
    return "Curb Crews" + (a.length ? " +" + a.length : "") + " · " + money(s.monthly_total_cents) + "/mo";
  }

  /* ---------- houses ---------- */
  function assignmentForAddress(addrId) {
    for (var i = 0; i < S.assignments.length; i++) if (S.assignments[i].address_id === addrId) return S.assignments[i];
    return null;
  }
  function renderHouses() {
    list("houses").innerHTML = S.addresses.length ? S.addresses.map(function (a) {
      var asg = assignmentForAddress(a.id);
      var route = asg && asg.route_id && S.routeById[asg.route_id];
      var crew = asg && asg.assigned_to && S.profileById[asg.assigned_to];
      return "<tr><td>" + esc(a.line1 || "—") + "</td><td>" + esc(a.city || "—") +
        "</td><td>" + (route ? esc(route.name) : "<span class='muted'>Unassigned</span>") +
        "</td><td>" + (crew ? esc(crew.full_name) : "<span class='muted'>—</span>") +
        "</td><td>" + ((asg && asg.cans) || 1) + "</td>" +
        "<td><button class='link-btn' data-assign='" + a.id + "'>Assign</button></td></tr>";
    }).join("") : "<tr><td colspan='6' class='muted'>No houses yet. Add one.</td></tr>";
  }

  /* ---------- routes ---------- */
  function renderRoutes() {
    list("routes").innerHTML = S.routes.length ? S.routes.map(function (r) {
      var count = S.assignments.filter(function (a) { return a.route_id === r.id; }).length;
      var lead = r.lead_id && S.profileById[r.lead_id];
      return "<tr><td>" + esc(r.name) + "</td><td>" + esc(r.zone || "—") + "</td><td>" + esc(r.pickup_day || "—") +
        "</td><td>" + esc(lead ? lead.full_name : "—") + "</td><td>" + count +
        "</td><td><span class='pill " + (r.active ? "pill--green'>active" : "'>off") + "</span></td></tr>";
    }).join("") : "<tr><td colspan='6' class='muted'>No routes yet.</td></tr>";
  }

  /* ---------- crew / users ---------- */
  function renderCrew() {
    list("crew").innerHTML = S.staff.length ? S.staff.map(function (s) {
      return "<tr><td>" + esc(s.full_name || "—") + "</td><td>" + esc(s.email) +
        "</td><td><span class='pill'>" + esc(s.role) + "</span></td><td class='muted'>" + esc(s.manager_email || "—") +
        "</td><td><button class='link-btn' data-viewas-staff='" + esc(s.email) + "'>View as</button> &nbsp; <button class='link-btn' data-edituser='" + esc(s.email) + "'>Edit</button></td></tr>";
    }).join("") : "<tr><td colspan='5' class='muted'>No users.</td></tr>";
  }

  /* ---------- photos ---------- */
  function renderPhotos() {
    var withPhotos = S.events.filter(function (e) { return e.photo_url; });
    bind("photos_count", withPhotos.length + " photos");
    list("photos").innerHTML = withPhotos.length ? withPhotos.map(function (e) {
      var stamp = fmtDateTime(e.occurred_at);
      var badge = e.flagged ? "<span class='pill pill--red'>flagged</span>" : e.approved ? "<span class='pill pill--green'>approved</span>" : "<span class='pill pill--amber'>review</span>";
      return "<div class='photo'><img loading='lazy' src='" + esc(e.photo_url) + "' alt='service photo' />" +
        "<div class='photo__meta'><div>" + esc(crewName(e)) + " " + badge + "</div>" +
        "<div class='muted'>" + esc(e.event_type.replace("_", " ")) + " · " + stamp + "</div>" +
        "<div class='photo__btns'><button class='link-btn' data-approve='" + e.id + "'>Approve</button>" +
        "<button class='link-btn' data-flag='" + e.id + "'>Flag</button></div></div></div>";
    }).join("") : "<p class='muted'>No photos uploaded yet.</p>";
  }

  /* ---------- payroll ---------- */
  function renderPayroll() {
    var weekAgo = Date.now() - 7 * 86400000;
    var agg = {};
    S.events.forEach(function (e) {
      if (new Date(e.occurred_at).getTime() < weekAgo) return;
      var id = e.crew_member_id || "unknown";
      agg[id] = agg[id] || { out: 0, in: 0 };
      if (e.event_type === "rolled_out") agg[id].out++; else if (e.event_type === "brought_in") agg[id].in++;
    });
    var rows = Object.keys(agg).map(function (id) {
      var p = S.profileById[id];
      var a = agg[id];
      return "<tr><td>" + esc((p && p.full_name) || "Unknown") + "</td><td>" + a.out + "</td><td>" + a.in + "</td><td>" + (a.out + a.in) + "</td></tr>";
    });
    list("payroll").innerHTML = rows.length ? rows.join("") : "<tr><td colspan='4' class='muted'>No service events this week.</td></tr>";
  }

  /* ---------- audit ---------- */
  function renderAudit() {
    list("audit").innerHTML = S.audit.length ? S.audit.map(function (a) {
      var p = a.actor_id && S.profileById[a.actor_id];
      return "<tr><td>" + fmtDateTime(a.created_at) + "</td><td>" + esc((p && p.full_name) || "—") +
        "</td><td>" + esc(a.action) + "</td><td class='muted'>" + esc(a.detail || "") + "</td></tr>";
    }).join("") : "<tr><td colspan='4' class='muted'>No audit entries.</td></tr>";
  }

  function logAudit(action, detail) {
    sb.from("ops_audit_log").insert([{ actor_id: me.uid, action: action, detail: detail || null }]).then(function () {});
  }

  /* ================= NAV ================= */
  var TITLES = { dashboard: "Dashboard", clients: "Clients", houses: "Houses", routes: "Routes", crew: "Crew & users", photos: "Photo review", payroll: "Payroll", audit: "Audit log" };
  function showPanel(name) {
    if (!TITLES[name]) return;
    $all(".panel").forEach(function (p) { p.hidden = p.getAttribute("data-panel") !== name; });
    $all(".side__link").forEach(function (l) { l.classList.toggle("is-active", l.getAttribute("data-nav") === name); });
    var t = $("[data-page-title]"); if (t) t.textContent = TITLES[name];
  }
  document.addEventListener("click", function (e) {
    var n = e.target.closest("[data-nav]"); if (n) { showPanel(n.getAttribute("data-nav")); }
  });
  $all('[data-search="clients"]').forEach(function (i) { i.addEventListener("input", function () { renderClients(i.value); }); });

  /* ================= MODAL ================= */
  var modal = $("[data-modal]"), mTitle = $("[data-modal-title]"), mBody = $("[data-modal-body]"), mConfirm = $("[data-modal-confirm]"), pending = null;
  function openModal(title, html, label, onConfirm) {
    mTitle.textContent = title; mBody.innerHTML = html; mConfirm.textContent = label || "Save"; pending = onConfirm; modal.hidden = false;
  }
  function closeModal() { modal.hidden = true; pending = null; }
  $all("[data-modal-close]").forEach(function (b) { b.addEventListener("click", closeModal); });
  mConfirm.addEventListener("click", function () { if (pending) pending(); });

  function opt(v, label, sel) { return "<option value='" + esc(v) + "'" + (sel ? " selected" : "") + ">" + esc(label || v) + "</option>"; }

  /* ================= ACTIONS ================= */
  document.addEventListener("click", function (e) {
    var t = e.target.closest("[data-open],[data-assign],[data-approve],[data-flag],[data-resolve],[data-edituser],[data-viewas-staff],[data-viewas-client]");
    if (!t) return;
    if (t.hasAttribute("data-open")) return openCreate(t.getAttribute("data-open"));
    if (t.hasAttribute("data-assign")) return openAssign(t.getAttribute("data-assign"));
    if (t.hasAttribute("data-edituser")) return openEditUser(t.getAttribute("data-edituser"));
    if (t.hasAttribute("data-viewas-staff")) return viewAsStaff(t.getAttribute("data-viewas-staff"));
    if (t.hasAttribute("data-viewas-client")) return window.open("portal.html?as=" + encodeURIComponent(t.getAttribute("data-viewas-client")), "_blank");
    var id = t.getAttribute("data-approve") || t.getAttribute("data-flag") || t.getAttribute("data-resolve");
    if (t.hasAttribute("data-approve")) updateEvent(id, { approved: true, flagged: false }, "Photo approved");
    if (t.hasAttribute("data-flag")) updateEvent(id, { flagged: true }, "Photo flagged");
    if (t.hasAttribute("data-resolve")) updateEvent(id, { flagged: false, approved: true }, "Flag resolved");
  });

  function updateEvent(id, patch, msg) {
    sb.from("service_events").update(patch).eq("id", id).then(function (r) {
      if (r.error) return toast(r.error.message);
      logAudit(msg, "event " + id); toast(msg); loadAll();
    });
  }

  function openCreate(kind) {
    if (kind === "addRoute") {
      openModal("Add route",
        "<label class='field'><span>Name</span><input id='m_name' placeholder='North Loop AM'></label>" +
        "<label class='field'><span>Zone</span><input id='m_zone' placeholder='78732'></label>" +
        "<label class='field'><span>Pickup day</span><input id='m_day' placeholder='Monday'></label>", "Add route",
        function () {
          var name = $("#m_name").value.trim(); if (!name) return toast("Name required.");
          sb.from("routes").insert([{ name: name, zone: $("#m_zone").value.trim() || null, pickup_day: $("#m_day").value.trim() || null, active: true }]).then(function (r) {
            if (r.error) return toast(r.error.message);
            logAudit("Route created", name); closeModal(); toast("Route added."); loadAll();
          });
        });
    } else if (kind === "addHouse") {
      var clientOpts = S.profiles.map(function (p) { return opt(p.id, (p.full_name || p.email)); }).join("");
      openModal("Add house",
        "<label class='field'><span>Client</span><select id='m_client'>" + clientOpts + "</select></label>" +
        "<label class='field'><span>Street address</span><input id='m_line1' placeholder='123 Maple St'></label>" +
        "<label class='field'><span>City</span><input id='m_city' placeholder='Austin'></label>" +
        "<label class='field'><span>ZIP</span><input id='m_zip' placeholder='78732'></label>", "Add house",
        function () {
          var line1 = $("#m_line1").value.trim(); if (!line1) return toast("Address required.");
          sb.from("service_addresses").insert([{ profile_id: $("#m_client").value, line1: line1, city: $("#m_city").value.trim() || null, state: "TX", zip: $("#m_zip").value.trim() || null }]).then(function (r) {
            if (r.error) return toast(r.error.message);
            logAudit("House added", line1); closeModal(); toast("House added."); loadAll();
          });
        });
    } else if (kind === "addUser") {
      openModal("Add crew / user",
        "<label class='field'><span>Full name</span><input id='m_uname' placeholder='Jane Doe'></label>" +
        "<label class='field'><span>Email</span><input id='m_uemail' type='email' placeholder='jane@curbcrews.com'></label>" +
        "<label class='field'><span>Role</span><select id='m_urole'>" + opt("crew_member", "Crew member") + opt("crew_lead", "Crew lead") + opt("admin", "Admin") + "</select></label>", "Add user",
        function () {
          var email = $("#m_uemail").value.trim().toLowerCase(); if (!email || email.indexOf("@") === -1) return toast("Valid email required.");
          sb.from("staff_roles").insert([{ email: email, full_name: $("#m_uname").value.trim() || null, role: $("#m_urole").value }]).then(function (r) {
            if (r.error) return toast(r.error.message);
            logAudit("User added", email + " (" + $("#m_urole").value + ")"); closeModal(); toast("User added."); loadAll();
          });
        });
    }
  }

  function openAssign(addrId) {
    var a = S.addresses.filter(function (x) { return x.id === addrId; })[0]; if (!a) return;
    var asg = assignmentForAddress(addrId);
    var routeOpts = "<option value=''>— Unassigned —</option>" + S.routes.map(function (r) { return opt(r.id, r.name, asg && asg.route_id === r.id); }).join("");
    var crewOpts = "<option value=''>— None —</option>" + S.staff.map(function (s) {
      var p = S.profiles.filter(function (x) { return (x.email || "").toLowerCase() === (s.email || "").toLowerCase(); })[0];
      return p ? opt(p.id, s.full_name || s.email, asg && asg.assigned_to === p.id) : "";
    }).join("");
    openModal("Assign " + (a.line1 || "house"),
      "<label class='field'><span>Route</span><select id='m_route'>" + routeOpts + "</select></label>" +
      "<label class='field'><span>Crew member</span><select id='m_crew'>" + crewOpts + "</select></label>" +
      "<label class='field'><span>Cans</span><input id='m_cans' type='number' min='1' value='" + ((asg && asg.cans) || 1) + "'></label>" +
      "<label class='field'><span>Gate code</span><input id='m_gate' value='" + esc((asg && asg.gate_code) || "") + "'></label>", "Save",
      function () {
        var rec = { address_id: addrId, route_id: $("#m_route").value || null, assigned_to: $("#m_crew").value || null, cans: parseInt($("#m_cans").value, 10) || 1, gate_code: $("#m_gate").value.trim() || null };
        var q = asg ? sb.from("address_assignments").update(rec).eq("id", asg.id) : sb.from("address_assignments").insert([rec]);
        q.then(function (r) { if (r.error) return toast(r.error.message); logAudit("House assigned", a.line1 || addrId); closeModal(); toast("Assignment saved."); loadAll(); });
      });
  }

  function openEditUser(email) {
    var s = S.staffEmails[email.toLowerCase()]; if (!s) return;
    openModal("Edit " + (s.full_name || s.email),
      "<label class='field'><span>Role</span><select id='m_role'>" + opt("crew_member", "Crew member", s.role === "crew_member") + opt("crew_lead", "Crew lead", s.role === "crew_lead") + opt("admin", "Admin", s.role === "admin") + "</select></label>", "Save",
      function () {
        sb.from("staff_roles").update({ role: $("#m_role").value }).ilike("email", email).then(function (r) {
          if (r.error) return toast(r.error.message); logAudit("Role changed", email + " -> " + $("#m_role").value); closeModal(); toast("Role updated."); loadAll();
        });
      });
  }

  // View the crew app as a specific staff member (read-only admin preview).
  function viewAsStaff(email) {
    var p = S.profiles.filter(function (x) { return (x.email || "").toLowerCase() === (email || "").toLowerCase(); })[0];
    if (!p) { return toast("That user hasn't signed up for a login yet, so there's nothing to view. They sign up at the portal with this email."); }
    window.open("crew.html?as=" + encodeURIComponent(p.id), "_blank");
  }

  /* ================= TOAST ================= */
  var toastEl = $("[data-toast]"), toastTimer = null;
  function toast(t) { toastEl.textContent = t; toastEl.classList.add("is-show"); clearTimeout(toastTimer); toastTimer = setTimeout(function () { toastEl.classList.remove("is-show"); }, 3000); }
})();
