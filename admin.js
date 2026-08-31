/* =====================================================
   AQUENT — admin.js  v1.0
   Admin dashboard logic
   ===================================================== */

let allUsers = [];
let db = null;

document.addEventListener('DOMContentLoaded', () => {
  // Wait for Firebase
  const gate = document.getElementById('authGate');

  initAuthListener({ requireAuth: true, requireAdmin: true });

  onAuthReady(({ user, role }) => {
    if (role !== 'admin') return; // initAuthListener already redirects

    // Hide gate
    gate.classList.add('hide');

    // Set admin info in header
    const admAvatar = document.getElementById('admAvatar');
    const admName   = document.getElementById('admName');
    if (admAvatar) {
      if (user.photoURL) {
        admAvatar.innerHTML = `<img src="${user.photoURL}" alt="">`;
      } else {
        admAvatar.textContent = (user.displayName || user.email || 'A')[0].toUpperCase();
      }
    }
    if (admName) admName.textContent = user.displayName || user.email || 'Admin';

    db = firebase.firestore();

    // Init nav
    initAdminNav();
    initGlobalSearch();

    // Load data
    loadUsers();
    renderPlans();
  });
});

/* ---- Navigation ---- */
function initAdminNav() {
  const titles = {
    overview:'Overview', users:'Manajemen User', plans:'Paket & Harga',
    surveys:'Survei (P15)', analytics:'Survey Analytics',
    insights:'Session Insights', sensors:'Live Sensors', announcements:'Pengumuman',
    logs:'Audit Log',
  };
  document.querySelectorAll('.adm-nav-item').forEach(btn => {
    btn.addEventListener('click', () => {
      const page = btn.dataset.page;
      document.querySelectorAll('.adm-nav-item').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      document.querySelectorAll('.adm-section').forEach(s => s.classList.remove('active'));
      document.getElementById('pg-' + page)?.classList.add('active');
      document.getElementById('pageTitle').textContent = titles[page] || page;
      // Stop live sensor listener saat pindah halaman
      if (page !== 'sensors' && _liveRef) {
        _liveRef.off(); _liveRef = null;
      }
      // Lazy-load handlers per page
      if (page === 'surveys')        refreshSurveys();
      if (page === 'analytics')      refreshAnalytics();
      if (page === 'insights')       refreshInsights();
      if (page === 'sensors')        startLiveSensors();
      if (page === 'announcements')  loadAnnouncements();
      if (page === 'logs')           loadAuditLogs();
    });
  });
}

/* ---- Load all users from Firestore ---- */
async function loadUsers() {
  if (!db) return;
  try {
    const snap = await db.collection('users').orderBy('createdAt', 'desc').get();
    allUsers = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    renderStats();
    renderRecentUsers();
    renderUserTable();
  } catch (e) {
    console.error('loadUsers error:', e);
  }
}

/* ---- Stats ---- */
function renderStats() {
  const total    = allUsers.length;
  const premium  = allUsers.filter(u => u.role === 'premium').length;
  const ultimate = allUsers.filter(u => u.role === 'ultimate').length;

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const newToday = allUsers.filter(u => {
    if (!u.createdAt) return false;
    const d = u.createdAt.toDate ? u.createdAt.toDate() : new Date(u.createdAt);
    return d >= today;
  }).length;

  setText('statTotal',   total);
  setText('statPremium', premium);
  setText('statUltimate',ultimate);
  setText('statNew',     newToday);
  setText('statTotalChange', `+${total}`);
  setText('statPremChange',  premium  ? `${Math.round(premium/total*100)}%`  : '0%');
  setText('statUltChange',   ultimate ? `${Math.round(ultimate/total*100)}%` : '0%');
  setText('statNewChange',   `+${newToday}`);
}

/* ---- Recent users (overview page) ---- */
function renderRecentUsers() {
  const tbody = document.getElementById('recentBody');
  if (!tbody) return;
  const recent = allUsers.slice(0, 8);
  if (!recent.length) {
    tbody.innerHTML = '<tr class="empty-row"><td colspan="3">Belum ada pengguna.</td></tr>';
    return;
  }
  tbody.innerHTML = recent.map(u => `
    <tr>
      <td><div class="user-cell">
        <div class="u-avatar" style="background:${avatarColor(u.email || u.id)}">
          ${u.photoURL ? `<img src="${u.photoURL}" alt="">` : esc(initial(u))}
        </div>
        <div>
          <div class="u-name">${esc(u.displayName || '—')}</div>
          <div class="u-email">${esc(u.email || u.id)}</div>
        </div>
      </div></td>
      <td><span class="role-badge role-${u.role || 'free'}">${roleBadgeHtml(u.role)}</span></td>
      <td class="date-cell">${formatDate(u.createdAt)}</td>
    </tr>
  `).join('');
}

/* ---- User management table ---- */
function renderUserTable(filterRole = '', query = '') {
  const tbody = document.getElementById('userBody');
  if (!tbody) return;
  const q = query.toLowerCase();
  const list = allUsers.filter(u => {
    const matchRole  = !filterRole || u.role === filterRole;
    const matchQuery = !q || (u.displayName||'').toLowerCase().includes(q) || (u.email||'').toLowerCase().includes(q);
    return matchRole && matchQuery;
  });
  if (!list.length) {
    tbody.innerHTML = '<tr class="empty-row"><td colspan="4">Tidak ada pengguna ditemukan.</td></tr>';
    return;
  }
  tbody.innerHTML = list.map(u => `
    <tr id="row-${u.id}">
      <td onclick="openUserDetail('${u.id}')" style="cursor:pointer"><div class="user-cell">
        <div class="u-avatar" style="background:${avatarColor(u.email || u.id)}">
          ${u.photoURL ? `<img src="${u.photoURL}" alt="">` : esc(initial(u))}
        </div>
        <div>
          <div class="u-name">${esc(u.displayName || '—')}</div>
          <div class="u-email">${esc(u.email || u.id)}</div>
        </div>
      </div></td>
      <td><span class="role-badge role-${u.role || 'free'}">${roleBadgeHtml(u.role)}</span></td>
      <td>
        <div style="display:flex;align-items:center;gap:8px">
          <select class="role-select" id="sel-${u.id}" onchange="markDirty('${u.id}')">
            <option value="free"     ${(u.role||'free')==='free'     ? 'selected':''}>Free</option>
            <option value="premium"  ${u.role==='premium'  ? 'selected':''}>Premium</option>
            <option value="ultimate" ${u.role==='ultimate' ? 'selected':''}>Ultimate</option>
            <option value="admin"    ${u.role==='admin'    ? 'selected':''}>Admin</option>
          </select>
          <button class="btn-save-role" id="save-${u.id}" disabled onclick="saveRole('${u.id}')">
            <i class="ph ph-floppy-disk"></i> Simpan
          </button>
        </div>
      </td>
      <td class="date-cell">${formatDate(u.createdAt)}</td>
    </tr>
  `).join('');
}

function markDirty(uid) {
  const btn = document.getElementById('save-' + uid);
  if (btn) btn.disabled = false;
}

