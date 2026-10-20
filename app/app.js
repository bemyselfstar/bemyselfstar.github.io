// DeskCat 手機網頁「毛孩的家」：P66 新設計 M4。登入後讀伺服器（server.js），沒登入可以看範例（假資料，fake/）。
// 斜上往下看的房間（W×H 像素，比螢幕大），整數倍放大（不糊）；拖曳移動鏡頭、兩指縮放。
// 電腦網頁＝橫版（分頁列在左邊）、手機網頁＝直版（分頁列在下面）（2026-10-14 使用者）。
// 家具先用程式畫的簡單版（之後換成正式美術）；毛孩用遊戲的側面影格，前後只靠遮擋表現、不縮放。
(window.DC_BUILD = window.DC_BUILD || {})['app.js'] = 54;   // 版本戳記（mobile/tools/bump.py 一起加 1；不一樣＝手機有舊檔）
(() => {
  'use strict';
  // 資料：範例（假資料）或伺服器（server.js；登入後 dc_pets_mine 每 10 秒讀一次，見下面「伺服器同步」）。
  // 伺服器的毛孩換成跟假資料一樣的格式（where／mood 0～3／food 0～3／doing…），其他地方不用分兩套。
  // 毛孩圖也放進同一個 SPR.pets（key＝伺服器的檔名）；還沒下載好或電腦還沒傳圖的，先用範例裡同花色的圖。
  // 家具（P78，server/020）：手機裝潢大家都有＋電腦買過的才擺（dc_home_mine 的 owned）；擺法、伴手禮存伺服器（見下面「家具跟著帳號」）。
  // 預設位置、地毯照範例；伺服器沒有 020、沒登入、範例模式照舊（範例的家具＋這台瀏覽器的佈置）。
  const SV = window.DCServer, LIVE = SV.mode !== 'fake';
  const SPR = window.FAKE_SPRITES;
  const HOME = LIVE ? { owner: '', pets: [], furniture: window.FAKE_HOME.furniture, rugs: window.FAKE_HOME.rugs } : window.FAKE_HOME;
  const W = 560, H = 484;                 // 房間大小（像素）。2026-10-15 家具改實際比例（1 像素約 1.5 公分）→ 房間加寬、牆加高
  const WALL_Y = 150;                     // 牆腳（上面是牆、下面是地板）：牆約 2.2 公尺高，書櫃、立燈放得下
  const FLOOR = { x0: 12, x1: W - 12, y0: WALL_Y + 12, y1: H - 3 };   // 毛孩腳能踩的範圍
  const DOOR = { x: 528, y: WALL_Y + 4 };
  const OL = '#3a2a1e';                   // 外框線

  const params = new URLSearchParams(location.search);
  const coarse = matchMedia('(pointer: coarse)').matches;
  let isPhone = params.has('phone') ? params.get('phone') !== '0' : coarse;
  const dev = params.has('dev') || location.hostname === 'localhost' || location.hostname === '127.0.0.1';

  // 像素圖示（art/icons/，24×24；docs/美術/家具美術規格.md 第 7 節）：取代分頁、按鈕的表情符號（2026-10-15）
  const icon = name => Object.assign(document.createElement('img'), { className: 'ico', src: `art/icons/${name}.png`, alt: '', draggable: false });
  const setLabel = (el, name, text) => el.replaceChildren(...(name ? [icon(name)] : []), ...(text ? [document.createTextNode(text)] : []));
  const WHERE = {
    home: { icon: 'home', label: '在家' },
    desk: { icon: 'desk', label: '在桌面陪你上班' },
    pocket: { icon: 'pocket', label: '跟你出門（口袋）' },
    friend: { icon: 'paw', label: '在好友家' },
  };
  const MOOD = ['😿', '😐', '🙂', '😊'];
  const $ = id => document.getElementById(id);
  const rnd = (a, b) => a + Math.random() * (b - a);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  // ---------- 圖 ----------
  const imgs = {};
  function img(file) {
    if (!imgs[file]) { imgs[file] = new Image(); imgs[file].src = file; }
    return imgs[file];
  }
  const petInfo = p => SPR.pets[p.sprite] || SPR.pets[p.species === 'dog' ? '柴犬' : '橘虎斑'];
  const isDog = p => petInfo(p).species === 'dog';
  const animOf = (d, want) => { for (const a of [].concat(want)) if (d.anims[a]) return a; return 'idle'; };

  // 頭像：用坐著那一格，裁掉空白後放進正方形
  function drawAvatar(cv, p) {
    const d = petInfo(p), im = img(d.file);
    const go = () => {
      const [row] = d.anims[animOf(d, ['sit', 'idle'])];
      const t = document.createElement('canvas'); t.width = d.w; t.height = d.h;
      const tc = t.getContext('2d'); tc.drawImage(im, 0, row * d.h, d.w, d.h, 0, 0, d.w, d.h);
      const px = tc.getImageData(0, 0, d.w, d.h).data;
      let x0 = d.w, y0 = d.h, x1 = 0, y1 = 0;
      for (let y = 0; y < d.h; y++) for (let x = 0; x < d.w; x++) if (px[(y * d.w + x) * 4 + 3] > 0) {
        x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y);
      }
      const bw = x1 - x0 + 1, bh = y1 - y0 + 1, side = Math.max(bw, bh) + 4;
      cv.width = side; cv.height = side;
      const c = cv.getContext('2d'); c.imageSmoothingEnabled = false; c.clearRect(0, 0, side, side);
      c.drawImage(t, x0, y0, bw, bh, Math.floor((side - bw) / 2), side - bh - 2, bw, bh);
    };
    if (im.complete && im.naturalWidth) go(); else im.addEventListener('load', go, { once: true });
  }

  // ---------- 時間 ----------
  let timeOverride = '';
  function timeOfDay() {
    if (timeOverride) return timeOverride;
    const h = new Date().getHours();
    return h >= 5 && h < 10 ? 'morning' : h < 16 ? 'day' : h < 19 ? 'evening' : 'night';
  }
  const TIME_LABEL = { morning: '早上', day: '白天', evening: '傍晚', night: '晚上' };

  // ---------- 畫布、鏡頭 ----------
  const host = $('view-home'), stage = $('stage'), cv = $('cv');   // stage＝房間那一塊（上下的名單、工具列不算）
  let ctx = cv.getContext('2d');           // 畫圖小工具都畫在 ctx 上；口袋（pocket.js）畫的時候暫時換成自己的
  const roomCtx = ctx;
  const cam = { x: 0, y: 0, z: 2, zMin: 2, zMax: 4 };
  let viewW = 0, viewH = 0;
  function fit() {
    const vw = stage.clientWidth, vh = stage.clientHeight;
    if (!vw || !vh) return;
    cam.zMin = Math.max(2, Math.ceil(Math.max(vw / W, vh / H)));
    cam.zMax = cam.zMin + 2;
    cam.z = clamp(cam.z, cam.zMin, cam.zMax);
    viewW = Math.ceil(vw / cam.z); viewH = Math.ceil(vh / cam.z);
    cv.width = viewW; cv.height = viewH;
    cv.style.width = viewW * cam.z + 'px'; cv.style.height = viewH * cam.z + 'px';
    ctx.imageSmoothingEnabled = false;
    clampCam();
  }
  function clampCam() {
    cam.x = viewW >= W ? (W - viewW) / 2 : clamp(cam.x, 0, W - viewW);
    cam.y = viewH >= H ? (H - viewH) / 2 : clamp(cam.y, 0, H - viewH);
  }
  function setZoom(nz, ax, ay) {          // ax, ay：螢幕上不動的那一點（CSS px）
    nz = clamp(nz, cam.zMin, cam.zMax);
    if (nz === cam.z) return;
    const wx = cam.x + ax / cam.z, wy = cam.y + ay / cam.z;
    cam.z = nz; fit();
    cam.x = wx - ax / cam.z; cam.y = wy - ay / cam.z; clampCam();
  }
  function lookAt(wx, wy) { cam.x = wx - viewW / 2; cam.y = wy - viewH / 2; clampCam(); }
  function keepVisible(pet) {              // 毛孩整隻都在畫面裡（面板打開、房間變矮時用）
    const m = 6, h = pet.d.h, w = pet.d.w * .7;
    if (pet.x - w / 2 < cam.x + m || pet.x + w / 2 > cam.x + viewW - m || pet.y - h < cam.y + m || pet.y > cam.y + viewH - m) lookAt(pet.x, pet.y - h / 2);
  }
  // 上下的名單、工具列、面板變大變小時，房間跟著重算（介面不蓋住房間）
  new ResizeObserver(() => { fit(); if (sheetPet && sheetPet.room) keepVisible(sheetPet.room); }).observe(stage);
  const toWorld = (cx, cy) => { const r = cv.getBoundingClientRect(); return [cam.x + (cx - r.left) / cam.z, cam.y + (cy - r.top) / cam.z]; };
  addEventListener('resize', fit);

  // ---------- 畫圖小工具 ----------
  const rect = (x, y, w, h, c) => { ctx.fillStyle = c; ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h)); };
  function ellipse(cx, cy, rx, ry, c) {     // 像素橢圓（一列一列填，不糊）
    ctx.fillStyle = c;
    for (let dy = -ry; dy <= ry; dy++) {
      const hw = Math.round(rx * Math.sqrt(Math.max(0, 1 - (dy * dy) / (ry * ry))));
      ctx.fillRect(Math.round(cx - hw), Math.round(cy + dy), hw * 2, 1);
    }
  }
  // 斜上往下看的方塊：前緣在 y，正面高 h，上面深 d
  function block(x0, y, w, h, d, top, front) {
    rect(x0 - 1, y - h - d - 1, w + 2, h + d + 2, OL);
    rect(x0, y - h - d, w, d, top);
    rect(x0, y - h, w, h, front);
    rect(x0, y - h, w, 1, 'rgba(0,0,0,.18)');
  }

  // ---------- 房間 ----------
  const SKY = {
    morning: ['#bfe3f2', '#e6f1ea', '#f8e3bd'], day: ['#79bde8', '#93cbee', '#b4dbf2'],
    evening: ['#5b4b8a', '#d9776a', '#f4b267'], night: ['#151a3a', '#1d2350', '#27306a'],
  };
  function drawWall(tod, t) {
    const wall = { morning: '#efdcc4', day: '#f2e1ca', evening: '#e6c9b0', night: '#cdb8a6' }[tod];
    rect(0, 0, W, WALL_Y, wall);
    for (let x = 4; x < W; x += 12) rect(x, 6, 2, WALL_Y - 16, 'rgba(150,100,70,.10)');
    rect(0, 0, W, 6, '#6b4a33'); rect(0, 6, W, 2, '#8a5e40');
    rect(0, WALL_Y - 10, W, 6, '#dcbf9c'); rect(0, WALL_Y - 4, W, 4, '#8f5f40');
    // 窗戶
    const wx = 196, wy = WALL_Y - 112, ww = 70, wh = 60, sky = SKY[tod];
    rect(wx - 3, wy - 3, ww + 6, wh + 6, '#7a4f33');
    sky.forEach((c, i) => rect(wx, wy + i * wh / 3, ww, wh / 3, c));
    if (tod === 'night') {
      for (let i = 0; i < 9; i++) if ((Math.floor(t / 600) + i) % 4) rect(wx + (i * 17) % (ww - 3) + 1, wy + (i * 11) % (wh - 4) + 1, 1, 1, '#fff6c8');
      rect(wx + ww - 12, wy + 4, 6, 6, '#f6f0c4'); rect(wx + ww - 10, wy + 3, 5, 5, sky[0]);
    } else if (tod === 'evening') rect(wx + 8, wy + wh - 9, 9, 7, '#ffd27a');
    else {
      ctx.save(); ctx.beginPath(); ctx.rect(wx, wy, ww, wh); ctx.clip();
      const cx = wx + ((t / 280) % (ww + 24)) - 12;
      rect(cx, wy + 7, 12, 3, '#fff'); rect(cx + 3, wy + 5, 6, 2, '#fff'); ctx.restore();
    }
    rect(wx + ww / 2 - 1, wy, 2, wh, '#7a4f33'); rect(wx, wy + wh / 2 - 1, ww, 2, '#7a4f33');
    rect(wx - 6, wy + wh + 3, ww + 12, 3, '#a8734d');
    rect(wx - 10, wy - 5, 7, wh + 9, '#e8a0a0'); rect(wx + ww + 3, wy - 5, 7, wh + 9, '#e8a0a0');
    drawBoard();
    // 掛畫（以後：照片變掛畫）
    const px = 394, py = WALL_Y - 100;
    rect(px, py, 30, 22, '#7a4f33'); rect(px + 2, py + 2, 26, 18, '#f4f1e8');
    rect(px + 5, py + 13, 6, 4, '#9ccf86'); rect(px + 12, py + 9, 8, 8, '#78b7d8'); rect(px + 20, py + 5, 4, 4, '#f6c26b');
    drawShelf();
    // 門
    const dx = DOOR.x - 28, dy = 28, dw = 56, dh = WALL_Y - dy;
    rect(dx - 3, dy - 3, dw + 6, dh + 3, '#6b4a33');
    if (door.open > 0) {
      rect(dx, dy, dw, dh, '#2b1e18');
      rect(dx + 2, dy + 2, dw - 4, 4, tod === 'night' ? '#3a3f6e' : '#9fd3ee');
      const ow = Math.round(dw * (1 - door.open));
      if (ow > 0) { rect(dx, dy, ow, dh, '#b9825a'); rect(dx + ow - 1, dy, 1, dh, '#7a4f33'); }
    } else {
      rect(dx, dy, dw, dh, '#b9825a');
      rect(dx + 6, dy + 6, dw - 12, 44, '#a8734d'); rect(dx + 6, dy + 58, dw - 12, 54, '#a8734d');
      rect(dx + dw - 11, dy + 62, 4, 4, '#f2d27a');
    }
  }
  // 軟木板：釘著收到的明信片（最新 3 張；mail.js 用 DC.setBoard 給）。點一下＝打開信箱的那張（2026-10-14 使用者選「明信片貼在家裡牆上」）
  const BOARD = { x: 282, y: WALL_Y - 104, w: 64, h: 32 };   // 窗戶（186～276）和立燈（354～390）中間
  let boardCards = [];
  function drawBoard() {
    const { x, y, w, h } = BOARD;
    rect(x - 2, y - 2, w + 4, h + 4, '#7a4f33'); rect(x, y, w, h, '#c9955e');
    for (let i = 0; i < 26; i++) rect(x + 2 + (i * 37 + i * i * 7) % (w - 4), y + 2 + (i * i * 13 + i * 5) % (h - 4), 1, 1, '#a8774a');   // 軟木的小點
    boardCards.slice(0, 3).forEach((c, i) => {
      const cx = x + 4 + i * 20, cy = y + 6 + (i % 2) * 4;
      rect(cx - 1, cy - 1, 18, 15, OL); rect(cx, cy, 16, 13, '#f4f1e8'); rect(cx + 1, cy + 1, 14, 8, c.tone || '#efdcc4');
      if (c.av && c.av.width) { ctx.save(); ctx.imageSmoothingEnabled = false; ctx.drawImage(c.av, 0, 0, c.av.width, c.av.height, cx + 3, cy + 1, 9, 9); ctx.restore(); }
      rect(cx + 2, cy + 10, 8, 1, '#b3a493'); rect(cx + 7, cy - 2, 2, 2, '#e8504a');
    });
  }
  // 紀念品架：口袋撿回來的東西（每種一個位置，像圖鑑一樣慢慢擺滿）。
  // 跟著帳號存在伺服器（server/017；2026-10-17 使用者：「要跟著帳號資料」），瀏覽器只當暫存＋記還沒送出去的：
  //   deskcat_souvenirs_v2＝{'伺服器/帳號': {got: 伺服器上的 {種類: 次數}, wait: [{key, kinds}] 還沒送成功的〔放回家〕}, fake: 範例用的}
  //   舊的 deskcat_souvenirs_v1（{種類: 次數}，以前只存在這支手機）：登入後合併到那個帳號（每種取大的、不相加），成功就刪掉
  // 〔放回家〕先放上架（不等網路），再 dc_souvenirs_add(這趟的, 代號)；沒網路就留在 wait，下次讀伺服器成功時用同一個代號再送（不會加兩次）
  const SHELF = { x: 430, y: WALL_Y - 104, w: 64, h: 32 };   // 掛畫（394～424）和門（497～）中間
  const SOUV_KEY = 'deskcat_souvenirs_v2', SOUV_OLD = 'deskcat_souvenirs_v1';
  const souvClean = o => {                  // 只留 {種類: 正整數}（種類格式跟伺服器一樣）
    const r = {};
    if (o && typeof o === 'object' && !Array.isArray(o)) {
      for (const [k, v] of Object.entries(o)) { const n = Math.floor(+v); if (/^[a-z_]{1,24}$/.test(k) && n > 0) r[k] = Math.min(n, 99999); }
    }
    return r;
  };
  const souvAcct = () => !LIVE ? 'fake' : SV.user && SV.user.uid ? `${SV.which}/${SV.user.uid}` : null;   // 換帳號＝換一份
  function souvAll() {
    try { const a = JSON.parse(localStorage.getItem(SOUV_KEY) || '{}'); return a && typeof a === 'object' && !Array.isArray(a) ? a : {}; } catch (_) { return {}; }
  }
  function souvSlot() {
    const s = souvAll()[souvAcct()] || {};
    return { got: souvClean(s.got), wait: Array.isArray(s.wait) ? s.wait.filter(w => w && typeof w.key === 'string' && Array.isArray(w.kinds)) : [] };
  }
  function souvSave(slot) {
    const id = souvAcct();
    if (!id) return;
    const a = souvAll(); a[id] = slot;
    try { localStorage.setItem(SOUV_KEY, JSON.stringify(a)); } catch (_) { /* 存不了：這次開著還是看得到 */ }
  }
  function souvOld() {
    if (!LIVE) return {};
    try { return souvClean(JSON.parse(localStorage.getItem(SOUV_OLD) || 'null')); } catch (_) { return {}; }
  }
  let souv = {};
  function souvView() {                     // 架上看到的＝伺服器的（還沒合併的舊資料取大的）＋還沒送出去的
    const v = {};
    if (souvAcct()) {
      const { got, wait } = souvSlot();
      Object.assign(v, got);
      for (const [k, n] of Object.entries(souvOld())) v[k] = Math.max(v[k] || 0, n);
      for (const w of wait) for (const k of w.kinds) v[k] = (v[k] || 0) + 1;
    }
    souv = v;
  }
  souvView();
  const souvCode = () => 'sv' + Date.now().toString(36) + Array.from(crypto.getRandomValues(new Uint8Array(8)), b => b.toString(16).padStart(2, '0')).join('');
  function souvKeep(items) {                // 〔放回家〕擺上架：記下來、送伺服器（範例只記在這台）
    const slot = souvSlot();
    if (!LIVE) items.forEach(k => { slot.got[k] = (slot.got[k] || 0) + 1; });
    else for (let i = 0; i < items.length; i += 10) slot.wait.push({ key: souvCode(), kinds: items.slice(i, i + 10) });   // 伺服器一次最多 10 個
    souvSave(slot); souvView();
    if (LIVE) souvSync();
  }
  let souvBusy = null, souvReady = false;   // souvReady：這次打開已經跟伺服器對過了（回到畫面再對一次）
  const souvWaiting = () => LIVE && !!souvAcct() && (souvSlot().wait.length > 0 || Object.keys(souvOld()).length > 0);
  function souvSync() {
    if (!LIVE || SV.mode !== 'live' || !souvAcct()) return Promise.resolve();
    if (!souvBusy) souvBusy = (async () => {
      const id = souvAcct();
      let got = null;
      souvView();                            // 剛登入：先擺這個帳號暫存的（沒網路也看得到）
      try {
        const old = souvOld();               // 先合併以前存在手機的（再加這次的才不會被「取大的」吃掉）
        if (Object.keys(old).length) {
          const r = await SV.souvMerge(old);
          try { localStorage.removeItem(SOUV_OLD); } catch (_) { /* 下次再合併一次也不會灌水（取大的） */ }
          if (r && r.ok) got = r.souvenirs;
        }
        for (let w; (w = souvSlot().wait[0]);) {   // 還沒送出去的：一趟一趟、用原本的代號送
          const r = await SV.souvAdd(w.kinds, w.key);
          if (souvAcct() !== id) return;
          const slot = souvSlot();
          slot.wait = slot.wait.filter(x => x.key !== w.key);   // 送好了；格式不對的再送也不會對，一樣拿掉
          if (r && r.ok) { slot.got = souvClean(r.souvenirs); got = null; }
          souvSave(slot); souvView();
        }
        if (!got && !souvReady) got = await SV.souvMine();
        if (got && souvAcct() === id) { const slot = souvSlot(); slot.got = souvClean(got); souvSave(slot); souvView(); }
        souvReady = true;
      } catch (_) {
        /* 沒網路、伺服器有狀況：記著的留著，下次讀伺服器成功時再送 */
      } finally {
        souvBusy = null; render();
        if (window.DCPocket && !$('view-pocket').hidden) window.DCPocket.render();   // 口袋頁的圖鑑也跟著換
      }
    })();
    return souvBusy;
  }
  addEventListener('online', () => souvSync());
  const souvCount = () => Object.keys(souv).filter(k => souv[k] > 0).length;
  function drawShelf() {
    const S = window.DCScene, { x, y, w } = SHELF;
    if (!S) return;
    [y + 14, y + 30].forEach(py => { rect(x - 1, py, w + 2, 3, OL); rect(x, py, w, 2, '#a8734d'); rect(x + 4, py + 3, 2, 3, '#7a4f33'); rect(x + w - 6, py + 3, 2, 3, '#7a4f33'); });
    S.ITEM_ORDER.forEach((k, i) => {
      if (!souv[k]) return;
      const top = i < 4, sx = top ? x + 8 + i * 16 : x + 16 + (i - 4) * 16;
      S.ITEMS[k].draw(ctx, sx, top ? y + 14 : y + 30);
    });
  }
  const shelfAt = (wx, wy) => wx >= SHELF.x - 2 && wx <= SHELF.x + SHELF.w + 2 && wy >= SHELF.y - 2 && wy <= SHELF.y + SHELF.h + 2;
  function bringSouvenirs(pet, items) {     // 口袋回來：走到紀念品架前面放上去
    const S = window.DCScene;
    pet.busy = true;
    pet.walkTo(SHELF.x + SHELF.w / 2, FLOOR.y0 + 2, () => {
      const fresh = items.filter(k => !souv[k]);
      souvKeep(items);
      pet.busy = false; pet.flip = false; pet.set('sit', 1); pet.until = now + 3500; addHearts(pet, 2);
      say(pet, fresh.length ? line(pet, 'souvenir_new') : line(pet, 'souvenir'));
      const names = [...new Set(items)].map(k => S.ITEMS[k].name);
      toast(`${pet.p.name}帶回了${names.slice(0, 2).join('、')}${names.length > 2 ? '等' : ''}`);
    });
  }
  const boardAt = (wx, wy) => boardCards.length && wx >= BOARD.x - 2 && wx <= BOARD.x + BOARD.w + 2 && wy >= BOARD.y - 2 && wy <= BOARD.y + BOARD.h + 2;
  function drawFloor(tod) {
    const fl = ['#c48a58', '#b98050'];
    for (let y = WALL_Y, i = 0; y < H; y += 6, i++) {
      rect(0, y, W, 6, fl[i % 2]);
      for (let x = (i * 19) % 36; x < W; x += 36) rect(x, y, 1, 6, '#9e6a40');
    }
    rect(0, WALL_Y, W, 3, 'rgba(60,30,10,.18)');
    if (tod === 'day' || tod === 'morning') {      // 窗戶照進來的光
      ctx.fillStyle = 'rgba(255,248,210,.18)';
      ctx.beginPath(); ctx.moveTo(196, WALL_Y); ctx.lineTo(266, WALL_Y); ctx.lineTo(312, WALL_Y + 90); ctx.lineTo(232, WALL_Y + 90); ctx.fill();
    }
    for (const r0 of HOME.rugs) {
      const r = rugAt(r0);
      if (!r) continue;                          // 下面那件家具沒有（帳號沒有貓窩）：地毯也不畫
      if (r.round) {
        ellipse(r.x + r.w / 2, r.y + r.h / 2, r.w / 2 + 1, r.h / 2 + 1, OL);
        ellipse(r.x + r.w / 2, r.y + r.h / 2, r.w / 2, r.h / 2, r.c1);
        ellipse(r.x + r.w / 2, r.y + r.h / 2, r.w / 2 - 4, r.h / 2 - 3, r.c2);
      } else {
        rect(r.x - 1, r.y - 1, r.w + 2, r.h + 2, OL); rect(r.x, r.y, r.w, r.h, r.c1);
        rect(r.x + 4, r.y + 4, r.w - 8, r.h - 8, r.c2);
        for (let x = r.x + 8; x < r.x + r.w - 8; x += 10) rect(x, r.y + r.h / 2 - 1, 4, 2, r.c1);
      }
    }
  }
  // 地毯跟著它下面那件家具走（r.under＝家具種類；2026-10-16）：佈置搬了茶几、貓窩，地毯一起移過去，相對位置照預設的擺法。
  // 只算出畫的位置，不另外存（家具位置存了，地毯就跟著）；整塊留在地板上。那件家具不在家裡（P78：帳號沒有）＝null，不畫
  function rugAt(r) {
    if (!r.under) return r;
    const f = furn.find(q => q.kind === r.under);
    if (!f) return null;
    const x = clamp(r.x + f.x - f.dx, 0, W - r.w), y = clamp(r.y + f.y - f.dy, WALL_Y + 2, H - r.h - 1);
    return { ...r, x: Math.round(x), y: Math.round(y) };
  }

  // 家具（正式美術，2026-10-15）：使用者「太小了，這邊可以符合一下實際上的大小狀態」→ 照實際比例（1 像素約 1.5 公分，貓坐著約 30 像素）。
  //   書櫃、貓跳台、立燈、盆栽、沙發、單人沙發、茶几、貓窩、紙箱＝使用者用 Gemini 照大小剪影產圖、轉格子後定案（docs/美術/家具美術規格.md）；
  //   狗屋、球、水碗、飯碗＝電腦版的圖（mobile/tools/make_furniture.py）。
  //   圖在 art/furniture/（mobile/tools/make_furniture.py 產生），1 格＝1 像素、跟毛孩同比例；圖的底邊中間放在 (x, y)。
  //   hit＝點得到的範圍 [寬, 高]；fp＝毛孩不走進去的地面範圍 [寬, 深]
  const FIMG = {};
  const furnImg = name => FIMG[name] || (FIMG[name] = Object.assign(new Image(), { src: `art/furniture/${name}.png` }));
  function put(name, x, y, flip) {
    const im = furnImg(name);
    if (!im.naturalWidth) return;                 // 還沒載入好：下一格再畫
    const w = im.naturalWidth, h = im.naturalHeight, x0 = Math.round(x - w / 2), y0 = Math.round(y - h);
    if (flip) { ctx.save(); ctx.translate(x0 + w, y0); ctx.scale(-1, 1); ctx.drawImage(im, 0, 0); ctx.restore(); }
    else ctx.drawImage(im, x0, y0);
  }
  const pic = (name, hit, fp, more = {}) => ({ hit, fp, ...more, draw(x, y, flip) { put(name, x, y, flip); } });
  const FURN = {
    shelf: pic('shelf', [92, 122], [92, 10]),
    cattree: pic('cattree', [70, 94], [70, 10]),
    sofa: pic('sofa', [133, 56], [133, 22]),
    armchair: pic('armchair', [64, 56], [64, 22]),
    table: pic('table', [66, 36], [66, 14]),
    lamp: pic('lamp', [32, 108], [24, 6]),
    plant: pic('plant', [35, 52], [26, 8]),
    catbed: pic('catbed', [39, 23], null, { spot: 'bed' }),
    bowls: { hit: [38, 10], fp: null, spot: 'eat', draw(x, y) { put('food', x - 9, y); put('water', x + 9, y); } },
    box: pic('box', [53, 28], [51, 12], { spot: 'box' }),
    doghouse: pic('doghouse', [64, 59], [56, 16]),
    ball: pic('ball', [10, 9], null, { spot: 'ball' }),
    // 旅行日記帶回來的伴手禮（放進家裡的；貓會過去玩）
    yarn: { hit: [12, 10], fp: null, spot: 'toy', draw(x, y) {
      ellipse(x, y - 4, 4, 4, OL); ellipse(x, y - 4, 3, 3, '#e86b8a'); rect(x - 2, y - 5, 4, 1, '#f4a3b8'); rect(x - 1, y - 3, 3, 1, '#f4a3b8'); rect(x + 4, y - 1, 5, 1, '#e86b8a');
    } },
    fish: { hit: [14, 8], fp: null, spot: 'toy', draw(x, y) {
      ellipse(x, y - 3, 5, 3, OL); ellipse(x, y - 3, 4, 2, '#78b7d8'); rect(x + 5, y - 6, 2, 6, OL); rect(x + 5, y - 5, 1, 4, '#78b7d8'); rect(x - 3, y - 4, 1, 1, OL);
    } },
  };
  // 家具＝假資料的家具＋放進家裡的伴手禮（伴手禮先記在這台裝置的瀏覽器，之後改存伺服器）
  // 2026-10-15 家具改實際比例：房間 480×390 → 560×484、牆腳 56 → 150。舊版（v1）存的位置換算到新房間，
  // 不然手機上之前佈置過的家具會跑到牆上（使用者：「手機上我的家具都飛起來了」）
  const fromOld = (x, y) => [Math.round(x * 560 / 480), Math.round(y + 94)];
  const EXTRA_KEY = 'deskcat_home_extras_v2';
  function localExtras() {
    try { return (JSON.parse(localStorage.getItem(EXTRA_KEY) || '[]') || []).filter(e => e && FURN[e.kind]); } catch (_) { return []; }
  }
  try {
    const old = localStorage.getItem('deskcat_home_extras_v1');
    if (old && !localStorage.getItem(EXTRA_KEY)) {
      localStorage.setItem(EXTRA_KEY, JSON.stringify((JSON.parse(old) || []).map(e => { const [x, y] = fromOld(e.x, e.y); return { ...e, x, y }; })));
      localStorage.removeItem('deskcat_home_extras_v1');
    }
  } catch (_) { /* 換算不了：當作沒有 */ }
  let extras = localExtras();
  // 家具跟著帳號（P78，使用者 2026-10-19）：手機裝潢（書架、檯燈、植物、單人沙發、桌子、球）大家都有；
  // 貓窩、貓跳台、沙發、飯碗水碗、紙箱、狗屋＝電腦買過才擺（每種 1 個，位置照範例）。手機沒有圖的電腦家具不出現、不換色
  const DECOR = new Set(['shelf', 'lamp', 'plant', 'armchair', 'table', 'ball']);
  const OWNABLE = new Set(['catbed', 'cattree', 'sofa', 'bowls', 'box', 'doghouse']);
  const furn = [];                          // 每件：{kind, x, y, k: FURN 的畫法, dx/dy: 預設位置, extra: 伴手禮那筆（是伴手禮才有）}
  function buildFurn(owned, ex) {           // owned＝null：範例的全部（範例模式、伺服器沒有 020、還沒讀到）
    const list = HOME.furniture.filter(f => FURN[f.kind] && (!owned || DECOR.has(f.kind) || (OWNABLE.has(f.kind) && owned[f.kind] > 0)))
      .map(f => ({ ...f, k: FURN[f.kind], dx: f.x, dy: f.y }));
    for (const e of ex) if (FURN[e.kind]) list.push({ kind: e.kind, x: e.x, y: e.y, k: FURN[e.kind], dx: e.x, dy: e.y, extra: e });
    furn.splice(0, furn.length, ...list);
  }
  buildFurn(null, extras);

  function blocked(x, y) {
    return furn.some(f => f.k.fp && Math.abs(x - f.x) < f.k.fp[0] / 2 + 6 && y <= f.y + 3 && y >= f.y - f.k.fp[1] - 3);
  }
  function freeSpot() {
    for (let i = 0; i < 30; i++) {
      const x = rnd(FLOOR.x0 + 10, FLOOR.x1 - 10), y = rnd(FLOOR.y0, FLOOR.y1);
      if (!blocked(x, y)) return [x, y];
    }
    return [W / 2, H - 20];
  }

  // ---------- 毛孩 ----------
  let now = performance.now();
  const door = { open: 0, want: 0 };
  class Pet {
    constructor(p, x, y) {
      this.p = p; this.d = petInfo(p); this.im = img(this.d.file);
      this.x = x; this.y = y; this.flip = Math.random() < .5;
      this.anim = 'idle'; this.t0 = 0; this.fps = 4; this.until = 0;
      this.target = null; this.after = null; this.busy = false; this.held = false; this.hearts = [];
    }
    set(anim, fps = 4) { anim = animOf(this.d, anim); if (anim !== this.anim) { this.anim = anim; this.t0 = now; } this.fps = fps; }
    walkTo(x, y, then) {
      this.target = [clamp(x, FLOOR.x0, FLOOR.x1), clamp(y, FLOOR.y0 - 8, FLOOR.y1)]; this.after = then || null;
      this.set('walk', 8);
    }
    dog() { return isDog(this.p); }
    think() {                                   // 閒著的時候決定下一件事
      const night = timeOfDay() === 'night', r = Math.random(), dog = this.dog();
      const spot = s => furn.find(f => f.k.spot === s);
      if (night && r < .7) { this.set('sleep', 1.2); this.until = now + rnd(8000, 16000); return; }
      if (r < .05 && boardCards.length) return this.walkTo(BOARD.x + BOARD.w / 2 + rnd(-24, 24), FLOOR.y0 + 2, () => {
        this.set('sit', 1); this.until = now + rnd(3000, 5000); if (Math.random() < .6) say(this, line(this, 'home_board'));
      });
      if (r < .08 && souvCount()) return this.walkTo(SHELF.x + SHELF.w / 2 + rnd(-16, 16), FLOOR.y0 + 2, () => {
        this.set('sit', 1); this.until = now + rnd(3000, 5000); if (Math.random() < .5) say(this, line(this, 'souvenir'));
      });
      if (r < .12 && !dog) { const b = spot('bed'); if (b) return this.walkTo(b.x, b.y - 4, () => { this.set('sleep', 1.2); this.until = now + rnd(6000, 12000); }); }
      if (r < .22 && !dog) { const b = spot('box'); if (b) return this.walkTo(b.x, b.y + 2, () => { this.set(['inbox', 'sit'], 2); this.until = now + rnd(4000, 8000); }); }
      if (r < .32) { const b = spot('eat'); if (b) return this.walkTo(b.x + (Math.random() < .5 ? -16 : 16), b.y + 4, () => { this.flip = this.x > b.x; this.set('eat', 3); this.until = now + rnd(3000, 5000); }); }
      if (r < .4 && !dog) { const b = spot('toy'); if (b) return this.walkTo(b.x - 12, b.y + 2, () => { this.flip = false; this.set(['crouch', 'knead'], 3); this.until = now + rnd(2500, 4000); }); }
      if (r < .4 && dog) { const b = spot('ball'); if (b) return this.walkTo(b.x - 14, b.y + 2, () => { this.flip = false; this.set(['play_bow', 'wag'], 5); this.until = now + rnd(2500, 4000); }); }
      if (r < .72) { const [x, y] = freeSpot(); return this.walkTo(x, y); }
      const idle = dog ? [['sit_wag', 5], ['pant', 4], ['sit', 1], ['loaf', 1.5], ['sniff', 4], ['yawn', 2]]
                       : [['sit', 1], ['loaf', 1.5], ['groom', 3], ['yawn', 2], ['tail_flick', 4], ['idle', 1], ['washface', 3]];
      const [a, f] = idle[Math.floor(Math.random() * idle.length)];
      this.set(a, f); this.until = now + rnd(3000, 7000);
    }
    step(dt) {
      if (this.held) return;
      if (this.target) {
        const [tx, ty] = this.target, dx = tx - this.x, dy = ty - this.y, dist = Math.hypot(dx, dy);
        const v = (this.dog() ? 26 : 20) * dt;
        if (dist <= v) {
          this.x = tx; this.y = ty; this.target = null;
          const a = this.after; this.after = null;
          if (a) a(); else this.until = 0;
        } else {
          this.x += dx / dist * v; this.y += dy / dist * v;
          if (Math.abs(dx) > 1) this.flip = dx < 0;
        }
      } else if (now > this.until && !this.busy) this.think();
    }
    draw() {
      const d = petInfo(this.p);            // 伺服器的毛孩圖下載好了：從範例的圖換成牠自己的（同一個動作）
      if (d !== this.d) { this.d = d; this.im = img(d.file); this.anim = animOf(d, this.anim); if ('placed' in this) this.placed = false; }
      if (!(this.im.complete && this.im.naturalWidth)) return;
      const { w, h } = this.d, [row, n] = this.d.anims[this.anim];
      const f = Math.floor((now - this.t0) / 1000 * this.fps) % n;
      const x = Math.round(this.x - w / 2), y = Math.round(this.y - h);
      if (!this.held) ellipse(this.x, this.y - 1, Math.round(w * .22), 2, 'rgba(40,20,10,.22)');   // 影子
      else ellipse(this.x, (this.landY || this.ground()) - 1, Math.round(w * .2), 2, 'rgba(40,20,10,.3)');   // 拎著：影子＝放手會落下的地方
      ctx.save();
      if (this.flip) { ctx.translate(x + w, y); ctx.scale(-1, 1); ctx.drawImage(this.im, f * w, row * h, w, h, 0, 0, w, h); }
      else ctx.drawImage(this.im, f * w, row * h, w, h, x, y, w, h);
      ctx.restore();
    }
    ground() { return clamp(this.y + this.d.h * .3, FLOOR.y0, FLOOR.y1); }
    headY() { return this.y - this.d.h * .78; }
    hit(px, py) {
      const hw = this.d.w * .32;
      return px > this.x - hw && px < this.x + hw && py > this.y - this.d.h * .85 && py < this.y + 3;
    }
  }

  const pets = [];
  function spawnHome() {
    for (const p of HOME.pets.filter(q => q.where === 'home')) {
      const [x, y] = freeSpot(), pet = new Pet(p, x, y);
      pet.until = now + rnd(0, 2500); pet.set(timeOfDay() === 'night' ? 'sleep' : 'sit', 1.2);
      pets.push(pet);
    }
  }

  // ---------- 愛心、說話泡泡 ----------
  function addHearts(pet, n = 3) { for (let i = 0; i < n; i++) pet.hearts.push({ t: -i * .25, dx: rnd(-6, 6) }); }
  function drawHearts(pet, dt) {
    pet.hearts = pet.hearts.filter(h => (h.t += dt) < 1.4);
    for (const h of pet.hearts) if (h.t > 0) drawHeart(pet.x + h.dx, pet.headY() - h.t * 14, 1 - h.t / 1.4);
  }
  function drawHeart(x, y, a) {
    ctx.save(); ctx.globalAlpha = clamp(a, 0, 1); ctx.fillStyle = '#ff6b8a';
    x = Math.round(x); y = Math.round(y);
    ctx.fillRect(x - 3, y, 2, 2); ctx.fillRect(x + 1, y, 2, 2); ctx.fillRect(x - 3, y + 1, 6, 2); ctx.fillRect(x - 2, y + 3, 4, 1); ctx.fillRect(x - 1, y + 4, 2, 1);
    ctx.restore();
  }
  const bubbles = [];
  function say(pet, text, ms = 1800) {
    const tnow = performance.now();
    if (pet.lastSay && tnow - pet.lastSay < 900) return;
    pet.lastSay = tnow;
    bubbles.filter(b => b.pet === pet && !b.hint).forEach(b => { b.until = 0; });
    const el = document.createElement('div'); el.className = 'bubble'; el.textContent = text;
    (pet.bubbleBox || $('bubbles')).appendChild(el); bubbles.push({ pet, el, until: tnow + ms });
  }
  // 順毛方向提示：腳下地面上一個箭頭＋小手沿「頭 → 尾巴」滑過去（使用者「摸的需要提示摸的方向，需要圖標提示」；不能蓋住毛孩）
  // 順毛方向（2026-10-14 使用者「依照毛小孩的動作分成坐著 45 度角，站著趴著 180，依照面向決定」）：
  // 從頭往尾巴；坐著＝斜 45 度往下（背是斜的），站著、趴著＝水平。圖預設朝右（flip＝朝左）。
  const SIT_POSES = new Set(['sit', 'sit_blink', 'sit_wag', 'sit_ball', 'pant', 'washface', 'tail_flick', 'yawn', 'groom']);
  function strokeVec(pet) {
    const tail = pet.flip ? 1 : -1;         // 尾巴在哪一邊
    return SIT_POSES.has(pet.anim) ? [tail * Math.SQRT1_2, Math.SQRT1_2] : [tail, 0];
  }
  function hintAngle(pet) {                 // 箭頭的角度（CSS rotate，順時針為正）：to-left 本來指左、to-right 本來指右
    if (!SIT_POSES.has(pet.anim)) return 0;
    return pet.flip ? 45 : -45;
  }
  // 提示放在腳下：斜的箭頭（坐著）上下比較長，多往下移，整條都在腳的下面
  // 提示的位置（2026-10-14 使用者畫的紅色箭頭）：在背的外側、跟背平行、不碰到毛孩。
  // 站著趴著＝牠的正上方；坐著＝背那一側的斜上方。用這一格實際畫到的範圍（快取）算。
  const OPAQUE = {};
  function opaqueBox(pet) {                 // 這一格（動作的第 1 格）實際有畫的範圍（圖格座標）
    const d = pet.d, key = pet.p.sprite + '|' + pet.anim;
    if (OPAQUE[key]) return OPAQUE[key];
    const im = pet.im;
    if (!(im.complete && im.naturalWidth)) return { l: d.w * .15, t: d.h * .2, r: d.w * .85, b: d.h - 1 };
    const c = document.createElement('canvas'); c.width = d.w; c.height = d.h;
    const cc = c.getContext('2d'); cc.drawImage(im, 0, d.anims[pet.anim][0] * d.h, d.w, d.h, 0, 0, d.w, d.h);
    const px = cc.getImageData(0, 0, d.w, d.h).data;
    let l = d.w, t = d.h, r = 0, b = 0;
    for (let y = 0; y < d.h; y++) for (let x = 0; x < d.w; x++) if (px[(y * d.w + x) * 4 + 3]) { l = Math.min(l, x); r = Math.max(r, x); t = Math.min(t, y); b = Math.max(b, y); }
    return (OPAQUE[key] = { l, t, r, b });
  }
  function hintAnchor(pet) {               // 箭頭中線的位置（世界座標）
    const d = pet.d, o = opaqueBox(pet);
    const l = pet.flip ? d.w - 1 - o.r : o.l, r = pet.flip ? d.w - 1 - o.l : o.r;
    const x0 = pet.x - d.w / 2 + l, x1 = pet.x - d.w / 2 + r, y0 = pet.y - d.h + o.t, y1 = pet.y - d.h + o.b;
    const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, gap = 5;
    if (!SIT_POSES.has(pet.anim)) return [cx, y0 - gap];
    const tail = pet.flip ? 1 : -1, k = Math.SQRT1_2;          // 背那一側：尾巴那邊＋往上
    const dist = k * ((x1 - x0) + (y1 - y0)) / 2 * .62 + gap;
    return [cx + tail * k * dist, cy - k * dist];
  }
  const hintTransform = pet => `translate(-50%, 0) rotate(${hintAngle(pet)}deg)`;
  function strokeHint(pet, ms = 1800, wrong = false) {
    if (!isPhone) return;                 // 順毛只有手機
    bubbles.filter(b => b.pet === pet && b.hint).forEach(b => { b.until = 0; });
    const el = document.createElement('div');
    el.className = 'stroke-hint ' + (pet.flip ? 'to-right' : 'to-left') + (wrong ? ' wrong' : '');
    el.style.transform = hintTransform(pet);
    el.innerHTML = '<span class="trail"></span><span class="hand">👇</span>';
    (pet.bubbleBox || $('bubbles')).appendChild(el);
    bubbles.push({ pet, el, until: performance.now() + ms, hint: true });
  }
  // 台詞（2026-10-16）：照 src/lines.py 的規則（6 種個性、11 字以內、狗另外寫），lines.js 由 mobile/tools/export_lines.py 產生：
  // lines.py 有的用正式的，還沒有的用草稿 mobile/tools/lines_mobile.py（跨線需求：請遊戲線貼進 lines.py）。
  // 挑法跟 lines.pick 一樣：個性有自己的 75% 用自己的；狗沒寫到的用貓的、濾掉 CAT_ONLY；同一隻不連說同一句；{other} 換成名字。
  // 個性：伺服器的 dc_pets_mine 給（server/015 的 personality；空的＝電腦還沒傳過＝「普通」）。
  const LN = window.DC_LINES || { cat: {}, dog: {}, catOnly: [], dogGeneric: ['…'] };
  const lastLine = new Map();
  function line(pet, k, vars = {}) {
    const dog = pet.dog(), per = pet.p.personality || '普通';
    const d = (dog && LN.dog[k]) || LN.cat[k];
    if (!d) return '';
    const own = d[per] || [];
    let pool = own.length && Math.random() < .75 ? own : (d.default || own);
    if (dog && d !== LN.dog[k]) pool = pool.filter(t => !LN.catOnly.some(w => t.includes(w)));
    if (!pool.length) pool = dog ? LN.dogGeneric : ['…'];
    const key = k + '|' + (pet.p.id || pet.p.name), choices = pool.filter(t => t !== lastLine.get(key));
    const text = (choices.length ? choices : pool)[Math.floor(Math.random() * (choices.length || pool.length))];
    lastLine.set(key, text);
    return text.replace(/\{(other|name|n)\}/g, (_, v) => v === 'name' ? pet.p.name : String(vars[v] ?? ''));
  }

  // ---------- 摸摸、順毛、拎起來 ----------
  function petPet(pet) {
    if (pet.anim === 'sleep' && Math.random() < .5) { say(pet, line(pet, 'home_sleepy')); return; }
    pet.target = null; pet.after = null; pet.busy = false;
    pet.set(pet.dog() ? ['sit_wag', 'wag'] : ['knead', 'sit_blink'], pet.dog() ? 6 : 4);
    pet.until = focusedPet && focusedPet() === pet ? Infinity : now + 2600; addHearts(pet);
    say(pet, line(pet, 'pet'));
    pet.p.mood = Math.min(3, pet.p.mood + 1); pet.p.moodHold = Date.now() + 60000;
    remote(pet.p, 'pet');
  }
  function stroke(pet, dx, dy = 0) {        // 手指滑的方向（dx, dy）跟「頭 → 尾巴」比：同方向＝順毛
    pet.target = null; pet.after = null;
    const [vx, vy] = strokeVec(pet);
    const along = dx * vx + dy * vy > 0;
    if (along) {
      pet.set(pet.dog() ? ['sit_wag', 'wag'] : ['sit_blink', 'knead'], pet.dog() ? 6 : 3);
      addHearts(pet, 1); say(pet, line(pet, 'stroke')); remote(pet.p, 'pet');
      bubbles.filter(b => b.pet === pet && b.hint).forEach(b => { b.until = 0; });   // 摸對了：提示收起來
    } else {
      pet.set(['shake', 'hiss', 'sit'], 6); say(pet, line(pet, 'stroke_against'));
      strokeHint(pet, focusedPet && focusedPet() === pet ? 60000 : 2200, true);       // 摸反了：黃色提示（選中時一直留著）
    }
    pet.until = focusedPet && focusedPet() === pet ? Infinity : now + 2200;
  }

  // ---------- 搬家：走出門、從門走進來 ----------
  function leaveHome(pet, where, msg) {
    pet.busy = true;
    pet.walkTo(DOOR.x, FLOOR.y0 - 6, () => {
      door.want = 1;
      setTimeout(() => {
        if (pets.includes(pet)) pets.splice(pets.indexOf(pet), 1);
        pet.gone = true; pet.p.where = where; pet.p.moving = false;
        if (sheetPet && sheetPet.room === pet) closeSheet();
        setTimeout(() => { door.want = 0; }, 500);
        render(); toast(msg);
      }, 450);
    });
  }
  function arriveHome(p) {
    door.want = 1; lookAt(DOOR.x - 40, WALL_Y + 60); p.moving = true;
    setTimeout(() => {
      const pet = new Pet(p, DOOR.x, FLOOR.y0 - 6); pet.busy = true;
      pets.push(pet); p.where = 'home'; p.moving = false; render();
      const [x, y] = freeSpot();
      const items = (p.found || []).splice(0);          // 口袋撿到的紀念品
      pet.walkTo(clamp(x, 380, 520), y, () => {
        pet.busy = false; pet.set('sit', 1); pet.until = now + 2500; say(pet, line(pet, 'home_back'));
        if (items.length) setTimeout(() => bringSouvenirs(pet, items), 1400);
        const o = pets.filter(q => q !== pet && !q.busy && !q.held)[0];       // 一隻過去聞聞牠
        if (o) o.walkTo(pet.x + (o.x < pet.x ? -26 : 26), pet.y, () => { o.flip = o.x > pet.x; o.set(o.dog() ? 'sniff' : 'nuzzle', 4); o.until = now + 2500; });
      });
      setTimeout(() => { door.want = 0; }, 900);
    }, 400);
  }

  // ---------- 佈置模式：平常家具不能動；按「🛋 佈置」才能拖家具 ----------
  // 照帳號擺的時候存伺服器（下面「家具跟著帳號」）；照舊的時候記在這台裝置的瀏覽器。
  // v2 記「哪一種家具＋位置」，照種類對回去（家具順序改了也不會對錯）
  const LAYOUT_KEY = 'deskcat_home_layout_v2';
  const OLD_ORDER = ['shelf', 'cattree', 'sofa', 'lamp', 'table', 'armchair', 'armchair', 'plant', 'plant', 'catbed', 'bowls', 'box', 'doghouse', 'ball'];  // v1 的家具順序
  try {
    const old = JSON.parse(localStorage.getItem('deskcat_home_layout_v1') || 'null');
    if (Array.isArray(old) && !localStorage.getItem(LAYOUT_KEY)) {
      const kinds = [...OLD_ORDER, ...extras.map(e => e.kind)];
      localStorage.setItem(LAYOUT_KEY, JSON.stringify(old.slice(0, kinds.length).map(([x, y], i) => { const [nx, ny] = fromOld(x, y); return { k: kinds[i], x: nx, y: ny }; })));
      localStorage.removeItem('deskcat_home_layout_v1');
    }
  } catch (_) { /* 換算不了：用預設位置 */ }
  function localLayout() {
    try { const a = JSON.parse(localStorage.getItem(LAYOUT_KEY) || 'null'); return Array.isArray(a) ? a : null; } catch (_) { return null; }
  }
  function applyLayout(saved) {             // 照種類對回去（同一種有兩個：照順序）；沒有的種類跳過
    if (!Array.isArray(saved)) return;
    const used = new Set();
    for (const s of saved) {
      const f = s && furn.find(q => q.kind === s.k && !used.has(q));
      if (!f) continue;
      used.add(f); f.x = clamp(+s.x || 0, 16, W - 16); f.y = clamp(+s.y || 0, WALL_Y + 6, H - 2);
    }
  }
  applyLayout(localLayout());

  // ---------- 家具跟著帳號（P78，server/020；規格在 docs/跨線需求.md 2026-10-19 🎮 P78） ----------
  // 登入、伺服器有 020：家具照帳號（dc_home_mine 的 owned）擺；佈置完、放進伴手禮 → 停手 2 秒存伺服器（dc_home_layout_set）。
  // 這台瀏覽器另外照帳號記一份（HOME_KEY）＝快取：打開先照它擺、不用等伺服器；沒網路時改的（dirty）下次讀伺服器時再送。
  // 伺服器 layout 是 null＝第一次：把這支手機以前的擺法（LAYOUT_KEY）和伴手禮（EXTRA_KEY）傳上去。
  // 伺服器沒有 020（找不到函式＝404，正式版貼 020 之前）：照舊只存瀏覽器（範例的家具全部擺＋LAYOUT_KEY）。
  // 送上去的 layout 只有家具（伴手禮在 extras、帶自己的位置）；帳號現在沒有的家具，以前記的位置也留著（之後有了擺回原位）。
  const HOME_KEY = 'deskcat_home_v1';
  const KIND_RE = /^[a-z_]{1,24}$/;
  const TEMPLATE_KINDS = new Set(HOME.furniture.map(f => f.kind));
  const homeAll = () => { try { const a = JSON.parse(localStorage.getItem(HOME_KEY) || '{}'); return a && typeof a === 'object' && !Array.isArray(a) ? a : {}; } catch (_) { return {}; } };
  const homeGet = id => (id && homeAll()[id]) || null;
  function homePut(id, v) { try { const a = homeAll(); a[id] = v; localStorage.setItem(HOME_KEY, JSON.stringify(a)); } catch (_) { /* 存不了：這次開著還是能用 */ } }
  let homeAcct = null, homeMem = null;      // 現在照哪個帳號擺（null＝照舊）、那個帳號的 {owned, layout, extras, dirty}
  const toInt = (v, max) => clamp(Math.round(+v || 0), 0, max);   // 伺服器只收 0～560、0～484 的整數
  function layoutNow(prev) {                // 要存的擺法：家具現在的位置＋以前記的、現在沒有的那幾件（最多 40）
    const out = furn.filter(f => !f.extra).map(f => ({ k: f.kind, x: toInt(f.x, W), y: toInt(f.y, H) }));
    const have = {};
    out.forEach(o => { have[o.k] = (have[o.k] || 0) + 1; });
    for (const s of prev || []) {
      if (!s || !TEMPLATE_KINDS.has(s.k)) continue;
      if (have[s.k] > 0) { have[s.k]--; continue; }
      out.push({ k: s.k, x: toInt(s.x, W), y: toInt(s.y, H) });
    }
    return out.slice(0, 40);
  }
  const extrasNow = () => extras.filter(e => KIND_RE.test(e.kind)).slice(-40).map(e => ({ kind: e.kind, x: toInt(e.x, W), y: toInt(e.y, H) }));
  function useHome(id, h) {                 // 照帳號擺：手機裝潢＋owned 有的＋伴手禮，位置照 layout
    homeAcct = id; homeMem = h;
    extras = (h.extras || []).filter(e => e && FURN[e.kind]).map(e => ({ kind: e.kind, x: +e.x || 0, y: +e.y || 0 }));
    buildFurn(h.owned === undefined ? {} : h.owned, extras);   // null＝電腦還沒傳家具清單：範例的全部
    applyLayout(h.layout);
  }
  function homeSave(dirty) {                // 照帳號擺的時候：記進這台瀏覽器（dirty＝還沒傳上去）
    if (!homeAcct) return;
    for (const f of furn) if (f.extra) { f.extra.x = toInt(f.x, W); f.extra.y = toInt(f.y, H); }
    homeMem = { owned: homeMem.owned, layout: layoutNow(homeMem.layout), extras: extrasNow(), dirty };
    homePut(homeAcct, homeMem);
  }
  { // 打開時：這個帳號上次的家具先擺出來（伺服器讀到再換）
    const id = LIVE && SV.mode === 'live' ? souvAcct() : null, h = homeGet(id);
    if (h && !h.none) useHome(id, h);
  }
  let homeBusy = null, homeReady = false, homeTimer = 0, homeSending = false;   // homeReady：這次打開已經跟伺服器對過了
  function homeSync() {
    const id = souvAcct();
    if (!LIVE || SV.mode !== 'live' || !id || !SV.homeMine) return Promise.resolve();
    if (!homeBusy) homeBusy = (async () => {
      try {
        const r = await SV.homeMine();
        if (souvAcct() !== id || !r || typeof r !== 'object') return;
        // 每種最多 1 個。owned_at 是 null＝電腦還沒傳過家具清單（電腦還是舊版）：先照舊全部擺（null），不要一登入家具就少了
        let owned = null;
        if (r.owned_at) { owned = {}; for (const [k, v] of Object.entries(r.owned || {})) if (OWNABLE.has(k) && +v > 0) owned[k] = 1; }
        const mine = homeGet(id);
        let h;
        if (mine && mine.dirty && !mine.none) h = { ...mine, owned };    // 這邊改了還沒傳上去：用這邊的，等一下送
        else if (r.layout == null) h = { owned, layout: localLayout(), extras: localExtras(), dirty: true };   // 第一次：這支手機的搬上去
        else h = { owned, layout: Array.isArray(r.layout) ? r.layout : [], extras: Array.isArray(r.extras) ? r.extras : [], dirty: false };
        if (editMode) return;                  // 正在佈置：不換家具（佈置完會再讀一次）
        useHome(id, h); homeSave(h.dirty); render();
        homeReady = true;
        if (h.dirty) homeSend();
      } catch (e) {
        if (e.status === 404) {                // 伺服器沒有 020：照舊只存瀏覽器
          homePut(id, { none: true }); homeReady = true;
          if (homeAcct) { homeAcct = null; homeMem = null; extras = localExtras(); buildFurn(null, extras); applyLayout(localLayout()); render(); }
        }
        /* 沒網路、伺服器有狀況：照快取擺著，下次讀伺服器（pull）再試 */
      } finally { homeBusy = null; }
    })();
    return homeBusy;
  }
  const homeWaiting = () => !!(homeAcct && homeMem && homeMem.dirty && !homeTimer && !homeSending);
  function homeLater(ms = 2000) { clearTimeout(homeTimer); homeTimer = setTimeout(homeSend, ms); }   // 停手 2 秒再送（一直拖就一直往後延）
  async function homeSend() {
    clearTimeout(homeTimer); homeTimer = 0;
    const id = homeAcct, sent = homeMem;
    if (!id || !sent || !sent.dirty || SV.mode !== 'live' || souvAcct() !== id) return;
    if (homeSending) { homeLater(); return; }
    homeSending = true;
    try {
      const r = await SV.homeLayoutSet(sent.layout, sent.extras);
      if (r && r.ok === false) console.warn('手機的家：伺服器說格式不對（不再送）', r, sent);
      if (homeAcct === id && homeMem === sent) { homeMem = { ...sent, dirty: false }; homePut(id, homeMem); }   // 送的時候又改了＝還是 dirty，等一下再送
    } catch (e) {
      if (e.status === 404) homePut(id, { ...sent, none: true });   // 伺服器沒有 020（不太會：讀的時候有）：下次打開照舊
      /* 沒網路：留著 dirty，下次讀伺服器時再送 */
    } finally { homeSending = false; }
  }
  addEventListener('online', () => { if (homeWaiting()) homeSend(); });

  function saveLayout() {
    for (const f of furn) if (f.extra) { f.extra.x = toInt(f.x, W); f.extra.y = toInt(f.y, H); }
    if (homeAcct) { homeSave(true); homeLater(); return; }
    try {
      localStorage.setItem(LAYOUT_KEY, JSON.stringify(furn.map(f => ({ k: f.kind, x: Math.round(f.x), y: Math.round(f.y) }))));
      localStorage.setItem(EXTRA_KEY, JSON.stringify(extras));
    } catch (_) { /* 存不了就算了 */ }
  }
  let editMode = false, picked = null;
  function setEdit(on) {
    editMode = on; picked = null;
    document.body.classList.toggle('editing', on);
    $('editBar').hidden = !on;
    closeSheet();
    if (on) { pets.forEach(p => { if (p.held) { p.held = false; p.busy = false; } }); toast(coarse ? '按住家具拖到喜歡的地方' : '拖曳家具到喜歡的地方'); }
    else { saveLayout(); toast('佈置好了'); }
  }
  $('editBtn').onclick = () => setEdit(!editMode);
  $('editDone').onclick = () => setEdit(false);
  $('editReset').onclick = () => { furn.forEach(f => { f.x = f.dx; f.y = f.dy; }); picked = null; toast('家具回到原本的位置'); };
  function drawPicked() {                 // 選到的家具：黃色外框
    const f = picked || hoverF;
    if (!editMode || !f) return;
    const [w, h] = f.k.hit, x = Math.round(f.x - w / 2) - 2, y = Math.round(f.y - h) - 2;
    ctx.fillStyle = f === picked ? '#ffd84a' : 'rgba(255,216,74,.6)';
    ctx.fillRect(x, y, w + 4, 1); ctx.fillRect(x, y + h + 4, w + 4, 1); ctx.fillRect(x, y, 1, h + 4); ctx.fillRect(x + w + 4, y, 1, h + 5);
  }

  // ---------- 手勢 ----------
  // 手機（觸控）——「點一下選中，再專心摸」（2026-10-14 使用者：摸跟移動畫面會衝突）：
  //   平常：單指滑＝一律移動畫面（滑過毛孩也一樣）、點毛孩＝摸一下＋選中、按住毛孩＝拎起來、兩指＝縮放／移動
  //   選中一隻（下面面板開著）：鏡頭放大對準牠、畫面鎖住；單指在房間任何地方滑＝順毛那隻；點空白＝取消選中；點別隻＝換選中；兩指還是可以移動、縮放
  // 電腦（滑鼠）：點一下＝摸摸、按住毛孩直接拖＝拎起來、拖空地＝移動鏡頭、滾輪＝縮放（順毛是手機獨有的，滑鼠不好懂，2026-10-14 使用者）
  // 佈置模式：拖家具＝搬、拖空地＝移動鏡頭；毛孩點不到
  const pts = new Map();
  let g = null, hoverF = null;
  const petAt = (wx, wy) => editMode ? null : [...pets].sort((a, b) => b.y - a.y).find(p => p.hit(wx, wy));
  const furnAt = (wx, wy) => [...furn].sort((a, b) => b.y - a.y).find(f => Math.abs(wx - f.x) < f.k.hit[0] / 2 && wy <= f.y + 2 && wy >= f.y - f.k.hit[1]);
  function startCarry(pet) {
    bubbles.filter(b => b.pet === pet && b.hint).forEach(b => { b.until = 0; });
    g.mode = 'carry'; pet.held = true; pet.busy = true; pet.target = null; pet.after = null;
    pet.set(['held', 'idle'], 4); say(pet, line(pet, 'held'));
    if (navigator.vibrate) navigator.vibrate(15);
  }
  cv.addEventListener('pointerdown', e => {
    try { cv.setPointerCapture(e.pointerId); } catch (_) { /* 模擬的指標沒有 capture */ }
    pts.set(e.pointerId, [e.clientX, e.clientY]);
    hideHint();
    if (pts.size === 2) {                  // 兩指：縮放
      if (g && g.lp) clearTimeout(g.lp);
      if (g && g.mode === 'carry') drop();
      const [a, b] = [...pts.values()];
      g = { mode: 'pinch', d0: Math.hypot(a[0] - b[0], a[1] - b[1]), mx: (a[0] + b[0]) / 2, my: (a[1] + b[1]) / 2, cx: cam.x, cy: cam.y };
      return;
    }
    const [wx, wy] = toWorld(e.clientX, e.clientY);
    const mouse = e.pointerType === 'mouse';
    const pet = petAt(wx, wy), f = editMode ? furnAt(wx, wy) : null;
    g = { mode: 'down', mouse, sx: e.clientX, sy: e.clientY, lx: e.clientX, ly: e.clientY, ax: 0, ay: 0, t: performance.now(), pet, f, cx: cam.x, cy: cam.y,
          fdx: f ? f.x - wx : 0, fdy: f ? f.y - wy : 0 };
    if (f) { picked = f; g.mode = 'move'; }
    else if (pet && !mouse) {              // 觸控：按住才拎
      g.lp = setTimeout(() => { if (g && g.mode === 'down') startCarry(pet); }, 380);
    }
  });
  cv.addEventListener('pointermove', e => {
    const [wx, wy] = toWorld(e.clientX, e.clientY);
    if (!pts.has(e.pointerId)) {           // 沒按著：滑鼠游標的樣子
      if (e.pointerType !== 'mouse') return;
      hoverF = editMode ? furnAt(wx, wy) : null;
      cv.style.cursor = editMode ? (hoverF ? 'move' : 'grab') : petAt(wx, wy) || boardAt(wx, wy) || shelfAt(wx, wy) ? 'pointer' : 'grab';
      return;
    }
    pts.set(e.pointerId, [e.clientX, e.clientY]);
    if (!g) return;
    if (g.mode === 'pinch' && pts.size === 2) {      // 兩指：縮放＋移動（選中時也可以，看別的地方）
      const [a, b] = [...pts.values()], d = Math.hypot(a[0] - b[0], a[1] - b[1]);
      const r = cv.getBoundingClientRect(), mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2;
      if (d / g.d0 > 1.35 || d / g.d0 < .74) {
        setZoom(cam.z + (d > g.d0 ? 1 : -1), mx - r.left, my - r.top);
        Object.assign(g, { d0: d, mx, my, cx: cam.x, cy: cam.y });
      } else {
        cam.x = g.cx - (mx - g.mx) / cam.z; cam.y = g.cy - (my - g.my) / cam.z; clampCam();
        if (Math.hypot(mx - g.mx, my - g.my) > 8 && sheetPet) sheetPet.free = true;   // 自己移開了：不要再把鏡頭拉回那隻
      }
      return;
    }
    const moved = Math.hypot(e.clientX - g.sx, e.clientY - g.sy);
    if (g.mode === 'down' && moved > (g.mouse ? 4 : 8)) {
      clearTimeout(g.lp);
      const sel = focusedPet();
      if (g.pet && g.mouse) startCarry(g.pet);        // 滑鼠：按著毛孩一拖就拎起來
      else if (sel && !g.mouse) { g.mode = 'stroke'; g.pet = sel; }   // 選中時：哪裡滑都是順毛那隻
      else g.mode = 'pan';                             // 平常：滑一律是移動畫面
    }
    if (g.mode === 'pan') {
      cam.x = g.cx - (e.clientX - g.sx) / cam.z; cam.y = g.cy - (e.clientY - g.sy) / cam.z; clampCam();
      cv.style.cursor = 'grabbing';
    } else if (g.mode === 'stroke') {
      g.ax += e.clientX - g.lx; g.ay += e.clientY - g.ly; g.lx = e.clientX; g.ly = e.clientY;
      if (Math.hypot(g.ax, g.ay) > 26) { stroke(g.pet, g.ax, g.ay); g.ax = g.ay = 0; }
    } else if (g.mode === 'carry') {
      // 手指：抓住頭頂、身體掛在手指下方（2026-10-14 使用者「拎起來的樣子應該是要在下方」），影子在腳下＝放手落下的地方
      // 滑鼠：毛孩就在游標下（跟原本一樣）
      // 手指下面先留 28 螢幕像素，再放說話泡泡（約 24px 高），泡泡下面才是頭（使用者 iPhone 實測：「還要再下來一點」「距離要包含寵物的對話框」）
      // 泡泡的底＝headY() - 3（見 loop），headY() = y - h * .78
      g.pet.x = clamp(wx, FLOOR.x0, FLOOR.x1);
      g.pet.y = g.mouse ? clamp(wy + g.pet.d.h * .55, WALL_Y, H) : wy + (28 + 24) / cam.z + 3 + g.pet.d.h * .78;
      g.pet.landY = clamp(g.pet.y, FLOOR.y0, FLOOR.y1);
      cv.style.cursor = 'grabbing';
    } else if (g.mode === 'move') {
      g.f.x = clamp(wx + g.fdx, 16, W - 16); g.f.y = clamp(wy + g.fdy, WALL_Y + 6, H - 2);
    }
  });
  function drop() {
    const pet = g.pet; pet.held = false;
    pet.y = pet.landY != null ? pet.landY : clamp(pet.y, FLOOR.y0, FLOOR.y1); pet.landY = null;
    pet.set(['crouch', 'sit'], 2); pet.until = focusedPet() === pet ? Infinity : now + 900; pet.busy = false;
  }
  // 現在選中的那隻（手機、面板開著、牠在家裡）
  const focusedPet = () => isPhone && sheetPet && sheetPet.room && pets.includes(sheetPet.room) ? sheetPet.room : null;
  function endPointer(e) {
    pts.delete(e.pointerId);
    if (!g) return;
    if (g.mode === 'pinch') { if (pts.size === 0) g = null; return; }
    clearTimeout(g.lp);
    if (g.mode === 'down' && performance.now() - g.t < 450) {    // 點一下：點毛孩＝摸一下＋選中；點空白＝取消選中
      const [bx, by] = toWorld(g.sx, g.sy);
      if (g.pet) { petPet(g.pet); if (!focusedPet() || focusedPet() !== g.pet) openSheet(g.pet.p); }
      else if (!editMode && boardAt(bx, by) && window.DCMail) { closeSheet(); DCMail.openBoard(); }
      else if (!editMode && shelfAt(bx, by)) { closeSheet(); toast(isPhone ? `紀念品 ${souvCount()}／7，口袋頁有圖鑑` : `紀念品 ${souvCount()}／7，手機帶出門撿`); }
      else { closeSheet(); if (editMode) picked = null; }
    } else if (g.mode === 'carry') drop();
    if (e.pointerType === 'mouse') cv.style.cursor = 'grab';
    g = null;
  }
  cv.addEventListener('pointerup', endPointer);
  cv.addEventListener('pointercancel', endPointer);
  stage.addEventListener('wheel', e => {
    e.preventDefault();
    const r = cv.getBoundingClientRect();
    if (Math.abs(e.deltaY) > 4) setZoom(cam.z + (e.deltaY < 0 ? 1 : -1), e.clientX - r.left, e.clientY - r.top);
  }, { passive: false });
  $('zoomIn').onclick = () => setZoom(cam.z + 1, stage.clientWidth / 2, stage.clientHeight / 2);
  $('zoomOut').onclick = () => setZoom(cam.z - 1, stage.clientWidth / 2, stage.clientHeight / 2);
  // 操作提示（製作規則第 2 節）：手機一行 15 字內、照裝置用詞；第一次操作過就不再出現（記在瀏覽器）
  $('hint').textContent = coarse ? '點毛孩選牠，再滑動幫牠順毛' : '拖曳移動・滾輪縮放・點毛孩摸摸';
  let hintSeen = false;
  try { hintSeen = localStorage.getItem('deskcat_hint_seen') === '1'; } catch (_) { /* 不能存就每次顯示 */ }
  if (hintSeen) $('hint').style.opacity = 0;
  const hintTimer = setTimeout(hideHint, 8000);
  function hideHint() {
    clearTimeout(hintTimer); $('hint').style.opacity = 0;
    try { localStorage.setItem('deskcat_hint_seen', '1'); } catch (_) { /* 存不了就算了 */ }
  }

  // ---------- 畫面迴圈 ----------
  let last = performance.now();
  function loop(t) {
    now = t; const dt = Math.min(.05, (t - last) / 1000); last = t;
    door.open += Math.sign(door.want - door.open) * Math.min(Math.abs(door.want - door.open), dt * 3);
    if (!host.hidden && viewW) {
      const tod = timeOfDay();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.fillStyle = '#1a140f'; ctx.fillRect(0, 0, viewW, viewH);
      ctx.setTransform(1, 0, 0, 1, -Math.round(cam.x), -Math.round(cam.y));
      drawWall(tod, t); drawFloor(tod);
      pets.forEach(p => p.step(dt));
      const things = [
        ...furn.map(f => ({ y: f.y, draw: () => f.k.draw(f.x, f.y, f.flip) })),
        ...pets.map(p => ({ y: p.held ? H + 1 : p.y, draw: () => { if (editMode) ctx.globalAlpha = .45; p.draw(); ctx.globalAlpha = 1; } })),
      ].sort((a, b) => a.y - b.y);
      things.forEach(o => o.draw());
      drawPicked();
      pets.forEach(p => drawHearts(p, dt));
      if (sheetPet && sheetPet.room && !sheetPet.free && pets.includes(sheetPet.room)) keepVisible(sheetPet.room);
      shade(tod);
    }
    if (window.DCPocket && !$('view-pocket').hidden) DCPocket.frame(dt, t);
    const tnow = performance.now();
    for (let i = bubbles.length - 1; i >= 0; i--) {   // 說話泡泡跟著毛孩（房間用鏡頭換算；口袋的毛孩有自己的 scr()）
      const b = bubbles[i];
      if (tnow > b.until || b.pet.gone) { b.el.remove(); bubbles.splice(i, 1); continue; }
      if (b.hint) {                         // 牠轉身、換姿勢時提示跟著換方向
        b.el.classList.toggle('to-right', !!b.pet.flip); b.el.classList.toggle('to-left', !b.pet.flip);
        b.el.style.transform = hintTransform(b.pet);
      }
      let wx = b.pet.x, wy = b.pet.headY() - 3, dy = 0;
      if (b.hint) { [wx, wy] = hintAnchor(b.pet); dy = -33; }            // 元素裡箭頭中線在 33px
      else if (bubbles.some(h => h.hint && h.pet === b.pet)) dy = -34;    // 提示在頭上時，說話泡泡往上讓開
      const [l, tp] = b.pet.scr ? b.pet.scr(wy, wx) : [(wx - cam.x) * cam.z, (wy - cam.y) * cam.z];
      b.el.style.left = l + 'px'; b.el.style.top = tp + dy + 'px';
    }
    requestAnimationFrame(loop);
  }
  function shade(tod) {
    if (tod !== 'night' && tod !== 'evening') return;
    ctx.save();
    ctx.globalCompositeOperation = 'multiply';
    ctx.fillStyle = tod === 'night' ? '#6a68a0' : '#dcbcab'; ctx.fillRect(0, 0, W, H);
    ctx.globalCompositeOperation = 'lighter';
    const lamp = furn.find(f => f.kind === 'lamp');
    if (lamp) {
      const gr = ctx.createRadialGradient(lamp.x, lamp.y - 40, 4, lamp.x, lamp.y + 10, 110);
      gr.addColorStop(0, tod === 'night' ? 'rgba(255,214,140,.5)' : 'rgba(255,214,140,.22)'); gr.addColorStop(1, 'rgba(255,214,140,0)');
      ctx.fillStyle = gr; ctx.fillRect(lamp.x - 130, lamp.y - 140, 260, 260);
    }
    ctx.restore();
  }

  // ---------- 介面 ----------
  let toastTimer = 0;
  // 提示訊息（2026-10-14 健檢：回饋要出現在剛剛操作的地方，不是畫面正上方；停 3.5 秒；可以附一個解決的按鈕）
  //   家、面板開著 → 面板裡（按鈕上面）；家、面板關著 → 下方工具列的提示列；其他頁 → 下方、分頁列上面
  //   都放在房間／場景外面，不蓋住毛孩
  function toast(msg, action) {
    clearTimeout(toastTimer);
    const home = !$('view-home').hidden, sheetOpen = !$('sheet').hidden;
    const el = home ? (sheetOpen ? $('sheetMsg') : $('hint')) : $('toast');
    for (const x of [$('sheetMsg'), $('toast')]) if (x !== el) x.hidden = true;
    $('hint').classList.remove('msg');
    el.textContent = msg;
    if (action) {
      const b = document.createElement('button'); b.className = 'btn main'; b.textContent = action[0];
      b.onclick = () => { done(); action[1](); }; el.appendChild(b);
    }
    el.hidden = false;
    if (el === $('hint')) { el.classList.add('msg'); el.style.opacity = 1; }
    const done = () => {
      clearTimeout(toastTimer);
      if (el === $('hint')) { el.classList.remove('msg'); el.textContent = ''; } else el.hidden = true;
    };
    toastTimer = setTimeout(done, action ? 6000 : 3500);
  }
  // 電腦有沒有開：電腦每分鐘（有人在看時 5 秒）跟伺服器說一次話（server/012 dc_desk_poll）→ 3 分鐘沒說話＝電腦沒開
  const deskOn = () => !LIVE || (deskAt != null && Date.now() - deskAt < 3 * 60000);
  function doing(p) {
    if (p.pending === 'call_desk') return deskOn() ? '準備去上班' : '等電腦打開就去上班';
    if (p.pending === 'send_home') return deskOn() ? '準備回家' : '等電腦打開就回家';
    if (p.where === 'friend') return p.back ? `${p.friend || '好友'}家・住一晚（${p.back}回來）` : `在${p.friend || '好友'}家玩`;
    if (p.where === 'home') {
      const pet = pets.find(o => o.p === p), a = pet ? (pet.held ? 'held' : pet.anim) : 'sit';
      return { sleep: '在睡覺', walk: '走來走去', loaf: '縮成一團', groom: '在理毛', sit_wag: '搖尾巴', pant: '吐舌頭', sniff: '到處聞聞',
               knead: '踩踩', yawn: '打哈欠', tail_flick: '甩尾巴', nuzzle: '跟大家蹭蹭', eat: '在吃飯', inbox: '躲在紙箱裡',
               play_bow: '想玩球', held: '被你抱著', washface: '在洗臉' }[a] || '在家發呆';
    }
    if (p.where === 'desk' && !deskOn()) return '在桌面（電腦沒開）';
    return p.doing || '';
  }
  const foodBar = n => '🍖'.repeat(n) + '·'.repeat(3 - n);
  // more＝點毛孩打開的面板（多〔餵飯〕、在桌面的多〔摸摸〕）；「全家」名單只放搬家的按鈕（一列不要太高）
  function actions(p, more = false) {
    const b = [];
    const pc = !LIVE || deskAt != null || !SV.p74;   // P74：只有手機、電腦從來沒連過的帳號沒有〔去上班〕（沒有桌面可以去）
    if (p.where === 'home') { if (pc) b.push(['desk', '去上班', 'work']); if (isPhone) b.push(['pocket', '帶出門', 'pocket']); if (more) b.push(['bowl', '餵飯', 'feed']); }
    else if (p.where === 'desk') { if (more) b.push(['paw', '摸摸', 'pet'], ['bowl', '餵飯', 'feed']); b.push(['home', '叫回家', 'callhome', true]); }
    else if (p.where === 'pocket') b.push(['home', '放回家', 'callhome', true]);
    else if (p.where === 'friend') b.push(['home', '叫回家', 'callhome']);
    return b;
  }
  function act(p, what) {
    const pet = pets.find(o => o.p === p);
    if (what === 'pocket') { toPocket(p); return; }
    if (what === 'feed') { feed(p); return; }
    if (what === 'pet') {                    // 在桌面的：送一個摸摸給電腦（電腦上的牠冒愛心、說話）
      if (cooling(p, 'pet')) { toast(`${p.name}剛被摸過了`); return; }
      remote(p, 'pet', true); toast(LIVE && !deskOn() ? `電腦開了${p.name}就收到` : `摸摸送到桌面了`);
      return;
    }
    closeSheet();
    if (what === 'work' && pet) {
      if (!LIVE) { say(pet, line(pet, 'home_to_work')); leaveHome(pet, 'desk', `${p.name}去電腦桌面陪你了`); return; }
      // 伺服器：寫一筆「叫來上班」→ 電腦拿走、從螢幕邊走進來、改位置 → 這邊讀到位置變了才走出門（moved）
      order(p, 'call_desk').then(ok => {
        if (!ok) return;
        if (!deskOn()) { toast(`電腦沒開：開了${p.name}就去`); render(); return; }
        say(pet, line(pet, 'home_to_work')); pet.target = null; pet.busy = true;
        pet.walkTo(DOOR.x - 24, FLOOR.y0 + 4, () => { pet.flip = false; pet.set('sit', 1); pet.until = Infinity; });
        setTimeout(() => { if (p.pending === 'call_desk' && pets.includes(pet)) { pet.busy = false; pet.until = 0; } }, 60000);   // 等太久：先回去玩，電腦接到還是會去
        render();
      });
    } else if (what === 'callhome') {
      if (p.where === 'friend') { toast(`${p.name}吃完點心就回來`); return; }
      if (p.where === 'pocket') { backHome(p); return; }
      if (p.where === 'desk') {
        if (!LIVE) { toast(`${p.name}從電腦桌面回家了`); switchTab('home'); arriveHome(p); return; }
        order(p, 'send_home').then(ok => { if (ok) { toast(deskOn() ? `${p.name}要從螢幕邊走回來囉` : `電腦沒開：開了${p.name}就回家`); render(); } });
      }
    }
  }
  // 帶出門（家 → 口袋，口袋一次 1 隻）。instant＝在口袋頁直接挑（不演跳出去）。回傳成功沒有
  async function toPocket(p, instant = false) {
    const inPocket = HOME.pets.find(q => q.where === 'pocket');
    if (inPocket && inPocket !== p) {          // 不能帶時，就在按的地方說明，並給「換成帶這隻」
      toast(`一次帶一隻：${inPocket.name}還在外面`, [`換成帶${p.name}`, async () => { if (await backHome(inPocket)) setTimeout(() => toPocket(p), 700); }]);
      return false;
    }
    if (LIVE && !await call(SV.petMove(p.id, 'pocket'))) return false;
    const pet = pets.find(o => o.p === p);
    p.placeAt = Date.now();
    if (instant || !pet) {
      if (pet) { pets.splice(pets.indexOf(pet), 1); pet.gone = true; }
      p.where = 'pocket'; render(); return true;
    }
    closeSheet();
    say(pet, line(pet, 'pocket_go')); pet.target = null; pet.busy = true; pet.set('jump', 2); p.moving = true;
    setTimeout(() => { if (pets.includes(pet)) pets.splice(pets.indexOf(pet), 1); pet.gone = true; p.where = 'pocket'; p.moving = false; render(); toast(`${p.name}跟你出門了 🎒`); }, 900);
    return true;
  }
  // 口袋 → 家（從門走進來，帶著撿到的紀念品）
  async function backHome(p) {
    if (LIVE && !await call(SV.petMove(p.id, 'home'))) return false;
    switchTab('home'); arriveHome(p);
    return true;
  }
  // 餵飯：家裡的走去碗那邊吃；在桌面的送給電腦（電腦上的牠吃飯）。飽足由電腦算（伺服器下次讀回來）
  function feed(p) {
    if (cooling(p, 'feed')) { toast(`${p.name}剛吃過了`); return; }
    remote(p, 'feed', p.where === 'desk');
    p.food = 3; p.foodHold = Date.now() + 60000;
    const pet = pets.find(o => o.p === p), bowl = furn.find(f => f.k.spot === 'eat');
    if (!pet) { toast(LIVE && !deskOn() ? `電腦開了${p.name}就吃到` : `幫${p.name}在桌面放飯了`); render(); return; }
    closeSheet();
    if (bowl) {
      pet.busy = true; pet.target = null;
      pet.walkTo(bowl.x + (pet.x < bowl.x ? -16 : 16), bowl.y + 4, () => {
        pet.flip = pet.x > bowl.x; pet.set('eat', 3); pet.until = now + 4000; pet.busy = false; addHearts(pet, 2);
      });
    }
    toast(`${p.name}去吃飯了`);
  }
  // ---------- 伺服器同步（P66 M4；server.js） ----------
  // 讀：dc_pets_mine 每 10 秒（畫面在背景就停；有待辦在等時 3 秒）。讀的時候伺服器記「有人在看」→ 電腦改成 5 秒問一次待辦。
  // 寫：摸摸、餵飯、叫來上班、叫回家＝dc_action_add（電腦拿走照做）；帶出門、放回家＝dc_pet_move（馬上換）。
  // 位置一律照伺服器的：讀到換地方了才演走出門／走進來（moved），按的那一刻只先走到門口等。
  let deskAt = null, booted = !LIVE, pullTimer = 0, pulling = false, netError = '';
  const COOL = { pet: 20000, feed: 60000 };   // 同一隻多久送一次（跟電腦 pet_sync.COOL 一樣：一直按不會一直加）
  const REASON = { pocket_full: '口袋已經有一隻了', not_home: '牠現在不在家', no_pet: '伺服器找不到牠', too_many: '待辦太多了，等一下', invalid: '這個沒辦法做' };
  const RESULT = { full: '桌面滿了', away: '牠出門了', gone: '電腦找不到牠', busy: '牠在忙', lost: '電腦沒回應', expired: '電腦一天沒開' };
  const cooling = (p, kind) => Date.now() - (p[kind + 'At'] || 0) < COOL[kind];
  const pend = new Map();                    // 等電腦照做的待辦：id → {p, kind}
  let actTimer = 0;
  async function call(pr) {                  // 叫伺服器；不行就在按的地方說為什麼，回傳 null
    try {
      const r = await pr;
      if (r && r.ok === false) { toast(REASON[r.reason] || '沒辦法做'); pull(); return null; }
      return r || {};
    } catch (e) { toast(e.message || '連不上伺服器'); return null; }
  }
  function remote(p, kind, loud = false) {   // 摸摸、餵飯：送給電腦（在家、在口袋的也送：電腦幫牠加心情、飽足）
    if (cooling(p, kind)) return;
    p[kind + 'At'] = Date.now();
    if (!LIVE || !p.id) return;
    SV.actionAdd(p.id, kind).then(r => {
      if (r && r.ok && loud) { pend.set(r.id, { p, kind }); watchActions(); }
      else if (r && r.ok === false && loud) toast(REASON[r.reason] || '沒辦法做');
    }).catch(e => { if (loud) toast(e.message); });
  }
  async function order(p, kind) {           // 叫來上班、叫回家
    const r = await call(SV.actionAdd(p.id, kind));
    if (!r) return false;
    p.pending = kind; pend.set(r.id, { p, kind }); watchActions(); schedulePull(3000);
    return true;
  }
  function watchActions() { if (!actTimer && pend.size) actTimer = setTimeout(checkActions, 4000); }
  async function checkActions() {
    actTimer = 0;
    if (!pend.size || document.hidden || SV.mode !== 'live') return;
    let list = null;
    try { list = await SV.actionsMine(); } catch (_) { /* 等下一次 */ }
    for (const a of list || []) {
      const w = pend.get(a.id);
      if (!w || a.status === 'pending' || a.status === 'taken') continue;
      pend.delete(a.id); actionDone(w, a.status === 'expired' ? 'expired' : a.result);
    }
    watchActions();
  }
  function actionDone({ p, kind }, res) {
    if (kind === 'call_desk' || kind === 'send_home') {
      if (res === 'ok' || res === 'already') { p.expect = Date.now() + 60000; schedulePull(1000); return; }   // 電腦照做了：位置改了就演
      if (p.pending === kind) p.pending = null;
      const pet = pets.find(o => o.p === p);
      if (pet && !p.moving) { pet.busy = false; pet.until = 0; }   // 在門口等的：回去玩
      toast(`${p.name}${kind === 'call_desk' ? '沒去成' : '沒回來'}：${RESULT[res] || '電腦沒照做'}`);
      render();
    } else if (res === 'ok' && p.where === 'desk') toast(kind === 'feed' ? `${p.name}在桌面吃到飯了` : `${p.name}在桌面收到摸摸了`);
  }

  function schedulePull(ms) {
    clearTimeout(pullTimer);
    pullTimer = SV.mode === 'live' && !document.hidden ? setTimeout(pull, ms) : 0;
  }
  const fast = () => pend.size > 0 || HOME.pets.some(p => p.expect > Date.now());
  async function pull() {
    clearTimeout(pullTimer); pullTimer = 0;
    if (SV.mode !== 'live' || document.hidden || pulling) return;
    pulling = true;
    try {
      merge(await SV.petsMine()); netError = '';
      if (!souvReady || souvWaiting()) souvSync();   // 紀念品：剛登入／剛打開先對一次；有還沒送出去的就補送
      if (!homeReady || homeWaiting()) homeSync();   // 家具（P78）：同上；佈置還沒傳上去的補送
    } catch (e) {
      if (!netError && !booted) toast(e.message || '連不上伺服器');
      netError = e.message || '連不上伺服器'; renderAccount();
    } finally {
      pulling = false;
      schedulePull(fast() ? 3000 : 10000);
    }
  }
  document.addEventListener('visibilitychange', () => { if (!document.hidden && SV.mode === 'live') { souvReady = false; homeReady = false; pull(); watchActions(); } });   // 回到畫面：紀念品、家具也再讀一次（別支手機可能加了、電腦可能買了）

  // 伺服器 0～100 → 畫面的 0～3（MOOD 表情、foodBar）
  const lvl = v => v == null ? 2 : v >= 75 ? 3 : v >= 50 ? 2 : v >= 25 ? 1 : 0;
  function backText(iso) {                   // 好友家回來的時間：「10:00」「明天 10:00」「10/18 10:00」
    if (!iso) return '';
    const d = new Date(iso), hm = d.toTimeString().slice(0, 5);
    const days = Math.round((new Date(d.toDateString()) - new Date(new Date().toDateString())) / 864e5);
    return days === 0 ? hm : days === 1 ? `明天 ${hm}` : `${d.getMonth() + 1}/${d.getDate()} ${hm}`;
  }
  function merge(r) {
    if (!r || !Array.isArray(r.pets)) return;
    deskAt = r.desk_at ? Date.parse(r.desk_at) : null;
    const uid = SV.user && SV.user.uid, seen = new Set(), moves = [];
    for (const s of r.pets) {
      if (!s || !s.cid) continue;
      seen.add(s.cid);
      let p = HOME.pets.find(q => q.id === s.cid);
      const fresh = !p;
      if (fresh) { p = { id: s.cid, found: [] }; HOME.pets.push(p); }
      const was = p.where, t = Date.now();
      Object.assign(p, {
        name: s.name || '毛孩', species: s.species === 'dog' ? 'dog' : 'cat', look: s.look || '', age: s.age,
        personality: s.personality || '普通',          // server/015：普通／黏人／高冷／貪吃／好動／膽小（空的＝電腦還沒傳）
        came_at: s.came_at || null, affection: s.affection ?? null,   // 015：來家裡的日子（面板「在一起第 N 天」）、親密 0～100
        friend: s.friend || '', back: backText(s.back_at), doing: s.doing_text || '',
        placeAt: s.place_at ? Date.parse(s.place_at) : null,
      });
      // 剛在這邊摸過、餵過：電腦還沒算進去之前，不要被舊的數字蓋回去
      p.mood = Math.max(lvl(s.mood), p.moodHold > t ? p.mood : 0);
      p.food = Math.max(lvl(s.food), p.foodHold > t ? p.food : 0);
      // 毛孩圖：有傳過的用牠自己的（下載好之前先用範例裡同花色的）
      p.spriteWant = s.sprite || '';
      if (!SPR.pets[p.sprite] || (p.spriteWant && p.sprite !== p.spriteWant)) p.sprite = SPR.pets[p.spriteWant] ? p.spriteWant : SPR.pets[p.look] ? p.look : '';
      if (p.spriteWant && !SPR.pets[p.spriteWant] && uid) {
        const want = p.spriteWant;
        SV.sprite(uid, want).then(info => {
          if (!info) return;
          SPR.pets[want] = info;
          if (p.spriteWant === want) { p.sprite = want; render(); }
        }).catch(e => console.warn('毛孩圖下載不了', want, e));
      }
      const place = ['home', 'desk', 'pocket', 'friend'].includes(s.place) ? s.place : 'desk';
      if (fresh) p.where = place;
      else if (place !== was && !p.moving) { p.where = place; moves.push([p, was]); }
    }
    for (const p of [...HOME.pets]) {        // 電腦刪掉的毛孩
      if (seen.has(p.id)) continue;
      HOME.pets.splice(HOME.pets.indexOf(p), 1);
      const pet = pets.find(o => o.p === p);
      if (pet) { pets.splice(pets.indexOf(pet), 1); pet.gone = true; }
    }
    if (!booted) {
      booted = true; spawnHome();
      const mine = r.pets.filter(s => s && s.sprite).map(s => [uid, s.sprite]);
      if (uid) SV.pruneSprites(mine);
      setTimeout(fromWidget, 600);            // 從 iPhone 小工具點進來的：摸那一隻
    } else {
      for (const p of HOME.pets) if (p.where === 'home' && !p.moving && !pets.some(o => o.p === p)) {   // 新的、在家卻不在房間的
        const [x, y] = freeSpot(), pet = new Pet(p, x, y); pet.set('sit', 1); pets.push(pet);
      }
      moves.forEach(([p, from]) => moved(p, from));
    }
    render(); renderAccount();
  }
  // 從 iPhone 小工具點進來（mobile/widget：網址 ?cid=編號&pet=名字&act=pet，2026-10-16 使用者「可以在手機上有按鍵摸摸牠」）：
  // 用編號找那一隻（015 起小工具有 cid；名字可能重複），舊的小工具只有名字就用名字
  // 在家的：鏡頭移過去、摸一下（冒愛心、說話）；在桌面、口袋的：送一個摸摸給電腦。網址上的參數用完就拿掉（重新整理不會再摸一次）
  function fromWidget() {
    const name = params.get('pet') || '', cid = params.get('cid') || '';
    if (!(name || cid) || params.get('act') !== 'pet') return;
    const q = new URLSearchParams(location.search); q.delete('pet'); q.delete('cid'); q.delete('act');
    history.replaceState(null, '', location.pathname + (q.toString() ? '?' + q : ''));
    const p = (cid && HOME.pets.find(x => x.id === cid)) || (name && HOME.pets.find(x => x.name === name));
    if (!p) { toast(`找不到${(name || '這隻').slice(0, 6)}`); return; }
    if (p.where === 'friend') { toast(`${p.name}在好友家玩`); return; }
    const pet = pets.find(o => o.p === p);
    if (pet) {
      switchTab('home'); lookAt(pet.x, pet.y - 20);
      setTimeout(() => petPet(pet), 400);
      return;
    }
    if (p.where === 'pocket') { switchTab('pocket'); if (window.DCPocket) setTimeout(() => DCPocket.petNow && DCPocket.petNow(), 500); }
    remote(p, 'pet', true);
    toast(p.where === 'desk' ? (deskOn() ? `摸摸送到桌面的${p.name}了` : `電腦開了${p.name}就收到`) : `摸摸${p.name}了`);
  }
  // 位置換了（電腦照做了、或在別的地方按的）：看得到牠走出門／走進來
  function moved(p, from) {
    const to = p.where, pet = pets.find(o => o.p === p && !o.gone);
    p.pending = null; p.expect = 0;
    if (to === 'home') {
      if (pet) return;
      const msg = { desk: `${p.name}從桌面回家了`, pocket: `${p.name}回家了`, friend: `${p.name}從好友家回來了` }[from];
      arriveHome(p); if (msg) setTimeout(() => toast(msg), 600);
      return;
    }
    if (from === 'home' && pet) {
      const msg = { desk: `${p.name}到電腦桌面了`, pocket: `${p.name}跟你出門了`, friend: `${p.name}去${p.friend || '好友'}家玩了` }[to];
      if ($('view-home').hidden) {            // 沒在看家（家的畫面不動）：直接換，不演走出門
        pets.splice(pets.indexOf(pet), 1); pet.gone = true; toast(msg); return;
      }
      p.where = 'home'; p.moving = true;     // 走到門口之前還算在家（leaveHome 走出去才改）
      leaveHome(pet, to, msg);
    }
  }
  // ---------- 登入、帳號 ----------
  // 沒登入：整個畫面是登入卡（這時候沒有毛孩，不會蓋住誰）。信箱 →〔寄驗證碼〕→ 驗證碼 →〔登入〕；
  // 〔先看範例〕（假資料）只有開發預覽有（SV.canFake），正式網址一律登入。
  // 「全家」頁上方一張帳號卡：登入的信箱、電腦多久前連過、〔登出〕；範例模式是〔登入〕。
  const reload = fake => {                   // 換模式一律重新整理（假資料、伺服器兩套資料不混在一起）
    SV.chooseFake(fake);
    const q = new URLSearchParams(location.search); q.delete('fake');
    location.href = location.pathname + (q.toString() ? "?" + q : "");
  };
  function agoText(t) {
    const m = Math.round((Date.now() - t) / 60000);
    return m < 1 ? '剛剛' : m < 60 ? `${m} 分鐘前` : m < 24 * 60 ? `${Math.round(m / 60)} 小時前` : `${Math.round(m / 1440)} 天前`;
  }
  function renderAccount() {
    const box = $('acct');
    if (!box) return;
    box.innerHTML = '';
    const info = document.createElement('div'), b = document.createElement('div'), btn = document.createElement('button');
    b.className = 'acct-sub'; btn.className = 'btn';
    if (!LIVE) {
      info.textContent = '現在是範例（假資料）';
      b.textContent = '登入後看你自己的毛孩';
      btn.textContent = '登入'; btn.onclick = () => reload(false);
    } else {
      info.textContent = SV.user ? `已登入 ${SV.user.email || ''}` : '還沒登入';
      b.textContent = netError ? `⚠ ${netError}`
        : deskAt == null ? (SV.p74 ? '只用手機養（有電腦版也可以一起玩）' : '電腦還沒連過（要新版 DeskCat）')
        : deskOn() ? `電腦開著（${agoText(deskAt)}連過）` : `電腦沒開（上次 ${agoText(deskAt)}）`;
      btn.textContent = '登出';
      btn.onclick = async () => { btn.disabled = true; await SV.logout(); reload(false); };
    }
    const txt = document.createElement('div'); txt.className = 'acct-txt'; info.className = 'acct-main';
    txt.append(info, b);
    if (dev || SV.which !== 'release') { const s = document.createElement('div'); s.className = 'acct-sub'; s.textContent = `伺服器：${SV.name}`; txt.append(s); }
    if (LIVE && SV.user && SV.p74) {        // 刪除帳號（P74 M1）：先在下面問一次
      const col = document.createElement('div'), del = document.createElement('button');
      col.className = 'acct-btns'; del.className = 'btn small'; del.textContent = '刪除帳號';
      del.onclick = () => { $('acctDel').hidden = false; $('acctDelNo').focus(); };
      col.append(btn, del); box.append(txt, col);
    } else box.append(txt, btn);
    if (window.DCNotify) DCNotify.render();   // 通知卡（notify.js，P74 M4）
  }
  $('acctDelNo').onclick = () => { $('acctDel').hidden = true; };
  $('acctDelYes').onclick = async () => {
    const b = $('acctDelYes'); b.disabled = true;
    try { await SV.accountDelete(); $('acctDel').hidden = true; reload(false); }
    catch (e) { toast(e.status === 404 ? '伺服器還沒準備好刪帳號' : e.message || '刪不了，等一下再試'); }
    finally { b.disabled = false; }
  };
  function showLogin(msg = '') {
    const box = $('login');
    box.hidden = false; document.body.classList.add('login-open');
    $('loginServer').textContent = SV.which === 'release' && !dev ? '' : `伺服器：${SV.name}`;
    if (SV.p74) document.querySelector('#login .note').textContent = '有電腦版 DeskCat 就用同一個帳號；沒有也能開新的';
    // 從主畫面的網頁 App 打開：iPhone 跟 Safari 分開記登入 → 要再登入一次（2026-10-17 使用者：加到主畫面又要跳去網頁打 Gmail）。
    // 這時候信箱驗證碼放最上面（不用跳去 Google 網頁、一直在這個畫面裡），Google 放下面。iOS 26 加到主畫面預設就是網頁 App，網頁改不了預設
    const inApp = navigator.standalone === true || matchMedia('(display-mode: standalone)').matches;
    $('loginApp').hidden = !inApp;
    if (inApp && !box.dataset.appOrder) {
      box.dataset.appOrder = '1';
      $('loginGoogle').before($('loginEmailForm'), $('loginCodeForm'), document.querySelector('.login-or'));
      document.querySelector('.login-or').textContent = '或用 Google 登入';
    }
    const say = (t, bad) => { $('loginMsg').textContent = t; $('loginMsg').classList.toggle('bad', !!bad); };
    say(msg, !!msg);
    let email = '';
    try { email = localStorage.getItem('deskcat_login_email') || ''; } catch (_) { /* 不記也沒關係 */ }
    $('loginEmail').value = email;
    const step = code => { $('loginEmailForm').hidden = code; $('loginCodeForm').hidden = !code; $('loginNew').hidden = true; (code ? $('loginCode') : $('loginEmail')).focus(); };
    async function send(create) {            // 寄驗證碼；create＝開新帳號（P74 M1：沒有帳號的信箱，問過才開）
      const btn = create ? $('loginNew') : $('loginSend'); btn.disabled = true; say('寄信中…');
      try {
        await SV.sendCode(email, create);
        try { localStorage.setItem('deskcat_login_email', email); } catch (_) { /* 不記也沒關係 */ }
        $('loginSentTo').textContent = create ? `開新帳號：驗證碼寄到 ${email}` : `驗證碼寄到 ${email}`;
        $('loginCode').value = ''; step(true); say('收信，把驗證碼打在上面');
      } catch (err) {
        if (err.code === 'no_account' && !create && SV.p74) { say('這個信箱還沒有帳號', true); $('loginNew').hidden = false; }
        else if (err.code === 'no_account') say('這個信箱還沒有帳號：先在電腦版 DeskCat 登入', true);
        else say(err.message, true);
      } finally { btn.disabled = false; }
    }
    $('loginEmailForm').onsubmit = async e => {
      e.preventDefault();
      email = $('loginEmail').value.trim();
      if (!/^\S+@\S+\.\S+$/.test(email)) { say('信箱格式不對', true); return; }
      await send(false);
    };
    $('loginNew').onclick = () => send(true);
    $('loginEmail').oninput = () => { $('loginNew').hidden = true; };
    $('loginCodeForm').onsubmit = async e => {
      e.preventDefault();
      const code = $('loginCode').value.replace(/\D/g, '');
      if (code.length < 6) { say('驗證碼是 6 位以上的數字', true); return; }
      const btn = $('loginGo'); btn.disabled = true; say('登入中…');
      try {
        await SV.verify(email, code);
        box.hidden = true; document.body.classList.remove('login-open');
        toast('登入了，正在找你的毛孩'); pull();
      } catch (err) { say(err.message, true); } finally { btn.disabled = false; }
    };
    $('loginBack').onclick = () => { step(false); say(''); };
    $('loginFake').hidden = !SV.canFake;       // 正式網址沒有〔先看範例〕：一律登入（2026-10-17 使用者）
    $('loginFake').onclick = () => reload(true);
    $('loginGoogle').onclick = () => {        // 整頁跳去 Google，選好帳號會跳回這一頁（server.js googleStart／googleDone）
      $('loginGoogle').disabled = true; say('打開 Google 中…');
      SV.googleStart().catch(err => { $('loginGoogle').disabled = false; say(err.message || '打不開 Google', true); });
    };
    step(false);
    if (SV.googleDone) {                      // 剛從 Google 跳回來：換登入資料
      $('loginGoogle').disabled = true; say('Google 登入中…');
      SV.googleDone.then(() => {
        box.hidden = true; document.body.classList.remove('login-open');
        toast('登入了，正在找你的毛孩'); pull();
      }).catch(err => { $('loginGoogle').disabled = false; say(err.message || 'Google 登入沒有完成', true); });
    }
  }
  SV.onExpired(() => { if (LIVE) location.reload(); });   // 登入不能用了（在別的地方登出…）：回到登入畫面
  // 在一起第幾天（server/015 came_at；假資料也有）：來家裡那天＝第 1 天，照這台手機的日期算。沒有＝null（電腦還沒傳）
  function togetherDays(p) {
    const t = p && p.came_at ? new Date(p.came_at) : null;
    if (!t || isNaN(t)) return null;
    const day = x => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
    return Math.max(1, Math.round((day(new Date()) - day(t)) / 864e5) + 1);
  }
  function withDays(el, p) {                 // 名字後面的小字「在一起第 N 天」
    const n = togetherDays(p);
    if (!n) return;
    const s = document.createElement('span'); s.className = 'days'; s.textContent = `在一起第 ${n} 天`; el.append(s);
  }
  function openSheet(p) {
    drawAvatar($('sheetAvatar'), p);
    $('sheetName').textContent = `${p.name}　${MOOD[p.mood]}`; withDays($('sheetName'), p);
    setLabel($('sheetInfo'), WHERE[p.where].icon, `${doing(p)}　飽足 ${foodBar(p.food)}`);
    const box = $('sheetBtns'); box.innerHTML = '';
    for (const [ic, label, what, main] of actions(p, true)) {
      const btn = document.createElement('button'); btn.className = 'btn' + (main ? ' main' : ''); setLabel(btn, ic, label);
      btn.onclick = () => act(p, what); box.appendChild(btn);
    }
    $('sheet').hidden = false; document.body.classList.add('sheet-open');
    const pet = pets.find(o => o.p === p);   // 面板開著＝選中：牠停在原地、鏡頭對著牠
    const prevZoom = sheetPet ? sheetPet.prevZoom : cam.z;
    if (sheetPet && sheetPet.room && sheetPet.room !== pet) release(sheetPet.room);   // 換選中別隻：前一隻放開
    sheetPet = { p, room: pet || null, prevZoom, free: false };
    $('sheetTip').hidden = !(isPhone && pet);
    if (pet) {
      pet.target = null; pet.after = null; pet.until = Infinity; if (pet.anim === 'walk') pet.set('sit', 1);
      if (isPhone) {                          // 手機：放大對準牠，提示順毛方向（摸對一次才消失）
        setZoom(Math.min(cam.zMax, cam.zMin + 1), stage.clientWidth / 2, stage.clientHeight / 2);
        lookAt(pet.x, pet.y - pet.d.h / 2);
        strokeHint(pet, 60000);
      }
    }
  }
  let sheetPet = null;
  function release(pet) {                     // 不再選中：可以自己走動，提示收起來
    if (pet.until === Infinity) pet.until = now + 1500;
    bubbles.filter(b => b.pet === pet && b.hint).forEach(b => { b.until = 0; });
  }
  function closeSheet() {
    $('sheet').hidden = true; document.body.classList.remove('sheet-open');
    if (sheetPet) {
      if (sheetPet.room) release(sheetPet.room);
      if (isPhone && sheetPet.room && sheetPet.prevZoom !== cam.z) setZoom(sheetPet.prevZoom, stage.clientWidth / 2, stage.clientHeight / 2);
    }
    sheetPet = null;
  }
  $('sheetClose').onclick = closeSheet;

  let adoptAsked = false;                    // 這次開著已經自動打開過領養畫面（關掉就不再自己跳出來）
  function render() {
    const order = ['home', 'pocket', 'desk', 'friend'];
    const list = [...HOME.pets].sort((a, b) => order.indexOf(a.where) - order.indexOf(b.where));
    const strip = $('strip'); strip.innerHTML = '';
    for (const p of list) {
      const b = document.createElement('button'); b.className = 'av' + (p.where === 'home' ? '' : ' away');
      b.title = `${p.name}：${WHERE[p.where].label}`;
      const c = document.createElement('canvas'); drawAvatar(c, p); b.append(c);
      const w = document.createElement('span'); w.className = 'where'; if (p.where !== 'home') w.append(icon(WHERE[p.where].icon)); b.append(w);
      const n = document.createElement('span'); n.className = 'nm'; n.textContent = p.name; b.append(n);
      b.onclick = () => { const pet = pets.find(o => o.p === p); if (pet) lookAt(pet.x, pet.y - 20); openSheet(p); };
      strip.appendChild(b);
    }
    const ul = $('familyList'); ul.innerHTML = '';
    if (LIVE && booted && !list.length && !SV.p74) {   // P74 還沒上的正式網址：舊的說法
      const li = document.createElement('li'); li.className = 'empty';
      li.textContent = '還沒有毛孩：打開電腦版 DeskCat（新版），毛孩就會傳上來';
      ul.appendChild(li);
    } else if (LIVE && booted && !list.length) {   // P74：沒有電腦也能在手機建立
      const li = document.createElement('li'); li.className = 'empty';
      li.textContent = '還沒有毛孩：在這裡領養一隻（有電腦版的話，打開電腦版也會傳上來）';
      const b = document.createElement('button'); b.className = 'btn main'; b.textContent = '領養毛孩';
      b.onclick = () => window.DCAdopt && DCAdopt.open();
      li.append(document.createElement('br'), b);
      ul.appendChild(li);
      if (!adoptAsked && window.DCAdopt) { adoptAsked = true; DCAdopt.open(); }   // 新帳號第一次：直接打開領養畫面
    }
    for (const p of list) {
      const li = document.createElement('li');
      const c = document.createElement('canvas'); drawAvatar(c, p);
      const mid = document.createElement('div');
      mid.innerHTML = '<div class="n"></div><div class="s"></div><div class="s"></div>';
      mid.children[0].textContent = `${p.name} ${MOOD[p.mood]}`; withDays(mid.children[0], p);
      setLabel(mid.children[1], WHERE[p.where].icon, WHERE[p.where].label);
      mid.children[2].textContent = `${doing(p)}　${foodBar(p.food)}`;
      const bx = document.createElement('div'); bx.className = 'b';
      for (const [ic, label, what, main] of actions(p)) {
        const btn = document.createElement('button'); btn.className = 'btn' + (main ? ' main' : ''); setLabel(btn, ic, label);
        btn.onclick = () => act(p, what); bx.appendChild(btn);
      }
      li.append(c, mid, bx); ul.appendChild(li);
    }
    if (window.DCPocket) DCPocket.render();
  }

  function switchTab(tab) {
    document.querySelectorAll('.tabs button').forEach(b => b.classList.toggle('on', b.dataset.tab === tab));
    for (const v of ['home', 'family', 'pocket', 'mail']) $('view-' + v).hidden = v !== tab;
    $('toast').hidden = true;                // 上一頁的提示不帶到這一頁（會蓋到家的工具列）
    closeSheet();
    if (tab === 'home') requestAnimationFrame(fit); else render();
    if (tab === 'pocket' && window.DCPocket) DCPocket.show();
    if (tab === 'mail' && window.DCMail) DCMail.show();
  }
  document.querySelectorAll('.tabs button').forEach(b => { b.onclick = () => switchTab(b.dataset.tab); });

  function tick() { $('clock').textContent = `${TIME_LABEL[timeOfDay()]} ${new Date().toTimeString().slice(0, 5)}`; }
  // 手機＝手機版（直版版面），電腦＝網頁版（橫版，分頁列在左邊）：只照「是不是手機（觸控）」，不照視窗大小、不照手機直拿橫拿
  // （製作規則第 3 節、裝置規格第 6 節；2026-10-20 使用者：「嚴格遵守手機版的介面跟或者是網頁版」，以前手機橫拿會變成網頁版的樣子）
  function layout() { document.body.classList.toggle('vertical', isPhone); }
  const relayout = () => { layout(); requestAnimationFrame(fit); };
  addEventListener('resize', relayout);
  addEventListener('orientationchange', () => setTimeout(relayout, 200));   // iPhone 轉向時 resize 有時候晚一點才來
  matchMedia('(orientation: portrait)').addEventListener('change', relayout);
  function setPhone(v) { isPhone = v; document.body.classList.toggle('is-phone', v); layout(); render(); requestAnimationFrame(fit); }

  if (dev) {                                // 開發用：假資料的切換
    const d = $('dev'); d.hidden = false;
    d.querySelector('b').onclick = () => d.classList.toggle('min');
    d.querySelectorAll('[data-time]').forEach(b => { b.onclick = () => { timeOverride = b.dataset.time; tick(); }; });
    $('devMode').textContent = LIVE ? '改看範例' : '改連伺服器';
    $('devMode').onclick = () => reload(!LIVE);
    $('devArrive').hidden = LIVE;
    $('devArrive').onclick = () => {
      const p = HOME.pets.find(q => q.where === 'desk');
      if (!p) { toast('桌面上沒有毛孩了'); return; }
      toast(`${p.name}從桌面螢幕邊走出去，回家了`); switchTab('home'); arriveHome(p);
    };
    $('devInfo2').onclick = showDeviceInfo;
    $('devPhone').onclick = () => { setPhone(!isPhone); toast(isPhone ? '現在是手機：多了口袋、帶出門' : '現在是電腦瀏覽器：只有家'); };
  }
  // 給口袋（pocket.js）用的
  window.DC = {
    icon, setLabel,
    HOME, SKY, Pet, petInfo, isDog, animOf, img, drawAvatar, timeOfDay, rnd, clamp, rect, ellipse,
    petPet, stroke, strokeHint, say, line, togetherDays, drawHearts, addHearts, toast, render, switchTab, act, lookAt, toPocket, LIVE,
    get pets() { return pets; },
    furnitureOf: kind => furn.filter(f => f.kind === kind).pop() || null,
    setBoard: cards => { boardCards = cards; },
    souvenirs: () => ({ ...souv }),
    addFurniture(kind) {                   // 伴手禮放進家裡：門附近的空地，記下來（照帳號擺的時候存伺服器）
      if (!FURN[kind]) return null;
      if (extras.length >= 40) { toast('家裡放不下更多伴手禮了'); return null; }   // 伺服器最多收 40 個
      const [fx, fy] = freeSpot(), x = Math.round(clamp(fx, 400, 520)), y = Math.round(clamp(fy, FLOOR.y0 + 30, FLOOR.y1 - 20));
      const e = { kind, x, y }, f = { kind, x, y, k: FURN[kind], dx: x, dy: y, extra: e };
      extras.push(e); furn.push(f);
      saveLayout();
      return f;
    },
    useCtx: c => { ctx = c || roomCtx; },
    pullNow: () => pull(),                  // 領養完馬上讀一次（adopt.js）
    ctx: () => ctx,
    get isPhone() { return isPhone; },
  };
  // ---------- 加到主畫面（PWA） ----------
  const standalone = navigator.standalone === true || matchMedia('(display-mode: standalone)').matches;
  const isIOS = /iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  let installEvt = null;
  function showInstall() {                 // 「全家」頁的教學卡：還沒加到主畫面、手機、沒按過「不用了」才顯示
    let dismissed = false;
    try { dismissed = localStorage.getItem('deskcat_install_dismissed') === '1'; } catch (_) { /* 不能存就每次都顯示 */ }
    const show = isPhone && !standalone && !dismissed && (isIOS || installEvt);
    $('installCard').hidden = !show;
    $('installIos').hidden = !isIOS;
    $('installBtn').hidden = !installEvt;
  }
  addEventListener('beforeinstallprompt', e => { e.preventDefault(); installEvt = e; showInstall(); });   // Android Chrome：有安裝按鈕
  $('installBtn').onclick = async () => { if (!installEvt) return; installEvt.prompt(); await installEvt.userChoice; installEvt = null; showInstall(); };
  $('installClose').onclick = () => { try { localStorage.setItem('deskcat_install_dismissed', '1'); } catch (_) { /* 存不了就算了 */ } $('installCard').hidden = true; };
  // 離線快取：只在 https 正式網址（localhost、家裡 Wi-Fi 的 http 不用，開發時才不會一直看到舊檔案）
  if ('serviceWorker' in navigator && location.protocol === 'https:' && !/^(localhost|127\.|192\.168\.)/.test(location.hostname)) {
    navigator.serviceWorker.register('sw.js').catch(() => { /* 不能用就算了，網頁照常 */ });
  }

  // ---------- 版本檢查、裝置資訊（mobile/裝置規格.md；2026-10-15 使用者：「手機地毯還是飛起來的…徹查一下分別的裝置規格」） ----------
  function builds() {                     // 每個檔的版本戳記（mobile/tools/bump.py 一起加 1）
    const b = { ...(window.DC_BUILD || {}) };
    b['app.css'] = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--build'), 10) || null;
    return b;
  }
  const BUILD_FILES = ['index.html', 'app.css', 'lines.js', 'server.js', 'app.js', 'pocket.js', 'trip.js', 'scenes.js', 'mail.js', 'parts.js', 'adopt.js', 'notify.js', 'outdoor.js', 'fake/fake_data.js', 'fake/fake_mail.js'];
  function staleFiles() {                 // 跟 index.html 不一樣、或根本沒有戳記的＝手機拿到舊檔（地毯飛起來那次：fake_data.js 是舊的）
    const b = builds(), want = b['index.html'];
    return BUILD_FILES.filter(k => b[k] !== want);
  }
  function deviceInfo() {
    const probe = document.createElement('div');
    probe.style.cssText = 'position:fixed;visibility:hidden;padding:env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left)';
    document.body.appendChild(probe);
    const cs = getComputedStyle(probe), safe = ['Top', 'Right', 'Bottom', 'Left'].map(s => parseInt(cs['padding' + s], 10) || 0);
    probe.remove();
    const dpr = window.devicePixelRatio || 1, cell = +(cam.z * dpr).toFixed(2), old = staleFiles(), keys = [];
    try { for (let i = 0; i < localStorage.length; i++) keys.push(localStorage.key(i)); } catch (_) { keys.push('（讀不到）'); }
    return [
      ['畫面（CSS 點）', `${innerWidth}×${innerHeight}（${innerWidth > innerHeight ? '橫拿' : '直拿'}）`],
      ['螢幕', `${screen.width}×${screen.height}`],
      ['像素比 DPR', +dpr.toFixed(3)],
      ['安全區域 上/右/下/左', safe.join(' / ')],
      ['房間每格', `${cam.z} 點＝${cell} 實體像素${Number.isInteger(cell) ? '' : '（不是整數，會有一點糊）'}`],
      ['房間顯示範圍', `${Math.round(viewW)}×${Math.round(viewH)} ／ 房間 ${W}×${H}`],
      ['觸控', `${coarse ? '是' : '否'}（最多 ${navigator.maxTouchPoints} 指）→ ${isPhone ? '手機版' : '電腦版'}`],
      ['加到主畫面', matchMedia('(display-mode: standalone)').matches || navigator.standalone ? '是' : '否'],
      ['網址', `${location.protocol}//${location.host}`],
      ['資料', LIVE ? `伺服器 ${SV.name}・${SV.mode === 'live' ? '已登入' : '沒登入'}・毛孩 ${HOME.pets.length} 隻` : '範例（假資料）'],
      ['家具', homeAcct ? `跟著帳號・${furn.length} 件${homeMem && homeMem.dirty ? '・還沒傳上去' : ''}` : '只存這台瀏覽器'],
      ['離線快取', navigator.serviceWorker && navigator.serviceWorker.controller ? '有（正式網址）' : '沒有'],
      ['檔案版本', BUILD_FILES.map(k => `${k} ${builds()[k] ?? '沒有'}`).join('、')],
      ['舊檔案', old.length ? `${old.join('、')}（關掉網頁再開一次）` : '沒有 ✔'],
      ['瀏覽器記的', keys.join('、') || '（沒有）'],
      ['瀏覽器', navigator.userAgent],
    ];
  }
  function showDeviceInfo() {
    let box = $('devInfo');
    if (!box) {
      box = document.createElement('section'); box.id = 'devInfo'; box.className = 'devinfo';
      box.setAttribute('role', 'dialog'); box.setAttribute('aria-label', '裝置資訊');
      document.body.appendChild(box);
    }
    const rows = deviceInfo();
    box.innerHTML = '<h3>裝置資訊</h3><dl></dl><div class="devinfo-btns"><button class="btn main" data-copy>複製</button><button class="btn" data-close>關閉</button></div>';
    const dl = box.querySelector('dl');
    for (const [k, v] of rows) { const dt = document.createElement('dt'), dd = document.createElement('dd'); dt.textContent = k; dd.textContent = v; dl.append(dt, dd); }
    box.querySelector('[data-close]').onclick = () => { box.hidden = true; };
    box.querySelector('[data-copy]').onclick = async () => {
      const text = rows.map(([k, v]) => `${k}：${v}`).join('\n');
      try { await navigator.clipboard.writeText(text); toast('複製好了，貼給 Claude'); } catch (_) { toast('不能複製：請截圖'); }
    };
    box.hidden = false;
  }

  window.__home = { cam, pets, furn, setZoom, lookAt, stroke, petPet, setEdit, setTime: t => { timeOverride = t; tick(); } };   // 測試用

  setPhone(isPhone);
  showInstall();
  spawnHome();
  fit(); lookAt(260, 120);
  render(); renderAccount(); tick(); setInterval(tick, 30000);
  setInterval(() => { if (!$('view-family').hidden) renderAccount(); }, 30000);   // 「電腦 3 分鐘前連過」跟著走
  if (SV.mode === 'login') showLogin(); else if (LIVE) pull();
  {                                       // ?tab=home／family／pocket／mail：從通知點進來（sw.js），打開那一頁（P74 M4）
    const t = params.get('tab');
    // 等全部檔案（mail.js、pocket.js 在 app.js 後面）載入完再切，不然信箱、口袋還沒準備好＝空白
    if (['home', 'family', 'mail'].includes(t) || (t === 'pocket' && isPhone)) document.addEventListener('DOMContentLoaded', () => switchTab(t));
  }
  addEventListener('load', () => {        // 全部檔案載入完再比（pocket.js、mail.js 在 app.js 後面才載入）
    const old = staleFiles();
    if (old.length) { console.warn('舊檔案：', old, builds()); setTimeout(() => toast('有舊的檔案沒更新：關掉網頁再開一次'), 900); }
    if (params.has('info')) showDeviceInfo();
  });
  Object.values(imgs).forEach(im => im.addEventListener('load', render, { once: true }));
  requestAnimationFrame(loop);
})();
