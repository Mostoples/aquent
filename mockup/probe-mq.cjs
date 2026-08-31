/* Diagnosa: apakah @media (pointer: coarse) aktif di dalam iframe render?
   Jika tidak, perbaikan aksesibilitas berbasis pointer:coarse tak akan terukur. */
const { execFileSync } = require('child_process');
const fs = require('fs');

const CHROME = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
].find((p) => fs.existsSync(p));

const PORT = process.env.PORT || 8099;
const B = `http://127.0.0.1:${PORT}`;

const INSPECT = `
(function(){
  var f = document.getElementById('vp');
  function go(){
    var out = {};
    try {
      var w = f.contentWindow, d = f.contentDocument;
      if (!d || !w) { document.title='MQ::'+JSON.stringify({err:'no doc'}); return; }
      out.href = d.location.pathname;
      out.coarse = w.matchMedia('(pointer: coarse)').matches;
      out.fine   = w.matchMedia('(pointer: fine)').matches;
      out.noPtr  = w.matchMedia('(pointer: none)').matches;
      out.hover  = w.matchMedia('(hover: hover)').matches;
      out.max480 = w.matchMedia('(max-width: 480px)').matches;
      out.vw     = d.documentElement.clientWidth;
      var b = d.getElementById('hamburgerBtn') || d.getElementById('hamburger') || d.querySelector('.icon-btn,.back-btn');
      if (b) {
        var r = b.getBoundingClientRect();
        var af = w.getComputedStyle(b, '::after');
        out.btn = (b.id||b.className||'?') + ' rect=' + Math.round(r.width)+'x'+Math.round(r.height)
                + ' afterContent=' + JSON.stringify(af.content)
                + ' afterW=' + af.width + ' afterH=' + af.height;
      } else out.btn = '(tombol tidak ditemukan)';
    } catch(e){ out.err = String(e.message).slice(0,90); }
    document.title = 'MQ::' + JSON.stringify(out);
  }
  var n=0, iv=setInterval(function(){ go(); if(++n>40) clearInterval(iv); }, 300);
})();
`;
fs.writeFileSync(__dirname + '/.inspect.js', INSPECT);

function run(label, page, budget, extra) {
  const url = `${B}/mockup/shot-wrapper.html?page=${encodeURIComponent(page)}&w=412&h=915&inspect=1`;
  try {
    const dom = execFileSync(
      CHROME,
      ['--headless=new', '--disable-gpu', '--hide-scrollbars', '--no-first-run',
       '--no-default-browser-check', ...(extra || []), '--window-size=1400,1100',
       `--virtual-time-budget=${budget}`, '--dump-dom', url],
      { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, timeout: 150000, stdio: ['ignore','pipe','ignore'] }
    );
    const m = dom.match(/MQ::(\{[\s\S]*?\})<\/title>/);
    console.log('\n=== ' + label + ' ===');
    if (!m) return console.log('  tidak terbaca (domLen=' + dom.length + ')');
    const j = JSON.parse(m[1]);
    console.log('  ' + j.href + '  vw=' + j.vw);
    console.log('  pointer: coarse=' + j.coarse + ' fine=' + j.fine + ' none=' + j.noPtr + ' | hover=' + j.hover);
    console.log('  max-width480=' + j.max480);
    console.log('  ' + j.btn);
    if (j.err) console.log('  err: ' + j.err);
  } catch (e) {
    console.log('\n=== ' + label + ' ===\n  ERROR ' + String(e.message).split('\n')[0].slice(0, 90));
  }
}

run('dashboard TANPA touch flag', '/app.html', 14000, []);
run('dashboard DENGAN --touch-events=enabled', '/app.html', 14000, ['--touch-events=enabled']);
