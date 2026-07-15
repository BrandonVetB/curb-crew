/* ============================================================
   CURB CREW - main.js
   GSAP + ScrollTrigger driven motion.
   Respects prefers-reduced-motion. Performant on mobile.
   ============================================================ */
(function () {
  "use strict";

  document.documentElement.classList.add("js");

  var REDUCED = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var IS_TOUCH = window.matchMedia("(hover: none)").matches;
  var hasGSAP = typeof window.gsap !== "undefined";

  if (hasGSAP && window.ScrollTrigger) {
    gsap.registerPlugin(ScrollTrigger);
  }

  /* ---------- helpers ---------- */
  function $(sel, ctx) { return (ctx || document).querySelector(sel); }
  function $all(sel, ctx) { return Array.prototype.slice.call((ctx || document).querySelectorAll(sel)); }

  /* ============================================================
     Footer year
     ============================================================ */
  $all("[data-year]").forEach(function (el) { el.textContent = new Date().getFullYear(); });

  /* ============================================================
     NAV: scrolled state + mobile toggle + smooth scroll
     ============================================================ */
  var nav = $("#nav");
  function onScrollNav() {
    if (window.scrollY > 20) nav.classList.add("is-scrolled");
    else nav.classList.remove("is-scrolled");
  }
  window.addEventListener("scroll", onScrollNav, { passive: true });
  onScrollNav();

  var toggle = $(".nav__toggle");
  if (toggle) {
    toggle.addEventListener("click", function () {
      var open = nav.classList.toggle("is-open");
      toggle.setAttribute("aria-expanded", open ? "true" : "false");
    });
  }
  // close mobile menu + smooth-scroll for in-page links
  $all('a[href^="#"]').forEach(function (link) {
    link.addEventListener("click", function (e) {
      var id = link.getAttribute("href");
      if (id.length < 2) return;
      var target = document.querySelector(id);
      if (!target) return;
      e.preventDefault();
      nav.classList.remove("is-open");
      if (toggle) toggle.setAttribute("aria-expanded", "false");
      var top = target.getBoundingClientRect().top + window.scrollY - 100;
      window.scrollTo({ top: top, behavior: REDUCED ? "auto" : "smooth" });
    });
  });

  /* ============================================================
     REVEAL on scroll (works with or without GSAP)
     ============================================================ */
  var reveals = $all(".reveal");
  if (REDUCED || !("IntersectionObserver" in window)) {
    reveals.forEach(function (el) { el.classList.add("is-in"); });
  } else {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add("is-in");
          io.unobserve(entry.target);
        }
      });
    }, { threshold: 0.14, rootMargin: "0px 0px -8% 0px" });
    reveals.forEach(function (el) { io.observe(el); });
  }

  /* ============================================================
     HERO headline: staggered word reveal on load
     ============================================================ */
  var words = $all(".hero__title .word");
  if (hasGSAP && !REDUCED && words.length) {
    gsap.fromTo(words, { yPercent: 115, opacity: 0 }, {
      yPercent: 0, opacity: 1, duration: 0.9, ease: "power4.out",
      stagger: 0.07, delay: 0.15
    });
    // Safety net: if the tab was throttled (common on mobile) and the reveal never
    // ran, force the headline visible so it never gets stuck hidden.
    setTimeout(function () { gsap.set(words, { opacity: 1, yPercent: 0 }); }, 1600);
  }

  /* ============================================================
     HERO scene: the real bin tilts back onto its wheel, rolls from
     the house, drops off the curb, and settles flat on the street.
     Then it comes back. Loops smoothly.
     ============================================================ */
  var binGrp = $(".sc-bin-grp");
  var bin = $(".sc-bin");

  if (hasGSAP && binGrp && bin) {
    // wheel (~9.7,49.7 in the image) sits at the front of the garage
    gsap.set(binGrp, { x: 23.9, y: 87.1 });
    gsap.set(bin, { transformOrigin: "9.7px 49.7px" });

    {
      var shadow = $(".sc-binshadow") || {};
      var tl = gsap.timeline({ repeat: -1, defaults: { ease: "power1.inOut" } });

      tl.to({}, { duration: 0.7 })
        // little anticipation lean, then tip back onto the wheel with momentum
        .to(bin, { rotation: 3, duration: 0.16, ease: "power2.out" })
        .to(bin, { rotation: -11, duration: 0.45, ease: "back.out(2.2)" })
        .addLabel("out")
        // roll down the driveway and out to the curb
        .to(binGrp, { x: 100.7, y: 134.1, duration: 2.0, ease: "power1.inOut" }, "out")
        .to(shadow, { opacity: 0.3, duration: 1.0, ease: "power1.inOut" }, "out")
        // set it down: overshoot forward (overhang against the curb) then settle with a bounce
        .to(bin, { rotation: 5, duration: 0.35, ease: "power2.out" })
        .to(bin, { rotation: 2, duration: 0.7, ease: "elastic.out(1, 0.4)" })
        .to(shadow, { opacity: 0.55, duration: 0.5, ease: "power2.out" }, "<")
        .to({}, { duration: 1.7 })

        // bring it back up to the garage
        .to(bin, { rotation: -11, duration: 0.45, ease: "back.out(2.2)" })
        .addLabel("back")
        .to(binGrp, { x: 23.9, y: 87.1, duration: 2.0, ease: "power1.inOut" }, "back")
        .to(shadow, { opacity: 0.35, duration: 1.0, ease: "power1.inOut" }, "back")
        .to(bin, { rotation: 0, duration: 0.5, ease: "back.out(1.6)" })
        .to(shadow, { opacity: 0.55, duration: 0.5 }, "<")
        .to({}, { duration: 0.7 });
    }
  }

  /* ============================================================
     MARQUEE: seamless, gap-free loop.
     Clone the set until the track is wider than viewport + one set,
     then wrap x by exactly one set width so it never breaks.
     ============================================================ */
  var marqueeEl = $("[data-marquee]");
  function buildMarquee() {
    var set = $(".marquee__set", marqueeEl);
    if (!set) return;
    var setWidth = set.getBoundingClientRect().width;
    if (!setWidth) { setTimeout(buildMarquee, 300); return; }
    var needed = window.innerWidth + setWidth;
    var guard = 0;
    while (marqueeEl.getBoundingClientRect().width < needed && guard < 40) {
      marqueeEl.appendChild(set.cloneNode(true));
      guard++;
    }
    gsap.to(marqueeEl, {
      x: "-=" + setWidth,
      duration: setWidth / 70,
      ease: "none",
      repeat: -1,
      modifiers: { x: gsap.utils.unitize(gsap.utils.wrap(-setWidth, 0)) }
    });
  }
  if (marqueeEl && hasGSAP) {
    if (document.fonts && document.fonts.ready) {
      document.fonts.ready.then(buildMarquee);
    } else {
      window.addEventListener("load", buildMarquee);
    }
  }
  /* "How it works" now uses plain scroll-reveal (.reveal) — no pin, no lag. */

  /* ============================================================
     STATS: count-up when in view
     ============================================================ */
  function formatNum(n) { return Math.round(n).toLocaleString("en-US"); }
  function runCount(el) {
    var target = parseFloat(el.getAttribute("data-countup")) || 0;
    var suffix = el.getAttribute("data-suffix") || "";
    if (REDUCED || !hasGSAP) {
      el.innerHTML = formatNum(target) + '<span class="suffix">' + suffix + "</span>";
      return;
    }
    var obj = { v: 0 };
    gsap.to(obj, {
      v: target, duration: 1.8, ease: "power2.out",
      onUpdate: function () {
        el.innerHTML = formatNum(obj.v) + '<span class="suffix">' + suffix + "</span>";
      }
    });
  }
  var counts = $all("[data-countup]");
  if ("IntersectionObserver" in window) {
    var cio = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) { runCount(entry.target); cio.unobserve(entry.target); }
      });
    }, { threshold: 0.5 });
    counts.forEach(function (el) { cio.observe(el); });
  } else {
    counts.forEach(runCount);
  }

  /* ============================================================
     MAGNETIC BUTTONS (desktop pointer only)
     ============================================================ */
  if (hasGSAP && !REDUCED && !IS_TOUCH) {
    $all(".magnetic").forEach(function (btn) {
      var strength = 0.22;
      btn.addEventListener("mousemove", function (e) {
        var r = btn.getBoundingClientRect();
        var mx = e.clientX - (r.left + r.width / 2);
        var my = e.clientY - (r.top + r.height / 2);
        gsap.to(btn, { x: mx * strength, y: my * strength, duration: 0.4, ease: "power3.out" });
      });
      btn.addEventListener("mouseleave", function () {
        gsap.to(btn, { x: 0, y: 0, duration: 0.5, ease: "elastic.out(1, 0.4)" });
      });
    });

    // Card hover is handled with a crisp CSS lift (see .benefit:hover / .how-step:hover).
    // The old 3D perspective tilt was removed because rotating the cards blurred the text
    // and left the right column looking skewed.
  }

  /* ============================================================
     ADDRESS FORM: validate, capture lead to Supabase, success, confetti
     ============================================================ */
  var SUPABASE_URL = "https://hezahtnfyhqfucixzqxi.supabase.co";
  var SUPABASE_KEY = "sb_publishable_9l4_Bqgjg7qBapvYlLPJSA_pHOk0nMB";

  function saveLead(data, table) {
    try {
      fetch(SUPABASE_URL + "/rest/v1/" + table, {
        method: "POST",
        headers: { "apikey": SUPABASE_KEY, "Authorization": "Bearer " + SUPABASE_KEY, "Content-Type": "application/json", "Prefer": "return=minimal" },
        body: JSON.stringify(data)
      }).catch(function () {});
    } catch (e) {}
  }
  var SESSION_ID = (function () { try { var k = "cc_sess", s = sessionStorage.getItem(k); if (!s) { s = Math.random().toString(36).slice(2) + Date.now().toString(36); sessionStorage.setItem(k, s); } return s; } catch (e) { return null; } })();
  function track(event, props) { try { saveLead({ event: event, session_id: SESSION_ID, page: "homepage", props: props || null, user_agent: navigator.userAgent }, "analytics_events"); } catch (e) {} }
  function checkServedZip(zip) {
    // Guard against a request that never settles: abort after 8s so the UI
    // can never get stuck on "Checking your area...". Returns a status string
    // so the caller can tell "not served" apart from "check failed".
    var ctrl = (typeof AbortController !== "undefined") ? new AbortController() : null;
    var timer = setTimeout(function () { if (ctrl) ctrl.abort(); }, 8000);
    return fetch(SUPABASE_URL + "/rest/v1/served_zips?select=zip&active=eq.true&zip=eq." + encodeURIComponent(zip), {
      headers: { "apikey": SUPABASE_KEY, "Authorization": "Bearer " + SUPABASE_KEY },
      signal: ctrl ? ctrl.signal : undefined
    }).then(function (r) {
      clearTimeout(timer);
      if (!r.ok) throw new Error("http " + r.status);
      return r.json();
    }).then(function (rows) {
      return (rows && rows.length) ? "served" : "not_served";
    }).catch(function () {
      clearTimeout(timer);
      return "error";
    });
  }
  function leadFail(msg, form, text) {
    msg.textContent = text; msg.className = "address-form__msg is-error";
    if (!REDUCED && hasGSAP) gsap.fromTo(form, { x: -6 }, { x: 0, duration: 0.4, ease: "elastic.out(1,0.4)" });
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

  $all("[data-address-form]").forEach(function (form) {
    var msg = $("[data-form-msg]", form);
    var get = function (sel) { var el = form.querySelector(sel); return el ? el.value.trim() : ""; };
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      var name = get("[data-lf-name]");
      var email = get("[data-lf-email]");
      var zip = (get("[data-lf-zip]").match(/\d{5}/) || [""])[0];
      var address = get("[data-lf-address]");
      if (!name) { leadFail(msg, form, "Enter your name."); return; }
      if (email.indexOf("@") === -1) { leadFail(msg, form, "Enter a valid email."); return; }
      if (!zip) { leadFail(msg, form, "Enter a 5-digit ZIP."); return; }
      var btn = $("button", form); if (btn) btn.disabled = true;
      msg.textContent = "Checking your area..."; msg.className = "address-form__msg";
      checkServedZip(zip).then(function (status) {
        if (btn) btn.disabled = false;
        var lead = { name: name, email: email, zip: zip, address: address || null, source: "coverage_check" };
        if (status === "served") {
          saveLead(lead, "leads");
          track("coverage_check_served", { zip: zip });
          msg.textContent = "Great news, we serve " + zip + "! Taking you to sign up...";
          msg.className = "address-form__msg is-success";
          if (typeof fireConfetti === "function") fireConfetti();
          var q = "?zip=" + encodeURIComponent(zip) + "&name=" + encodeURIComponent(name) + "&email=" + encodeURIComponent(email) + (address ? "&address=" + encodeURIComponent(address) : "");
          setTimeout(function () { window.location.href = "join.html" + q; }, 900);
        } else if (status === "not_served") {
          saveLead(lead, "waitlist");
          track("coverage_check_blocked", { zip: zip });
          msg.innerHTML = "We do not serve " + zip + " just yet, but we are expanding fast and we will be there soon. You are on the list, and we will email you the moment we reach your street. <a href=\"#\" onclick=\"return window.openSupport ? (window.openSupport(), false) : false\" style=\"text-decoration:underline\">Contact us</a> with any questions.";
          msg.className = "address-form__msg is-success";
        } else {
          // Request failed or timed out: never leave the button spinning.
          track("coverage_check_error", { zip: zip });
          leadFail(msg, form, "We couldn't check your area just now. Please try again in a moment.");
        }
      });
    });
  });

  /* ============================================================
     CONFETTI (blue + white): lightweight canvas burst
     ============================================================ */
  var canvas = $("[data-confetti]");
  var ctx = canvas ? canvas.getContext("2d") : null;
  var pieces = [];
  var rafId = null;

  function sizeCanvas() {
    if (!canvas) return;
    canvas.width = window.innerWidth * (window.devicePixelRatio || 1);
    canvas.height = window.innerHeight * (window.devicePixelRatio || 1);
  }
  sizeCanvas();
  window.addEventListener("resize", sizeCanvas);

  function fireConfetti() {
    if (!ctx || REDUCED) return;
    var dpr = window.devicePixelRatio || 1;
    var colors = ["#0066FF", "#0B0B0F", "#3b86ff"];
    var cx = canvas.width / 2;
    var cy = canvas.height * 0.42;
    var count = window.innerWidth < 600 ? 70 : 130;
    for (var i = 0; i < count; i++) {
      var angle = Math.random() * Math.PI * 2;
      var speed = (4 + Math.random() * 9) * dpr;
      pieces.push({
        x: cx, y: cy,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 6 * dpr,
        size: (5 + Math.random() * 7) * dpr,
        color: colors[(Math.random() * colors.length) | 0],
        rot: Math.random() * Math.PI,
        vr: (Math.random() - 0.5) * 0.4,
        life: 1
      });
    }
    if (!rafId) rafId = requestAnimationFrame(drawConfetti);
  }

  function drawConfetti() {
    var dpr = window.devicePixelRatio || 1;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    var gravity = 0.28 * dpr;
    for (var i = pieces.length - 1; i >= 0; i--) {
      var p = pieces[i];
      p.vy += gravity;
      p.vx *= 0.99;
      p.x += p.vx;
      p.y += p.vy;
      p.rot += p.vr;
      p.life -= 0.009;
      if (p.life <= 0 || p.y > canvas.height + 40) { pieces.splice(i, 1); continue; }
      ctx.save();
      ctx.globalAlpha = Math.max(0, p.life);
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.fillStyle = p.color;
      ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.6);
      ctx.restore();
    }
    if (pieces.length) { rafId = requestAnimationFrame(drawConfetti); }
    else { ctx.clearRect(0, 0, canvas.width, canvas.height); rafId = null; }
  }

  /* "Get in touch" (data-contact) is handled by support.js, which opens the
     operator interest form. No mailto. data-noop kept as a safe no-op. */
  $all("[data-noop]").forEach(function (el) {
    el.addEventListener("click", function (e) { e.preventDefault(); });
  });

  // Refresh ScrollTrigger after fonts/images settle
  if (hasGSAP && window.ScrollTrigger) {
    window.addEventListener("load", function () { ScrollTrigger.refresh(); });
  }
})();
