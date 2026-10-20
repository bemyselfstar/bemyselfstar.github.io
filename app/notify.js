// DeskCat 手機網頁：通知（P74 M4；2026-10-20 手機線）。「全家」頁帳號卡下面一張〔通知〕卡：開通知、選要哪幾種、關掉。
// 網頁推播（Web Push）：iPhone 要「加到主畫面」再從主畫面打開（iOS 16.4 以上）才收得到；要 https（正式網址），家裡 Wi-Fi 的 http 收不到。
// 開通知＝問 iPhone 准不准（一定要按按鈕才能問）→ 用伺服器的公開推播鑰匙（server.js pushKey，VAPID 公鑰，可以放網頁）訂閱 →
//   訂閱資料（endpoint＋鑰匙）跟要哪幾種一起交給伺服器 SV.pushSubscribe（🎮：dc_push_subscribe，跨線需求 2026-10-20 📱 第 1 條 ⑤）。
// 伺服器判斷什麼時候通知（毛孩餓了、口袋撿到東西），送推播 → sw.js 的 push 顯示、點了打開網頁（網址 ?tab=…）。
// 測試：假伺服器 ?mock=1 的 &pushenv=ok（預設）／notinstalled（還沒加到主畫面）／nosupport（收不到通知的瀏覽器）／denied（按過不允許）、&pushkey=0（伺服器還沒有鑰匙）。
(window.DC_BUILD = window.DC_BUILD || {})['notify.js'] = 54;   // 版本戳記（mobile/tools/bump.py 一起加 1；不一樣＝手機有舊檔）
(() => {
  'use strict';
  const SV = window.DCServer, D = window.DC, $ = id => document.getElementById(id);
  const KEY = 'deskcat_push_v1';                 // 這台裝置訂閱了哪幾種 {endpoint, kinds}（照伺服器分開；實際以伺服器為準）
  const KINDS = [['hungry', '毛孩餓了'], ['souvenir', '口袋撿到東西']];
  const isIOS = /iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const standalone = () => navigator.standalone === true || matchMedia('(display-mode: standalone)').matches;

  // ---------- 瀏覽器那一段（假伺服器會換成 window.DCNotifyEnv） ----------
  const b64u = s => { const p = '='.repeat((4 - s.length % 4) % 4), raw = atob((s + p).replace(/-/g, '+').replace(/_/g, '/')); return Uint8Array.from(raw, c => c.charCodeAt(0)); };
  const realEnv = {
    supported: () => isSecureContext && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window,
    needInstall: () => isIOS && !standalone(),
    permission: () => ('Notification' in window ? Notification.permission : 'denied'),
    request: () => Notification.requestPermission(),
    async reg() { return navigator.serviceWorker.getRegistration(); },
    async current() { const r = await this.reg(); return r ? r.pushManager.getSubscription() : null; },
    async subscribe(key) {
      const r = await this.reg();
      if (!r) throw new Error('no_sw');           // 離線快取（sw.js）只在正式網址註冊
      return r.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64u(key) });
    },
  };
  const env = window.DCNotifyEnv || realEnv;

  const load = () => { try { return (JSON.parse(localStorage.getItem(KEY) || '{}') || {})[SV.which] || null; } catch (_) { return null; } };
  const save = v => {
    try { const all = JSON.parse(localStorage.getItem(KEY) || '{}') || {}; all[SV.which] = v || undefined; localStorage.setItem(KEY, JSON.stringify(all)); } catch (_) { /* 存不了：下次再問伺服器 */ }
  };
  let busy = false, msg = '';

  function el(tag, cls, txt) { const e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; }
  function btn(label, main, fn) { const b = el('button', 'btn' + (main ? ' main' : ''), label); b.type = 'button'; b.disabled = busy; b.onclick = fn; return b; }

  async function state() {                       // off／on／needInstall／nosupport／denied／nokey
    if (!SV.pushKey) return 'nokey';
    if (env.needInstall()) return 'needInstall';
    if (!env.supported()) return 'nosupport';
    if (env.permission() === 'denied') return 'denied';
    let sub = null;
    try { sub = await env.current(); } catch (_) { /* 讀不到＝當作沒開 */ }
    return sub && load() ? 'on' : 'off';
  }

  async function render() {
    const box = $('notifyCard');
    if (!box) return;
    const show = SV.p74 && D.LIVE && SV.user && D.isPhone;
    box.hidden = !show;
    if (!show) return;
    const st = await state(), cur = load();
    box.innerHTML = '';
    const head = el('div', 'nt-head'); D.setLabel(head, 'letter', '通知'); box.append(head);
    const say = t => box.append(el('p', 'nt-text', t));
    if (st === 'nokey') say('伺服器還沒準備好通知');
    else if (st === 'needInstall') {
      say('把 DeskCat 加到主畫面、從主畫面打開，才收得到通知');
      box.append(btn('怎麼加到主畫面', false, () => { const c = $('installCard'); c.hidden = false; $('installIos').hidden = false; c.scrollIntoView({ block: 'nearest' }); }));
    } else if (st === 'nosupport') say('這個瀏覽器收不到通知');
    else if (st === 'denied') say('通知被關掉了：到 iPhone「設定 → 通知 → DeskCat」打開');
    else if (st === 'off') {
      say('毛孩餓了、口袋撿到東西時跟你說');
      box.append(btn('開通知', true, turnOn));
    } else {
      const row = el('div', 'nt-kinds');
      for (const [k, label] of KINDS) {
        const on = cur.kinds.includes(k), b = el('button', 'chip' + (on ? ' on' : ''), label);
        b.type = 'button'; b.disabled = busy; b.setAttribute('aria-pressed', on ? 'true' : 'false');
        b.onclick = () => setKinds(on ? cur.kinds.filter(x => x !== k) : [...cur.kinds, k]);
        row.append(b);
      }
      say('通知開著：要哪幾種');
      box.append(row, btn('關掉通知', false, turnOff));
    }
    if (msg) box.append(el('p', 'nt-msg', msg));
  }
  async function act(fn) {
    if (busy) return;
    busy = true; msg = ''; await render();
    try { await fn(); } catch (e) { msg = e.status === 404 ? '伺服器還沒準備好通知' : e.message && /^[^a-z]/i.test(e.message) ? e.message : '開不了通知，等一下再試'; console.warn('通知', e); }
    busy = false; await render();
  }
  function turnOn() {                            // 一定要在按按鈕的當下問（iPhone 規定）
    return act(async () => {
      const p = await env.request();
      if (p !== 'granted') { msg = p === 'denied' ? '' : '沒有允許通知'; return; }
      const sub = await env.subscribe(SV.pushKey);
      const kinds = KINDS.map(k => k[0]);
      await SV.pushSubscribe(sub.toJSON ? sub.toJSON() : sub, kinds);
      save({ endpoint: sub.endpoint, kinds });
      D.toast('通知開好了');
    });
  }
  function setKinds(kinds) {
    return act(async () => {
      const sub = await env.current();
      if (!sub) { save(null); return; }
      await SV.pushSubscribe(sub.toJSON ? sub.toJSON() : sub, kinds);
      save({ endpoint: sub.endpoint, kinds });
    });
  }
  function turnOff() {
    return act(async () => {
      const sub = await env.current();
      if (sub) {
        try { await SV.pushUnsubscribe(sub.endpoint); } finally { await sub.unsubscribe(); }
      }
      save(null);
      D.toast('通知關掉了');
    });
  }

  window.DCNotify = { render, get kinds() { const c = load(); return c ? c.kinds : []; } };
})();