async function saveRole(uid) {
  const sel = document.getElementById('sel-' + uid);
  const btn = document.getElementById('save-' + uid);
  if (!sel || !btn || !db) return;
  const newRole = sel.value;
  const oldRole = (allUsers.find(x => x.id === uid)?.role) || 'free';
  btn.disabled = true;
  btn.innerHTML = '<div class="spin" style="width:13px;height:13px;border-width:2px"></div>';
  try {
    await db.collection('users').doc(uid).update({ role: newRole, plan: newRole });

    // Sync meta/admins di RTDB
    const adminRef = firebase.database().ref('meta/admins/' + uid);
    if (newRole === 'admin') await adminRef.set(true);
    else if (oldRole === 'admin') await adminRef.remove();

    // Audit log
    await logAdminAction('change_role', uid, `${oldRole} → ${newRole}`);

    // Update local cache
    const u = allUsers.find(x => x.id === uid);
    if (u) u.role = newRole;
    // Refresh badge in same row
    const row = document.getElementById('row-' + uid);
    if (row) {
      const badge = row.querySelector('.role-badge');
      if (badge) { badge.className = 'role-badge role-' + newRole; badge.innerHTML = roleBadgeHtml(newRole); }
    }
    btn.innerHTML = '<i class="ph ph-check"></i> Tersimpan';
    showToast('Paket diperbarui ke ' + newRole, 'ok');
    renderStats();
  } catch (e) {
    btn.disabled = false;
    btn.innerHTML = '<i class="ph ph-floppy-disk"></i> Simpan';
    showToast('Gagal menyimpan: ' + e.message, 'err');
  }
}

/* ---- Search & Filter ---- */
document.addEventListener('DOMContentLoaded', () => {
  setTimeout(() => {
    document.getElementById('userSearch')?.addEventListener('input', e => {
      renderUserTable(document.getElementById('roleFilter').value, e.target.value);
    });
    document.getElementById('roleFilter')?.addEventListener('change', e => {
      renderUserTable(e.target.value, document.getElementById('userSearch').value);
    });
  }, 500);
});

/* ---- Plans section ---- */
const PLANS = [
  {
    key:'free', name:'Free', price:'Rp 0', period:'selamanya', color:'#8b949e',
    icon:'ph-leaf',
    features:[
      { label:'Dashboard real-time', ok:true },
      { label:'5 pesan AI per hari', ok:true },
      { label:'Eco-Monitor dasar', ok:true },
      { label:'Skin Scanner', ok:false },
      { label:'AI Chat Unlimited', ok:false },
      { label:'Multi-Profil', ok:false },
      { label:'Push Notifikasi', ok:false },
    ],
  },
  {
    key:'premium', name:'Premium', price:'Rp 29.000', period:'/bulan', color:'#f0c040',
    icon:'ph-star', featured:true,
    features:[
      { label:'Semua fitur Free', ok:true },
      { label:'AI Chat Unlimited', ok:true },
      { label:'Skin Scanner AI', ok:true },
      { label:'Riwayat Sesi', ok:true },
      { label:'Multi-Profil', ok:false },
      { label:'Push Notifikasi', ok:false },
      { label:'Prioritas Support', ok:false },
    ],
  },
  {
    key:'ultimate', name:'Ultimate', price:'Rp 59.000', period:'/bulan', color:'#00b4d8',
    icon:'ph-lightning',
    features:[
      { label:'Semua fitur Premium', ok:true },
      { label:'Multi-Profil (5 profil)', ok:true },
      { label:'Push Notifikasi', ok:true },
      { label:'Laporan PDF bulanan', ok:true },
      { label:'Prioritas Support 24/7', ok:true },
      { label:'Akses fitur Beta', ok:true },
    ],
  },
];

function renderPlans() {
  const grid = document.getElementById('planGrid');
  if (!grid) return;
  grid.innerHTML = PLANS.map(p => {
    const cnt = allUsers.filter(u => (u.role || 'free') === p.key).length;
    return `
      <div class="plan-card ${p.featured ? 'featured' : ''}">
        <div class="plan-name" style="color:${p.color}">
          <i class="ph-fill ${p.icon}"></i> ${p.name}
        </div>
        <div class="plan-price">${p.price}<span> ${p.period}</span></div>
        <ul class="plan-features">
          ${p.features.map(f => `
            <li class="${f.ok ? '' : 'no'}">
              <i class="ph-fill ${f.ok ? 'ph-check-circle' : 'ph-x-circle'}"></i>
              ${f.label}
            </li>
          `).join('')}
        </ul>
        <div class="plan-users-count">
          <i class="ph ph-users" style="margin-right:4px"></i>${cnt} pengguna aktif
        </div>
      </div>
    `;
  }).join('');
}

/* ---- Sign out ---- */
async function adminSignOut() {
  await firebase.auth().signOut();
  window.location.href = '/login.html';
}

/* ---- Helpers ---- */
function setText(id, val) {
  const el = document.getElementById(id);
  if (el) el.textContent = val;
}
function esc(s) {
  return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}
function initial(u) {
  return ((u.displayName || u.email || '?')[0]).toUpperCase();
}
function avatarColor(seed) {
  const colors = ['#0077b6','#00b4d8','#7b2d8b','#e63946','#2d6a4f','#e76f51','#264653'];
  let h = 0;
  for (let i = 0; i < (seed||'').length; i++) h = (h + seed.charCodeAt(i)) % colors.length;
  return colors[h];
}
function roleBadgeHtml(role) {
  const icons = { free:'ph-leaf', premium:'ph-star', ultimate:'ph-lightning', admin:'ph-shield-check' };
  return `<i class="ph-fill ${icons[role] || 'ph-leaf'}"></i> ${(role || 'free').charAt(0).toUpperCase() + (role||'free').slice(1)}`;
}
function formatDate(ts) {
  if (!ts) return '—';
  try {
    const d = ts.toDate ? ts.toDate() : new Date(ts);
    return d.toLocaleDateString('id-ID', { day:'numeric', month:'short', year:'numeric' });
  } catch { return '—'; }
}

let toastTimer = null;
function showToast(msg, type = 'ok') {
  const t = document.getElementById('toast');
  if (!t) return;
  t.textContent = msg;
  t.className = 'toast show ' + type;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 3000);
}

/* =====================================================
   SURVEY EXPORT (P15)
   Baca surveys/{uid}/{ts} dari Realtime DB → flatten → CSV
   ===================================================== */
let _surveyRows = [];
let _surveyKeys = [];

async function refreshSurveys() {
  const meta = document.getElementById('surveyMeta');
  const host = document.getElementById('surveyTableHost');
  if (meta) meta.textContent = 'Memuat data...';
  if (host) host.innerHTML = '<div style="padding:24px;color:var(--text2);text-align:center"><span class="spin" style="display:inline-block;vertical-align:middle"></span> Membaca surveys/...</div>';
  try {
    const rtdb = firebase.database();
    const snap = await rtdb.ref('surveys').once('value');
    const data = snap.val() || {};
    const rows = [];
    Object.entries(data).forEach(([uid, byTs]) => {
      Object.entries(byTs || {}).forEach(([ts, payload]) => {
        rows.push(_flattenSurvey(uid, ts, payload));
      });
    });
    _surveyRows = rows;
    _surveyKeys = _collectKeys(rows);
    if (meta) meta.textContent = `${rows.length} responden · ${_surveyKeys.length} kolom`;
    _renderSurveyTable();
  } catch (e) {
    console.error('refreshSurveys err:', e);
    if (meta) meta.textContent = '⚠ Gagal memuat: ' + e.message;
    if (host) host.innerHTML = `<div style="padding:24px;color:var(--red);text-align:center">Error: ${esc(e.message)}<br><small>Pastikan rules Realtime DB mengizinkan admin baca node "surveys/".</small></div>`;
  }
}

