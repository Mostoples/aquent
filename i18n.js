/* =====================================================
   AQUENT — i18n (Bilingual ID / EN)
   Cara pakai:
   1. Tambah <script src="i18n.js"></script> sebelum app.js
   2. Tag elemen HTML: <span data-i18n="nav.dashboard">Dashboard</span>
      - untuk placeholder: data-i18n-attr="placeholder" data-i18n="key"
      - untuk title/aria: data-i18n-attr="title"
   3. Di JS pakai: t('key') atau t('key', {var: value})
   4. Panggil applyI18n() setelah render dinamis
   ===================================================== */

const I18N = {
  id: {
    // ---- Navigation ----
    'nav.dashboard': 'Dashboard',
    'nav.aiChat': 'AI Konsultan',
    'nav.skinScan': 'Skin Scanner',
    'nav.eco': 'Eco-Monitor',
    'nav.dermal': 'Dermal-Guide',
    'nav.control': 'Smart Control',
    'nav.scheduler': 'Scheduler',
    'nav.history': 'Riwayat',
    'nav.badges': 'Badges',
    'nav.recommender': 'Rekomendasi',
    'nav.encyclopedia': 'Ensiklopedia',
    'nav.settings': 'Pengaturan AI',

    // ---- Header / User dropdown ----
    'hdr.connecting': 'Menghubungkan...',
    'hdr.connected': 'Terhubung',
    'hdr.disconnected': 'Terputus',
    'hdr.demo': 'Mode Demo',
    'ud.dashboard': 'Dashboard',
    'ud.admin': 'Panel Admin',
    'ud.upgrade': 'Upgrade Paket',
    'ud.account': 'Akun & Privasi',
    'ud.settings': 'Pengaturan AI',
    'ud.survey': 'Isi Kuesioner',
    'ud.help': 'Bantuan & FAQ',
    'ud.signout': 'Keluar',
    'ud.planActive': 'Paket aktif',
    'theme.toggle': 'Ganti tema (Dark / Light / Elegant / Neon / Serene)',
    'lang.toggle': 'Ganti bahasa',

    // ---- Dashboard ----
    'dash.title': 'Dashboard Real-time',
    'dash.sub': 'Monitoring kondisi air & kualitas saat ini',
    'dash.qsTitle': 'Skor Kualitas Air',
    'dash.qsCalc': 'Menghitung...',
    'dash.whyScore': 'Kenapa skor ini?',
    'dash.phName': 'pH Air',
    'dash.tempName': 'Suhu Air',
    'dash.turbName': 'Kejernihan',
    'dash.tdsName': 'TDS / Kesadahan',
    'dash.chlorineName': 'Klorin Bebas',
    'dash.usageToday': 'Penggunaan Hari Ini',
    'dash.duration': 'Durasi Mandi',
    'dash.waterSaved': 'Air Dihemat',

    // ---- Sensor status badges ----
    'status.optimal': 'Optimal',
    'status.normal': 'Normal',
    'status.warn': 'Perhatian',
    'status.danger': 'Kritis',
    'status.comfort': 'Nyaman',
    'status.clear': 'Jernih',
    'status.cloudy': 'Keruh',
    'status.medium': 'Cukup',
    'status.soft': 'Lunak',
    'status.hard': 'Sadah',
    'status.veryHard': 'Sangat Sadah',
    'status.high': 'Tinggi',
    'status.low': 'Rendah',
    'status.safe': 'Aman',

    // ---- Trend ----
    'trend.stable': 'Stabil',
    'trend.up': 'Naik',
    'trend.down': 'Turun',

    // ---- AI Chat ----
    'ai.title': 'AI Konsultan',
    'ai.sub': 'Konsultasi kesehatan kulit berbasis data sensor real-time',
    'ai.ctxActive': 'Konteks AI aktif:',
    'ai.apiNotice': 'Masukkan Gemini API Key untuk mengaktifkan AI — mode demo aktif saat ini',
    'ai.setKey': 'Atur Key',
    'ai.greeting': 'Halo! Saya AQUENT AI Konsultan. Saya siap membantu Anda dengan pertanyaan seputar kesehatan kulit berdasarkan kondisi air shower Anda saat ini. Ada yang ingin Anda tanyakan? 💧',
    'ai.demoMode': 'Mode Demo',
    'ai.chipSafe': 'Aman mandi?',
    'ai.chipSoap': 'Rekomendasi sabun',
    'ai.chipDry': 'Kulit kering',
    'ai.chipScore': 'Jelaskan skor air',
    'ai.chipDuration': 'Durasi ideal',
    'ai.inputPlaceholder': 'Tanya tentang kesehatan kulit Anda...',
    'ai.thinking': 'AQUA sedang berpikir...',

    // ---- Skin Scanner ----
    'scan.title': 'Skin Scanner',
    'scan.badge': '100% Lokal',
    'scan.sub': 'Analisis kulit wajah via ML model + pixel analysis. Foto diproses di browser Anda — tidak dikirim ke server.',
    'scan.heroTitle': 'Analisis Kulit dengan AI',
    'scan.heroDesc': 'Arahkan kamera ke wajah Anda dalam pencahayaan yang cukup. ML model + pixel analysis akan menganalisis kondisi kulit dan memberikan rekomendasi personal.',
    'scan.feat1': 'ML klasifikasi tipe kulit',
    'scan.feat2': 'Pixel hidrasi & tekstur',
    'scan.feat3': 'Indeks kemerahan',
    'scan.feat4': 'Rekomendasi XAI',
    'scan.startBtn': 'Mulai Scan Kamera',
    'scan.uploadAlt': 'atau',
    'scan.uploadLink': 'upload foto dari galeri',
    'scan.guideTxt': 'Posisikan wajah di dalam oval',
    'scan.capture': 'Ambil & Analisis',
    'scan.cancel': 'Batal',
    'scan.analyzing': 'Menganalisis kulit Anda...',
    'scan.analyzingSub': 'Ini mungkin memerlukan beberapa detik',
    'scan.privacy': '100% diproses di browser Anda — TensorFlow.js + analisis pixel deterministik.',
    'scan.privacyLink': 'Pelajari kebijakan privasi',
    'scan.rescan': 'Scan Ulang',

    // ---- Eco-Monitor ----
    'eco.title': 'Eco-Monitor',
    'eco.sub': 'Statistik konsumsi air harian & mingguan',
    'eco.daily': 'Harian',
    'eco.weekly': 'Mingguan',
    'eco.vsAvg': 'vs. Rata-rata',
    'eco.weekTotal': 'Total Minggu Ini',
    'eco.streak': 'Streak Hemat',

    // ---- Dermal Guide ----
    'dermal.title': 'Dermal-Guide',
    'dermal.sub': 'Panduan mandi personal sesuai tipe kulit & kondisi air',
    'dermal.skinLabel': 'Tipe Kulit Anda:',

    // ---- Smart Control ----
    'control.title': 'Smart Control',
    'control.sub': 'Kendali perangkat shower pintar',

    // ---- Scheduler ----
    'sched.title': 'Scheduler',
    'sched.sub': 'Atur jadwal & pengingat mandi',

    // ---- History ----
    'hist.title': 'Riwayat Sesi',
    'hist.sub': 'Analitik dan tren kualitas air dari waktu ke waktu',
    'hist.today': 'Hari ini',
    'hist.week': 'Minggu ini',
    'hist.month': 'Bulan ini',
    'hist.export': 'Export CSV',

    // ---- Badges ----
    'badges.title': 'Pencapaian',
    'badges.sub': 'Koleksi badge & level Anda',

    // ---- Recommender ----
    'rec.title': 'Rekomendasi Produk',
    'rec.sub': 'Produk skincare sesuai kondisi air & tipe kulit Anda',

    // ---- Encyclopedia ----
    'enc.title': 'Ensiklopedia Dermatologi',
    'enc.sub': 'Informasi kondisi kulit & hubungannya dengan kualitas air',
    'enc.searchPlaceholder': 'Cari kondisi kulit...',

    // ---- Settings modal ----
    'set.title': 'Pengaturan AI',
    'set.geminiLabel': 'Gemini API Key',
    'set.geminiHint': 'Dapatkan gratis di aistudio.google.com → Get API Key',
    'set.save': 'Simpan',
    'set.test': 'Test Koneksi',
    'set.fillSurvey': 'Isi Kuesioner Evaluasi',

    // ---- Common ----
    'common.save': 'Simpan',
    'common.cancel': 'Batal',
    'common.close': 'Tutup',
    'common.loading': 'Memuat...',
    'common.back': 'Kembali',
    'common.next': 'Lanjut',
    'common.skip': 'Lewati',
    'common.yes': 'Ya',
    'common.no': 'Tidak',
    'common.notAvailable': 'Tidak tersedia',

    // ---- Filter recommendation ----
    'filter.title': 'Rekomendasi Filter',
    'filter.recommended': 'Direkomendasikan untuk kondisi air Anda',
    'filter.effectiveness': 'Efektivitas',
    'filter.price': 'Kisaran Harga',
    'filter.difficulty': 'Tingkat Instalasi',
    'filter.none': 'Kondisi air baik — tidak perlu filter tambahan saat ini.',

    // ---- Login page ----
    'login.tabLogin': 'Masuk',
    'login.tabRegister': 'Daftar',
    'login.google': 'Lanjutkan dengan Google',
    'login.or': 'atau',
    'login.email': 'Alamat Email',
    'login.password': 'Kata Sandi',
    'login.passwordPlaceholder': 'Minimal 6 karakter',
    'login.name': 'Nama Lengkap',
    'login.namePlaceholder': 'Nama Anda',
    'login.signIn': 'Masuk',
    'login.remember': 'Biarkan saya tetap masuk di perangkat ini',
    'login.signUp': 'Buat Akun Gratis',
    'login.backHome': 'Kembali ke Beranda',
    'login.checking': 'Memeriksa sesi...',
    'login.loadingProfile': 'Memuat profil...',

    // ---- Eco mini ----
    'eco.harian': 'Harian',
    'eco.mingguan': 'Mingguan',

    // ---- Skin types ----
    'skin.normal': 'Normal',
    'skin.sensitive': 'Sensitif',
    'skin.oily': 'Berminyak',
    'skin.dry': 'Kering',
    'skin.combination': 'Kombinasi',
    'skin.label': 'Tipe Kulit:',

    // ---- Control cards ----
    'ctrl.recircTitle': 'Recirculation Mode',
    'ctrl.recircDesc': 'Daur ulang air untuk efisiensi maksimal',
    'ctrl.recircTag1': 'Hemat ~40%',
    'ctrl.recircTag2': 'Maks 10 mnt',
    'ctrl.filterTitle': 'Filter System',
    'ctrl.filterDesc': 'Penyaringan air multi-tahap aktif',
    'ctrl.filterTag': 'Kapasitas: 87%',
    'ctrl.ecoTitle': 'Eco Mode',
    'ctrl.ecoDesc': 'Batasi aliran untuk hemat konsumsi',
    'ctrl.ecoTag': 'Batas 8 L/mnt',
    'ctrl.heatTitle': 'Smart Heating',
    'ctrl.heatDesc': 'Pertahankan suhu optimal otomatis',
    'ctrl.heatTag': 'Target 37-39°C',
    'ctrl.sysLog': 'Log Sistem',
    'ctrl.sysStart': 'Sistem dimulai — menghubungkan...',

    // ---- Scheduler ----
    'sched.addTitle': 'Tambah Jadwal Mandi',
    'sched.time': 'Waktu',
    'sched.labelField': 'Label',
    'sched.labelPlaceholder': 'Mandi Pagi',
    'sched.days': 'Hari',
    'sched.addBtn': 'Tambah Jadwal',
    'sched.activeTitle': 'Jadwal Aktif',
    'day.mon': 'Sen', 'day.tue': 'Sel', 'day.wed': 'Rab', 'day.thu': 'Kam',
    'day.fri': 'Jum', 'day.sat': 'Sab', 'day.sun': 'Min',

    // ---- History ----
    'hist.weekTab': 'Minggu Ini',
    'hist.monthTab': 'Bulan Ini',
    'hist.xaiTitle': 'XAI Insight Otomatis',
    'hist.lastSessions': 'Sesi Terakhir',
    'hist.exportCsv': 'Export CSV',

    // ---- Dermal cond bar ----
    'dermal.ph': 'pH',
    'dermal.temp': 'Suhu',
    'dermal.clarity': 'Kejernihan',

    // ---- Encyclopedia detail ----
    'enc.relevantNow': 'RELEVAN SEKARANG',
    'enc.noResult': 'Tidak ada hasil ditemukan.',
    'enc.causes': 'Penyebab',
    'enc.symptoms': 'Gejala',
    'enc.bathing': 'Rekomendasi Mandi',
    'enc.doctor': 'Kapan ke Dokter:',
    'enc.waterRel': 'Hubungan Air:',

    // ---- Recommender detail ----
    'rec.empty': 'Tidak ada produk dalam kategori ini.',
    'rec.fragFree': '· Bebas pewangi',
    'rec.match': 'cocok',
    'rec.because': 'Direkomendasikan karena',
  },

  en: {
    // ---- Navigation ----
    'nav.dashboard': 'Dashboard',
    'nav.aiChat': 'AI Consultant',
    'nav.skinScan': 'Skin Scanner',
    'nav.eco': 'Eco-Monitor',
    'nav.dermal': 'Dermal-Guide',
    'nav.control': 'Smart Control',
    'nav.scheduler': 'Scheduler',
    'nav.history': 'History',
    'nav.badges': 'Badges',
    'nav.recommender': 'Recommendations',
    'nav.encyclopedia': 'Encyclopedia',
    'nav.settings': 'AI Settings',

    // ---- Header / User dropdown ----
    'hdr.connecting': 'Connecting...',
    'hdr.connected': 'Connected',
    'hdr.disconnected': 'Disconnected',
    'hdr.demo': 'Demo Mode',
    'ud.dashboard': 'Dashboard',
    'ud.admin': 'Admin Panel',
    'ud.upgrade': 'Upgrade Plan',
    'ud.account': 'Account & Privacy',
    'ud.settings': 'AI Settings',
    'ud.survey': 'Take Survey',
    'ud.help': 'Help & FAQ',
    'ud.signout': 'Sign Out',
    'ud.planActive': 'Active plan',
    'theme.toggle': 'Switch theme (Dark / Light / Elegant / Neon / Serene)',
    'lang.toggle': 'Switch language',

    // ---- Dashboard ----
    'dash.title': 'Real-time Dashboard',
    'dash.sub': 'Monitor current water conditions & quality',
    'dash.qsTitle': 'Water Quality Score',
    'dash.qsCalc': 'Calculating...',
    'dash.whyScore': 'Why this score?',
    'dash.phName': 'Water pH',
    'dash.tempName': 'Water Temperature',
    'dash.turbName': 'Clarity',
    'dash.tdsName': 'TDS / Hardness',
    'dash.chlorineName': 'Free Chlorine',
    'dash.usageToday': "Today's Usage",
    'dash.duration': 'Shower Duration',
    'dash.waterSaved': 'Water Saved',

    // ---- Sensor status badges ----
    'status.optimal': 'Optimal',
    'status.normal': 'Normal',
    'status.warn': 'Caution',
    'status.danger': 'Critical',
    'status.comfort': 'Comfortable',
    'status.clear': 'Clear',
    'status.cloudy': 'Cloudy',
    'status.medium': 'Moderate',
    'status.soft': 'Soft',
    'status.hard': 'Hard',
    'status.veryHard': 'Very Hard',
    'status.high': 'High',
    'status.low': 'Low',
    'status.safe': 'Safe',

    // ---- Trend ----
    'trend.stable': 'Stable',
    'trend.up': 'Rising',
    'trend.down': 'Falling',

    // ---- AI Chat ----
    'ai.title': 'AI Consultant',
    'ai.sub': 'Skin health consultation based on real-time sensor data',
    'ai.ctxActive': 'Active AI context:',
    'ai.apiNotice': 'Enter your Gemini API Key to enable AI — demo mode is active now',
    'ai.setKey': 'Set Key',
    'ai.greeting': "Hi! I'm AQUENT AI Consultant. I'm ready to help with questions about skin health based on your current shower water conditions. What would you like to ask? 💧",
    'ai.demoMode': 'Demo Mode',
    'ai.chipSafe': 'Safe to shower?',
    'ai.chipSoap': 'Soap recommendation',
    'ai.chipDry': 'Dry skin',
    'ai.chipScore': 'Explain my water score',
    'ai.chipDuration': 'Ideal duration',
    'ai.inputPlaceholder': 'Ask about your skin health...',
    'ai.thinking': 'AQUA is thinking...',

    // ---- Skin Scanner ----
    'scan.title': 'Skin Scanner',
    'scan.badge': '100% Local',
    'scan.sub': 'Facial skin analysis via ML model + pixel analysis. Photos are processed in your browser — never sent to a server.',
    'scan.heroTitle': 'AI Skin Analysis',
    'scan.heroDesc': 'Point your camera at your face in good lighting. ML model + pixel analysis will assess your skin condition and give personal recommendations.',
    'scan.feat1': 'ML skin type classification',
    'scan.feat2': 'Pixel hydration & texture',
    'scan.feat3': 'Redness index',
    'scan.feat4': 'XAI recommendations',
    'scan.startBtn': 'Start Camera Scan',
    'scan.uploadAlt': 'or',
    'scan.uploadLink': 'upload a photo from gallery',
    'scan.guideTxt': 'Position your face inside the oval',
    'scan.capture': 'Capture & Analyze',
    'scan.cancel': 'Cancel',
    'scan.analyzing': 'Analyzing your skin...',
    'scan.analyzingSub': 'This may take a few seconds',
    'scan.privacy': '100% processed in your browser — TensorFlow.js + deterministic pixel analysis.',
    'scan.privacyLink': 'Read privacy policy',
    'scan.rescan': 'Scan Again',

    // ---- Eco-Monitor ----
    'eco.title': 'Eco-Monitor',
    'eco.sub': 'Daily & weekly water consumption statistics',
    'eco.daily': 'Daily',
    'eco.weekly': 'Weekly',
    'eco.vsAvg': 'vs. Average',
    'eco.weekTotal': 'This Week Total',
    'eco.streak': 'Saving Streak',

    // ---- Dermal Guide ----
    'dermal.title': 'Dermal-Guide',
    'dermal.sub': 'Personal shower guide for your skin type & water conditions',
    'dermal.skinLabel': 'Your Skin Type:',

    // ---- Smart Control ----
    'control.title': 'Smart Control',
    'control.sub': 'Smart shower device controls',

    // ---- Scheduler ----
    'sched.title': 'Scheduler',
    'sched.sub': 'Set shower schedules & reminders',

    // ---- History ----
    'hist.title': 'Session History',
    'hist.sub': 'Water quality analytics and trends over time',
    'hist.today': 'Today',
    'hist.week': 'This week',
    'hist.month': 'This month',
    'hist.export': 'Export CSV',

    // ---- Badges ----
    'badges.title': 'Achievements',
    'badges.sub': 'Your badge collection & level',

    // ---- Recommender ----
    'rec.title': 'Product Recommendations',
    'rec.sub': 'Skincare products for your water conditions & skin type',

    // ---- Encyclopedia ----
    'enc.title': 'Dermatology Encyclopedia',
    'enc.sub': 'Skin conditions & their relationship with water quality',
    'enc.searchPlaceholder': 'Search skin conditions...',

    // ---- Settings modal ----
    'set.title': 'AI Settings',
    'set.geminiLabel': 'Gemini API Key',
    'set.geminiHint': 'Get it free at aistudio.google.com → Get API Key',
    'set.save': 'Save',
    'set.test': 'Test Connection',
    'set.fillSurvey': 'Take Evaluation Survey',

    // ---- Common ----
    'common.save': 'Save',
    'common.cancel': 'Cancel',
    'common.close': 'Close',
    'common.loading': 'Loading...',
    'common.back': 'Back',
    'common.next': 'Next',
    'common.skip': 'Skip',
    'common.yes': 'Yes',
    'common.no': 'No',
    'common.notAvailable': 'Not available',

    // ---- Filter recommendation ----
    'filter.title': 'Filter Recommendations',
    'filter.recommended': 'Recommended for your water conditions',
    'filter.effectiveness': 'Effectiveness',
    'filter.price': 'Price Range',
    'filter.difficulty': 'Installation Level',
    'filter.none': 'Water condition is good — no additional filter needed right now.',

    // ---- Login page ----
    'login.tabLogin': 'Sign In',
    'login.tabRegister': 'Sign Up',
    'login.google': 'Continue with Google',
    'login.or': 'or',
    'login.email': 'Email Address',
    'login.password': 'Password',
    'login.passwordPlaceholder': 'Minimum 6 characters',
    'login.name': 'Full Name',
    'login.namePlaceholder': 'Your name',
    'login.signIn': 'Sign In',
    'login.remember': 'Keep me signed in on this device',
    'login.signUp': 'Create Free Account',
    'login.backHome': 'Back to Home',
    'login.checking': 'Checking session...',
    'login.loadingProfile': 'Loading profile...',

    // ---- Eco mini ----
    'eco.harian': 'Daily',
    'eco.mingguan': 'Weekly',

    // ---- Skin types ----
    'skin.normal': 'Normal',
    'skin.sensitive': 'Sensitive',
    'skin.oily': 'Oily',
    'skin.dry': 'Dry',
    'skin.combination': 'Combination',
    'skin.label': 'Skin Type:',

    // ---- Control cards ----
    'ctrl.recircTitle': 'Recirculation Mode',
    'ctrl.recircDesc': 'Recycle water for maximum efficiency',
    'ctrl.recircTag1': 'Save ~40%',
    'ctrl.recircTag2': 'Max 10 min',
    'ctrl.filterTitle': 'Filter System',
    'ctrl.filterDesc': 'Multi-stage water filtration active',
    'ctrl.filterTag': 'Capacity: 87%',
    'ctrl.ecoTitle': 'Eco Mode',
    'ctrl.ecoDesc': 'Limit flow to save consumption',
    'ctrl.ecoTag': 'Limit 8 L/min',
    'ctrl.heatTitle': 'Smart Heating',
    'ctrl.heatDesc': 'Maintain optimal temperature automatically',
    'ctrl.heatTag': 'Target 37-39°C',
    'ctrl.sysLog': 'System Log',
    'ctrl.sysStart': 'System started — connecting...',

    // ---- Scheduler ----
    'sched.addTitle': 'Add Shower Schedule',
    'sched.time': 'Time',
    'sched.labelField': 'Label',
    'sched.labelPlaceholder': 'Morning Shower',
    'sched.days': 'Days',
    'sched.addBtn': 'Add Schedule',
    'sched.activeTitle': 'Active Schedules',
    'day.mon': 'Mon', 'day.tue': 'Tue', 'day.wed': 'Wed', 'day.thu': 'Thu',
    'day.fri': 'Fri', 'day.sat': 'Sat', 'day.sun': 'Sun',

    // ---- History ----
    'hist.weekTab': 'This Week',
    'hist.monthTab': 'This Month',
    'hist.xaiTitle': 'Automatic XAI Insights',
    'hist.lastSessions': 'Recent Sessions',
    'hist.exportCsv': 'Export CSV',

    // ---- Dermal cond bar ----
    'dermal.ph': 'pH',
    'dermal.temp': 'Temp',
    'dermal.clarity': 'Clarity',

    // ---- Encyclopedia detail ----
    'enc.relevantNow': 'RELEVANT NOW',
    'enc.noResult': 'No results found.',
    'enc.causes': 'Causes',
    'enc.symptoms': 'Symptoms',
    'enc.bathing': 'Bathing Recommendations',
    'enc.doctor': 'When to See a Doctor:',
    'enc.waterRel': 'Water Relationship:',

    // ---- Recommender detail ----
    'rec.empty': 'No products in this category.',
    'rec.fragFree': '· Fragrance-free',
    'rec.match': 'match',
    'rec.because': 'Recommended because',
  },
};

