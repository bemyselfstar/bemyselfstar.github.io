// DeskCat 手機網頁「🎒 口袋」：毛孩跟你出門（只有手機有）。P66 新設計第 6 節：口袋、合照、順毛。
// 口袋＝毛孩跟你出門、在戶外（不是真的口袋）：直式滿版的戶外場景（城市、公園、步道；照時間換天空、天氣先手動選，不要求位置權限），功能是右下的懸浮按鈕。
// 合照：相機畫面疊上像素毛孩（可拖、放大、換姿勢、翻面），拍下來存到手機或分享；照片只留在手機、不上傳。
(window.DC_BUILD = window.DC_BUILD || {})['pocket.js'] = 59;   // 版本戳記（mobile/tools/bump.py 一起加 1；不一樣＝手機有舊檔）
(() => {
  'use strict';
  const D = window.DC, $ = id => document.getElementById(id);
  const { HOME, clamp } = D;

  // ---------- 口袋場景 ----------
  const pcv = $('pocketCv'), pctx = pcv.getContext('2d');
  let pet = null, scale = 4, PW = 120, PH = 200, weather = 'sun', since = Date.now() - 72 * 60000;
  const drops = Array.from({ length: 40 }, (_, i) => [(i * 37) % 200, (i * 53) % 120]);
  const pocketPet = () => HOME.pets.find(p => p.where === 'pocket');
  // 紀念品（2026-10-14 使用者選「口袋帶回紀念品」）：出門每 20 分鐘撿到一樣、一趟最多 3 樣；撿到什麼看天氣、時間（scenes.js 的 ITEMS）。
  // 撿到的時候東西出現在步道上（閃閃發亮），點一下收進包包（p.found）；〔放回家〕時帶回家擺上紀念品架（app.js bringSouvenirs）。
  // 撿過的（D.souvenirs()）跟著帳號存在伺服器（server/017，2026-10-17；app.js souvSync），這支手機只當暫存。
  const FIND_EVERY = 20, FIND_MAX = 3;
  let item = null, nextAt = 0;
  const outAt = () => pet.p.placeAt || since;   // 伺服器的 place_at 每次讀回來都會更新（剛帶出門時是這支手機的時間）
  const minsOut = () => (Date.now() - outAt()) / 60000;
  // 這一趟撿過的也記在這台（2026-10-18 BUG「口袋版一直撿到紀念品」，手機 36 版）：p.found 只在記憶體，iPhone 關掉 App 重開就變空的，
  // 出門時間照伺服器算還是很久 → 馬上又撿 3 樣（之前撿的沒帶回家就不見了）。同一隻、放進口袋的時間一樣（差 5 分鐘內）＝同一趟，拿回來。
  // 撿到東西至少要出門 20 分鐘，所以下一趟的時間一定差超過 5 分鐘，不會拿到上一趟（已經帶回家的）。
  const FOUND_KEY = 'deskcat_pocket_found_v1';
  function loadFound() {
    try {
      const s = JSON.parse(localStorage.getItem(FOUND_KEY) || 'null');
      return s && typeof s.cid === 'string' && Number.isFinite(s.at) && Array.isArray(s.found) ? s : null;
    } catch (_) { return null; }
  }
  function saveFound() {
    try { localStorage.setItem(FOUND_KEY, JSON.stringify({ cid: pet.p.id, at: outAt(), found: pet.p.found })); } catch (_) { /* 存不了：這次開著還是對的 */ }
  }
  const waiting = () => pet ? Math.min(FIND_MAX, Math.floor(minsOut() / FIND_EVERY)) - pet.p.found.length - (item ? 1 : 0) : 0;

  function sync() {                       // 口袋裡現在是哪一隻
    const p = pocketPet();
    if (!p) { if (pet) pet.gone = true; pet = null; return; }
    if (pet && pet.p === p) return;
    if (pet) pet.gone = true;
    pet = new D.Pet(p, PW / 2, Math.round(PH * .8));
    pet.placed = false;                   // 圖載入後照實際畫到的範圍再放一次（placeInPocket）
    pet.flip = false; pet.set('sit', 1); pet.until = performance.now() + 3000;
    pet.walking = false;
    pet.think = function () {             // 散步（2026-10-20）：走一陣子 → 停下來聞聞、坐一下 → 再走；撿到東西、被摸的時候坐著
      const now = performance.now();
      if (item || g.on) { this.walking = false; this.set('sit', 1); this.until = now + 2000; return; }
      if (!this.walking) { this.walking = true; this.flip = false; this.set('walk', this.dog() ? 8 : 7); this.until = now + D.rnd(7000, 15000); return; }
      this.walking = false;
      const a = this.dog() ? [['sniff', 3], ['sit_wag', 5], ['pant', 4], ['sit', 1]] : [['sit', 1], ['groom', 3], ['tail_flick', 3], ['sit_blink', 2]];
      const [n, f] = a[Math.floor(Math.random() * a.length)];
      this.set(n, f); this.until = now + D.rnd(2500, 5000);
    };
    pet.bubbleBox = $('pocketBubbles');
    pet.scr = (wy = pet.headY() - 3, wx = pet.x) => { const r = pcv.getBoundingClientRect(), b = $('pocketStage').getBoundingClientRect();
      return [r.left - b.left + wx * scale, r.top - b.top + wy * scale]; };
    const s = loadFound();
    // 伺服器：放進口袋的時間（place_at）；範例：出門 1 小時 12 分（＝已經可以撿 3 樣），重新整理還是同一趟
    since = p.placeAt || (s && s.cid === p.id && Date.now() - s.at < 6 * 3600000 ? s.at : Date.now() - 72 * 60000);
    p.found = p.found || []; item = null; nextAt = performance.now() + 1800;
    if (s && s.cid === p.id && Math.abs(s.at - (p.placeAt || since)) < 5 * 60000 && s.found.length > p.found.length)
      p.found = s.found.filter(k => typeof k === 'string' && (!window.DCScene || window.DCScene.ITEMS[k])).slice(0, FIND_MAX);
  }
  function fit() {                        // 滿版：放大倍數照毛孩大小挑（大約佔畫面寬的一半），畫布蓋滿整個畫面
    const box = $('pocketStage'), w = box.clientWidth, h = box.clientHeight;
    if (!w || !h || !pet) return;
    const d = D.petInfo(pet.p);
    scale = Math.max(2, Math.round(Math.min(w, h * .8) * .5 / d.w));
    PW = Math.ceil(w / scale); PH = Math.ceil(h / scale);
    const fabs = document.querySelector('.pocket-fabs').getBoundingClientRect();   // 毛孩站在懸浮按鈕左邊的空間，不跟按鈕重疊
    const free = fabs.width ? fabs.left - box.getBoundingClientRect().left - 8 : w;
    pet.x = Math.round(Math.min(w, free) / 2 / scale); pet.placed = false;
    pcv.width = PW; pcv.height = PH; pet.fitted = true;
    pcv.style.width = PW * scale + 'px'; pcv.style.height = PH * scale + 'px';
    pctx.imageSmoothingEnabled = false;
  }
  addEventListener('resize', () => { if (!$('view-pocket').hidden) fit(); });

  // 戶外（outdoor.js）：口袋＝毛孩跟你出門（2026-10-14 使用者「口袋版的意思是戶外，不是真的口袋」）。
  // 2026-10-20 使用者「感覺可以多種樣式，另外可以讓寵物有出門散步的感覺」：13 個場景（outdoor.js ORDER）每次出門隨機一個，
  // 散步＝毛孩在畫面左邊走、背景一層一層往後捲（遠的慢、近的快）；走一陣子會停下來聞聞、坐一下，摸牠、撿到東西也會停。
  const PATH_BOT = .88, FEET = .8;
  const WALK_V = 14;                       // 散步時步道每秒捲幾格（遊戲的像素）
  let scene = null, sceneKey = '', scroll = 0;
  let forceScene = new URLSearchParams(location.search).get('scene');   // 預覽、測試用：網址 &scene=beach…；window.__pocketScene('snow') 不用重新整理
  window.__pocketScene = n => { forceScene = n; };
  function sceneName() {                   // 這一趟在哪：照「哪一隻＋放進口袋的時間」挑（重新整理、關掉再開還是同一個）
    const s = `${pet.p.id}|${Math.round(outAt() / 60000)}`, O = window.DCOutdoor.ORDER;
    if (forceScene && O.includes(forceScene)) return forceScene;
    let h = 2166136261;
    for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619) >>> 0;
    return O[h % O.length];
  }
  function drawScene(dt, t) {
    const tod = D.timeOfDay(), c = D.ctx(), wet = weather === 'rain', night = tod === 'night', lit = night || tod === 'evening';
    const name = sceneName(), key = [name, tod, weather, PW, PH].join('|');
    if (key !== sceneKey) { scene = window.DCOutdoor.build(name, PW, PH, tod, weather); sceneKey = key; }
    if (pet.walking && !item && !g.on) scroll += WALK_V * dt;
    const glow = window.DCOutdoor.draw(c, scene, scroll, t);
    // 毛孩（整隻在步道上）
    pet.step(dt); pet.draw(); D.drawHearts(pet, dt);
    // 撿到的東西：毛孩前面、比牠的腳更靠近你的步道上（畫在毛孩前面，不會被擋住），一閃一閃
    if (item && window.DCScene) {
      window.DCScene.ITEMS[item.k].draw(c, item.x, item.y);
      const on = Math.floor(t / 350) % 2;
      [[-6, -11], [6, -9], [0, -14]].forEach(([dx, dy], i) => { if ((i + on) % 2) { D.rect(item.x + dx, item.y + dy - 1, 1, 3, '#fff6c8'); D.rect(item.x + dx - 1, item.y + dy, 3, 1, '#fff6c8'); } });
    }
    if (lit) {                               // 晚上：暗一點，路燈、燈籠、螢火蟲的光
      c.save(); c.globalCompositeOperation = 'multiply'; c.fillStyle = night ? '#7c7ab0' : '#e2c6b5'; c.fillRect(0, 0, PW, PH);
      c.globalCompositeOperation = 'lighter';
      for (const L of window.DCOutdoor.lightsOnScreen(scene, scroll)) {
        const gr = c.createRadialGradient(L.sx, L.y, 2, L.sx, L.y + (L.warm || L.col ? 0 : 32), L.r), col = L.col || (L.warm ? '255,150,110' : '255,214,140');
        gr.addColorStop(0, `rgba(${col},${night ? .5 : .2})`); gr.addColorStop(1, `rgba(${col},0)`);
        c.fillStyle = gr; c.fillRect(L.sx - L.r, L.y - L.r, L.r * 2, L.r * 2 + 40);
      }
      for (const [x, y, r] of glow) { const gr = c.createRadialGradient(x, y, 0, x, y, r); gr.addColorStop(0, 'rgba(220,255,140,.45)'); gr.addColorStop(1, 'rgba(220,255,140,0)'); c.fillStyle = gr; c.fillRect(x - r, y - r, r * 2, r * 2); }
      c.restore();
    }
    if (wet && !scene.snowy) {             // 雪地下雨＝下大雪（outdoor.js 的 fx），不畫雨
      const off = (t / 6) % PH;
      for (const [x, y] of drops) D.rect((x + off * .3) % PW, (y + off) % PH, 1, 3, 'rgba(200,220,255,.7)');
    }
  }
  function placeInPocket() {              // 腳踩在步道上：照坐姿圖實際有畫的最下面一列對齊（狗的圖上面有一段空白）
    const d = D.petInfo(pet.p), im = D.img(d.file);
    if (!(im.complete && im.naturalWidth)) return;
    const c = document.createElement('canvas'); c.width = d.w; c.height = d.h;
    const cc = c.getContext('2d'), [row] = d.anims[D.animOf(d, ['sit', 'idle'])];
    cc.drawImage(im, 0, row * d.h, d.w, d.h, 0, 0, d.w, d.h);
    const px = cc.getImageData(0, 0, d.w, d.h).data;
    let bot = 0;
    for (let y = 0; y < d.h; y++) for (let x = 0; x < d.w; x++) if (px[(y * d.w + x) * 4 + 3]) bot = Math.max(bot, y);
    pet.y = Math.round(PH * FEET) + d.h - 1 - bot;
    pet.placed = true;
  }
  function spawnItem() {                   // 輪到撿下一樣：出現在毛孩前面（左邊）的步道上
    const d = D.petInfo(pet.p);
    item = { k: window.DCScene.pickItem(weather, D.timeOfDay()), x: Math.max(8, Math.round(pet.x - d.w * .5)), y: Math.round(PH * (PATH_BOT - .02)) };
    pet.walking = false; pet.flip = true; pet.set('sit', 1); pet.until = performance.now() + 3000;   // 停下來、轉頭看那個東西
    D.say(pet, D.line(pet, 'pocket_find'));
  }
  function pickUp() {                      // 點一下：收進包包
    const k = item.k, it = window.DCScene.ITEMS[k], had = D.souvenirs()[k] || pet.p.found.includes(k);
    pet.p.found.push(k); item = null; nextAt = performance.now() + 3500; saveFound();
    D.addHearts(pet, 2); D.say(pet, had ? D.line(pet, 'pocket_got', { other: it.name }) : D.line(pet, 'souvenir_new'), 2200);
    render();
    const pill = $('pocketInfo'); pill.classList.remove('bump'); void pill.offsetWidth; pill.classList.add('bump');
  }
  function frame(dt, t) {
    if (!pet) return;
    if (!pet.fitted) { fit(); if (!pet.fitted) return; }   // 一打開就是口袋（?tab=pocket）時毛孩還沒讀到：讀到了再排一次
    if (!pet.placed) placeInPocket();
    if (!item && window.DCScene && performance.now() > nextAt && waiting() > 0) spawnItem();
    D.useCtx(pctx); pctx.setTransform(1, 0, 0, 1, 0, 0);
    drawScene(dt, t);
    D.useCtx(null);
  }

  function render() {
    sync();
    $('pocketEmpty').hidden = !!pet; $('pocketFull').hidden = !pet;
    if (!pet) {
      const box = $('pocketPick'); box.innerHTML = '';
      for (const p of HOME.pets.filter(q => q.where === 'home')) {
        const b = document.createElement('button'); b.className = 'pick';
        const c = document.createElement('canvas'); D.drawAvatar(c, p);
        const n = document.createElement('span'); n.textContent = p.name;
        b.append(c, n); b.onclick = () => takeOut(p); box.appendChild(b);
      }
      renderDex();
      if (window.DCTrip) window.DCTrip.renderAlbum($('pocketAlbum'));   // 旅行相簿（trip.js）
      return;
    }
    const m = Math.round(minsOut());
    const n = pet.p.found.length;
    const where = window.DCOutdoor ? window.DCOutdoor.label(sceneName()) + '・' : '';   // 這一趟在哪（每次出門隨機）
    D.setLabel($('pocketInfo'), 'pocket', `${pet.p.name}・${where}出門 ${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}${n ? `・撿到 ${n} 樣` : ''}`);
  }
  function renderDex() {                   // 紀念品圖鑑：撿過的看得到、沒撿過的寫什麼時候有
    const S = window.DCScene, box = $('pocketDex');
    if (!S) return;
    const got = D.souvenirs(), n = S.ITEM_ORDER.filter(k => got[k]).length;
    box.innerHTML = '';
    const h = document.createElement('h3'); D.setLabel(h, 'pocket', `紀念品圖鑑 ${n}／${S.ITEM_ORDER.length}`);
    const grid = document.createElement('div'); grid.className = 'dex-grid';
    for (const k of S.ITEM_ORDER) {
      const it = S.ITEMS[k], cell = document.createElement('div'); cell.className = 'dex-cell' + (got[k] ? '' : ' no');
      const c = document.createElement('canvas'); c.width = 12; c.height = 12;
      const cc = c.getContext('2d'); it.draw(cc, 6, 11);
      if (!got[k]) { cc.globalCompositeOperation = 'source-in'; cc.fillStyle = '#b9b2aa'; cc.fillRect(0, 0, 12, 12); }
      const b = document.createElement('b'); b.textContent = got[k] ? it.name : '？？？';
      const s = document.createElement('span'); s.textContent = got[k] ? `撿過 ${got[k]} 次` : `${it.when}才有`;
      cell.append(c, b, s); grid.append(cell);
    }
    const note = document.createElement('p'); note.className = 'note';
    note.textContent = `出門每 ${FIND_EVERY} 分鐘撿到一樣，一趟最多 ${FIND_MAX} 樣；放回家時擺上紀念品架`;
    box.append(h, grid, note);
  }
  async function takeOut(p) {              // 從口袋頁直接帶一隻出門（家裡的那隻會不見；伺服器模式先問伺服器 dc_pet_move）
    if (!await D.toPocket(p, true)) return;
    show();
    if (pet) D.say(pet, D.line(pet, 'pocket_go'));
  }
  function show() { render(); requestAnimationFrame(fit); if (window.DCTrip) window.DCTrip.pocketShown(); }

  // 摸摸、順毛（手指從頭往尾巴滑＝順毛）
  const g = { on: false };
  pcv.addEventListener('pointerdown', e => {
    if (!pet) return;
    try { pcv.setPointerCapture(e.pointerId); } catch (_) { /* 模擬的指標 */ }
    g.on = true; g.sx = e.clientX; g.sy = e.clientY; g.lx = e.clientX; g.ly = e.clientY; g.ax = 0; g.ay = 0; g.moved = false; g.touch = e.pointerType !== 'mouse';
    if (pet.walking) { pet.walking = false; pet.set('sit', 1); }   // 一摸就停下來坐好（散步中）
    if (g.touch) { pet.until = performance.now() + 2500; D.strokeHint(pet); }   // 手指一碰到：先不換動作、提示順毛方向
  });
  pcv.addEventListener('pointermove', e => {
    if (!g.on) return;
    if (Math.hypot(e.clientX - g.sx, e.clientY - g.sy) > 8) g.moved = true;
    if (!g.touch) return;                  // 順毛只有手指（滑鼠不好懂）
    g.ax += e.clientX - g.lx; g.ay += e.clientY - g.ly; g.lx = e.clientX; g.ly = e.clientY;
    if (Math.hypot(g.ax, g.ay) > 30) { D.stroke(pet, g.ax, g.ay); g.ax = g.ay = 0; }
  });
  const up = e => {
    if (g.on && !g.moved && pet) {
      const r = pcv.getBoundingClientRect(), wx = (e.clientX - r.left) / scale, wy = (e.clientY - r.top) / scale;
      if (item && Math.abs(wx - item.x) < 11 && wy > item.y - 16 && wy < item.y + 6) pickUp();   // 手指大小（44px）÷ 放大倍數
      else D.petPet(pet);
    }
    g.on = false;
  };
  pcv.addEventListener('pointerup', up); pcv.addEventListener('pointercancel', () => { g.on = false; });

  const WEATHERS = [['sun', 'sun', '晴'], ['cloud', 'cloud', '陰'], ['rain', 'rain', '雨']];   // 天氣、圖示（art/icons/）、字
  $('pocketWeather').onclick = () => {     // 點一下換天氣（晴 → 陰 → 雨）
    const i = (WEATHERS.findIndex(w => w[0] === weather) + 1) % WEATHERS.length;
    weather = WEATHERS[i][0];
    D.setLabel($('pocketWeather').querySelector('b'), WEATHERS[i][1]);
    $('pocketWeather').querySelector('span').textContent = WEATHERS[i][2];
    if (pet) D.say(pet, D.line(pet, 'pocket_' + weather));
  };
  $('pocketHome').onclick = () => { if (pet) D.act(pet.p, 'callhome'); };
  $('pocketPhoto').onclick = () => openPhoto();
  $('pocketTrip').onclick = () => { if (window.DCTrip) window.DCTrip.open(); };   // AI 旅行照（trip.js）

  // ---------- 合照 ----------
  const ph = { stream: null, facing: 'environment', s: 6, x: 0, y: 0, pose: 0, flip: false, still: null };
  const video = $('pvideo'), still = $('pstill'), petCv = $('ppet'), petCtx = petCv.getContext('2d');
  // 合照可以挑的動作（2026-10-14 使用者「可以針對毛小孩選擇他的動作」）：照這隻有的動作列出來
  const POSE_CAT = [['sit', '坐著'], ['idle', '站著'], ['walk', '走路'], ['run', '跑步'], ['jump', '跳'], ['loaf', '縮成一團'], ['sleep', '睡覺'],
    ['belly', '翻肚'], ['groom', '理毛'], ['washface', '洗臉'], ['yawn', '打哈欠'], ['stretch', '伸懶腰'], ['knead', '踩踩'], ['arch', '拱背'],
    ['tail_flick', '甩尾巴'], ['crouch', '準備撲'], ['hiss', '哈氣'], ['shake', '甩毛'], ['itch', '抓癢'], ['inbox', '紙箱'], ['held', '被抱著']];
  const POSE_DOG = [['sit', '坐著'], ['sit_wag', '搖尾巴'], ['idle', '站著'], ['walk', '走路'], ['run', '跑步'], ['jump', '跳'], ['play_bow', '邀你玩'],
    ['pant', '吐舌頭'], ['bark', '汪汪叫'], ['howl', '嚎叫'], ['sit_ball', '叼球'], ['loaf', '趴著'], ['sleep', '睡覺'], ['belly', '翻肚'],
    ['yawn', '打哈欠'], ['sniff', '聞聞'], ['shake', '甩毛'], ['circle', '轉圈'], ['sulk', '鬧脾氣'], ['inbox', '紙箱'], ['held', '被抱著']];
  const poseList = () => { const d = D.petInfo(pet.p); return (pet.dog() ? POSE_DOG : POSE_CAT).filter(([a]) => d.anims[a]); };
  const poses = () => poseList().map(([a]) => a);
  function poseThumb(cv, anim) {           // 動作小圖：那個動作的第 1 格，裁掉空白放進正方形
    const d = D.petInfo(pet.p), im = D.img(d.file), [row] = d.anims[anim];
    const t = document.createElement('canvas'); t.width = d.w; t.height = d.h;
    const tc = t.getContext('2d'); tc.drawImage(im, 0, row * d.h, d.w, d.h, 0, 0, d.w, d.h);
    const px = tc.getImageData(0, 0, d.w, d.h).data;
    let x0 = d.w, y0 = d.h, x1 = 0, y1 = 0;
    for (let y = 0; y < d.h; y++) for (let x = 0; x < d.w; x++) if (px[(y * d.w + x) * 4 + 3]) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
    const bw = x1 - x0 + 1, bh = y1 - y0 + 1, side = Math.max(bw, bh) + 2;
    cv.width = side; cv.height = side;
    const c = cv.getContext('2d'); c.imageSmoothingEnabled = false;
    c.drawImage(t, x0, y0, bw, bh, Math.floor((side - bw) / 2), side - bh - 1, bw, bh);
  }
  function buildPoseBar() {
    const bar = $('pposes'); bar.innerHTML = '';
    poseList().forEach(([a, label], i) => {
      const b = document.createElement('button'); b.className = 'pose' + (i === ph.pose ? ' on' : '');
      const c = document.createElement('canvas'); poseThumb(c, a);
      const s = document.createElement('span'); s.textContent = label;
      b.append(c, s);
      b.onclick = () => { ph.pose = i; bar.querySelectorAll('.pose').forEach((x, j) => x.classList.toggle('on', j === i)); placePet(); };
      bar.appendChild(b);
    });
  }
  async function openPhoto() {
    if (!pet) return;
    $('photo').hidden = false; $('presult').hidden = true; $('pcontrols').hidden = false;
    ph.pose = 0; ph.flip = false; ph.still = null; still.hidden = true;
    buildPoseBar();
    const box = $('pview').getBoundingClientRect(), d = D.petInfo(pet.p);
    ph.s = clamp(Math.floor(Math.min(box.width, box.height) * .45 / d.h), 2, 10);
    ph.x = box.width * .72; ph.y = box.height - 110;   // 偏右、站在下面按鈕列的上方，不被按鈕擋住
    placePet();
    await startCamera();
  }
  async function startCamera() {
    stopCamera();
    $('pnocam').hidden = true; video.hidden = false;
    if (!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia && window.isSecureContext)) { noCamera('這個網址打不開相機（要 https）'); return; }
    try {
      ph.stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: ph.facing }, audio: false });
      video.srcObject = ph.stream; await video.play();
      video.classList.toggle('mirror', ph.facing === 'user');
    } catch (err) { noCamera('相機沒有打開（沒有相機，或沒有允許）'); }
  }
  function noCamera(why) {
    video.hidden = true;
    if (!ph.still) { $('pnocam').hidden = false; $('pnocamWhy').textContent = why; }
  }
  function stopCamera() { if (ph.stream) { ph.stream.getTracks().forEach(t => t.stop()); ph.stream = null; } video.srcObject = null; }
  function closePhoto() { stopCamera(); $('photo').hidden = true; }

  function placePet() {                    // 合照上的毛孩：一格圖放大 s 倍（整數，不糊）
    const d = D.petInfo(pet.p);
    petCv.width = d.w; petCv.height = d.h;
    petCv.style.width = d.w * ph.s + 'px'; petCv.style.height = d.h * ph.s + 'px';
    // 不讓毛孩跑到上面的動作列、下面的按鈕列底下（介面不能遮住毛孩）
    const box = $('pview').getBoundingClientRect(), bar = $('pposes').getBoundingClientRect(), ctl = $('pcontrols').getBoundingClientRect();
    const topMin = bar.height ? bar.bottom - box.top + 4 : 0, botMax = ctl.height && !$('pcontrols').hidden ? ctl.top - box.top - 4 : box.height;
    ph.y = Math.min(ph.y, botMax); ph.y = Math.max(ph.y, topMin + d.h * ph.s);
    petCv.style.left = Math.round(ph.x - d.w * ph.s / 2) + 'px'; petCv.style.top = Math.round(ph.y - d.h * ph.s) + 'px';
    drawPetFrame();
  }
  function drawPetFrame(c = petCtx) {
    const d = D.petInfo(pet.p), im = D.img(d.file), a = poses()[ph.pose % poses().length], [row, n] = d.anims[a];
    const f = Math.floor(performance.now() / 1000 * 3) % n;
    c.imageSmoothingEnabled = false; c.clearRect(0, 0, d.w, d.h);
    c.save(); if (ph.flip) { c.translate(d.w, 0); c.scale(-1, 1); }
    c.drawImage(im, f * d.w, row * d.h, d.w, d.h, 0, 0, d.w, d.h); c.restore();
  }
  setInterval(() => { if (pet && !$('photo').hidden && !$('pcontrols').hidden) drawPetFrame(); }, 120);

  // 拖毛孩移動；兩指或＋－放大縮小
  const pp = new Map(); let pg = null;
  $('pview').addEventListener('pointerdown', e => {
    if (e.target.closest('button')) return;
    try { $('pview').setPointerCapture(e.pointerId); } catch (_) { /* 模擬 */ }
    pp.set(e.pointerId, [e.clientX, e.clientY]);
    if (pp.size === 2) { const [a, b] = [...pp.values()]; pg = { pinch: true, d0: Math.hypot(a[0] - b[0], a[1] - b[1]) }; return; }
    pg = { sx: e.clientX, sy: e.clientY, x0: ph.x, y0: ph.y };
  });
  $('pview').addEventListener('pointermove', e => {
    if (!pp.has(e.pointerId) || !pg) return;
    pp.set(e.pointerId, [e.clientX, e.clientY]);
    if (pg.pinch && pp.size === 2) {
      const [a, b] = [...pp.values()], d = Math.hypot(a[0] - b[0], a[1] - b[1]);
      if (d / pg.d0 > 1.25) { resize(1); pg.d0 = d; } else if (d / pg.d0 < .8) { resize(-1); pg.d0 = d; }
      return;
    }
    if (pg.pinch) return;
    const box = $('pview').getBoundingClientRect();
    ph.x = clamp(pg.x0 + e.clientX - pg.sx, 0, box.width); ph.y = clamp(pg.y0 + e.clientY - pg.sy, 20, box.height + 20);
    placePet();
  });
  const pend = e => { pp.delete(e.pointerId); if (pp.size === 0) pg = null; };
  $('pview').addEventListener('pointerup', pend); $('pview').addEventListener('pointercancel', pend);
  function resize(k) { ph.s = clamp(ph.s + k, 2, 14); placePet(); }
  $('pbig').onclick = () => resize(1); $('psmall').onclick = () => resize(-1);
  $('pflip').onclick = () => { ph.flip = !ph.flip; placePet(); };
  $('pswitch').onclick = () => { ph.facing = ph.facing === 'user' ? 'environment' : 'user'; ph.still = null; still.hidden = true; startCamera(); };
  $('pclose').onclick = closePhoto;
  $('pfile').onchange = e => {             // 沒有相機時：拍照或選一張照片（iPhone 會問要拍照還是選照片）
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    const url = URL.createObjectURL(file);
    still.onload = () => { ph.still = still; still.hidden = false; video.hidden = true; $('pnocam').hidden = true; stopCamera(); };
    still.src = url;
  };
  $('ppick').onclick = () => $('pfile').click();
  $('pnocamPick').onclick = () => $('pfile').click();

  // 拍照：把看到的那一塊（跟畫面一樣的裁切）＋毛孩畫成一張圖
  let lastBlob = null;
  $('pshoot').onclick = () => {
    const src = ph.still || (ph.stream ? video : null);
    if (!src) { toastIn('先拍照或選一張照片'); return; }
    const sw = src.videoWidth || src.naturalWidth, sh = src.videoHeight || src.naturalHeight;
    const box = $('pview').getBoundingClientRect(), k = Math.max(box.width / sw, box.height / sh);   // 畫面是 object-fit: cover
    const cw = Math.round(box.width / k), ch = Math.round(box.height / k), ox = (sw - cw) / 2, oy = (sh - ch) / 2;
    const out = document.createElement('canvas'); out.width = cw; out.height = ch;
    const c = out.getContext('2d');
    c.save();
    if (src === video && ph.facing === 'user') { c.translate(cw, 0); c.scale(-1, 1); }   // 自拍鏡像跟畫面一樣
    c.drawImage(src, ox, oy, cw, ch, 0, 0, cw, ch); c.restore();
    const d = D.petInfo(pet.p), t = document.createElement('canvas'); t.width = d.w; t.height = d.h;
    drawPetFrame(t.getContext('2d'));
    c.imageSmoothingEnabled = false;
    c.drawImage(t, Math.round((ph.x - d.w * ph.s / 2) / k), Math.round((ph.y - d.h * ph.s) / k), Math.round(d.w * ph.s / k), Math.round(d.h * ph.s / k));
    c.font = `${Math.max(12, Math.round(ch / 36))}px sans-serif`; c.fillStyle = 'rgba(255,255,255,.85)'; c.textAlign = 'right';
    c.fillText(`🐾 ${pet.p.name}・DeskCat`, cw - 10, ch - 10);
    out.toBlob(b => {
      lastBlob = b;
      $('pout').src = URL.createObjectURL(b);
      $('pcontrols').hidden = true; $('presult').hidden = false;
      const file = new File([b], 'DeskCat合照.jpg', { type: 'image/jpeg' });
      $('pshare').hidden = !(navigator.canShare && navigator.canShare({ files: [file] }));
      D.petPet(pet);
    }, 'image/jpeg', .92);
  };
  // 存到照片（2026-10-17 使用者：「想要打開存到 iPhone 的相片中」）：網頁不能直接寫進「照片」App；
  // 以前用下載（a.download）→ iPhone 存進「檔案」App 的下載項目、照片裡找不到。改成叫分享選單，選「儲存影像」＝存進照片；
  // 沒有分享選單（家裡 Wi-Fi 的 http）就請他長按上面的照片 →「加入照片」。分享選單不帶文字，「儲存影像」才會在最前面
  let tipTimer = null;
  function tip(msg) {                      // 提示寫在按鈕上面（剛剛按的地方，製作規則第 2 節）
    $('ptip').textContent = msg; $('ptip').hidden = false;
    clearTimeout(tipTimer); tipTimer = setTimeout(() => { $('ptip').hidden = true; }, 6000);
  }
  $('psave').onclick = async () => {
    if (!lastBlob) return;
    const file = new File([lastBlob], `DeskCat_${pet.p.name}_${new Date().toISOString().slice(0, 10)}.jpg`, { type: 'image/jpeg' });
    if (!(navigator.canShare && navigator.canShare({ files: [file] }))) { tip('長按照片 →「加入照片」'); return; }
    tip('選「儲存影像」存進照片');
    try { await navigator.share({ files: [file] }); } catch (e) { if (e && e.name !== 'AbortError') tip('長按照片 →「加入照片」'); }
  };
  $('pshare').onclick = async () => {
    if (!lastBlob) return;
    const file = new File([lastBlob], 'DeskCat合照.jpg', { type: 'image/jpeg' });
    try { await navigator.share({ files: [file], title: `${pet.p.name}的合照` }); } catch (_) { /* 使用者取消 */ }
  };
  $('pagain').onclick = () => { $('presult').hidden = true; $('pcontrols').hidden = false; $('ptip').hidden = true; };
  $('pdone').onclick = closePhoto;
  function toastIn(msg) { D.toast(msg); }

  window.DCPocket = { frame, render, show, openPhoto, get pet() { return pet; }, ph,
    petNow() { if (pet) D.petPet(pet); },   // 從 iPhone 小工具點進來：摸口袋裡那隻（app.js fromWidget）
  };
})();