function _flattenSurvey(uid, ts, payload) {
  const row = { uid, ts: parseInt(ts) || ts, submittedAt: payload.submittedAt || ts };
  Object.entries(payload || {}).forEach(([sec, val]) => {
    if (sec === 'deviceInfo' && val && typeof val === 'object') {
      Object.entries(val).forEach(([k, v]) => row[`device_${k}`] = v);
    } else if (val && typeof val === 'object' && !Array.isArray(val)) {
      Object.entries(val).forEach(([k, v]) => {
        row[`${sec}_${k}`] = Array.isArray(v) ? v.join('|') : v;
      });
    } else {
      row[sec] = Array.isArray(val) ? val.join('|') : val;
    }
  });
  return row;
}

function _collectKeys(rows) {
  const set = new Set();
  rows.forEach(r => Object.keys(r).forEach(k => set.add(k)));
  // Pastikan urutan: meta → A → B → C → D → E → F → G → H → device
  const order = ['uid','ts','submittedAt','duration_sec','completed'];
  const out = order.filter(k => set.has(k));
  ['section_A','section_B','section_C','section_D','section_E','section_F','section_G','section_H'].forEach(p => {
    [...set].filter(k => k.startsWith(p) && !out.includes(k)).sort().forEach(k => out.push(k));
  });
  [...set].filter(k => !out.includes(k)).sort().forEach(k => out.push(k));
  return out;
}

function _renderSurveyTable() {
  const host = document.getElementById('surveyTableHost');
  if (!host) return;
  if (!_surveyRows.length) {
    host.innerHTML = '<div style="padding:24px;color:var(--text2);text-align:center">Belum ada responden survey.</div>';
    return;
  }
  // Tampilkan max 20 row + 8 kolom utama untuk preview
  const previewCols = _surveyKeys.slice(0, 8);
  const rows = _surveyRows.slice(0, 20);
  let html = `<div style="overflow:auto;max-height:60vh;border:1px solid var(--border);border-radius:8px"><table style="width:100%;border-collapse:collapse;font-size:.78rem"><thead style="background:var(--bg3);position:sticky;top:0"><tr>`;
  previewCols.forEach(c => html += `<th style="padding:8px 10px;text-align:left;border-bottom:1px solid var(--border);font-weight:600;color:var(--text2)">${esc(c)}</th>`);
  html += `</tr></thead><tbody>`;
  rows.forEach(r => {
    html += '<tr>';
    previewCols.forEach(c => {
      const v = r[c];
      const cell = v === undefined ? '' : String(v).slice(0, 40);
      html += `<td style="padding:8px 10px;border-bottom:1px solid var(--border)">${esc(cell)}</td>`;
    });
    html += '</tr>';
  });
  html += `</tbody></table></div>`;
  if (_surveyRows.length > 20 || _surveyKeys.length > 8) {
    html += `<div style="margin-top:10px;font-size:.76rem;color:var(--text2)">Preview: ${rows.length} dari ${_surveyRows.length} baris, ${previewCols.length} dari ${_surveyKeys.length} kolom. Klik Export CSV untuk data lengkap.</div>`;
  }
  host.innerHTML = html;
}

function exportSurveysCsv() {
  if (!_surveyRows.length) { showToast('Tidak ada data untuk diexport', 'warn'); return; }
  const csvRows = [_surveyKeys.map(_csvEscape).join(',')];
  _surveyRows.forEach(r => {
    csvRows.push(_surveyKeys.map(k => _csvEscape(r[k] === undefined ? '' : r[k])).join(','));
  });
  const csv  = csvRows.join('\r\n');
  const blob = new Blob(['\uFEFF' + csv], { type:'text/csv;charset=utf-8' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url;
  a.download = `aquent-surveys-${new Date().toISOString().slice(0,10)}.csv`;
  document.body.appendChild(a); a.click();
  setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(url); }, 100);
  showToast(`✓ ${_surveyRows.length} responden ter-export`, 'ok');
  logAdminAction('export_survey', '', `${_surveyRows.length} rows × ${_surveyKeys.length} cols`);
}

