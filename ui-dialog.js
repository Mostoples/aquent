/* =====================================================
   AQUENT — UI Dialog (glass modal) + Toast
   Pengganti confirm()/alert()/prompt() native agar
   konsisten dengan tema (terang/gelap) & bilingual.

   API global:
     await uiConfirm(message, opts?)  -> boolean
     await uiAlert(message, opts?)    -> true
     await uiPrompt(message, opts?)   -> string|null
     uiToast(message, type?, ms?)     -> void   (type: ok|err|info|warn)

   opts: { title, okText, cancelText, danger, icon, placeholder, defaultValue }
   ===================================================== */
(function () {
  'use strict';
  if (window.uiConfirm) return; // hindari double-load

  var ID = 'aquent-ui-dialog';

  function lang() {
    try { return (localStorage.getItem('aquent-lang') || 'id'); } catch (e) { return 'id'; }
  }
  function tr(id, en) { return lang() === 'en' ? en : id; }

  function injectStyle() {
    if (document.getElementById(ID + '-style')) return;
    var css =
      ':root{--uid-surface:#ffffff;--uid-surface2:#f4f9fd;' +
      '--uid-border:#e4edf5;--uid-text:#10293d;--uid-text2:#44627c}' +
      ':root[data-theme="dark"]{--uid-surface:rgba(22,27,34,.97);--uid-surface2:rgba(255,255,255,.06);' +
      '--uid-border:rgba(255,255,255,.12);--uid-text:rgba(255,255,255,.95);--uid-text2:rgba(202,240,248,.72)}' +
      '.uid-backdrop{position:fixed;inset:0;z-index:99999;display:flex;align-items:center;' +
      'justify-content:center;padding:20px;background:var(--uid-backdrop,rgba(16,41,61,.34));backdrop-filter:blur(6px);' +
      '-webkit-backdrop-filter:blur(6px);opacity:0;transition:opacity .18s ease;font-family:inherit}' +
      '.uid-backdrop.show{opacity:1}' +
      '.uid-card{width:100%;max-width:380px;border-radius:18px;padding:22px 22px 18px;' +
      'background:var(--uid-surface);border:1px solid var(--uid-border);' +
      'box-shadow:0 18px 60px rgba(0,0,0,.5);color:var(--uid-text);transform:translateY(10px) scale(.98);' +
      'transition:transform .2s cubic-bezier(.2,.8,.2,1)}' +
      '.uid-backdrop.show .uid-card{transform:translateY(0) scale(1)}' +
      '.uid-ico{width:46px;height:46px;border-radius:13px;display:flex;align-items:center;justify-content:center;' +
      'font-size:1.5rem;margin-bottom:14px;background:rgba(0,180,216,.16);color:#48cae4}' +
      '.uid-ico.danger{background:rgba(255,107,107,.16);color:#ff6b6b}' +
      '.uid-ico.warn{background:rgba(253,203,110,.16);color:#fdcb6e}' +
      '.uid-title{font-size:1.02rem;font-weight:700;margin:0 0 6px;letter-spacing:.01em;color:var(--uid-text)}' +
      '.uid-msg{font-size:.86rem;line-height:1.55;color:var(--uid-text2);margin:0 0 16px;white-space:pre-line}' +
      '.uid-input{width:100%;box-sizing:border-box;padding:11px 13px;margin:0 0 16px;border-radius:11px;' +
      'background:var(--uid-surface2);border:1px solid var(--uid-border);' +
      'color:var(--uid-text);font-size:.9rem;font-family:inherit;outline:none}' +
      '.uid-input:focus{border-color:rgba(0,180,216,.6)}' +
      '.uid-actions{display:flex;gap:10px;justify-content:flex-end}' +
      '.uid-btn{padding:9px 18px;border-radius:11px;font-size:.84rem;font-weight:600;cursor:pointer;' +
      'font-family:inherit;border:1px solid transparent;transition:filter .15s,background .15s}' +
      '.uid-btn:active{transform:translateY(1px)}' +
      '.uid-btn-cancel{background:transparent;border-color:var(--uid-border);color:var(--uid-text2)}' +
      '.uid-btn-cancel:hover{background:rgba(127,127,127,.12)}' +
      '.uid-btn-ok{background:linear-gradient(135deg,#00b4d8,#0077b6);color:#fff}' +
      '.uid-btn-ok:hover{filter:brightness(1.08)}' +
      '.uid-btn-ok.danger{background:linear-gradient(135deg,#ff6b6b,#c0392b)}' +
      /* toast */
      '.uid-toast-wrap{position:fixed;left:50%;bottom:84px;transform:translateX(-50%);z-index:99998;' +
      'display:flex;flex-direction:column;gap:8px;align-items:center;pointer-events:none;width:calc(100% - 32px);max-width:360px}' +
      '.uid-toast{pointer-events:auto;width:100%;box-sizing:border-box;padding:11px 15px;border-radius:12px;' +
      'font-size:.84rem;font-weight:500;display:flex;align-items:center;gap:9px;backdrop-filter:blur(20px);' +
      'box-shadow:0 8px 28px rgba(0,0,0,.4);opacity:0;transform:translateY(12px);transition:opacity .22s,transform .22s;' +
      'background:var(--uid-surface);border:1px solid var(--uid-border);color:var(--uid-text)}' +
      '.uid-toast.show{opacity:1;transform:translateY(0)}' +
      '.uid-toast.ok{border-color:rgba(74,222,128,.4);color:#7bedab}' +
      '.uid-toast.err{border-color:rgba(255,107,107,.4);color:#ff9b9b}' +
      '.uid-toast.warn{border-color:rgba(253,203,110,.4);color:#ffd789}' +
      '.uid-toast.info{border-color:rgba(0,180,216,.4);color:#7fd9ee}' +
      '.uid-toast i{font-size:1.05rem;flex-shrink:0}';
    var s = document.createElement('style');
    s.id = ID + '-style';
    s.textContent = css;
    document.head.appendChild(s);
  }

  function buildDialog(opts, kind) {
    injectStyle();
    return new Promise(function (resolve) {
      var prev = document.activeElement;
      var backdrop = document.createElement('div');
      backdrop.className = 'uid-backdrop';

      var iconClass = opts.danger ? 'danger' : (kind === 'warn' ? 'warn' : '');
      var iconGlyph = opts.icon || (opts.danger ? 'ph-warning-octagon'
        : kind === 'confirm' ? 'ph-question'
        : kind === 'prompt' ? 'ph-pencil-simple'
        : 'ph-info');

      var okText = opts.okText || (kind === 'confirm' || kind === 'prompt' ? tr('Ya', 'Yes') : tr('OK', 'OK'));
      var cancelText = opts.cancelText || tr('Batal', 'Cancel');
      var titleHtml = opts.title ? '<h3 class="uid-title">' + esc(opts.title) + '</h3>' : '';
      var inputHtml = kind === 'prompt'
        ? '<input class="uid-input" id="uidPromptInput" type="' + (opts.inputType || 'text') + '" placeholder="' +
          esc(opts.placeholder || '') + '" value="' + esc(opts.defaultValue || '') + '">'
        : '';
      var showCancel = (kind === 'confirm' || kind === 'prompt');

      backdrop.innerHTML =
        '<div class="uid-card" role="dialog" aria-modal="true">' +
        '<div class="uid-ico ' + iconClass + '"><i class="ph-fill ' + iconGlyph + '"></i></div>' +
        titleHtml +
        '<p class="uid-msg">' + esc(opts.message) + '</p>' +
        inputHtml +
        '<div class="uid-actions">' +
        (showCancel ? '<button class="uid-btn uid-btn-cancel" id="uidCancel">' + esc(cancelText) + '</button>' : '') +
        '<button class="uid-btn uid-btn-ok ' + (opts.danger ? 'danger' : '') + '" id="uidOk">' + esc(okText) + '</button>' +
        '</div></div>';

      document.body.appendChild(backdrop);
      requestAnimationFrame(function () { backdrop.classList.add('show'); });

      var input = backdrop.querySelector('#uidPromptInput');
      var okBtn = backdrop.querySelector('#uidOk');
      var cancelBtn = backdrop.querySelector('#uidCancel');

      function cleanup(val) {
        backdrop.classList.remove('show');
        document.removeEventListener('keydown', onKey);
        setTimeout(function () {
          backdrop.remove();
          if (prev && prev.focus) try { prev.focus(); } catch (e) {}
          resolve(val);
        }, 180);
      }
      function confirmVal() {
        if (kind === 'confirm') return true;
        if (kind === 'prompt') return input ? input.value : '';
        return true;
      }
      function cancelVal() {
        if (kind === 'confirm') return false;
        if (kind === 'prompt') return null;
        return true;
      }

      function onKey(e) {
        if (e.key === 'Escape' && showCancel) { e.preventDefault(); cleanup(cancelVal()); }
        else if (e.key === 'Enter' && kind !== 'prompt') { e.preventDefault(); cleanup(confirmVal()); }
        else if (e.key === 'Enter' && kind === 'prompt' && document.activeElement === input) {
          e.preventDefault(); cleanup(confirmVal());
        }
      }
      document.addEventListener('keydown', onKey);

      okBtn.addEventListener('click', function () { cleanup(confirmVal()); });
      if (cancelBtn) cancelBtn.addEventListener('click', function () { cleanup(cancelVal()); });
      backdrop.addEventListener('click', function (e) {
        if (e.target === backdrop && showCancel) cleanup(cancelVal());
      });

      setTimeout(function () { (input || okBtn).focus(); }, 60);
    });
  }

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  window.uiConfirm = function (message, opts) {
    opts = opts || {}; opts.message = message;
    return buildDialog(opts, 'confirm');
  };
  window.uiAlert = function (message, opts) {
    opts = opts || {}; opts.message = message;
    return buildDialog(opts, 'alert');
  };
  window.uiPrompt = function (message, opts) {
    opts = opts || {}; opts.message = message;
    return buildDialog(opts, 'prompt');
  };

  // ===== Toast =====
  var toastWrap = null;
  window.uiToast = function (message, type, ms) {
    injectStyle();
    type = type || 'info';
    ms = ms || 3200;
    if (!toastWrap) {
      toastWrap = document.createElement('div');
      toastWrap.className = 'uid-toast-wrap';
      document.body.appendChild(toastWrap);
    }
    var glyph = type === 'ok' ? 'ph-check-circle'
      : type === 'err' ? 'ph-x-circle'
      : type === 'warn' ? 'ph-warning'
      : 'ph-info';
    var el = document.createElement('div');
    el.className = 'uid-toast ' + type;
    el.innerHTML = '<i class="ph-fill ' + glyph + '"></i><span>' + esc(message) + '</span>';
    toastWrap.appendChild(el);
    requestAnimationFrame(function () { el.classList.add('show'); });
    setTimeout(function () {
      el.classList.remove('show');
      setTimeout(function () { el.remove(); }, 240);
    }, ms);
  };
})();
