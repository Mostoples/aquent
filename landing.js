/* =====================================================
   AQUENT — Landing page interactions
   - Nav scroll state (floating pill shadow)
   - Scroll-reveal (IntersectionObserver)
   - Animated number counters
   - Mobile menu toggle
   - Hero mock live "ticker" (cosmetic)
   ===================================================== */
(function () {
  'use strict';

  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---- Nav scroll state ---- */
  var nav = document.getElementById('topnav');
  function onScroll() {
    if (!nav) return;
    if (window.scrollY > 24) nav.classList.add('scrolled');
    else nav.classList.remove('scrolled');
  }
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  /* ---- Mobile menu ---- */
  window.toggleMobileMenu = function () {
    var m = document.getElementById('mobileMenu');
    if (m) m.classList.toggle('open');
  };
  document.querySelectorAll('#mobileMenu a').forEach(function (a) {
    a.addEventListener('click', function () {
      var m = document.getElementById('mobileMenu');
      if (m) m.classList.remove('open');
    });
  });

  /* ---- Scroll reveal ---- */
  var revealEls = [].slice.call(document.querySelectorAll('.reveal'));
  if (reduce || !('IntersectionObserver' in window)) {
    revealEls.forEach(function (el) { el.classList.add('in'); });
  } else {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (e.isIntersecting) {
          e.target.classList.add('in');
          io.unobserve(e.target);
        }
      });
    }, { threshold: 0.12, rootMargin: '0px 0px -40px 0px' });
    revealEls.forEach(function (el) { io.observe(el); });
  }

  /* ---- Animated counters ---- */
  function animateCount(el) {
    var target = parseFloat(el.getAttribute('data-count'));
    var suffix = el.getAttribute('data-suffix') || '';
    var prefix = el.getAttribute('data-prefix') || '';
    var decimals = (String(target).split('.')[1] || '').length;
    if (reduce) { el.textContent = prefix + target.toLocaleString('id-ID') + suffix; return; }
    var dur = 1400, start = null;
    function step(ts) {
      if (!start) start = ts;
      var p = Math.min((ts - start) / dur, 1);
      var eased = 1 - Math.pow(1 - p, 3);
      var val = target * eased;
      el.textContent = prefix + (decimals
        ? val.toFixed(decimals)
        : Math.round(val).toLocaleString('id-ID')) + suffix;
      if (p < 1) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
  }
  var counters = [].slice.call(document.querySelectorAll('[data-count]'));
  if (!('IntersectionObserver' in window)) {
    counters.forEach(animateCount);
  } else {
    var co = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (e.isIntersecting) { animateCount(e.target); co.unobserve(e.target); }
      });
    }, { threshold: 0.6 });
    counters.forEach(function (el) { co.observe(el); });
  }

  /* ---- Hero mock cosmetic ticker ---- */
  var phRing = document.querySelector('.hm-ring');
  if (phRing && !reduce) {
    var scores = [92, 88, 95, 90, 86, 93];
    var i = 0;
    setInterval(function () {
      i = (i + 1) % scores.length;
      var s = scores[i];
      phRing.style.setProperty('--val', s);
      var num = phRing.querySelector('.hm-ring__num');
      if (num) num.textContent = s;
    }, 2600);
  }

  /* ---- Year in footer ---- */
  var y = document.getElementById('footYear');
  if (y) y.textContent = new Date().getFullYear();
})();