function _csvEscape(v) {
  if (v === null || v === undefined) return '';
  const s = String(v);
  if (/[",\r\n]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
  return s;
}

/* =====================================================
   SURVEY ANALYTICS — agregat skor TAM/SUS/UEQ/XAI
   ===================================================== */

// Definisi item per dimensi (sesuai QUESTIONNAIRE.md)
const _SURVEY_DIMS = {
  PU:    ['PU1','PU2','PU3','PU4','PU5','PU6'],
  PEOU:  ['PEOU1','PEOU2','PEOU3','PEOU4','PEOU5','PEOU6'],
  ATU:   ['ATU1','ATU2','ATU3'],
  BIU:   ['BIU1','BIU2','BIU3'],
  XAIT:  ['XAIT1','XAIT2','XAIT3','XAIT4'],
  AIT:   ['AIT1','AIT2','AIT3','AIT4'],
  WQL:   ['WQL1','WQL2','WQL3','WQL4'],
  BCI:   ['BCI1','BCI2','BCI3','BCI4'],
  IDPT:  ['IDPT1','IDPT2','IDPT3','IDPT4'],
  SRP:   ['SRP1','SRP2','SRP3','SRP4'],
  ECO:   ['ECO1','ECO2','ECO3','ECO4'],
};
const _SUS_NEG_ITEMS = ['SUS2','SUS4','SUS6','SUS8','SUS10']; // even = negatif

async function refreshAnalytics() {
  if (!_surveyRows.length) await refreshSurveys(); // pakai data yang sama
  const meta = document.getElementById('anaMeta');
  if (meta) meta.textContent = `${_surveyRows.length} responden`;

  if (!_surveyRows.length) {
    setText('anaSusScore', '—');
    setText('anaTamPU',    '—');
    setText('anaTamPEOU',  '—');
    setText('anaXAITrust', '—');
    document.getElementById('anaConstructs').innerHTML = '<div class="empty-state-illust"><div class="icon-bg"><i class="ph-duotone ph-clipboard-text"></i></div><h4>Belum Ada Respons Survey</h4><p>Survey otomatis muncul ke user setelah sesi mandi ke-3. Atau jalankan <code>node seed-demo-data.js</code> untuk demo data.</p></div>';
    document.getElementById('anaOpenEnded').innerHTML  = '<div class="empty-state-illust"><div class="icon-bg"><i class="ph-duotone ph-chat-text"></i></div><h4>Belum Ada Jawaban Terbuka</h4><p>Section H survey berisi feedback teks bebas dari user.</p></div>';
    return;
  }

  // 1. SUS — formula resmi: ((sum_odd-5) + (25-sum_even)) * 2.5
  const susScores = _surveyRows.map(r => {
    let oddSum = 0, evenSum = 0, count = 0;
    for (let i = 1; i <= 10; i++) {
      const key = _findKey(r, 'SUS' + i);
      if (key === null) continue;
      const v = +r[key]; if (isNaN(v)) continue;
      count++;
      if (_SUS_NEG_ITEMS.includes('SUS' + i)) evenSum += v; else oddSum += v;
    }
    if (count !== 10) return null;
    return ((oddSum - 5) + (25 - evenSum)) * 2.5;
  }).filter(v => v !== null);

  const susAvg = susScores.length ? (susScores.reduce((a,b)=>a+b,0)/susScores.length).toFixed(1) : '—';
  setText('anaSusScore', susAvg);

  // 2. Mean per dimensi (Likert 7 untuk TAM/XAI/AQUENT-specific)
  const dimMeans = {};
  Object.entries(_SURVEY_DIMS).forEach(([dim, items]) => {
    const all = [];
    _surveyRows.forEach(r => {
      items.forEach(it => {
        const k = _findKey(r, it);
        if (k !== null) { const v = +r[k]; if (!isNaN(v)) all.push(v); }
      });
    });
    dimMeans[dim] = all.length ? +(all.reduce((a,b)=>a+b,0)/all.length).toFixed(2) : null;
  });
  setText('anaTamPU',    dimMeans.PU    !== null ? dimMeans.PU    + '/7' : '—');
  setText('anaTamPEOU',  dimMeans.PEOU  !== null ? dimMeans.PEOU  + '/7' : '—');
  setText('anaXAITrust', dimMeans.XAIT  !== null ? dimMeans.XAIT  + '/7' : '—');

  // 3. Konstruk bar chart
  const labels = {
    PU:'TAM · Perceived Usefulness', PEOU:'TAM · Perceived Ease of Use',
    ATU:'TAM · Attitude Toward Using', BIU:'TAM · Behavioral Intention',
    XAIT:'XAI Trust', AIT:'AI Trust',
    WQL:'Water Quality Literacy', BCI:'Behavior Change Intention',
    IDPT:'Indonesian Digital Product Trust', SRP:'Skin Routine Personalization',
    ECO:'Eco-Conscious Behavior',
  };
  const constructHtml = Object.entries(dimMeans).map(([dim, m]) => {
    const pct = m === null ? 0 : (m / 7 * 100);
    const color = pct >= 70 ? '#4ade80' : pct >= 50 ? '#f0c040' : '#ff6b6b';
    return `
      <div style="display:flex;align-items:center;gap:14px;margin-bottom:10px;font-size:.82rem">
        <div style="width:240px;flex-shrink:0;color:var(--text2)">${labels[dim] || dim}</div>
        <div style="flex:1;height:10px;background:rgba(0,0,0,.3);border-radius:5px;overflow:hidden">
          <div style="height:100%;width:${pct}%;background:${color};transition:width .8s"></div>
        </div>
        <div style="width:60px;text-align:right;font-weight:700">${m === null ? '—' : m + '/7'}</div>
      </div>`;
  }).join('');
  document.getElementById('anaConstructs').innerHTML = constructHtml;

  // 4. Open-ended (Section H)
  const openEnded = [];
  _surveyRows.forEach(r => {
    ['H1_text','H2_text','H3_text','H4_text'].forEach((k, idx) => {
      const key = _findKey(r, k);
      if (key !== null && r[key]) openEnded.push({ uid: (r.uid || '').slice(0,8), question: 'H' + (idx+1), answer: r[key] });
    });
  });
  if (openEnded.length === 0) {
    document.getElementById('anaOpenEnded').innerHTML = '<div style="color:var(--text2);text-align:center;padding:20px">Belum ada jawaban terbuka.</div>';
  } else {
    document.getElementById('anaOpenEnded').innerHTML = openEnded.slice(0, 50).map(e =>
      `<div style="padding:10px 12px;border-bottom:1px solid var(--border);font-size:.84rem">
        <div style="display:flex;gap:10px;font-size:.7rem;color:var(--text2);margin-bottom:4px">
          <span style="font-weight:600;color:var(--pri2)">${e.question}</span>
          <span>${e.uid}...</span>
        </div>
        <div>${esc(e.answer).slice(0, 280)}</div>
      </div>`
    ).join('');
  }
}

function _findKey(row, suffix) {
  // Cari key yang berakhir dengan suffix (misal 'SUS3' bisa jadi 'section_C_SUS3' atau 'SUS3' langsung)
  const keys = Object.keys(row);
  return keys.find(k => k === suffix || k.endsWith('_' + suffix)) || null;
}

/* =====================================================
   SESSION INSIGHTS — agregat sessions/{uid}/{ts}
   ===================================================== */
async function refreshInsights() {
  const rtdb = firebase.database();
  try {
    const snap = await rtdb.ref('sessions').once('value');
    const data = snap.val() || {};
    const all = [];
    Object.entries(data).forEach(([uid, byTs]) => {
      Object.entries(byTs || {}).forEach(([ts, sess]) => {
        all.push({ ...sess, uid, ts: parseInt(ts) });
      });
    });

    if (!all.length) {
      setText('insTotalSess',   0);
      setText('insTotalLiters', 0);
      setText('insWaterSaved',  '—');
      setText('insAvgQs',       '—');
      document.getElementById('insHourChart').innerHTML = '<div style="color:var(--text2);text-align:center;padding:20px">Belum ada sesi tercatat.</div>';
      document.getElementById('insQsDist').innerHTML  = '';
      return;
    }

    const totalLiters = all.reduce((s, x) => s + (+x.volume_liters || 0), 0);
    const avgSaved    = all.reduce((s, x) => s + (+x.water_saved_pct || 0), 0) / all.length;
    const avgQs       = all.reduce((s, x) => s + (+x.quality_score || 0), 0) / all.length;

    setText('insTotalSess',   all.length.toLocaleString('id-ID'));
    setText('insTotalLiters', totalLiters.toFixed(0));
    setText('insWaterSaved',  avgSaved.toFixed(1) + '%');
    setText('insAvgQs',       avgQs.toFixed(1));

    // Distribusi jam mandi (24 bins)
    const hourBins = new Array(24).fill(0);
    all.forEach(s => { hourBins[new Date(s.ts).getHours()]++; });
    const maxHour = Math.max(...hourBins);
    document.getElementById('insHourChart').innerHTML = `
      <div style="display:flex;align-items:flex-end;gap:3px;height:140px;padding:4px 0">
        ${hourBins.map((v, h) => {
          const pct = maxHour ? (v / maxHour * 100) : 0;
          return `<div title="${h.toString().padStart(2,'0')}:00 — ${v} sesi" style="flex:1;height:${pct}%;background:linear-gradient(180deg,var(--pri),var(--pri-dark));border-radius:3px 3px 0 0;min-height:2px;cursor:pointer"></div>`;
        }).join('')}
      </div>
      <div style="display:flex;gap:3px;font-size:.65rem;color:var(--text2);margin-top:6px">
        ${hourBins.map((v, h) => `<div style="flex:1;text-align:center">${h % 3 === 0 ? h : ''}</div>`).join('')}
      </div>
    `;

    // Distribusi quality score (5 bins: <45 F / 45-59 D / 60-74 C / 75-89 B / 90-100 A)
    const grades = { A:0, B:0, C:0, D:0, F:0 };
    all.forEach(s => {
      const q = +s.quality_score || 0;
      if (q >= 90) grades.A++;
      else if (q >= 75) grades.B++;
      else if (q >= 60) grades.C++;
      else if (q >= 45) grades.D++;
      else grades.F++;
    });
    const maxG = Math.max(...Object.values(grades));
    const colors = { A:'#4ade80', B:'#a3e635', C:'#f0c040', D:'#fb923c', F:'#ff6b6b' };
    document.getElementById('insQsDist').innerHTML = Object.entries(grades).map(([g, v]) => {
      const pct = maxG ? (v / maxG * 100) : 0;
      const totalPct = all.length ? (v / all.length * 100) : 0;
      return `
        <div style="display:flex;align-items:center;gap:14px;margin-bottom:10px;font-size:.84rem">
          <div style="width:80px;font-weight:700;color:${colors[g]}">Grade ${g}</div>
          <div style="flex:1;height:14px;background:rgba(0,0,0,.3);border-radius:6px;overflow:hidden">
            <div style="height:100%;width:${pct}%;background:${colors[g]};transition:width .8s"></div>
          </div>
          <div style="width:120px;text-align:right;color:var(--text2);font-size:.78rem">${v} sesi · ${totalPct.toFixed(1)}%</div>
        </div>`;
    }).join('');
  } catch (e) {
    console.error('Insights err:', e);
    showToast('Gagal memuat insights: ' + e.message, 'err');
  }
}

/* =====================================================
   LIVE SENSORS — listen ke sensors/ realtime
   ===================================================== */
let _liveRef = null;
function startLiveSensors() {
  if (_liveRef) return; // sudah subscribe
  const rtdb = firebase.database();
  _liveRef = rtdb.ref('sensors');
  _liveRef.on('value', snap => {
    const d = snap.val();
    if (!d) {
      setText('livConn', 'Tidak ada data');
      document.getElementById('livConnDot').style.color = 'var(--text2)';
      return;
    }
    const ph   = +d.ph || 0;
    const temp = +d.temperature || +d.temp || 0;
    const turb = +d.turbidity || 0;

    setText('livPh',   ph.toFixed(2));
    setText('livTemp', temp.toFixed(1));
    setText('livTurb', turb.toFixed(2));
    setText('livConn', 'Online');
    document.getElementById('livConnDot').style.color = 'var(--green)';

    setText('livPhStatus',   ph >= 6.5 && ph <= 8.5 ? '✓ OK' : '⚠ Out');
    setText('livTempStatus', temp >= 35 && temp <= 42 ? '✓ OK' : '⚠ Out');
    setText('livTurbStatus', turb <= 1 ? '✓ Jernih' : '⚠ Keruh');

    setText('livUpdated', 'Update: ' + new Date().toLocaleTimeString('id-ID'));
  }, err => {
    console.warn('sensors listen err:', err.message);
    setText('livConn', 'Error');
    document.getElementById('livConnDot').style.color = 'var(--red)';
  });
}

/* =====================================================
   ANNOUNCEMENTS — RTDB announcements/
   ===================================================== */
async function loadAnnouncements() {
  const list = document.getElementById('annList');
  if (!list) return;
  list.innerHTML = '<div style="color:var(--text2);text-align:center;padding:20px"><div class="spin" style="display:inline-block;vertical-align:middle"></div> Memuat...</div>';
  try {
    const rtdb = firebase.database();
    const snap = await rtdb.ref('announcements').orderByChild('createdAt').once('value');
    const data = snap.val() || {};
    const items = Object.entries(data).map(([id, a]) => ({ id, ...a }))
      .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));

    if (!items.length) {
      list.innerHTML = '<div class="empty-state-illust"><div class="icon-bg"><i class="ph-duotone ph-megaphone"></i></div><h4>Belum Ada Pengumuman</h4><p>Buat pengumuman pertama Anda di form di atas. Pengumuman akan tampil sebagai banner di app user secara real-time.</p></div>';
      return;
    }
    const typeColors = { info:'#48cae4', warning:'#f0c040', success:'#4ade80', urgent:'#ff6b6b' };
    list.innerHTML = items.map(a => `
      <div style="padding:12px 14px;border-radius:10px;background:rgba(255,255,255,.03);border:1px solid var(--border);margin-bottom:8px;display:flex;align-items:flex-start;gap:12px">
        <div style="width:8px;height:8px;border-radius:50%;background:${typeColors[a.type] || '#48cae4'};margin-top:7px;flex-shrink:0"></div>
        <div style="flex:1">
          <div style="font-weight:600;font-size:.88rem">${esc(a.title || 'Tanpa judul')}</div>
          <div style="font-size:.8rem;color:var(--text2);margin-top:3px">${esc(a.body || '')}</div>
          <div style="font-size:.7rem;color:var(--text2);margin-top:5px">${formatDate(a.createdAt ? new Date(a.createdAt) : null)}</div>
        </div>
        <button onclick="deleteAnnouncement('${a.id}')" style="background:none;border:none;color:var(--red);cursor:pointer;font-size:.9rem"><i class="ph ph-trash"></i></button>
      </div>
    `).join('');
  } catch (e) {
    list.innerHTML = `<div style="color:var(--red);text-align:center;padding:20px">Error: ${esc(e.message)}</div>`;
  }
}

