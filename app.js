/* =====================================================
   AQUENT — app.js  v3.0
   PROGRAMMER tab — sesuai PLANNING_PROGRAMMER.md
   ===================================================== */

// =====================================================
// THRESHOLDS (dari data/thresholds.json)
// =====================================================
let TH = null; // diisi saat DOMContentLoaded

async function loadThresholds() {
  try {
    const res = await fetch('data/thresholds.json');
    TH = await res.json();
  } catch (e) {
    // fallback inline (WHO/SNI defaults)
    TH = {
      ph:        { min:6.5, max:8.5, optimal_min:6.5, optimal_max:7.5, weight_xai:0.35, unit:'pH' },
      temp:      { min:33,  max:40,  optimal_min:36,  optimal_max:38,  weight_xai:0.35, unit:'°C' },
      turbidity: { min:0,   max:1,   optimal_min:0,   optimal_max:0.5, weight_xai:0.30, unit:'NTU' },
    };
  }
}

// =====================================================
// STATE
// =====================================================
const state = {
  sensor:   { ph:7.2, temperature:38, turbidity:0.3, tds:180, chlorine:0.3 }, // turbidity in NTU, tds in ppm, chlorine in mg/L
  prev:     { ph:7.2, temperature:38, turbidity:0.3, tds:180, chlorine:0.3 },
  controls: { recirculation:false, filter:true, eco:false, heating:true },
  session:  { usage:0, duration:0, saved:0, startTime:null, lastSavedAt:0 },
  reminders: [],
  skinType:  'normal',
  userName:  '',
  waterGoal: 10,
  db:        null,
  connected: false,
  demoMode:  false,
  transitioning: false,
  obStep:    1,
  scanStream: null,
  scanTimer:  null,
};

// =====================================================
// FIREBASE
// =====================================================
function initFirebase() {
  try {
    firebase.app();
    state.db = firebase.database();
    state.db.ref('.info/connected').on('value', snap => {
      const ok = !!snap.val();
      state.connected = ok;
      setStatus(ok ? 'connected' : 'disconnected', ok ? 'Terhubung' : 'Terputus');
      if (ok) subscribeDB();
    });
  } catch (e) {
    console.warn('Firebase unavailable — demo mode:', e.message);
    startDemoMode();
  }
}

function subscribeDB() {
  state.db.ref('sensors').on('value', snap => {
    const d = snap.val(); if (!d) return;
    state.prev = { ...state.sensor };
    Object.assign(state.sensor, {
      ph:          d.ph          ?? state.sensor.ph,
      temperature: d.temperature ?? state.sensor.temperature,
      turbidity:   d.turbidity   ?? state.sensor.turbidity,
      tds:         d.tds         ?? state.sensor.tds,
      chlorine:    d.chlorine    ?? state.sensor.chlorine,
    });
    renderSensors();
    renderQualityScore();
    updateAIContext();
  });
  state.db.ref('session').on('value', snap => {
    if (snap.val()) { Object.assign(state.session, snap.val()); renderSession(); }
  });
  state.db.ref('controls').on('value', snap => {
    if (snap.val()) { Object.assign(state.controls, snap.val()); syncToggles(); }
  });
  state.db.ref('reminders').once('value', snap => {
    const d = snap.val();
    if (d) { state.reminders = Object.entries(d).map(([id,v]) => ({...v, id})); renderReminders(); }
  });
  // Announcements broadcast (admin → users)
  state.db.ref('announcements').orderByChild('createdAt').limitToLast(5).on('value', snap => {
    const d = snap.val(); if (!d) return;
    const items = Object.entries(d).map(([id,a]) => ({ id, ...a }))
      .sort((a,b) => (b.createdAt||0) - (a.createdAt||0));
    renderAnnouncementBanner(items[0]); // Tampilkan yang terbaru
  });
}

function renderAnnouncementBanner(ann) {
  if (!ann || !ann.title) return;
  const dismissed = JSON.parse(localStorage.getItem('aquent-dismissed-anns') || '[]');
  if (dismissed.includes(ann.id)) return;

  // Hapus banner lama dulu
  document.getElementById('annBanner')?.remove();

  const colors = { info:'#48cae4', warning:'#f0c040', success:'#4ade80', urgent:'#ff6b6b' };
  const color  = colors[ann.type] || colors.info;
  const banner = document.createElement('div');
  banner.id = 'annBanner';
  banner.style.cssText = `position:fixed;top:64px;left:50%;transform:translateX(-50%);z-index:150;
    max-width:560px;width:calc(100% - 32px);padding:12px 14px;
    background:${color}22;border:1px solid ${color}66;border-radius:12px;
    backdrop-filter:blur(20px);display:flex;align-items:flex-start;gap:10px;
    animation:sEnter .3s ease`;
  banner.innerHTML = `
    <div style="width:8px;height:8px;border-radius:50%;background:${color};margin-top:6px;flex-shrink:0;box-shadow:0 0 8px ${color}"></div>
    <div style="flex:1;min-width:0">
      <div style="font-size:.86rem;font-weight:600;color:${color}">${escHtml(ann.title)}</div>
      <div style="font-size:.78rem;color:var(--txt2);margin-top:2px">${escHtml(ann.body || '')}</div>
    </div>
    <button onclick="dismissAnnouncement('${ann.id}')" style="background:none;border:none;color:var(--txt3);cursor:pointer;font-size:1rem;padding:2px"><i class="ph ph-x"></i></button>
  `;
  document.body.appendChild(banner);
}

function dismissAnnouncement(id) {
  const d = JSON.parse(localStorage.getItem('aquent-dismissed-anns') || '[]');
  if (!d.includes(id)) d.push(id);
  localStorage.setItem('aquent-dismissed-anns', JSON.stringify(d.slice(-50)));
  document.getElementById('annBanner')?.remove();
}

function dbSet(path, value) { if (state.db && state.connected) state.db.ref(path).set(value); }

// =====================================================
// DEMO MODE
// =====================================================
function startDemoMode() {
  state.demoMode = true;
  state.session.startTime = Date.now();
  state.session.lastSavedAt = 0;
  setStatus('demo', 'Demo Mode');
  simTick();
  setInterval(simTick, 3000);
}

function drift(v, lo, hi, d) { return Math.max(lo, Math.min(hi, v + (Math.random() - .5) * d)); }

function simTick() {
  state.prev = { ...state.sensor };
  state.sensor.ph          = +drift(state.sensor.ph,          5.8, 9.0, .18).toFixed(1);
  state.sensor.temperature = +drift(state.sensor.temperature, 28,  48,  .6).toFixed(1);
  state.sensor.turbidity   = +drift(state.sensor.turbidity,   0.05, 1.8, .05).toFixed(2);
  state.sensor.tds         = +drift(state.sensor.tds,         50,  350, 6).toFixed(0);
  state.sensor.chlorine    = +drift(state.sensor.chlorine,    0.05, 0.8, .04).toFixed(2);
  const min = (Date.now() - state.session.startTime) / 60000;
  state.session.duration = +min.toFixed(1);
  state.session.usage    = +(min * 10).toFixed(1);
  state.session.saved    = +(min * (state.controls.recirculation ? 4 : .5)).toFixed(1);
  renderSensors();
  renderSession();
  renderQualityScore();
  updateAIContext();

  // Auto-save sesi tiap 5 menit (untuk demo & live data)
  const elapsedMin = state.session.duration;
  const sinceLastSave = elapsedMin - (state.session.lastSavedAt || 0);
  if (elapsedMin >= 5 && sinceLastSave >= 5) {
    saveCurrentSession();
    state.session.lastSavedAt = elapsedMin;
  }
}

// =====================================================
// STATUS
// =====================================================
function setStatus(type, label) {
  state.connStatus = type;
  const dot  = document.getElementById('statusDot');
  const text = document.getElementById('statusText');
  if (dot)  dot.className  = 'conn-dot ' + type;
  if (text) {
    text.removeAttribute('data-i18n'); // dikontrol manual dari sini
    const key = { connected:'hdr.connected', disconnected:'hdr.disconnected', demo:'hdr.demo' }[type];
    text.textContent = key ? _st2(key, label) : label;
  }
}

// =====================================================
// SENSOR RENDERING
// =====================================================
function renderSensors() {
  const { ph, temperature: t, turbidity: turb } = state.sensor;
  const { ph: pp, temperature: pt, turbidity: pturb } = state.prev;

  animateGauge('ph',   ph,   0,  14,  phColor(ph));
  animateGauge('temp', t,    0,  60,  tColor(t));
  animateGauge('turb', turb, 0,  2.0, turbColor(turb));

  setBadge('phBadge',   phStatus(ph));
  setBadge('tempBadge', tStatus(t));
  setBadge('turbBadge', turbStatus(turb));

  setTrend('phTrend',   ph,   pp);
  setTrend('tempTrend', t,    pt);
  setTrend('turbTrend', turb, pturb);

  setText('dgPH',   ph);
  setText('dgTemp', t + '°C');
  setText('dgTurb', turb + ' NTU');

  renderGuideFromJSON();
}

function animateGauge(id, value, min, max, color) {
  const arc = document.getElementById(id + 'Arc');
  const val = document.getElementById(id + 'Value');
  if (!arc || !val) return;
  const ratio = Math.max(0, Math.min(1, (value - min) / (max - min)));
  arc.style.strokeDashoffset = 251 * (1 - ratio);
  arc.style.stroke = color;
  const prev = parseFloat(val.dataset.prev ?? value);
  val.dataset.prev = value;
  animateNumber(val, prev, value, 800);
}

function animateNumber(el, from, to, dur) {
  const start = performance.now();
  const isFloat = !Number.isInteger(to) || String(to).includes('.');
  function frame(now) {
    const t = Math.min((now - start) / dur, 1);
    const ease = t < .5 ? 2*t*t : -1+(4-2*t)*t;
    const v = from + (to - from) * ease;
    el.textContent = isFloat ? v.toFixed(to < 5 ? 2 : 1) : Math.round(v);
    if (t < 1) requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}

function setBadge(id, s) {
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent = s.label;
  el.className = 'badge' + (s.cls ? ' ' + s.cls : '');
}

function setTrend(id, cur, prev) {
  const el = document.getElementById(id);
  if (!el) return;
  const arrow = el.querySelector('.t-arrow');
  const txt   = el.querySelector('.t-txt');
  const d = cur - prev;
  if (Math.abs(d) < .06) {
    arrow.textContent = '→'; txt.textContent = _st2('trend.stable','Stabil'); el.style.color = 'var(--txt3)';
  } else if (d > 0) {
    arrow.textContent = '↑'; txt.textContent = _st2('trend.up','Naik');   el.style.color = 'var(--warn)';
  } else {
    arrow.textContent = '↓'; txt.textContent = _st2('trend.down','Turun');  el.style.color = 'var(--pri)';
  }
}
function _st2(key, fb) { return (typeof t === 'function') ? t(key) : fb; }

function setText(id, v) { const e = document.getElementById(id); if (e) e.textContent = v; }

// =====================================================
// STATUS HELPERS
// =====================================================
function phColor(v)   {
  if (!TH) return '#00b4d8';
  return v < TH.ph.min || v > TH.ph.max ? '#ff6b6b'
       : v < TH.ph.optimal_min || v > TH.ph.optimal_max ? '#fdcb6e'
       : '#00b4d8';
}
function tColor(v)    {
  if (!TH) return '#ff9f9f';
  return v < TH.temp.min || v > TH.temp.max ? '#ff6b6b'
       : v < TH.temp.optimal_min || v > TH.temp.optimal_max ? '#fdcb6e'
       : '#ff9f9f';
}
function turbColor(v) {
  if (!TH) return '#caf0f8';
  return v > TH.turbidity.max ? '#ff6b6b'
       : v > TH.turbidity.optimal_max ? '#fdcb6e'
       : '#caf0f8';
}

function phStatus(v) {
  if (!TH) return { label:_st('status.normal') };
  return v < TH.ph.min - 1 || v > TH.ph.max + 1 ? { label:_st('status.danger'), cls:'danger' }
       : v < TH.ph.min || v > TH.ph.max           ? { label:_st('status.warn'), cls:'warn' }
       : v >= TH.ph.optimal_min && v <= TH.ph.optimal_max ? { label:_st('status.optimal') }
       : { label:_st('status.normal') };
}
function tStatus(v) {
  if (!TH) return { label:_st('status.normal') };
  return v < TH.temp.min - 5 || v > TH.temp.max + 5 ? { label:_st('status.danger'), cls:'danger' }
       : v < TH.temp.min || v > TH.temp.max           ? { label:_st('status.warn'), cls:'warn' }
       : v >= TH.temp.optimal_min && v <= TH.temp.optimal_max ? { label:_st('status.comfort') }
       : { label:_st('status.normal') };
}
function turbStatus(v) {
  if (!TH) return { label:_st('status.clear') };
  return v > TH.turbidity.max * 1.5 ? { label:_st('status.cloudy'), cls:'danger' }
       : v > TH.turbidity.max        ? { label:_st('status.medium'), cls:'warn' }
       : { label:_st('status.clear') };
}

// Helper i18n status (fallback ke ID kalau i18n.js belum load)
function _st(key) {
  const fb = {
    'status.normal':'Normal','status.danger':'Kritis','status.warn':'Perhatian',
    'status.optimal':'Optimal','status.comfort':'Nyaman','status.clear':'Jernih',
    'status.cloudy':'Keruh','status.medium':'Cukup',
  };
  return (typeof t === 'function') ? t(key) : (fb[key] || key);
}

// =====================================================
// SESSION
// =====================================================
function renderSession() {
  setText('todayUsage',     state.session.usage.toFixed(1) + ' L');
  setText('showerDuration', Math.round(state.session.duration) + ' mnt');
  setText('waterSaved',     state.session.saved.toFixed(1) + ' L');
}

// =====================================================
// WATER QUALITY SCORE ENGINE (P2) — XAI Panel
// =====================================================
function scoreParam(value, optimal_min, optimal_max, safe_min, safe_max) {
  if (value >= optimal_min && value <= optimal_max) return 100;
  if (value >= safe_min && value <= safe_max) {
    if (value < optimal_min && optimal_min > safe_min)
      return 50 + 50 * (value - safe_min) / (optimal_min - safe_min);
    if (value > optimal_max && safe_max > optimal_max)
      return 50 + 50 * (safe_max - value) / (safe_max - optimal_max);
    return 75;
  }
  const excess = value < safe_min ? safe_min - value : value - safe_max;
  return Math.max(0, 50 - excess * 25);
}

function scoreTurbidity(value) {
  if (!TH) return 75;
  const { optimal_max, max } = TH.turbidity;
  if (value <= optimal_max)  return 100;
  if (value <= max)          return 50 + 50 * (max - value) / (max - optimal_max);
  return Math.max(0, 50 - (value - max) * 50);
}

function calcQualityScore() {
  const { ph, temperature: t, turbidity } = state.sensor;
  const th = TH || {};
  const phT = th.ph  || { optimal_min:6.5, optimal_max:7.5, min:6.5, max:8.5, weight_xai:.35 };
  const tT  = th.temp || { optimal_min:36, optimal_max:38, min:33, max:40, weight_xai:.35 };
  const trT = th.turbidity || { optimal_max:.5, max:1, weight_xai:.30 };

  const phScore   = Math.round(scoreParam(ph, phT.optimal_min, phT.optimal_max, phT.min, phT.max));
  const tempScore = Math.round(scoreParam(t,  tT.optimal_min,  tT.optimal_max,  tT.min,  tT.max));
  const turbScore = Math.round(scoreTurbidity(turbidity));
  const total     = Math.min(100, Math.round(
    phScore * phT.weight_xai + tempScore * tT.weight_xai + turbScore * trT.weight_xai
  ));

  let grade, gradeColor;
  if (total >= 90)      { grade = 'A'; gradeColor = '#06d6a0'; }
  else if (total >= 75) { grade = 'B'; gradeColor = '#00b4d8'; }
  else if (total >= 60) { grade = 'C'; gradeColor = '#fdcb6e'; }
  else if (total >= 45) { grade = 'D'; gradeColor = '#fd8c6e'; }
  else                  { grade = 'F'; gradeColor = '#ff6b6b'; }

  return { total, grade, gradeColor, phScore, tempScore, turbScore };
}

function renderQualityScore() {
  const qs = calcQualityScore();
  const { total, grade, gradeColor, phScore, tempScore, turbScore } = qs;

  // Ring
  const circle = document.getElementById('qsCircle');
  if (circle) {
    circle.style.stroke = gradeColor;
    circle.style.strokeDashoffset = 339 * (1 - total / 100);
  }

  // Center text
  const numEl   = document.getElementById('qsValue');
  const gradeEl = document.getElementById('qsGrade');
  if (numEl) {
    const prev = parseFloat(numEl.dataset.prev ?? 0);
    numEl.dataset.prev = total;
    animateNumber(numEl, prev, total, 900);
  }
  if (gradeEl) { gradeEl.textContent = grade; gradeEl.style.fill = gradeColor; }

  // Label
  const labelEl = document.getElementById('qsLabel');
  if (labelEl) {
    const labels = { A:'Sangat Baik', B:'Baik', C:'Cukup', D:'Kurang', F:'Buruk' };
    labelEl.textContent = labels[grade] || '';
    labelEl.style.color = gradeColor;
  }

  // Factor bars
  const container = document.getElementById('qsFactorBars');
  if (container) {
    const { ph, temperature, turbidity } = state.sensor;
    container.innerHTML = [
      { label:`pH ${ph}`, score: phScore,   ref:'Referensi: 6.5–7.5 (WHO)' },
      { label:`Suhu ${temperature}°C`, score: tempScore, ref:'Referensi: 36–38°C (JEADV)' },
      { label:`Kekeruhan ${turbidity} NTU`, score: turbScore, ref:'Referensi: ≤0.5 NTU (WHO)' },
    ].map(f => `
      <div class="factor-row">
        <span class="factor-name">${f.label}</span>
        <div class="factor-track">
          <div class="factor-bar" style="width:${f.score}%;background:${f.score>=75?'#06d6a0':f.score>=50?'#fdcb6e':'#ff6b6b'}"></div>
        </div>
        <span class="factor-pct">${f.score}%</span>
        <span class="factor-ref">${f.ref}</span>
      </div>`).join('');
  }

  // XAI detail
  const xaiEl = document.getElementById('qsXaiDetail');
  if (xaiEl) xaiEl.textContent = buildQsXAI(total, phScore, tempScore, turbScore);
}

function buildQsXAI(total, phScore, tempScore, turbScore) {
  const { ph, temperature, turbidity } = state.sensor;
  const parts = [];
  if (phScore < 75) {
    const msg = ph < 6.5
      ? `pH air ${ph} bersifat asam, dapat mengganggu lapisan pelindung kulit (skin barrier) dan memicu iritasi pada kulit sensitif.`
      : `pH air ${ph} bersifat basa, dapat mengurangi kelembapan alami kulit dan memperburuk kondisi kulit kering.`;
    parts.push(msg);
  }
  if (tempScore < 75) {
    const msg = temperature < 36
      ? `Suhu ${temperature}°C terlalu dingin — optimal 36–38°C. Air dingin mengurangi efektivitas pembersihan kulit.`
      : `Suhu ${temperature}°C terlalu panas. Air panas merusak lapisan lipid kulit dan meningkatkan kehilangan air transepidermal (TEWL).`;
    parts.push(msg);
  }
  if (turbScore < 75) {
    parts.push(`Kekeruhan ${turbidity} NTU melebihi batas optimal WHO (≤0.5 NTU). Partikel tersuspensi dapat menyumbat pori-pori dan membawa kontaminan.`);
  }
  if (!parts.length) {
    return `Semua parameter dalam rentang optimal. pH ${ph} aman untuk kulit (WHO 6.5–7.5), suhu ${temperature}°C nyaman (JEADV 36–38°C), dan kekeruhan ${turbidity} NTU jernih (WHO ≤0.5 NTU).`;
  }
  return parts.join(' ');
}

function initQualityScoreXAI() {
  const btn    = document.getElementById('qsXaiBtn');
  const detail = document.getElementById('qsXaiDetail');
  if (!btn || !detail) return;
  btn.addEventListener('click', () => {
    const open = detail.style.display === 'block';
    detail.style.display = open ? 'none' : 'block';
    btn.textContent = (open ? '▶ ' : '▼ ') + 'Kenapa skor ini?';
  });
}

// =====================================================
// DERMAL GUIDE
// =====================================================
const GUIDE = {
  normal: {
    ok:   [
      { t:'Bilas dengan Air Hangat', d:'Gunakan 37-39°C untuk membuka pori dan membersihkan kotoran secara efektif.' },
      { t:'Sabun pH Netral', d:'Pilih produk dengan pH 5.5-7 untuk menjaga keseimbangan alami kulit.' },
      { t:'Bilas Akhir Air Dingin', d:'Semprot air dingin 30 detik untuk menutup pori dan mengunci kelembapan.' },
      { t:'Keringkan dengan Lembut', d:'Tepuk-tepuk kulit — jangan digosok — untuk menjaga lapisan pelindung.' },
    ],
    warn: [
      { t:'Kondisi Air Kurang Ideal', d:'Gunakan filter dan produk penetral pH untuk melindungi kulit.' },
      { t:'Batasi Waktu Mandi', d:'Maksimal 8 menit untuk meminimalkan paparan air yang tidak ideal.' },
      { t:'Pelembap Ekstra', d:'Aplikasikan pelembap segera setelah mandi untuk menjaga skin barrier.' },
    ],
  },
  sensitive: {
    ok:   [
      { t:'Suhu Lebih Rendah', d:'Gunakan 33-36°C — kulit sensitif rentan iritasi akibat air panas.' },
      { t:'Produk Bebas Pewangi', d:'Pilih sabun hypoallergenic bebas alkohol dan pewangi sintetis.' },
      { t:'Mandi Singkat 5-8 Menit', d:'Durasi pendek menjaga minyak alami kulit sensitif tetap utuh.' },
      { t:'Teknik Soak & Seal', d:'Aplikasikan pelembap dalam 3 menit setelah mandi saat kulit masih lembap.' },
    ],
    warn: [
      { t:'Risiko Iritasi Tinggi', d:'Kondisi air saat ini berisiko memicu reaksi. Aktifkan Filter System.' },
      { t:'Persingkat Mandi', d:'Maksimal 5 menit dengan suhu sedingin yang masih nyaman.' },
      { t:'Hindari Menggosok', d:'Tepuk kulit sangat lembut dan gunakan kain microfiber.' },
    ],
  },
  oily: {
    ok:   [
      { t:'Air Hangat untuk Pori', d:'38-40°C membantu melarutkan kelebihan minyak dan membersihkan pori.' },
      { t:'Gel Cleanser Salicylic Acid', d:'Gunakan pembersih mengandung salicylic acid untuk mengontrol sebum.' },
      { t:'Bilas Tuntas', d:'Pastikan tidak ada residu sabun — residu memicu produksi minyak berlebih.' },
      { t:'Toner Penyeimbang', d:'Aplikasikan toner berbasis air setelah mandi untuk menyeimbangkan kadar minyak.' },
    ],
    warn: [
      { t:'pH Asam Tingkatkan Minyak', d:'Air dengan pH rendah merangsang produksi sebum berlebih. Gunakan penetral pH.' },
      { t:'Bilas Lebih Teliti', d:'Bilas wajah dan tubuh lebih lama untuk menghilangkan residu.' },
    ],
  },
  dry: {
    ok:   [
      { t:'Suhu Lebih Rendah', d:'35-37°C — air terlalu panas menghilangkan minyak alami kulit kering.' },
      { t:'Mandi 5-7 Menit', d:'Durasi singkat mencegah kulit semakin kering dan dehidrasi.' },
      { t:'Sabun Cream/Oil-Based', d:'Pilih sabun krim mengandung glycerin atau shea butter.' },
      { t:'Pelembap Segera & Berlimpah', d:'Aplikasikan body cream tebal dalam 2-3 menit setelah mandi (soak & seal).' },
    ],
    warn: [
      { t:'Kondisi Berisiko untuk Kulit Kering', d:'Perparah kekeringan. Kurangi suhu, aktifkan filter, dan persingkat mandi.' },
      { t:'Double-Layer Pelembap', d:'Gunakan serum lembapan diikuti cream tebal untuk melindungi skin barrier.' },
    ],
  },
};

function renderGuide() {
  const { ph, temperature: t, turbidity } = state.sensor;
  const ok   = TH
    ? ph>=TH.ph.min && ph<=TH.ph.max && t>=TH.temp.min && t<=TH.temp.max && turbidity<=TH.turbidity.max
    : ph>=6.5 && ph<=8.5 && t>=33 && t<=40 && turbidity<=1;
  const crit = TH
    ? ph<TH.ph.min-1 || ph>TH.ph.max+1 || t>TH.temp.max+5 || turbidity>TH.turbidity.max*2
    : ph<5.5 || ph>9.5 || t>48 || turbidity>2;

  const alertEl = document.getElementById('guideAlert');
  const stepsEl = document.getElementById('guideSteps');
  if (!alertEl || !stepsEl) return;

  alertEl.style.display = 'block';
  if (crit) {
    alertEl.className = 'guide-alert danger';
    alertEl.textContent = '⚠ Kondisi air tidak aman! Tunda mandi dan periksa sistem filter.';
  } else if (!ok) {
    alertEl.className = 'guide-alert warning';
    alertEl.textContent = '💡 Kondisi air kurang ideal — lihat rekomendasi di bawah.';
  } else {
    alertEl.className = 'guide-alert ok';
    alertEl.textContent = '✓ Kondisi air optimal untuk mandi sehat!';
  }

  const g = GUIDE[state.skinType] || GUIDE.normal;
  stepsEl.innerHTML = '';
  (ok ? g.ok : g.warn).forEach((s, i) => {
    const div = document.createElement('div');
    div.className = 'guide-step';
    div.style.animationDelay = (i * .07) + 's';
    div.innerHTML = `<div class="step-num">${i+1}</div><div class="step-body"><h4>${s.t}</h4><p>${s.d}</p></div>`;
    stepsEl.appendChild(div);
  });
}

// =====================================================
// ECO CHART
// =====================================================
let ecoChart = null;
const DAILY  = { labels:['00','03','06','09','12','15','18','21'], data:[0,0,18,12,0,8,22,0] };
const WEEKLY = { labels:['Sen','Sel','Rab','Kam','Jum','Sab','Min'], data:[42,38,45,31,40,55,25] };

/**
 * Ukuran font untuk label grafik, disesuaikan lebar layar.
 *
 * Label Chart.js digambar ke <canvas> sehingga TIDAK dapat diatur lewat CSS —
 * ukurannya harus ditentukan di sini. Pada layar sempit angka 10–11px sulit
 * dibaca, jadi dinaikkan ke minimum 12px agar konsisten dengan aturan
 * keterbacaan pada style.css.
 *
 * @param {number} [base=11] Ukuran dasar untuk layar lebar.
 * @returns {number} Ukuran font dalam px.
 */
function chartFontSize(base = 11) {
  const narrow = typeof window !== 'undefined' &&
    window.matchMedia && window.matchMedia('(max-width: 480px)').matches;
  return narrow ? Math.max(12, base) : base;
}

/**
 * Warna grafik mengikuti tema aktif.
 *
 * Nilainya dibaca dari CSS custom property pada <html> sehingga grafik
 * otomatis benar di tema medical (teks gelap, garis kisi biru tipis)
 * maupun mode gelap — tanpa daftar warna terpisah di JS.
 *
 * @returns {{ink:string, grid:string}} Warna label sumbu dan garis kisi.
 */
function chartTheme() {
  const cs = getComputedStyle(document.documentElement);
  const pick = (name, fallback) => (cs.getPropertyValue(name) || '').trim() || fallback;
  return {
    ink:  pick('--txt3', '#7791a6'),
    grid: pick('--border', '#e4edf5'),
  };
}

function initChart() {
  const ctx = document.getElementById('ecoChart');
  if (!ctx || ecoChart) return;
  ecoChart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: DAILY.labels,
      datasets: [{ label:'Konsumsi (L)', data:DAILY.data,
        backgroundColor: c => c.raw > 20 ? 'rgba(0,119,182,.75)' : 'rgba(0,180,216,.45)',
        borderColor:     c => c.raw > 20 ? '#0077b6' : '#00b4d8',
        borderWidth:1.5, borderRadius:8, borderSkipped:false }],
    },
    options: {
      responsive:true, maintainAspectRatio:false,
      animation:{ duration:800, easing:'easeInOutQuart' },
      plugins:{
        legend:{display:false},
        tooltip:{ callbacks:{ label:c=>` ${c.raw} Liter` }, backgroundColor:'rgba(0,20,50,.9)',
          titleColor:'#caf0f8', bodyColor:'#fff', cornerRadius:10, padding:12 },
      },
      scales:{
        x:{ grid:{display:false}, ticks:{color:chartTheme().ink,font:{size:chartFontSize(11)}} },
        y:{ grid:{color:chartTheme().grid}, ticks:{color:chartTheme().ink,font:{size:chartFontSize(11)},callback:v=>v+'L'}, beginAtZero:true },
      },
    },
  });
}