let _lang = (function () {
  const saved = localStorage.getItem('aquent-lang');
  if (saved === 'id' || saved === 'en') return saved;
  // Auto-detect from browser
  return (navigator.language || 'id').toLowerCase().startsWith('en') ? 'en' : 'id';
})();

function getLang() { return _lang; }

/** Translate a key with optional {var} interpolation. Falls back to ID then key. */
function t(key, vars) {
  let s = (I18N[_lang] && I18N[_lang][key]) || (I18N.id && I18N.id[key]) || key;
  if (vars) {
    Object.entries(vars).forEach(([k, v]) => {
      s = s.replace(new RegExp('\\{' + k + '\\}', 'g'), v);
    });
  }
  return s;
}

/** Scan DOM and replace all [data-i18n] elements. */
function applyI18n(root) {
  const scope = root || document;
  scope.querySelectorAll('[data-i18n]').forEach(el => {
    const key  = el.getAttribute('data-i18n');
    const attr = el.getAttribute('data-i18n-attr');
    const val  = t(key);
    if (attr) el.setAttribute(attr, val);
    else el.textContent = val;
  });
  // Update <html lang="">
  document.documentElement.setAttribute('lang', _lang);
}

function setLang(lang) {
  if (lang !== 'id' && lang !== 'en') return;
  _lang = lang;
  localStorage.setItem('aquent-lang', lang);
  applyI18n();
  applyLangBlocks();
  updateLangToggleUI();
  // Beri tahu app.js untuk re-render konten dinamis
  document.dispatchEvent(new CustomEvent('langchange', { detail: { lang } }));
}

function toggleLang() {
  setLang(_lang === 'id' ? 'en' : 'id');
}

function updateLangToggleUI() {
  const el = document.getElementById('langToggle');
  if (el) {
    const label = el.querySelector('.lang-label');
    if (label) label.textContent = _lang === 'id' ? 'ID' : 'EN';
  }
}

// Auto-apply saat DOM siap
document.addEventListener('DOMContentLoaded', () => {
  applyI18n();
  applyLangBlocks();
  updateLangToggleUI();
  document.getElementById('langToggle')?.addEventListener('click', toggleLang);
});

/** Untuk halaman statis panjang: tampilkan/hide elemen [data-lang="id"|"en"]. */
function applyLangBlocks() {
  document.querySelectorAll('[data-lang]').forEach(el => {
    el.style.display = (el.getAttribute('data-lang') === _lang) ? '' : 'none';
  });
}