async function postAnnouncement() {
  const title = document.getElementById('annTitle').value.trim();
  const body  = document.getElementById('annBody').value.trim();
  const type  = document.getElementById('annType').value;
  if (!title || !body) { showToast('Isi judul dan pesan dulu', 'err'); return; }
  try {
    const rtdb = firebase.database();
    const ref  = rtdb.ref('announcements').push();
    await ref.set({
      title, body, type,
      createdAt: Date.now(),
      createdBy: getAuthUser()?.uid || 'unknown',
    });
    await logAdminAction('post_announcement', ref.key, title.slice(0, 60));
    document.getElementById('annTitle').value = '';
    document.getElementById('annBody').value  = '';
    showToast('✓ Pengumuman dipublish', 'ok');
    loadAnnouncements();
  } catch (e) {
    showToast('Gagal: ' + e.message, 'err');
  }
}

async function deleteAnnouncement(id) {
  if (!await uiConfirm('Hapus pengumuman ini?', { title:'Hapus Pengumuman', danger:true, okText:'Hapus' })) return;
  try {
    await firebase.database().ref('announcements/' + id).remove();
    await logAdminAction('delete_announcement', id);
    showToast('Dihapus', 'ok');
    loadAnnouncements();
  } catch (e) { showToast('Gagal: ' + e.message, 'err'); }
}

/* =====================================================
   AUDIT LOG — catat aktivitas admin
   ===================================================== */
async function logAdminAction(action, target = '', detail = '') {
  if (!db) return;
  try {
    await db.collection('adminLogs').add({
      action,                                          // contoh: 'change_role', 'post_announcement'
      target,                                          // uid yang diubah, atau id pengumuman
      detail,                                          // info tambahan
      adminUid:   getAuthUser()?.uid || 'unknown',
      adminEmail: getAuthUser()?.email || '',
      timestamp:  firebase.firestore.FieldValue.serverTimestamp(),
    });
  } catch (e) { console.warn('Log failed:', e.message); }
}

/* =====================================================
   USER DETAIL MODAL — klik baris user untuk lihat detail
   ===================================================== */
