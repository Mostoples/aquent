/* Probe audit layout mobile — dijalankan di dalam halaman oleh serve.cjs
   saat request memuat ?__audit=1. Hasil ditulis ke document.title. */
(function () {
  function sel(el) {
    if (!el || el === document.body) return 'body';
    var s = el.tagName.toLowerCase();
    if (el.id) return s + '#' + el.id;
    if (el.className && typeof el.className === 'string') {
      var c = el.className.trim().split(/\s+/).slice(0, 2).join('.');
      if (c) s += '.' + c;
    }
    return s;
  }

  var docW = document.documentElement.clientWidth;
  var res = {
    viewport: docW,
    scrollW: document.documentElement.scrollWidth,
    overflowPx: Math.max(0, document.documentElement.scrollWidth - docW),
    wideEls: [],
    smallText: [],
    smallTaps: []
  };

  var all = document.querySelectorAll('*');
  var seenWide = {}, seenText = {}, seenTap = {};

  for (var i = 0; i < all.length; i++) {
    var el = all[i];
    var cs;
    try { cs = getComputedStyle(el); } catch (e) { continue; }
    if (!cs || cs.display === 'none' || cs.visibility === 'hidden' || cs.opacity === '0') continue;

    var r = el.getBoundingClientRect();
    if (r.width === 0 && r.height === 0) continue;

    // 1) Elemen melewati batas kanan viewport (penyebab horizontal scroll).
    if (r.right > docW + 1.5 && r.width > 24) {
      var k = sel(el);
      if (!seenWide[k]) {
        seenWide[k] = 1;
        res.wideEls.push({ el: k, right: Math.round(r.right), w: Math.round(r.width) });
      }
    }

    // 2) Teks < 12px (hanya elemen dengan teks langsung).
    var hasText = false;
    for (var n = 0; n < el.childNodes.length; n++) {
      var cn = el.childNodes[n];
      if (cn.nodeType === 3 && cn.textContent.trim().length > 1) { hasText = true; break; }
    }
    if (hasText) {
      var fsz = parseFloat(cs.fontSize);
      if (fsz && fsz < 12) {
        var k2 = sel(el) + '@' + fsz;
        if (!seenText[k2]) {
          seenText[k2] = 1;
          res.smallText.push({ el: sel(el), px: Math.round(fsz * 10) / 10 });
        }
      }
    }

    // 3) Target sentuh < 44x44 px.
    //
    // Catatan: area sentuh dapat diperluas lewat pseudo-element ::after
    // transparan (teknik umum agar ukuran VISUAL ikon tetap kecil namun area
    // tekan memenuhi 44px). Karena getBoundingClientRect() tidak menghitung
    // pseudo-element, ukuran ::after diperiksa terpisah lalu diambil yang
    // terbesar sebagai area sentuh EFEKTIF.
    var tag = el.tagName.toLowerCase();

    // Hanya KONTROL SEJATI yang dinilai. Sebelumnya `cursor:pointer` dipakai
    // sebagai penanda, tetapi properti itu diwarisi sehingga setiap <i>, <svg>,
    // <path>, dan <span> di dalam tombol ikut terhitung dan memunculkan
    // false positive (mis. "i.ph.ph-list 16x16" padahal tombol induknya
    // sudah 44px). Kini elemen dianggap kontrol bila merupakan tag interaktif
    // atau memiliki handler/role eksplisit.
    var isControlTag = tag === 'button' || tag === 'a' || tag === 'select' ||
      tag === 'textarea' || tag === 'summary' || tag === 'label' ||
      (tag === 'input' && ['button', 'submit', 'checkbox', 'radio', 'file'].indexOf(el.type) !== -1);
    var hasHandler = el.hasAttribute('onclick') ||
      el.getAttribute('role') === 'button' ||
      el.hasAttribute('tabindex');
    var clickable = isControlTag || hasHandler;

    // Kontrol yang bersarang di dalam kontrol lain dilewati: area sentuh
    // efektif ditentukan oleh kontrol terluar.
    if (clickable && el.parentElement) {
      var anc = el.parentElement;
      while (anc && anc !== document.body) {
        var at = anc.tagName.toLowerCase();
        if (at === 'button' || at === 'a' || at === 'label' || at === 'summary') {
          clickable = false;
          break;
        }
        anc = anc.parentElement;
      }
    }

    if (clickable && r.width > 0) {
      var ew = r.width, eh = r.height;
      try {
        var af = getComputedStyle(el, '::after');
        if (af && af.content && af.content !== 'none') {
          var aw = parseFloat(af.width), ah = parseFloat(af.height);
          // Hanya hitung bila ::after benar-benar melebarkan area tekan.
          if (!isNaN(aw) && aw > ew) ew = aw;
          if (!isNaN(ah) && ah > eh) eh = ah;
        }
      } catch (e) { /* abaikan bila pseudo tak terbaca */ }

      if (ew < 44 || eh < 44) {
        var k3 = sel(el);
        if (!seenTap[k3]) {
          seenTap[k3] = 1;
          res.smallTaps.push({ el: k3, w: Math.round(ew), h: Math.round(eh) });
        }
      }
    }
  }

  res.wideEls = res.wideEls.slice(0, 14);
  res.smallText = res.smallText.slice(0, 14);
  res.smallTaps = res.smallTaps.slice(0, 14);

  document.title = 'AUDIT::' + JSON.stringify(res);
})();
