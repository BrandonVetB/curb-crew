/* ============================================================
   CURB CREWS - support.js  (site-wide support ticket widget)
   Drop <script src="support.js" defer></script> on any page.
   Any element with data-support opens the form. Tickets save to
   the database and email the team from service@curbcrews.com.
   ============================================================ */
(function () {
  "use strict";
  var FN = "https://hezahtnfyhqfucixzqxi.supabase.co/functions/v1/submit-ticket";
  var ANON = "sb_publishable_9l4_Bqgjg7qBapvYlLPJSA_pHOk0nMB";

  var css =
    '.cs-overlay{position:fixed;inset:0;background:rgba(11,11,15,.55);backdrop-filter:blur(4px);display:grid;place-items:center;z-index:99999;padding:20px}' +
    '.cs-overlay[hidden]{display:none}' +
    '.cs-modal{background:#fff;border-radius:20px;max-width:460px;width:100%;padding:26px;box-shadow:0 24px 60px rgba(11,11,15,.3);font-family:Inter,system-ui,sans-serif;color:#0b0b0f;max-height:90vh;overflow:auto}' +
    '.cs-modal h3{font-family:"Space Grotesk",sans-serif;font-size:1.35rem;margin:0 0 4px}' +
    '.cs-sub{color:#5a5a66;font-size:.9rem;margin:0 0 18px}' +
    '.cs-field{display:flex;flex-direction:column;gap:6px;margin-bottom:12px}' +
    '.cs-field span{font-size:13px;font-weight:600;color:#3a3a44}' +
    '.cs-field input,.cs-field select,.cs-field textarea{font:inherit;font-size:15px;padding:12px 13px;border:1px solid #d7d7df;border-radius:11px;background:#fff;color:#0b0b0f;width:100%;box-sizing:border-box}' +
    '.cs-field textarea{min-height:96px;resize:vertical}' +
    '.cs-field input:focus,.cs-field select:focus,.cs-field textarea:focus{outline:none;border-color:#0066ff;box-shadow:0 0 0 4px rgba(0,102,255,.12)}' +
    '.cs-row{display:grid;grid-template-columns:1fr 1fr;gap:12px}' +
    '.cs-btn{font-family:"Space Grotesk",sans-serif;font-weight:600;font-size:15px;border:none;border-radius:999px;padding:13px 20px;cursor:pointer;width:100%}' +
    '.cs-btn--primary{background:#0066ff;color:#fff}.cs-btn--primary:disabled{opacity:.6;cursor:default}' +
    '.cs-btn--ghost{background:transparent;color:#5a5a66;width:auto;padding:8px}' +
    '.cs-head{display:flex;justify-content:space-between;align-items:flex-start;gap:10px}' +
    '.cs-msg{min-height:18px;font-size:13px;font-weight:600;margin-top:8px}' +
    '.cs-msg.err{color:#d61f3a}.cs-msg.ok{color:#0066ff}' +
    '.cs-done{text-align:center;padding:14px 0}' +
    '.cs-done .cs-check{width:56px;height:56px;border-radius:50%;background:#0066ff;display:grid;place-items:center;margin:0 auto 14px}' +
    '.cs-done .cs-check svg{width:28px;height:28px;stroke:#fff;stroke-width:3;fill:none;stroke-linecap:round;stroke-linejoin:round}';

  var style = document.createElement("style");
  style.textContent = css;
  document.head.appendChild(style);

  var host = document.createElement("div");
  host.innerHTML =
    '<div class="cs-overlay" data-cs-overlay hidden>' +
    '  <div class="cs-modal" role="dialog" aria-modal="true">' +
    '    <div data-cs-form>' +
    '      <div class="cs-head"><div><h3>Contact us</h3><p class="cs-sub">Goes straight to hello@curbcrews.com. We reply fast.</p></div>' +
    '        <button class="cs-btn--ghost" data-cs-close aria-label="Close">&#10005;</button></div>' +
    '      <div class="cs-row">' +
    '        <label class="cs-field"><span>Your name</span><input type="text" data-cs-name placeholder="Jane Smith" /></label>' +
    '        <label class="cs-field"><span>Email</span><input type="email" data-cs-email placeholder="you@email.com" /></label>' +
    '      </div>' +
    '      <label class="cs-field"><span>What is this about?</span><select data-cs-cat>' +
    '        <option>Billing question</option><option>Service issue</option><option>Reschedule a pickup</option>' +
    '        <option>Pause or cancel</option><option>Bulk / junk pickup</option><option>Something else</option>' +
    '      </select></label>' +
    '      <label class="cs-field"><span>How can we help?</span><textarea data-cs-message placeholder="Tell us what is going on..."></textarea></label>' +
    '      <button class="cs-btn cs-btn--primary" data-cs-send>Send message</button>' +
    '      <p class="cs-msg" data-cs-status role="status"></p>' +
    '    </div>' +
    '    <div class="cs-done" data-cs-done hidden>' +
    '      <div class="cs-check"><svg viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg></div>' +
    '      <h3>Message sent</h3><p class="cs-sub">We got it and will email you back shortly.</p>' +
    '      <button class="cs-btn cs-btn--primary" data-cs-close style="margin-top:10px">Done</button>' +
    '    </div>' +
    '  </div>' +
    '</div>';
  document.body.appendChild(host);

  var overlay = host.querySelector("[data-cs-overlay]");
  var formView = host.querySelector("[data-cs-form]");
  var doneView = host.querySelector("[data-cs-done]");
  var statusEl = host.querySelector("[data-cs-status]");
  var sendBtn = host.querySelector("[data-cs-send]");

  function open() {
    overlay.hidden = false; formView.hidden = false; doneView.hidden = true;
    statusEl.textContent = ""; statusEl.className = "cs-msg";
    var em = host.querySelector("[data-cs-email]");
    if (em && !em.value && window.__cc_email) em.value = window.__cc_email;
  }
  function close() { overlay.hidden = true; }

  overlay.addEventListener("click", function (e) { if (e.target === overlay) close(); });
  host.querySelectorAll("[data-cs-close]").forEach(function (b) { b.addEventListener("click", close); });

  sendBtn.addEventListener("click", function () {
    var name = (host.querySelector("[data-cs-name]").value || "").trim();
    var email = (host.querySelector("[data-cs-email]").value || "").trim();
    var category = host.querySelector("[data-cs-cat]").value;
    var message = (host.querySelector("[data-cs-message]").value || "").trim();
    if (email.indexOf("@") === -1) { statusEl.className = "cs-msg err"; statusEl.textContent = "Enter a valid email."; return; }
    if (message.length < 3) { statusEl.className = "cs-msg err"; statusEl.textContent = "Tell us a bit more."; return; }
    sendBtn.disabled = true; statusEl.className = "cs-msg ok"; statusEl.textContent = "Sending...";
    fetch(FN, {
      method: "POST",
      headers: { "Content-Type": "application/json", "apikey": ANON, "Authorization": "Bearer " + ANON },
      body: JSON.stringify({ name: name, email: email, category: category, message: message, page: location.pathname })
    }).then(function (r) { return r.json(); }).then(function (res) {
      sendBtn.disabled = false;
      if (res && res.ok) { formView.hidden = true; doneView.hidden = false; }
      else { statusEl.className = "cs-msg err"; statusEl.textContent = "Could not send. Please try again."; }
    }).catch(function () {
      sendBtn.disabled = false; statusEl.className = "cs-msg err"; statusEl.textContent = "Could not send. Please try again.";
    });
  });

  window.openSupport = open;
  document.addEventListener("click", function (e) {
    var t = e.target.closest("[data-support]");
    if (t) { e.preventDefault(); open(); }
  });
})();