async function openUserDetail(uid) {
  const user = allUsers.find(u => u.id === uid);
  if (!user) return;

  // Fetch sessions count + survey count untuk user ini
  const rtdb = firebase.database();
  const [sessSnap, survSnap, profSnap] = await Promise.all([
    rtdb.ref(`sessions/${uid}`).once('value').catch(() => null),
    rtdb.ref(`surveys/${uid}`).once('value').catch(() => null),
    rtdb.ref(`profiles/${uid}`).once('value').catch(() => null),
  ]);
  const sessCount = sessSnap?.val() ? Object.keys(sessSnap.val()).length : 0;
  const survCount = survSnap?.val() ? Object.keys(survSnap.val()).length : 0;
  const profiles  = profSnap?.val()?.list || [];

  // Hitung agregat sesi
  let totalLiters = 0, avgQs = 0, qsCount = 0;
  if (sessSnap?.val()) {
    Object.values(sessSnap.val()).forEach(s => {
      totalLiters += +s.volume_liters || 0;
      if (s.quality_score) { avgQs += +s.quality_score; qsCount++; }
    });
    avgQs = qsCount ? (avgQs / qsCount).toFixed(1) : '—';
  }

  const modal = document.createElement('div');
  modal.className = 'modal-overlay-admin';
  modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.7);z-index:9000;display:flex;align-items:center;justify-content:center;padding:20px;backdrop-filter:blur(8px)';
  modal.innerHTML = `
    <div style="background:var(--bg2);border:1px solid var(--border);border-radius:16px;padding:0;max-width:560px;width:100%;max-height:90vh;overflow-y:auto">
      <div style="padding:20px 24px;border-bottom:1px solid var(--border);display:flex;align-items:center;gap:14px">
        <div class="u-avatar" style="width:48px;height:48px;font-size:1.1rem;background:${avatarColor(user.email || uid)}">
          ${user.photoURL ? `<img src="${user.photoURL}">` : esc(initial(user))}
        </div>
        <div style="flex:1">
          <div style="font-size:1.05rem;font-weight:700">${esc(user.displayName || '—')}</div>
          <div style="font-size:.8rem;color:var(--text2)">${esc(user.email || uid)}</div>
        </div>
        <button onclick="this.closest('.modal-overlay-admin').remove()" style="background:none;border:none;color:var(--text2);cursor:pointer;font-size:1.3rem"><i class="ph ph-x"></i></button>
      </div>

      <div style="padding:24px;display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:12px">
        <div style="padding:14px;background:rgba(255,255,255,.03);border-radius:10px;border:1px solid var(--border)">
          <div style="font-size:.7rem;color:var(--text2);margin-bottom:4px">Paket Saat Ini</div>
          <div><span class="role-badge role-${user.role || 'free'}">${roleBadgeHtml(user.role)}</span></div>
        </div>
        <div style="padding:14px;background:rgba(255,255,255,.03);border-radius:10px;border:1px solid var(--border)">
          <div style="font-size:.7rem;color:var(--text2);margin-bottom:4px">Bergabung</div>
          <div style="font-size:.85rem;font-weight:600">${formatDate(user.createdAt)}</div>
        </div>
        <div style="padding:14px;background:rgba(255,255,255,.03);border-radius:10px;border:1px solid var(--border)">
          <div style="font-size:.7rem;color:var(--text2);margin-bottom:4px">Total Sesi Mandi</div>
          <div style="font-size:1.1rem;font-weight:700">${sessCount}</div>
        </div>
        <div style="padding:14px;background:rgba(255,255,255,.03);border-radius:10px;border:1px solid var(--border)">
          <div style="font-size:.7rem;color:var(--text2);margin-bottom:4px">Total Air (L)</div>
          <div style="font-size:1.1rem;font-weight:700;color:var(--pri2)">${totalLiters.toFixed(0)}</div>
        </div>
        <div style="padding:14px;background:rgba(255,255,255,.03);border-radius:10px;border:1px solid var(--border)">
          <div style="font-size:.7rem;color:var(--text2);margin-bottom:4px">Avg Quality</div>
          <div style="font-size:1.1rem;font-weight:700;color:var(--green)">${avgQs}</div>
        </div>
        <div style="padding:14px;background:rgba(255,255,255,.03);border-radius:10px;border:1px solid var(--border)">
          <div style="font-size:.7rem;color:var(--text2);margin-bottom:4px">Survey Submit</div>
          <div style="font-size:1.1rem;font-weight:700">${survCount > 0 ? '✓ ' + survCount + 'x' : '—'}</div>
        </div>
      </div>

      ${profiles.length ? `
      <div style="padding:0 24px 24px">
        <div style="font-size:.8rem;color:var(--text2);margin-bottom:8px;font-weight:600">PROFIL TERSIMPAN (${profiles.length})</div>
        ${profiles.map(p => `
          <div style="padding:10px 14px;background:rgba(255,255,255,.03);border-radius:8px;margin-bottom:6px;display:flex;align-items:center;gap:10px;border:1px solid var(--border)">
            <span style="font-size:1.2rem">${p.avatar || '👤'}</span>
            <div style="flex:1">
              <div style="font-size:.85rem;font-weight:500">${esc(p.name || '—')}</div>
              <div style="font-size:.7rem;color:var(--text2)">${p.skinType || '—'} · target ${p.waterGoal || 0}L</div>
            </div>
          </div>
        `).join('')}
      </div>` : ''}

      <div style="padding:20px 24px;border-top:1px solid var(--border);display:flex;gap:8px;flex-wrap:wrap">
        <button onclick="copyToClipboard('${uid}');showToast('UID disalin','ok')" style="padding:8px 14px;border-radius:8px;border:1px solid var(--border);background:rgba(255,255,255,.03);color:var(--text2);cursor:pointer;font-size:.8rem"><i class="ph ph-copy"></i> Salin UID</button>
        ${user.role !== 'admin' ? `
          <button onclick="promoteToAdmin('${uid}')" style="padding:8px 14px;border-radius:8px;border:none;background:rgba(192,132,252,.2);color:var(--purple);cursor:pointer;font-size:.8rem"><i class="ph ph-shield-check"></i> Jadikan Admin</button>` : ''}
        <button onclick="resetUserData('${uid}')" style="padding:8px 14px;border-radius:8px;border:none;background:rgba(253,203,110,.15);color:var(--gold);cursor:pointer;font-size:.8rem"><i class="ph ph-arrow-counter-clockwise"></i> Reset Data</button>
        <button onclick="deleteUserDoc('${uid}')" style="padding:8px 14px;border-radius:8px;border:none;background:rgba(255,107,107,.15);color:var(--red);cursor:pointer;font-size:.8rem;margin-left:auto"><i class="ph ph-trash"></i> Hapus User</button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);
}

function copyToClipboard(text) {
  navigator.clipboard?.writeText(text).catch(() => {});
}

async function promoteToAdmin(uid) {
  if (!await uiConfirm('Promote user ini menjadi admin? User akan punya akses penuh ke panel admin.',
      { title:'Jadikan Admin', icon:'ph-shield-check', okText:'Promote' })) return;
  try {
    await db.collection('users').doc(uid).update({ role:'admin', plan:'admin' });
    await firebase.database().ref('meta/admins/' + uid).set(true);
    await logAdminAction('promote_admin', uid);
    showToast('User dipromosikan ke admin. User perlu logout-login.', 'ok');
    document.querySelector('.modal-overlay-admin')?.remove();
    await loadUsers();
  } catch (e) { showToast('Gagal: ' + e.message, 'err'); }
}

async function resetUserData(uid) {
  if (!await uiConfirm('Reset semua sesi & profil user ini? Aksi tidak dapat di-undo.',
      { title:'Reset Data User', danger:true, okText:'Reset' })) return;
  try {
    await firebase.database().ref(`sessions/${uid}`).remove();
    await firebase.database().ref(`profiles/${uid}`).remove();
    await logAdminAction('reset_user_data', uid);
    showToast('Data user direset', 'ok');
    document.querySelector('.modal-overlay-admin')?.remove();
  } catch (e) { showToast('Gagal: ' + e.message, 'err'); }
}

async function deleteUserDoc(uid) {
  if (!await uiConfirm('Hapus user ini dari Firestore? Akun Auth dan data RTDB tetap aman.',
      { title:'Hapus User Doc', danger:true, okText:'Hapus' })) return;
  try {
    await db.collection('users').doc(uid).delete();
    await firebase.database().ref('meta/admins/' + uid).remove();
    await logAdminAction('delete_user_doc', uid);
    showToast('User doc dihapus', 'ok');
    document.querySelector('.modal-overlay-admin')?.remove();
    allUsers = allUsers.filter(u => u.id !== uid);
    renderUserTable();
    renderStats();
  } catch (e) { showToast('Gagal: ' + e.message, 'err'); }
}

/* =====================================================
   AUDIT LOG VIEWER
   ===================================================== */
async function loadAuditLogs() {
  const host = document.getElementById('auditList');
  if (!host) return;
  host.innerHTML = '<div style="color:var(--text2);text-align:center;padding:20px"><span class="spin" style="display:inline-block;vertical-align:middle"></span> Memuat...</div>';
  try {
    const snap = await db.collection('adminLogs')
      .orderBy('timestamp', 'desc').limit(50).get();
    if (snap.empty) {
      host.innerHTML = '<div class="empty-state-illust"><div class="icon-bg"><i class="ph-duotone ph-clock-counter-clockwise"></i></div><h4>Belum Ada Aktivitas Tercatat</h4><p>Audit log akan terisi otomatis saat admin melakukan aksi (ubah role, post pengumuman, export survey, dll).</p></div>';
      return;
    }
    const actionLabels = {
      change_role:        'Ubah Paket User',
      promote_admin:      'Promote ke Admin',
      reset_user_data:    'Reset Data User',
      delete_user_doc:    'Hapus User Doc',
      post_announcement:  'Publish Pengumuman',
      delete_announcement:'Hapus Pengumuman',
      export_survey:      'Export Survey CSV',
    };
    const actionColors = {
      change_role:'#48cae4', promote_admin:'#c084fc', reset_user_data:'#f0c040',
      delete_user_doc:'#ff6b6b', post_announcement:'#4ade80',
      delete_announcement:'#ff6b6b', export_survey:'#48cae4',
    };
    host.innerHTML = snap.docs.map(d => {
      const log = d.data();
      const action = actionLabels[log.action] || log.action;
      const color = actionColors[log.action] || '#48cae4';
      return `
        <div style="padding:12px 16px;border-bottom:1px solid var(--border);display:flex;align-items:center;gap:14px;font-size:.84rem">
          <div style="width:6px;height:24px;border-radius:3px;background:${color};flex-shrink:0"></div>
          <div style="flex:1">
            <div style="font-weight:600;color:${color}">${action}</div>
            <div style="font-size:.74rem;color:var(--text2);margin-top:2px">
              by ${esc(log.adminEmail || log.adminUid?.slice(0,8) || '—')}
              ${log.target ? ' · target: <code style="background:rgba(0,0,0,.3);padding:1px 5px;border-radius:3px">' + esc(log.target.slice(0,12)) + '...</code>' : ''}
              ${log.detail ? ' · ' + esc(log.detail) : ''}
            </div>
          </div>
          <div style="font-size:.7rem;color:var(--text2);text-align:right">
            ${formatDateTime(log.timestamp)}
          </div>
        </div>`;
    }).join('');
  } catch (e) {
    host.innerHTML = `<div style="color:var(--red);text-align:center;padding:20px">Error: ${esc(e.message)}</div>`;
  }
}

function formatDateTime(ts) {
  if (!ts) return '—';
  try {
    const d = ts.toDate ? ts.toDate() : new Date(ts);
    return d.toLocaleString('id-ID', { day:'2-digit', month:'short', hour:'2-digit', minute:'2-digit' });
  } catch { return '—'; }
}

/* =====================================================
   DATE RANGE FILTER untuk Insights & Analytics
   ===================================================== */
let _dateRange = 30; // hari (default 30)

function setDateRange(days) {
  _dateRange = days;
  document.querySelectorAll('.date-range-btn').forEach(b => {
    b.classList.toggle('active-range', +b.dataset.days === days);
  });
  // Re-trigger active section
  const active = document.querySelector('.adm-section.active')?.id;
  if (active === 'pg-analytics') refreshAnalytics();
  else if (active === 'pg-insights') refreshInsights();
}

/* =====================================================
   GLOBAL SEARCH
   ===================================================== */
function initGlobalSearch() {
  // Bind shortcut Ctrl+K
  document.addEventListener('keydown', e => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
      e.preventDefault();
      const search = document.getElementById('userSearch');
      if (search) {
        // Pindah ke users tab + focus search
        document.querySelector('.adm-nav-item[data-page="users"]')?.click();
        setTimeout(() => search.focus(), 100);
      }
    }
  });
}

/* =====================================================
   CHART.JS — User Growth Chart (Overview)
   ===================================================== */
let _userGrowthChart = null;

function renderUserGrowthChart() {
  const canvas = document.getElementById('userGrowthChart');
  if (!canvas || typeof Chart === 'undefined') return;

  // Group users by day for last 30 days
  const days = 30;
  const labels = [];
  const cumulative = [];
  const daily = [];
  const now = new Date(); now.setHours(0, 0, 0, 0);

  // Sort users by createdAt ascending
  const sorted = [...allUsers].filter(u => u.createdAt).sort((a, b) => {
    const da = a.createdAt.toDate ? a.createdAt.toDate() : new Date(a.createdAt);
    const db = b.createdAt.toDate ? b.createdAt.toDate() : new Date(b.createdAt);
    return da - db;
  });

  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now); d.setDate(d.getDate() - i);
    labels.push(d.toLocaleDateString('id-ID', { day:'numeric', month:'short' }));

    const dEnd = new Date(d); dEnd.setHours(23, 59, 59, 999);
    const dStart = new Date(d);

    const onDay = sorted.filter(u => {
      const du = u.createdAt.toDate ? u.createdAt.toDate() : new Date(u.createdAt);
      return du >= dStart && du <= dEnd;
    }).length;

    const cum = sorted.filter(u => {
      const du = u.createdAt.toDate ? u.createdAt.toDate() : new Date(u.createdAt);
      return du <= dEnd;
    }).length;

    daily.push(onDay);
    cumulative.push(cum);
  }

  if (_userGrowthChart) _userGrowthChart.destroy();
  _userGrowthChart = new Chart(canvas, {
    type: 'line',
    data: {
      labels,
      datasets: [
        {
          label: 'Total Kumulatif',
          data: cumulative,
          borderColor: '#48cae4', backgroundColor: 'rgba(0,180,216,.15)',
          tension: 0.35, fill: true, pointRadius: 0, borderWidth: 2.5,
          yAxisID: 'y',
        },
        {
          label: 'Pendaftar Harian',
          data: daily, type: 'bar',
          backgroundColor: 'rgba(192,132,252,.55)', borderRadius: 4,
          yAxisID: 'y1',
        },
      ],
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      interaction: { mode:'index', intersect:false },
      plugins: {
        legend: { labels:{ color:'#caf0f8', font:{ size:11 } } },
        tooltip: { backgroundColor:'rgba(13,17,23,.9)', borderColor:'rgba(255,255,255,.1)', borderWidth:1 },
      },
      scales: {
        x: { ticks:{ color:'rgba(202,240,248,.5)', font:{ size:10 }, maxRotation:0, autoSkip:true, maxTicksLimit:10 }, grid:{ display:false } },
        y: { position:'left', ticks:{ color:'rgba(202,240,248,.5)', font:{ size:10 } }, grid:{ color:'rgba(255,255,255,.04)' }, beginAtZero:true },
        y1:{ position:'right', ticks:{ color:'rgba(192,132,252,.7)', font:{ size:10 } }, grid:{ display:false }, beginAtZero:true },
      },
    },
  });
}

// Hook chart render setelah users loaded
const _origLoadUsers = loadUsers;
loadUsers = async function() {
  await _origLoadUsers();
  renderUserGrowthChart();
};

/* =====================================================
   CHART.JS — Insights pakai Chart.js (replace HTML bar)
   ===================================================== */
let _insightsHourChart = null;
let _insightsGradeChart = null;

const _origRefreshInsights = refreshInsights;
refreshInsights = async function() {
  const rtdb = firebase.database();
  try {
    const snap = await rtdb.ref('sessions').once('value');
    const data = snap.val() || {};
    let all = [];
    Object.entries(data).forEach(([uid, byTs]) => {
      Object.entries(byTs || {}).forEach(([ts, sess]) => {
        all.push({ ...sess, uid, ts: parseInt(ts) });
      });
    });

    // Apply date range filter
    if (_dateRange > 0) {
      const cutoff = Date.now() - _dateRange * 86_400_000;
      all = all.filter(s => s.ts >= cutoff);
    }

    if (!all.length) {
      setText('insTotalSess',   0);
      setText('insTotalLiters', 0);
      setText('insWaterSaved',  '—');
      setText('insAvgQs',       '—');
      document.getElementById('insHourChart').innerHTML = '<div class="empty-state-illust"><div class="icon-bg"><i class="ph-duotone ph-shower"></i></div><h4>Belum Ada Sesi Tercatat</h4><p>Sesi muncul saat user pertama kali mandi dengan AQUENT. Generate demo data via <code>node seed-demo-data.js</code> untuk testing.</p></div>';
      document.getElementById('insQsDist').innerHTML  = '';
      return;
    }

    const totalLiters = all.reduce((s, x) => s + (+x.volume_liters || 0), 0);
    const avgSaved    = all.reduce((s, x) => s + (+x.water_saved_pct || 0), 0) / all.length;
    const avgQs       = all.reduce((s, x) => s + (+x.quality_score || 0), 0) / all.length;

    setText('insTotalSess',   all.length.toLocaleString('id-ID'));
    setText('insTotalLiters', totalLiters.toFixed(0));
    setText('insWaterSaved',  avgSaved.toFixed(1) + '%');
    setText('insAvgQs',       avgQs.toFixed(1));

    // Render hour chart with Chart.js
    const hourBins = new Array(24).fill(0);
    all.forEach(s => { hourBins[new Date(s.ts).getHours()]++; });
    _renderHourChart(hourBins);

    // Render grade distribution chart
    const grades = { A:0, B:0, C:0, D:0, F:0 };
    all.forEach(s => {
      const q = +s.quality_score || 0;
      if (q >= 90) grades.A++;
      else if (q >= 75) grades.B++;
      else if (q >= 60) grades.C++;
      else if (q >= 45) grades.D++;
      else grades.F++;
    });
    _renderGradeChart(grades, all.length);

  } catch (e) {
    console.error('Insights err:', e);
    showToast('Gagal memuat insights: ' + e.message, 'err');
  }
};

function _renderHourChart(hourBins) {
  const host = document.getElementById('insHourChart');
  if (!host) return;
  host.innerHTML = '<canvas id="hourCanvas" style="height:200px"></canvas>';

  if (_insightsHourChart) _insightsHourChart.destroy();
  const labels = Array.from({ length:24 }, (_, i) => i.toString().padStart(2,'0'));
  _insightsHourChart = new Chart(document.getElementById('hourCanvas'), {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        label: 'Sesi mandi',
        data: hourBins,
        backgroundColor: hourBins.map((v, i) => {
          if (i >= 5 && i <= 9)   return 'rgba(74,222,128,.7)';   // pagi
          if (i >= 17 && i <= 21) return 'rgba(192,132,252,.7)'; // malam
          return 'rgba(0,180,216,.55)';
        }),
        borderRadius: 4,
      }],
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: {
        legend: { display:false },
        tooltip: {
          backgroundColor:'rgba(13,17,23,.9)',
          callbacks: { title: ctx => ctx[0].label + ':00' },
        },
      },
      scales: {
        x: { ticks:{ color:'rgba(202,240,248,.5)', font:{ size:9 } }, grid:{ display:false } },
        y: { ticks:{ color:'rgba(202,240,248,.5)', font:{ size:10 } }, grid:{ color:'rgba(255,255,255,.04)' }, beginAtZero:true },
      },
    },
  });
}

function _renderGradeChart(grades, total) {
  const host = document.getElementById('insQsDist');
  if (!host) return;
  host.innerHTML = '<div style="display:flex;gap:24px;align-items:center"><div style="flex:1;height:220px"><canvas id="gradeCanvas"></canvas></div>'
    + '<div style="min-width:180px;display:flex;flex-direction:column;gap:6px;font-size:.82rem">'
    + Object.entries(grades).map(([g, v]) => {
        const pct = total ? (v / total * 100).toFixed(1) : 0;
        const col = { A:'#4ade80', B:'#a3e635', C:'#f0c040', D:'#fb923c', F:'#ff6b6b' }[g];
        return `<div style="display:flex;align-items:center;gap:8px">
          <div style="width:10px;height:10px;border-radius:50%;background:${col}"></div>
          <span style="font-weight:600;color:${col};width:60px">Grade ${g}</span>
          <span style="color:var(--text2);font-size:.78rem">${v} · ${pct}%</span>
        </div>`;
      }).join('')
    + '</div></div>';

  if (_insightsGradeChart) _insightsGradeChart.destroy();
  _insightsGradeChart = new Chart(document.getElementById('gradeCanvas'), {
    type: 'doughnut',
    data: {
      labels: ['A (≥90)', 'B (75-89)', 'C (60-74)', 'D (45-59)', 'F (<45)'],
      datasets: [{
        data: Object.values(grades),
        backgroundColor: ['#4ade80', '#a3e635', '#f0c040', '#fb923c', '#ff6b6b'],
        borderWidth: 0,
      }],
    },
    options: {
      responsive: true, maintainAspectRatio: false, cutout: '65%',
      plugins: { legend: { display:false } },
    },
  });
}