function switchChart(type) {
  if (!ecoChart) return;
  const d = type === 'daily' ? DAILY : WEEKLY;
  ecoChart.data.labels = d.labels;
  ecoChart.data.datasets[0].data = d.data;
  ecoChart.update();
}

// =====================================================
// CONTROLS
// =====================================================
function initControls() {
  bindToggle('recircToggle', 'recirculation', 'recirc-card',
    on => addLog(on ? 'Recirculation Mode aktif — hemat 40%' : 'Recirculation Mode nonaktif', on ? 'ok' : 'info'));
  bindToggle('filterToggle', 'filter', 'filter-card',
    on => addLog(on ? 'Filter System aktif' : 'Filter System dinonaktifkan', on ? 'ok' : 'warning'));
  bindToggle('ecoToggle',    'eco',    'eco-card',
    on => addLog(on ? 'Eco Mode aktif — aliran dibatasi 8 L/mnt' : 'Eco Mode nonaktif', on ? 'ok' : 'info'));
  bindToggle('heatToggle',   'heating','heat-card',
    on => addLog(on ? 'Smart Heating aktif' : 'Smart Heating nonaktif', on ? 'ok' : 'info'));
  ['recirc-card','filter-card','eco-card','heat-card'].forEach((id, i) => {
    setCardOn(id, state.controls[['recirculation','filter','eco','heating'][i]]);
  });
}

function bindToggle(inputId, key, cardId, cb) {
  const el = document.getElementById(inputId);
  if (!el) return;
  el.checked = state.controls[key];
  el.addEventListener('change', e => {
    state.controls[key] = e.target.checked;
    dbSet('controls/' + key, e.target.checked);
    setCardOn(cardId, e.target.checked);
    cb(e.target.checked);
  });
}

function setCardOn(id, on) { document.getElementById(id)?.classList.toggle('on', on); }
function syncToggles() {
  [['recircToggle','recirculation'],['filterToggle','filter'],['ecoToggle','eco'],['heatToggle','heating']]
    .forEach(([id,k]) => { const el = document.getElementById(id); if (el) el.checked = state.controls[k]; });
}

function addLog(msg, type = 'info') {
  const list = document.getElementById('systemLog');
  if (!list) return;
  const now  = new Date();
  const time = now.getHours().toString().padStart(2,'0') + ':' + now.getMinutes().toString().padStart(2,'0');
  const li   = document.createElement('li');
  li.className = 'log-item ' + type;
  li.innerHTML = `<span class="log-time">${time}</span><span class="log-msg">${msg}</span>`;
  list.insertBefore(li, list.firstChild);
  while (list.children.length > 25) list.removeChild(list.lastChild);
}

// =====================================================
// SCHEDULER
// =====================================================
function initScheduler() {
  document.querySelectorAll('.day-btn').forEach(b => b.addEventListener('click', () => b.classList.toggle('active')));
  document.getElementById('addReminder')?.addEventListener('click', addRippleAndReminder);
  state.reminders = [
    { id:'d1', time:'06:30', label:'Mandi Pagi',  days:['Sen','Sel','Rab','Kam','Jum'] },
    { id:'d2', time:'19:00', label:'Mandi Malam', days:['Sen','Sel','Rab','Kam','Jum','Sab','Min'] },
  ];
  renderReminders();
}

function addRippleAndReminder(e) {
  const btn = e.currentTarget;
  const r   = document.createElement('span');
  r.className = 'ripple';
  const rect = btn.getBoundingClientRect();
  const size = Math.max(rect.width, rect.height);
  r.style.cssText = `width:${size}px;height:${size}px;left:${e.clientX-rect.left-size/2}px;top:${e.clientY-rect.top-size/2}px`;
  btn.appendChild(r);
  setTimeout(() => r.remove(), 600);
  addReminder();
}

function addReminder() {
  const time  = document.getElementById('reminderTime')?.value;
  const label = document.getElementById('reminderLabel')?.value.trim() || 'Mandi';
  const days  = [...document.querySelectorAll('.day-btn.active')].map(b => b.dataset.day);
  if (!time)        { document.getElementById('reminderTime')?.focus(); return; }
  if (!days.length) { uiToast('Pilih setidaknya satu hari.', 'warn'); return; }
  const id  = 'r' + Date.now();
  const rem = { id, time, label, days };
  if (state.connected && state.db) {
    const ref = state.db.ref('reminders').push();
    ref.set({ time, label, days });
    rem.id = ref.key;
  }
  state.reminders.push(rem);
  renderReminders();
  document.getElementById('reminderTime').value  = '';
  document.getElementById('reminderLabel').value = '';
  addLog(`Jadwal: ${label} pukul ${time}`, 'ok');
}

function deleteReminder(id) {
  if (state.connected && state.db) state.db.ref('reminders/' + id).remove();
  state.reminders = state.reminders.filter(r => r.id !== id);
  renderReminders();
  addLog('Jadwal dihapus', 'info');
}

function renderReminders() {
  const list = document.getElementById('reminderList');
  if (!list) return;
  list.innerHTML = '';
  if (!state.reminders.length) {
    list.innerHTML = '<li class="empty-state">Belum ada jadwal. Tambahkan di atas!</li>'; return;
  }
  [...state.reminders].sort((a,b) => a.time.localeCompare(b.time)).forEach(r => {
    const li = document.createElement('li');
    li.className = 'reminder-item';
    li.innerHTML = `<div class="r-time">${r.time}</div><div class="r-info"><div class="r-label">${r.label}</div><div class="r-days">${r.days.join(', ')}</div></div><button class="r-del" onclick="deleteReminder('${r.id}')">&#10005;</button>`;
    list.appendChild(li);
  });
}

// =====================================================
// NAVIGATION
// =====================================================
function initNav() {
  document.querySelectorAll('[data-section]').forEach(el =>
    el.addEventListener('click', () => goTo(el.dataset.section))
  );
  document.getElementById('moreNavBtn')?.addEventListener('click', toggleSidebar);
}

function goTo(nextId) {
  if (state.transitioning) return;
  const prev = document.querySelector('.section.active');
  const next = document.getElementById(nextId);
  if (!next || prev === next) return;
  closeSidebar();
  state.transitioning = true;
  prev.classList.add('s-exit');
  updateNavActive(nextId);
  setTimeout(() => {
    prev.classList.remove('active', 's-exit');
    next.classList.add('active', 's-enter');
    if (nextId === 'eco-monitor') setTimeout(initChart, 80);
    if (nextId === 'skin-scan')   ensureSkinModel();          // pre-warm TFJS
    setTimeout(() => { next.classList.remove('s-enter'); state.transitioning = false; }, 420);
  }, 290);
}

function updateNavActive(id) {
  document.querySelectorAll('[data-section]').forEach(el =>
    el.classList.toggle('active', el.dataset.section === id)
  );
}

// =====================================================
// SIDEBAR + HAMBURGER
// =====================================================
function initHamburger() {
  document.getElementById('hamburgerBtn')?.addEventListener('click', toggleSidebar);
  document.getElementById('sidebarOverlay')?.addEventListener('click', closeSidebar);
}

function toggleSidebar() {
  const sb = document.getElementById('sidebar');
  const ov = document.getElementById('sidebarOverlay');
  const open = sb?.classList.toggle('open');
  ov?.classList.toggle('open', open);
}

function closeSidebar() {
  document.getElementById('sidebar')?.classList.remove('open');
  document.getElementById('sidebarOverlay')?.classList.remove('open');
}

// =====================================================
// THEME — Medical (terang) / Dark
// -----------------------------------------------------
// Tema terang "medical clean" adalah identitas utama dan
// dipakai sebagai default. Mode gelap tetap tersedia untuk
// pemakaian malam. Nilai 'light' dipertahankan sebagai nama
// tema terang supaya preferensi lama pengguna tetap terbaca.
// =====================================================
const THEME_CYCLE = ['light', 'dark'];

