/* AQUENT — companion app for the AIoT smart shower.
   Live mode: Firebase Auth + Realtime Database (same schema as aquent-id).
   Demo mode: simulated data (no account / local preview / showreel recording). */
(() => {
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const params = new URLSearchParams(location.search);
  const MOCK = params.has("mock");
  if (MOCK) document.documentElement.classList.add("mock");

  const fmt = (v, d = 0) => Number(v).toLocaleString("id-ID", { minimumFractionDigits: d, maximumFractionDigits: d });
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const img = (n) => `assets/3d/${n}.png`;
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const store = {
    get: (k, d) => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } },
    set: (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} },
  };

  const CFG = { FLOW_LPM: 9, FILTER_CAP_L: 1500, RECYCLE_RATIO: 0.72, MONTH_GOAL_L: 1500, STALE_MS: 5 * 60 * 1000 };
  const B = window.AQB;
  const S = { live: false, user: null, connected: false, lastSensorAt: 0, prefs: {}, sessions: [], reminders: [], controls: {}, deviceSession: {} };

  /* --------------------------------------------------------- sensors --- */
  // thresholds aligned with aquent-id data/thresholds.json (WHO 2022 / SNI)
  const SENSORS = {
    ph: { key: "ph", tab: "pH", name: "Kadar pH", img: "ph", model: "SEN0165", unit: "pH", dec: 2, safe: [6.5, 8.5], opt: [6.5, 7.5], w: 0.4, demo: [7.2, 0.05],
      words: ["Asam", "Basa"], info: "Sensor Meter Kit SEN0165 mengukur tingkat keasaman atau kebasaan air pada rentang 0–14. Nilai di bawah 7 berarti asam, 7 netral, dan di atas 7 basa." },
    turb: { key: "turbidity", tab: "Turbidity", name: "Kekeruhan", img: "turbidity", model: "SEN0189", unit: "NTU", dec: 2, safe: [0, 1], opt: [0, 0.5], w: 0.35, demo: [0.32, 0.04],
      words: ["", "Keruh"], info: "SEN0189 mengukur kekeruhan air dari banyaknya cahaya yang dihamburkan partikel tersuspensi. Semakin keruh air, semakin tinggi nilainya; air jernih menghasilkan nilai rendah." },
    cl: { key: "chlorine", tab: "Klorin", name: "Sisa Klorin", img: "chlorine", model: "ORP Sensor", unit: "mg/L", dec: 2, safe: [0.1, 0.5], opt: [0.2, 0.4], w: 0.25, demo: [0.3, 0.02],
      words: ["Klorin menipis", "Klorin tinggi"], info: "Sensor ORP memperkirakan sisa klorin secara tidak langsung. Klorin adalah oksidator, jadi nilai ORP naik saat kadar klorin tinggi dan turun saat berkurang — menandakan apakah air masih terjaga bersih." },
    temp: { key: "temperature", tab: "Suhu", name: "Suhu Air", img: "temp", model: "DS18B20", unit: "°C", dec: 1, safe: [20, 40], opt: [30, 38], w: 0, demo: [36.8, 0.18],
      words: ["Dingin", "Terlalu panas"], info: "DS18B20 mengukur suhu air secara digital dengan akurasi baik dan tahan noise. Suhu memengaruhi pH, ORP, dan TDS, sehingga dibutuhkan untuk data kualitas air yang akurat." },
  };
  const hist = {};
  for (const k in SENSORS) hist[k] = [];
  const cur = (k) => (hist[k].length ? hist[k][hist[k].length - 1].v : null);

  function paramScore(v, s) {
    const [smin, smax] = s.safe, [omin, omax] = s.opt;
    if (v >= omin && v <= omax) return 100;
    if (v >= smin && v <= smax) {
      if (v < omin && omin > smin) return 50 + (50 * (v - smin)) / (omin - smin);
      if (v > omax && smax > omax) return 50 + (50 * (smax - v)) / (smax - omax);
      return 75;
    }
    const ex = v < smin ? smin - v : v - smax;
    return Math.max(0, 50 - (ex / Math.max(0.01, smax - smin)) * 100);
  }
  function stateOf(k, v) {
    const s = SENSORS[k];
    if (v == null) return ["Menunggu data", "soft"];
    if (v < s.safe[0]) return [s.words[0] || "Rendah", "warn"];
    if (v > s.safe[1]) return [s.words[1] || "Tinggi", "warn"];
    if (v >= s.opt[0] && v <= s.opt[1]) return [k === "temp" ? "Nyaman" : "Optimal", "ok"];
    return ["Aman", "ok"];
  }
  function quality() {
    let tot = 0, wsum = 0, pass = true, have = false;
    for (const [k, s] of Object.entries(SENSORS)) {
      const v = cur(k);
      if (v == null || !s.w) continue;
      have = true;
      tot += paramScore(v, s) * s.w;
      wsum += s.w;
      if (v < s.safe[0] || v > s.safe[1]) pass = false;
    }
    if (!have) return null;
    const score = Math.round(tot / wsum);
    const grade = score >= 90 ? "Sangat Baik" : score >= 75 ? "Baik" : score >= 60 ? "Cukup" : "Perlu perhatian";
    return { score, grade, pass };
  }

  function pushReading(k, v, t = Date.now()) {
    if (typeof v !== "number" || !isFinite(v)) return;
    hist[k].push({ t, v });
    if (hist[k].length > 60) hist[k].shift();
  }

  /* -------------------------------------------------------- rendering --- */
  const grid = $("#sensorGrid");
  grid.innerHTML = `<svg width="0" height="0" style="position:absolute"><defs><linearGradient id="gSpark" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2F7BFF" stop-opacity=".22"/><stop offset="1" stop-color="#2F7BFF" stop-opacity="0"/></linearGradient><linearGradient id="gArea" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2F7BFF" stop-opacity=".25"/><stop offset="1" stop-color="#2F7BFF" stop-opacity="0"/></linearGradient></defs></svg>` +
    Object.entries(SENSORS).map(([k, s]) => `
      <article class="sensor neu" data-sensor="${k}">
        <div class="sensor-top"><img src="${img(s.img)}" alt=""><span class="chip soft" data-st="${k}">–</span></div>
        <small>${s.name}</small>
        <b><span data-v="${k}">–</span><em>${s.unit}</em></b>
        <svg viewBox="0 0 100 30" preserveAspectRatio="none"><path class="area" data-a="${k}"/><path data-p="${k}"/></svg>
      </article>`).join("");
  $$(".sensor").forEach((el) => el.addEventListener("click", () => { selectSensor(el.dataset.sensor); go("monitor"); }));

  function spark(arr, w, h) {
    const vals = arr.slice(-20).map((p) => p.v);
    if (vals.length < 2) return "";
    const lo = Math.min(...vals), hi = Math.max(...vals), span = hi - lo || 1;
    return vals.map((v, i) => `${i ? "L" : "M"}${(i / (vals.length - 1)) * w},${h - ((v - lo) / span) * h}`).join("");
  }

  function renderSensors() {
    for (const k in SENSORS) {
      const v = cur(k), p = spark(hist[k], 100, 26);
      $(`[data-p="${k}"]`).setAttribute("d", p);
      $(`[data-a="${k}"]`).setAttribute("d", p ? p + "L100,30L0,30Z" : "");
      $(`[data-v="${k}"]`).textContent = v == null ? "–" : fmt(v, SENSORS[k].dec);
      const [txt, cls] = stateOf(k, v);
      const chip = $(`[data-st="${k}"]`);
      chip.textContent = txt;
      chip.className = "chip " + cls;
    }
    renderQuality();
    if (current === "monitor") { updateHero(); drawChart(false); }
    renderXai();
  }

  function renderQuality() {
    const q = quality();
    const ring = $("#qualityRing");
    if (!q) {
      $("#qScore").textContent = "–";
      $("#qGrade").textContent = "–";
      $("#qTitle").textContent = S.live ? "Menunggu data perangkat" : "Menunggu data sensor";
      ring.style.strokeDashoffset = 314.16;
      ["#flowQc", "#flowAi"].forEach((s) => ($(s).textContent = "–"));
      $("#aiTip").textContent = "Menunggu data sensor untuk rekomendasi.";
      return;
    }
    $("#qScore").textContent = q.score;
    const g = $("#qGrade");
    g.textContent = q.grade;
    g.className = "chip " + (q.pass ? "ok" : "warn");
    $("#qTitle").textContent = q.pass ? "Aman digunakan kembali" : "Tidak lolos QC — dialirkan ke drain";
    $("#qDesc").textContent = q.pass ? "Air hasil filtrasi lolos semua parameter sensor." : "Ada parameter di luar ambang aman. Cek detail sensor.";
    if (current === "home") ring.style.strokeDashoffset = 314.16 * (1 - q.score / 100);
    $("#flowQc").textContent = q.pass ? "Lolos" : "Gagal";
    $("#flowQc").className = "chip " + (q.pass ? "ok" : "warn");
    $("#flowAi").textContent = q.pass ? "Reuse" : "Drain";
    $("#flowAi").className = "chip " + (q.pass ? "ok" : "warn");
    $("#aiTip").innerHTML = tipText();
  }

  function tipText() {
    const ph = cur("ph"), cl = cur("cl"), t = cur("temp");
    const skin = S.prefs.skinType || "normal";
    const parts = [];
    if (ph != null) parts.push(`pH air <b>${fmt(ph, 1)}</b> ${ph >= 6.5 && ph <= 7.5 ? "(netral)" : ph < 6.5 ? "(asam)" : "(basa)"}`);
    if (cl != null && cl > 0.4) parts.push(`sisa klorin <b>${fmt(cl, 2)} mg/L</b> agak tinggi`);
    const tgt = skin === "kering" || skin === "sensitif" ? "30–37°C" : "30–38°C";
    return `${parts.join(", ")} — ${quality()?.pass ? "aman" : "perlu perhatian"} untuk kulit ${skin}. Gunakan suhu ${tgt}${t != null && t > 40 ? " (suhu saat ini terlalu panas)" : ""}.`;
  }

  /* monitor */
  let curSensor = "ph";
  $("#sensorTabs").innerHTML = Object.entries(SENSORS).map(([k, s]) => `<button data-tab="${k}">${s.tab}</button>`).join("");
  $$("#sensorTabs button").forEach((b) => b.addEventListener("click", () => selectSensor(b.dataset.tab)));

  function selectSensor(k, animate = true) {
    curSensor = k;
    const s = SENSORS[k];
    $$("#sensorTabs button").forEach((b) => b.classList.toggle("active", b.dataset.tab === k));
    const im = $("#shImg");
    im.src = img(s.img);
    im.classList.remove("swap"); void im.offsetWidth; im.classList.add("swap");
    $("#shModel").textContent = s.model;
    $("#shUnit").textContent = s.unit;
    $("#chTitle").textContent = `Tren ${s.tab}`;
    $("#chRange").textContent = `Aman ${fmt(s.safe[0], s.dec > 1 ? 1 : 0)}–${fmt(s.safe[1], s.dec > 1 ? 1 : 0)} ${s.unit}`;
    $("#infoTitle").textContent = `Tentang ${s.model}`;
    $("#infoText").textContent = s.info;
    updateHero();
    drawChart(animate);
  }
  function updateHero() {
    const s = SENSORS[curSensor], v = cur(curSensor);
    $("#shVal").textContent = v == null ? "–" : fmt(v, s.dec);
    const [txt, cls] = stateOf(curSensor, v);
    const st = $("#shState");
    st.textContent = txt;
    st.className = "state " + (cls === "warn" ? "warn" : "ok");
    const ago = S.lastSensorAt ? Math.round((Date.now() - S.lastSensorAt) / 1000) : null;
    $("#monSub").textContent = !S.live ? "Mode demo · tiap 2 detik" : ago == null ? "Menunggu data perangkat" : ago < 60 ? `Live · ${ago} dtk lalu` : `Terakhir ${fmtClock(S.lastSensorAt)}`;
  }
  const fmtClock = (t) => new Date(t).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" });

  function drawChart(animate) {
    const s = SENSORS[curSensor], arr = hist[curSensor], W = 320, H = 150;
    const svg = $("#chart");
    if (arr.length < 2) {
      svg.innerHTML = `<text x="160" y="80" text-anchor="middle" font-size="12" fill="#8392AE" font-weight="600">Menunggu data sensor…</text>`;
      $("#chartX").innerHTML = "";
      return;
    }
    const vals = arr.map((p) => p.v);
    const dlo = Math.min(...vals), dhi = Math.max(...vals), pad = (dhi - dlo) * 0.9 || Math.max(0.05, Math.abs(dhi) * 0.02);
    const lo = dlo - pad, hi = dhi + pad;
    const y = (v) => clamp(H - ((v - lo) / (hi - lo)) * H, -4, H + 4);
    const pts = vals.map((v, i) => [(i / (vals.length - 1)) * W, y(v)]);
    let d = `M${pts[0][0]},${pts[0][1]}`;
    for (let i = 1; i < pts.length; i++) {
      const [x0, y0] = pts[i - 1], [x1, y1] = pts[i], cx = (x0 + x1) / 2;
      d += `C${cx},${y0} ${cx},${y1} ${x1},${y1}`;
    }
    const [lx, ly] = pts[pts.length - 1];
    const bandTop = y(Math.min(s.safe[1], hi)), bandBot = y(Math.max(s.safe[0], lo));
    svg.innerHTML = `
      ${bandBot > bandTop ? `<rect class="band" x="0" width="${W}" y="${bandTop}" height="${bandBot - bandTop}" rx="8"/>` : ""}
      ${[0.25, 0.5, 0.75].map((f) => `<line class="grid" x1="0" x2="${W}" y1="${H * f}" y2="${H * f}"/>`).join("")}
      <path d="${d}L${W},${H}L0,${H}Z" fill="url(#gArea)"/>
      <path class="line" d="${d}"/>
      <circle class="dot" cx="${lx}" cy="${ly}" r="5.5"/>`;
    const ts = arr.map((p) => p.t);
    $("#chartX").innerHTML = [0, 0.25, 0.5, 0.75, 1].map((f, i) => {
      const t = ts[Math.round(f * (ts.length - 1))];
      return `<span>${i === 4 ? "Kini" : new Date(t).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit", second: S.live ? undefined : "2-digit" })}</span>`;
    }).join("");
    if (animate) {
      const line = $("#chart .line"), len = line.getTotalLength();
      line.style.strokeDasharray = len;
      line.style.strokeDashoffset = len;
      line.getBoundingClientRect();
      line.style.transition = "stroke-dashoffset 1.4s cubic-bezier(.22,1,.36,1)";
      line.style.strokeDashoffset = 0;
    }
  }

  /* --------------------------------------------------- sessions/stats --- */
  const dayKey = (t) => new Date(t).toDateString();
  const recOf = (r) => r.recycled_liters != null ? r.recycled_liters : (r.volume_liters || 0) * ((r.water_saved_pct || 0) / 100);

  function renderStats() {
    const now = new Date(), today = now.toDateString();
    const month = now.getMonth(), year = now.getFullYear();
    let todayRec = 0, monthRec = 0, total = 0;
    for (const r of S.sessions) {
      const d = new Date(r.ts);
      if (d.toDateString() === today) todayRec += recOf(r);
      if (d.getMonth() === month && d.getFullYear() === year) monthRec += recOf(r);
      total += r.volume_liters || 0;
    }
    $("#todayRec").textContent = fmt(todayRec);
    $("#monthSaved").textContent = fmt(monthRec);
    $("#monthBar").style.setProperty("--w", clamp((monthRec / CFG.MONTH_GOAL_L) * 100, 0, 100) + "%");
    $("#monthNote").textContent = `Bulan ini · target ${fmt(CFG.MONTH_GOAL_L)} L`;
    const health = Math.round(clamp(100 - (total / CFG.FILTER_CAP_L) * 100, 0, 100));
    $("#filterPct").textContent = health;
    $("#filterBar").style.setProperty("--w", health + "%");
    $("#fhHealth").textContent = health + "%";
    $("#fhTotal").textContent = fmt(total) + " L";
    $("#flowFilter").textContent = health + "%";
    // replacement estimate from average daily volume over the last 14 days
    const since = Date.now() - 14 * 864e5;
    const recent = S.sessions.filter((r) => r.ts >= since).reduce((a, r) => a + (r.volume_liters || 0), 0) / 14;
    const left = CFG.FILTER_CAP_L - total;
    const days = recent > 0 ? Math.max(0, Math.round(left / recent)) : null;
    $("#fhDays").textContent = days == null ? "–" : days + " hari";
    $("#filterNote").textContent = days == null ? "Estimasi dari volume tersaring" : `Ganti ± ${days} hari lagi`;
    $("#filterCapNote").textContent = `Estimasi berdasarkan kapasitas cartridge ${fmt(CFG.FILTER_CAP_L)} L · total tersaring ${fmt(total)} L.`;
    // impact
    $("#impSaved").textContent = fmt(monthRec);
    $("#impEq").textContent = monthRec > 0 ? `Setara ± ${fmt(Math.max(1, Math.round(monthRec / 70)))} kali mandi (60–80 L per mandi).` : "Mulai sesi mandi untuk mencatat penghematan.";
    const week = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(); d.setDate(d.getDate() - i);
      const v = S.sessions.filter((r) => dayKey(r.ts) === d.toDateString()).reduce((a, r) => a + recOf(r), 0);
      week.push([d.toLocaleDateString("id-ID", { weekday: "short" }).slice(0, 3), v, i === 0]);
    }
    const max = Math.max(10, ...week.map((w) => w[1]));
    $("#weekBars").innerHTML = week.map(([d, v, today]) => `
      <div class="b ${today ? "today" : ""}" title="${fmt(v, 1)} L"><div class="col"><i data-h="${(v / max) * 100}"></i></div><small>${d}</small></div>`).join("");
    $("#weekTotal").textContent = fmt(week.reduce((a, w) => a + w[1], 0)) + " L";
    if (current === "impact") setTimeout(() => $$("#weekBars i").forEach((i) => (i.style.height = i.dataset.h + "%")), 50);
  }

  function seedDemoSessions() {
    const out = [];
    let seed = 3;
    const r = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let d = 20; d >= 0; d--) {
      for (const h of [6, 17]) {
        const t = new Date(); t.setDate(t.getDate() - d); t.setHours(h, 10 + Math.floor(r() * 40), 0, 0);
        if (t > Date.now()) continue;
        const vol = 34 + r() * 22;
        out.push({ ts: t.getTime(), duration_min: +(vol / CFG.FLOW_LPM).toFixed(1), volume_liters: +vol.toFixed(1), quality_score: 88 + Math.round(r() * 8),
          water_saved_pct: 72, recycled_liters: +(vol * CFG.RECYCLE_RATIO).toFixed(1), ph: 7.2, temperature: 37, turbidity: 0.3, chlorine: 0.3 });
      }
    }
    return out;
  }

  /* --------------------------------------------------------- filter --- */
  const LAYERS = [ // top -> bottom: pre-filtration, adsorption, polishing
    ["Daun Bambu Kering", "Pra-filtrasi · flavonoid & silika antioksidan", "#9FB06A"],
    ["Loofah", "Pra-filtrasi · serat penangkap partikel", "#E3CF98"],
    ["Zeolit", "Adsorpsi · tukar ion Pb, Cd & Ni", "#DADDE1"],
    ["Biochar Kulit Pisang", "Adsorpsi · pewarna, BPA, obat & minyak", "#3A3A3F"],
    ["Kitosan", "Adsorpsi · hambat E. coli & S. aureus", "#F1E6CF"],
    ["Ampas Tebu", "Polishing · jernihkan sisa kekeruhan", "#D9B479"],
  ];
  function renderLayers() {
    const total = S.sessions.reduce((a, r) => a + (r.volume_liters || 0), 0);
    // upper layers saturate first (they carry the coarse load)
    const wear = [1.25, 1.15, 1.0, 0.95, 0.85, 0.7];
    $("#layers").innerHTML = LAYERS.map(([n, f, c], i) => {
      const p = Math.round(clamp(100 - (total / CFG.FILTER_CAP_L) * 100 * wear[i], 0, 100));
      return `<article class="layer neu stagger" style="--i:${i + 2}">
        <div class="sw" style="--c:${c}"><span>${i + 1}</span></div>
        <div class="meta"><b>${n}</b><small>${f}</small><div class="bar neu-inset"><i style="--w:${p}%"></i></div></div>
        <span class="pc">${p}%</span></article>`;
    }).join("");
  }

  /* -------------------------------------------------------- schedule --- */
  const CLIMATE = {
    tropis: {
      freq: "2–3× sehari", sub: "Mode Tropis · rekomendasi suhu ruang",
      text: "Pagi, sore, dan malam bila perlu — terutama setelah beraktivitas atau berolahraga karena tubuh mudah berkeringat.",
      preset: [["06:00", "Mandi pagi", "Suhu ruang 20–25°C", true], ["16:30", "Mandi sore", "Suhu ruang 20–25°C", true], ["20:00", "Setelah olahraga", "Hangat 37–40°C", false]],
      tips: [
        ["Pakai air suhu ruang", "Iklim tropis selalu di atas 18°C (rata-rata 20–30°C), jadi air 20–25°C sudah nyaman dan hemat energi."],
        ["Air hangat maksimal 37–40°C", "Bila ingin mandi air hangat, jaga di 37–40°C agar kulit tidak kering."],
        ["Shower, bukan berendam", "Pancuran jauh lebih hemat air dibanding berendam di bathtub."],
        ["Aktifkan Mode Eco", "Air bekas mandi difiltrasi 6 lapis & diverifikasi sensor sebelum dipakai ulang."],
      ],
    },
    subtropis: {
      freq: "1–2× sehari", sub: "Mode Subtropis · sesuaikan dengan musim",
      text: "Pagi dan/atau sore, disesuaikan dengan musim & aktivitas — lebih jarang saat musim dingin, lebih sering saat musim panas.",
      preset: [["07:00", "Mandi pagi", "Hangat 37–40°C", true], ["17:30", "Mandi sore", "Menyesuaikan musim", true]],
      seasons: {
        dingin: [
          ["Gunakan air hangat 37–40°C", "Saat cuaca dingin (bisa di bawah 0°C), air hangat menjaga tubuh tetap nyaman."],
          ["Cukup 1× sehari", "Tubuh lebih sedikit berkeringat di musim dingin, kurangi frekuensi mandi."],
          ["Shower, bukan berendam", "Pancuran lebih hemat air dan energi pemanas."],
        ],
        panas: [
          ["Pakai air suhu ruang 20–25°C", "Musim panas bisa mencapai 25–35°C, air suhu ruang terasa segar."],
          ["Hingga 2× sehari", "Tambah sesi mandi sore setelah beraktivitas di luar."],
          ["Shower, bukan berendam", "Tetap gunakan pancuran & Mode Eco untuk menghemat air bersih."],
        ],
      },
    },
  };
  const DAYS = ["Min", "Sen", "Sel", "Rab", "Kam", "Jum", "Sab"];
  const climate = () => S.prefs.climate || "tropis";
  const season = () => S.prefs.season || "dingin";

  function renderSchedule() {
    const c = CLIMATE[climate()];
    $$(".clim").forEach((b) => b.classList.toggle("active", b.dataset.climate === climate()));
    $("#recoFreq").textContent = c.freq;
    $("#recoText").textContent = c.text;
    $("#swClimate").textContent = c.sub;
    const list = S.reminders;
    $("#schedList").innerHTML = list.length ? list.map((r) => {
      const [hh] = (r.time || "00:00").split(":").map(Number);
      const part = hh < 11 ? "Pagi" : hh < 15 ? "Siang" : hh < 19 ? "Sore" : "Malam";
      const on = r.enabled !== false;
      const days = Array.isArray(r.days) ? (r.days.length === 7 ? "Setiap hari" : r.days.join(", ")) : "";
      return `<article class="sched neu ${on ? "" : "off"}" data-id="${esc(r.id)}">
        <div class="time"><b>${esc(r.time || "--:--")}</b><small>${part}</small></div>
        <div class="meta"><b>${esc(r.label || "Mandi")}</b><small>${esc(r.temp || days)}${r.temp && days ? " · " + esc(days) : ""}</small></div>
        <label class="switch"><input type="checkbox" ${on ? "checked" : ""} data-rem="${esc(r.id)}"><span></span></label>
        <button class="del" data-del="${esc(r.id)}" aria-label="Hapus">×</button>
      </article>`;
    }).join("") : `<div class="empty">Belum ada jadwal. <a id="usePreset" style="color:var(--blue);font-weight:800;cursor:pointer">Pakai jadwal rekomendasi ${climate()}</a></div>`;
    $("#seasonSeg").hidden = climate() !== "subtropis";
    $$("#seasonSeg button").forEach((b) => b.classList.toggle("active", b.dataset.season === season()));
    const tips = climate() === "tropis" ? c.tips : c.seasons[season()];
    $("#tips").innerHTML = tips.map(([h, p], i) => `
      <article class="tip neu" style="animation-delay:${i * 90}ms"><span class="n">${i + 1}</span><div><b>${h}</b><p>${p}</p></div></article>`).join("");
    $("#notifBtn").hidden = !("Notification" in window) || Notification.permission !== "default" || !list.length;
  }
  $("#schedList").addEventListener("change", (e) => {
    const id = e.target.dataset.rem;
    if (!id) return;
    const r = S.reminders.find((x) => x.id === id);
    if (r) r.enabled = e.target.checked;
    if (S.live) B.updateReminder(id, { enabled: e.target.checked });
    else saveDemoReminders();
    renderSchedule();
  });
  $("#schedList").addEventListener("click", (e) => {
    const del = e.target.closest("[data-del]");
    if (del) {
      const id = del.dataset.del;
      S.reminders = S.reminders.filter((r) => r.id !== id);
      if (S.live) B.deleteReminder(id); else saveDemoReminders();
      renderSchedule();
      toast("Jadwal dihapus");
    }
    if (e.target.id === "usePreset") {
      CLIMATE[climate()].preset.forEach(([time, label, temp, enabled]) => addReminder({ time, label, temp, enabled, days: ["Sen", "Sel", "Rab", "Kam", "Jum", "Sab", "Min"] }));
      toast("Jadwal rekomendasi ditambahkan");
    }
  });
  function addReminder(r) {
    if (S.live) B.addReminder(r);
    else { S.reminders.push({ id: "r" + Date.now() + Math.random().toString(36).slice(2, 5), ...r }); saveDemoReminders(); renderSchedule(); }
  }
  const saveDemoReminders = () => store.set("aq-demo-reminders", S.reminders);

  function setClimate(c) { S.prefs.climate = c; savePrefs({ climate: c }); renderSchedule(); }
  function setSeason(s) { S.prefs.season = s; savePrefs({ season: s }); renderSchedule(); }
  $$(".clim").forEach((b) => b.addEventListener("click", () => setClimate(b.dataset.climate)));
  $$("#seasonSeg button").forEach((b) => b.addEventListener("click", () => setSeason(b.dataset.season)));

  // add-schedule sheet
  $("#addSched").addEventListener("click", () => openSheet("#schedSheet"));
  $$("#sDays button").forEach((b) => b.addEventListener("click", () => b.classList.toggle("on")));
  $$("#sTemp button").forEach((b) => b.addEventListener("click", () => { $$("#sTemp button").forEach((x) => x.classList.remove("on")); b.classList.add("on"); }));
  $("#sSave").addEventListener("click", () => {
    const time = $("#sTime").value, label = $("#sLabel").value.trim() || "Mandi";
    const days = $$("#sDays button.on").map((b) => b.dataset.d);
    if (!time) return toast("Pilih jam terlebih dahulu");
    if (!days.length) return toast("Pilih minimal satu hari");
    addReminder({ time, label, days, temp: $("#sTemp button.on")?.dataset.v || "", enabled: true });
    closeSheets();
    $("#sLabel").value = "";
    toast(`Jadwal ${label} pukul ${time} disimpan`);
  });

  // local reminder notifications while the app is open
  $("#notifBtn").addEventListener("click", async () => {
    const p = await Notification.requestPermission();
    toast(p === "granted" ? "Notifikasi pengingat aktif" : "Izin notifikasi ditolak");
    renderSchedule();
  });
  setInterval(() => {
    const now = new Date(), hm = now.toTimeString().slice(0, 5), day = DAYS[now.getDay()];
    for (const r of S.reminders) {
      if (r.enabled === false || r.time !== hm || (Array.isArray(r.days) && !r.days.includes(day))) continue;
      const key = `aq-notified-${r.id}-${now.toDateString()}`;
      if (store.get(key)) continue;
      store.set(key, 1);
      toast(`Waktunya ${r.label || "mandi"} · ${r.temp || ""}`);
      if ("Notification" in window && Notification.permission === "granted") {
        try { new Notification("AQUENT · Waktunya mandi", { body: `${r.label || "Mandi"} — ${r.temp || "cek kualitas air sebelum mulai"}`, icon: "assets/brand/icon-192.png" }); } catch (e) {}
      }
    }
  }, 30000);

  /* ---------------------------------------------------------- shower --- */
  const TMIN = 20, TMAX = 45, ARC = 452.4;
  let temp = 38, tempTimer;
  function setTemp(t, fromRemote) {
    temp = clamp(Math.round(t), TMIN, TMAX);
    const f = (temp - TMIN) / (TMAX - TMIN);
    $("#dialArc").style.strokeDasharray = `${ARC * f} 603.2`;
    $("#knob").style.transform = `rotate(${-135 + 270 * f}deg)`;
    $("#tempVal").textContent = temp;
    $("#tempLabel").textContent = temp <= 25 ? "Suhu ruang" : temp < 37 ? "Sejuk hangat" : temp <= 40 ? "Hangat" : "Terlalu panas";
    $$(".preset").forEach((p) => p.classList.toggle("active", Math.abs(+p.dataset.temp - temp) <= 2));
    if (!fromRemote && S.live) {
      clearTimeout(tempTimer);
      tempTimer = setTimeout(() => B.setControl("target_temp", temp), 500);
    }
  }
  $("#tMinus").addEventListener("click", () => setTemp(temp - 1));
  $("#tPlus").addEventListener("click", () => setTemp(temp + 1));
  $$(".preset").forEach((p) => p.addEventListener("click", () => animateTemp(+p.dataset.temp)));
  function animateTemp(to) {
    const from = temp, t0 = performance.now();
    const step = (now) => {
      const k = Math.min(1, (now - t0) / 700), e = 1 - Math.pow(1 - k, 3);
      setTemp(from + (to - from) * e, k < 1);
      if (k < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }
  const dial = $("#dial");
  let dragging = false;
  const angleTemp = (e) => {
    const r = dial.getBoundingClientRect();
    const a = (Math.atan2(e.clientX - (r.left + r.width / 2), -(e.clientY - (r.top + r.height / 2))) * 180) / Math.PI;
    return TMIN + ((clamp(a, -135, 135) + 135) / 270) * (TMAX - TMIN);
  };
  dial.addEventListener("pointerdown", (e) => { dragging = true; dial.setPointerCapture(e.pointerId); setTemp(angleTemp(e)); });
  dial.addEventListener("pointermove", (e) => dragging && setTemp(angleTemp(e)));
  dial.addEventListener("pointerup", () => (dragging = false));
  setTemp(temp, true);

  // device controls
  $$("[data-control]").forEach((inp) => inp.addEventListener("change", () => {
    const k = inp.dataset.control;
    S.controls[k] = inp.checked;
    if (S.live) B.setControl(k, inp.checked);
    else store.set("aq-demo-controls", S.controls);
    toast(`${inp.closest(".ctl, .eco").querySelector("b").textContent} ${inp.checked ? "aktif" : "nonaktif"}`);
  }));
  function applyControls(c) {
    S.controls = { ...S.controls, ...c };
    $$("[data-control]").forEach((inp) => { if (c[inp.dataset.control] != null) inp.checked = !!c[inp.dataset.control]; });
    if (typeof c.target_temp === "number" && !dragging && !running) setTemp(c.target_temp, true);
  }

  let running = false, secs = 0, used = 0, timer = null, startAt = 0, deviceBase = null;
  function toggleShower() {
    running = !running;
    $("#startBtn").classList.toggle("running", running);
    $("#dial").classList.toggle("running-dial", running);
    $("#startLbl").textContent = running ? "Stop" : "Mulai";
    const eco = $("#ecoSw").checked;
    if (running) {
      secs = 0; used = 0; startAt = Date.now();
      deviceBase = typeof S.deviceSession.usage === "number" ? S.deviceSession.usage : null;
      if (S.live) B.setSession({ active: true, startTime: startAt, target_temp: temp, eco });
      toast(`Shower aktif · ${temp}°C${eco ? " · Mode Eco" : ""}`);
      timer = setInterval(tick, 1000 / (window.AQ?.speed || 1));
    } else {
      clearInterval(timer);
      finishSession(eco);
    }
  }
  function tick() {
    secs += 1;
    const devUsage = typeof S.deviceSession.usage === "number" && deviceBase != null ? S.deviceSession.usage - deviceBase : null;
    used = devUsage != null && devUsage > 0 ? devUsage : (secs * CFG.FLOW_LPM) / 60;
    $("#swTime").textContent = `${String(Math.floor(secs / 60)).padStart(2, "0")}:${String(secs % 60).padStart(2, "0")}`;
    $("#swUsed").textContent = fmt(used, 1);
    const q = quality();
    $("#swRec").textContent = fmt($("#ecoSw").checked && (!q || q.pass) ? used * CFG.RECYCLE_RATIO : 0, 1);
  }
  async function finishSession(eco) {
    const q = quality();
    const rec = eco && (!q || q.pass) ? used * CFG.RECYCLE_RATIO : 0;
    if (secs < 5) { toast("Sesi terlalu singkat, tidak dicatat"); if (S.live) B.setSession({ active: false }); return; }
    const record = {
      ts: Date.now(), duration_min: +(secs / 60).toFixed(2), volume_liters: +used.toFixed(2), quality_score: q ? q.score : 0,
      water_saved_pct: used ? Math.round((rec / used) * 100) : 0, recycled_liters: +rec.toFixed(2), target_temp: temp, eco,
      ph: cur("ph"), temperature: cur("temp"), turbidity: cur("turb"), chlorine: cur("cl"),
    };
    Object.keys(record).forEach((k) => record[k] == null && delete record[k]);
    S.sessions.push(record);
    if (S.live) {
      B.setSession({ active: false, usage: record.volume_liters, duration: record.duration_min, saved: record.recycled_liters, endTime: record.ts });
      try { await B.saveSessionRecord(record); } catch (e) { toast("Gagal menyimpan sesi: " + e.message); }
    } else store.set("aq-demo-sessions", S.sessions);
    renderStats();
    renderLayers();
    toast(`Sesi selesai · ${fmt(rec, 1)} L air didaur ulang`);
  }
  $("#startBtn").addEventListener("click", toggleShower);

  /* ----------------------------------------------------------- derma --- */
  function scanDemoValues() { return { redness: 18, shine: 42, evenness: 81 }; }
  async function captureAnalyze() {
    const video = $("#cam");
    const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user", width: 640, height: 480 }, audio: false });
    video.srcObject = stream;
    video.hidden = false;
    $("#faceArt").hidden = true;
    await video.play();
    await new Promise((r) => setTimeout(r, 2600));
    const c = document.createElement("canvas");
    c.width = 160; c.height = 120;
    const ctx = c.getContext("2d", { willReadFrequently: true });
    ctx.drawImage(video, 0, 0, 160, 120);
    stream.getTracks().forEach((t) => t.stop());
    video.hidden = true;
    $("#faceArt").hidden = false;
    const data = ctx.getImageData(40, 20, 80, 80).data;
    let n = 0, red = 0, shine = 0, sumL = 0, sumL2 = 0;
    for (let i = 0; i < data.length; i += 4) {
      const r = data[i], g = data[i + 1], b = data[i + 2];
      if (!(r > 60 && g > 40 && b > 20 && r > g && r > b && r - Math.min(g, b) > 12)) continue; // skin-tone pixels
      n++;
      const L = 0.299 * r + 0.587 * g + 0.114 * b;
      red += (r - g) / (r + g + b);
      sumL += L; sumL2 += L * L;
      if (L > 205 && Math.max(r, g, b) - Math.min(r, g, b) < 40) shine++;
    }
    if (n < 400) throw new Error("Wajah tidak terdeteksi. Pastikan pencahayaan cukup dan wajah di tengah bingkai.");
    const meanL = sumL / n, std = Math.sqrt(Math.max(0, sumL2 / n - meanL * meanL));
    return {
      redness: Math.round(clamp(((red / n - 0.06) / 0.16) * 100, 0, 100)),
      shine: Math.round(clamp((shine / n) * 400, 0, 100)),
      evenness: Math.round(clamp(100 - std * 1.6, 0, 100)),
    };
  }
  async function scan() {
    const card = $("#scanCard"), st = $("#scanStatus");
    card.classList.add("scanning");
    $$("[data-skin]").forEach((b) => { b.textContent = "–"; b.nextElementSibling.firstElementChild.style.width = "0"; });
    let res;
    try {
      if (S.live && navigator.mediaDevices?.getUserMedia) {
        st.textContent = "Menganalisis wajah…";
        res = await captureAnalyze();
      } else {
        const steps = ["Menganalisis tekstur kulit…", "Membaca kemerahan…", "Mencocokkan kualitas air…"];
        for (const s of steps) { st.textContent = s; await new Promise((r) => setTimeout(r, 900)); }
        res = scanDemoValues();
      }
    } catch (e) {
      card.classList.remove("scanning");
      $("#cam").hidden = true; $("#faceArt").hidden = false;
      st.textContent = "Scan gagal";
      toast(e.name === "NotAllowedError" ? "Izin kamera ditolak" : e.message);
      return;
    }
    res.match = waterMatch();
    res.at = Date.now();
    S.prefs.lastScan = res;
    savePrefs({ lastScan: res });
    card.classList.remove("scanning");
    st.textContent = "Analisis selesai ✓";
    showScan(res);
    renderXai();
  }
  function showScan(res) {
    $$("[data-skin]").forEach((b, i) => setTimeout(() => {
      const v = res[b.dataset.skin];
      if (v == null) return;
      b.textContent = v + "%";
      b.nextElementSibling.firstElementChild.style.width = v + "%";
    }, i * 150));
  }
  function waterMatch() {
    const q = quality();
    let m = q ? q.score : 80;
    const skin = S.prefs.skinType || "normal", cl = cur("cl");
    if ((skin === "kering" || skin === "sensitif") && temp > 38) m -= 8;
    if (skin === "sensitif" && cl != null && cl > 0.4) m -= 10;
    if (skin === "berminyak" && temp > 38) m -= 5;
    return Math.round(clamp(m, 0, 100));
  }
  $("#scanBtn").addEventListener("click", scan);

  /* explainable skin score: every point comes from a visible factor */
  function xaiFactors() {
    const f = [], skin = S.prefs.skinType || "normal";
    const ph = cur("ph"), cl = cur("cl"), tb = cur("turb"), t = cur("temp") ?? temp;
    if (ph != null) f.push(ph >= 6.5 && ph <= 7.5 ? [`pH netral ${fmt(ph, 1)}`, 12] : ph <= 8.5 && ph >= 6.5 ? [`pH ${fmt(ph, 1)} (sedikit basa)`, 4] : [`pH ${fmt(ph, 1)} di luar batas`, -12]);
    if (cl != null) f.push(cl <= 0.3 ? ["Sisa klorin rendah", 8] : cl <= 0.5 ? [`Klorin ${fmt(cl, 2)} mg/L`, skin === "sensitif" ? -6 : -2] : ["Klorin tinggi", -12]);
    if (tb != null) f.push(tb <= 0.5 ? [`Kekeruhan ${fmt(tb, 2)} NTU`, 5] : tb <= 1 ? [`Kekeruhan ${fmt(tb, 2)} NTU`, -3] : ["Air keruh", -10]);
    if (t != null) {
      const dry = skin === "kering" || skin === "sensitif";
      f.push(t > 40 ? [`Suhu ${fmt(t, 0)}°C terlalu panas`, -10] : t > 38 ? [`Suhu ${fmt(t, 0)}°C`, dry ? -6 : -4] : t >= 30 ? [`Suhu ${fmt(t, 0)}°C`, 4] : [`Suhu ${fmt(t, 0)}°C`, 1]);
    }
    const sc = S.prefs.lastScan;
    if (sc && sc.redness > 50) f.push(["Kemerahan terdeteksi", -6]);
    return f;
  }
  function renderXai() {
    const f = xaiFactors();
    if (!f.length) {
      $("#xaiRows").innerHTML = `<div class="empty">Menunggu data sensor.</div>`;
      return;
    }
    const score = Math.round(clamp(70 + f.reduce((a, [, p]) => a + p, 0), 0, 100));
    $("#xaiScore").textContent = score;
    $("#xaiTitle").textContent = `Kenapa skornya ${score}?`;
    const fresh = !S.live || Date.now() - S.lastSensorAt < CFG.STALE_MS;
    const conf = clamp((fresh ? 90 : 60) - (S.prefs.lastScan ? 0 : 10) - (4 - Math.min(4, f.length)) * 5, 30, 95);
    $("#xaiConf").textContent = `Keyakinan ${conf}%${conf < 50 ? " · rendah" : ""}`;
    $("#xaiRows").innerHTML = f.map(([label, p]) => `
      <div class="xai-row"><span>${esc(label)}</span><div class="xbar"><i class="${p >= 0 ? "pos" : "neg"}" style="--w:${clamp((Math.abs(p) / 14) * 100, 8, 100)}%"></i></div><b class="${p >= 0 ? "pos" : "neg"}">${p >= 0 ? "+" : "−"}${Math.abs(p)}</b></div>`).join("");
  }

  /* rule-based consultant using the live sensor values */
  function reply(q) {
    const skin = S.prefs.skinType || "normal";
    const ph = cur("ph"), cl = cur("cl"), tb = cur("turb"), t = cur("temp");
    const qq = quality();
    const water = qq ? `Skor air saat ini ${qq.score}/100 (${qq.grade.toLowerCase()})` : "Data sensor belum masuk";
    const conf = qq ? "Keyakinan: tinggi (data sensor terbaru)." : "Keyakinan: rendah (belum ada data sensor).";
    const L = q.toLowerCase();
    if (/kering|gatal|kusam|pecah/.test(L))
      return `Untuk kulit kering, mandi 5–10 menit dengan air maksimal 37°C${t != null ? ` (suhu air sekarang ${fmt(t, 1)}°C)` : ""}. ${ph != null ? `pH ${fmt(ph, 1)} ${ph <= 7.5 ? "cukup netral sehingga tidak memperparah kekeringan" : "agak basa, persingkat durasi mandi"}` : ""}. Oleskan pelembap maks. 3 menit setelah mandi. ${conf}`;
    if (/jerawat|minyak|komedo/.test(L))
      return `Kulit berminyak/berjerawat cocok dengan air suhu ruang 20–30°C dan mandi 2× sehari setelah beraktivitas. Hindari air >38°C yang memicu produksi minyak. ${water}. ${conf}`;
    if (/aman|kualitas|klorin|layak|bersih/.test(L))
      return `${water}. ${ph != null ? `pH ${fmt(ph, 2)}` : ""}${tb != null ? `, kekeruhan ${fmt(tb, 2)} NTU` : ""}${cl != null ? `, sisa klorin ${fmt(cl, 2)} mg/L` : ""}. ${qq?.pass ? "Semua parameter dalam ambang aman, air boleh dipakai ulang." : qq ? "Ada parameter di luar ambang — sistem mengalirkan air ke drain." : ""} ${conf}`;
    if (/suhu|panas|hangat|dingin|derajat/.test(L))
      return `Suhu ideal untuk kulit ${skin}: ${skin === "kering" || skin === "sensitif" ? "30–37°C" : "30–38°C"}. Di iklim ${climate()}, ${climate() === "tropis" ? "air suhu ruang 20–25°C sudah nyaman; bila ingin hangat pakai 37–40°C" : "gunakan 37–40°C saat dingin dan suhu ruang saat panas"}. ${t != null ? `Suhu air terukur ${fmt(t, 1)}°C.` : ""}`;
    if (/sensitif|merah|eksim|iritasi|ruam/.test(L))
      return `Untuk kulit sensitif/kemerahan, jaga suhu ≤37°C dan pastikan sisa klorin ≤0,4 mg/L${cl != null ? ` (sekarang ${fmt(cl, 2)} mg/L)` : ""}. Bila ruam menetap lebih dari seminggu, konsultasikan ke dokter kulit. ${conf}`;
    if (/jadwal|berapa kali|sehari/.test(L))
      return `Rekomendasi untuk iklim ${climate()}: ${CLIMATE[climate()].freq}. Atur pengingat di tab Jadwal.`;
    if (/filter|cartridge|ganti/.test(L))
      return `Kesehatan filter diperkirakan ${$("#filterPct").textContent}% dari total ${$("#fhTotal").textContent} tersaring. ${$("#filterNote").textContent}.`;
    return `${water}. Untuk kulit ${skin}, pertahankan suhu 30–37°C, mandi dengan shower (bukan berendam), dan aktifkan Mode Eco. Tanyakan hal spesifik seperti "kulit kering", "air aman?", atau "suhu ideal". ${conf}`;
  }
  function send(q) {
    const msgs = $("#msgs");
    msgs.insertAdjacentHTML("beforeend", `<div class="msg me"><p></p></div>`);
    msgs.lastElementChild.querySelector("p").textContent = q;
    msgs.insertAdjacentHTML("beforeend", `<div class="msg bot typing-row"><img src="${img("robot")}" alt=""><p class="typing"><i></i><i></i><i></i></p></div>`);
    scrollChat();
    setTimeout(() => {
      const row = $(".typing-row", msgs);
      row.classList.remove("typing-row");
      const p = row.querySelector("p");
      p.classList.remove("typing");
      p.textContent = "";
      const text = reply(q);
      let i = 0;
      const t = setInterval(() => {
        p.textContent = text.slice(0, (i += 2));
        if (i >= text.length) clearInterval(t);
        scrollChat();
      }, 16);
    }, 900);
  }
  const scrollChat = () => { const sc = $("#derma"); sc.scrollTo({ top: sc.scrollHeight, behavior: "smooth" }); };
  $("#composer").addEventListener("submit", (e) => {
    e.preventDefault();
    const q = $("#chatIn").value.trim();
    if (!q) return;
    $("#chatIn").value = "";
    send(q);
  });
  $$("#quickQs button").forEach((b) => b.addEventListener("click", () => send(b.textContent)));
  function typeAndSend(q) {
    const inp = $("#chatIn");
    inp.value = "";
    let i = 0;
    const t = setInterval(() => {
      inp.value = q.slice(0, ++i);
      if (i >= q.length) { clearInterval(t); setTimeout(() => { inp.value = ""; send(q); }, 350); }
    }, 45);
  }

  /* --------------------------------------------------------- profile --- */
  function savePrefs(patch) {
    S.prefs = { ...S.prefs, ...patch };
    if (S.live) B.savePrefs(patch).catch((e) => console.warn(e.message));
    else store.set("aq-demo-prefs", S.prefs);
  }
  function displayName() {
    return S.prefs.name || (S.user && (S.user.displayName || (S.user.email || "").split("@")[0])) || (S.live ? "Pengguna" : "Nadia Putri");
  }
  function renderProfile() {
    const h = new Date().getHours();
    $("#greetTime").textContent = h < 11 ? "Selamat pagi," : h < 15 ? "Selamat siang," : h < 19 ? "Selamat sore," : "Selamat malam,";
    $("#greetName").textContent = displayName();
    $("#dermaHello").textContent = `Halo ${displayName().split(" ")[0]}! Siap cek kondisi kulitmu?`;
    const photo = S.user && S.user.photoURL;
    ["#avatarImg", "#sheetAvatar"].forEach((s) => ($(s).src = photo || img("user")));
    $("#pfName").textContent = displayName();
    $("#pfEmail").textContent = S.live ? S.user.email || "" : "Mode demo · data tidak disimpan ke cloud";
    $("#pfRole").textContent = S.live ? (B.role || "free").replace(/^./, (c) => c.toUpperCase()) : "Demo";
    $("#pfNameIn").value = S.prefs.name || (S.user && S.user.displayName) || "";
    $$("#pfSkin button").forEach((b) => b.classList.toggle("on", b.dataset.v === (S.prefs.skinType || "normal")));
    $("#pfLogout").textContent = S.live ? "Keluar" : B && B.available ? "Masuk dengan akun" : "Tutup";
  }
  $("#avatarBtn").addEventListener("click", () => { renderProfile(); openSheet("#profileSheet"); });
  $$("#pfSkin button").forEach((b) => b.addEventListener("click", () => { $$("#pfSkin button").forEach((x) => x.classList.remove("on")); b.classList.add("on"); }));
  $("#pfSave").addEventListener("click", () => {
    const name = $("#pfNameIn").value.trim();
    savePrefs({ name, skinType: $("#pfSkin button.on")?.dataset.v || "normal" });
    closeSheets();
    renderProfile();
    renderQuality();
    renderXai();
    toast("Profil disimpan");
  });
  $("#pfLogout").addEventListener("click", async () => {
    closeSheets();
    if (S.live) { await B.signOut(); location.reload(); }
    else if (B && B.available) { store.set("aq-demo-mode", 0); go("login"); }
  });

  function openSheet(sel) { $("#scrim").classList.add("show"); $(sel).classList.add("show"); }
  function closeSheets() { $("#scrim").classList.remove("show"); $$(".sheet").forEach((s) => s.classList.remove("show")); }
  $("#scrim").addEventListener("click", closeSheets);

  /* ------------------------------------------------------------ auth --- */
  let registerMode = false;
  function setAuthMode(reg) {
    registerMode = reg;
    $("#nameField").hidden = !reg;
    $("#authTitle").textContent = reg ? "Buat akun baru" : "Masuk ke akunmu";
    $("#authSubmit").textContent = reg ? "Daftar" : "Masuk";
    $("#switchText").textContent = reg ? "Sudah punya akun?" : "Belum punya akun?";
    $("#switchAuth").textContent = reg ? "Masuk" : "Daftar";
    $("#authPass").autocomplete = reg ? "new-password" : "current-password";
    authMsg("");
  }
  const authMsg = (m, ok) => { const e = $("#authErr"); e.textContent = m; e.classList.toggle("ok", !!ok); };
  $("#switchAuth").addEventListener("click", () => setAuthMode(!registerMode));
  $("#authForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const email = $("#authEmail").value.trim(), pass = $("#authPass").value;
    if (!email || !pass) return authMsg("Isi email dan password.");
    const btn = $("#authSubmit");
    btn.disabled = true;
    try {
      if (registerMode) await B.register(email, pass, $("#authName").value.trim());
      else await B.signInEmail(email, pass, $("#remember").checked);
    } catch (err) { authMsg(B.authError(err)); }
    btn.disabled = false;
  });
  $("#googleBtn").addEventListener("click", async () => {
    try { await B.signInGoogle(); } catch (err) { authMsg(B.authError(err)); }
  });
  $("#forgotBtn").addEventListener("click", async () => {
    const email = $("#authEmail").value.trim();
    if (!email) return authMsg("Isi email untuk reset password.");
    try { await B.resetPassword(email); authMsg("Link reset password dikirim ke email.", true); } catch (err) { authMsg(B.authError(err)); }
  });
  $("#demoBtn").addEventListener("click", () => { store.set("aq-demo-mode", 1); startDemo(); go("home"); });
  $("#startBtnSplash").addEventListener("click", () => go(S.live || !B || !B.available || store.get("aq-demo-mode") ? "home" : "login"));

  /* ---------------------------------------------------------- router --- */
  let current = "splash";
  $$(".screen .stagger").forEach((el) => {
    const siblings = $$(".stagger", el.closest(".screen"));
    el.style.setProperty("--i", el.style.getPropertyValue("--i") || siblings.indexOf(el));
  });

  function countUp(root) {
    $$("[data-count]", root).forEach((el) => {
      const to = +el.dataset.count, t0 = performance.now(), dur = 1400;
      const step = (now) => {
        const k = Math.min(1, (now - t0) / dur), e = 1 - Math.pow(1 - k, 4);
        el.textContent = fmt(Math.round(to * e));
        if (k < 1) requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    });
  }

  const NEEDS_AUTH = new Set(["home", "monitor", "shower", "schedule", "derma", "filter", "impact"]);
  function go(id) {
    if (id === current || !$("#" + id)) return;
    if (NEEDS_AUTH.has(id) && !S.live && !S.demo) id = "login";
    if (id === current) return;
    const from = $("#" + current), to = $("#" + id);
    const order = (s) => +s.dataset.nav;
    from.classList.toggle("leave-back", order(to) >= order(from));
    from.classList.remove("active");
    to.classList.remove("leave-back");
    to.scrollTop = 0;
    to.classList.add("active");
    current = id;
    const nav = order(to);
    $$("#tabbar button").forEach((b) => b.classList.toggle("active", +b.dataset.idx === nav));
    $("#tabbar").classList.toggle("hide", id === "splash" || id === "login");
    countUp(to);
    const ring = $("#qualityRing");
    ring.style.strokeDashoffset = 314.16;
    if (id === "home") setTimeout(renderQuality, 250);
    $$("#weekBars i").forEach((i) => (i.style.height = "0"));
    if (id === "impact") setTimeout(() => $$("#weekBars i").forEach((i) => (i.style.height = i.dataset.h + "%")), 350);
    if (id === "monitor") { updateHero(); drawChart(true); }
    if (id === "derma") renderXai();
    history.replaceState(null, "", location.pathname + location.search + "#" + id);
  }
  document.addEventListener("click", (e) => {
    const t = e.target.closest("[data-go]");
    if (t) go(t.dataset.go);
  });

  let toastT;
  function toast(msg) {
    const t = $("#toast");
    t.textContent = msg;
    t.classList.add("show");
    clearTimeout(toastT);
    toastT = setTimeout(() => t.classList.remove("show"), 2800);
  }

  function setDevChip(text, cls) {
    const c = $("#devChip");
    c.className = "chip live " + (cls || "");
    c.querySelector("b").textContent = text;
  }

  /* ----------------------------------------------------------- modes --- */
  let demoTimer = null;
  function startDemo() {
    if (S.demo) return;
    S.demo = true;
    S.live = false;
    S.prefs = store.get("aq-demo-prefs", { climate: "tropis", skinType: "normal" });
    S.sessions = store.get("aq-demo-sessions", null) || seedDemoSessions();
    S.reminders = store.get("aq-demo-reminders", null) || CLIMATE.tropis.preset.map(([time, label, t, enabled], i) => ({ id: "d" + i, time, label, temp: t, enabled, days: ["Sen", "Sel", "Rab", "Kam", "Jum", "Sab", "Min"] }));
    applyControls(store.get("aq-demo-controls", { eco: true, filter: true, heating: true, recirculation: false }));
    let seed = 7;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const now = Date.now();
    for (const [k, s] of Object.entries(SENSORS)) {
      let v = s.demo[0];
      for (let i = 40; i > 0; i--) {
        v += (rnd() - 0.5) * s.demo[1] * 2.4 + (s.demo[0] - v) * 0.15;
        pushReading(k, v, now - i * 2000);
      }
    }
    demoTimer = setInterval(() => {
      for (const [k, s] of Object.entries(SENSORS)) {
        const v = cur(k) + (rnd() - 0.5) * s.demo[1] * 2.4 + (s.demo[0] - cur(k)) * 0.15;
        pushReading(k, v);
      }
      renderSensors();
    }, 2000);
    setDevChip("Mode demo", "demo");
    refreshAll();
  }

  async function startLive(user) {
    S.live = true;
    S.demo = false;
    S.user = user;
    clearInterval(demoTimer);
    for (const k in hist) hist[k] = [];
    const saved = store.get("aq-hist-" + user.uid, null);
    if (saved) for (const k in hist) hist[k] = (saved[k] || []).filter((p) => Date.now() - p.t < 6 * 3600e3);
    setDevChip("Menghubungkan…", "off");
    try { S.prefs = { climate: "tropis", skinType: "normal", ...(await B.loadPrefs()) }; } catch (e) { S.prefs = {}; }
    try { S.sessions = await B.loadSessions(); } catch (e) { S.sessions = []; toast("Gagal memuat riwayat sesi"); }
    refreshAll();

    B.onConnection((ok) => {
      S.connected = ok;
      if (!ok) setDevChip("Offline", "off");
      else setDevChip(S.lastSensorAt ? "Online · Terhubung" : "Menunggu perangkat", S.lastSensorAt ? "" : "off");
    });
    B.subSensors((d) => {
      const t = Date.now();
      S.lastSensorAt = t;
      for (const [k, s] of Object.entries(SENSORS)) if (d[s.key] != null) pushReading(k, Number(d[s.key]), t);
      store.set("aq-hist-" + user.uid, hist);
      setDevChip("Online · Terhubung", "");
      renderSensors();
    });
    B.subControls(applyControls);
    B.subSession((s) => { S.deviceSession = s; });
    B.subReminders((list) => { S.reminders = list; renderSchedule(); });
    B.subAnnouncements((a) => {
      const seen = store.get("aq-ann-seen", "");
      if (a.id === seen) return;
      $("#bellDot").hidden = false;
      $("#bellBtn").onclick = () => { toast(`${a.title || "Pengumuman"}${a.body ? " — " + a.body : ""}`); store.set("aq-ann-seen", a.id); $("#bellDot").hidden = true; };
    });
    setInterval(() => { if (current === "monitor") updateHero(); if (S.lastSensorAt && Date.now() - S.lastSensorAt > CFG.STALE_MS) setDevChip("Data > 5 menit lalu", "off"); }, 5000);
    if (current === "splash" || current === "login") go("home");
  }

  function refreshAll() {
    renderProfile();
    renderSensors();
    renderStats();
    renderLayers();
    renderSchedule();
    renderXai();
    if (S.prefs.lastScan) showScan(S.prefs.lastScan);
    selectSensor(curSensor, false);
  }

  /* ------------------------------------------------------------ boot --- */
  $("#tabbar").classList.add("hide");
  const fbReady = B && B.init();
  if (!fbReady || MOCK || params.has("demo")) {
    startDemo();
    const startScreen = params.get("screen") || location.hash.slice(1);
    if (startScreen && startScreen !== "splash") go(startScreen);
  } else {
    if (store.get("aq-demo-mode")) startDemo();
    B.onAuth((user) => {
      if (user) startLive(user);
      else if (S.live) location.reload();
    });
  }
  if ("serviceWorker" in navigator && location.protocol.startsWith("http") && !MOCK) {
    navigator.serviceWorker.register("/sw.js").catch((e) => console.warn("SW:", e.message));
  }

  /* public API (used by the showreel recorder) */
  window.AQ = Object.assign(window.AQ || {}, {
    go, selectSensor, setClimate, setTemp: animateTemp, toggleShower, scan, ask: typeAndSend, toast, setSeason,
    scroll: (y) => $("#" + current).scrollTo({ top: y, behavior: "smooth" }),
    speed: window.AQ?.speed || 1,
  });
})();
