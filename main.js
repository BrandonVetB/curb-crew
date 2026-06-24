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
    gsap.set(words, { yPercent: 115, opacity: 0 });
    gsap.to(words, {
      yPercent: 0, opacity: 1, duration: 0.9, ease: "power4.out",
      stagger: 0.07, delay: 0.15
    });
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

    if (!REDUCED) {
      var tl = gsap.timeline({ repeat: -1, defaults: { ease: "power1.inOut" } });

      tl.to({}, { duration: 0.8 })
        // tip back onto the wheel
        .to(bin,    { rotation: -10, duration: 0.5, ease: "power2.out" })
        // roll down the driveway and out onto the street, against the curb
        .to(binGrp, { x: 100.7, y: 134.1, duration: 2.1 })
        // set it down at the curb
        .to(bin,    { rotation: 0, duration: 0.5, ease: "power2.out" })
        .to({},     { duration: 1.8 })

        // bring it back up to the garage
        .to(bin,    { rotation: -10, duration: 0.5, ease: "power2.out" })
        .to(binGrp, { x: 23.9, y: 87.1, duration: 2.1 })
        .to(bin,    { rotation: 0, duration: 0.5, ease: "power2.out" })
        .to({},     { duration: 0.8 });
    }
  }

  /* ============================================================
     MARQUEE: seamless, gap-free loop.
     Clone the set until the track is wider than viewport + one set,
     then wrap x by exactly one set width so it never breaks.
     ============================================================ */
  var track = $("[data-marquee]");
  function buildMarquee() {
    var set = $(".marquee__set", track);
    if (!set) return;
    var setWidth = set.getBoundingClientRect().width;
    if (!setWidth) return;
    var needed = window.innerWidth + setWidth;
    var guard = 0;
    while (track.getBoundingClientRect().width < needed && guard < 40) {
      track.appendChild(set.cloneNode(true));
      guard++;
    }
    gsap.to(track, {
      x: "-=" + setWidth,
      duration: setWidth / 70,
      ease: "none",
      repeat: -1,
      modifiers: { x: gsap.utils.unitize(gsap.utils.wrap(-setWidth, 0)) }
    });
  }
  if (track && hasGSAP && !REDUCED) {
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
      var strength = 0.35;
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

    // subtle hover lift on cards
    $all(".magnetic-card").forEach(function (card) {
      card.addEventListener("mousemove", function (e) {
        var r = card.getBoundingClientRect();
        var rx = ((e.clientY - r.top) / r.height - 0.5) * -4;
        var ry = ((e.clientX - r.left) / r.width - 0.5) * 4;
        gsap.to(card, { rotateX: rx, rotateY: ry, transformPerspective: 800, duration: 0.4, ease: "power2.out" });
      });
      card.addEventListener("mouseleave", function () {
        gsap.to(card, { rotateX: 0, rotateY: 0, duration: 0.6, ease: "power2.out" });
      });
    });
  }

  /* ============================================================
     ADDRESS FORM: validate, capture lead to Supabase, success, confetti
     ============================================================ */
  var SUPABASE_URL = "https://hezahtnfyhqfucixzqxi.supabase.co";
  var SUPABASE_KEY = "sb_publishable_9l4_Bqgjg7qBapvYlLPJSA_pHOk0nMB";

  function captureLead(raw) {
    var zip = (raw.match(/\b\d{5}\b/) || [null])[0];
    try {
      fetch(SUPABASE_URL + "/rest/v1/leads", {
        method: "POST",
        headers: {
          "apikey": SUPABASE_KEY,
          "Authorization": "Bearer " + SUPABASE_KEY,
          "Content-Type": "application/json",
          "Prefer": "return=minimal"
        },
        body: JSON.stringify({
          raw_input: raw,
          zip: zip,
          source: "homepage",
          user_agent: navigator.userAgent
        })
      }).catch(function () {});
    } catch (e) {}
  }

  function isValidEntry(v) {
    v = v.trim();
    if (/^\d{5}(-\d{4})?$/.test(v)) return true;      // ZIP
    if (v.length >= 6 && /\d/.test(v) && /[a-zA-Z]/.test(v)) return true; // street address
    return false;
  }
  $all("[data-address-form]").forEach(function (form) {
    var input = $("input", form);
    var msg = $("[data-form-msg]", form);
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      var val = input.value || "";
      if (!isValidEntry(val)) {
        msg.textContent = "Enter a full street address or a 5-digit ZIP.";
        msg.className = "address-form__msg is-error";
        if (!REDUCED && hasGSAP) gsap.fromTo(form, { x: -6 }, { x: 0, duration: 0.4, ease: "elastic.out(1,0.4)" });
        input.focus();
        return;
      }
      captureLead(val.trim());
      msg.textContent = "🎉 Great news, we're serving your area! We've saved your spot, check your email.";
      msg.className = "address-form__msg is-success";
      input.value = "";
      input.blur();
      fireConfetti();
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

  /* ============================================================
     Placeholder links (contact / terms) -> gentle message
     ============================================================ */
  $all("[data-contact]").forEach(function (el) {
    el.addEventListener("click", function (e) {
      e.preventDefault();
      window.location.href = "mailto:hello@curbcrew.example?subject=Running%20a%20route";
    });
  });
  $all("[data-noop]").forEach(function (el) {
    el.addEventListener("click", function (e) { e.preventDefault(); });
  });

  // Refresh ScrollTrigger after fonts/images settle
  if (hasGSAP && window.ScrollTrigger) {
    window.addEventListener("load", function () { ScrollTrigger.refresh(); });
  }
})();