function initTheme() {
  let saved = localStorage.getItem('aquent-theme');
  // Tema lama (elegant/neon/serene) sudah dihapus — arahkan ke terang.
  if (!THEME_CYCLE.includes(saved)) {
    saved = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  applyTheme(saved);
  document.getElementById('themeToggle')?.addEventListener('click', () => {
    const cur  = document.documentElement.dataset.theme || 'light';
    const next = cur === 'dark' ? 'light' : 'dark';
    applyTheme(next);
    localStorage.setItem('aquent-theme', next);
  });
}

function applyTheme(theme) {
  if (!THEME_CYCLE.includes(theme)) theme = 'light';
  document.documentElement.dataset.theme = theme;
  const sun  = document.querySelector('.icon-sun');
  const moon = document.querySelector('.icon-moon');
  // Ikon yang tampil = tema BERIKUTNYA, sebagai pratinjau tujuan.
  if (moon) moon.style.display = theme === 'light' ? '' : 'none';
  if (sun)  sun.style.display  = theme === 'dark'  ? '' : 'none';
  refreshChartTheme();
}

/**
 * Menyegarkan warna sumbu & kisi grafik setelah tema berganti.
 *
 * Chart.js menyalin warna saat grafik dibuat, jadi nilai lama akan
 * bertahan sampai opsinya ditulis ulang. Dipanggil dari applyTheme().
 */
function refreshChartTheme() {
  if (typeof ecoChart === 'undefined' || !ecoChart) return;
  const t = chartTheme();
  const sc = ecoChart.options?.scales;
  if (!sc) return;
  Object.values(sc).forEach(ax => {
    if (ax.ticks) ax.ticks.color = t.ink;
    if (ax.grid && ax.grid.display !== false) ax.grid.color = t.grid;
    if (ax.title) ax.title.color = t.ink;
  });
  ecoChart.update('none');
}

// =====================================================
// SKIN TYPE SELECTOR
// =====================================================
function initSkin() {
  document.querySelectorAll('.skin-btn').forEach(btn =>
    btn.addEventListener('click', () => {
      document.querySelectorAll('.skin-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      state.skinType = btn.dataset.skin;
      localStorage.setItem('aquent-skin', state.skinType);
      renderGuideFromJSON();
      updateAIContext();
    })
  );
}

// =====================================================
// CHART TABS
// =====================================================
function initChartTabs() {
  document.querySelectorAll('.chart-tab').forEach(tab =>
    tab.addEventListener('click', () => {
      document.querySelectorAll('.chart-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      switchChart(tab.dataset.chart);
    })
  );
}

// =====================================================
// CLOCK
// =====================================================
function tickClock() {
  const el = document.getElementById('currentTime');
  if (el) el.textContent = new Date().toLocaleTimeString('id-ID', { hour:'2-digit', minute:'2-digit' });
}

// =====================================================
// BACKGROUND PARTICLES
// =====================================================
function initParticles() {
  const canvas = document.getElementById('bgCanvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const resize = () => { canvas.width = window.innerWidth; canvas.height = window.innerHeight; };
  resize();
  window.addEventListener('resize', resize);
  const mkP = cv => ({
    x: Math.random() * cv.width, y: Math.random() * cv.height,
    r: Math.random() * 2.5 + .5, speed: Math.random() * .5 + .15,
    opacity: Math.random() * .35 + .05,
    color: Math.random() > .5 ? '#00b4d8' : '#caf0f8',
    drift: (Math.random() - .5) * .3,
  });
  const particles = Array.from({ length:50 }, () => mkP(canvas));
  function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    particles.forEach(p => {
      ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fillStyle = p.color; ctx.globalAlpha = p.opacity; ctx.fill();
      p.y -= p.speed; p.x += p.drift;
      if (p.y + p.r < 0 || p.x < -10 || p.x > canvas.width + 10)
        Object.assign(p, mkP(canvas), { y: canvas.height + p.r });
    });
    ctx.globalAlpha = 1;
    requestAnimationFrame(draw);
  }
  draw();
}

// =====================================================
// ONBOARDING (P3)
// =====================================================
function initOnboarding() {
  loadUserProfile();
  if (localStorage.getItem('aquent-onboarded')) return;

  const overlay = document.getElementById('onboardingOverlay');
  if (!overlay) return;
  overlay.style.display = 'flex';

  showObStep(1);

  document.getElementById('obNextBtn')?.addEventListener('click', handleObNext);
  document.getElementById('obSkipBtn')?.addEventListener('click', finishOnboarding);

  // Skin buttons in step 2
  document.querySelectorAll('#obStep2 .skin-btn').forEach(btn =>
    btn.addEventListener('click', () => {
      document.querySelectorAll('#obStep2 .skin-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
    })
  );

  // Target buttons in step 3
  document.querySelectorAll('#obStep3 .target-btn').forEach(btn =>
    btn.addEventListener('click', () => {
      document.querySelectorAll('#obStep3 .target-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
    })
  );
}

function showObStep(n) {
  [1,2,3].forEach(i => {
    const el = document.getElementById('obStep' + i);
    if (el) el.style.display = i === n ? '' : 'none';
  });
  document.querySelectorAll('.ob-dot').forEach((d, i) => d.classList.toggle('active', i === n - 1));
  const nextBtn = document.getElementById('obNextBtn');
  if (nextBtn) nextBtn.innerHTML = n === 3 ? 'Selesai ✓' : 'Lanjut &#8594;';
  state.obStep = n;
}

function handleObNext() {
  if (state.obStep === 1) {
    const name = document.getElementById('obName')?.value.trim();
    if (!name) { document.getElementById('obName')?.focus(); return; }
    state.userName = name;
    showObStep(2);
  } else if (state.obStep === 2) {
    const skinBtn = document.querySelector('#obStep2 .skin-btn.active');
    state.skinType = skinBtn?.dataset.skin || 'normal';
    showObStep(3);
  } else if (state.obStep === 3) {
    const targetBtn = document.querySelector('#obStep3 .target-btn.active');
    state.waterGoal = parseInt(targetBtn?.dataset.target || '10');
    finishOnboarding();
  }
}

function finishOnboarding() {
  localStorage.setItem('aquent-onboarded', '1');
  localStorage.setItem('aquent-name', state.userName);
  localStorage.setItem('aquent-skin', state.skinType);
  localStorage.setItem('aquent-goal', state.waterGoal);
  document.getElementById('onboardingOverlay').style.display = 'none';
  // Sync skin selector
  document.querySelectorAll('.skin-btn').forEach(b =>
    b.classList.toggle('active', b.dataset.skin === state.skinType)
  );
  updateAIContext();
}

function loadUserProfile() {
  state.userName = localStorage.getItem('aquent-name') || '';
  state.skinType = localStorage.getItem('aquent-skin') || 'normal';
  state.waterGoal = parseInt(localStorage.getItem('aquent-goal') || '10');
  document.querySelectorAll('.skin-btn').forEach(b =>
    b.classList.toggle('active', b.dataset.skin === state.skinType)
  );
}

// =====================================================
// GEMINI API
// =====================================================
function getGeminiKey() { return localStorage.getItem('aquent-gemini-key') || ''; }
function saveGeminiKey(k) { localStorage.setItem('aquent-gemini-key', k); }

async function callGemini(prompt, imageBase64 = null) {
  const key = getGeminiKey();
  if (!key) return null;
  const model = imageBase64 ? 'gemini-1.5-flash' : 'gemini-2.0-flash';
  const url   = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`;
  const parts = [{ text: prompt }];
  if (imageBase64) parts.unshift({ inline_data: { mime_type:'image/jpeg', data:imageBase64 } });
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents: [{ parts }] }),
    });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const json = await res.json();
    return json.candidates?.[0]?.content?.parts?.[0]?.text || null;
  } catch (e) {
    console.warn('Gemini error:', e.message);
    return null;
  }
}

// =====================================================
// AI CONTEXT BAR
// =====================================================
function updateAIContext() {
  const { ph, temperature, turbidity } = state.sensor;
  setText('aiCtxPH',   `pH ${ph}`);
  setText('aiCtxTemp', `${temperature}°C`);
  setText('aiCtxTurb', `${turbidity} NTU`);
  const skin = document.getElementById('aiCtxSkin');
  if (skin) {
    const labels = { normal:'Normal', sensitive:'Sensitif', oily:'Berminyak', dry:'Kering' };
    skin.textContent = labels[state.skinType] || 'Normal';
  }
}

function buildSensorContext() {
  const { ph, temperature, turbidity } = state.sensor;
  const { total, grade } = calcQualityScore();
  const skinLabel = { normal:'Normal', sensitive:'Sensitif', oily:'Berminyak', dry:'Kering' }[state.skinType] || state.skinType;
  return `Data sensor shower saat ini: pH=${ph} (aman 6.5–8.5), Suhu=${temperature}°C (optimal 36–38°C), Kekeruhan=${turbidity} NTU (aman ≤1.0 NTU). Skor Kualitas Air: ${total}/100 (Grade ${grade}). Tipe Kulit Pengguna: ${skinLabel}. Target Hemat Air: ${state.waterGoal} L/minggu.`;
}

// =====================================================
// AI CHAT (P4)
// =====================================================
let chatHistory = [];

function initAIChat() {
  document.getElementById('sendBtn')?.addEventListener('click', sendChat);
  document.getElementById('chatInput')?.addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendChat(); }
  });
  document.querySelectorAll('.chip').forEach(chip =>
    chip.addEventListener('click', () => {
      const input = document.getElementById('chatInput');
      if (input) input.value = chip.dataset.q || chip.textContent;
      sendChat();
    })
  );
  document.getElementById('openSettingsBtn')?.addEventListener('click', openSettings);

  const notice = document.getElementById('apiNotice');
  if (notice) notice.style.display = getGeminiKey() ? 'none' : 'flex';
}

async function sendChat() {
  const input = document.getElementById('chatInput');
  const msgs  = document.getElementById('chatMessages');
  if (!input || !msgs) return;
  const text = input.value.trim();
  if (!text) return;

  // Enforce AI daily limit for free users
  const role = state.userRole || getAuthRole();
  if (!canSendAiMsg(role)) {
    appendChatMsg('ai', '⚠️ Kuota pesan harian Anda sudah habis. Upgrade ke Premium untuk pesan tak terbatas!');
    return;
  }
  incrementAiCount();
  if (state.updateAiLimit) state.updateAiLimit();

  input.value = '';

  appendChatMsg('user', text);
  chatHistory.push({ role:'user', text });

  const typing = appendTypingIndicator();
  const key    = getGeminiKey();
  let reply;

  if (key) {
    const history = chatHistory.slice(-6).map(h => `${h.role === 'user' ? 'User' : 'AI'}: ${h.text}`).join('\n');
    const prompt  = `Kamu adalah AQUENT AI, asisten kesehatan kulit dan air yang ramah. Jawab dalam Bahasa Indonesia. Selalu sertakan XAI (Explainable AI): jelaskan MENGAPA kamu merekomendasikan sesuatu, sebutkan faktor-faktor yang mempengaruhi, dan berikan tingkat kepercayaan (Tinggi/Sedang/Rendah).

PENTING: Kamu bukan dokter. Ini bukan diagnosis medis. Selalu sarankan konsultasi dokter untuk masalah kulit serius.

${buildSensorContext()}

Riwayat chat:
${history}

Pertanyaan user: ${text}

Format jawaban:
- Jawaban utama (2-3 kalimat)
- **Faktor yang mempengaruhi (XAI):** [daftar faktor]
- **Kepercayaan:** Tinggi/Sedang/Rendah — [alasan singkat]`;

    reply = await callGemini(prompt);
  }

  typing.remove();
  if (!reply) reply = getDemoAIReply(text);
  chatHistory.push({ role:'ai', text: reply });
  appendChatMsg('ai', reply);

  const notice = document.getElementById('apiNotice');
  if (notice && key) notice.style.display = 'none';
}

function appendChatMsg(role, text) {
  const msgs = document.getElementById('chatMessages');
  if (!msgs) return;
  const div = document.createElement('div');
  div.className = `chat-msg ${role === 'ai' ? 'ai-msg' : 'user-msg'}`;
  const av = role === 'ai' ? 'AI' : (state.userName ? state.userName[0].toUpperCase() : '👤');
  div.innerHTML = role === 'ai'
    ? `<div class="msg-avatar">${av}</div><div class="msg-bubble">${formatAIText(text)}</div>`
    : `<div class="msg-bubble">${escHtml(text)}</div><div class="msg-avatar">${av}</div>`;
  msgs.appendChild(div);
  msgs.scrollTop = msgs.scrollHeight;
}

function appendTypingIndicator() {
  const msgs = document.getElementById('chatMessages');
  const div  = document.createElement('div');
  div.className = 'chat-msg ai-msg';
  div.innerHTML = `<div class="msg-avatar">AI</div><div class="msg-bubble"><div class="typing-indicator"><span class="typing-dot"></span><span class="typing-dot"></span><span class="typing-dot"></span></div></div>`;
  msgs.appendChild(div);
  msgs.scrollTop = msgs.scrollHeight;
  return div;
}

function formatAIText(t) {
  return escHtml(t)
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.*?)\*/g, '<em>$1</em>')
    .replace(/\n/g, '<br>');
}

function escHtml(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

function getDemoAIReply(text) {
  const t   = text.toLowerCase();
  const { ph, temperature, turbidity } = state.sensor;
  const { total, grade } = calcQualityScore();
  const skin = { normal:'Normal', sensitive:'Sensitif', oily:'Berminyak', dry:'Kering' }[state.skinType] || state.skinType;

  if (t.includes('ph') || t.includes('asam') || t.includes('basa')) {
    const status = ph < 6.5 ? 'asam — dapat mengiritasi dan merusak skin barrier' : ph > 8.5 ? 'basa — dapat mengurangi kelembapan alami kulit' : 'dalam rentang aman WHO (6.5–8.5)';
    return `**pH Air Saat Ini: ${ph}**\n\nAir shower Anda ${status}.\n\n**Faktor yang mempengaruhi (XAI):** pH memiliki bobot 35% pada skor kualitas air karena langsung mempengaruhi acid mantle kulit (pH alami kulit 4.5–5.5). Perbedaan pH air dan kulit yang besar meningkatkan risiko iritasi (Lambers et al., 2019).\n\n**Kepercayaan: Tinggi** — berdasarkan data sensor real-time vs standar WHO.`;
  }
  if (t.includes('suhu') || t.includes('panas') || t.includes('dingin')) {
    const status = temperature < 36 ? 'terlalu dingin — naikkan ke 36–38°C' : temperature > 40 ? 'terlalu panas — dapat meningkatkan TEWL (water loss kulit)' : 'ideal untuk kesehatan kulit';
    return `**Suhu Air: ${temperature}°C**\n\nSuhu ${status}.\n\n**Faktor yang mempengaruhi (XAI):** Suhu berkontribusi 35% pada skor kualitas. Air >40°C merusak lapisan lipid kulit dan memperburuk kondisi ${skin.toLowerCase()}. Panduan JEADV 2022 merekomendasikan 36–38°C untuk atopic dermatitis.\n\n**Kepercayaan: Tinggi** — berdasarkan sensor suhu real-time.`;
  }
  if (t.includes('skor') || t.includes('kualitas') || t.includes('air')) {
    return `**Skor Kualitas Air: ${total}/100 (Grade ${grade})**\n\nKomposisi skor berdasarkan standar WHO/SNI:\n• pH ${ph} → ${Math.round(35)}% bobot\n• Suhu ${temperature}°C → 35% bobot\n• Kekeruhan ${turbidity} NTU → 30% bobot\n\n**Faktor yang mempengaruhi (XAI):** Bobot ditetapkan berdasarkan dampak klinis masing-masing parameter terhadap kesehatan kulit dari meta-analisis dermatologi.\n\n**Kepercayaan: Tinggi** — kalkulasi berbasis threshold ilmiah.`;
  }
  if (t.includes('kulit') || t.includes('kering') || t.includes('berminyak') || t.includes('sensitif')) {
    return `**Rekomendasi untuk Kulit ${skin}:**\n\nBerdasarkan kondisi air saat ini (Skor ${total}/100):\n• Gunakan suhu ${state.skinType === 'sensitive' || state.skinType === 'dry' ? '33–37°C' : '36–40°C'}\n• Durasi mandi: ${state.skinType === 'sensitive' ? '5–7' : '7–10'} menit\n• Sabun dengan pH ${state.skinType === 'oily' ? '4.5–5.5' : '5.5–7.0'}\n\n**Faktor yang mempengaruhi (XAI):** Kombinasi pH air ${ph} + tipe kulit ${skin.toLowerCase()} menentukan rekomendasi ini berdasarkan evidence-based dermatology.\n\n**Kepercayaan: Sedang** — aktifkan Gemini API untuk analisis yang lebih personal.`;
  }
  return `Halo! Saya AQUENT AI Konsultan. 💧\n\nKondisi air shower Anda saat ini: pH ${ph}, Suhu ${temperature}°C, Kekeruhan ${turbidity} NTU — **Skor ${total}/100 (Grade ${grade})**.\n\nSaya dapat membantu dengan:\n• Analisis parameter air dan dampaknya ke kulit\n• Rekomendasi personal untuk kulit ${skin.toLowerCase()}\n• Tips optimasi shower berdasarkan data sensor\n\n💡 Aktifkan Gemini API Key di Settings untuk respons yang lebih akurat dan personal!`;
}

// =====================================================
// AQUENT SKIN ANALYZER — 100% Local ML Pipeline
// Stack:
//   1. TensorFlow.js (model klasifikasi kulit, dilatih sendiri)
//   2. Pixel-level color analysis (untuk XAI deterministik)
// Tidak ada API call eksternal. Foto tidak meninggalkan device.
// =====================================================
const TFJS_CDN  = 'https://cdn.jsdelivr.net/npm/@tensorflow/tfjs@4.20.0/dist/tf.min.js';
const MODEL_DIR = 'models/skin-classifier';
const MODEL_VERSION = '1.0';

let tfjsModel       = null;     // tf.LayersModel
let tfjsLabels      = [];       // ['dry','normal','oily',...]
let tfjsImageSize   = 224;
let tfjsPreprocess  = 'tm';     // 'tm' = teachable machine [-1,1] | 'imagenet' = mean-subtract | 'rescale' = [0,1]
let tfjsLoadAttempt = null;
let tfjsAvailable   = null;

function loadTfjsScript() {
  if (window.tf) return Promise.resolve();
  return new Promise((res, rej) => {
    const s = document.createElement('script');
    s.src = TFJS_CDN;
    s.onload  = () => res();
    s.onerror = () => rej(new Error('TFJS gagal dimuat dari CDN'));
    document.head.appendChild(s);
  });
}

async function ensureSkinModel() {
  if (tfjsAvailable === false) return null;
  if (tfjsModel) return tfjsModel;
  if (tfjsLoadAttempt) return tfjsLoadAttempt;

  tfjsLoadAttempt = (async () => {
    try {
      const probe = await fetch(`${MODEL_DIR}/model.json`, { method:'HEAD' });
      if (!probe.ok) throw new Error('model.json tidak ditemukan di ' + MODEL_DIR);

      try {
        const meta = await fetch(`${MODEL_DIR}/metadata.json`).then(r => r.json());
        if (Array.isArray(meta.labels)) tfjsLabels = meta.labels;
        if (Number.isFinite(meta.imageSize)) tfjsImageSize = meta.imageSize;
        if (typeof meta.preprocess === 'string') tfjsPreprocess = meta.preprocess;
      } catch { /* metadata optional */ }

      await loadTfjsScript();
      tfjsModel = await tf.loadLayersModel(`${MODEL_DIR}/model.json`);
      tfjsAvailable = true;
      console.info('[AQUENT] Local skin model loaded:', tfjsLabels.length, 'classes,', tfjsPreprocess, 'preprocess');
      return tfjsModel;
    } catch (e) {
      console.info('[AQUENT] Local skin model unavailable — pakai analisis heuristik:', e.message);
      tfjsAvailable = false;
      return null;
    }
  })();

  return tfjsLoadAttempt;
}

/**
 * Preprocess image jadi tensor sesuai konvensi model.
 * - 'tm' (Teachable Machine): img / 127.5 - 1  → range [-1, 1]
 * - 'imagenet' (Keras default): subtract mean RGB
 * - 'rescale' (custom): img / 255  → range [0, 1]
 */
function _preprocessTensor(imgEl) {
  return tf.tidy(() => {
    let t = tf.browser.fromPixels(imgEl)
      .resizeBilinear([tfjsImageSize, tfjsImageSize])
      .toFloat();
    if (tfjsPreprocess === 'imagenet') {
      const mean = tf.tensor1d([123.68, 116.779, 103.939]);
      t = t.sub(mean);
    } else if (tfjsPreprocess === 'rescale') {
      t = t.div(255);
    } else {
      t = t.div(127.5).sub(1);
    }
    return t.expandDims(0);
  });
}

async function predictSkinTfjs(base64) {
  const model = await ensureSkinModel();
  if (!model) return null;

  return await new Promise(res => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      try {
        const tensor = _preprocessTensor(img);
        const logits = model.predict(tensor);
        const data = logits.dataSync();
        tensor.dispose(); logits.dispose();

        const ranked = Array.from(data).map((s, i) => ({
          label: tfjsLabels[i] || `class_${i}`,
          score: s,
        })).sort((a, b) => b.score - a.score);
        res(ranked);
      } catch (e) {
        console.warn('TFJS predict error:', e.message);
        res(null);
      }
    };
    img.onerror = () => res(null);
    img.src = base64.startsWith('data:') ? base64 : `data:image/jpeg;base64,${base64}`;
  });
}

/**
 * Pixel-level color analysis — deterministik, tidak butuh model.
 * Berguna sebagai supplementary metric XAI dan fallback saat model belum ada.
 *
 * Computes:
 *   - hydrationProxy: dari saturation channel (kulit kering = saturasi rendah/blotchy)
 *   - rednessIndex:   ratio R / (R+G+B)
 *   - oilinessProxy:  variance dari Y luminance (sebum = highlight specular)
 *   - skinToneAvg:    rata-rata RGB di area kulit
 *   - textureScore:   variance edge density (Sobel-like)
 *   - sharpnessScore: estimasi blur (variance of Laplacian)
 */
function analyzeImagePixels(base64) {
  return new Promise(res => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      try {
        const W = 256, H = Math.round(256 * img.height / img.width);
        const canvas = document.createElement('canvas');
        canvas.width = W; canvas.height = H;
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        ctx.drawImage(img, 0, 0, W, H);
        const data = ctx.getImageData(0, 0, W, H).data;

        // Sample tengah (asumsi wajah di tengah frame) — 60% center crop
        const cx0 = Math.floor(W * 0.2), cx1 = Math.floor(W * 0.8);
        const cy0 = Math.floor(H * 0.2), cy1 = Math.floor(H * 0.8);

        let n = 0, sumR = 0, sumG = 0, sumB = 0, sumY = 0, sumY2 = 0;
        let sumS = 0, sumSat = 0, redCount = 0, brightCount = 0;
        let edgeSum = 0, lapSum = 0, lapCount = 0;

        const idx = (x, y) => (y * W + x) * 4;

        for (let y = cy0; y < cy1; y++) {
          for (let x = cx0; x < cx1; x++) {
            const i = idx(x, y);
            const r = data[i], g = data[i + 1], b = data[i + 2];
            const Y = 0.299 * r + 0.587 * g + 0.114 * b;
            const max = Math.max(r, g, b), min = Math.min(r, g, b);
            const sat = max === 0 ? 0 : (max - min) / max;
            sumR += r; sumG += g; sumB += b;
            sumY += Y; sumY2 += Y * Y;
            sumSat += sat;
            const redRatio = r / (r + g + b + 1);
            if (redRatio > 0.4) redCount++;
            if (Y > 220) brightCount++;
            n++;

            // Sobel-like horizontal gradient
            if (x > cx0 && x < cx1 - 1) {
              const r2 = data[idx(x + 1, y)];
              edgeSum += Math.abs(r - r2);
            }
            // Laplacian (4-neighbor) untuk sharpness
            if (x > cx0 && x < cx1 - 1 && y > cy0 && y < cy1 - 1) {
              const lap = 4 * Y
                - (0.299 * data[idx(x - 1, y)] + 0.587 * data[idx(x - 1, y) + 1] + 0.114 * data[idx(x - 1, y) + 2])
                - (0.299 * data[idx(x + 1, y)] + 0.587 * data[idx(x + 1, y) + 1] + 0.114 * data[idx(x + 1, y) + 2])
                - (0.299 * data[idx(x, y - 1)] + 0.587 * data[idx(x, y - 1) + 1] + 0.114 * data[idx(x, y - 1) + 2])
                - (0.299 * data[idx(x, y + 1)] + 0.587 * data[idx(x, y + 1) + 1] + 0.114 * data[idx(x, y + 1) + 2]);
              lapSum += lap * lap;
              lapCount++;
            }
          }
        }

        const avgR = sumR / n, avgG = sumG / n, avgB = sumB / n;
        const avgY = sumY / n;
        const varY = sumY2 / n - avgY * avgY;
        const avgSat = sumSat / n;
        const sharpness = lapCount ? lapSum / lapCount : 0;

        // Normalize ke 0-100
        const hydrationProxy = Math.round(Math.max(0, Math.min(100, avgSat * 220)));
        const rednessIndex   = Math.round(Math.max(0, Math.min(100, (redCount / n) * 200)));
        const oilinessProxy  = Math.round(Math.max(0, Math.min(100, (brightCount / n) * 400 + Math.sqrt(varY) * 0.5)));
        const textureScore   = Math.round(Math.max(0, Math.min(100, 100 - (edgeSum / n) * 0.6)));
        const sharpnessScore = Math.round(Math.max(0, Math.min(100, Math.log10(sharpness + 1) * 25)));
        const luminance      = Math.round(avgY);

        res({
          hydrationProxy, rednessIndex, oilinessProxy, textureScore, sharpnessScore, luminance,
          skinToneAvg: { r: Math.round(avgR), g: Math.round(avgG), b: Math.round(avgB) },
          samplesCount: n,
        });
      } catch (e) {
        console.warn('Pixel analysis error:', e.message);
        res(null);
      }
    };
    img.onerror = () => res(null);
    img.src = base64.startsWith('data:') ? base64 : `data:image/jpeg;base64,${base64}`;
  });
}

/**
 * Deterministic skin type classifier (rule-based) sebagai fallback dan supplementary.
 * Dipakai kalau ML model belum di-train.
 */
function classifySkinFromPixels(px) {
  if (!px) return { skinType: 'normal', confidence: 30, source: 'no-data' };
  const { hydrationProxy, oilinessProxy, rednessIndex } = px;

  const scores = { dry: 0, oily: 0, normal: 0, combination: 0, sensitive: 0 };
  // Dry: low hydration, low oil
  scores.dry = Math.max(0, (60 - hydrationProxy) * 1.2 + (40 - oilinessProxy) * 0.8);
  // Oily: high oil
  scores.oily = Math.max(0, (oilinessProxy - 50) * 1.5);
  // Sensitive: high redness
  scores.sensitive = Math.max(0, (rednessIndex - 35) * 1.3);
  // Combination: medium oil + redness
  scores.combination = Math.max(0, (oilinessProxy - 35) * 0.6 + (rednessIndex - 25) * 0.6);
  // Normal: balanced
  scores.normal = 60 - Math.abs(hydrationProxy - 60) - Math.abs(oilinessProxy - 40) * 0.7 - rednessIndex * 0.3;

  const sorted = Object.entries(scores).sort((a, b) => b[1] - a[1]);
  const total = sorted.reduce((s, [, v]) => s + Math.max(0, v), 0) || 1;
  return {
    skinType: sorted[0][0],
    confidence: Math.round(Math.max(20, Math.min(85, (sorted[0][1] / total) * 100))),
    source: 'pixel-rule',
    distribution: Object.fromEntries(sorted.map(([k, v]) => [k, Math.round(Math.max(0, v))])),
  };
}

/**
 * Bangun hasil scan dari kombinasi:
 *   - ML predictions (kalau ada)
 *   - Pixel analysis
 *   - Sensor data (water context)
 * Output kompatibel dengan renderScanResult().
 */
function buildLocalScanResult({ predictions, pixels, sensor, photoQuality }) {
  // 1. Tentukan skin type dari sumber yang paling dapat dipercaya
  let skinType, conf, sourceTag;
  const labelMap = {
    dry:'dry', oily:'oily', normal:'normal',
    combination:'combination', sensitive:'sensitive',
    kering:'dry', berminyak:'oily', kombinasi:'combination', sensitif:'sensitive',
  };

  if (predictions && predictions.length && predictions[0].score >= 0.4) {
    skinType = labelMap[predictions[0].label.toLowerCase()] || predictions[0].label.toLowerCase();
    conf     = Math.round(predictions[0].score * 100);
    sourceTag = 'ml-model';
  } else if (pixels) {
    const cls = classifySkinFromPixels(pixels);
    skinType = cls.skinType;
    conf     = cls.confidence;
    sourceTag = 'pixel-analysis';
  } else {
    skinType = state.skinType || 'normal';
    conf = 25;
    sourceTag = 'fallback';
  }

  // 2. Hitung skin score komprehensif
  const qs = calcQualityScore();
  const hydration = pixels?.hydrationProxy ?? 60;
  const redness   = pixels?.rednessIndex ?? 30;
  const oiliness  = pixels?.oilinessProxy ?? 40;
  const texture   = pixels?.textureScore ?? 70;

  // Skor: 60 base + bonus hidrasi + bonus skor air - penalti redness/jerawat
  const skinScore = Math.round(
    Math.max(0, Math.min(100,
      40
      + (hydration / 100) * 25
      + (qs.total / 100) * 15
      + (texture / 100) * 15
      - (redness / 100) * 10
      + (conf / 100) * 5
    ))
  );

  // 3. Conditions detected — gabungan ML + pixel
  const conditions = [];
  if (predictions) {
    predictions.slice(0, 3).forEach(p => {
      if (p.score > 0.15) {
        conditions.push({
          name: capitalize(p.label),
          detected: p.score > 0.4,
          confidence: Math.round(p.score * 100),
        });
      }
    });
  }
  if (pixels) {
    if (redness > 45)   conditions.push({ name:'Kemerahan', detected:true, confidence: redness });
    if (oiliness > 60)  conditions.push({ name:'Kulit Berminyak', detected:true, confidence: oiliness });
    if (hydration < 40) conditions.push({ name:'Dehidrasi Permukaan', detected:true, confidence: 100 - hydration });
    if (texture < 50)   conditions.push({ name:'Tekstur Tidak Rata', detected:true, confidence: 100 - texture });
  }
  // Dedupe by name
  const seen = new Set();
  const uniqueConditions = conditions.filter(c => {
    const k = c.name.toLowerCase();
    if (seen.has(k)) return false;
    seen.add(k); return true;
  }).slice(0, 5);

  // 4. Factors XAI
  const factors = [];
  if (pixels) {
    factors.push(
      { name:'Hidrasi (saturasi pixel)', value:`${hydration}/100`, contribution: hydration, impact: hydration > 55 ? 'positive' : 'negative' },
      { name:'Keseimbangan Minyak',     value:`${oiliness}/100`,  contribution: oiliness < 50 ? 80 : Math.max(0, 100 - oiliness), impact: oiliness < 50 ? 'positive' : oiliness > 70 ? 'negative' : 'neutral' },
      { name:'Tekstur Permukaan',        value:`${texture}/100`,   contribution: texture, impact: texture > 60 ? 'positive' : 'negative' },
      { name:'Indeks Kemerahan',         value:`${redness}/100`,   contribution: 100 - redness, impact: redness < 30 ? 'positive' : 'negative' },
    );
  }
  if (predictions && predictions[0]) {
    factors.unshift({
      name: `Klasifikasi ML: ${capitalize(predictions[0].label)}`,
      value: `${Math.round(predictions[0].score * 100)}%`,
      contribution: Math.round(predictions[0].score * 100),
      impact: 'neutral',
    });
  }
  // Sensor context
  const ph = sensor.ph, t = sensor.temperature;
  if (ph < 6.5 || ph > 7.5) {
    factors.push({
      name: 'pH Air Shower',
      value: `${ph} ${ph < 6.5 ? '(asam)' : '(basa)'}`,
      contribution: Math.min(85, Math.round(Math.abs(ph - 7) * 30)),
      impact: 'negative',
    });
  }

  // 5. Rekomendasi rule-based berbobot tinggi
  const recsByType = {
    dry: [
      `Pertahankan suhu shower 36-38°C (saat ini ${t}°C). Air panas mempercepat dehidrasi kulit.`,
      `Aplikasikan moisturizer dengan ceramide & hyaluronic acid dalam 3 menit setelah mandi (Soak & Seal).`,
      `Hindari sabun ber-pH > 7. Pilih cleanser pH-balanced 5.5-6.5.`,
    ],
    oily: [
      `Gunakan cleanser ber-niacinamide atau salicylic acid 2x sehari untuk mengontrol sebum.`,
      `Hindari air > 40°C — panas memicu kelenjar minyak overproduce.`,
      `Aplikasikan toner BHA/AHA untuk eksfoliasi ringan 2-3x seminggu.`,
    ],
    normal: [
      `Pertahankan rutinitas: cleanser lembut + moisturizer ringan.`,
      `Suhu air ${t}°C ${t >= 36 && t <= 38 ? 'sudah optimal' : 'sebaiknya disesuaikan ke 36-38°C'}.`,
      `Gunakan sunscreen SPF 30+ untuk melindungi skin barrier.`,
    ],
    combination: [
      `Dual-zone treatment: BHA toner di T-zone, moisturizer thicker di pipi.`,
      `Gunakan toner alkohol-free untuk menjaga keseimbangan.`,
      `Hindari over-cleansing — bisa memicu T-zone produksi sebum lebih banyak.`,
    ],
    sensitive: [
      `Hindari air panas dan sabun ber-fragrance/SLS.`,
      `Pilih produk hypoallergenic dengan minimal ingredient (centella, panthenol).`,
      `Patch test setiap produk baru di belakang telinga 24 jam dulu.`,
    ],
  };
  const recommendations = recsByType[skinType] || recsByType.normal;
  // Tambah rekomendasi situasional
  if (redness > 50)   recommendations.push(`Kemerahan tinggi terdeteksi — pertimbangkan cooling toner & hindari paparan matahari langsung 24 jam.`);
  if (hydration < 35) recommendations.push(`Dehidrasi parah terdeteksi — naikkan asupan air minum dan gunakan hydrating serum (hyaluronic acid).`);

  // 6. Water compatibility narrative
  const compatScore = Math.round(qs.total * 0.6 + (skinScore - 50) * 0.4 + 20);
  const waterCompatibility = `Air shower Anda (pH ${ph}, ${sensor.turbidity} NTU, suhu ${t}°C) `
    + `${compatScore >= 75 ? 'kompatibel dengan baik' : compatScore >= 55 ? 'cukup kompatibel' : 'kurang kompatibel'}`
    + ` untuk kulit ${skinType}. ${qs.total < 60 ? 'Skor kualitas air rendah — pertimbangkan filter atau adjust suhu.' : ''}`;

  // 7. Photo quality warning
  const lowQualityWarn = (photoQuality && photoQuality < 30)
    ? ' (Kualitas foto rendah — confidence dibatasi. Coba ulang dengan pencahayaan lebih baik.)'
    : '';

  return {
    skinScore,
    skinType,
    hydrationLevel: hydration,
    conditions: uniqueConditions.length ? uniqueConditions : [{ name:'Tidak Ada Anomali Terdeteksi', detected:true, confidence: 70 }],
    factors,
    recommendations,
    waterCompatibility,
    confidence: photoQuality && photoQuality < 30 ? Math.round(conf * 0.6) : conf,
    disclaimer: `Analisis lokal di browser (TensorFlow.js + pixel analysis). Bukan diagnosis medis. Konsultasikan dokter kulit untuk masalah serius.${lowQualityWarn}`,
    source: sourceTag,
    pixels,
    modelVersion: tfjsAvailable ? MODEL_VERSION : null,
  };
}

function capitalize(s) { return s ? s.charAt(0).toUpperCase() + s.slice(1).toLowerCase() : s; }

// =====================================================
// SKIN SCANNER (P5)
// =====================================================
function initSkinScanner() {
  document.getElementById('startScanBtn')?.addEventListener('click', startCamera);
  document.getElementById('captureBtn')?.addEventListener('click', captureAndAnalyze);
  document.getElementById('cancelScanBtn')?.addEventListener('click', resetScanner);
  document.getElementById('photoUpload')?.addEventListener('change', e => {
    const file = e.target.files?.[0];
    if (file) analyzeUploadedImage(file);
    e.target.value = '';
  });
}

function showScanState(name) {
  const states = { idle:'scanIdle', camera:'scanPreview', loading:'scanLoading' };
  Object.entries(states).forEach(([k, id]) => {
    const el = document.getElementById(id);
    if (el) el.style.display = k === name ? '' : 'none';
  });
  const result = document.getElementById('scanResult');
  const box    = document.getElementById('scannerBox');
  if (name === 'result') {
    if (box)    box.style.display    = 'none';
    if (result) result.style.display = 'block';
  } else {
    if (box)    box.style.display    = '';
    if (result) result.style.display = 'none';
  }
}

/**
 * Terjemahkan DOMException dari getUserMedia jadi pesan yang bisa ditindaklanjuti.
 * Pesan generik menyembunyikan penyebab asli (izin vs tidak ada kamera vs dipakai app lain).
 */
function cameraErrorMessage(err) {
  switch (err && err.name) {
    case 'NotAllowedError':
    case 'PermissionDeniedError':
      return 'Izin kamera ditolak. Klik ikon gembok di address bar → izinkan Kamera, lalu muat ulang halaman.';
    case 'NotFoundError':
    case 'DevicesNotFoundError':
      return 'Tidak ada kamera terdeteksi di perangkat ini. Silakan upload foto dari galeri.';
    case 'NotReadableError':
    case 'TrackStartError':
      return 'Kamera sedang dipakai aplikasi lain (mis. Zoom/Meet). Tutup aplikasi itu lalu coba lagi.';
    case 'OverconstrainedError':
    case 'ConstraintNotSatisfiedError':
      return 'Kamera perangkat tidak mendukung mode yang diminta. Coba upload foto dari galeri.';
    case 'SecurityError':
      return 'Akses kamera diblokir kebijakan keamanan browser. Pastikan situs dibuka via HTTPS.';
    default:
      return 'Kamera tidak dapat diakses' + (err && err.name ? ` (${err.name})` : '') +
             '. Coba upload foto dari galeri.';
  }
}

async function startCamera() {
  const video = document.getElementById('cameraFeed');

  // getUserMedia hanya tersedia di secure context (HTTPS / localhost).
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    const secure = window.isSecureContext ||
                   location.protocol === 'https:' ||
                   ['localhost', '127.0.0.1'].includes(location.hostname);
    resetScanner();
    uiToast(secure
      ? 'Browser ini tidak mendukung akses kamera. Silakan upload foto dari galeri.'
      : 'Kamera memerlukan koneksi HTTPS. Buka situs lewat https:// atau upload foto dari galeri.', 'err');
    return;
  }

  showScanState('camera');
  const countdownWrap = document.getElementById('countdownWrap');
  if (countdownWrap) countdownWrap.style.display = 'none';

  // Turunkan constraint bertahap: sebagian kamera (terutama laptop & webcam
  // eksternal) menolak facingMode atau resolusi 720p, tapi berhasil dengan
  // permintaan polos.
  const attempts = [
    { video: { facingMode:'user', width:{ ideal:1280 }, height:{ ideal:720 } } },
    { video: { facingMode:'user' } },
    { video: true },
  ];

  let stream = null, lastErr = null;
  for (const constraints of attempts) {
    try {
      stream = await navigator.mediaDevices.getUserMedia(constraints);
      break;
    } catch (e) {
      lastErr = e;
      console.warn('getUserMedia gagal:', e.name, '—', e.message);
      // Izin ditolak / diblokir kebijakan: mencoba constraint lain percuma.
      if (e.name === 'NotAllowedError' || e.name === 'PermissionDeniedError' ||
          e.name === 'SecurityError'   || e.name === 'NotFoundError') break;
    }
  }

  if (!stream) {
    resetScanner();
    uiToast(cameraErrorMessage(lastErr), 'err');
    return;
  }

  state.scanStream = stream;
  if (!video) { stopCamera(); return; }
  video.srcObject = stream;
  // play() bisa reject (AbortError/autoplay policy) walau stream sudah aktif —
  // jangan jadikan itu kegagalan kamera.
  try { await video.play(); } catch (e) { console.warn('video.play() tertunda:', e.name); }
}

async function captureAndAnalyze() {
  const video = document.getElementById('cameraFeed');
  const countdownWrap = document.getElementById('countdownWrap');
  const countdownNum  = document.getElementById('countdownNum');

  // Show countdown
  if (countdownWrap) countdownWrap.style.display = 'flex';
  let count = 3;
  if (countdownNum) countdownNum.textContent = count;
  await new Promise(resolve => {
    state.scanTimer = setInterval(() => {
      count--;
      if (countdownNum) countdownNum.textContent = count || '📷';
      if (count <= 0) { clearInterval(state.scanTimer); resolve(); }
    }, 1000);
  });

  showScanState('loading');
  let imageBase64 = null;
  if (video && video.readyState >= 2) {
    const canvas = document.createElement('canvas');
    canvas.width  = video.videoWidth  || 640;
    canvas.height = video.videoHeight || 480;
    canvas.getContext('2d').drawImage(video, 0, 0);
    imageBase64 = canvas.toDataURL('image/jpeg', 0.8).replace(/^data:image\/\w+;base64,/, '');
  }
  stopCamera();
  await analyzeImage(imageBase64);
}

async function analyzeUploadedImage(file) {
  showScanState('loading');
  const reader = new FileReader();
  reader.onload = async e => {
    const b64 = e.target.result.replace(/^data:image\/\w+;base64,/, '');
    await analyzeImage(b64);
  };
  reader.readAsDataURL(file);
}

async function analyzeImage(imageBase64) {
  if (!imageBase64) {
    renderScanResult(buildDemoScanResult());
    return;
  }

  // Run ML model + pixel analysis in parallel
  const [predictions, pixels] = await Promise.all([
    predictSkinTfjs(imageBase64).catch(() => null),
    analyzeImagePixels(imageBase64).catch(() => null),
  ]);

  const photoQuality = pixels ? Math.min(pixels.sharpnessScore, pixels.luminance > 60 && pixels.luminance < 220 ? 80 : 40) : 50;

  const result = buildLocalScanResult({
    predictions,
    pixels,
    sensor: state.sensor,
    photoQuality,
  });

  renderScanResult(result);
}

function buildDemoScanResult() {
  const qs = calcQualityScore();
  const health = Math.min(92, Math.round(qs.total * 0.7 + 30));
  return {
    skinScore: health,
    skinType: state.skinType,
    hydrationLevel: Math.round(60 + Math.random() * 30),
    conditions: [
      { name:'Kulit Sehat', detected:true, confidence:75 },
      { name:'Kelembapan Normal', detected:true, confidence:68 },
    ],
    factors: [
      { name:'Hidrasi', value:'Normal', contribution:78, impact:'positive' },
      { name:'Keseimbangan Minyak', value:'Baik', contribution:65, impact:'positive' },
      { name:'Tekstur', value:'Halus', contribution:80, impact:'positive' },
      { name:'Pori', value:'Normal', contribution:70, impact:'neutral' },
    ],
    recommendations: [
      `Pertahankan suhu shower di ${state.sensor.temperature}°C (optimal 36–38°C)`,
      'Gunakan sabun dengan pH-balanced 5.5–7.0 sesuai pH air saat ini',
      'Aplikasikan moisturizer dalam 2–3 menit setelah mandi (Soak & Seal)',
    ],
    waterCompatibility: `Air shower Anda (pH ${state.sensor.ph}, ${state.sensor.turbidity} NTU) ${qs.total >= 75 ? 'kompatibel dengan baik' : 'cukup kompatibel'} dengan kondisi kulit Anda saat ini.`,
    confidence: 68,
    disclaimer: 'Ini bukan diagnosis medis. Konsultasikan dengan dokter kulit untuk penanganan lebih lanjut.',
  };
}

function renderScanResult(data) {
  showScanState('result');
  const el = document.getElementById('scanResult');
  if (!el) return;

  const skinTypeLabel = { normal:'Normal', oily:'Berminyak', dry:'Kering', sensitive:'Sensitif', combination:'Kombinasi' };
  const scoreColor    = data.skinScore >= 80 ? '#06d6a0' : data.skinScore >= 60 ? '#fdcb6e' : '#ff6b6b';
  const circ          = 2 * Math.PI * 38;

  const factorBars = (data.factors || []).map(f =>
    `<div class="attr-row">
      <span class="attr-label">${escHtml(f.name)}</span>
      <div class="attr-track"><div class="attr-bar" style="width:${f.contribution}%;background:${f.impact==='positive'?'#06d6a0':f.impact==='negative'?'#ff6b6b':'#fdcb6e'}"></div></div>
      <span class="attr-pct">${f.contribution}%</span>
    </div>`
  ).join('');

  const condChips = (data.conditions || []).map(c =>
    `<span class="cond-chip">${escHtml(c.name)} <em>${c.confidence}%</em></span>`
  ).join('');

  const recs = (data.recommendations || []).map((r, i) =>
    `<div class="rec-item"><span class="rec-num">${i+1}</span><span>${escHtml(r)}</span></div>`
  ).join('');

  el.innerHTML = `
    <div class="glass-card scan-result-card">
      <div class="result-header">
        <div class="result-ring-wrap">
          <svg viewBox="0 0 100 100" class="result-ring">
            <circle cx="50" cy="50" r="38" fill="none" stroke="rgba(255,255,255,.08)" stroke-width="10"/>
            <circle cx="50" cy="50" r="38" fill="none" stroke="${scoreColor}" stroke-width="10"
              stroke-dasharray="${circ}" stroke-dashoffset="${circ*(1-data.skinScore/100)}"
              stroke-linecap="round" transform="rotate(-90 50 50)"/>
            <text x="50" y="46" text-anchor="middle" class="qs-num" font-size="20">${data.skinScore}</text>
            <text x="50" y="62" text-anchor="middle" class="qs-grade-txt" font-size="11">/ 100</text>
          </svg>
        </div>
        <div class="result-meta">
          <h3>Hasil Scan Kulit</h3>
          <p>Tipe: <strong>${skinTypeLabel[data.skinType] || data.skinType}</strong></p>
          <p>Hidrasi: <strong>${data.hydrationLevel}%</strong></p>
          <span class="conf-badge">${data.confidence}% kepercayaan</span>
          ${data.source === 'ml-model'
            ? '<span class="conf-badge" style="margin-left:6px;background:rgba(85,239,196,.15);color:#06d6a0">🧠 ML Model Lokal</span>'
            : data.source === 'pixel-analysis'
              ? '<span class="conf-badge" style="margin-left:6px;background:rgba(0,180,216,.15);color:#48cae4">🔬 Pixel Analysis</span>'
              : data.source === 'fallback' || data.source === 'no-data'
                ? '<span class="conf-badge" style="margin-left:6px;background:rgba(253,203,110,.15);color:#fdcb6e">⚠ Konteks Sensor</span>'
                : '<span class="conf-badge" style="margin-left:6px;background:rgba(85,239,196,.15);color:#06d6a0">🔒 100% Lokal</span>'}
        </div>
      </div>
      <div class="result-conditions">${condChips}</div>
      <h4 class="result-section-title">Analisis Faktor (XAI)</h4>
      <div class="xai-attribution">${factorBars}</div>
      <h4 class="result-section-title">Kompatibilitas Air</h4>
      <div class="water-compat">${escHtml(data.waterCompatibility)}</div>
      <h4 class="result-section-title">Rekomendasi</h4>
      <div class="result-recs">${recs}</div>
      <p class="disclaimer-txt">${escHtml(data.disclaimer)}</p>
      <div class="scan-result-actions">
        <button class="btn-glow" onclick="resetScanner()">&#128247; Scan Ulang</button>
      </div>
    </div>`;
}

function stopCamera() {
  if (state.scanTimer) { clearInterval(state.scanTimer); state.scanTimer = null; }
  if (state.scanStream) {
    state.scanStream.getTracks().forEach(t => t.stop());
    state.scanStream = null;
  }
}

function resetScanner() {
  stopCamera();
  showScanState('idle');
}

// =====================================================
// SETTINGS MODAL (Gemini API Key)
// =====================================================
function initSettings() {
  document.getElementById('closeSettingsBtn')?.addEventListener('click', () => closeModal('settingsOverlay'));
  document.getElementById('settingsOverlay')?.addEventListener('click', e => {
    if (e.target === e.currentTarget) closeModal('settingsOverlay');
  });

  document.getElementById('toggleKeyVisibility')?.addEventListener('click', () => {
    const inp = document.getElementById('geminiKeyInput');
    if (!inp) return;
    const show = inp.type === 'password';
    inp.type = show ? 'text' : 'password';
    document.getElementById('toggleKeyVisibility').textContent = show ? '🙈' : '👁';
  });

  document.getElementById('saveKeyBtn')?.addEventListener('click', () => {
    const k = document.getElementById('geminiKeyInput')?.value.trim() || '';
    saveGeminiKey(k);
    const notice = document.getElementById('apiNotice');
    if (notice) notice.style.display = k ? 'none' : 'flex';
    addLog(k ? 'Gemini API Key disimpan ✓' : 'API Key dihapus', k ? 'ok' : 'info');
    closeModal('settingsOverlay');
  });

  document.getElementById('testKeyBtn')?.addEventListener('click', async () => {
    const inp = document.getElementById('geminiKeyInput');
    const k   = inp?.value.trim();
    if (!k) { uiToast('Masukkan API Key terlebih dahulu.', 'warn'); return; }
    const btn = document.getElementById('testKeyBtn');
    if (btn) { btn.textContent = 'Menguji...'; btn.disabled = true; }
    saveGeminiKey(k);
    const res = await callGemini('Balas dengan kata: OK');
    if (btn) { btn.textContent = 'Test Koneksi'; btn.disabled = false; }
    if (res) uiToast('Gemini API Key valid! Koneksi berhasil.', 'ok');
    else uiToast('Koneksi gagal. Periksa API Key atau koneksi internet.', 'err');
  });

  // Pre-fill from localStorage
  const inp = document.getElementById('geminiKeyInput');
  if (inp) inp.value = getGeminiKey();
}

function openSettings() {
  const modal = document.getElementById('settingsOverlay');
  if (modal) modal.style.display = 'flex';
  const inp = document.getElementById('geminiKeyInput');
  if (inp) inp.value = getGeminiKey();
}

function closeModal(id) {
  const el = document.getElementById(id);
  if (el) el.style.display = 'none';
}

// =====================================================
// P10 — DERMAL-GUIDE (load dari dermal-guide.json)
// =====================================================
let DERMAL_GUIDE = null;

async function loadDermalGuide() {
  try {
    const res  = await fetch('data/dermal-guide.json');
    DERMAL_GUIDE = await res.json();
  } catch { DERMAL_GUIDE = null; }
}

function getWaterConditionKey() {
  const { ph, temperature: t } = state.sensor;
  if (ph < 6.5)  return 'ph_low';
  if (ph > 8.5)  return 'ph_high';
  if (t > 40)    return 'temp_high';
  return 'normal';
}

function renderGuideFromJSON() {
  if (!DERMAL_GUIDE) { renderGuide(); return; }
  const key    = `${state.skinType}_${getWaterConditionKey()}`;
  const entry  = DERMAL_GUIDE[key] || DERMAL_GUIDE[`${state.skinType}_normal`];
  if (!entry)  { renderGuide(); return; }

  const alertEl = document.getElementById('guideAlert');
  const stepsEl = document.getElementById('guideSteps');
  if (!alertEl || !stepsEl) return;

  const riskColors = { low:'ok', medium:'warning', high:'danger' };
  alertEl.className = 'guide-alert ' + (riskColors[entry.risk_level] || 'ok');
  alertEl.style.display = 'block';
  alertEl.innerHTML = `<strong>${entry.label}</strong> &mdash; Risiko: ${entry.risk_level.toUpperCase()} &bull; Durasi maks: ${entry.duration_max_min} mnt &bull; Suhu: ${entry.water_temp_rec}`;

  stepsEl.innerHTML = '';
  (entry.steps || []).forEach((s, i) => {
    const div = document.createElement('div');
    div.className = 'guide-step';
    div.style.animationDelay = (i * .06) + 's';
    div.innerHTML = `<div class="step-num">${i+1}</div><div class="step-body"><p>${s}</p></div>`;
    stepsEl.appendChild(div);
  });
  if (entry.warning) {
    const w = document.createElement('div');
    w.className = 'guide-alert danger';
    w.style.marginTop = '10px';
    w.innerHTML = `<i class="ph ph-warning"></i> ${entry.warning}`;
    stepsEl.appendChild(w);
  }
  if (entry.tip) {
    const tip = document.createElement('div');
    tip.className = 'guide-alert ok';
    tip.style.marginTop = '8px';
    tip.innerHTML = `<i class="ph ph-lightbulb"></i> <em>${entry.tip}</em>`;
    stepsEl.appendChild(tip);
  }
  if ((entry.products_rec || []).length) {
    const pr = document.createElement('div');
    pr.style.cssText = 'margin-top:12px;font-size:.8rem;color:var(--muted)';
    pr.innerHTML = `<i class="ph ph-shopping-bag" style="margin-right:4px"></i><strong>Produk disarankan:</strong> ${entry.products_rec.join(', ')}`;
    stepsEl.appendChild(pr);
  }
}

// =====================================================
// P6 — SESSION HISTORY & ANALYTICS
// =====================================================
let HIST_DATA = null;
let histChartInst = null;
let histPeriod = 'week';

function generateDemoHistory() {
  const sessions = [];
  const now = Date.now();
  for (let i = 29; i >= 0; i--) {
    const ts  = now - i * 86400000 - Math.random() * 3600000;
    const ph  = +(6.8 + Math.random() * 1.0).toFixed(1);
    const tmp = +(35 + Math.random() * 5).toFixed(1);
    const turb= +(0.1 + Math.random() * 0.6).toFixed(2);
    const tds = +(80 + Math.random() * 220).toFixed(0);
    const chl = +(0.1 + Math.random() * 0.4).toFixed(2);
    const dur = +(5 + Math.random() * 10).toFixed(1);
    const vol = +(dur * 9).toFixed(1);
    const saved= +(Math.random() * 20).toFixed(1);
    const qs  = Math.round(
      Math.min(100, (ph >= 6.5 && ph <= 7.5 ? 100 : 80) * .35
        + (tmp >= 36 && tmp <= 38 ? 100 : 75) * .35
        + (turb <= 0.5 ? 100 : 60) * .30)
    );
    sessions.push({ ts, ph, temperature: tmp, turbidity: turb, tds, chlorine: chl, duration_min: dur, volume_liters: vol, quality_score: qs, water_saved_pct: saved });
  }
  return sessions;
}

function getSessionHistory() {
  try {
    const raw = localStorage.getItem('aquent-sessions');
    if (raw) return JSON.parse(raw);
  } catch {}
  const demo = generateDemoHistory();
  localStorage.setItem('aquent-sessions', JSON.stringify(demo));
  return demo;
}

function _sessionsRef() {
  const uid = getAuthUser()?.uid;
  return (state.db && uid) ? state.db.ref(`sessions/${uid}`) : null;
}

async function syncSessionsFromFirebase() {
  const ref = _sessionsRef();
  if (!ref) return null;
  try {
    const snap = await ref.orderByKey().limitToLast(180).once('value');
    const data = snap.val();
    if (!data) return [];
    const list = Object.entries(data)
      .map(([k, v]) => ({ ...v, ts: parseInt(k) || v.ts || Date.now() }))
      .sort((a, b) => a.ts - b.ts);
    localStorage.setItem('aquent-sessions', JSON.stringify(list.slice(-180)));
    return list;
  } catch (e) {
    console.warn('Session sync failed:', e.message);
    return null;
  }
}

function saveCurrentSession() {
  if (!state.session.startTime) return;
  const sessions = getSessionHistory();
  const { ph, temperature, turbidity, tds, chlorine } = state.sensor;
  const { total } = calcQualityScore();
  const ts = Date.now();
  const profileId = (typeof getActiveProfile === 'function' ? getActiveProfile()?.id : null) || 'default';
  const session = {
    ts,
    profileId,
    ph, temperature, turbidity,
    tds: tds ?? null,
    chlorine: chlorine ?? null,
    duration_min:  state.session.duration,
    volume_liters: state.session.usage,
    quality_score: total,
    water_saved_pct: state.session.saved,
  };
  sessions.push(session);
  localStorage.setItem('aquent-sessions', JSON.stringify(sessions.slice(-180)));

  // Tulis ke Firebase (best-effort, tidak block)
  const ref = _sessionsRef();
  if (ref) {
    ref.child(String(ts)).set(session).catch(e => console.warn('Session save firebase err:', e.message));
  }
}

function initHistory() {
  HIST_DATA = getSessionHistory();
  document.querySelectorAll('.hist-tab').forEach(btn =>
    btn.addEventListener('click', () => {
      document.querySelectorAll('.hist-tab').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      histPeriod = btn.dataset.hist;
      renderHistory();
    })
  );
  document.getElementById('exportCsvBtn')?.addEventListener('click', exportSessionCsv);
  renderHistory();

  // Sync dari Firebase setelah auth siap
  onAuthReady(({ user }) => {
    if (!user) return;
    const tryDown = async () => {
      if (state.db && state.connected) {
        const remote = await syncSessionsFromFirebase();
        if (remote && remote.length) { HIST_DATA = remote; renderHistory(); }
      } else { setTimeout(tryDown, 1000); }
    };
    tryDown();
  });
}

function renderHistory() {
  HIST_DATA = getSessionHistory();
  const now = Date.now();
  const cutoff = histPeriod === 'week' ? now - 7 * 86400000 : now - 30 * 86400000;
  const filtered = HIST_DATA.filter(s => s.ts >= cutoff);

  // Chart
  const labels = filtered.map(s => {
    const d = new Date(s.ts);
    return `${d.getDate()}/${d.getMonth()+1}`;
  });
  const phData   = filtered.map(s => s.ph);
  const tmpData  = filtered.map(s => s.temperature);
  const qsData   = filtered.map(s => s.quality_score);

  const canvas = document.getElementById('histChart');
  if (canvas) {
    if (histChartInst) histChartInst.destroy();
    histChartInst = new Chart(canvas, {
      type: 'line',
      data: {
        labels,
        datasets: [
          { label:'pH', data:phData, borderColor:'#00b4d8', tension:.4, fill:false, pointRadius:3 },
          { label:'Suhu (°C)', data:tmpData, borderColor:'#ff6b6b', tension:.4, fill:false, pointRadius:3 },
          { label:'Skor Kualitas', data:qsData, borderColor:'#4ade80', tension:.4, fill:false, pointRadius:3, yAxisID:'y2' },
        ],
      },
      options: {
        responsive:true, maintainAspectRatio:false,
        plugins:{ legend:{ labels:{ color:'#caf0f8', font:{ size:chartFontSize(11) } } } },
        scales:{
          x:{ ticks:{ color:chartTheme().ink, font:{ size:chartFontSize(10) } }, grid:{ color:chartTheme().grid } },
          y:{ ticks:{ color:chartTheme().ink, font:{ size:chartFontSize(10) } }, grid:{ color:chartTheme().grid }, title:{ display:true, text:'pH / °C', color:chartTheme().ink, font:{ size:chartFontSize(10) } } },
          y2:{ position:'right', ticks:{ color:chartTheme().ink, font:{ size:chartFontSize(10) } }, grid:{ display:false }, title:{ display:true, text:'Skor', color:chartTheme().ink, font:{ size:chartFontSize(10) } } },
        },
      },
    });
  }

  // XAI Insights
  const insights = document.getElementById('histInsights');
  if (insights) {
    const msgs = [];
    const avgPh = filtered.reduce((s,x)=>s+x.ph, 0) / (filtered.length||1);
    const avgTmp= filtered.reduce((s,x)=>s+x.temperature, 0) / (filtered.length||1);
    const avgQS = filtered.reduce((s,x)=>s+x.quality_score, 0) / (filtered.length||1);
    if (avgPh < 6.5) msgs.push({ icon:'ph-warning-circle', color:'#ff6b6b', text:`pH rata-rata ${avgPh.toFixed(1)} — cenderung asam. Pertimbangkan filter pH.` });
    else if (avgPh > 8.5) msgs.push({ icon:'ph-warning-circle', color:'#fdcb6e', text:`pH rata-rata ${avgPh.toFixed(1)} — cenderung basa. Kurangi penggunaan sabun alkali.` });
    else msgs.push({ icon:'ph-check-circle', color:'#4ade80', text:`pH rata-rata ${avgPh.toFixed(1)} — berada dalam rentang optimal WHO (6.5–8.5).` });

    if (avgTmp > 40) msgs.push({ icon:'ph-thermometer-hot', color:'#ff6b6b', text:`Suhu rata-rata ${avgTmp.toFixed(1)}°C — terlalu panas. Air panas meningkatkan risiko TEWL (kehilangan air kulit).` });
    else if (avgTmp < 35) msgs.push({ icon:'ph-snowflake', color:'#74c0fc', text:`Suhu rata-rata ${avgTmp.toFixed(1)}°C — terlalu dingin. Naikkan ke 36–38°C untuk manfaat optimal.` });
    else msgs.push({ icon:'ph-check-circle', color:'#4ade80', text:`Suhu rata-rata ${avgTmp.toFixed(1)}°C — ideal untuk kesehatan kulit (36–38°C).` });

    msgs.push({ icon:'ph-chart-line-up', color:'#00b4d8', text:`Skor kualitas rata-rata: ${Math.round(avgQS)}/100 dalam periode ini.` });

    insights.innerHTML = msgs.map(m =>
      `<div style="display:flex;align-items:center;gap:10px;padding:8px 12px;background:rgba(255,255,255,.04);border-radius:8px;font-size:.82rem">
        <i class="ph-fill ${m.icon}" style="color:${m.color};font-size:1.1rem;flex-shrink:0"></i>
        ${m.text}
      </div>`
    ).join('');
  }

  // Session list
  const list = document.getElementById('sessionList');
  if (list) {
    const recent = [...filtered].reverse().slice(0, 10);
    list.innerHTML = recent.length
      ? recent.map(s => {
          const d  = new Date(s.ts);
          const dt = `${d.getDate()}/${d.getMonth()+1} ${d.getHours().toString().padStart(2,'0')}:${d.getMinutes().toString().padStart(2,'0')}`;
          const gradeColor = s.quality_score >= 90 ? '#4ade80' : s.quality_score >= 75 ? '#fdcb6e' : '#ff6b6b';
          return `<div style="display:flex;align-items:center;gap:12px;padding:10px 14px;background:rgba(255,255,255,.04);border-radius:10px">
            <div style="width:38px;height:38px;border-radius:10px;background:rgba(0,180,216,.12);display:flex;align-items:center;justify-content:center;font-size:.9rem;font-weight:800;color:${gradeColor}">${s.quality_score}</div>
            <div style="flex:1">
              <div style="font-size:.85rem;font-weight:500">${dt}</div>
              <div style="font-size:.75rem;color:var(--muted)">pH ${s.ph} &bull; ${s.temperature}°C &bull; ${s.duration_min} mnt &bull; ${s.volume_liters} L</div>
            </div>
            <span style="font-size:.7rem;color:var(--muted)">${s.water_saved_pct}% hemat</span>
          </div>`;
        }).join('')
      : '<div style="text-align:center;color:var(--muted);padding:20px">Belum ada data sesi.</div>';
  }
  checkGamification();
}

function exportSessionCsv() {
  const data   = getSessionHistory();
  const header = 'Tanggal,pH,Suhu,Kekeruhan,Durasi (mnt),Volume (L),Skor Kualitas,Hemat Air (%)';
  const rows   = data.map(s => {
    const d = new Date(s.ts).toLocaleString('id-ID');
    return `"${d}",${s.ph},${s.temperature},${s.turbidity},${s.duration_min},${s.volume_liters},${s.quality_score},${s.water_saved_pct}`;
  });
  const csv    = [header, ...rows].join('\n');
  const blob   = new Blob([csv], { type:'text/csv' });
  const url    = URL.createObjectURL(blob);
  const a      = document.createElement('a');
  a.href = url; a.download = 'aquent-sessions.csv';
  document.body.appendChild(a); a.click();
  document.body.removeChild(a); URL.revokeObjectURL(url);
  addLog('Riwayat sesi diekspor ke CSV', 'ok');
}

// =====================================================
// P7 — GAMIFICATION
// =====================================================
let BADGES_DATA = null;

async function loadBadges() {
  try {
    const res = await fetch('data/badges.json');
    BADGES_DATA = await res.json();
  } catch { BADGES_DATA = []; }
}

function getEarnedBadges() {
  try { return JSON.parse(localStorage.getItem('aquent-earned-badges') || '[]'); } catch { return []; }
}
function earnBadge(id) {
  const earned = getEarnedBadges();
  if (!earned.includes(id)) {
    earned.push(id);
    localStorage.setItem('aquent-earned-badges', JSON.stringify(earned));
    return true;
  }
  return false;
}

function checkGamification() {
  if (!BADGES_DATA) return;
  const sessions = getSessionHistory();
  const earned   = getEarnedBadges();

  BADGES_DATA.forEach(badge => {
    if (earned.includes(badge.id)) return;
    let unlock = false;
    const t = badge.trigger;

    if (t.metric === 'quality_score') {
      const streak = sessions.slice(-t.streak_sessions || -5).filter(s => s.quality_score >= t.threshold).length;
      if (streak >= (t.streak_sessions || 5)) unlock = true;
    }
    if (t.metric === 'ph_in_optimal_range') {
      const count = sessions.filter(s => s.ph >= (t.ph_min||6.5) && s.ph <= (t.ph_max||7.5)).length;
      if (count >= (t.session_count || 10)) unlock = true;
    }
    if (t.metric === 'water_saved_pct') {
      const streak = sessions.slice(-(t.streak_days||7)).filter(s => s.water_saved_pct >= (t.threshold||30)).length;
      if (streak >= (t.streak_days||7)) unlock = true;
    }
    if (t.session_count && !t.metric) {
      if (sessions.length >= t.session_count) unlock = true;
    }

    if (unlock) {
      if (earnBadge(badge.id)) {
        showBadgeToast(badge);
        addXP(50);
      }
    }
  });

  // Early bird: auto-earn if current hour < 9
  const earlyBadge = BADGES_DATA.find(b => b.id === 'early-bird');
  if (earlyBadge && !earned.includes('early-bird') && new Date().getHours() < 9) {
    if (earnBadge('early-bird')) { showBadgeToast(earlyBadge); addXP(30); }
  }

  renderBadges();
}

function showBadgeToast(badge) {
  const msg = `${badge.icon} Badge baru: <strong>${badge.name}</strong>`;
  addLog(`Badge diperoleh: ${badge.name}`, 'ok');
  // Show a floating notification
  const el = document.createElement('div');
  el.style.cssText = 'position:fixed;bottom:80px;right:20px;background:var(--glass);border:1px solid var(--pri-line);border-radius:12px;padding:12px 18px;z-index:8000;font-size:.85rem;font-weight:500;color:var(--txt1);box-shadow:var(--shadow-h);animation:slideUp .3s ease;display:flex;align-items:center;gap:10px';
  el.innerHTML = `<span style="font-size:1.5rem">${badge.icon}</span><div><div style="font-weight:700">Badge Baru!</div><div style="color:var(--txt2)">${badge.name}</div></div>`;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 4000);
}

function getXP() { return parseInt(localStorage.getItem('aquent-xp') || '0'); }
function addXP(n) { localStorage.setItem('aquent-xp', getXP() + n); renderBadges(); }

function renderBadges() {
  if (!BADGES_DATA) return;
  const earned = getEarnedBadges();
  const xp     = getXP();
  const levels = [
    { name:'Bronze',   xpNeeded:0,   color:'#cd7f32', gradient:'#cd7f32,#f0c040' },
    { name:'Silver',   xpNeeded:100, color:'#adb5bd', gradient:'#adb5bd,#dee2e6' },
    { name:'Gold',     xpNeeded:250, color:'#f0c040', gradient:'#f0c040,#ffd700' },
    { name:'Platinum', xpNeeded:500, color:'#00b4d8', gradient:'#00b4d8,#48cae4' },
  ];
  const curLvl = [...levels].reverse().find(l => xp >= l.xpNeeded) || levels[0];
  const nextLvl = levels[levels.indexOf(curLvl) + 1];
  const pct = nextLvl ? Math.min(100, Math.round((xp - curLvl.xpNeeded) / (nextLvl.xpNeeded - curLvl.xpNeeded) * 100)) : 100;

  setText('levelLabel', curLvl.name);
  setText('levelSub', `Level ${levels.indexOf(curLvl) + 1}`);
  setText('levelXP', `${xp} XP`);
  setText('levelNextXP', nextLvl ? `${nextLvl.xpNeeded - xp} XP untuk ${nextLvl.name}` : 'Level Tertinggi!');
  const bar = document.getElementById('levelBar');
  if (bar) { bar.style.width = pct + '%'; bar.style.background = `linear-gradient(90deg,${curLvl.gradient})`; }

  // Streak
  const sessions = getSessionHistory();
  const today    = new Date().toDateString();
  let streak = 0;
  const daySet = new Set(sessions.map(s => new Date(s.ts).toDateString()));
  for (let i = 0; i < 365; i++) {
    const d = new Date(Date.now() - i * 86400000).toDateString();
    if (daySet.has(d)) streak++; else break;
  }
  setText('streakCount', streak);

  // Badge grid
  const grid = document.getElementById('badgeGrid');
  if (!grid) return;
  grid.innerHTML = BADGES_DATA.map(badge => {
    const isEarned = earned.includes(badge.id);
    const tierColors = { bronze:'#cd7f32', silver:'#adb5bd', gold:'#f0c040', platinum:'#00b4d8' };
    const borderColor = isEarned ? (tierColors[badge.tier] || '#00b4d8') : 'rgba(255,255,255,.08)';
    return `<div style="background:rgba(255,255,255,.04);border:1px solid ${borderColor};border-radius:14px;padding:16px 12px;text-align:center;display:flex;flex-direction:column;align-items:center;gap:8px;${isEarned ? '' : 'opacity:.38;filter:grayscale(1)'}">
      <div style="font-size:2rem">${badge.icon}</div>
      <div style="font-size:.8rem;font-weight:700;color:${isEarned ? (tierColors[badge.tier]||'var(--pri-ink)') : 'var(--txt3)'}">${badge.name}</div>
      <div style="font-size:.68rem;color:var(--muted);line-height:1.4">${badge.description.slice(0,60)}...</div>
      ${isEarned ? `<span style="font-size:.65rem;font-weight:700;padding:2px 8px;border-radius:8px;background:rgba(74,222,128,.12);color:#4ade80">✓ Diraih</span>` : ''}
    </div>`;
  }).join('');
}

// =====================================================
// P8 — PRODUCT RECOMMENDER
// =====================================================
let PRODUCTS_DATA = null;

async function loadProducts() {
  try {
    const res = await fetch('data/products.json');
    PRODUCTS_DATA = await res.json();
  } catch { PRODUCTS_DATA = []; }
}

function initRecommender() {
  document.querySelectorAll('#recCatFilter .chart-tab').forEach(btn =>
    btn.addEventListener('click', () => {
      document.querySelectorAll('#recCatFilter .chart-tab').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      renderRecommender(btn.dataset.cat);
    })
  );
  renderRecommender('');
}

function calcProductScore(product) {
  const { ph, turbidity } = state.sensor;
  let score = 50;
  const bw = product.best_when_water || {};
  if (bw.ph_low  && ph < 6.5)    score += 15;
  if (bw.ph_high && ph > 8.5)    score += 15;
  if (bw.tds_high)               score += 10; // assume if flagged it's relevant
  if (bw.chlorine_high)          score += 10;
  if (bw.temp_high)              score -= 5;
  // Skin type match
  if ((product.for_skin_types || []).includes(state.skinType)) score += 20;
  return Math.min(99, Math.max(50, score));
}

function renderRecommender(catFilter = '') {
  if (!PRODUCTS_DATA) {
    const el = document.getElementById('recList');
    if (el) el.innerHTML = '<div style="text-align:center;color:var(--muted);padding:20px">Memuat data produk...</div>';
    return;
  }
  const { ph, temperature, turbidity } = state.sensor;
  const xaiCtx = `pH=${ph}, Suhu=${temperature}°C, Turb=${turbidity}NTU, Kulit=${state.skinType}`;

  let products = PRODUCTS_DATA.map(p => ({ ...p, score: calcProductScore(p) }))
    .sort((a, b) => b.score - a.score);

  if (catFilter) products = products.filter(p => p.category === catFilter);
  products = products.slice(0, 8);

  const el = document.getElementById('recList');
  if (!el) return;
  if (!products.length) {
    el.innerHTML = `<div style="text-align:center;color:var(--muted);padding:20px">${_st2('rec.empty','Tidak ada produk dalam kategori ini.')}</div>`;
    return;
  }
  const catLabel = { moisturizer:'Moisturizer', cleanser:'Cleanser', body_wash:'Body Wash', serum:'Serum', toner:'Toner' };
  const scoreColor = s => s >= 85 ? '#4ade80' : s >= 70 ? '#fdcb6e' : '#00b4d8';
  const fragFree = _st2('rec.fragFree','· Bebas pewangi');
  const matchTxt = _st2('rec.match','cocok');
  const recBecause = _st2('rec.because','Direkomendasikan karena');

  el.innerHTML = products.map((p, i) => `
    <div class="glass-card" style="padding:16px 18px;display:flex;gap:14px;align-items:flex-start">
      <div style="min-width:48px;height:48px;border-radius:10px;background:rgba(0,180,216,.12);display:flex;align-items:center;justify-content:center;font-size:1.5rem;flex-shrink:0">${i===0?'🏆':i===1?'🥈':i===2?'🥉':'📦'}</div>
      <div style="flex:1;min-width:0">
        <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:4px">
          <span style="font-size:.88rem;font-weight:700">${escHtml(p.name)}</span>
          <span style="font-size:.68rem;padding:2px 8px;border-radius:8px;background:rgba(255,255,255,.07);color:var(--muted)">${catLabel[p.category] || p.category}</span>
          <span style="font-size:.7rem;font-weight:800;padding:2px 8px;border-radius:8px;background:rgba(74,222,128,.1);color:${scoreColor(p.score)}">${p.score}% ${matchTxt}</span>
        </div>
        <div style="font-size:.75rem;color:var(--muted);margin-bottom:6px">${escHtml(p.brand || '')} ${p.fragrance_free ? fragFree : ''}</div>
        <div style="font-size:.78rem;padding:8px 10px;background:rgba(0,180,216,.06);border-radius:8px;border-left:3px solid var(--pri);margin-bottom:6px">
          <i class="ph ph-brain-circuit" style="margin-right:4px;color:var(--pri2)"></i><strong>XAI:</strong> ${recBecause} ${xaiCtx}. ${escHtml((loc(p,'scientific_basis')||p.scientific_basis) ? (loc(p,'scientific_basis')||p.scientific_basis).slice(0,100)+'...' : '')}
        </div>
        <div style="font-size:.75rem;color:var(--muted)">${escHtml(loc(p,'how_to_use') || p.how_to_use || '')}</div>
      </div>
    </div>
  `).join('');
}

// =====================================================
// P9 — ENSIKLOPEDIA DERMATOLOGI
// =====================================================
let ENCYCLOPEDIA_DATA = null;

// Helper: ambil field versi bahasa aktif. Kalau EN & ada field_en, pakai itu;
// kalau tidak, fallback ke field ID. Untuk array juga didukung.
function loc(obj, field) {
  if (!obj) return '';
  const lang = (typeof getLang === 'function') ? getLang() : 'id';
  if (lang === 'en' && obj[field + '_en'] != null) return obj[field + '_en'];
  return obj[field];
}

async function loadEncyclopedia() {
  try {
    const res = await fetch('data/encyclopedia.json');
    ENCYCLOPEDIA_DATA = await res.json();
  } catch { ENCYCLOPEDIA_DATA = []; }
}

function initEncyclopedia() {
  document.getElementById('encycSearch')?.addEventListener('input', e => {
    renderEncyclopedia(e.target.value, document.querySelector('#encycFilter .chart-tab.active')?.dataset.trigger || '');
  });
  document.querySelectorAll('#encycFilter .chart-tab').forEach(btn =>
    btn.addEventListener('click', () => {
      document.querySelectorAll('#encycFilter .chart-tab').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      renderEncyclopedia(document.getElementById('encycSearch')?.value || '', btn.dataset.trigger);
    })
  );
  renderEncyclopedia('', '');
}

function isConditionRelevantNow(entry) {
  const { ph, temperature, turbidity } = state.sensor;
  const wt = entry.water_triggers || {};
  if (wt.ph_low  && ph < 6.5)    return true;
  if (wt.ph_high && ph > 8.5)    return true;
  if (wt.temp_high && temperature > 40) return true;
  if (wt.chlorine_high && turbidity > 1) return true; // proxy
  return false;
}

function renderEncyclopedia(query = '', triggerFilter = '') {
  const grid = document.getElementById('encycGrid');
  if (!grid) return;
  if (!ENCYCLOPEDIA_DATA) {
    grid.innerHTML = `<div style="color:var(--muted);padding:20px">${_st2('common.loading','Memuat ensiklopedia...')}</div>`;
    return;
  }
  const q = query.toLowerCase();
  let items = ENCYCLOPEDIA_DATA.filter(e => {
    const nm = (loc(e,'name')||'').toLowerCase();
    const matchQ  = !q || nm.includes(q) || e.name.toLowerCase().includes(q) || (e.tags||[]).some(t => t.includes(q));
    const matchTr = !triggerFilter || (e.water_triggers || {})[triggerFilter];
    return matchQ && matchTr;
  });

  if (!items.length) {
    grid.innerHTML = `<div style="text-align:center;color:var(--muted);padding:32px">${_st2('enc.noResult','Tidak ada hasil ditemukan.')}</div>`;
    return;
  }
  const relevantLabel = _st2('enc.relevantNow','RELEVAN SEKARANG');
  const trigIcons = { ph_low:'ph-flask', ph_high:'ph-flask', tds_high:'ph-tray', chlorine_high:'ph-drop', temp_high:'ph-thermometer-hot' };
  grid.innerHTML = items.map(e => {
    const relevant = isConditionRelevantNow(e);
    const triggers = Object.entries(e.water_triggers || {}).filter(([,v]) => v).map(([k]) =>
      `<i class="ph ${trigIcons[k] || 'ph-warning'}" title="${k}" style="font-size:.9rem;color:var(--pri2)"></i>`
    ).join('');
    return `
      <div onclick="openEncycModal('${e.id}')" style="background:rgba(255,255,255,.04);border:1px solid ${relevant ? 'rgba(0,180,216,.35)' : 'rgba(255,255,255,.08)'};border-radius:14px;padding:16px;cursor:pointer;transition:all .2s;position:relative;overflow:hidden" onmouseover="this.style.background='rgba(255,255,255,.08)'" onmouseout="this.style.background='rgba(255,255,255,.04)'">
        ${relevant ? `<div style="position:absolute;top:8px;right:8px;font-size:.62rem;font-weight:800;padding:2px 8px;border-radius:8px;background:rgba(0,180,216,.2);color:#48cae4;letter-spacing:.06em">${relevantLabel}</div>` : ''}
        <div style="font-size:.88rem;font-weight:700;margin-bottom:6px;padding-right:${relevant?'90px':'0'}">${escHtml(loc(e,'name'))}</div>
        <div style="font-size:.75rem;color:var(--muted);margin-bottom:8px;line-height:1.4">${escHtml((loc(e,'description')||'').slice(0,80))}...</div>
        <div style="display:flex;align-items:center;gap:6px">${triggers}</div>
        <div style="margin-top:8px;display:flex;gap:4px;flex-wrap:wrap">
          ${(loc(e,'tags')||e.tags||[]).slice(0,3).map(t => `<span style="font-size:.65rem;padding:1px 7px;background:rgba(255,255,255,.06);border-radius:6px;color:var(--muted)">${t}</span>`).join('')}
        </div>
      </div>`;
  }).join('');
}

function openEncycModal(id) {
  const entry = (ENCYCLOPEDIA_DATA || []).find(e => e.id === id);
  if (!entry) return;
  const modal = document.getElementById('encycModal');
  const title = document.getElementById('encycModalTitle');
  const body  = document.getElementById('encycModalBody');
  if (!modal || !body) return;
  if (title) title.textContent = loc(entry,'name');

  const recs = (loc(entry,'bathing_recommendations') || entry.bathing_recommendations || []).map(r => `<li style="margin-bottom:6px">${escHtml(r)}</li>`).join('');
  const symp = (loc(entry,'symptoms') || entry.symptoms || []).map(s => `<li style="margin-bottom:4px">${escHtml(s)}</li>`).join('');
  const L = {
    causes:    _st2('enc.causes','Penyebab'),
    symptoms:  _st2('enc.symptoms','Gejala'),
    bathing:   _st2('enc.bathing','Rekomendasi Mandi'),
    doctor:    _st2('enc.doctor','Kapan ke Dokter:'),
    waterRel:  _st2('enc.waterRel','Hubungan Air:'),
  };
  body.innerHTML = `
    <div style="font-size:.82rem;color:var(--muted);margin-bottom:14px;line-height:1.6">${escHtml(loc(entry,'description') || '')}</div>
    ${entry.prevalence ? `<div style="font-size:.78rem;padding:8px 12px;background:rgba(0,180,216,.06);border-radius:8px;margin-bottom:12px"><i class="ph ph-chart-bar" style="margin-right:6px"></i>${escHtml(loc(entry,'prevalence'))}</div>` : ''}
    <h4 style="font-size:.82rem;font-weight:700;margin-bottom:8px;color:var(--pri2)">${L.causes}</h4>
    <p style="font-size:.8rem;color:var(--muted);margin-bottom:12px;line-height:1.5">${escHtml(loc(entry,'causes') || '')}</p>
    ${symp ? `<h4 style="font-size:.82rem;font-weight:700;margin-bottom:8px;color:var(--pri2)">${L.symptoms}</h4><ul style="font-size:.8rem;color:var(--muted);padding-left:16px;margin-bottom:12px">${symp}</ul>` : ''}
    <h4 style="font-size:.82rem;font-weight:700;margin-bottom:8px;color:#f0c040"><i class="ph ph-shower" style="margin-right:4px"></i>${L.bathing}</h4>
    <ul style="font-size:.8rem;color:var(--muted);padding-left:16px;margin-bottom:12px">${recs}</ul>
    <div style="font-size:.78rem;padding:8px 12px;background:rgba(255,107,107,.06);border-radius:8px;border-left:3px solid rgba(255,107,107,.4);margin-bottom:12px">
      <i class="ph ph-stethoscope" style="margin-right:4px;color:#ff6b6b"></i><strong style="color:#ff6b6b">${L.doctor}</strong> ${escHtml(loc(entry,'when_to_see_doctor') || '')}
    </div>
    ${entry.water_triggers_explanation ? `<div style="font-size:.78rem;padding:8px 12px;background:rgba(0,180,216,.06);border-radius:8px"><i class="ph ph-info" style="margin-right:4px;color:var(--pri2)"></i><strong>${L.waterRel}</strong> ${escHtml(loc(entry,'water_triggers_explanation'))}</div>` : ''}`;

  modal.style.display = 'flex';
}

function closeEncycModal() {
  document.getElementById('encycModal').style.display = 'none';
}

// =====================================================
// P11 — MULTI-PROFILE (Firebase RTDB)
// Tersimpan di profiles/{uid}/list dan profiles/{uid}/active
// localStorage dipakai sebagai cache offline-first.
// =====================================================
let _profilesCache = [];
let _activeProfileId = null;

function _profilesRef() {
  const uid = getAuthUser()?.uid;
  return (state.db && uid) ? state.db.ref(`profiles/${uid}`) : null;
}

function getProfiles()        { return _profilesCache; }
function getActiveProfile()   { return _profilesCache.find(p => p.id === _activeProfileId) || _profilesCache[0]; }
function getActiveProfileIdx(){ const i = _profilesCache.findIndex(p => p.id === _activeProfileId); return i >= 0 ? i : 0; }

function _saveProfilesLocal() {
  try { localStorage.setItem('aquent-profiles-v2', JSON.stringify({ list:_profilesCache, active:_activeProfileId })); } catch {}
}
function _loadProfilesLocal() {
  try {
    const raw = localStorage.getItem('aquent-profiles-v2');
    if (!raw) return;
    const { list, active } = JSON.parse(raw);
    if (Array.isArray(list)) _profilesCache = list;
    if (active) _activeProfileId = active;
  } catch {}
}

async function ensureDefaultProfile() {
  if (_profilesCache.length) return;
  const id = 'p_' + Date.now();
  const profile = {
    id,
    name:      state.userName || getAuthUser()?.displayName || 'Pengguna 1',
    skinType:  state.skinType || 'normal',
    waterGoal: state.waterGoal || 10,
    avatar:    '👤',
    createdAt: Date.now(),
  };
  _profilesCache = [profile];
  _activeProfileId = id;
  _saveProfilesLocal();
  await _syncProfilesUp();
}

async function _syncProfilesUp() {
  const ref = _profilesRef();
  if (!ref || !state.connected) return;
  try {
    await ref.set({ list:_profilesCache, active:_activeProfileId, updatedAt: Date.now() });
  } catch (e) { console.warn('Profile sync up failed:', e.message); }
}

async function _syncProfilesDown() {
  const ref = _profilesRef();
  if (!ref) return;
  try {
    const snap = await ref.once('value');
    const data = snap.val();
    if (data && Array.isArray(data.list) && data.list.length) {
      _profilesCache  = data.list;
      _activeProfileId = data.active || data.list[0]?.id;
      _saveProfilesLocal();
      _applyActiveProfile();
    } else {
      // First time → upload local default
      await ensureDefaultProfile();
    }
  } catch (e) {
    console.warn('Profile sync down failed:', e.message);
    if (!_profilesCache.length) await ensureDefaultProfile();
  }
}

function _applyActiveProfile() {
  const p = getActiveProfile();
  if (!p) return;
  state.userName  = p.name;
  state.skinType  = p.skinType;
  state.waterGoal = p.waterGoal;
  localStorage.setItem('aquent-name',  p.name);
  localStorage.setItem('aquent-skin',  p.skinType);
  localStorage.setItem('aquent-goal',  p.waterGoal);
  document.querySelectorAll('.skin-btn').forEach(b => b.classList.toggle('active', b.dataset.skin === p.skinType));
  if (typeof renderGuideFromJSON === 'function') renderGuideFromJSON();
  if (typeof updateAIContext === 'function')     updateAIContext();
  updateProfileCount();
}

function initMultiProfile() {
  _loadProfilesLocal();
  if (!_profilesCache.length) ensureDefaultProfile();

  // Inject profile switcher button into sidebar footer
  const footer = document.querySelector('.sidebar-footer');
  if (footer && !document.getElementById('profileSwitcherBtn')) {
    const btn = document.createElement('button');
    btn.id = 'profileSwitcherBtn';
    btn.className = 'sidebar-settings-btn';
    btn.style.marginBottom = '8px';
    btn.innerHTML = '<i class="ph-duotone ph-users-three"></i> Profil (<span id="profileCount">1</span>)';
    btn.onclick = openProfileSwitcher;
    footer.insertBefore(btn, footer.firstChild);
  }
  updateProfileCount();

  // Sync setelah Firebase + auth siap
  onAuthReady(({ user }) => {
    if (!user) return;
    const tryDown = () => { if (state.db && state.connected) _syncProfilesDown(); else setTimeout(tryDown, 800); };
    tryDown();
  });
}

function updateProfileCount() {
  const c = document.getElementById('profileCount');
  if (c) c.textContent = _profilesCache.length;
}

function openProfileSwitcher() {
  const profiles = _profilesCache;
  const activeIdx = getActiveProfileIdx();
  const modal    = document.createElement('div');
  modal.className = 'modal-overlay';
  modal.style.cssText = 'display:flex';
  const skinLabel = { dry:'Kering', oily:'Berminyak', normal:'Normal', combination:'Kombinasi', sensitive:'Sensitif' };
  modal.innerHTML = `
    <div class="glass-card modal-card" style="max-width:380px;width:100%;padding:24px">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px">
        <h3 style="font-size:1rem;font-weight:700"><i class="ph-duotone ph-users-three" style="margin-right:6px;color:var(--pri2)"></i>Profil Keluarga</h3>
        <button onclick="this.closest('.modal-overlay').remove()" style="background:none;border:none;color:rgba(202,240,248,.6);cursor:pointer;font-size:1.2rem"><i class="ph ph-x"></i></button>
      </div>
      <div style="font-size:.7rem;color:var(--muted);margin-bottom:8px">${state.connected ? '☁️ Tersinkron Firebase' : '📱 Tersimpan lokal'}</div>
      <div style="display:flex;flex-direction:column;gap:8px;margin-bottom:16px">
        ${profiles.map((p, i) => `
          <div onclick="switchProfile('${p.id}');this.closest('.modal-overlay').remove()" style="display:flex;align-items:center;gap:12px;padding:12px;border-radius:10px;background:${i===activeIdx?'rgba(0,180,216,.12)':'rgba(255,255,255,.04)'};border:1px solid ${i===activeIdx?'rgba(0,180,216,.3)':'rgba(255,255,255,.08)'};cursor:pointer">
            <div style="font-size:1.4rem">${p.avatar || '👤'}</div>
            <div style="flex:1"><div style="font-size:.88rem;font-weight:600">${escHtml(p.name)}</div><div style="font-size:.72rem;color:var(--muted)">${skinLabel[p.skinType] || p.skinType} · target ${p.waterGoal} L</div></div>
            ${i===activeIdx?'<i class="ph-fill ph-check-circle" style="color:#4ade80"></i>':''}
            ${profiles.length > 1 ? `<button onclick="event.stopPropagation();deleteProfile('${p.id}',this)" style="background:none;border:none;color:rgba(255,107,107,.6);cursor:pointer;padding:4px"><i class="ph ph-trash"></i></button>` : ''}
          </div>`).join('')}
      </div>
      ${profiles.length < 5 ? `<button class="btn-glow" onclick="addProfile(this)" style="width:100%;font-size:.85rem"><i class="ph-fill ph-plus-circle"></i> Tambah Profil (${profiles.length}/5)</button>` : '<div style="text-align:center;font-size:.78rem;color:var(--muted)">Maksimal 5 profil tercapai.</div>'}
    </div>`;
  document.body.appendChild(modal);
}

async function switchProfile(profileId) {
  if (!_profilesCache.find(p => p.id === profileId)) return;
  _activeProfileId = profileId;
  _saveProfilesLocal();
  _applyActiveProfile();
  await _syncProfilesUp();
  addLog(`Profil beralih ke: ${getActiveProfile()?.name}`, 'ok');
}

async function addProfile(btn) {
  const name = await uiPrompt('Nama profil baru:', { title:'Tambah Profil', placeholder:'mis. Adik, Ibu', okText:'Tambah' });
  if (!name || !name.trim()) return;
  if (_profilesCache.length >= 5) { uiToast('Maksimal 5 profil.', 'warn'); return; }
  const id = 'p_' + Date.now();
  _profilesCache.push({ id, name: name.trim(), skinType:'normal', waterGoal:10, avatar:'👤', createdAt: Date.now() });
  _saveProfilesLocal();
  await _syncProfilesUp();
  updateProfileCount();
  btn.closest('.modal-overlay')?.remove();
  openProfileSwitcher();
}

async function deleteProfile(profileId, btn) {
  if (_profilesCache.length <= 1) return;
  if (!await uiConfirm('Hapus profil ini? Riwayat tetap tersimpan.',
      { title:'Hapus Profil', danger:true, okText:'Hapus' })) return;
  _profilesCache = _profilesCache.filter(p => p.id !== profileId);
  if (_activeProfileId === profileId) _activeProfileId = _profilesCache[0].id;
  _saveProfilesLocal();
  await _syncProfilesUp();
  _applyActiveProfile();
  btn.closest('.modal-overlay')?.remove();
  openProfileSwitcher();
}

// =====================================================
// P12 — PUSH NOTIFICATIONS (FCM Web Push)
// Pakai notification_templates.json dari Peneliti.
// VAPID key bisa di-set via window.FCM_VAPID_KEY (set di app.html)
// atau localStorage 'aquent-vapid-key' (utk dev).
// =====================================================
let _fcmToken = null;
let _notifTemplates = null;

async function _loadNotifTemplates() {
  if (_notifTemplates) return _notifTemplates;
  try {
    const r = await fetch('data/notification_templates.json');
    _notifTemplates = await r.json();
  } catch { _notifTemplates = {}; }
  return _notifTemplates;
}

function _getVapidKey() {
  return (typeof window !== 'undefined' && window.FCM_VAPID_KEY)
      || localStorage.getItem('aquent-vapid-key')
      || null;
}

function initPushNotifications() {
  if (!('Notification' in window)) return;
  if (!('serviceWorker' in navigator)) return;
  _loadNotifTemplates();

  // FCM service worker HANYA di-register kalau VAPID key tersedia.
  // Tanpa VAPID, push remote tidak aktif — jadi tidak perlu SW kedua
  // (mencegah konflik dengan /sw.js PWA yang bisa memicu reload loop).
  const vapid = _getVapidKey();
  if (vapid) {
    navigator.serviceWorker.register('/firebase-messaging-sw.js', { scope: '/firebase-cloud-messaging-push-scope' })
      .then(reg => {
        if (Notification.permission === 'granted') {
          _subscribeFcm(reg).catch(e => console.warn('FCM subscribe err:', e.message));
        }
      })
      .catch(e => console.warn('FCM SW register failed:', e.message));
  }

  // Trigger lokal (kalau push backend belum ada): cek kualitas air tiap 5 mnt
  if (Notification.permission === 'granted') scheduleLocalAlerts();
}

async function _subscribeFcm(reg) {
  const vapid = _getVapidKey();
  if (!vapid) {
    console.info('[AQUENT] FCM VAPID key belum di-set — push remote dinonaktifkan, fallback ke notifikasi lokal.');
    return null;
  }
  if (typeof firebase === 'undefined' || !firebase.messaging) {
    // firebase-messaging-compat tidak ter-load di app.html — load on demand
    await _loadScript('https://www.gstatic.com/firebasejs/12.12.1/firebase-messaging-compat.js');
  }
  try {
    const messaging = firebase.messaging();
    const token = await messaging.getToken({ vapidKey: vapid, serviceWorkerRegistration: reg });
    if (!token) return null;
    _fcmToken = token;
    await _saveFcmToken(token);

    // Foreground messages
    messaging.onMessage(payload => {
      const { title, body, icon } = payload.notification || {};
      reg.showNotification(title || 'AQUENT', {
        body: body || '',
        icon: icon || '/icons/icon-192.png',
        badge: '/icons/icon-192.png',
      });
    });
    addLog('Push notifikasi tersinkron ✓', 'ok');
    return token;
  } catch (e) {
    console.warn('FCM token error:', e.message);
    return null;
  }
}

async function _saveFcmToken(token) {
  const uid = getAuthUser()?.uid;
  if (!uid || !state.db) return;
  try {
    await state.db.ref(`fcmTokens/${uid}/${token}`).set({
      ts: Date.now(),
      ua: navigator.userAgent.slice(0, 200),
    });
  } catch (e) { console.warn('Save FCM token failed:', e.message); }
}

function _loadScript(src) {
  return new Promise((res, rej) => {
    const s = document.createElement('script'); s.src = src;
    s.onload = res; s.onerror = () => rej(new Error('script load fail: ' + src));
    document.head.appendChild(s);
  });
}

async function requestNotificationPermission() {
  if (!('Notification' in window)) {
    uiToast('Browser Anda tidak mendukung notifikasi.', 'warn'); return;
  }
  const perm = await Notification.requestPermission();
  addLog('Notifikasi: ' + (perm === 'granted' ? 'Diizinkan ✓' : 'Ditolak'), perm === 'granted' ? 'ok' : 'info');
  if (perm === 'granted') {
    if ('serviceWorker' in navigator) {
      const reg = await navigator.serviceWorker.ready;
      _subscribeFcm(reg).catch(e => console.warn(e.message));
    }
    scheduleLocalAlerts();
  }
}

function _showNotif(template, vars = {}) {
  let title = template?.title || 'AQUENT';
  let body  = template?.body  || '';
  Object.entries(vars).forEach(([k,v]) => {
    title = title.replace(new RegExp(`{{${k}}}`, 'g'), v);
    body  = body .replace(new RegExp(`{{${k}}}`, 'g'), v);
  });
  if (Notification.permission === 'granted') {
    new Notification(title, {
      body,
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-192.png',
      vibrate: template?.vibrate || [200,100,200],
      tag: template?.tag || 'aquent-alert',
    });
  }
}

let _alertCooldown = {};
function scheduleLocalAlerts() {
  if (window._aquentAlertTimer) return;       // sekali aja
  window._aquentAlertTimer = setInterval(async () => {
    if (Notification.permission !== 'granted') return;
    const tpls = await _loadNotifTemplates();
    const { ph, temperature, turbidity } = state.sensor;
    const { total } = calcQualityScore();
    const now = Date.now();

    // Cooldown 30 menit per trigger
    const trigger = (key, tplKey, vars) => {
      if (!tpls[tplKey]) return;
      if ((_alertCooldown[key] || 0) > now) return;
      _alertCooldown[key] = now + 30 * 60 * 1000;
      _showNotif(tpls[tplKey], vars);
    };

    if (total < 60)             trigger('lowQs',    'low_quality_score', { score: total });
    if (TH && (ph < TH.ph.min || ph > TH.ph.max))   trigger('phOut', 'ph_out_of_range', { ph });
    if (TH && temperature > TH.temp.max + 2)        trigger('tempHi','temp_too_high', { temp: temperature });
    if (TH && turbidity > TH.turbidity.max * 1.5)   trigger('turbHi','turbidity_high', { turbidity });
  }, 5 * 60 * 1000);
}

// Add notification toggle to settings section (call from initSettings)
function addNotifToggle() {
  const settingCard = document.querySelector('.settings-card, .modal-card');
  if (!settingCard || document.getElementById('notifToggleBtn')) return;
  const div = document.createElement('div');
  div.style.cssText = 'display:flex;align-items:center;justify-content:space-between;padding:12px 0;border-top:1px solid rgba(255,255,255,.08);margin-top:12px';
  const granted = Notification.permission === 'granted';
  div.innerHTML = `<div><div style="font-size:.85rem;font-weight:500"><i class="ph ph-bell" style="margin-right:6px"></i>Push Notifikasi</div><div style="font-size:.72rem;color:var(--muted)">Alert kualitas air buruk</div></div>
    <button id="notifToggleBtn" class="btn-outline" onclick="requestNotificationPermission()" style="font-size:.78rem;padding:6px 14px">${granted ? '✓ Aktif' : 'Aktifkan'}</button>`;
  settingCard.appendChild(div);
}

// =====================================================
// P15 — IN-APP SURVEY
// =====================================================
const SURVEY_SECTIONS = [
  {
    id:'A', title:'Demografi', desc:'Informasi dasar untuk keperluan penelitian akademik. Data bersifat anonim.',
    questions:[
      { id:'A1', text:'Jenis Kelamin', type:'radio', options:['Laki-laki','Perempuan','Lainnya / Tidak ingin menyebutkan'] },
      { id:'A2', text:'Usia', type:'radio', options:['< 17 tahun','17–24 tahun','25–34 tahun','35–44 tahun','45–54 tahun','≥ 55 tahun'] },
      { id:'A3', text:'Pendidikan terakhir', type:'radio', options:['SMP/Sederajat','SMA/SMK/Sederajat','Diploma (D1–D3)','Sarjana (S1/D4)','Pascasarjana (S2/S3)'] },
      { id:'A4', text:'Tipe kulit Anda (self-assessed)', type:'radio', options:['Kering','Berminyak','Normal','Kombinasi (berminyak di T-zone, kering di pipi)','Sensitif','Tidak tahu'] },
      { id:'A5', text:'Kondisi kulit yang didiagnosis dokter (jika ada)', type:'radio', options:['Tidak ada','Dermatitis/Eksim','Psoriasis','Jerawat (Akne)','Rosacea','Lainnya'] },
      { id:'A6', text:'Seberapa sering Anda menggunakan aplikasi kesehatan di smartphone?', type:'radio', options:['Tidak pernah','Jarang (< 1 kali/minggu)','Kadang-kadang (1–3 kali/minggu)','Sering (4–6 kali/minggu)','Setiap hari'] },
      { id:'A7', text:'Berapa lama Anda menggunakan AQUENT saat evaluasi ini?', type:'radio', options:['< 5 menit','5–15 menit','15–30 menit','30–60 menit','> 60 menit'] },
      { id:'A8', text:'Fitur AQUENT yang Anda gunakan (boleh pilih lebih dari satu)', type:'checkbox', options:['Dashboard sensor real-time','AI Chat Konsultan Kulit','Scanner Risiko Kulit','Ensiklopedia Dermatologi','Dermal-Guide (panduan mandi)','Rekomendasi Produk','Eco-Monitor','Histori & Tren'] },
    ],
  },
  {
    id:'B', title:'TAM — Penerimaan Teknologi', desc:'Skala 1 (Sangat Tidak Setuju) — 7 (Sangat Setuju). Bagian ini menilai persepsi kegunaan, kemudahan, sikap, dan niat penggunaan AQUENT.',
    questions:[
      { id:'PU1', text:'Menggunakan AQUENT membantu saya memantau kualitas air mandi yang berpotensi membahayakan kulit saya', type:'likert7' },
      { id:'PU2', text:'Menggunakan AQUENT meningkatkan kesadaran saya tentang faktor air yang mempengaruhi kesehatan kulit saya', type:'likert7' },
      { id:'PU3', text:'Menggunakan AQUENT memungkinkan saya mendapatkan rekomendasi perawatan kulit yang lebih personal', type:'likert7' },
      { id:'PU4', text:'Menggunakan AQUENT meningkatkan efisiensi rutinitas mandi saya dalam kaitannya dengan kesehatan kulit', type:'likert7' },
      { id:'PU5', text:'Menggunakan AQUENT berguna untuk membantu saya memilih produk perawatan kulit yang tepat sesuai kondisi air', type:'likert7' },
      { id:'PU6', text:'Menggunakan AQUENT secara keseluruhan berguna dalam mendukung perawatan kesehatan kulit saya', type:'likert7' },
      { id:'PEOU1', text:'Antarmuka AQUENT mudah dipelajari tanpa panduan khusus', type:'likert7' },
      { id:'PEOU2', text:'Saya dapat menavigasi fitur-fitur AQUENT dengan mudah', type:'likert7' },
      { id:'PEOU3', text:'Informasi yang ditampilkan dalam AQUENT mudah saya pahami', type:'likert7' },
      { id:'PEOU4', text:'Penjelasan AI dalam AQUENT menggunakan bahasa yang dapat saya mengerti dengan mudah', type:'likert7' },
      { id:'PEOU5', text:'Saya tidak memerlukan banyak usaha mental untuk menggunakan AQUENT', type:'likert7' },
      { id:'PEOU6', text:'Secara keseluruhan, AQUENT mudah digunakan', type:'likert7' },
      { id:'ATU1', text:'Menggunakan AQUENT adalah pengalaman yang menyenangkan', type:'likert7' },
      { id:'ATU2', text:'Ide untuk menggunakan AQUENT sebagai bagian dari rutinitas mandi saya adalah ide yang baik', type:'likert7' },
      { id:'ATU3', text:'Saya memiliki sikap positif terhadap penggunaan AQUENT untuk memantau kualitas air mandi saya', type:'likert7' },
      { id:'BIU1', text:'Saya berniat menggunakan AQUENT secara rutin di masa mendatang', type:'likert7' },
      { id:'BIU2', text:'Saya akan merekomendasikan AQUENT kepada anggota keluarga atau teman yang peduli kesehatan kulit', type:'likert7' },
      { id:'BIU3', text:'Jika AQUENT tersedia sebagai produk resmi, saya bersedia membayar untuk menggunakannya', type:'likert7' },
    ],
  },
  {
    id:'C', title:'SUS — Kegunaan Sistem', desc:'Skala 1 (Sangat Tidak Setuju) — 5 (Sangat Setuju). Berikan penilaian jujur berdasarkan pengalaman Anda.',
    questions:[
      { id:'SUS1', text:'Saya rasa saya ingin menggunakan sistem ini secara sering', type:'likert5' },
      { id:'SUS2', text:'Saya merasa sistem ini terlalu kompleks tanpa alasan yang jelas', type:'likert5' },
      { id:'SUS3', text:'Saya merasa sistem ini mudah digunakan', type:'likert5' },
      { id:'SUS4', text:'Saya rasa saya membutuhkan bantuan dari orang teknis untuk menggunakan sistem ini', type:'likert5' },
      { id:'SUS5', text:'Saya merasa berbagai fungsi dalam sistem ini terintegrasi dengan baik', type:'likert5' },
      { id:'SUS6', text:'Saya merasa terlalu banyak ketidakkonsistenan dalam sistem ini', type:'likert5' },
      { id:'SUS7', text:'Saya bayangkan kebanyakan orang akan belajar menggunakan sistem ini dengan sangat cepat', type:'likert5' },
      { id:'SUS8', text:'Saya merasa sistem ini sangat rumit untuk digunakan', type:'likert5' },
      { id:'SUS9', text:'Saya merasa sangat percaya diri menggunakan sistem ini', type:'likert5' },
      { id:'SUS10', text:'Saya perlu banyak belajar sebelum bisa menggunakan sistem ini dengan lancar', type:'likert5' },
    ],
  },
  {
    id:'D', title:'UEQ-S — Pengalaman Pengguna', desc:'Geser slider dari kiri (−3) ke kanan (+3) untuk setiap pasang kata berlawanan.',
    questions:[
      { id:'D1', text:'', type:'bipolar', left:'Menghalangi', right:'Mendukung' },
      { id:'D2', text:'', type:'bipolar', left:'Rumit', right:'Mudah' },
      { id:'D3', text:'', type:'bipolar', left:'Tidak efisien', right:'Efisien' },
      { id:'D4', text:'', type:'bipolar', left:'Membingungkan', right:'Jelas' },
      { id:'D5', text:'', type:'bipolar', left:'Membosankan', right:'Menarik' },
      { id:'D6', text:'', type:'bipolar', left:'Tidak menarik', right:'Menarik perhatian' },
      { id:'D7', text:'', type:'bipolar', left:'Konvensional', right:'Inovatif' },
      { id:'D8', text:'', type:'bipolar', left:'Biasa', right:'Luar biasa' },
      { id:'D9', text:'', type:'bipolar', left:'Buruk', right:'Baik' },
      { id:'D10', text:'', type:'bipolar', left:'Tidak menyenangkan', right:'Menyenangkan' },
      { id:'D11', text:'', type:'bipolar', left:'Tidak dapat diprediksi', right:'Dapat diprediksi' },
      { id:'D12', text:'', type:'bipolar', left:'Tidak aman', right:'Aman' },
    ],
  },
  {
    id:'E', title:'XAI — Kepercayaan terhadap AI', desc:'Skala 1 (Sangat Tidak Setuju) — 7 (Sangat Setuju). Evaluasi khusus fitur Explainable AI pada AQUENT.',
    questions:[
      { id:'XAIT1', text:'Penjelasan AI di AQUENT membantu saya memahami MENGAPA air dikatakan memiliki kualitas tertentu', type:'likert7' },
      { id:'XAIT2', text:'Bar kontribusi faktor (pH/suhu/kekeruhan) menjelaskan penyebab skor dengan cara yang dapat saya mengerti', type:'likert7' },
      { id:'XAIT3', text:'Confidence score (tingkat keyakinan AI) membantu saya menilai seberapa dapat dipercaya rekomendasi tersebut', type:'likert7' },
      { id:'XAIT4', text:'Penjelasan AI dalam AQUENT lebih transparan dibanding aplikasi kesehatan lain yang pernah saya gunakan', type:'likert7' },
      { id:'AIT1', text:'Saya mempercayai rekomendasi yang diberikan oleh AI AQUENT', type:'likert7' },
      { id:'AIT2', text:'Saya merasa AI AQUENT memberikan penjelasan yang jujur dan tidak menyesatkan', type:'likert7' },
      { id:'AIT3', text:'Pengetahuan bahwa AI menggunakan data sensor nyata meningkatkan kepercayaan saya terhadap rekomendasinya', type:'likert7' },
      { id:'AIT4', text:'Disclaimer medis yang ditampilkan AI membuat saya lebih nyaman menggunakan rekomendasinya', type:'likert7' },
    ],
  },
  {
    id:'F', title:'Skala Khusus AQUENT', desc:'Skala 1 (Sangat Tidak Setuju) — 7 (Sangat Setuju). Menilai aspek unik AQUENT: literasi air, perubahan perilaku, privasi, dan ekologi.',
    questions:[
      { id:'WQL1', text:'Setelah menggunakan AQUENT, saya lebih memahami bagaimana pH air dapat mempengaruhi kulit saya', type:'likert7' },
      { id:'WQL2', text:'AQUENT meningkatkan pemahaman saya tentang bahaya klorin berlebih dalam air mandi', type:'likert7' },
      { id:'WQL3', text:'Saya sekarang lebih memahami perbedaan antara air sadah (TDS tinggi) dan air lunak serta dampaknya pada kulit', type:'likert7' },
      { id:'WQL4', text:'Ensiklopedia Dermatologi AQUENT meningkatkan pengetahuan saya tentang kondisi kulit yang berkaitan dengan kualitas air', type:'likert7' },
      { id:'BCI1', text:'Setelah menggunakan AQUENT, saya berencana mengubah rutinitas mandi saya (durasi, suhu, atau produk yang digunakan)', type:'likert7' },
      { id:'BCI2', text:'AQUENT memotivasi saya untuk lebih memperhatikan suhu air saat mandi', type:'likert7' },
      { id:'BCI3', text:'Informasi dari AQUENT mendorong saya untuk mempertimbangkan pemasangan filter shower', type:'likert7' },
      { id:'BCI4', text:'Saya berencana menggunakan data AQUENT saat berkonsultasi dengan dokter kulit', type:'likert7' },
      { id:'IDPT1', text:'Saya merasa nyaman dengan data sensor air saya disimpan oleh AQUENT', type:'likert7' },
      { id:'IDPT2', text:'Saya mempercayai bahwa AQUENT tidak akan menyalahgunakan data pribadi dan data kulit saya', type:'likert7' },
      { id:'IDPT3', text:'Pengetahuan bahwa foto kulit tidak disimpan oleh Scanner membuat saya lebih nyaman menggunakannya', type:'likert7' },
      { id:'IDPT4', text:'Saya bersedia berbagi data anonim saya untuk meningkatkan akurasi AI AQUENT di masa depan', type:'likert7' },
      { id:'SRP1', text:'Saya percaya bahwa rekomendasi AQUENT didasarkan pada penelitian ilmiah yang valid', type:'likert7' },
      { id:'SRP2', text:'Referensi ilmiah yang dikutip dalam ensiklopedia (WHO, jurnal dermatologi) meningkatkan kepercayaan saya', type:'likert7' },
      { id:'SRP3', text:'Ambang batas parameter air (pH, suhu, klorin, TDS) yang digunakan AQUENT terasa ilmiah dan masuk akal', type:'likert7' },
      { id:'SRP4', text:'AQUENT berhasil menerjemahkan temuan penelitian ilmiah menjadi saran praktis yang mudah dipahami pengguna awam', type:'likert7' },
      { id:'ECO1', text:'Fitur Eco-Monitor membuat saya lebih sadar tentang konsumsi air yang saya gunakan saat mandi', type:'likert7' },
      { id:'ECO2', text:'Estimasi konsumsi air dan energi yang ditampilkan AQUENT memotivasi saya untuk mandi lebih hemat', type:'likert7' },
      { id:'ECO3', text:'Sistem badge/gamifikasi AQUENT mendorong saya untuk membentuk kebiasaan mandi yang lebih baik', type:'likert7' },
      { id:'ECO4', text:'Melihat data penggunaan air saya secara nyata (dalam liter) lebih memotivasi daripada hanya melihat durasi mandi', type:'likert7' },
    ],
  },
  {
    id:'G', title:'Evaluasi Fitur per Komponen', desc:'Nilai setiap fitur yang Anda gunakan: 1 (Sangat Buruk) — 5 (Sangat Baik). Pilih N/A jika fitur tidak digunakan.',
    questions:[
      { id:'G1', text:'Dashboard Sensor Real-Time — tampilan 5 parameter (pH, suhu, kekeruhan, TDS, klorin)', type:'likert5na' },
      { id:'G2', text:'Skor Kualitas Air + Grade — angka 0–100 dengan grade A–F', type:'likert5na' },
      { id:'G3', text:'AI Chat Konsultan Kulit (AQUA) — percakapan dengan AI untuk saran kulit', type:'likert5na' },
      { id:'G4', text:'Penjelasan XAI — bar faktor kontribusi dan tingkat kepercayaan AI', type:'likert5na' },
      { id:'G5', text:'Scanner Risiko Kulit — analisis kondisi kulit dari kamera', type:'likert5na' },
      { id:'G6', text:'Ensiklopedia Dermatologi — informasi 41 kondisi kulit', type:'likert5na' },
      { id:'G7', text:'Dermal-Guide — panduan mandi langkah per langkah sesuai kondisi', type:'likert5na' },
      { id:'G8', text:'Rekomendasi Produk — saran produk skincare sesuai kondisi air dan kulit', type:'likert5na' },
      { id:'G9', text:'Eco-Monitor — estimasi konsumsi air dan energi', type:'likert5na' },
      { id:'G10', text:'Histori & Tren — grafik perubahan kualitas air dari waktu ke waktu', type:'likert5na' },
      { id:'G11', text:'Sistem Badge/Gamifikasi — penghargaan untuk kebiasaan mandi yang baik', type:'likert5na' },
      { id:'G12', text:'Desain Visual & Antarmuka — tampilan keseluruhan aplikasi', type:'likert5na' },
    ],
  },
  {
    id:'H', title:'Pertanyaan Terbuka', desc:'Tuliskan jawaban Anda secara bebas (opsional, maks. 300 karakter).',
    questions:[
      { id:'H1', text:'Fitur mana yang menurut Anda paling bermanfaat dan mengapa?', type:'textarea' },
      { id:'H2', text:'Apa hambatan atau kesulitan terbesar yang Anda alami saat menggunakan AQUENT?', type:'textarea' },
      { id:'H3', text:'Sejauh mana penjelasan AI (XAI) membantu Anda memahami kondisi air mandi Anda? Jelaskan dengan kata-kata Anda sendiri.', type:'textarea' },
      { id:'H4', text:'Apa satu fitur atau peningkatan yang paling ingin Anda lihat di AQUENT di masa mendatang?', type:'textarea' },
    ],
  },
];

let surveyStep = 0;
const surveyAnswers = {};

function shouldShowSurvey() {
  if (localStorage.getItem('aquent-survey-done')) return false;
  const sessions = getSessionHistory().filter(s => {
    const d = new Date(s.ts);
    return (Date.now() - s.ts) < 7 * 86400000;
  });
  return sessions.length >= 3;
}

function initSurvey() {
  surveyStep = 0;
  // Check trigger
  setTimeout(() => {
    if (shouldShowSurvey()) openSurvey();
  }, 8000);
  // Manual trigger from settings
}

function openSurvey() {
  surveyStep = 0;
  renderSurveyStep();
  document.getElementById('surveyOverlay').style.display = 'flex';
}

function closeSurvey() { document.getElementById('surveyOverlay').style.display = 'none'; }

async function skipSurvey() {
  if (!await uiConfirm('Lewati kuesioner ini? Anda dapat mengisinya nanti dari Settings.',
      { title:'Lewati Kuesioner', okText:'Lewati' })) return;
  closeSurvey();
}

function renderSurveyStep() {
  const section = SURVEY_SECTIONS[surveyStep];
  if (!section) return;
  const total   = SURVEY_SECTIONS.length;
  const pct     = Math.round((surveyStep / total) * 100);

  setText('surveyStepLabel', `Bagian ${surveyStep + 1} / ${total} — ${section.title}`);
  const prog = document.getElementById('surveyProgress');
  if (prog) prog.style.width = pct + '%';

  const backBtn = document.getElementById('surveyBackBtn');
  const nextBtn = document.getElementById('surveyNextBtn');
  if (backBtn) backBtn.disabled = surveyStep === 0;
  if (nextBtn) nextBtn.innerHTML = surveyStep === total - 1
    ? '<i class="ph-fill ph-paper-plane-tilt"></i> Kirim'
    : 'Lanjut <i class="ph ph-arrow-right"></i>';

  const body = document.getElementById('surveyBody');
  if (!body) return;
  body.innerHTML = `
    <h4 style="font-size:.95rem;font-weight:700;margin-bottom:4px">${section.title}</h4>
    <p style="font-size:.78rem;color:var(--muted);margin-bottom:16px">${section.desc}</p>
    ${section.questions.map(q => renderSurveyQuestion(q)).join('')}`;
}

function renderSurveyQuestion(q) {
  const saved = surveyAnswers[q.id];
  if (q.type === 'radio') {
    const opts = q.options.map((o, i) => `
      <label style="display:flex;align-items:center;gap:8px;padding:8px 12px;border-radius:8px;cursor:pointer;background:${saved===String(i)?'rgba(0,180,216,.12)':'rgba(255,255,255,.04)'};border:1px solid ${saved===String(i)?'rgba(0,180,216,.3)':'rgba(255,255,255,.07)'};margin-bottom:6px;font-size:.82rem;transition:.15s">
        <input type="radio" name="q_${q.id}" value="${i}" ${saved===String(i)?'checked':''} onchange="surveyAnswers['${q.id}']=this.value;this.closest('.survey-q').querySelectorAll('label').forEach(l=>l.style.background='rgba(255,255,255,.04)');this.closest('label').style.background='rgba(0,180,216,.12)'">
        ${o}
      </label>`).join('');
    return `<div class="survey-q" style="margin-bottom:16px"><div style="font-size:.82rem;font-weight:600;margin-bottom:8px">${q.text}</div>${opts}</div>`;
  }
  if (q.type === 'likert7' || q.type === 'likert5') {
    const max = q.type === 'likert7' ? 7 : 5;
    const nums = Array.from({length:max}, (_,i) => i+1);
    return `<div class="survey-q" style="margin-bottom:20px">
      <div style="font-size:.82rem;font-weight:600;margin-bottom:10px">${q.text}</div>
      <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
        <span style="font-size:.7rem;color:var(--muted);width:90px;text-align:right">${q.type==='likert7'?'Sangat Tidak Setuju':'Tidak Setuju'}</span>
        ${nums.map(n => `<label style="display:flex;flex-direction:column;align-items:center;gap:4px;cursor:pointer">
          <input type="radio" name="q_${q.id}" value="${n}" ${saved===String(n)?'checked':''} onchange="surveyAnswers['${q.id}']=this.value">
          <span style="width:32px;height:32px;border-radius:50%;background:${saved===String(n)?'var(--pri)':'rgba(255,255,255,.07)'};display:flex;align-items:center;justify-content:center;font-size:.82rem;border:1px solid rgba(255,255,255,.1);transition:.15s">${n}</span>
        </label>`).join('')}
        <span style="font-size:.7rem;color:var(--muted);width:90px">${q.type==='likert7'?'Sangat Setuju':'Setuju'}</span>
      </div>
    </div>`;
  }
  if (q.type === 'bipolar') {
    const sv = saved !== undefined ? saved : 0;
    return `<div class="survey-q" style="margin-bottom:20px">
      <div style="display:flex;align-items:center;gap:12px">
        <span style="font-size:.78rem;color:var(--muted);width:80px;text-align:right">${q.left}</span>
        <input type="range" min="-3" max="3" step="1" value="${sv}" oninput="surveyAnswers['${q.id}']=this.value;this.nextElementSibling.textContent=this.value" style="flex:1;accent-color:var(--pri)">
        <span style="font-size:.78rem;font-weight:700;width:24px;text-align:center">${sv}</span>
        <span style="font-size:.78rem;color:var(--muted);width:80px">${q.right}</span>
      </div>
    </div>`;
  }
  if (q.type === 'checkbox') {
    const checked = Array.isArray(saved) ? saved : [];
    const opts = q.options.map((o, i) => `
      <label style="display:flex;align-items:center;gap:8px;padding:8px 12px;border-radius:8px;cursor:pointer;background:${checked.includes(String(i))?'rgba(0,180,216,.12)':'rgba(255,255,255,.04)'};border:1px solid ${checked.includes(String(i))?'rgba(0,180,216,.3)':'rgba(255,255,255,.07)'};margin-bottom:6px;font-size:.82rem;transition:.15s">
        <input type="checkbox" name="q_${q.id}" value="${i}" ${checked.includes(String(i))?'checked':''}
          onchange="(function(el){var all=Array.from(document.querySelectorAll('input[name=q_${q.id}]')).filter(x=>x.checked).map(x=>x.value);surveyAnswers['${q.id}']=all;el.closest('label').style.background=el.checked?'rgba(0,180,216,.12)':'rgba(255,255,255,.04)';el.closest('label').style.borderColor=el.checked?'rgba(0,180,216,.3)':'rgba(255,255,255,.07)'})(this)">
        ${o}
      </label>`).join('');
    return `<div class="survey-q" style="margin-bottom:16px"><div style="font-size:.82rem;font-weight:600;margin-bottom:8px">${q.text}</div>${opts}</div>`;
  }
  if (q.type === 'likert5na') {
    const labels = ['','Sangat Buruk','Buruk','Cukup','Baik','Sangat Baik'];
    return `<div class="survey-q" style="margin-bottom:20px">
      <div style="font-size:.82rem;font-weight:600;margin-bottom:10px">${q.text}</div>
      <div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap">
        ${[1,2,3,4,5].map(n => `<label style="display:flex;flex-direction:column;align-items:center;gap:4px;cursor:pointer;flex:1;min-width:44px">
          <input type="radio" name="q_${q.id}" value="${n}" ${saved===String(n)?'checked':''} onchange="surveyAnswers['${q.id}']=this.value">
          <span style="width:100%;min-width:36px;height:36px;border-radius:8px;background:${saved===String(n)?'var(--pri)':'rgba(255,255,255,.07)'};display:flex;align-items:center;justify-content:center;font-size:.78rem;border:1px solid rgba(255,255,255,.1);transition:.15s">${n}</span>
          <span style="font-size:.6rem;color:var(--muted);text-align:center">${labels[n]}</span>
        </label>`).join('')}
        <label style="display:flex;flex-direction:column;align-items:center;gap:4px;cursor:pointer;flex:1;min-width:44px">
          <input type="radio" name="q_${q.id}" value="na" ${saved==='na'?'checked':''} onchange="surveyAnswers['${q.id}']=this.value">
          <span style="width:100%;min-width:36px;height:36px;border-radius:8px;background:${saved==='na'?'rgba(255,255,255,.2)':'rgba(255,255,255,.04)'};display:flex;align-items:center;justify-content:center;font-size:.7rem;border:1px solid rgba(255,255,255,.1);transition:.15s;color:var(--muted)">N/A</span>
          <span style="font-size:.6rem;color:var(--muted);text-align:center">Tdk digunakan</span>
        </label>
      </div>
    </div>`;
  }
  if (q.type === 'textarea') {
    return `<div class="survey-q" style="margin-bottom:16px">
      <label style="font-size:.82rem;font-weight:600;display:block;margin-bottom:6px">${q.text}</label>
      <textarea name="q_${q.id}" rows="3" maxlength="300" oninput="surveyAnswers['${q.id}']=this.value" style="width:100%;background:var(--glass);border:1px solid var(--border);border-radius:8px;padding:10px;color:var(--txt1);font-family:Inter,sans-serif;font-size:.82rem;resize:vertical;outline:none">${saved||''}</textarea>
    </div>`;
  }
  return '';
}

function surveyBack() { if (surveyStep > 0) { surveyStep--; renderSurveyStep(); } }
function surveyNext() {
  if (surveyStep < SURVEY_SECTIONS.length - 1) {
    surveyStep++;
    renderSurveyStep();
    document.getElementById('surveyBody')?.scrollTo(0, 0);
  } else {
    submitSurvey();
  }
}

async function submitSurvey() {
  localStorage.setItem('aquent-survey-done', '1');
  closeSurvey();

  // Calculate SUS score (Brooke 1996): 10 items, alternating +/-
  const susKeys = ['SUS1','SUS2','SUS3','SUS4','SUS5','SUS6','SUS7','SUS8','SUS9','SUS10'];
  let sus = 0;
  susKeys.forEach((k, i) => {
    const v = parseInt(surveyAnswers[k] || 3);
    sus += i % 2 === 0 ? (v - 1) : (5 - v); // odd=positive, even=negative
  });
  const susScore = sus * 2.5;

  // Save to Firebase Realtime DB: surveys/{uid}/{timestamp}
  if (state.db && state.connected) {
    try {
      const uid  = getAuthUser()?.uid || 'anonymous';
      const ts   = Date.now();
      const payload = {
        ...surveyAnswers,
        susScore,
        completed: true,
        submittedAt: ts,
        deviceInfo: { userAgent: navigator.userAgent, screenWidth: window.innerWidth, platform: navigator.platform },
      };
      await state.db.ref(`surveys/${uid}/${ts}`).set(payload);
    } catch (e) { console.warn('Survey save failed:', e.message); }
  }

  addLog('Terima kasih telah mengisi kuesioner! SUS Score: ' + susScore.toFixed(1), 'ok');
  if (earnBadge && BADGES_DATA) {
    const contribBadge = { id:'survey-contributor', name:'Kontributor AQUENT', icon:'📋', tier:'silver' };
    showBadgeToast(contribBadge);
    addXP(100);
  }
  const susLabel = susScore >= 90.9 ? 'Best Imaginable ★' : susScore >= 85 ? 'Excellent' : susScore >= 72.6 ? 'Good — Acceptable' : susScore >= 51.7 ? 'OK — Marginal' : 'Poor';
  uiAlert(`Jawaban Anda membantu meningkatkan AQUENT.\n\nSUS Score Anda: ${susScore.toFixed(1)} / 100\nInterpretasi: ${susLabel}`,
    { title:'Terima kasih! 🎉', icon:'ph-check-circle' });
}

// =====================================================
// USER WIDGET & DROPDOWN
// =====================================================
function renderUserWidget(user, role) {
  if (!user) return;
  const meta = getPlanMeta(role);

  // Avatar
  const av = document.getElementById('headerAvatar');
  if (av) {
    if (user.photoURL) {
      av.innerHTML = `<img src="${user.photoURL}" alt="" style="width:100%;height:100%;object-fit:cover;border-radius:50%">`;
    } else {
      av.textContent = (user.displayName || user.email || '?')[0].toUpperCase();
    }
  }

  // Name + plan pill in header
  const nameEl = document.getElementById('headerName');
  const planEl = document.getElementById('headerPlan');
  if (nameEl) nameEl.textContent = (user.displayName || user.email || '').split(' ')[0];
  if (planEl) {
    planEl.textContent  = meta.label;
    planEl.className    = `plan-pill plan-${role}`;
  }

  // Dropdown info
  setText('udName',  user.displayName || '—');
  setText('udEmail', user.email || '—');
  const udPlan = document.getElementById('udPlan');
  if (udPlan) { udPlan.textContent = meta.label; udPlan.className = `plan-pill plan-${role}`; }

  // Show admin panel link for admin
  if (role === 'admin') {
    document.getElementById('adminPanelLink')?.style.setProperty('display', 'flex');
  }
  // Hide upgrade item if already ultimate or admin
  if (role === 'ultimate' || role === 'admin') {
    document.getElementById('upgradeMenuItem')?.style.setProperty('display', 'none');
  }
}

function toggleUserDropdown(event) {
  document.getElementById('userDropdown')?.classList.toggle('open');
}
function closeUserDropdown() {
  document.getElementById('userDropdown')?.classList.remove('open');
}
// Close dropdown when clicking outside
document.addEventListener('click', e => {
  if (!e.target.closest('#userWidget')) closeUserDropdown();
});

// =====================================================
// UPGRADE MODAL
// =====================================================
function openUpgradeModal()  { document.getElementById('upgradeOverlay').style.display = 'flex'; }
function closeUpgradeModal() { document.getElementById('upgradeOverlay').style.display = 'none'; }

// =====================================================
// ROLE-BASED FEATURE GATING
// =====================================================
function applyRoleGating(role) {
  const meta = getPlanMeta(role);

  // Skin Scanner — tersedia untuk semua paket (tanpa batasan premium).
  // Bersihkan overlay kunci lama bila masih tertinggal di DOM.
  document.getElementById('skin-scan')?.querySelector('.premium-lock')?.remove();

  // AI chat — show daily limit counter for free users
  if (meta.aiMsgPerDay > 0) {
    const chatSection = document.getElementById('ai-chat');
    if (chatSection) {
      const remaining = remainingAiMsg(role);
      const notice = chatSection.querySelector('#aiLimitNotice') || (() => {
        const div = document.createElement('div');
        div.id        = 'aiLimitNotice';
        div.className = 'ai-limit-badge';
        div.style.cssText = 'margin:0 0 8px;align-self:flex-start';
        chatSection.querySelector('.chat-messages-wrap,#chatMessages')?.insertAdjacentElement('beforebegin', div);
        return div;
      })();
      const updateLimit = () => {
        const r = remainingAiMsg(getAuthRole());
        if (notice) notice.innerHTML = `<i class="ph ph-chat-circle-dots"></i> ${r}/${meta.aiMsgPerDay} pesan hari ini`;
        notice.style.display = r > 0 ? 'inline-flex' : 'none';
        if (r === 0) {
          const blocked = chatSection.querySelector('#aiLimitBlocked') || (() => {
            const d = document.createElement('div');
            d.id = 'aiLimitBlocked';
            d.style.cssText = 'text-align:center;padding:20px;color:rgba(202,240,248,.6);font-size:.85rem';
            d.innerHTML = `<i class="ph-duotone ph-chat-circle-slash" style="font-size:2rem;color:#f0c040;display:block;margin-bottom:8px"></i>
              Kuota harian habis. <button class="btn-upgrade" onclick="openUpgradeModal()" style="font-size:.8rem;padding:7px 14px;margin-top:8px">
              <i class="ph-fill ph-crown"></i> Upgrade</button>`;
            const sendRow = chatSection.querySelector('.chat-input-row,#chatInputRow');
            if (sendRow) sendRow.insertAdjacentElement('beforebegin', d);
            return d;
          })();
          blocked.style.display = 'block';
          const sendBtn = document.getElementById('sendBtn');
          if (sendBtn) { sendBtn.disabled = true; sendBtn.title = 'Kuota harian habis'; }
          const chatInput = document.getElementById('chatInput');
          if (chatInput) { chatInput.disabled = true; chatInput.placeholder = 'Kuota harian habis. Upgrade untuk lanjut.'; }
        }
      };
      updateLimit();
      state.updateAiLimit = updateLimit;
    }
  }
}

// =====================================================
// BOOT
// =====================================================
document.addEventListener('DOMContentLoaded', async () => {
  // ---- Auth gate: requires login ----
  initAuthListener({ requireAuth: true });
  onAuthReady(({ user, role }) => {
    document.getElementById('authGate')?.classList.add('hide');
    renderUserWidget(user, role);
    applyRoleGating(role);
    // Patch sendChat to check AI limit
    state.userRole = role;
  });

  await loadThresholds();
  await Promise.all([loadDermalGuide(), loadBadges(), loadProducts(), loadEncyclopedia()]);

  initTheme();
  initParticles();
  initHamburger();
  initNav();
  initQualityScoreXAI();
  initControls();
  initScheduler();
  initSkin();
  initChartTabs();
  initAIChat();
  initSkinScanner();
  initSettings();
  initOnboarding();
  initHistory();
  initRecommender();
  initEncyclopedia();
  initMultiProfile();
  initPushNotifications();
  initSurvey();

  tickClock();
  setInterval(tickClock, 1000);

  renderSensors();
  renderSession();
  renderQualityScore();
  updateAIContext();

  try { initFirebase(); } catch { startDemoMode(); }
  setTimeout(() => { if (!state.connected && !state.demoMode) startDemoMode(); }, 5000);

  setTimeout(() => {
    animateGauge('ph',   state.sensor.ph,          0, 14,  phColor(state.sensor.ph));
    animateGauge('temp', state.sensor.temperature,  0, 60,  tColor(state.sensor.temperature));
    animateGauge('turb', state.sensor.turbidity,    0, 2.0, turbColor(state.sensor.turbidity));
    renderQualityScore();
  }, 300);

  // Re-render konten dinamis saat bahasa diganti
  document.addEventListener('langchange', () => {
    // Refresh status koneksi sesuai bahasa
    if (state.connStatus) setStatus(state.connStatus);
    renderSensors();
    renderQualityScore();
    renderSession();
    updateAIContext();
    if (typeof renderGuideFromJSON === 'function') renderGuideFromJSON();
    if (typeof renderRecommender === 'function') renderRecommender(document.querySelector('#recCatFilter .chart-tab.active')?.dataset.cat || '');
    if (typeof renderHistory === 'function') renderHistory();
    if (typeof renderBadges === 'function') renderBadges();
    if (typeof renderEncyclopedia === 'function') renderEncyclopedia(document.getElementById('encycSearch')?.value || '', document.querySelector('#encycFilter .chart-tab.active')?.dataset.trigger || '');
  });
});
