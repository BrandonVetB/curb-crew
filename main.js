/* ============================================================
   CURB CREW — main.js
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
      var top = target.getBoundingClientRect().top + window.scrollY - 64;
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
     HERO scene: trash can rolls house -> curb -> house, looping
     ============================================================ */
  var can = $(".scene__can");
  var canRock = $(".scene__can-rock");
  if (hasGSAP && !REDUCED && can) {
    // wheels-rocking wobble
    gsap.to(canRock, { rotation: 4, transformOrigin: "50% 100%", duration: 0.32, yoyo: true, repeat: -1, ease: "sine.inOut" });

    var tl = gsap.timeline({ repeat: -1, repeatDelay: 0.4 });
    tl.to({}, { duration: 0.6 })
      // roll out to the curb
      .to(can, { x: 150, duration: 2.0, ease: "power1.inOut" })
      .to(canRock, { rotation: 0, duration: 0.2 }, "<")
      // sit at curb
      .to({}, { duration: 1.1 })
      // little hop (pickup!)
      .to(can, { y: -16, duration: 0.22, ease: "power2.out" })
      .to(can, { y: 0, duration: 0.32, ease: "bounce.out" })
      .to({}, { duration: 0.5 })
      // roll back home
      .to(can, { x: 0, duration: 2.0, ease: "power1.inOut" })
      .to({}, { duration: 0.8 });
  }

  /* ============================================================
     MARQUEE: seamless infinite scroll
     ============================================================ */
  var track = $("[data-marquee]");
  if (hasGSAP && !REDUCED && track) {
    // track contains 2 identical halves -> animate -50%
    gsap.to(track, { xPercent: -50, duration: 22, ease: "none", repeat: -1 });
  }

  /* ============================================================
     HOW IT WORKS: pinned step sequence
     ============================================================ */
  var steps = $all(".how__step");
  var cards = $all("[data-how-card]");
  function setActiveStep(i) {
    steps.forEach(function (s, idx) { s.classList.toggle("is-active", idx === i); });
    cards.forEach(function (c, idx) { c.classList.toggle("is-active", idx === i); });
  }
  setActiveStep(0);

  if (hasGSAP && !REDUCED && steps.length && window.innerWidth > 960) {
    var pin = $("[data-how-pin]");
    ScrollTrigger.create({
      trigger: pin,
      start: "top top+=80",
      end: "+=" + (steps.length * 420),
      pin: true,
      scrub: 0.4,
      onUpdate: function (self) {
        var i = Math.min(steps.length - 1, Math.floor(self.progress * steps.length));
        setActiveStep(i);
      }
    });
  } else {
    // mobile / reduced: light up each step as it enters
    if (!REDUCED && "IntersectionObserver" in window) {
      var stepIO = new IntersectionObserver(function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) {
            var idx = steps.indexOf(entry.target);
            setActiveStep(idx);
          }
        });
      }, { threshold: 0.6 });
      steps.forEach(function (s) { stepIO.observe(s); });
    } else {
      steps.forEach(function (s) { s.classList.add("is-active"); });
    }
  }

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
     ADDRESS FORM: validate, success state, confetti
     ============================================================ */
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
      msg.textContent = "🎉 Great news — we're serving your area! We've saved your spot, check your email.";
      msg.className = "address-form__msg is-success";
      input.value = "";
      input.blur();
      fireConfetti();
    });
  });

  /* ============================================================
     CONFETTI (blue + white) — lightweight canvas burst
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
    var colors = ["#0066FF", "#FFFFFF", "#3b86ff"];
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
