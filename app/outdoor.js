// DeskCat 手機網頁：口袋的戶外場景（2026-10-20 手機線；使用者「感覺可以多種樣式，另外可以讓寵物有出門散步的感覺」）。
// 13 個場景：城市公園、海邊、森林步道、河堤、老街、櫻花步道、雪地、鄉間小路、花田、港口、山上、夜市、校園（後 8 個＋老街重畫：同一天使用者再挑）；每次出門隨機一個（使用者選「每次出門隨機」），這一趟都在那裡（pocket.js 照毛孩＋出門時間挑）。
// 散步（使用者選「牠走、背景往後捲」）：每個場景是幾層會捲的圖（遠的慢、近的快），毛孩站在畫面左邊走路，背景往後移。
// 每一層照「場景＋時段＋天氣＋大小」畫一次存起來（畫布寬 TW，左右接得起來），每一格只貼上去；會動的（雲、星星、浪、螢火蟲、路人、鳥）每格畫。
// 全部 Claude 用程式畫（使用者「Claude 用程式畫」），不讀圖片檔。給 pocket.js 用：DCOutdoor.build(場景, PW, PH, 時段, 天氣, 背景放大倍數) → 場景物件；每格 paint() 畫背景＋鴿子、light() 蓋晚上的暗色和燈光。
// 2026-10-27 美術體檢（使用者全選 7 項）：
//   構圖：地平線往上移（天空從四成多變三成，每個場景高低不同）、近景放大、最下面多一層靠鏡頭的前景（大草叢、大花、欄杆，捲最快；只到毛孩腳下，不蓋到牠）、
//         天空加遠山、一群鳥、熱氣球、風箏、飛機（照場景）；
//   不重複：樹、房子、攤位的大小、顏色、間距用亂數排（每個場景固定的亂數，這一趟看到的一樣），一層 480 寬（以前 240）才繞回來，每個場景有一個特別的地標；
//   路面：樹影、水窪（下雨更多）、落葉、裂縫，少一點平均的小雜點；偶爾經過鴿子（毛孩走近會飛走）、路人（下雨撐傘）、遛狗的人、腳踏車。
(window.DC_BUILD = window.DC_BUILD || {})['outdoor.js'] = 78;   // 版本戳記（mobile/tools/bump.py 一起加 1；不一樣＝手機有舊檔）
(() => {
  'use strict';
  const D = window.DC;
  // ---------- 小工具 ----------
  const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map(v => (v + .5) / 16);   // 4×4 網點
  const bay = (x, y) => BAYER[((y % 4 + 4) % 4) * 4 + ((x % 4 + 4) % 4)];
  const hx = c => [1, 3, 5].map(i => parseInt(c.slice(i, i + 2), 16));
  const toHex = a => '#' + a.map(v => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');
  const mix = (a, b, t) => { const p = hx(a), q = hx(b); return toHex(p.map((v, i) => v + (q[i] - v) * t)); };
  const shade = (c, k) => (k > 0 ? mix(c, '#ffffff', k) : mix(c, '#000000', -k));
  function rng(seed) { let s = seed >>> 0; return () => { s = (s + 0x6D2B79F5) >>> 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t ^= t + Math.imul(t ^ (t >>> 7), 61 | t); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  const ri = (rnd, a, b) => a + Math.floor(rnd() * (b - a + 1));             // a～b 的整數
  const pick = (rnd, a) => a[Math.floor(rnd() * a.length)];
  let K = 1;                                            // 細格子：背景一格再切成 K×K 小格（2026-10-27 使用者「背景像素的細緻度要跟狗一樣」）；build() 設定
  const snap = v => Math.round(v * K) / K;
  const R = (c, x, y, w, h, col) => {
    c.fillStyle = col;
    if (K === 1) { c.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h)); return; }
    const x0 = snap(x), y0 = snap(y); c.fillRect(x0, y0, Math.max(1 / K, snap(x + w) - x0), Math.max(1 / K, snap(y + h) - y0));
  };
  const fineCanvas = (w, h) => { const cv = document.createElement('canvas'); cv.width = Math.ceil(w * K); cv.height = Math.ceil(h * K); cv.getContext('2d').setTransform(K, 0, 0, K, 0, 0); return cv; };
  let TW = 480;                                         // 一層的寬（左右接得起來）；是 4、12 的倍數（網點、磚才接得上）。2026-10-27 從 240 加寬：同樣的東西比較久才繞回來
  const RW = (c, x, y, w, h, col) => { R(c, x, y, w, h, col); if (x < 0) R(c, x + TW, y, w, h, col); if (x + w > TW) R(c, x - TW, y, w, h, col); };
  function spots(rnd, g0, g1, start = 0) {             // 沿著一層隨機排東西的位置（間距 g0～g1；最後一個跟繞回來的第一個也不會擠在一起）
    const xs = [];
    for (let x = start + ri(rnd, 0, g0); x < TW - g0 * .6; x += ri(rnd, g0, g1)) xs.push(x);
    return xs;
  }
  function blob(c, circles, base, light, dark, x0, y0, x1, y1) {   // 幾個圓疊成一團（雲、樹冠、樹叢）：左上亮、下面暗；左右接得起來（細格子：一小格一小格算）
    x0 = Math.floor(x0); y0 = Math.floor(y0); x1 = Math.ceil(x1); y1 = Math.ceil(y1);
    const u = 1 / K;
    const row = yy => circles.map(([cx, cy, r]) => [cx, r * r - (yy - cy) ** 2]);   // 這一列每個圓：中心 x、還剩多少（＜0＝這列沒碰到）
    const hit = (x, rw) => { for (const [cx, q] of rw) if (q >= 0 && (x - cx) ** 2 <= q) return true; return false; };
    for (let y = y0; y <= y1 + 1 - u; y += u) {
      let run = null, rx = 0, n = 0;                         // 同一列、同顏色連在一起的合成一段
      const flush = () => { if (run) RW(c, rx, y, n * u, u, run); run = null; n = 0; };
      const r0 = row(y), rD = row(y - 2), rL = row(y + 1.5), rS = K > 1 ? row(y + .8) : null;   // 本身、下面兩格（暗邊）、左上（亮邊）、左上一點點（細格子的亮點）
      for (let x = x0; x <= x1 + 1 - u; x += u) {
        const col = !hit(x, r0) ? null : !hit(x, rD) ? dark : !hit(x + 1.5, rL) ? light : (K > 1 && bay(Math.round(x * K), Math.round(y * K)) < .12 && !hit(x + .8, rS)) ? light : base;
        if (col !== run) { flush(); if (col) { run = col; rx = x; } }
        if (col) n++;
      }
      flush();
    }
  }
  function oval(c, cx, cy, rx, ry, col) {               // 扁扁的橢圓（一列一列填；細格子一小列一小列）
    const u = 1 / K;
    for (let dy = -Math.ceil(ry); dy <= Math.ceil(ry) + 1 - u; dy += u) {
      const hw = snap(rx * Math.sqrt(Math.max(0, 1 - (dy * dy) / (ry * ry + .5))));
      if (hw > 0) RW(c, cx - hw, cy + dy, hw * 2, u, col);
    }
  }
  const layer = h => fineCanvas(TW, h);
  // 時段的顏色：白天的顏色 → 早上偏亮、傍晚偏橘、晚上偏藍暗（晚上 pocket.js 還會整片再壓暗一次）
  const T = (day, tod) => tod === 'day' ? day : tod === 'morning' ? mix(day, '#fff4e2', .1) : tod === 'evening' ? mix(day, '#b86a52', .3) : mix(day, '#1c2240', .45);
  function dither(c, x0, y0, w, h, a, b, fn) {          // 一塊從 a 漸到 b（fn(x, y)→0～1），網點過渡（網點照小格排，細格子時網點也細）
    if (K > 1 && a[0] === '#' && b[0] === '#') {            // 細格子：直接寫像素（一小格一小格畫太慢；畫出來一樣）
      const X1 = Math.min(c.canvas.width, Math.round((x0 + w) * K)), Y1 = Math.min(c.canvas.height, Math.round((y0 + h) * K));
      const xs = Math.max(0, Math.round(x0 * K)), ys = Math.max(0, Math.round(y0 * K)), W = X1 - xs;
      if (W <= 0 || Y1 <= ys) return;
      const img = c.getImageData(xs, ys, W, Y1 - ys), d = img.data, A = hx(a), B = hx(b);
      let fy = NaN, fx = NaN, fv = 0;
      for (let Y = ys; Y < Y1; Y++) for (let X = xs; X < X1; X++) {
        const sx = Math.floor(X / K), sy = Math.floor(Y / K);   // 漸層的深淺照背景的一格算一次（網點還是照小格排）
        if (sx !== fx || sy !== fy) { fx = sx; fy = sy; fv = fn(sx, sy); }
        const col = fv > bay(X, Y) ? B : A, o = ((Y - ys) * W + X - xs) * 4;
        d[o] = col[0]; d[o + 1] = col[1]; d[o + 2] = col[2]; d[o + 3] = 255;
      }
      c.putImageData(img, xs, ys); return;
    }
    const u = 1 / K;
    R(c, x0, y0, w, h, a);                                   // 先整塊鋪 a，再一段一段補 b（畫出來一樣、快很多）
    for (let y = y0; y < y0 + h; y += u) {
      let bx = null;
      for (let x = x0; x < x0 + w; x += u) {
        const isB = fn(x, y) > bay(Math.round(x * K), Math.round(y * K));
        if (isB && bx === null) bx = x; else if (!isB && bx !== null) { R(c, bx, y, x - bx, u, b); bx = null; }
      }
      if (bx !== null) R(c, bx, y, x0 + w - bx, u, b);
    }
  }

  // ---------- 天空（每個場景共用；地平線顏色可以換） ----------
  const SKY_CLOUD = { morning: ['#c9d3d8', '#d9e0e2', '#e6e2d6'], day: ['#aebcc6', '#c2ccd3', '#d4dadd'], evening: ['#6e6680', '#a8848a', '#c79f88'], night: ['#1b1f33', '#232843', '#2b3150'] };
  const SKY_RAIN = { morning: ['#8e9aa6', '#a3adb6', '#b6bec4'], day: ['#7d8a96', '#909ca6', '#a3adb6'], evening: ['#4c4660', '#6b5c70', '#82707c'], night: ['#12152a', '#191d36', '#202542'] };
  const skyOf = (tod, w) => (w === 'sun' ? D.SKY[tod] : w === 'cloud' ? SKY_CLOUD[tod] : SKY_RAIN[tod]);
  function paintSky(PW, gy, tod, w, art = {}) {             // art＝{sun, moon}：這個場景素材庫的太陽、月亮（有就用 AI 圖）
    const cv = fineCanvas(PW, Math.max(1, gy)), u = 1 / K;
    const c = cv.getContext('2d'), s = skyOf(tod, w), night = tod === 'night';
    const stops = night ? [s[0], mix(s[1], '#34447a', .35), mix(s[2], '#4a5a96', .5), mix(s[2], '#7484b8', .6)]   // 晚上越靠地平線越亮（2026-10-27「天空地面分不開」）
      : [s[0], s[1], s[2], mix(s[2], tod === 'evening' ? '#ffcf9a' : '#ffffff', .25)];
    for (let y = 0; y < gy; y += u) {
      const f = (y / Math.max(1, gy - 1)) * (stops.length - 1), i = Math.min(stops.length - 2, Math.floor(f)), t = f - i;
      const lo = mix(stops[i], stops[i + 1], Math.floor(t * 4) / 4), hi = mix(stops[i], stops[i + 1], Math.min(1, Math.floor(t * 4 + 1) / 4)), k = t * 4 - Math.floor(t * 4);
      R(c, 0, y, PW, u, lo);                                 // 先整列鋪淺的，再補網點
      for (let x = 0; x < PW; x += u) if (k > bay(Math.round(x * K), Math.round(y * K))) R(c, x, y, u, u, hi);
    }
    if (w === 'sun' && !night && art.sun) { const im = art.sun[0], sw = im.width / K, sh = im.height / K; c.drawImage(artImg(im, tod), snap(PW * .78 - sw / 2), snap(Math.max(sh / 2 + 2, gy * .3) - sh / 2), sw, sh); }
    else if (w === 'sun' && !night) {
      const sx = Math.round(PW * .78), sy = Math.max(12, Math.round(gy * .3)), sc = tod === 'evening' ? '#ffb36b' : '#ffe58a';
      for (let y = -11; y <= 11; y += u) for (let x = -11; x <= 11; x += u) {
        const d = Math.hypot(x, y);
        if (d <= 6) R(c, sx + x, sy + y, u, u, d <= 4 ? shade(sc, .35) : sc);
        else if (d <= 10 && (10 - d) / 4 > bay(Math.round((x + 12) * K), Math.round((y + 12) * K)) * 1.6) R(c, sx + x, sy + y, u, u, mix(sc, s[1], .55));
      }
    }
    if (night && w !== 'rain' && art.moon) { const im = art.moon[0], mw = im.width / K, mh = im.height / K; c.drawImage(im, snap(PW * .78 - mw / 2), snap(Math.max(mh / 2 + 2, gy * .28) - mh / 2), mw, mh); }
    else if (night && w !== 'rain') {
      const mx = Math.round(PW * .78), my = Math.max(9, Math.round(gy * .28));   // 背景放大一倍後天空變矮：不要被切到頂端
      for (let y = -8; y <= 8; y += u) for (let x = -8; x <= 8; x += u) {
        const d = Math.hypot(x, y);
        if (d <= 4.5) R(c, mx + x, my + y, u, u, '#f6f0c4');
        else if (d <= 7.5 && bay(Math.round((x + 8) * K), Math.round((y + 8) * K)) < .3) R(c, mx + x, my + y, u, u, '#3a4070');
      }
      R(c, mx - 2, my - 1, 2, 1, '#ddd6a8'); R(c, mx + 1, my + 2, 1, 1, '#ddd6a8'); R(c, mx + 2, my - 3, 1, 1, '#ddd6a8');
    }
    return cv;
  }
  function cloudSprites(tod, w, art) {                      // art＝這個場景素材庫的雲（晴天才用；陰天、下雨用程式畫的灰雲）
    if (art && w === 'sun' && tod !== 'night') { const rnd = rng(23); return art.map(im => ({ cv: artImg(im, tod), x: rnd(), y: .04 + rnd() * .38, v: .4 + rnd() * .6 })); }
    const n = w === 'sun' ? (tod === 'night' ? 0 : 2) : w === 'cloud' ? 4 : 5, out = [], rnd = rng(17 + n);
    const base = w === 'rain' ? { morning: '#9aa4ad', day: '#8b97a2', evening: '#665c70', night: '#262a44' }[tod]
      : w === 'cloud' ? { morning: '#eef1f3', day: '#e8edf0', evening: '#c9a9a8', night: '#363c5c' }[tod]
      : { morning: '#ffffff', day: '#ffffff', evening: '#ffd9c2', night: '#363c5c' }[tod];
    const saveTW = TW;
    for (let i = 0; i < n; i++) {
      const cw = 22 + Math.floor(rnd() * 14), chh = 9 + Math.floor(rnd() * 4), cv = fineCanvas(cw, chh);
      TW = 100000;                                          // 雲不用左右接
      const c = cv.getContext('2d'), r = chh / 2;
      blob(c, [[cw * .3, chh - r, r * .9], [cw * .55, chh - r - 1, r * 1.05], [cw * .78, chh - r + 1, r * .8], [cw * .5, chh - 2, r * .7]],
        base, shade(base, .5), shade(base, w === 'rain' ? -.18 : -.1), 0, 0, cw - 1, chh - 1);
      TW = saveTW;
      out.push({ cv, x: rnd(), y: .06 + rnd() * .4, v: .4 + rnd() * .6 });
    }
    return out;
  }
  // 天空裡會動的（每格畫；照場景挑）：birds 一群鳥飛過、balloon 熱氣球、kite 風箏、plane 飛機。晚上、下雨不出來
  function drawSkyThings(c, s, t) {
    const { PW, gy, tod, w } = s;
    if (tod === 'night' || w === 'rain') return;
    for (const k of s.skyThings) {
      if (k === 'birds') {                                   // 每 26 秒飛過一群（5 隻排成人字）
        const a = ((t + 7000) % 26000) / 26000;
        if (a > .45) continue;
        const x0 = PW + 12 - a / .45 * (PW + 44), y0 = gy * .38 + Math.sin(t / 900) * 2, up = Math.floor(t / 220) % 2, col = tod === 'evening' ? '#4a3a4a' : '#3b3f4a';
        for (const [dx, dy] of [[0, 0], [5, 2], [10, 4], [5, -2], [10, -4]]) {
          const x = Math.round(x0 + dx), y = Math.round(y0 + dy);
          R(c, x - 1, y - up, 1, 1, col); R(c, x, y, 1, 1, col); R(c, x + 1, y - up, 1, 1, col);
        }
      } else if (k === 'balloon') {                          // 熱氣球：慢慢往右飄、上下晃
        const x = Math.round(((t / 1000 * 1.5 + 20) % (PW + 30)) - 15), y = Math.round(gy * .55 + Math.sin(t / 1800) * 2);
        const cols = s.balloon || ['#e8574f', '#f2d35b'];
        [3, 5, 7, 7, 7, 5, 3].forEach((wd, i) => { for (let j = 0; j < wd; j++) R(c, x - (wd >> 1) + j, y - 13 + i, 1, 1, (j + (7 - wd) / 2) % 4 < 2 ? cols[0] : cols[1]); });
        R(c, x - 3, y - 12, 1, 2, 'rgba(255,255,255,.5)');
        R(c, x - 2, y - 6, 1, 3, '#6b4a33'); R(c, x + 2, y - 6, 1, 3, '#6b4a33'); R(c, x - 1, y - 3, 3, 2, '#8a5a3a');
      } else if (k === 'kite' && w === 'sun') {              // 風箏：線拉到畫面右下的地平線
        const x = Math.round(PW * .7 + Math.sin(t / 1500) * 3), y = Math.round(gy * .42 + Math.sin(t / 1100) * 2);
        R(c, x, y - 3, 1, 1, '#e8574f'); R(c, x - 1, y - 2, 3, 1, '#e8574f'); R(c, x - 2, y - 1, 5, 1, '#f2d35b'); R(c, x - 1, y, 3, 1, '#3f8fd5'); R(c, x, y + 1, 1, 1, '#3f8fd5');
        for (let i = 0; i < 6; i++) R(c, x + Math.round(Math.sin(t / 220 + i) * 1.2), y + 2 + i, 1, 1, i % 2 ? '#ffffff' : '#e8574f');
        for (let i = 2; i < 20; i += 2) { const f = i / 20; R(c, Math.round(x + (PW * .98 - x) * f), Math.round(y + (gy - y) * f), 1, 1, 'rgba(255,255,255,.55)'); }
      } else if (k === 'plane') {                            // 小飛機：每 40 秒飛過一次，後面一條白線
        const a = ((t + 21000) % 40000) / 40000;
        if (a > .5) continue;
        const x = Math.round(-8 + a / .5 * (PW + 16)), y = Math.round(gy * .16);
        R(c, x, y, 4, 1, '#f4f4f0'); R(c, x + 1, y - 1, 1, 1, '#f4f4f0');
        for (let i = 2; i < 30; i += 1) if (x - i >= 0) R(c, x - i, y, 1, 1, `rgba(255,255,255,${(.5 - i / 60).toFixed(2)})`);
      }
    }
  }

  // ---------- 共用的小東西 ----------
  function tree(c, x, base, h, tc, night, trunk) {     // 圓圓的樹：樹冠三個亮度、樹幹亮暗兩面、地上影子
    RW(c, x - 6, base + 1, 13, 1, 'rgba(0,0,0,.14)'); RW(c, x - 4, base + 2, 9, 1, 'rgba(0,0,0,.1)');
    const th = Math.max(8, Math.round(h * .45)), tk = trunk || (night ? '#2a2018' : '#6b4a33');
    RW(c, x - 1, base - th + 2, 3, th, tk); RW(c, x + 1, base - th + 2, 1, th, shade(tk, -.25));
    const cy = base - th + 2 - h / 2;
    blob(c, [[x, cy, h / 2 + 2], [x - 4, cy + 2, h / 2], [x + 4, cy + 1, h / 2], [x - 1, cy - 3, h / 2 - 1]], tc, shade(tc, night ? .1 : .18), shade(tc, -.22),
      x - h / 2 - 7, cy - h, x + h / 2 + 7, base - th + 4);
  }
  function pine(c, x, base, h, col) {                   // 尖尖的松樹（剪影，三層；細格子一小列一小列）
    const u = 1 / K;
    for (let i = 0; i < h; i += u) {
      const y = base - i, tier = i % Math.max(4, Math.round(h / 3)), half = Math.max(u, snap((h - i) * .32 - tier * .35));
      RW(c, x - half, y, half * 2 + 1, u, col);
      if (K === 1 ? i % 2 === 0 : Math.round(i * K) % 3 === 0) RW(c, x - half, y, u, u, shade(col, .1));
    }
    RW(c, x, base + 1, 1, 2, shade(col, -.2));
  }
  function ridge(c, rnd, gy, h, col, snow) {            // 遠山：大小不一的山頭連成一排（左右接得起來）；snow＝山頂的雪
    const peaks = [];
    for (let x = ri(rnd, 0, 30); x < TW; x += ri(rnd, 50, 110)) peaks.push([x, ri(rnd, Math.round(h * .45), h), .35 + rnd() * .35]);
    const u = 1 / K;
    for (let x = 0; x < TW; x += u) {
      let hh = 0;
      for (const [px, ph, sl] of peaks) for (const d of [x - px, x - px - TW, x - px + TW]) hh = Math.max(hh, ph - Math.abs(d) * sl);
      hh = snap(hh);
      if (hh <= 0) continue;
      R(c, x, gy - hh, u, hh, col);
      if (snow && hh > h * .7) R(c, x, gy - hh, u, Math.max(u, snap((hh - h * .7) * .7)), snow);
      else if (bay(Math.round(x * K), Math.round(hh * K)) < .25) R(c, x, gy - hh, u, u, shade(col, .08));
    }
  }
  function tufts(c, rnd, n, y0, y1, col, col2) {        // 草叢小點（細格子：小一半、多一倍）
    const u = 1 / K;
    for (let i = 0; i < n * K; i++) { const x = Math.floor(rnd() * TW * K) / K, y = y0 + Math.floor(rnd() * Math.max(1, y1 - y0) * K) / K; RW(c, x, y, u, 2 * u, col); RW(c, x - u, y + u, u, u, col); RW(c, x + u, y, u, u, col2); }
  }
  function flowers(c, rnd, n, y0, y1, stem) {
    for (let i = 0; i < n; i++) {
      const x = Math.floor(rnd() * TW), y = y0 + Math.floor(rnd() * Math.max(1, y1 - y0)), p = ['#f4d35e', '#f28fb0', '#ffffff', '#b59cf0'][i % 4];
      RW(c, x, y + 1, 1, 2, stem); RW(c, x - 1, y, 1, 1, p); RW(c, x + 1, y, 1, 1, p); RW(c, x, y - 1, 1, 1, p); RW(c, x, y, 1, 1, '#f6b93b');
    }
  }
  // 2026-10-27 使用者「粗的東西全部重畫」（依照毛孩的格子）：u＝一小格（1/K）；大小、位置跟以前一樣，邊、縫、花紋改用小格畫
  function box(c, x, y, w, h, col, hi = .14, lo = -.2) {   // 一塊有亮邊（上、左）和暗邊（下、右）的方塊
    const u = 1 / K;
    RW(c, x, y, w, h, col); RW(c, x, y, w, u, shade(col, hi)); RW(c, x, y + u, u, h - u, shade(col, hi * .6));
    RW(c, x, y + h - u, w, u, shade(col, lo)); RW(c, x + w - u, y + u, u, h - u, shade(col, lo * .8));
  }
  function glyphs(c, rnd, x, y, w, h, col) {             // 招牌上的「字」：每個字幾筆橫豎
    const u = 1 / K, n = Math.max(1, Math.floor(w / 4));
    for (let k = 0; k < n; k++) {
      const gx = x + k * (w / n) + (w / n - 3) / 2, gy = y + (h - 3) / 2;
      RW(c, gx, gy + snap(rnd() * 1.5), 3, u, col); RW(c, gx + snap(.5 + rnd() * 2), gy, u, 3, col);
      if (rnd() < .7) RW(c, gx + snap(rnd() * 1.5), gy + 2.5, 2.5, u, col);
      if (rnd() < .5) RW(c, gx + 2.5, gy + snap(.5 + rnd()), u, 2, col);
    }
  }
  function lamp(c, lx, p0, lit) {                       // 路燈：兩層底座、細柱子（亮邊、暗邊、裝飾環）、彎的燈臂、燈罩＋玻璃燈箱
    const u = 1 / K, pole = '#3b3f4a', poleL = '#6a7080', poleD = '#2a2d36';
    RW(c, lx - 4, p0 + 2, 9, u, 'rgba(0,0,0,.14)'); RW(c, lx - 3, p0 + 2 + u, 7, u, 'rgba(0,0,0,.08)');
    box(c, lx - 3, p0 - .5, 6, 2.5, shade(pole, -.1)); box(c, lx - 2, p0 - 3, 4, 2.5, pole);   // 底座兩層
    RW(c, lx - 1, p0 - 31, 2, 28, pole); RW(c, lx - 1, p0 - 31, u, 28, poleL); RW(c, lx + 1 - u, p0 - 31, u, 28, poleD);
    for (const yy of [p0 - 12, p0 - 26]) { RW(c, lx - 1.5, yy, 3, 1, pole); RW(c, lx - 1.5, yy, 3, u, poleL); }   // 裝飾環
    for (let k = 0; k <= 8; k++) { const ax = lx + k * .5, ay = p0 - 31 - Math.sin(k / 8 * Math.PI * .5) * 2.5; RW(c, ax, ay, u * 2, u * 2, pole); }   // 彎的燈臂
    const hx = lx + 3.5, hy = p0 - 36;
    [[-3, 7], [-2.5, 6], [-2, 5]].forEach(([dx, w], r) => RW(c, hx + dx, hy + r * u, w, u, r ? pole : poleL));   // 燈罩（上窄下寬倒過來）
    RW(c, hx - .5, hy - 1, 1, 1, pole);
    const glass = lit ? '#ffe39a' : '#cfd6dd', glow = lit ? '#fff6d0' : '#eef2f6';
    RW(c, hx - 2, hy + 1.5, 4, 3, glass); RW(c, hx - 1.5, hy + 2, 1.5, 1.5, glow);
    RW(c, hx - 2, hy + 1.5, u, 3, poleD); RW(c, hx + 2 - u, hy + 1.5, u, 3, poleD); RW(c, hx - u / 2, hy + 1.5, u, 3, poleD);   // 燈箱的框
    RW(c, hx - 2.5, hy + 4.5, 5, u * 2, pole);
  }
  // 磚：上緣亮、下緣暗、顏色一點點不同、偶爾裂痕、偶爾一塊長青苔或缺一角；2026-10-27「路面像一面牆」→ 近大遠小（遠的那排小、靠近你的大）
  function bricks(c, rnd, p0, p1, pc, bw, bh) {
    R(c, 0, p0, TW, p1 - p0, pc);
    const sizes = [[8, bh - 2], [10, bh - 1], [12, bh], [12, bh + 1], [16, bh + 2], [16, bh + 3]];   // 寬都整除 480（左右接得起來）
    const u = 1 / K, seam = mix(shade(pc, -.32), '#3f4a32', .18);   // 縫：深一點、帶一點綠（照 AI 比對圖）
    R(c, 0, p0, TW, p1 - p0, seam);
    for (let r = 0, y = p0 + 2; y < p1 - 2; r++) {
      const f = (y - p0) / Math.max(1, p1 - p0), [w, h0] = sizes[Math.min(sizes.length - 1, Math.floor(f * sizes.length))], h = Math.max(3, Math.min(h0, p1 - 2 - y));
      for (let x = -((r % 2) * (w / 2)); x < TW; x += w) {
        const k = rnd(), col = k < .3 ? shade(pc, -.05) : k < .45 ? shade(pc, .05) : k < .5 ? mix(pc, '#c9a88a', .25) : pc;
        RW(c, x, y, w - u, h - u, col); RW(c, x, y, w - u, u, shade(col, .12)); RW(c, x, y + h - 2 * u, w - u, u, shade(col, -.1));
        if (K > 1) for (let m = 0, n = Math.round(w * h / 9); m < n; m++) {   // 石頭表面的斑駁：一小塊一小塊深淺
          const mw = snap(u + rnd() * 1.5), mx = x + u + snap(rnd() * Math.max(u, w - 2 * u - mw)), my = y + u + snap(rnd() * Math.max(u, h - 3 * u));
          RW(c, mx, my, mw, u, shade(col, rnd() < .55 ? .07 : -.07));
        }
        const q = rnd();
        if (q < .07) { const cx = x + 3 + Math.floor(rnd() * (w - 6)), cy = y + 1 + Math.floor(rnd() * Math.max(1, h - 3)); RW(c, cx, cy, 2 * u, u, shade(col, -.18)); RW(c, cx + 2 * u, cy + u, 2 * u, u, shade(col, -.18)); }   // 裂痕
        else if (q < .16) { const mx = x + snap(rnd() * (w - 2)); RW(c, mx, y + h - 2 * u, 2, u, mix(col, '#5f8f3f', .55)); RW(c, mx + u, y + h - 3 * u, u, u, mix(col, '#6f9f4f', .5)); }   // 縫裡的青苔
        else if (q < .12) RW(c, x + w - 3, y, 2, 2, shade(pc, -.18));                                     // 缺一角
      }
      y += h;
    }
    R(c, 0, p0, TW, 2, shade(pc, .12)); R(c, 0, p0 + 2, TW, 1, shade(pc, -.2)); R(c, 0, p1 - 2, TW, 1, shade(pc, -.2)); R(c, 0, p1 - 1, TW, 1, shade(pc, -.3));
  }
  // 遠處的樓（2026-10-27「大樓是灰色方塊」）：顏色不一樣、有高有低、偶爾空一段看得到天空；頂樓有水塔、冷氣、天線、斜屋頂；窗戶有格子、橫條、直條幾種
  // o＝{ cols 牆的顏色, haze 跟天空混幾成（越遠越淡）, hMin, hMax, wMin, wMax, gap 空一段的機率, bottom 畫到多低, lit, avoid(x, w)＝這裡不要蓋 }
  function towns(c, rnd, g, o) {
    const { gy, lit } = g, bottom = o.bottom ?? gy, sky = g.skyLow;
    if (bottom > gy) RW(c, 0, gy, TW, bottom - gy, shade(mix(T(o.cols[0], g.tod), sky, Math.min(.8, o.haze + .15)), -.12));   // 地平線下面：更後面的樓（空出來的地方不會透出空白）
    for (let x = 0; x < TW;) {
      let w = ri(rnd, o.wMin, o.wMax); if (TW - x < w + o.wMin) w = TW - x;
      if (o.avoid && o.avoid(x, w)) { x += w; continue; }
      if (rnd() < (o.gap ?? .15)) { x += ri(rnd, 2, 6); continue; }
      const h = ri(rnd, o.hMin, o.hMax), top = gy - h, base = T(pick(rnd, o.cols), g.tod), col = mix(base, sky, o.haze);
      const dark = shade(col, -.14), lite = shade(col, .1);
      RW(c, x, top, w, bottom - top, col); RW(c, x + w - 2, top, 2, bottom - top, dark); RW(c, x, top, w, 1 / K, lite);
      const roof = rnd();                                    // 頂樓
      if (roof < .25) { RW(c, x + 2, top - 3, 4, 2, shade(col, -.2)); RW(c, x + 2, top - 1, 1, 1, dark); RW(c, x + 5, top - 1, 1, 1, dark); }   // 水塔
      else if (roof < .4) { for (let k = 0; k < w; k++) { const hh = Math.max(0, Math.round(Math.min(k + 1, w - k) * .6)); if (hh) RW(c, x + k, top - hh, 1, hh, mix(T('#b8604a', g.tod), sky, o.haze)); } }   // 斜屋頂
      else if (roof < .55) RW(c, x + w - 4, top - 5, 1, 5, dark);                                    // 天線
      else if (roof < .7) RW(c, x + 1, top - 2, w - 2, 2, lite);                                     // 女兒牆
      else if (roof < .8) { RW(c, x + 3, top - 2, 3, 2, shade(col, -.06)); RW(c, x + 3, top - 2, 3, 1, lite); }   // 冷氣
      const win = rnd(), wc = lit ? null : mix(col, '#dfe8f0', .4), wd = shade(col, -.22);
      const glass = () => lit ? (rnd() < .5 ? (rnd() < .2 ? '#ffb46b' : '#ffd77a') : shade(col, -.3)) : (rnd() < .8 ? wc : wd);
      if (win < .5) { for (let yy = top + 3; yy < bottom - 1; yy += 4) for (let xx = x + 2; xx < x + w - 3; xx += 3) RW(c, xx, yy, 1, 2, glass()); }   // 格子窗
      else if (win < .75) { for (let yy = top + 3; yy < bottom - 1; yy += 4) { const gl = glass(); RW(c, x + 2, yy, w - 5, 1, gl); if (rnd() < .3) RW(c, x + 2 + ri(rnd, 0, w - 7), yy, 2, 1, wd); } }   // 橫條窗
      else { for (let xx = x + 2; xx < x + w - 3; xx += 3) RW(c, xx, top + 3, 1, bottom - top - 4, glass()); }   // 直條窗
      x += w;
    }
  }
  function bench(c, x, b, wood) {                       // 長椅：三條椅面木條、兩條椅背木條（縫一小格）、鐵扶手和腳
    const u = 1 / K, iron = '#3b3f4a';
    RW(c, x - 1, b + 1, 16, u, 'rgba(0,0,0,.14)'); RW(c, x, b + 1 + u, 14, u, 'rgba(0,0,0,.08)');
    for (const ox of [1, 12]) { RW(c, x + ox, b - 9, 1, 10, iron); RW(c, x + ox, b - 9, u, 10, '#5a6070'); RW(c, x + ox - .5, b, 2, u * 2, iron); }   // 腳＋背的鐵框
    for (let k = 0; k < 3; k++) box(c, x, b - 5 + k * (u * 1.5) - 1, 14, 1, shade(wood, -k * .06), .16, -.22);   // 椅面
    for (let k = 0; k < 2; k++) box(c, x, b - 10 + k * 2, 14, 1.5, wood, .18, -.2);                     // 椅背
    for (const ox of [-.5, 12.5]) { RW(c, x + ox, b - 6.5, 2, u * 2, iron); RW(c, x + ox, b - 6.5, u, 2.5, iron); }   // 扶手
    for (let k = 2; k < 12; k += 3.5) RW(c, x + k, b - 9.5, u, u, shade(wood, -.35));                    // 螺絲
  }
  function puddle(c, x, y, wd, sky) {                   // 水窪：扁扁的，倒映天空，上面一條亮光
    const rx = wd / 2;
    for (let dy = -2; dy <= 2; dy++) { const hw = Math.round(rx * Math.sqrt(1 - (dy * dy) / 7)); RW(c, x - hw, y + dy, hw * 2, 1, dy < 0 ? shade(sky, .1) : sky); }
    RW(c, x - Math.round(rx * .5), y - 1, Math.max(2, Math.round(rx * .45)), 1, shade(sky, .45));
    RW(c, x + Math.round(rx * .2), y + 1, Math.max(1, Math.round(rx * .25)), 1, shade(sky, .3));
  }
  function leaves(c, rnd, n, y0, y1, cols) {            // 落葉：兩格的小葉子，幾種顏色
    for (let i = 0; i < n; i++) { const x = ri(rnd, 0, TW - 1), y = ri(rnd, y0, y1), col = pick(rnd, cols); RW(c, x, y, 2, 1, col); RW(c, x + (i % 2), y - 1, 1, 1, shade(col, .12)); }
  }
  // 路面的生活感（2026-10-27「路面是一大片小雜點、沒有人氣」）：樹影、裂縫、水窪（下雨多 3 個、陰天多 1 個）、落葉
  function road(c, rnd, g, o) {
    const { p0, p1, tod, w } = g, y0 = p0 + 4, y1 = p1 - 5;
    if (o.dapple && w === 'sun' && !g.night) for (let i = 0; i < o.dapple; i++) {
      const x = ri(rnd, 0, TW - 1), y = ri(rnd, y0, y1 - 3), wd = ri(rnd, 10, 24);
      for (let k = 0; k < 4; k++) RW(c, x - wd / 2 + Math.abs(k - 1.5) * 3 + ri(rnd, 0, 2), y + k, wd - Math.abs(k - 1.5) * 6, 1, o.shadow || 'rgba(30,30,60,.12)');
    }
    if (o.cracks) for (let i = 0; i < o.cracks; i++) { let x = ri(rnd, 0, TW - 1), y = ri(rnd, y0, y1); for (let k = 0; k < 6; k++) { RW(c, x, y, 1, 1, o.crackCol); x += 1; y += ri(rnd, -1, 1); } }
    const np = (o.puddles || 0) + (w === 'rain' ? 3 : w === 'cloud' ? 1 : 0);
    for (let i = 0; i < np; i++) puddle(c, ri(rnd, 0, TW - 1), ri(rnd, y0 + 2, y1 - 2), ri(rnd, 9, 18), mix(g.skyLow, o.base || '#8a8a8a', .35));
    if (o.leaves) leaves(c, rnd, o.leaves, y0 - 2, y1 + 2, o.leafCols || [T('#d9873a', tod), T('#e6b13f', tod), T('#a8552c', tod)]);
  }
  // 最前面那層（靠鏡頭、捲最快 v 1.7）：大草叢、大花、石頭…；高度只到毛孩腳下面（腳在畫面 8 成高），不會蓋到牠
  function bigGrass(c, x, base, h, col) {               // 靠鏡頭的大草叢：幾片長葉子往兩邊彎
    for (let k = -2; k <= 2; k++) {
      const hh = h - Math.abs(k) * 3;
      for (let i = 0; i < hh; i++) RW(c, x + k * 2 + Math.round(k * (i / hh) ** 2 * 3), base - i, 2, 1, i % 4 ? col : shade(col, .12));
    }
  }
  function bigFlower(c, x, base, h, col, stem) {        // 靠鏡頭的大花：莖、一片葉子、四片花瓣＋花心
    RW(c, x, base - h, 1, h, stem); RW(c, x - 2, base - Math.round(h * .45), 2, 1, stem); RW(c, x + 1, base - Math.round(h * .3), 2, 1, stem);
    const y = base - h;
    RW(c, x - 3, y - 1, 2, 2, col); RW(c, x + 2, y - 1, 2, 2, col); RW(c, x - 1, y - 3, 3, 2, col); RW(c, x - 1, y + 1, 3, 2, col); RW(c, x - 1, y - 1, 3, 2, '#f6b93b');
    RW(c, x - 1, y - 3, 1, 1, shade(col, .3));
  }
  function bigRock(c, x, base, s, col) { blob(c, [[x, base - s * .55, s * .7], [x + s * .5, base - s * .4, s * .55]], col, shade(col, .18), shade(col, -.28), x - s, base - s * 1.4, x + s * 1.3, base); }
  function frontLayer(g, fill) {                        // fill(c, rnd, 底線, 最高可以多高)
    const cv = layer(g.PH), c = cv.getContext('2d'), rnd = rng(g.seed + 999);
    fill(c, rnd, g.PH + 1, Math.max(8, Math.round(g.PH * .19) - 4));
    return { cv, v: 1.7 };
  }

  // ---------- 路人、狗、鴿子（畫在路面那層上面、毛孩後面；2026-10-27「沒有人氣」） ----------
  const SKIN = ['#f2d0b0', '#e0b48c', '#c68e64', '#8d5a3b'], HAIR = ['#2a211c', '#4a3426', '#7a5232', '#b8b0a8', '#d9a35a'];
  const TOPS = ['#d9483b', '#3f7fc8', '#f2c531', '#4fb36a', '#f4efe6', '#7a5ab8', '#e8829e', '#2f3f5a'], BOTS = ['#2f3f5a', '#4a4a50', '#6b4a33', '#3a5a8a', '#c9b89a'];
  // 2026-10-27 使用者「背景像素的細緻度要跟狗一樣」＋「路人也重畫成細格子」：人、狗、腳踏車用小格（1/K）畫的字圖，朝右畫，往左就左右翻
  const P_HEAD = ['...hhhh...', '..hhhhhh..', '..hhsssss.', '..hsssses.', '..hssssss.', '...sssss..', '....ss....'];
  const P_BODY = ['..TTtttt..', '.aTTtttta.', '.aTTtttta.', '.aTTtttta.', '.aTTtttta.', '.sTTtttts.', '..TTtttt..', '..BBbbbb..', '..BBbbbb..'];
  const P_LEGS = [['..BB..bb..', '.BB....bb.', '.BB....bb.', '.BB....bb.', 'BB......bb', 'BB......bb', 'BB......bb', 'oo.....ooo'],   // 跨步
                  ['...BBbb...', '...BBbb...', '...BBbb...', '...BBbb...', '...BBbb...', '...BBbb...', '...BBbb...', '...ooooo..']];  // 兩腳併攏
  const P_ROWS = P_LEGS.map(L => P_HEAD.concat(P_BODY, L));    // 24 列
  function seg(c, x1, y1, x2, y2, col, w) {             // 一條線（一小格一小格點過去）
    const u = 1 / K, n = Math.max(1, Math.round(Math.hypot(x2 - x1, y2 - y1) * K));
    for (let i = 0; i <= n; i++) R(c, x1 + (x2 - x1) * i / n, y1 + (y2 - y1) * i / n, w || u, w || u, col);
  }
  function personPal(k) {
    return k.pal || (k.pal = { h: k.hair, s: k.skin, e: '#2a211c', t: k.top, T: shade(k.top, -.15), a: shade(k.top, -.08), b: k.bot, B: shade(k.bot, -.18), o: '#2f2a28' });
  }
  function person(c, x, y, k, t, dir) {                // 路人（24 小格高；走在步道遠的那一側）：x＝中間、y＝腳底；dir＝-1 往左、1 往右
    const u = 1 / K, st = Math.floor(t / 170 + k.ph) % 2, top = y - 23 * u;
    R(c, x - 5 * u, y + u, 10 * u, u, 'rgba(0,0,0,.18)');
    sprite(c, x, y, P_ROWS[st], personPal(k), dir < 0, u);
    if (k.bag) R(c, x - dir * 5 * u - (dir > 0 ? 2 * u : 0), top + 8 * u, 2 * u, 6 * u, k.bag);   // 背包、書包（背在後面）
    if (k.hat) { R(c, x - 4 * u, top + u, 8 * u, u, k.hat); R(c, x - 3 * u, top - u, 6 * u, 2 * u, k.hat); R(c, x - 3 * u, top - u, 6 * u, u, shade(k.hat, .15)); }
    if (k.umb) {                                         // 撐傘：手舉起來、傘在頭上
      const hx = x + dir * 3 * u;
      seg(c, hx, top + 10 * u, hx, top - 4 * u, '#3b3f4a');
      [[16, 0], [14, -1], [12, -2], [8, -3], [4, -4]].forEach(([w, dy]) => R(c, hx - w / 2 * u, top - 4 * u + dy * u, w * u, u, dy === 0 ? shade(k.umb, -.15) : dy < -2 ? shade(k.umb, .15) : k.umb));
    }
  }
  const DOG_ROWS = [
    ['................e...', '...............edd..', '..............ddddd.', '..............ddkddn', 't.............dddd..', '.t..dddddddddddddd..',
     '.tddddddddddddddd...', '..dddddddddddddddd..', '..ddddddddddddddd...', '..DDddddddddddDD....', '..DD.DD.....DD.DD...', '..DD.DD.....DD.DD...', '..oo.oo.....oo.oo...'],
    ['................e...', '...............edd..', '..............ddddd.', '..............ddkddn', '..............dddd..', 'tt..dddddddddddddd..',
     '..ddddddddddddddd...', '..dddddddddddddddd..', '..ddddddddddddddd...', '..DDddddddddddDD....', '...DDD.......DDD....', '...DDD.......DDD....', '...ooo.......ooo....']];
  function dog(c, x, y, k, t, dir) {                    // 別人家的狗（20×13 小格）
    const u = 1 / K, st = Math.floor(t / 120 + k.ph) % 2, col = k.dog;
    R(c, x - 7 * u, y + u, 14 * u, u, 'rgba(0,0,0,.18)');
    sprite(c, x, y, DOG_ROWS[st], k.dpal || (k.dpal = { d: col, D: shade(col, -.18), e: shade(col, -.3), k: '#2a2a2a', n: '#2a2a2a', t: col, o: shade(col, -.32) }), dir < 0, u);
  }
  // 鴿子、海鷗（2026-10-27 使用者選「路人走遠處」：近處只剩鳥會經過，照毛孩的比例畫大，16×12 格）：x＝中間、y＝腳底；朝右畫，k.dir＜0 左右翻
  const BIRD = {
    stand: ['...........hh...', '..........hhhh..', '..........hhehy.', '..........nnhh..', '...........nn...', '....wwwwwwbnn...',
            '..wwWWkWWwbbbb..', 'ttwWWkWWWbbbbb..', 'tttwWWWWbbbbbl..', '....bbbbbbbbl...', '.......ff.f.....', '......ff.ff.....'],
    peck:  ['................', '................', '................', '................', '....wwwwww......', '..wwWWkWWwbb....',
            'ttwWWkWWWbbbbn..', 'tttwWWWWbbbbbnn.', '....bbbbbbbbl.nn', '............nhhh', '.......ff.f..hey', '......ff.ff.....'],
    up:    ['ww.........ww...', '.www......www...', '..wwwwbbwwww.hh.', 'ttbbbbbbbbbbbhey', '..lbbbbbbbbl....'],
    down:  ['............hh..', 'ttbbbbbbbbbbbhey', '..wwwwbbbbwwww..', '.www.......www..', 'ww...........ww.'],
  };
  const PIGEON = { h: '#5a6070', e: '#e8743a', y: '#e8e4dc', n: '#4f8a78', b: '#8a8f9a', w: '#9aa0ac', W: '#aab0bb', k: '#3e424c', t: '#4f5460', l: '#a3a8b2', f: '#d0704a' };
  const GULL = { h: '#f4f4f0', e: '#2a2a2a', y: '#f2c531', n: '#f4f4f0', b: '#ecece8', w: '#c4c9d0', W: '#d4d8de', k: '#2a2a30', t: '#2a2a30', l: '#ffffff', f: '#f2a33a' };
  function sprite(c, x, y, rows, pal, flip, u = 1) {    // 一張用字畫的小圖：x＝中間、y＝最下面一列；u＝一格多大（細格子 1/K）
    const w = rows[0].length, x0 = Math.round((x - w * u / 2) / u) * u, y0 = Math.round((y - (rows.length - 1) * u) / u) * u;
    rows.forEach((row, j) => { for (let i = 0; i < w; i++) { const ch = row[i]; if (ch !== '.') R(c, x0 + (flip ? w - 1 - i : i) * u, y0 + j * u, u, u, pal[ch]); } });
  }
  function bird(c, x, y, k, t, fly) {                   // fly＝飛走中（翅膀上下拍）
    if (fly) { sprite(c, x, y, Math.floor(t / 90) % 2 ? BIRD.up : BIRD.down, k.pal, k.dir < 0); return; }
    R(c, Math.round(x) - 6, Math.round(y) + 1, 12, 1, 'rgba(0,0,0,.15)');
    sprite(c, x, y, Math.sin(t / 300 + k.ph * 3) > .6 ? BIRD.peck : BIRD.stand, k.pal, k.dir < 0);
  }
  function cyclist(c, x, y, k, t, dir) {                // 騎腳踏車的人（細格子：圓圓的輪子、車架、騎士上半身＋踩踏板的腳）
    const u = 1 / K, X = d => x + dir * d * u, ph = Math.floor(t / 120) % 2, tire = '#2a2a2e';
    R(c, x - 15 * u, y + u, 30 * u, u, 'rgba(0,0,0,.18)');
    for (const cx of [X(-9), X(9)]) {                    // 輪子：一圈輪胎、輪框、輪軸
      const cy = y - 6 * u;
      for (let a = 0; a < 48; a++) { const r = a / 48 * Math.PI * 2; R(c, cx + Math.round(Math.cos(r) * 6) * u, cy + Math.round(Math.sin(r) * 6) * u, u, u, tire); }
      for (let a = 0; a < 8; a++) { const r = a / 8 * Math.PI * 2 + t / 300 * dir; seg(c, cx, cy, cx + Math.cos(r) * 4.5 * u, cy + Math.sin(r) * 4.5 * u, '#9a9ea8'); }
      R(c, cx - u, cy - u, 2 * u, 2 * u, '#5a5e68');
    }
    const bk = k.bike, crank = [X(0), y - 5 * u], seat = [X(-4), y - 14 * u], stem = [X(6), y - 15 * u];
    seg(c, X(-9), y - 6 * u, crank[0], crank[1], bk); seg(c, crank[0], crank[1], seat[0], seat[1], bk); seg(c, X(-9), y - 6 * u, seat[0], seat[1] + u, bk);
    seg(c, seat[0], seat[1] + u, stem[0], stem[1] + u, bk); seg(c, crank[0], crank[1], stem[0], stem[1] + 2 * u, bk); seg(c, X(9), y - 6 * u, stem[0], stem[1], bk);
    R(c, Math.min(seat[0], X(-6)), seat[1] - u, 4 * u, u, '#2a2a2e'); R(c, Math.min(stem[0], X(8)) - u, stem[1] - 2 * u, 3 * u, u, '#2a2a2e');   // 座墊、手把
    const pal = personPal(k), hip = [X(-3), y - 16 * u];
    sprite(c, X(-2), y - 16 * u, P_HEAD.concat(P_BODY.slice(0, 7)), pal, dir < 0, u);   // 騎士：頭＋上半身
    const ped = ph ? [[X(3), y - 7 * u], [X(-3), y - 3 * u]] : [[X(-3), y - 3 * u], [X(3), y - 7 * u]];
    for (const [i, [px, py]] of ped.entries()) {          // 兩隻腳：大腿往前、小腿踩到踏板
      const knee = [X(4) + (i ? -u : 0), y - 13 * u + (py > y - 5 * u ? 2 * u : 0)];
      seg(c, hip[0], hip[1], knee[0], knee[1], i ? pal.B : pal.b, 2 * u); seg(c, knee[0], knee[1], px, py, i ? pal.B : pal.b, 2 * u); R(c, px - u, py, 3 * u, u, pal.o);
    }
    seg(c, X(1), y - 22 * u, stem[0], stem[1] - 2 * u, pal.a, 2 * u);   // 手臂握手把
  }
  // 這個場景會經過的：kind＝person 路人／hiker 背包客／student 學生／dogwalk 遛狗／dog 狗／cyclist 腳踏車／pigeon 鴿子／gull 海鷗
  // 2026-10-27 使用者選「背景放大一倍、路人走在步道上、鴿子跟毛孩一樣不放大」：人走在步道遠的那一側（跟背景一起放大）；鳥另外用 birds() 畫在放大後的畫面上
  function passersOf(list, g) {
    const rnd = rng(g.seed + 501), out = [];
    list.forEach(kind => {
      const flock = kind === 'pigeon' || kind === 'gull';
      if (g.night && flock) return;                       // 晚上鳥不在路上
      const dir = rnd() < .55 ? -1 : 1;                   // -1＝迎面走來；1＝同方向（毛孩走得比較快，會超過）
      const k = { kind, dir, ph: rnd() * 10, span: Math.round((380 + ri(rnd, 0, 320)) / g.Z), x0: rnd() * 700 / g.Z, h: ri(rnd, 12, 14),   // 背景放大 Z 倍：間隔也縮小，經過的次數跟以前一樣
        skin: pick(rnd, SKIN), hair: pick(rnd, HAIR), top: T(pick(rnd, TOPS), g.tod), bot: T(pick(rnd, BOTS), g.tod),
        dog: T(pick(rnd, ['#d9a05a', '#f4efe6', '#3a302a', '#a8774c', '#c9c9c0']), g.tod), bike: pick(rnd, ['#d9483b', '#3f7fc8', '#4fb36a']), white: kind === 'gull' };
      k.vx = (flock ? 0 : kind === 'cyclist' ? dir * ri(rnd, 18, 26) : dir * ri(rnd, 5, 9)) / g.Z;   // 背景放大 Z 倍：每秒走的格子少一點，畫面上一樣快
      k.y = g.p0 + (flock ? Math.round((g.p1 - g.p0) * (.22 + rnd() * .14)) : ri(rnd, 3, 5));
      if (flock) k.pal = Object.fromEntries(Object.entries(kind === 'gull' ? GULL : PIGEON).map(([ch, col]) => [ch, T(col, g.tod)]));
      if (g.w === 'rain' && !flock && kind !== 'cyclist' && kind !== 'dog' && rnd() < .85) k.umb = pick(rnd, ['#d9483b', '#3f7fc8', '#f2c531', '#3b3f4a']);
      if (kind === 'hiker') { k.bag = T('#b8483a', g.tod); k.hat = T('#d9b55a', g.tod); }
      if (kind === 'student') k.bag = pick(rnd, ['#3f7fc8', '#d9483b', '#2f3f5a']);
      if (kind === 'farmer') k.hat = T('#d9c27a', g.tod);
      out.push(k);
    });
    return out;
  }
  const passX = (k, scroll, t) => ((k.x0 + k.vx * t / 1000 - scroll) % k.span + k.span) % k.span - 30;   // 現在在畫面哪裡（背景的格子）
  function drawPassers(c, s, scroll, t) {               // 路人、遛狗、腳踏車：走在步道上（比毛孩遠一點），跟背景一起放大
    for (const k of s.passers) {
      if (k.kind === 'pigeon' || k.kind === 'gull') continue;
      const sx = passX(k, scroll, t);
      if (sx < -24 || sx > s.PW + 24) continue;
      if (k.kind === 'cyclist') cyclist(c, sx, k.y, k, t, k.dir);
      else if (k.kind === 'dog') dog(c, sx, k.y, k, t, k.dir);
      else {
        person(c, sx, k.y, k, t, k.dir);
        if (k.kind === 'dogwalk') {                         // 狗走在前面，牽繩從手拉到項圈（垂一點）
          const u = 1 / K, dx = sx + k.dir * 13;
          dog(c, dx, k.y + u, k, t, k.dir);
          const hx = sx + k.dir * 4 * u, hy = k.y - 12 * u, cx = dx + k.dir * 5 * u, cy = k.y - 8 * u;
          for (let i = 0; i <= 16; i++) { const f = i / 16; R(c, hx + (cx - hx) * f, hy + (cy - hy) * f + Math.sin(f * Math.PI) * 2 * u, u, u, '#c8372d'); }
        }
      }
    }
  }

  // ---------- AI 建築圖（2026-10-27 使用者選「甲：混合」：建築用本機 FLUX 產的圖，天空、路面、路人、燈光照舊用程式畫） ----------
  // 圖在 art/outdoor/<場景>_<種類>_<n>.png（mobile/tools/outdoor_facades.py：對齊格子、去白底、一棟一張），1 像素＝毛孩的 1 像素（細格子 K＝2 時才用）
  const FACADES = { beach: { boat: 5, castle: 4, cloud: 4, deck: 1, isle: 1, lighthouse: 2, moon: 2, palm: 10, palmm: 10, rope: 1, sand: 1, sea: 1, shore: 1, stuff: 6, sun: 2, tower: 2, umbrella: 5 }, campus: { city: 1, cloud: 4, fence: 1, fg: 1, field: 1, moon: 2, school: 1, stuff: 6, sun: 2, track: 1, tree: 4, treem: 4 }, country: { banyan: 1, cloud: 4, fg: 1, hill: 1, house: 1, moon: 2, paddy: 1, path: 1, scare: 3, stuff: 6, sun: 2 }, flowers: { bed: 1, cloud: 4, fg: 1, field: 1, front: 5, hill: 1, moon: 2, path: 1, sun: 2, sunf: 10, sunfm: 10, windmill: 1 }, forest: { cabin: 2, cloud: 4, far: 1, fg: 1, floor: 1, moon: 2, path: 1, stuff: 6, sun: 2, tree: 8, treem: 8 }, harbor: { boat: 8, boats: 8, chain: 1, cloud: 4, dock: 1, light: 1, moon: 2, quay: 1, stuff: 6, sun: 2, town: 1, water: 1 }, mountain: { cloud: 4, fg: 1, marker: 5, moon: 2, pavilion: 1, peaks: 1, pine: 3, pinem: 2, rock: 5, slope: 1, steps: 1, sun: 2 }, nightmarket: { bulbs: 1, city: 1, cloud: 4, fg: 1, moon: 2, road: 1, stall: 9, stuff: 6, sun: 2 }, park: { city: 1, cloud: 4, fg: 1, fountain: 2, lawn: 1, moon: 2, path: 1, stuff: 6, sun: 2, tree: 4, treem: 4, trees: 4 }, river: { bank: 1, boat: 7, bridge: 3, cloud: 4, grass: 1, hill: 1, moon: 2, path: 1, reed: 6, sun: 2, water: 1, willow: 3, willowm: 3 }, sakura: { cloud: 4, fg: 1, hill: 1, lawn: 1, moon: 2, path: 1, stuff: 5, sun: 2, torii: 1, tree: 3, treem: 3, trees: 3 }, snow: { bank: 1, bush: 5, cabin: 2, cloud: 4, fence: 1, field: 1, forest: 1, moon: 2, mountain: 1, path: 1, pine: 10, pinem: 10, pines: 10, snowman: 3, sun: 2 }, street: { city: 1, cloud: 4, fg: 1, front: 6, house: 9, lantern: 1, moon: 2, road: 1, sun: 2, temple: 2 } };   // 幾張（mobile/tools/outdoor_facades.py 切出來的數量）
  const ART = {}, artWait = {};
  let artVer = 0;                                         // 每讀好一張 +1（pocket.js 換新的才會重畫場景）
  function artLoad(sc) {                                  // 出門到這個場景才下載它的圖（不是一打開網頁就全部下載）；回傳全部讀好的 Promise
    if (!artWait[sc]) {
      const loads = [];
      for (const [kind, n] of Object.entries(FACADES[sc] || {}))
        ART[sc + '_' + kind] = Array.from({ length: n }, (_, i) => {
          const im = new Image();
          loads.push(new Promise(r => { im.onload = () => { artVer++; r(); }; im.onerror = r; }));
          im.src = `art/outdoor/${sc}_${kind}_${i + 1}.png`;
          return im;
        });
      artWait[sc] = Promise.all(loads);
    }
    return artWait[sc];
  }
  const artOf = (sc, kind) => { artLoad(sc); const list = ART[sc + '_' + kind] || []; return K > 1 && list.length && list.every(im => im.complete && im.naturalWidth) ? list : null; };   // 讀好了才用（細格子才用；還沒好就先用程式畫的）
  const TINT = { morning: 'rgba(255,244,226,.1)', evening: 'rgba(184,106,82,.3)', night: 'rgba(28,34,64,.45)' };
  const tinted = new Map();
  function artImg(im, tod) {                               // 圖是白天畫的：早上、傍晚、晚上蓋一層顏色（跟程式畫的 T() 差不多），做好存起來重複用
    if (!TINT[tod]) return im;
    const key = im.src + '|' + tod;
    let cv = tinted.get(key);
    if (!cv) {
      cv = document.createElement('canvas'); cv.width = im.width; cv.height = im.height;
      const c = cv.getContext('2d'); c.drawImage(im, 0, 0); c.globalCompositeOperation = 'source-atop'; c.fillStyle = TINT[tod]; c.fillRect(0, 0, cv.width, cv.height);
      tinted.set(key, cv);
    }
    return cv;
  }
  function artAt(c, im, x, base, tod) {                    // 放一張圖：x＝中間、base＝底邊（背景的格子；圖 1 像素＝1 小格），超出左右邊就從另一邊接回來
    const src = artImg(im, tod), w = im.width / K, h = im.height / K, x0 = snap(x - w / 2), y0 = snap(base - h);
    c.drawImage(src, x0, y0, w, h);
    if (x0 < 0) c.drawImage(src, x0 + TW, y0, w, h);
    if (x0 + w > TW) c.drawImage(src, x0 - TW, y0, w, h);
    return { w, h };
  }
  function artRow(c, rnd, list, base, tod, mark) {         // 一個接一個排一排（剩下的寬度平均分成空隙，左右接得起來）；mark＝{at 第幾個, list} 換成地標；回傳每個的 {x 中間, w, h}
    const seq = [];
    let sum = 0;
    for (let i = 0; ; i++) { const L = mark && i === mark.at ? mark.list : list, im = L[Math.floor(rnd() * L.length)], w = im.width / K; if (sum + w > TW) break; seq.push(im); sum += w; }
    const gap = (TW - sum) / seq.length, out = [];
    let x = gap / 2;
    for (const im of seq) { const w = im.width / K; out.push({ x: x + w / 2, ...artAt(c, im, x + w / 2, base, tod) }); x += w + gap; }
    return out;
  }
  const pickArt = (rnd, list) => list[Math.floor(rnd() * list.length)];
  function horizonHaze(c, g, top, depth) {                 // 地平線那邊的地面、東西淡淡蓋一層天空色，往近處慢慢變清楚（2026-10-28 使用者「沒有過度」：遠景和地面中間一條硬直線）
    const gr = c.createLinearGradient(0, top, 0, top + depth), [r, gg, b] = [1, 3, 5].map(i => parseInt(g.skyLow.slice(i, i + 2), 16));   // skyLow＝#rrggbb
    gr.addColorStop(0, `rgba(${r},${gg},${b},.6)`); gr.addColorStop(1, `rgba(${r},${gg},${b},0)`);
    c.save(); c.globalCompositeOperation = 'source-atop'; c.fillStyle = gr; c.fillRect(0, top, TW, depth); c.restore();
  }
  function artStrip(c, im, base, tod, x0 = 0) {            // 長條（雪山、松林、柵欄…）：一段接一段鋪滿整層，底邊在 base；寬度整除 TW 才接得起來（outdoor_facades.py --strip 會挑）
    const src = artImg(im, tod), w = im.width / K, h = im.height / K, off = ((x0 % w) + w) % w;
    for (let x = off - w; x < TW; x += w) c.drawImage(src, snap(x), snap(base - h), w, h);
  }
  function artEdge(im, tod, side) {                        // 長條最上面（或最下面）那排中間的顏色：拿來墊底（長條比要填的地方矮時）
    const cv = document.createElement('canvas'); cv.width = im.width; cv.height = im.height;
    const c = cv.getContext('2d'); c.drawImage(artImg(im, tod), 0, 0);
    const d = c.getImageData(0, 0, im.width, im.height).data;
    for (let k = 0; k < im.height; k++) {                  // 從那一邊往裡找第一排不透明的
      const y = side === 'top' ? k : im.height - 1 - k, i = (y * im.width + (im.width >> 1)) * 4;
      if (d[i + 3] > 200) return `rgb(${d[i]},${d[i + 1]},${d[i + 2]})`;
    }
    return '#ffffff';
  }
  function artFill(c, im, top, bottom, tod, from = 'bottom') {   // 用長條材質（雪原、步道…）填滿 top～bottom：from＝bottom 底對齊（切掉上面）、top 頂對齊（切掉下面）；長條比較矮就先用它最上面那排的顏色墊底
    const src = artImg(im, tod), w = im.width / K, h = im.height / K, need = bottom - top;
    if (from === 'tile') {                                 // tile＝上下也一段接一段（木棧道的直木板）；只用中間那段（長條上下邊比較亮或暗，接起來會有橫線）
      const cut = Math.round(im.height * .15), bh = (im.height - 2 * cut) / K;
      for (let y = top; y < bottom; y += bh) { const sh = Math.min(bh, bottom - y); for (let x = 0; x < TW; x += w) c.drawImage(src, 0, cut, im.width, sh * K, snap(x), snap(y), w, sh); }
      return;
    }
    if (h < need) R(c, 0, top, TW, need, artEdge(im, tod, from === 'bottom' ? 'top' : 'bottom'));
    const sh = Math.min(h, need), sy = from === 'bottom' ? (h - sh) * K : 0, dy = from === 'bottom' ? bottom - sh : top;
    for (let x = 0; x < TW; x += w) c.drawImage(src, 0, sy, im.width, sh * K, snap(x), snap(dy), w, sh);
  }

  // ---------- 雪地素材庫（2026-10-27 使用者「從太陽到海到每一棵樹到田到花都要一致、又可以隨機」→ 先做雪地、風格樣本老街 B）----------
  // 全部是 AI 圖（art/ai/outdoor_flux/gen_kit.py 產、cut_kit.py 切、同一套顏色）；程式只決定挑哪一張、放哪、哪個大小（pines 小／pinem 中／pine 大）
  const SNOW_KIT = ['mountain', 'forest', 'field', 'fence', 'path', 'bank', 'pine', 'pinem', 'pines', 'cabin', 'snowman', 'bush'];
  function snowKit(g) {
    const { PH, gy, p0, p1, tod, lit } = g, rnd = rng(78), out = [], lights = [], A = k => artOf('snow', k);
    const far = layer(PH), fc = far.getContext('2d');
    artStrip(fc, A('mountain')[0], gy + 6, tod);                                  // 遠山
    out.push({ cv: far, v: .05 });
    const far2 = layer(PH), f2c = far2.getContext('2d');
    artStrip(f2c, A('forest')[0], gy + 12, tod, ri(rnd, 0, 90));                  // 遠處的松林
    out.push({ cv: far2, v: .2 });
    const mid = layer(PH), mc = mid.getContext('2d');
    artFill(mc, A('field')[0], gy + 8, p0 + 1, tod);                               // 雪原
    for (const x of spots(rnd, 10, 26)) artAt(mc, pickArt(rnd, A('pines')), x, gy + 16 + ri(rnd, 0, 3), tod);   // 遠一排小松樹
    const midY = Math.round(gy + (p0 - gy) * .55);
    for (const x of spots(rnd, 22, 50)) if (rnd() < .7) artAt(mc, pickArt(rnd, A('pinem')), x, midY + ri(rnd, 0, 3), tod);   // 中間一排中松樹
    const cabin = ri(rnd, 40, TW - 60), sm = (cabin + ri(rnd, 120, 300)) % TW;
    for (const x of spots(rnd, 34, 80)) if (Math.abs(x - cabin) > 40 && Math.abs(x - sm) > 18) artAt(mc, pickArt(rnd, A('pine')), x, p0 - 3, tod);   // 前面一排大松樹
    const cab = artAt(mc, pickArt(rnd, A('cabin')), cabin, p0 - 6, tod);         // 地標：小木屋（晚上窗戶亮）
    if (lit) for (const f of [-.27, .27]) lights.push({ x: cabin + cab.w * f, y: p0 - 6 - cab.h * .3, v: .55, r: 14, col: '255,210,140' });
    artAt(mc, pickArt(rnd, A('snowman')), sm, p0 - 2, tod);                       // 雪人
    for (const x of spots(rnd, 40, 90)) if (rnd() < .5 && Math.abs(x - cabin) > 30) artAt(mc, pickArt(rnd, A('bush')), x, p0 - 2 - ri(rnd, 0, 8), tod);   // 雪叢、石頭、樹樁、紅漿果
    artStrip(mc, A('fence')[0], p0 + 1, tod, ri(rnd, 0, 60));                     // 柵欄
    out.push({ cv: mid, v: .55 });
    const path = layer(PH), pc = path.getContext('2d');
    artFill(pc, A('path')[0], p0, p1, tod, 'top');                                // 踩出來的雪路
    out.push({ cv: path, v: 1, path: true });
    const fg = layer(PH), fgc = fg.getContext('2d');
    R(fgc, 0, p1, TW, PH - p1, artEdge(A('bank')[0], tod, 'bottom')); artStrip(fgc, A('bank')[0], PH, tod, ri(rnd, 0, 40));   // 前景的雪堆：先鋪雪、雪堆從最下面長上來
    out.push({ cv: fg, v: 1.25 });
    out.push(frontLayer(g, (c, r, b, hmax) => { for (const x of spots(r, 46, 100)) artAt(c, pickArt(r, A('bush')), x, b, tod); }));   // 靠鏡頭：雪叢
    const chim = cab.w * -.32, chimTop = p0 - 6 - cab.h;                           // 煙囪（AI 小木屋的煙囪在左上）
    return { layers: out, lights, fx(c, a) {             // 飄雪（晴天少、陰天多、下雨變大雪）＋煙囪冒煙
      const n = a.w === 'rain' ? 46 : a.w === 'cloud' ? 28 : 14;
      for (let i = 0; i < n; i++) {
        const sp = 10 + (i % 6) * 4, y = ((i * 29 + a.t / 1000 * sp) % (PH + 6)) - 3, x = ((i * 47 + Math.sin(a.t / 900 + i * 1.3) * 5 - a.scroll * .6) % a.PW + a.PW) % a.PW;
        R(c, x, y, i % 4 ? 1 / K : 1, i % 4 ? 1 / K : 1, '#ffffff');
      }
      const cx = ((cabin + chim - a.scroll * .55) % TW + TW) % TW;
      for (const bx of [cx, cx - TW]) if (bx > -6 && bx < a.PW + 6) for (let k = 0; k < 4; k++) { const up = (a.t / 1000 * 5 + k * 4) % 16; R(c, bx + Math.sin(a.t / 500 + k) * 1.5, chimTop - up, 2, 2, `rgba(235,235,240,${(.55 - up / 32).toFixed(2)})`); }
    } };
  }

  // ---------- 海邊素材庫（2026-10-28 使用者「海邊照清單開工」；做法同雪地）----------
  const BEACH_KIT = ['isle', 'lighthouse', 'sea', 'boat', 'shore', 'palm', 'palmm', 'tower', 'umbrella', 'stuff', 'deck', 'rope', 'sand', 'castle'];
  function beachKit(g) {
    const { PH, gy, p0, p1, tod, night, lit } = g, rnd = rng(22), out = [], lights = [], A = k => artOf('beach', k);
    const far = layer(PH), fc = far.getContext('2d');
    artStrip(fc, A('isle')[0], gy + 1, tod, ri(rnd, 0, 90));                      // 海平線上的小島
    const lx = ri(rnd, 50, 110), lh = artAt(fc, pickArt(rnd, A('lighthouse')), lx, gy + 2, tod);   // 地標：燈塔（晚上亮）；遠景捲得很慢，放在一開始看得到的地方
    lights.push({ x: lx, y: gy + 2 - lh.h * .85, v: .05, r: 12, col: '255,240,190' });
    out.push({ cv: far, v: .05 });
    const shoreTop = p0 - BEACH_SHORE;                                              // 沙灘（浪花以下）從這裡開始
    const sea = layer(PH), sc = sea.getContext('2d');
    artFill(sc, A('sea')[0], gy, shoreTop + 2, tod);                               // 海面（底對齊：靠岸的淺藍一定看得到）
    horizonHaze(sc, g, gy - 2, Math.round((shoreTop - gy) * .5) + 2);
    for (const x of spots(rnd, 90, 190)) artAt(sc, pickArt(rnd, A('boat')), x, ri(rnd, gy + 8, Math.round(gy + (shoreTop - gy) * .55)), tod);   // 帆船、漁船、浮球（離岸遠一點）
    artFill(sc, A('shore')[0], shoreTop - BEACH_FOAM, p0 + 1, tod, 'bottom');    // 浪花打上沙灘
    out.push({ cv: sea, v: .35 });
    const mid = layer(PH), mc = mid.getContext('2d');
    const tower = ri(rnd, 30, TW - 30);
    for (const x of spots(rnd, 40, 90)) if (rnd() < .6 && Math.abs(x - tower) > 30) artAt(mc, pickArt(rnd, A('palmm')), x, p0 - 4, tod);   // 中椰子樹（後面一排）
    artAt(mc, pickArt(rnd, A('tower')), tower, p0 - 1, tod);                       // 地標：救生員塔
    for (const x of spots(rnd, 50, 110)) if (Math.abs(x - tower) > 30) artAt(mc, pickArt(rnd, A('palm')), x, p0 - 1, tod);   // 大椰子樹
    for (const x of spots(rnd, 60, 120)) if (Math.abs(x - tower) > 26) artAt(mc, pickArt(rnd, A(rnd() < .6 ? 'umbrella' : 'stuff')), x, p0, tod);   // 陽傘＋海灘巾、沙灘椅、衝浪板…
    out.push({ cv: mid, v: .7 });
    const path = layer(PH), pc = path.getContext('2d');
    artFill(pc, A('deck')[0], p0, p1, tod, 'tile');                                // 木棧道（直木板上下接）
    artStrip(pc, A('rope')[0], p0 + 2, tod, ri(rnd, 0, 40));                      // 欄杆＋繩子
    out.push({ cv: path, v: 1, path: true });
    const fg = layer(PH), fgc = fg.getContext('2d');
    R(fgc, 0, p1, TW, PH - p1, artEdge(A('sand')[0], tod, 'bottom'));
    artFill(fgc, A('sand')[0], p1, PH, tod, 'top');                                // 前景沙地：貝殼、海星、腳印
    out.push({ cv: fg, v: 1.25 });
    out.push(frontLayer(g, (c, r, b, hmax) => { for (const x of spots(r, 50, 110)) artAt(c, pickArt(r, A('castle')), x, b, tod); }));   // 靠鏡頭：沙堡、水桶、草叢
    return { layers: out, lights, anim(c, a) {          // 海面一閃一閃（程式畫，會動）
      const off = a.scroll * .35;
      for (let i = 0; i < 18; i++) {
        const x = ((i * 37 - off) % a.PW + a.PW) % a.PW, y = gy + 3 + (i * 11) % Math.max(1, shoreTop - 6 - gy), on = Math.sin(a.t / 400 + i * 1.3) > .5;
        if (on) R(c, x, y, 2, 1 / K, night ? '#c9cff0' : '#ffffff');
      }
    } };
  }
  const BEACH_SHORE = 10, BEACH_FOAM = 6;                // 沙灘多高、浪花那段多高（看切出來的 shore 調）

  // ---------- 通用排版器（2026-10-28 使用者「全部做」：其他 10 個場景照雪地、海邊的做法，每個場景只寫一份設定 KIT）----------
  // 一層＝{v 捲動速度, path?, ops}；op：
  //   ['strip', 種類, 底(g)]                    長條一段接一段
  //   ['fill', 種類, 上(g), 下(g), 'bottom'|'top'|'tile']   長條填滿一塊
  //   ['mark', 種類, 底(g), {x:[左,右], light:[[x 幾成, 離底幾成, 半徑, 顏色]]}]   地標（一個）
  //   ['row', 種類, 底(g), {gap:[最小,最大], p 出現機率, jit 上下亂一點, clear 離地標多遠}]   隨機排一排
  //   ['houses', 種類, 底(g), 地標種類]          一棟接一棟排滿（老街、夜市攤位），中間一棟換成地標
  //   ['glow', 高(g), {gap, r, col}]             一串燈（傍晚、晚上亮）
  //   ['solid', 上(g), 下(g), 顏色]               一塊底色（攤位、房子中間的空隙看到的是暗暗的巷子，不是天空的盡頭）
  // {front: 種類, strip?, gap}＝靠鏡頭那層；fx(g, at)＝會動的（at＝每種東西排在哪）
  const gyAt = f => g => Math.round(g.gy + (g.p0 - g.gy) * f);   // 地平線到步道之間的幾成
  const KIT = {
    harbor: { layers: [
      { v: .05, ops: [['strip', 'town', g => g.gy + 1], ['mark', 'light', g => g.gy + 2, { x: [50, 110], light: [[0, .9, 12, '255,120,90']] }]] },
      { v: .35, ops: [['fill', 'water', g => g.gy, g => g.p0 + 1], ['row', 'boats', gyAt(.45), { gap: [80, 170], p: .8 }]] },
      { v: .7, ops: [['row', 'boat', g => g.p0 + 4, { gap: [60, 120], p: .85 }]] },
      { v: 1, path: true, ops: [['fill', 'dock', g => g.p0, g => g.p1, 'top'], ['row', 'stuff', g => g.p0 + 6, { gap: [50, 120], p: .6 }]] },
      { v: 1.25, ops: [['fill', 'quay', g => g.p1, g => g.PH, 'top']] },
      { front: 'chain', strip: true }] },
    river: { layers: [
      { v: .05, ops: [['strip', 'hill', g => g.gy + 2]] },
      { v: .3, ops: [['fill', 'water', g => g.gy, gyAt(.55), 'top'], ['mark', 'bridge', gyAt(.45), {}], ['row', 'boat', gyAt(.35), { gap: [90, 180], p: .7, clear: 10 }], ['fill', 'bank', gyAt(.5), g => g.p0 + 1, 'top']] },
      { v: .7, ops: [['row', 'willowm', gyAt(.72), { gap: [40, 90], p: .6 }], ['row', 'willow', g => g.p0 - 1, { gap: [60, 120], p: .8 }], ['row', 'reed', g => g.p0, { gap: [30, 70], p: .6 }]] },
      { v: 1, path: true, ops: [['fill', 'path', g => g.p0, g => g.p1, 'top']] },
      { v: 1.25, ops: [['fill', 'grass', g => g.p1, g => g.PH, 'top']] },
      { front: 'reed', gap: [40, 90] }] },
    flowers: { snug: 'field', layers: [
      { v: .05, ops: [['strip', 'hill', g => g.gy + 6]] },   // 遠山最下面幾排是平的淡綠，往下塞到向日葵田後面
      { v: .3, ops: [['fill', 'field', g => g.gy + 1, g => g.p0 + 1], ['mark', 'windmill', gyAt(.5), {}], ['row', 'sunfm', gyAt(.75), { gap: [20, 45], p: .7, clear: 6 }]] },
      { v: .7, ops: [['row', 'sunf', g => g.p0 - 1, { gap: [26, 60], p: .8 }], ['strip', 'bed', g => g.p0 + 1]] },
      { v: 1, path: true, ops: [['fill', 'path', g => g.p0, g => g.p1, 'top']] },
      { v: 1.25, ops: [['fill', 'fg', g => g.p1, g => g.PH, 'top']] },
      { front: 'front', gap: [50, 110] }] },
    sakura: { layers: [
      { v: .05, ops: [['strip', 'hill', g => g.gy + 2]] },
      { v: .3, ops: [['fill', 'lawn', g => g.gy, g => g.p0 + 1], ['row', 'trees', gyAt(.35), { gap: [18, 40], p: .8 }], ['row', 'treem', gyAt(.65), { gap: [30, 70], p: .7 }]] },
      { v: .7, ops: [['mark', 'torii', g => g.p0 - 1, {}], ['row', 'tree', g => g.p0 - 1, { gap: [60, 120], p: .8, clear: 8 }], ['row', 'stuff', g => g.p0, { gap: [40, 90], p: .6, clear: 6 }]] },
      { v: 1, path: true, ops: [['fill', 'path', g => g.p0, g => g.p1, 'top']] },
      { v: 1.25, ops: [['fill', 'fg', g => g.p1, g => g.PH, 'top']] },
      { front: 'stuff', gap: [60, 120] }] },
    country: { layers: [
      { v: .05, ops: [['strip', 'hill', g => g.gy + 2]] },
      { v: .3, ops: [['fill', 'paddy', g => g.gy, g => g.p0 + 1], ['mark', 'house', gyAt(.45), { light: [[-.2, .35, 10, '255,210,140'], [.2, .35, 10, '255,210,140']] }], ['row', 'stuff', gyAt(.7), { gap: [70, 150], p: .6, clear: 8 }]] },
      { v: .7, ops: [['mark', 'banyan', g => g.p0 - 1, {}], ['row', 'scare', g => g.p0, { gap: [100, 200], p: .6, clear: 20 }]] },
      { v: 1, path: true, ops: [['fill', 'path', g => g.p0, g => g.p1, 'top']] },
      { v: 1.25, ops: [['fill', 'fg', g => g.p1, g => g.PH, 'top']] }] },
    park: { layers: [
      { v: .05, ops: [['strip', 'city', g => g.gy + 1]] },
      { v: .3, ops: [['fill', 'lawn', g => g.gy, g => g.p0 + 1], ['row', 'trees', gyAt(.3), { gap: [16, 36] }], ['row', 'treem', gyAt(.6), { gap: [30, 70], p: .7 }]] },
      { v: .7, ops: [['mark', 'fountain', g => g.p0 - 1, {}], ['row', 'tree', g => g.p0 - 1, { gap: [60, 120], p: .9, clear: 8 }], ['row', 'stuff', g => g.p0, { gap: [40, 90], p: .7, clear: 6 }]] },
      { v: 1, path: true, ops: [['fill', 'path', g => g.p0, g => g.p1, 'top']] },
      { v: 1.25, ops: [['fill', 'fg', g => g.p1, g => g.PH, 'top']] }] },
    forest: { layers: [
      { v: .05, ops: [['strip', 'far', g => g.gy + 8]] },
      { v: .3, ops: [['fill', 'floor', g => g.gy + 4, g => g.p0 + 1], ['row', 'treem', gyAt(.45), { gap: [20, 50], p: .8 }]] },
      { v: .7, ops: [['mark', 'cabin', g => g.p0 - 2, { light: [[-.22, .35, 12, '255,210,140'], [.22, .35, 12, '255,210,140']] }], ['row', 'tree', g => g.p0 - 1, { gap: [40, 90], p: .9, clear: 10 }], ['row', 'stuff', g => g.p0, { gap: [30, 70], p: .7, clear: 6 }]] },
      { v: 1, path: true, ops: [['fill', 'path', g => g.p0, g => g.p1, 'top']] },
      { v: 1.25, ops: [['fill', 'fg', g => g.p1, g => g.PH, 'top']] }] },
    mountain: { layers: [
      { v: .05, ops: [['strip', 'peaks', g => g.gy + 4]] },
      { v: .35, ops: [['fill', 'slope', g => g.gy + 2, g => g.p0 + 1], ['row', 'pinem', gyAt(.4), { gap: [30, 70], p: .6 }], ['row', 'rock', gyAt(.75), { gap: [50, 110], p: .6 }]] },
      { v: .7, ops: [['mark', 'pavilion', g => g.p0 - 1, {}], ['row', 'pine', g => g.p0 - 1, { gap: [60, 130], p: .8, clear: 10 }], ['row', 'marker', g => g.p0, { gap: [50, 110], p: .6, clear: 6 }]] },
      { v: 1, path: true, ops: [['fill', 'steps', g => g.p0, g => g.p1, 'top']] },
      { v: 1.25, ops: [['fill', 'fg', g => g.p1, g => g.PH, 'top']] }] },
    nightmarket: { layers: [
      { v: .05, ops: [['strip', 'city', g => g.gy + 2]] },
      { v: .5, ops: [['solid', g => g.p0 - 22, g => g.p0, '#3b3346'], ['houses', 'stall', g => g.p0 + .5, null], ['strip', 'bulbs', g => g.p0 - 25], ['glow', g => g.p0 - 28, { gap: 16, r: 10, col: '255,210,140' }]] },   // 10-28 攤位縮成 52 小格（26 格）：底色、燈泡跟著攤位頂，不然底色上半截露出來
      { v: 1, path: true, ops: [['fill', 'road', g => g.p0, g => g.p1, 'top'], ['row', 'stuff', g => g.p0 + 5, { gap: [50, 110], p: .6 }]] },
      { v: 1.25, ops: [['fill', 'fg', g => g.p1, g => g.PH, 'top']] }],
      fx: (g, at) => (c, a) => (at.stall || []).forEach((b, i) => {        // 攤位冒煙
        if (i % 3 === 2) return;
        const baseX = ((b.x - a.scroll * .5) % TW + TW) % TW, up = (a.t / 1000 * 6 + i * 5) % 14;
        for (const bx of [baseX, baseX - TW, baseX + TW]) if (bx > -4 && bx < a.PW + 4) R(c, bx + Math.sin(a.t / 400 + i) * 1.5, g.p0 - b.h * .55 - up, 2, 1, `rgba(255,255,255,${(.5 - up / 30).toFixed(2)})`);
      }) },
    campus: { layers: [
      { v: .05, ops: [['strip', 'city', g => g.gy + 2]] },
      { v: .3, ops: [['fill', 'field', g => g.gy + 1, g => g.p0 + 1], ['mark', 'school', gyAt(.6), { x: [60, TW - 60] }], ['row', 'treem', gyAt(.65), { gap: [30, 70], p: .7, clear: 8 }]] },
      { v: .7, ops: [['row', 'tree', g => g.p0 - 1, { gap: [60, 120], p: .8 }], ['row', 'stuff', g => g.p0 - 1, { gap: [50, 110], p: .7, clear: 10 }], ['strip', 'fence', g => g.p0 + 1]] },
      { v: 1, path: true, ops: [['fill', 'track', g => g.p0, g => g.p1, 'top']] },
      { v: 1.25, ops: [['fill', 'fg', g => g.p1, g => g.PH, 'top']] }] },
    street: { layers: [
      { v: .05, ops: [['strip', 'city', g => g.gy + 2]] },
      { v: .5, ops: [['solid', g => g.gy + 2, g => g.p0, '#4e423e'], ['houses', 'house', g => g.p0 + .5, 'temple'], ['strip', 'lantern', g => g.p0 - 24], ['glow', g => g.p0 - 27, { gap: 22, r: 14, col: '255,150,110' }]] },
      { v: 1, path: true, ops: [['fill', 'road', g => g.p0, g => g.p1, 'top']] },
      { v: 1.25, ops: [['fill', 'fg', g => g.p1, g => g.PH, 'top']] },
      { front: 'front', gap: [60, 130] }] },
  };
  for (const cfg of Object.values(KIT)) {                  // 這個場景要用到的種類（全部讀好才換成素材庫）
    const need = new Set();
    for (const L of cfg.layers) { if (L.front) need.add(L.front); for (const op of L.ops || []) { if (op[0] !== 'glow' && op[0] !== 'solid') need.add(op[1]); if (op[0] === 'houses' && op[3]) need.add(op[3]); } }
    cfg.need = [...need];
  }
  function kitScene(g, name, cfg) {
    const A = k => artOf(name, k);
    if (cfg.snug) {                                          // snug＝這種地面長條不夠高時，不墊平平的一條顏色，整個地平線往下移貼著它（2026-10-28 花田遠山和向日葵田中間那條）
      const f = cfg.layers.flatMap(L => L.ops || []).find(op => op[0] === 'fill' && op[1] === cfg.snug), h = A(cfg.snug)[0].height / K;
      const gap = f[3](g) - f[2](g) - h;
      if (gap > 0) g = { ...g, gy: g.gy + Math.ceil(gap) };
    }
    const { PH, tod, lit } = g, rnd = rng(g.seed + 5), out = [], lights = [], marks = [], at = {};
    let hazed = false;
    for (const L of cfg.layers) {
      if (L.front) {
        out.push(frontLayer(g, (c, r, b) => {
          if (L.strip) artStrip(c, A(L.front)[0], b, tod, ri(r, 0, 60));
          else for (const x of spots(r, ...(L.gap || [50, 110]))) artAt(c, pickArt(r, A(L.front)), x, b, tod);
        }));
        continue;
      }
      const cv = layer(PH), c = cv.getContext('2d');
      for (const op of L.ops) {
        const [t, k] = op;
        if (t === 'strip') artStrip(c, A(k)[0], op[2](g), tod, ri(rnd, 0, 90));
        else if (t === 'fill') {                            // 頂對齊（地面、前景）：先鋪長條最下面那排的顏色，長條上面透明的地方（蕨類、花叢的頂）才不會露出天空
          if (op[4] === 'top') R(c, 0, op[2](g), TW, op[3](g) - op[2](g), artEdge(A(k)[0], tod, 'bottom'));
          artFill(c, A(k)[0], op[2](g), op[3](g), tod, op[4]);
          if (!hazed && L.v > .05 && L.v < 1 && !L.path) { horizonHaze(c, g, op[2](g) - 2, Math.round((g.p0 - g.gy) * .45) + 2); hazed = true; }   // 最遠那塊地面：畫完地面、還沒放樹和房子前蓋（蓋在樹上會變一塊方框）
        }
        else if (t === 'mark') {
          const o = op[3] || {}, x = ri(rnd, ...(o.x || [40, TW - 40])), base = op[2](g), b = artAt(c, pickArt(rnd, A(k)), x, base, tod);
          marks.push({ x, w: b.w }); at[k] = [{ x, ...b }];
          if (lit) for (const [fx, fy, r, col] of o.light || []) lights.push({ x: x + b.w * fx, y: base - b.h * fy, v: L.v, r, col });
        } else if (t === 'row') {
          const o = op[3] || {}, base = op[2](g), list = A(k), got = at[k] = [];
          for (const x of spots(rnd, ...(o.gap || [30, 80]))) {
            if (rnd() > (o.p ?? 1) || marks.some(m => Math.abs(x - m.x) < m.w / 2 + (o.clear ?? 4))) continue;
            got.push({ x, ...artAt(c, pickArt(rnd, list), x, base - (o.jit ? ri(rnd, 0, o.jit) : 0), tod) });
          }
        } else if (t === 'houses') at[k] = artRow(c, rnd, A(k), op[2](g), tod, op[3] ? { at: ri(rnd, 0, 3), list: A(op[3]) } : undefined);
        else if (t === 'solid') R(c, 0, op[1](g), TW, op[2](g) - op[1](g), T(op[3], tod));
        else if (t === 'glow' && lit) { const o = op[2]; for (let x = o.gap / 2; x < TW; x += o.gap) lights.push({ x, y: op[1](g), v: L.v, r: o.r, col: o.col }); }
      }
      if (L.v <= .05) { c.save(); c.globalCompositeOperation = 'source-atop'; c.globalAlpha = .35; c.fillStyle = g.skyLow; c.fillRect(0, 0, TW, PH); c.restore(); }   // 最遠那層蓋一層天空色的霧（2026-10-28「遠景的層級有點怪」：遠山、遠處城市要淡，才看得出是遠的）
      out.push({ cv, v: L.v, ...(L.path ? { path: true } : {}) });
    }
    return { layers: out, lights, fx: cfg.fx ? cfg.fx(g, at) : null };
  }

  // ---------- 場景：每個回傳 {layers: [{cv, v（捲動速度，步道＝1）, path?}], lights: [{x, y, v, r, warm?, col?}], anim(c, a)（畫在第 animAt 層上）, fx(c, a)（最前面）}；snowy＝下雨改下雪 ----------
  // g＝{PW, PH, gy（地平線）, p0、p1（步道上下）, tod, w（天氣）, night, lit, seed}；geo＝這個場景的地平線、步道（PH 的幾成；毛孩腳在 .8，步道要包住它）
  // sky＝天空裡會動的、passers＝路上會經過的、balloon＝熱氣球的兩個顏色
  const SCENES = {
    park: { label: '公園', sky: ['birds', 'balloon', 'plane'], passers: ['pigeon', 'pigeon', 'person', 'dogwalk', 'person'], build(g) {   // 城市公園：遠山、城市、電視塔、兩排樹、噴水池、長椅
      const { PH, gy, p0, p1, tod, night, lit } = g, rnd = rng(11), out = [];
      const GRASS = { morning: '#8fbf7a', day: '#7fb36a', evening: '#7e8c66', night: '#2f4a3c' }[tod], GRASS2 = { morning: '#7aad66', day: '#6aa057', evening: '#6c7a56', night: '#273f33' }[tod];
      const TREE = { morning: '#4f9450', day: '#46894a', evening: '#4f6a45', night: '#1f3a2c' }[tod], PATH = { morning: '#ddd3c2', day: '#d8cdb9', evening: '#b9a48f', night: '#4c4b5e' }[tod];
      const TREES = [TREE, T('#5a9a4a', tod), T('#3f7a45', tod), TREE, T('#d98a3a', tod), T('#6aa84a', tod)];
      const hills = layer(PH);
      ridge(hills.getContext('2d'), rnd, gy - 4, 30, mix(T('#8fa3b8', tod), g.skyLow, .55));
      out.push({ cv: hills, v: .03 });
      const far = layer(PH), fc = far.getContext('2d'), farCol = mix({ morning: '#a9b6c6', day: '#9aaabd', evening: '#8a7f98', night: '#2a2e4a' }[tod], g.skyLow, .3);
      for (let x = 0; x < TW;) { const bw = 6 + Math.floor(rnd() * 7), bh = 16 + Math.floor(rnd() * 16); RW(fc, x, gy - bh, bw, bh, farCol); if (rnd() < .3) RW(fc, x + Math.floor(bw / 2), gy - bh - 3, 1, 3, farCol); x += bw + (rnd() < .3 ? 1 : 0); }
      { const tx = ri(rnd, 40, TW - 40), th = 48;                                                  // 地標：電視塔
        RW(fc, tx - 1, gy - th, 3, th, farCol); RW(fc, tx - 4, gy - th + 9, 9, 4, farCol); RW(fc, tx - 3, gy - th + 13, 7, 1, farCol); RW(fc, tx, gy - th - 8, 1, 8, farCol);
        RW(fc, tx - 3, gy - th + 10, 7, 1, lit ? '#ffd77a' : mix(farCol, '#ffffff', .25)); if (lit) RW(fc, tx, gy - th - 8, 1, 1, '#ff6b5a'); }
      out.push({ cv: far, v: .08 });
      const near = layer(PH), nc = near.getContext('2d');   // 前面那排城市：淡淡的幾種顏色、有高有低（2026-10-27「灰色方塊」）
      towns(nc, rnd, g, { cols: ['#c9b8a0', '#9aaabd', '#b8a090', '#a8b8b0', '#8f9fb8'], haze: .5, hMin: 9, hMax: 22, wMin: 8, wMax: 16, gap: .25 });
      out.push({ cv: near, v: .18 });
      const mid = layer(PH), mc = mid.getContext('2d');
      dither(mc, 0, gy, TW, p0 - gy, GRASS, GRASS2, (x, y) => (y - gy) / Math.max(1, p0 - gy) * .8);
      for (let x = 0; x < TW; x++) { const h = 2 + Math.round(Math.sin(x / TW * Math.PI * 2 * 18) * 1.2 + Math.sin(x / TW * Math.PI * 2 * 8) * 1.5); R(mc, x, gy - 1, 1, h + 1, shade(TREE, -.12)); if (x % 5 === 0) R(mc, x, gy - 1, 1, 1, shade(TREE, .12)); }
      for (const x of spots(rnd, 12, 30)) tree(mc, x, gy + 8 + ri(rnd, 0, 4), ri(rnd, 7, 11), pick(rnd, TREES), night);   // 後面一排小樹
      const midY = Math.round(gy + (p0 - gy) * .5);
      for (const x of spots(rnd, 30, 70)) {                // 中間一排：花圃（紅黃粉）或圓圓的矮樹叢
        const y = midY + ri(rnd, -4, 4);
        if (rnd() < .5) { const w = ri(rnd, 12, 22); oval(mc, x, y, w / 2 + 1, 3, shade(GRASS2, -.25)); for (let k = 0; k < w; k++) RW(mc, x - w / 2 + k, y - 2 + (k % 2), 1, 2, pick(rnd, [T('#e8574f', tod), T('#f2c531', tod), T('#f28fb0', tod), shade(GRASS, .1)])); }
        else { const s = ri(rnd, 3, 5); blob(mc, [[x, y - s, s], [x + s, y - s + 1, s - 1], [x - s, y - s + 1, s - 1]], shade(TREE, .05), shade(TREE, .2), shade(TREE, -.2), x - 2 * s, y - 2 * s - 1, x + 2 * s, y); RW(mc, x - 2 * s, y + 1, 4 * s, 1, 'rgba(0,0,0,.1)'); }
      }
      const fx = ri(rnd, 40, TW - 40);
      const FOUNT = artOf('park', 'fountain'), PTREES = artOf('park', 'tree');   // AI 圖：噴水池、大樹
      if (FOUNT) artAt(mc, pickArt(rnd, FOUNT), fx, p0 - 9, tod);
      else { const b = p0 - 12, stone = T('#c9c2b4', tod), water = T('#8ccbe6', tod);               // 地標：噴水池
        oval(mc, fx, b + 1, 18, 4, 'rgba(0,0,0,.12)'); oval(mc, fx, b - 1, 16, 4, shade(stone, -.2)); oval(mc, fx, b - 2, 15, 3, stone); oval(mc, fx, b - 2, 13, 2, water);
        RW(mc, fx - 1, b - 12, 3, 10, stone); RW(mc, fx + 1, b - 12, 1, 10, shade(stone, -.2)); oval(mc, fx, b - 12, 6, 1.5, stone); RW(mc, fx, b - 19, 1, 7, shade(water, .35));
        for (let k = 1; k < 8; k++) { RW(mc, fx - k, b - 19 + Math.round(k * k / 4), 1, 1, shade(water, .2)); RW(mc, fx + k, b - 19 + Math.round(k * k / 4), 1, 1, shade(water, .2)); } }
      if (PTREES) { for (const x of spots(rnd, 50, 120)) if (Math.abs(x - fx) > 40) artAt(mc, pickArt(rnd, PTREES), x, p0 - 3, tod); }
      else for (const x of spots(rnd, 44, 110)) if (Math.abs(x - fx) > 34) tree(mc, x, p0 - 4, ri(rnd, 14, 22), pick(rnd, TREES), night);   // 前面一排大樹（大小、顏色不一樣，偶爾一棵黃葉）
      for (const x of spots(rnd, 100, 170)) if (Math.abs(x - fx) > 30) bench(mc, x, p0 - 2, T('#a8734d', tod));
      tufts(mc, rnd, 90, gy + 10, p0 - 2, shade(GRASS2, -.18), shade(GRASS, .1));
      out.push({ cv: mid, v: .5 });
      const path = layer(PH), pc = path.getContext('2d'), lights = [];
      bricks(pc, rnd, p0, p1, PATH, 12, 6);
      road(pc, rnd, g, { dapple: 10, leaves: 24, base: PATH });
      for (const lx of spots(rnd, 100, 150)) { lamp(pc, lx, p0, lit); lights.push({ x: lx + 3.5, y: p0 - 33, v: 1, r: 60 }); }
      out.push({ cv: path, v: 1, path: true });
      const fg = layer(PH), fgc = fg.getContext('2d');
      dither(fgc, 0, p1, TW, PH - p1, GRASS2, GRASS, (x, y) => (y - p1) / Math.max(1, PH - p1) * .6);
      tufts(fgc, rnd, 90, p1 + 3, PH - 2, shade(GRASS2, -.18), shade(GRASS, .1));
      if (!night) flowers(fgc, rnd, 24, p1 + 4, PH - 3, shade(GRASS2, -.2));
      for (let i = 0; i < 12; i++) { const x = Math.floor(rnd() * TW), y = p1 + 2 + Math.floor(rnd() * 6); RW(fgc, x, y, 2, 1, '#a8a29a'); RW(fgc, x, y, 1, 1, '#cfc9bf'); }
      out.push({ cv: fg, v: 1.25 });
      out.push(frontLayer(g, (c, r, b, hmax) => {
        for (const x of spots(r, 26, 64)) {
          const k = r();
          if (k < .6) bigGrass(c, x, b, ri(r, Math.round(hmax * .5), hmax), shade(GRASS2, -.15));
          else if (k < .85 && !night) bigFlower(c, x, b, ri(r, Math.round(hmax * .5), hmax - 2), pick(r, ['#f28fb0', '#f4d35e', '#ffffff', '#b59cf0']), shade(GRASS2, -.2));
          else bigRock(c, x, b, ri(r, 4, 6), T('#a8a29a', tod));
        }
      }));
      return { layers: out, lights };
    } },

    beach: { label: '海邊', geo: { gy: .34 }, sky: ['kite', 'birds'], passers: ['person', 'gull', 'dogwalk', 'gull', 'person'], balloon: ['#3f8fd5', '#ffffff'], build(g) {
      if (BEACH_KIT.every(k => artOf('beach', k))) return beachKit(g);   // 2026-10-28 素材庫；還沒讀好就用下面程式畫的   // 海邊：遠處小島、燈塔、帆船、海浪、椰子樹、陽傘、救生員塔、木棧道
      const { PH, gy, p0, p1, tod, night, lit } = g, rnd = rng(22), out = [];
      const SEA = T('#4fa3c7', tod), SEA2 = T('#7cc4dd', tod), SAND = T('#e9d6a6', tod), SAND2 = T('#d9c18a', tod), WOOD = T('#a8774c', tod);
      const far = layer(PH), fc = far.getContext('2d'), isle = mix(T('#6f8f7a', tod), g.skyLow, .35), lights = [];
      const isles = spots(rnd, 70, 160).map(x => [x, ri(rnd, 18, 44), ri(rnd, 4, 10)]);
      for (const [x, w, h] of isles) for (let i = 0; i < w; i++) { const hh = Math.round(h * Math.sin(Math.PI * i / w) ** .7); RW(fc, x + i, gy - hh, 1, hh, isle); }
      { const [ix, iw, ih] = isles[0] || [40, 30, 8], lx = ix + Math.round(iw / 2), top = gy - ih - 9;   // 地標：島上的燈塔
        RW(fc, lx, top, 3, 9, '#efe9df'); RW(fc, lx, top + 3, 3, 2, '#d9534f'); RW(fc, lx - 1, top - 1, 5, 1, '#3b3f4a'); RW(fc, lx, top - 2, 3, 1, lit ? '#ffe39a' : '#cfd6dd');
        lights.push({ x: lx + 1, y: top - 2, v: .05, r: 12, col: '255,240,190' }); }
      for (const x of spots(rnd, 110, 200)) { const sc = mix(T('#f4efe6', tod), g.skyLow, .2); RW(fc, x, gy + 2, 6, 1, mix(T('#6a5a4a', tod), g.skyLow, .3)); for (let k = 0; k < 4; k++) RW(fc, x + 2, gy - 3 + k, k + 1, 1, sc); RW(fc, x + 2, gy - 4, 1, 6, sc); }   // 遠處的帆船
      out.push({ cv: far, v: .05 });
      const sea = layer(PH), sc = sea.getContext('2d');
      dither(sc, 0, gy, TW, p0 - 8 - gy, SEA2, SEA, (x, y) => Math.min(1, (y - gy) / Math.max(1, p0 - 8 - gy) * 1.2));
      for (let i = 0; i < 40; i++) { const x = Math.floor(rnd() * TW), y = gy + 2 + Math.floor(rnd() * Math.max(1, p0 - 12 - gy)); RW(sc, x, y, 3 + Math.floor(rnd() * 4), 1, shade(SEA2, .25)); }
      for (const x of spots(rnd, 120, 220)) { const by = ri(rnd, gy + 8, p0 - 18); RW(sc, x, by, 3, 3, '#e8574f'); RW(sc, x, by, 3, 1, '#ffffff'); RW(sc, x - 1, by + 3, 5, 1, shade(SEA, -.15)); }   // 浮球
      for (let x = 0; x < TW; x++) {                       // 浪花打上沙灘：白色的一條，上下彎
        const y = p0 - 8 + Math.round(Math.sin(x / TW * Math.PI * 2 * 12) * 1.5);
        R(sc, x, y, 1, 1, shade(SEA2, .55)); R(sc, x, y + 1, 1, 7 + p0 - 8 - y, SAND);
        if (x % 3 === 0) R(sc, x, y + 1, 1, 1, shade(SAND, -.08));
      }
      out.push({ cv: sea, v: .35 });
      const mid = layer(PH), mc = mid.getContext('2d');
      const tower = ri(rnd, 30, TW - 30);
      const TOWERS = artOf('beach', 'tower'), PALMS = artOf('beach', 'palm'), UMBS = artOf('beach', 'umbrella');   // AI 圖：救生員塔、椰子樹、陽傘
      if (TOWERS) artAt(mc, pickArt(rnd, TOWERS), tower, p0 - 1, tod);
      else { const b = p0 - 1, post = T('#e8e2d6', tod), red = T('#d9483b', tod);              // 地標：救生員塔
        for (const ox of [-6, 5]) RW(mc, tower + ox, b - 20, 2, 20, post);
        RW(mc, tower - 8, b - 21, 16, 2, post); RW(mc, tower - 6, b - 30, 13, 9, red); RW(mc, tower - 6, b - 30, 13, 1, shade(red, .2)); RW(mc, tower - 3, b - 27, 7, 4, '#ffffff');
        RW(mc, tower - 7, b - 32, 15, 2, T('#f2d35b', tod)); for (let k = 0; k < 6; k++) RW(mc, tower - 6 + k * 2, b - 18 + k * 3, 2, 1, post); }
      for (const x of spots(rnd, 40, 95)) {                // 椰子樹：高矮、彎的方向不一樣
        if (Math.abs(x - tower) < 22) continue;
        if (PALMS) { artAt(mc, pickArt(rnd, PALMS), x, p0 - 1, tod); continue; }
        const base = p0 - 1, trunk = T('#8a6a48', tod), leaf = T(pick(rnd, ['#3f8f4f', '#4f9a45', '#2f7a45']), tod), H = ri(rnd, 20, 32), lean = rnd() < .5 ? -1 : 1;
        for (let i = 0; i < H; i++) RW(mc, x + lean * Math.round(Math.sin(i / H * 1.4) * 5), base - i, 2, 1, i % 3 ? trunk : shade(trunk, -.2));
        const tx = x + lean * 5, ty = base - H;
        for (const [dx, dy] of [[-1, 0], [1, 0], [-.6, .5], [.6, .5], [0, -1]]) for (let k = 0; k < 9; k++) RW(mc, tx + Math.round(dx * k), ty + Math.round(dy * k + (k * k) / 14), 2, 1, k % 3 ? leaf : shade(leaf, .15));
        RW(mc, tx - 1, ty, 3, 2, T('#6b4a33', tod));
      }
      for (const x of spots(rnd, 70, 140)) {               // 陽傘＋海灘巾（顏色不一樣）
        if (Math.abs(x - tower) < 24) continue;
        if (UMBS) { artAt(mc, pickArt(rnd, UMBS), x, p0, tod); continue; }
        const pc = pick(rnd, ['#e8574f', '#f2b134', '#3f8fd5', '#4fb36a', '#d94a8a']), top = p0 - ri(rnd, 18, 24);
        RW(mc, x, top, 1, p0 - top, '#8c8a86');
        for (let i = 0; i < 9; i++) RW(mc, x - 9 + i, top + 4 - Math.round(i * .45), 19 - i * 2, 1, i % 2 ? pc : '#ffffff');
        RW(mc, x - 8, p0 - 3, 12, 2, pick(rnd, ['#f2d35b', '#7ab0e6', '#f4a3b8'])); RW(mc, x - 8, p0 - 3, 12, 1, 'rgba(255,255,255,.3)');
      }
      out.push({ cv: mid, v: .7 });
      const path = layer(PH), pc = path.getContext('2d');   // 木棧道：一片一片直的木板、縫、釘子
      R(pc, 0, p0, TW, p1 - p0, WOOD);
      for (let x = 0; x < TW; x += 6) {
        const col = rnd() < .3 ? shade(WOOD, -.06) : rnd() < .2 ? shade(WOOD, .06) : WOOD;
        const u = 1 / K;                                     // 縫、亮邊、釘子、木紋：一小格
        R(pc, x, p0 + 2, 6 - u, p1 - p0 - 4, col); R(pc, x + 6 - u, p0 + 2, u, p1 - p0 - 4, shade(WOOD, -.3)); R(pc, x, p0 + 2, u, p1 - p0 - 4, shade(col, .12));
        R(pc, x + 2.5, p0 + 4, u, u, shade(WOOD, -.35)); R(pc, x + 2.5, p1 - 5, u, u, shade(WOOD, -.35));
        if (rnd() < .3) R(pc, x + 1, p0 + 8 + Math.floor(rnd() * 8), 3, u, shade(col, -.1));   // 木紋
      }
      for (let i = 0; i < 10; i++) { const x = ri(rnd, 0, TW - 1), y = ri(rnd, p0 + 4, p1 - 6); for (let k = 0; k < 3; k++) RW(pc, x + k * 2 - 2, y + k, 8 - k * 3, 1, mix(WOOD, SAND, .6)); }   // 吹上來的沙
      road(pc, rnd, g, { base: WOOD });
      R(pc, 0, p0, TW, 2, shade(WOOD, .15)); R(pc, 0, p1 - 2, TW, 2, shade(WOOD, -.35));
      for (let x = 20; x < TW; x += 40) { RW(pc, x, p0 - 8, 2, 10, shade(WOOD, -.15)); RW(pc, x, p0 - 8, 1, 10, shade(WOOD, .05)); }   // 欄杆柱
      for (let x = 0; x < TW; x++) { const sag = Math.round(Math.sin(((x - 20 + TW) % 40) / 40 * Math.PI) * 2); R(pc, x, p0 - 6 + sag, 1, 1, '#c8b28a'); }   // 繩子
      out.push({ cv: path, v: 1, path: true });
      const fg = layer(PH), fgc = fg.getContext('2d');
      dither(fgc, 0, p1, TW, PH - p1, SAND, SAND2, (x, y) => ((y - p1) / Math.max(1, PH - p1)) * .7);
      for (let i = 0; i < 50; i++) { const x = Math.floor(rnd() * TW), y = p1 + 3 + Math.floor(rnd() * (PH - p1 - 4)); RW(fgc, x, y, 1, 1, shade(SAND2, -.12)); }
      for (let i = 0; i < 12; i++) {                       // 貝殼、海星
        const x = Math.floor(rnd() * TW), y = p1 + 4 + Math.floor(rnd() * (PH - p1 - 7));
        if (i % 2) { const s = '#f2a46b'; RW(fgc, x, y - 1, 1, 3, s); RW(fgc, x - 1, y, 3, 1, s); RW(fgc, x - 1, y + 1, 1, 1, s); RW(fgc, x + 1, y + 1, 1, 1, s); }
        else { RW(fgc, x - 1, y, 3, 1, '#f6e7df'); RW(fgc, x, y - 1, 1, 1, '#f6e7df'); RW(fgc, x - 1, y + 1, 3, 1, '#e3c9bd'); }
      }
      out.push({ cv: fg, v: 1.25 });
      out.push(frontLayer(g, (c, r, b, hmax) => {
        const castle = ri(r, 40, TW - 40);
        { const sd = shade(SAND, -.05);                     // 沙堡＋小水桶
          RW(c, castle - 9, b - 8, 18, 8, sd); RW(c, castle - 9, b - 8, 18, 1, shade(sd, .15)); RW(c, castle - 4, b - 14, 8, 6, sd); RW(c, castle - 4, b - 14, 8, 1, shade(sd, .15));
          for (const ox of [-9, -5, 5, 8]) RW(c, castle + ox, b - 10, 1, 2, sd); RW(c, castle - 1, b - 5, 2, 5, shade(sd, -.25)); RW(c, castle, b - 19, 1, 5, '#6b4a33'); RW(c, castle + 1, b - 19, 3, 2, '#e8574f');
          RW(c, castle + 14, b - 6, 6, 6, '#3f8fd5'); RW(c, castle + 14, b - 6, 6, 1, shade('#3f8fd5', .3)); RW(c, castle + 15, b - 9, 4, 1, '#3f8fd5'); }
        for (const x of spots(r, 30, 70)) if (Math.abs(x - castle) > 28) bigGrass(c, x, b, ri(r, Math.round(hmax * .45), hmax - 2), T('#7a9a5a', tod));
      }));
      return { layers: out, lights, anim(c, a) {          // 海面一閃一閃
        const off = a.scroll * .35;
        for (let i = 0; i < 18; i++) {
          const x = ((i * 37 - off) % a.PW + a.PW) % a.PW, y = gy + 3 + (i * 11) % Math.max(1, p0 - 14 - gy), on = Math.sin(a.t / 400 + i * 1.3) > .5;
          if (on) R(c, x, y, 2, 1, night ? '#c9cff0' : '#ffffff');
        }
      } };
    } },

    forest: { label: '森林', geo: { gy: .24 }, sky: ['birds'], passers: ['hiker', 'dogwalk', 'hiker'], build(g) {   // 森林步道：遠處霧霧的松樹、粗細不一的大樹幹、小木屋、香菇、泥土小路、蕨類；晚上有螢火蟲
      const { PH, gy, p0, p1, tod, night } = g, rnd = rng(33), out = [], lights = [];
      const GR = T('#5d8f4e', tod), GR2 = T('#4b7a40', tod), DIRT = T('#9b7653', tod), DIRT2 = T('#86643f', tod);
      const far = layer(PH), fc = far.getContext('2d'), f1 = mix(T('#5f8a70', tod), g.skyLow, .45);
      for (let x = 0; x < TW; x += ri(rnd, 6, 11)) pine(fc, x, gy + 2, ri(rnd, 18, 34), f1);
      out.push({ cv: far, v: .08 });
      const far2 = layer(PH), f2c = far2.getContext('2d'), f2 = mix(T('#3f6b4c', tod), g.skyLow, .15);
      R(f2c, 0, gy, TW, 6, f2);
      for (let x = 0; x < TW; x += ri(rnd, 9, 16)) pine(f2c, x, gy + 6, ri(rnd, 26, 44), f2);
      const CABINS = artOf('forest', 'cabin');             // AI 圖：小木屋
      if (CABINS) artAt(f2c, pickArt(rnd, CABINS), ri(rnd, 40, TW - 40), gy + 18, tod);
      else { const cx = ri(rnd, 40, TW - 40), b = gy + 18, logC = T('#8a5a3a', tod), lit = night || tod === 'evening';   // 地標：小木屋（窗戶晚上會亮、煙囪）
        R(f2c, cx - 16, gy + 4, 32, 14, mix(GR, f2, .5));
        RW(f2c, cx - 11, b - 11, 22, 11, logC); for (let y = b - 10; y < b; y += 2) RW(f2c, cx - 11, y, 22, 1, shade(logC, -.15));
        for (let k = 0; k < 28; k++) RW(f2c, cx - 14 + k, b - 11 - Math.round(7 - Math.abs(k - 13.5) * .5), 1, Math.round(7 - Math.abs(k - 13.5) * .5) + 1, k % 2 ? T('#5a3a2a', tod) : T('#6a4632', tod));
        RW(f2c, cx + 5, b - 20, 3, 6, T('#7a7a7a', tod)); RW(f2c, cx - 7, b - 8, 5, 4, lit ? '#ffd27a' : T('#4a5a6a', tod)); RW(f2c, cx + 2, b - 8, 5, 8, T('#5a3a2a', tod));
        if (lit) lights.push({ x: cx - 5, y: b - 6, v: .2, r: 12, col: '255,210,140' }); }
      out.push({ cv: far2, v: .2 });
      const mid = layer(PH), mc = mid.getContext('2d');
      dither(mc, 0, gy + 6, TW, p0 - gy - 6, GR, GR2, (x, y) => (y - gy - 6) / Math.max(1, p0 - gy - 6) * .9);
      for (const x of spots(rnd, 26, 64)) {               // 大樹幹（只看得到下半段）：粗細、顏色不一樣；樹皮紋、樹根
        const bark = T(pick(rnd, ['#5b4130', '#6a4a36', '#4a3628', '#7a5a42']), tod), w = ri(rnd, 5, 10), cc = T(pick(rnd, ['#3f7a3f', '#4a8a45', '#356a38']), tod);
        RW(mc, x, 0, w, p0 - 1, bark); RW(mc, x, 0, 1, p0 - 1, shade(bark, .15)); RW(mc, x + w - 1, 0, 1, p0 - 1, shade(bark, -.25));
        for (let y = 4; y < p0 - 2; y += ri(rnd, 4, 6)) RW(mc, x + 1 + ri(rnd, 0, w - 3), y, 2, 1, shade(bark, -.18));
        RW(mc, x - 2, p0 - 3, 3, 2, bark); RW(mc, x + w - 1, p0 - 3, 3, 2, shade(bark, -.2));
        blob(mc, [[x + w / 2, 4, 9 + w / 2], [x - 4, 7, 7], [x + w + 4, 5, 7]], cc, shade(cc, .15), shade(cc, -.25), x - 12, -6, x + w + 12, 13 + w);   // 上面一點樹冠
      }
      for (const x of spots(rnd, 20, 50)) { const s = ri(rnd, 3, 7); blob(mc, [[x, p0 - s, s], [x + s, p0 - s + 1, s - 1], [x - s, p0 - s + 2, s - 2]], T('#4f8a45', tod), shade(T('#4f8a45', tod), .18), shade(T('#4f8a45', tod), -.25), x - 2 * s, p0 - 2 * s - 2, x + 2 * s, p0 - 1); }   // 樹叢
      for (const x of spots(rnd, 40, 110)) {               // 香菇：一朵到三朵、紅的或咖啡色
        const cap = pick(rnd, ['#d9483b', '#d9483b', '#a8683a']);
        for (let k = 0; k < ri(rnd, 1, 3); k++) { const mx = x + k * 5, h = ri(rnd, 2, 4); RW(mc, mx, p0 - 1 - h, 2, h, '#efe6d6'); RW(mc, mx - 2, p0 - 3 - h, 6, 2, cap); RW(mc, mx - 1, p0 - 4 - h, 4, 1, cap); if (cap !== '#a8683a') { RW(mc, mx - 1, p0 - 3 - h, 1, 1, '#ffffff'); RW(mc, mx + 2, p0 - 4 - h, 1, 1, '#ffffff'); } }
      }
      tufts(mc, rnd, 60, gy + 10, p0 - 2, shade(GR2, -.2), shade(GR, .12));
      out.push({ cv: mid, v: .55 });
      const path = layer(PH), pc = path.getContext('2d');   // 泥土小路：深淺一大塊一大塊（不是平均的小點）、石頭、落葉、樹根
      dither(pc, 0, p0, TW, p1 - p0, DIRT, DIRT2, (x, y) => .3 + Math.sin(x / TW * Math.PI * 2 * 7 + y * .15) * .18 + Math.sin(x * .05 + 1) * .1);
      R(pc, 0, p0, TW, 1, shade(GR2, -.25)); R(pc, 0, p1 - 1, TW, 1, shade(DIRT2, -.25));
      for (let i = 0; i < 18; i++) { const x = Math.floor(rnd() * TW), y = p0 + 3 + Math.floor(rnd() * (p1 - p0 - 6)); RW(pc, x, y, 3, 2, shade(DIRT, .16)); RW(pc, x, y + 2, 3, 1, shade(DIRT, -.22)); }
      for (const x of spots(rnd, 90, 160)) for (let k = 0; k < 16; k++) RW(pc, x + k, p0 + 3 + Math.round(Math.sin(k / 3) * 1.5), 1, 2, T('#6a4a32', tod));   // 樹根
      road(pc, rnd, g, { dapple: 14, leaves: 60, base: DIRT, puddles: 1 });
      out.push({ cv: path, v: 1, path: true });
      const fg = layer(PH), fgc = fg.getContext('2d');
      dither(fgc, 0, p1, TW, PH - p1, GR2, shade(GR2, -.15), (x, y) => ((y - p1) / Math.max(1, PH - p1)) * .7);
      for (let x = 5; x < TW; x += ri(rnd, 18, 34)) {      // 蕨類：一根中間、兩邊一排小葉
        const fern = T('#5e9a4a', tod), bx = x, by = PH - 1;
        for (let k = 0; k < 12; k++) { const yy = by - k, xx = bx + Math.round(k * .5); RW(fgc, xx, yy, 1, 1, fern); if (k > 2 && k % 2 === 0) { RW(fgc, xx - 3, yy + 1, 3, 1, shade(fern, .1)); RW(fgc, xx + 1, yy, 3, 1, shade(fern, -.1)); } }
      }
      if (!night) flowers(fgc, rnd, 12, p1 + 4, PH - 3, shade(GR2, -.2));
      out.push({ cv: fg, v: 1.3 });
      out.push(frontLayer(g, (c, r, b, hmax) => {          // 靠鏡頭：大蕨類、倒下的木頭
        const fern = shade(T('#4f8a40', tod), -.2), log = ri(r, 30, TW - 60), lc = T('#6a4a36', tod);
        RW(c, log, b - 7, 34, 7, lc); RW(c, log, b - 7, 34, 1, shade(lc, .15)); oval(c, log + 34, b - 4, 2, 3, T('#c9a070', tod)); RW(c, log + 33, b - 4, 1, 1, shade(lc, -.3));
        RW(c, log + 6, b - 9, 4, 2, T('#4f9a45', tod)); RW(c, log + 20, b - 8, 3, 1, T('#4f9a45', tod));
        for (const x of spots(r, 24, 52)) {
          if (x > log - 8 && x < log + 42) continue;
          const h = ri(r, Math.round(hmax * .6), hmax);
          for (let k = 0; k < h; k++) { const xx = x + Math.round(k * .35), yy = b - k; RW(c, xx, yy, 1, 1, fern); if (k > 2 && k % 2 === 0) { const L = Math.round((h - k) * .35) + 2; RW(c, xx - L, yy + 1, L, 1, shade(fern, .1)); RW(c, xx + 1, yy, L, 1, shade(fern, -.08)); } }
        }
      }));
      return { layers: out, lights, animAt: 2, anim(c, a) {      // 晚上、傍晚：螢火蟲（畫在地面那層上面）
        if (!(night || tod === 'evening')) return;
        for (let i = 0; i < 12; i++) {
          const x = ((i * 53 + Math.sin(a.t / 1400 + i) * 8 - a.scroll * .55) % a.PW + a.PW) % a.PW, y = gy + 8 + ((i * 17) % Math.max(1, p0 - gy - 10)) + Math.sin(a.t / 900 + i * 2) * 3;
          if (Math.sin(a.t / 500 + i * 1.7) > .2) { R(c, x, y, 1, 1, '#e8ff8a'); a.glow.push([x, y, 6]); }
        }
      } };
    } },

    river: { label: '河堤', sky: ['kite', 'birds', 'balloon'], passers: ['cyclist', 'person', 'dogwalk', 'cyclist', 'pigeon'], balloon: ['#f2b134', '#d9483b'], build(g) {   // 河堤：遠山、河、石橋、小船、鴨子、柳樹、蘆葦、自行車道
      const { PH, gy, p0, p1, tod, night, lit } = g, rnd = rng(44), out = [];
      const far = layer(PH), fc = far.getContext('2d');
      const m1 = mix(T('#7d92b8', tod), g.skyLow, .4), m2 = mix(T('#5d7f74', tod), g.skyLow, .15);
      for (let x = 0; x < TW; x++) {
        const h1 = 24 + Math.round(Math.sin(x / TW * Math.PI * 2 * 4) * 9 + Math.sin(x / TW * Math.PI * 2 * 9) * 4);
        R(fc, x, gy - h1, 1, h1, m1); if (h1 > 32) R(fc, x, gy - h1, 1, 2, night ? '#8a90b8' : '#f4f6fa');   // 山頂的雪
        const h2 = 12 + Math.round(Math.sin(x / TW * Math.PI * 2 * 6 + 1) * 5 + Math.sin(x / TW * Math.PI * 2 * 13) * 2);
        R(fc, x, gy - h2, 1, h2, m2); if (bay(x, h2) < .3) R(fc, x, gy - h2, 1, 1, shade(m2, .12));
      }
      out.push({ cv: far, v: .05 });
      const water = layer(PH), wc = water.getContext('2d'), WAT = T('#5a9ec0', tod), WAT2 = T('#3e7fa3', tod), BANK = T('#6f9a5c', tod);
      R(wc, 0, gy, TW, 3, shade(BANK, -.1));                // 對岸
      for (let x = 4; x < TW; x += ri(rnd, 8, 18)) { const s = ri(rnd, 2, 4); blob(wc, [[x, gy - 1, s], [x + 3, gy, s - 1]], T('#4f8a4a', tod), shade(T('#4f8a4a', tod), .15), shade(T('#4f8a4a', tod), -.2), x - s - 1, gy - s - 2, x + s + 3, gy + 1); }
      dither(wc, 0, gy + 3, TW, p0 - 10 - gy, WAT, WAT2, (x, y) => (y - gy - 3) / Math.max(1, p0 - 10 - gy));
      for (let i = 0; i < 34; i++) { const x = Math.floor(rnd() * TW), y = gy + 5 + Math.floor(rnd() * Math.max(1, p0 - 16 - gy)); RW(wc, x, y, ri(rnd, 3, 6), 1, shade(WAT, .18)); }
      const bx = ri(rnd, 20, TW - 80);
      { const top = gy + 1, span = 60, bc = T('#b5ab9a', tod);   // 地標：石拱橋
        for (let i = 0; i < span; i++) { const arch = Math.round(Math.sin(Math.PI * i / span) * 10); RW(wc, bx + i, top, 1, 3, bc); RW(wc, bx + i, top + 3, 1, Math.max(0, 7 - arch), shade(bc, -.15)); if (i % 6 === 0) RW(wc, bx + i, top - 2, 1, 2, shade(bc, -.2)); }
        RW(wc, bx, top - 2, span, 1, shade(bc, -.2)); oval(wc, bx + span / 2, top + 12, 14, 2, shade(WAT2, -.1)); }
      { const x = (bx + ri(rnd, 140, 300)) % TW, y = ri(rnd, gy + 12, p0 - 18), boat = T('#c9734f', tod);   // 小船
        RW(wc, x, y, 14, 2, boat); RW(wc, x + 1, y + 2, 12, 1, shade(boat, -.25)); RW(wc, x + 5, y - 5, 1, 5, '#6b4a33'); RW(wc, x + 6, y - 5, 4, 3, '#f4efe6'); RW(wc, x - 1, y + 3, 16, 1, shade(WAT, .2)); }
      for (const x of spots(rnd, 90, 180)) { const y = ri(rnd, gy + 10, p0 - 16); for (let k = 0; k < 3; k++) { const dx = x + k * 6; RW(wc, dx, y, 4, 2, T('#f4efe6', tod)); RW(wc, dx + 3, y - 2, 2, 2, T('#4f8a4a', tod)); RW(wc, dx + 5, y - 1, 1, 1, '#f2b134'); RW(wc, dx - 1, y + 2, 6, 1, shade(WAT, .2)); } }   // 鴨子一家
      out.push({ cv: water, v: .25 });
      const mid = layer(PH), mc = mid.getContext('2d');      // 這邊的河岸：草坡、柳樹、蘆葦、長椅
      dither(mc, 0, p0 - 10, TW, 10, BANK, shade(BANK, -.12), (x, y) => (y - p0 + 10) / 10);
      R(mc, 0, p0 - 10, TW, 1, shade(BANK, .15));
      const WILLOWS = artOf('river', 'willow');            // AI 圖：柳樹
      for (const x of spots(rnd, 70, 150)) {               // 柳樹：垂下來的細枝
        if (WILLOWS) { artAt(mc, pickArt(rnd, WILLOWS), x, p0 - 6, tod); continue; }
        const b = p0 - 8, tk = T('#5b4130', tod), lf = T(pick(rnd, ['#7fae4a', '#8fbf5a', '#6a9a3f']), tod), h = ri(rnd, 26, 36);
        RW(mc, x - 1, b - h + 8, 3, h - 8, tk); RW(mc, x + 1, b - h + 8, 1, h - 8, shade(tk, -.25));
        blob(mc, [[x, b - h + 4, 9], [x - 6, b - h + 7, 7], [x + 6, b - h + 6, 7]], lf, shade(lf, .15), shade(lf, -.2), x - 14, b - h - 6, x + 14, b - h + 13);
        for (let k = -12; k <= 12; k += 2) { const len = ri(rnd, 6, 16); RW(mc, x + k, b - h + 10, 1, len, k % 4 ? lf : shade(lf, -.15)); }
      }
      for (let x = 0; x < TW; x += ri(rnd, 3, 7)) { const h = ri(rnd, 5, 13), rc = T('#9a8a5a', tod); RW(mc, x + 1, p0 - 10 - h, 1, h, rc); if (rnd() < .4) RW(mc, x + 1, p0 - 12 - h, 1, 3, T('#6b4a33', tod)); }   // 蘆葦（高矮不一、偶爾有穗）
      for (const x of spots(rnd, 120, 220)) bench(mc, x, p0 - 2, T('#8a5a3a', tod));
      out.push({ cv: mid, v: .6 });
      const path = layer(PH), pc = path.getContext('2d'), lights = [], ASP = T('#7b7f86', tod);   // 自行車道：柏油、中間虛線、兩邊白線
      dither(pc, 0, p0, TW, p1 - p0, ASP, shade(ASP, -.05), (x, y) => .2 + Math.sin(x * .07) * .15);
      R(pc, 0, p0 + 2, TW, 1, '#e6e6e0'); R(pc, 0, p1 - 3, TW, 1, '#e6e6e0');
      for (let x = 0; x < TW; x += 16) R(pc, x, Math.round((p0 + p1) / 2), 8, 1, '#f2d35b');
      R(pc, 0, p0, TW, 2, shade(ASP, .15)); R(pc, 0, p1 - 1, TW, 1, shade(ASP, -.3));
      for (const x of spots(rnd, 180, 260)) { const by = Math.round((p0 + p1) / 2) + 6, bk = '#e6e6e0';   // 地上畫的腳踏車
        for (const ox of [0, 8]) { RW(pc, x + ox, by, 3, 1, bk); RW(pc, x + ox - 1, by + 1, 1, 2, bk); RW(pc, x + ox + 3, by + 1, 1, 2, bk); RW(pc, x + ox, by + 3, 3, 1, bk); }
        RW(pc, x + 2, by - 1, 7, 1, bk); }
      road(pc, rnd, g, { cracks: 8, crackCol: shade(ASP, -.2), leaves: 10, base: ASP });
      for (const lx of spots(rnd, 100, 150)) { lamp(pc, lx, p0, lit); lights.push({ x: lx + 3.5, y: p0 - 33, v: 1, r: 60 }); }
      out.push({ cv: path, v: 1, path: true });
      const fg = layer(PH), fgc = fg.getContext('2d'), G1 = T('#7fb36a', tod), G2 = T('#6aa057', tod);
      dither(fgc, 0, p1, TW, PH - p1, G1, G2, (x, y) => ((y - p1) / Math.max(1, PH - p1)) * .8);
      tufts(fgc, rnd, 80, p1 + 3, PH - 2, shade(G2, -.18), shade(G1, .1));
      if (!night) for (let i = 0; i < 18; i++) { const x = Math.floor(rnd() * TW), y = p1 + 4 + Math.floor(rnd() * (PH - p1 - 7)); RW(fgc, x, y + 1, 1, 3, shade(G2, -.2)); RW(fgc, x - 1, y - 1, 3, 2, i % 3 ? '#f6d44a' : '#ffffff'); }   // 蒲公英
      out.push({ cv: fg, v: 1.25 });
      out.push(frontLayer(g, (c, r, b, hmax) => {          // 靠鏡頭：高高的蘆葦叢、蒲公英
        for (const x of spots(r, 22, 56)) {
          if (r() < .65) { for (let k = 0; k < 5; k++) { const h = ri(r, Math.round(hmax * .5), hmax), xx = x + k * 2; RW(c, xx, b - h, 1, h, shade(T('#9a8a5a', tod), -.1)); if (k % 2) RW(c, xx, b - h - 3, 1, 4, T('#7a5a3a', tod)); } }
          else if (!night) { const h = ri(r, 8, hmax - 2); RW(c, x, b - h, 1, h, shade(G2, -.25)); oval(c, x, b - h - 1, 3, 2.5, '#f4f4ee'); RW(c, x - 1, b - h - 2, 2, 1, '#ffffff'); }
        }
      }));
      return { layers: out, lights, anim(c, a) {
        const off = a.scroll * .25;
        for (let i = 0; i < 14; i++) { const x = ((i * 41 - off) % a.PW + a.PW) % a.PW, y = gy + 6 + (i * 13) % Math.max(1, p0 - 18 - gy); if (Math.sin(a.t / 450 + i * 1.9) > .55) R(c, x, y, 3, 1, night ? '#c9cff0' : '#e6f4ff'); }
      } };
    } },

    street: { label: '老街', geo: { gy: .2 }, sky: ['birds', 'plane'], passers: ['person', 'pigeon', 'person', 'dogwalk', 'pigeon', 'person'], build(g) {   // 老街：二到四層的老房子（寬窄、高低、紅磚或洗石子、窗子都不一樣）、一間廟、騎樓、店招、紅燈籠、石板路
      const { PH, gy, p0, p1, tod, night, lit } = g, rnd = rng(56), out = [], lights = [];
      const far = layer(PH), fc = far.getContext('2d');     // 後面的樓：奶油、磚紅、淺綠、灰藍…有高有低、中間露出天空（2026-10-27）
      towns(fc, rnd, g, { cols: ['#e6d3b0', '#c9876a', '#b9c9b4', '#a9b4c6', '#d9b9a0', '#c4b8a8'], haze: .45, hMin: 4, hMax: 16, wMin: 12, wMax: 22, gap: .2, bottom: p0 });
      out.push({ cv: far, v: .1 });
      const mid = layer(PH), mc = mid.getContext('2d'), u = 1 / K;
      const houses = artOf('street', 'house'), temples = artOf('street', 'temple');
      if (houses && temples) {                               // AI 建築：一棟一棟隨機排一排，空隙露出後面的樓
        for (const b of artRow(mc, rnd, houses, p0 + u, tod, { at: ri(rnd, 0, 3), list: temples }))
          for (const f of [-.32, .32]) lights.push({ x: b.x + b.w * f, y: p0 - b.h * .28, v: .5, r: 18, warm: true });   // 騎樓下的燈籠
        RW(mc, 0, p0 - u, TW, u, 'rgba(0,0,0,.2)');
      } else {                                               // 圖還沒讀好（或粗格子）：程式畫的老房子
      const arcY = p0 - 22, FL = 14;                        // 騎樓頂、一層樓高
      const WALLS = [['#b5523b', '#8a3a2a'], ['#c8734a', '#9a5034'], ['#9a4a3a', '#6e3226'], ['#e2d4b8', '#c4b394'], ['#d9c2a6', '#b8a080'], ['#c9d6cf', '#a3b4ab']];
      const temple = ri(rnd, 0, 3);                         // 第幾棟換成廟（地標）
      const lantern = (lx, ly) => {                         // 紅燈籠：圓的、上下金邊、中間一條亮、下面流蘇
        RW(mc, lx - u / 2, ly - 3, u, 1.5, '#3b3f4a');
        box(mc, lx - 1.5, ly - 1.5, 3, 1, '#6a6e78', .25, -.25); RW(mc, lx - .5, ly - 2, 1, u, '#8a8e98');   // 金屬蓋子（照 AI 比對圖）
        oval(mc, lx, ly + 2.5, 3.5, 3, '#c8372d'); oval(mc, lx - .5, ly + 2, 2.5, 2, '#e0503f'); RW(mc, lx - 1.5, ly + .5, u, 3, '#f59a7a');
        for (let k = -2; k <= 2; k += 2) RW(mc, lx + k, ly, u, 5, shade('#c8372d', -.18));
        RW(mc, lx - 2, ly - u, 4, u * 2, '#e6b13f'); RW(mc, lx - 2, ly + 5, 4, u * 2, '#e6b13f'); for (let k = -1; k <= 1; k++) RW(mc, lx + k * .5, ly + 6, u, 2, '#e6b13f');
      };
      for (let x = 0, i = 0; x < TW; i++) {
        let unit = i === temple ? 64 : pick(rnd, [32, 40, 40, 48]);
        if (TW - x - unit < 32) unit = TW - x;              // 最後一棟補滿，左右才接得起來
        if (i === temple) {                                  // 廟：燕尾翹起來的兩層屋頂（一片片瓦）、屋脊上的彩色剪黏、紅柱、門上的門釘、匾、一對燈籠
          const red = T('#b8372d', tod), roof = T('#3f7a6a', tod), gold = T('#e6b13f', tod), top = arcY - 30, cream = T('#e8d8b8', tod);
          RW(mc, x, top + 8, unit, p0 - top - 8, cream);
          for (let yy = top + 10, r = 0; yy < p0 - 2; yy += 2.5, r++) {                                 // 牆：奶油色石塊（照 AI 比對圖）
            RW(mc, x, yy, unit, u, shade(cream, -.14));
            for (let k = (r % 2) * 2.5; k < unit; k += 5) { const v = rnd(); if (v < .35) RW(mc, x + k + u, yy + u, 5 - u, 2.5 - u, shade(cream, v < .18 ? .05 : -.05)); RW(mc, x + k, yy, u, 2.5, shade(cream, -.14)); }
          }
          const roofRow = (y0, w0, lift0, h) => {            // 一層屋頂：兩端翹起、瓦一條一條、簷口一條暗線
            for (let k = 0; k < w0; k += u) {
              const lift = Math.max(0, Math.abs(k - w0 / 2) - (w0 / 2 - lift0)) * .8, xx = x + (unit - w0) / 2 + k;
              const kk = k % 1.5;                              // 筒瓦：一根 1.5 格，左邊一小格亮、右邊一小格暗（照 AI 比對圖）
              RW(mc, xx, y0 - lift, u, h, kk < u ? shade(roof, .22) : kk >= 1.5 - u - 1e-9 ? shade(roof, -.35) : roof);
              RW(mc, xx, y0 - lift, u, u, shade(roof, .3)); RW(mc, xx, y0 - lift + h - u, u, u, shade(roof, -.3));
            }
            for (const d of [-1, 1]) { const ex = d < 0 ? x + (unit - w0) / 2 : x + (unit + w0) / 2 - u; RW(mc, ex, y0 - lift0 * .8 - 2, u, 2, gold); RW(mc, ex - d * u, y0 - lift0 * .8 - 2.5, u, u, gold); }   // 燕尾尖
          };
          roofRow(top + 4, unit + 8, 6, 5);
          box(mc, x + 6, top + 1, unit - 12, 3, red, .2, -.25);                                         // 屋脊
          for (let k = 0; k < 6; k++) { const ox = x + 10 + k * Math.round((unit - 20) / 5), col = pick(rnd, ['#e8574f', '#3f8fd5', '#4fb36a', gold]);   // 剪黏
            RW(mc, ox, top - 1, 2, 2, col); RW(mc, ox + u, top - 1.5, u, u, shade(col, .3)); RW(mc, ox, top - u, 2, u, shade(col, -.2)); }
          box(mc, x + unit / 2 - 4, top - 3, 8, 3, gold, .25, -.2); RW(mc, x + unit / 2 - u / 2, top - 5, u, 2, gold); RW(mc, x + unit / 2 - 1, top - 5.5, 2, u, gold);   // 中間的寶塔
          roofRow(arcY - 6, unit + 4, 8, 4);
          for (const ox of [4, 18, unit - 22, unit - 8]) {                                              // 紅柱：亮邊、暗邊、石頭柱腳、柱頭金邊
            RW(mc, x + ox, arcY - 2, 4, p0 - arcY + 2, red);
            for (let yy = arcY - 2, r = 0; yy < p0 - 3; yy += 1.5, r++) { RW(mc, x + ox, yy, 4, u, shade(red, -.22)); RW(mc, x + ox + (r % 2 ? 2 : 1), yy, u, 1.5, shade(red, -.22)); }   // 紅磚柱（照 AI 比對圖）
            RW(mc, x + ox, arcY - 2, u, p0 - arcY + 2, shade(red, .25)); RW(mc, x + ox + u, arcY - 2, u, p0 - arcY + 2, shade(red, .1));
            RW(mc, x + ox + 4 - u, arcY - 2, u, p0 - arcY + 2, shade(red, -.3));
            box(mc, x + ox - .5, p0 - 3, 5, 3, T('#a8a29a', tod)); RW(mc, x + ox - .5, arcY - 2, 5, u * 2, gold);
          }
          const door = lit ? '#f2b45c' : T('#7a2a22', tod), dw = unit - 44, dh = p0 - arcY - 2;     // 門：兩扇、框、門釘
          RW(mc, x + 22, arcY + 2, dw, dh, door); RW(mc, x + 22, arcY + 2, dw, u, shade(door, -.3)); RW(mc, x + 22, arcY + 2, u, dh, shade(door, -.3)); RW(mc, x + 22 + dw - u, arcY + 2, u, dh, shade(door, -.3));
          RW(mc, x + unit / 2 - u / 2, arcY + 2, u, dh, T('#4a1a14', tod));
          if (!lit) for (let yy = arcY + 4; yy < p0 - 2; yy += 2) for (let xx = x + 24; xx < x + 22 + dw - 1; xx += 2) if (Math.abs(xx - x - unit / 2) > 1) RW(mc, xx, yy, u, u, gold);
          box(mc, x + unit / 2 - 8, arcY - 14, 16, 6, gold, .3, -.25); RW(mc, x + unit / 2 - 7, arcY - 13, 14, 4, red); glyphs(mc, rnd, x + unit / 2 - 6.5, arcY - 13, 13, 4, gold);   // 匾
          for (const ox of [12, unit - 12]) { lantern(x + ox, arcY + 3); lights.push({ x: x + ox, y: arcY + 6, v: .5, r: 18, warm: true }); }
          RW(mc, x + 6, p0 - u, unit - 12, u, 'rgba(0,0,0,.2)');
          x += unit; continue;
        }
        const wi = ri(rnd, 0, WALLS.length - 1), [W0, W1] = WALLS[wi], brick = wi < 3;   // 前三種＝紅磚、後三種＝洗石子
        const WALL = T(W0, tod), MORTAR = T(W1, tod), CREAM = T(pick(rnd, ['#eadcc0', '#f4ead6', '#e0cfae']), tod), SHUT = T(pick(rnd, ['#2f5f66', '#4a6a3a', '#3a4a6a', '#6a3a2a']), tod);
        const maxF = Math.max(1, Math.round((arcY - gy) / FL)), floors = Math.max(1, ri(rnd, maxF - 2, maxF)), top = arcY - floors * FL - 2, ptop = top - ri(rnd, 4, 9);   // 樓層照畫面高度：屋頂在天際線附近，後面的樓只露出一點
        const gk = ri(rnd, 0, 3), mx = x + unit / 2, CL = shade(CREAM, .12), CD = shade(CREAM, -.22);
        RW(mc, x + 1, ptop, unit - 2, top - ptop + 2, CREAM); RW(mc, x + 1, ptop, unit - 2, u, CL);  // 山牆（上面的造型：四種，邊緣一小格亮線）
        const gable = (w, f) => { for (let k = 0; k < w; k += u) { const h = f(k); RW(mc, mx - w / 2 + k, ptop - h, u, h + u, CREAM); RW(mc, mx - w / 2 + k, ptop - h, u, u, CL); } };
        if (gk === 0) gable(14, k => 4 * Math.sin(Math.PI * k / 14));
        else if (gk === 1) { box(mc, mx - 8, ptop - 4, 16, 4.5, CREAM, .12, -.1); box(mc, mx - 4, ptop - 7, 8, 3.5, CREAM, .12, -.1); }
        else if (gk === 2) gable(18, k => Math.max(0, 5 - Math.abs(k - 9) * .6));
        RW(mc, x + 1, top - 1, unit - 2, 1, CD); RW(mc, x + 1, top - 1, unit - 2, u, shade(CREAM, -.1));   // 簷口
        box(mc, mx - 3, ptop - 2, 6, 3, shade(CREAM, -.12), .1, -.25); RW(mc, mx - 2, ptop - 1, 4, u, CD); RW(mc, mx - 1, ptop, 2, u, CD);   // 牌匾
        RW(mc, x, top, unit, arcY - top, WALL);
        const brickWall = (bx, bw, y0, y1, col) => {          // 紅磚：一排 1.5 格高、縫一小格淺色（照 AI 比對圖）、每塊顏色一點點不同
          const mortar = mix(col, '#f2d2b0', .5);
          for (let y = y0, r = 0; y < y1; y += 1.5, r++) {
            RW(mc, bx, y, bw, u, mortar);
            for (let k = (r % 2) * 1.5; k < bw; k += 3) { const v = rnd(); if (v < .4) RW(mc, bx + k + u, y + u, Math.min(3, bw - k) - u, 1.5 - u, shade(col, v < .2 ? -.08 : .07)); RW(mc, bx + k, y, u, 1.5, mortar); }
          }
        };
        if (brick) brickWall(x, unit, top + 1, arcY - 2, WALL);
        else if (wi === 3) {                                   // 奶油色石塊牆＋兩邊紅磚壁柱（照 AI 比對圖）
          for (let y = top + 1, r = 0; y < arcY - 2; y += 2.5, r++) {
            RW(mc, x, y, unit, u, shade(WALL, -.14));
            for (let k = (r % 2) * 2.5; k < unit; k += 5) { const v = rnd(); if (v < .35) RW(mc, x + k + u, y + u, 5 - u, 2.5 - u, shade(WALL, v < .18 ? .06 : -.05)); RW(mc, x + k, y, u, 2.5, shade(WALL, -.14)); }
          }
          for (const bx of [x, x + unit - 3]) brickWall(bx, 3, top, arcY - 2, T('#a63e2d', tod));
        } else for (let k = 0; k < unit * 3; k++) RW(mc, x + snap(rnd() * (unit - 1)), snap(top + 1 + rnd() * (arcY - top - 3)), u, u, shade(WALL, rnd() < .5 ? -.1 : .06));   // 洗石子牆的小點
        const nwin = unit >= 48 ? 3 : 2, ws = Math.round(unit / nwin), arch = rnd() < .5, louver = rnd() < .35, FR = rnd() < .6 ? T('#5e4a32', tod) : CREAM;   // 窗框：多半是深木色（照 AI 比對圖）
        for (let f = 0; f < floors; f++) for (let k = 0; k < nwin; k++) {
          const wx = x + k * ws + Math.round(ws / 2) - 3, wy = top + 3 + f * FL, on = lit && rnd() < .7, gl = on ? '#ffd27a' : SHUT;
          RW(mc, wx - 1.5, wy - 1, 9, 1, CD); RW(mc, wx - 1.5, wy - 1, 9, u, CL);                      // 窗楣
          box(mc, wx - 1, wy, 8, 11, FR, .14, -.25);                                                 // 窗框
          RW(mc, wx, wy + 2, 6, 8, gl);
          if (arch) for (let q = 0; q < 6; q += u) { const h = Math.sin(Math.PI * q / 6) * 1.5; RW(mc, wx + q, wy + 2 - h, u, h, gl); }
          RW(mc, wx, wy + 2, 6, u, shade(gl, -.3)); RW(mc, wx, wy + 2, u, 8, shade(gl, -.2));         // 窗框裡的影子
          if (!on && louver) for (let yy = wy + 3; yy < wy + 10; yy += 1) RW(mc, wx + u, yy, 6 - u, u, shade(SHUT, .14));   // 百葉
          else if (!on) {                                                                            // 窗簾（淺色、有花樣，中間拉開一條）＋玻璃反光
            const cur = T(pick(rnd, ['#efe2cc', '#f2d6c8', '#e2e6d2']), tod), pat = T(pick(rnd, ['#d98a6a', '#8fb07a', '#e8b860', '#9aa8d0']), tod);
            RW(mc, wx + u, wy + 2 + u, 6 - u, 8 - u, cur); RW(mc, wx + 2.5, wy + 2 + u, 1, 8 - u, shade(SHUT, .1));
            for (let q = 0; q < 6; q++) RW(mc, wx + .5 + snap(rnd() * 4.5), wy + 3 + snap(rnd() * 5.5), u, u, pat);
            RW(mc, wx + 4, wy + 3, u, 1.5, '#ffffff');
          }
          RW(mc, wx + 3 - u / 2, wy + 2, u, 8, FR); RW(mc, wx, wy + 5.5, 6, u, FR);                    // 窗格
          box(mc, wx - 1.5, wy + 10, 9, 1, shade(CREAM, -.05), .15, -.3);                            // 窗台
          if (rnd() < .45) {                                                                         // 窗台的花叢（一叢叢、亮點、小花；照 AI 比對圖）
            box(mc, wx - 1, wy + 9, 8, 1.5, T('#9a5a3a', tod), .2, -.25);
            blob(mc, [[wx + 1, wy + 7.6, 2], [wx + 3, wy + 7, 2.3], [wx + 5, wy + 7.6, 2]], T('#4f9450', tod), T('#7fc060', tod), T('#2f6a38', tod), wx - 1.5, wy + 4, wx + 7.5, wy + 9);
            for (let q = 0; q < 6; q++) RW(mc, wx - .5 + snap(rnd() * 6.5), wy + 5.5 + snap(rnd() * 3), u, u, q % 2 ? T('#a8d878', tod) : T(pick(rnd, ['#e8574f', '#f2c531', '#f28fb0']), tod));
          }
        }
        RW(mc, x, top, u, arcY - top, shade(WALL, .14)); RW(mc, x + unit - u, top, u, arcY - top, shade(WALL, -.22));
        box(mc, x, arcY - 2, unit, 2, CREAM, .15, -.25);                                          // 騎樓上的橫帶
        RW(mc, x, arcY, unit, p0 - arcY, shade(WALL, -.1));                                          // 一樓騎樓：柱子＋拱門，裡面暗、店面亮
        const inner = lit ? '#f2b45c' : T('#5a4a42', tod), aw = unit - 6;
        for (let k = 0; k < aw; k += u) { const ah = Math.sin(Math.PI * k / aw) * 4; RW(mc, x + 3 + k, arcY + 5 - ah, u, p0 - arcY - 5 + ah, inner); RW(mc, x + 3 + k, arcY + 5 - ah - u, u, u, CL); }   // 拱：邊一小格亮線
        for (const yy of [arcY + 8, arcY + 12]) { RW(mc, x + 5, yy, aw - 4, u, shade(inner, -.18)); for (let k = x + 6; k < x + unit - 6; k += ri(rnd, 2, 3)) RW(mc, k, yy - 1, 1, 1, T(pick(rnd, ['#e8574f', '#f2b134', '#7ab06a', '#c9a070', '#3f7fc8']), tod)); }   // 店裡的架子和貨
        if (lit) for (let k = x + 8; k < x + unit - 6; k += 9) { RW(mc, k, arcY + 5, u, 1.5, '#3b3f4a'); RW(mc, k - .5, arcY + 6.5, 1.5, 1, '#fff2c0'); }   // 店裡的燈泡
        RW(mc, x + 3, arcY + 5, aw, u, 'rgba(0,0,0,.18)');
        for (const px of [x, x + unit - 3]) {                 // 柱子：紅磚紋、亮邊暗邊、柱頭、石頭柱腳（照 AI 比對圖）
          if (brick || wi === 3) brickWall(px, 3, arcY, p0 - 2, brick ? WALL : T('#a63e2d', tod)); else RW(mc, px, arcY, 3, p0 - arcY, WALL);
          RW(mc, px, arcY, u, p0 - arcY, 'rgba(255,255,255,.18)'); RW(mc, px + 3 - u, arcY, u, p0 - arcY, 'rgba(0,0,0,.22)');
          box(mc, px - .5, arcY, 4, 1, T('#c8783f', tod), .2, -.25);
          const st = T('#b8b2a8', tod); box(mc, px - .5, p0 - 2.5, 4, 2.5, st, .2, -.28);
          for (let q = 0; q < 4; q++) RW(mc, px + snap(rnd() * 3), p0 - 2 + snap(rnd() * 1.5), u, u, shade(st, -.18));
        }
        const sign = T(pick(rnd, ['#c8372d', '#2f5d8a', '#2f7a4f', '#7a3f8a', '#e8a33a']), tod), ink = '#f2d35b';
        if (rnd() < .6) { const sw = unit - 18; box(mc, x + 9, arcY + 3, sw, 5, sign, .25, -.3); RW(mc, x + 9 + u, arcY + 3 + u, sw - 2 * u, u, shade(sign, -.15)); glyphs(mc, rnd, x + 10, arcY + 4, sw - 2, 3.5, ink); }   // 橫的店招
        else { const sx = x + unit - 9, sh = Math.min(30, arcY - top - 6); box(mc, sx, top + 4, 5, sh, sign, .25, -.3); for (let y = top + 6; y < top + sh; y += 4.5) glyphs(mc, rnd, sx + 1, y, 3, 3.5, ink); }   // 直的招牌
        for (let k = 0; k < Math.floor((unit - 10) / 9); k++) {                                     // 店門口的貨：箱子、上面一顆顆水果
          const bx = x + 8 + k * 9, bc = T(pick(rnd, ['#c9a070', '#b5864f', '#8a8f9a', '#4f8a5a']), tod);
          box(mc, bx, p0 - 4, 6, 3.5, bc, .18, -.3); RW(mc, bx + u, p0 - 3, 6 - 2 * u, u, shade(bc, -.2));
          const fc = T(pick(rnd, ['#e8574f', '#f2b134', '#7ab06a', '#f4efe6', '#d98a3a']), tod);
          for (let q = 0; q < 5; q++) { RW(mc, bx + .5 + q * 1.1, p0 - 5.5, 1, 1.5, fc); RW(mc, bx + .5 + q * 1.1, p0 - 5.5, u, u, shade(fc, .4)); }
        }
        RW(mc, x + 6, p0 - u, unit - 12, u, 'rgba(0,0,0,.2)');
        if (rnd() < .7) { lantern(x + unit - .5, arcY + 2); lights.push({ x: x + unit - 1, y: arcY + 5, v: .5, r: 18, warm: true }); }   // 柱子上掛的紅燈籠
        x += unit;
      }
      }
      out.push({ cv: mid, v: .5 });
      const path = layer(PH), pc = path.getContext('2d'), STONE = T('#ad9a80', tod);   // 偏暖的灰米色（照 AI 比對圖）
      bricks(pc, rnd, p0, p1, STONE, 12, 6);
      R(pc, 0, p0, TW, 3, 'rgba(0,0,0,.15)');                                                     // 騎樓的影子
      for (const x of spots(rnd, 160, 260)) {               // 水溝蓋：圓的、外圈亮、一條條格柵
        const y = Math.round((p0 + p1) / 2) + 4, uu = 1 / K;
        oval(pc, x, y, 6, 3, T('#5e5e62', tod)); oval(pc, x, y - uu, 5, 2.2, T('#7e7e82', tod));
        for (let k = -3.5; k <= 3.5; k += 1) RW(pc, x + k, y - 1.5, uu, 3, T('#4a4a4e', tod));
      }
      road(pc, rnd, g, { cracks: 6, crackCol: shade(STONE, -.25), leaves: 6, base: STONE });
      out.push({ cv: path, v: 1, path: true });
      const fg = layer(PH), fgc = fg.getContext('2d'), CURB = T('#7e725e', tod);
      { const uu = 1 / K;                                    // 路緣石：一塊塊、上緣亮、縫一小格；下面的水溝
        R(fgc, 0, p1, TW, PH - p1, shade(CURB, -.12)); R(fgc, 0, p1, TW, 3, CURB); R(fgc, 0, p1, TW, uu, shade(CURB, .2)); R(fgc, 0, p1 + 3 - uu, TW, uu, shade(CURB, -.3));
        for (let x = 0; x < TW; x += 10) R(fgc, x, p1, uu, 3, shade(CURB, -.28));
        for (let x = 0; x < TW; x += 2) R(fgc, x, p1 + 6, 1, uu, shade(CURB, -.35)); R(fgc, 0, p1 + 5, TW, uu, shade(CURB, -.2)); }   // 水溝蓋
      out.push({ cv: fg, v: 1.25 });
      out.push(frontLayer(g, (c, r, b, hmax) => {          // 靠鏡頭：大盆栽、綠色郵筒（地標）
        const post = ri(r, 30, TW - 30), gr = T('#2f7a4f', tod), rd = T('#c8372d', tod);
        const uu = 1 / K;
        for (const [ox, col] of [[-5, gr], [5, rd]]) {     // 綠色、紅色郵筒：圓頂、投信口、白色的字、亮邊暗邊
          const h = hmax - 4, x0 = post + ox - 4;
          box(c, x0, b - h, 9, h, col, .18, -.28);
          for (let k = 0; k < 9; k += uu) { const d = Math.sqrt(Math.max(0, 1 - ((k - 4.5) / 4.5) ** 2)) * 3; RW(c, x0 + k, b - h - d, uu, d, col); RW(c, x0 + k, b - h - d, uu, uu, shade(col, .3)); }
          RW(c, x0 - 1, b - h + 3, 11, 1, shade(col, -.22)); RW(c, x0 - 1, b - h + 3, 11, uu, shade(col, .1));
          box(c, x0 + 2, b - h + 5.5, 5, 1.5, '#2a2a2e', .15, 0);
          RW(c, x0 + 2.5, b - h + 9, 4, uu, '#f4efe6'); RW(c, x0 + 4.5 - uu / 2, b - h + 8, uu, 3.5, '#f4efe6'); RW(c, x0 + 3, b - h + 10.5, 3, uu, '#f4efe6');
          box(c, x0 - 1, b - 2, 11, 2, shade(col, -.3), .1, -.2);
        }
        for (const x of spots(r, 40, 90)) {
          if (Math.abs(x - post) < 20) continue;
          const pot = T(pick(r, ['#b5653f', '#8a8f9a', '#c9a070']), tod), ph = ri(r, 6, 9), lf = T(pick(r, ['#4f9450', '#3f7a45', '#6aa84a']), tod), y = b - ph;
          box(c, x - 5, y, 11, ph, pot, .2, -.28); RW(c, x - 5.5, y, 12, 1, shade(pot, .1)); RW(c, x - 5.5, y, 12, uu, shade(pot, .3));   // 盆子：口緣
          for (let k = 0; k < 2; k++) { RW(c, x - 5, y + 2.5 + k * 2.5, 11, 1, shade(pot, -.14)); RW(c, x - 5, y + 2.5 + k * 2.5, 11, uu, shade(pot, .08)); }   // 兩道箍
          const lh = ri(r, 5, hmax - ph);
          blob(c, [[x, y - lh / 2, lh / 2 + 2], [x - 4, y - 2, 4], [x + 4, y - 3, 4]], lf, shade(lf, .25), shade(lf, -.3), x - 9, y - lh - 3, x + 9, y);
          for (let q = 0; q < 10; q++) { const fx = x - 6 + snap(r() * 12), fy = y - 1 - snap(r() * (lh + 1)); RW(c, fx, fy, uu, uu, q % 3 ? shade(lf, .35) : T('#f29a2e', tod)); }   // 葉子亮點、金桔（照 AI 比對圖）
        }
      }));
      return { layers: out, lights };
    } },

    sakura: { label: '櫻花步道', sky: ['birds'], passers: ['person', 'dogwalk', 'pigeon', 'person'], build(g) {   // 櫻花步道：遠處粉粉的山坡和塔、大小顏色不一的櫻花樹、紅色鳥居、碎石路、滿地花瓣；花瓣一直飄
      const { PH, gy, p0, p1, tod, night } = g, rnd = rng(66), out = [], lights = [];
      const PALS = [['#f4b6c8', '#fde0e8', '#e98fab'], ['#ef9ab5', '#f9c9d8', '#d9708f'], ['#f8d4de', '#fff0f4', '#e8adbd']].map(p => p.map(c => T(c, tod)));
      const [PINK, PINKL] = PALS[0], G1 = T('#8fbf7a', tod), G2 = T('#7aad66', tod);
      const far = layer(PH), fc = far.getContext('2d'), hill = mix(T('#9cc08a', tod), g.skyLow, .35);
      ridge(fc, rnd, gy - 3, 22, mix(T('#9aa8c0', tod), g.skyLow, .55));
      for (let x = 0; x < TW; x++) { const h = 10 + Math.round(Math.sin(x / TW * Math.PI * 2 * 4) * 5 + Math.sin(x / TW * Math.PI * 2 * 10) * 2); R(fc, x, gy - h, 1, h, hill); }
      for (let x = 6; x < TW; x += ri(rnd, 7, 14)) { const P = pick(rnd, PALS); blob(fc, [[x, gy - 10 - (x % 4), 4], [x + 3, gy - 9, 3]], mix(P[0], g.skyLow, .3), mix(P[1], g.skyLow, .3), mix(P[2], g.skyLow, .3), x - 5, gy - 18, x + 7, gy - 5); }
      { const tx = ri(rnd, 30, TW - 30), tc = mix(T('#8a3a2a', tod), g.skyLow, .25), rf = mix(T('#3a3a44', tod), g.skyLow, .25);   // 地標：山坡上的五重塔
        for (let f = 0; f < 5; f++) { const y = gy - 12 - f * 6, w = 13 - f * 2; RW(fc, tx - (w >> 1), y, w, 1, rf); RW(fc, tx - (w >> 1) - 1, y + 1, w + 2, 1, rf); RW(fc, tx - (w >> 1) + 2, y + 2, w - 4, 4, tc); }
        RW(fc, tx, gy - 46, 1, 6, rf); }
      out.push({ cv: far, v: .1 });
      const mid = layer(PH), mc = mid.getContext('2d');
      dither(mc, 0, gy, TW, p0 - gy, G1, G2, (x, y) => (y - gy) / Math.max(1, p0 - gy) * .8);
      for (const x of spots(rnd, 10, 22)) { const P = pick(rnd, PALS); blob(mc, [[x, gy + 2, 4], [x + 3, gy + 3, 3]], P[0], P[1], P[2], x - 5, gy - 3, x + 7, gy + 6); }   // 遠一點的一排小櫻花
      for (const x of spots(rnd, 22, 48)) {                // 中間一排中型櫻花樹（比前面的小、淡一點）
        const P = pick(rnd, PALS).map(c => mix(c, g.skyLow, .12)), b = Math.round(gy + (p0 - gy) * .45), tk = T('#6a4a40', tod), s = ri(rnd, 5, 8);
        RW(mc, x, b - 7, 2, 8, tk);
        blob(mc, [[x + 1, b - 7 - s * .6, s], [x - s * .6, b - 6, s * .7], [x + s * .8, b - 6, s * .7]], P[0], P[1], P[2], x - 2 * s, b - 8 - 2 * s, x + 2 * s + 1, b - 2);
        RW(mc, x - s, b + 1, 2 * s + 2, 1, 'rgba(0,0,0,.08)');
      }
      const torii = ri(rnd, 30, TW - 30);
      const TORII = artOf('sakura', 'torii'), STREES = artOf('sakura', 'tree');   // AI 圖：鳥居、大櫻花樹
      if (TORII) artAt(mc, TORII[0], torii, p0 - 1, tod);
      else { const b = p0 - 2, red = T('#d0402e', tod), blk = T('#2a2a2e', tod);                    // 地標：紅色鳥居
        for (const ox of [-11, 9]) { RW(mc, torii + ox, b - 30, 3, 30, red); RW(mc, torii + ox, b - 30, 1, 30, shade(red, .2)); RW(mc, torii + ox - 1, b - 2, 5, 2, blk); }
        RW(mc, torii - 16, b - 34, 33, 3, blk); RW(mc, torii - 15, b - 31, 31, 2, red); RW(mc, torii - 13, b - 25, 27, 2, red); RW(mc, torii - 2, b - 29, 5, 4, T('#3a3a3e', tod)); }
      for (const x of spots(rnd, 28, 64)) {                 // 大櫻花樹：大小、顏色（粉紅、深粉、淡白）、間距都不一樣
        if (Math.abs(x - torii) < 24) continue;
        if (STREES) { if (Math.abs(x - torii) > 50) artAt(mc, pickArt(rnd, STREES), x, p0 - 2, tod); continue; }
        const s = .75 + rnd() * .6, P = pick(rnd, PALS), base = p0 - 2, trunk = night ? '#2a1e1c' : T(pick(rnd, ['#5b3a32', '#4a2e28', '#6a4638']), tod);
        const th = Math.round(22 * s);
        RW(mc, x - 2, base - th, 4, th + 1, trunk); RW(mc, x + 1, base - th, 1, th + 1, shade(trunk, -.3));
        for (let k = 0; k < Math.round(8 * s); k++) { RW(mc, x - 2 - k, base - th - Math.round(k * .7), 2, 1, trunk); RW(mc, x + 2 + k, base - th - 2 - Math.round(k * .6), 2, 1, trunk); }
        const cy = base - th - Math.round(12 * s);
        blob(mc, [[x, cy, 10 * s], [x - 9 * s, cy + 5 * s, 8 * s], [x + 9 * s, cy + 4 * s, 8 * s], [x - 3 * s, cy - 6 * s, 7 * s], [x + 5 * s, cy - 5 * s, 6 * s]], P[0], P[1], P[2], x - 19 * s, cy - 14 * s, x + 19 * s, base - th + 2);
        for (let k = 0; k < 10 * s; k++) RW(mc, x - Math.round(14 * s) + ri(rnd, 0, Math.round(28 * s)), cy - Math.round(10 * s) + ri(rnd, 0, Math.round(20 * s)), 1, 1, P[1]);
        RW(mc, x - Math.round(10 * s), base + 1, Math.round(21 * s), 1, 'rgba(0,0,0,.12)');
        if (rnd() < .4) { RW(mc, x + 6, base - th + 2, 1, 3, '#3b3f4a'); RW(mc, x + 4, base - th + 5, 5, 5, '#f6e7c8'); RW(mc, x + 5, base - th + 6, 3, 3, '#ffd27a'); lights.push({ x: x + 6, y: base - th + 7, v: .5, r: 16, col: '255,220,170' }); }   // 夜櫻的燈籠
      }
      for (let i = 0; i < 120; i++) RW(mc, Math.floor(rnd() * TW), gy + 6 + Math.floor(rnd() * Math.max(1, p0 - gy - 8)), 1, 1, i % 3 ? PINK : PINKL);   // 草地上的落花
      out.push({ cv: mid, v: .5 });
      const path = layer(PH), pc = path.getContext('2d'), GRAVEL = T('#d9cdb8', tod);
      dither(pc, 0, p0, TW, p1 - p0, GRAVEL, shade(GRAVEL, -.05), (x, y) => .25 + Math.sin(x * .06 + y * .2) * .15);
      R(pc, 0, p0, TW, 1, shade(G2, -.2)); R(pc, 0, p1 - 1, TW, 1, shade(GRAVEL, -.25));
      for (let i = 0; i < 24; i++) { const x = Math.floor(rnd() * TW), y = p0 + 2 + Math.floor(rnd() * (p1 - p0 - 3)); RW(pc, x, y, 2, 1, shade(GRAVEL, -.15)); }
      road(pc, rnd, g, { dapple: 12, shadow: 'rgba(120,40,70,.10)', leaves: 90, leafCols: [PINK, PINKL, PALS[1][0]], base: GRAVEL });   // 花瓣當落葉
      out.push({ cv: path, v: 1, path: true });
      const fg = layer(PH), fgc = fg.getContext('2d');
      dither(fgc, 0, p1, TW, PH - p1, G2, G1, (x, y) => ((y - p1) / Math.max(1, PH - p1)) * .6);
      tufts(fgc, rnd, 80, p1 + 3, PH - 2, shade(G2, -.18), shade(G1, .1));
      for (let i = 0; i < 70; i++) RW(fgc, Math.floor(rnd() * TW), p1 + 2 + Math.floor(rnd() * (PH - p1 - 3)), 1, 1, i % 2 ? PINK : PINKL);
      out.push({ cv: fg, v: 1.25 });
      out.push(frontLayer(g, (c, r, b, hmax) => {          // 靠鏡頭：杜鵑花叢（粉紅、桃紅）
        for (const x of spots(r, 34, 76)) {
          const s = ri(r, Math.round(hmax * .35), Math.round(hmax * .55)), lf = shade(T('#4f8a45', tod), -.15), fl = T(pick(r, ['#e8578f', '#f28fb0', '#ffffff']), tod);
          blob(c, [[x, b - s, s], [x - s, b - s * .6, s * .8], [x + s, b - s * .7, s * .8]], lf, shade(lf, .15), shade(lf, -.2), x - 2 * s, b - 2 * s - 1, x + 2 * s, b);
          for (let k = 0; k < s * 3; k++) RW(c, x - 2 * s + ri(r, 1, 4 * s - 2), b - ri(r, 2, 2 * s - 1), 2, 1, fl);
        }
      }));
      return { layers: out, lights, fx(c, a) {                // 花瓣一直飄（斜斜往左下）
        for (let i = 0; i < 18; i++) {
          const sp = 8 + (i % 5) * 3, y = ((i * 37 + a.t / 1000 * sp) % (PH + 10)) - 5, x = ((i * 53 - a.t / 1000 * sp * .8 + Math.sin(a.t / 600 + i) * 4 - a.scroll * .8) % a.PW + a.PW) % a.PW;
          R(c, x, y, i % 3 ? 1 : 2, 1, i % 2 ? '#f9c3d3' : '#fde0e8');
        }
      } };
    } },

    snow: { label: '雪地', snowy: true, passers: ['person', 'dogwalk', 'person'], build(g) {
      if (SNOW_KIT.every(k => artOf('snow', k))) return snowKit(g);   // 2026-10-27 素材庫（全部 AI 圖、同一套顏色）；還沒讀好就用下面程式畫的   // 雪地：雪山、積雪的松樹、小木屋（冒煙）、雪人、柵欄、踩出來的雪路、腳印；一直飄雪（下雨的時候變成大雪）
      const { PH, gy, p0, p1, tod, night, lit } = g, rnd = rng(77), out = [], lights = [];
      const SNOW = T('#f4f7fb', tod), SNOW2 = T('#dfe7f1', tod), SHADOW = T('#c4d2e3', tod);
      const far = layer(PH), fc = far.getContext('2d'), mt = mix(T('#8c9cb5', tod), g.skyLow, .35);
      ridge(fc, rnd, gy, 40, mt, mix(SNOW, g.skyLow, .2));
      out.push({ cv: far, v: .05 });
      const far2 = layer(PH), f2c = far2.getContext('2d'), pineCol = T('#3f6b5c', tod);
      R(f2c, 0, gy - 2, TW, 8, SNOW2);
      for (let x = 0; x < TW; x += ri(rnd, 6, 14)) {               // 松樹＋樹枝上的雪（高矮不一）
        const h = ri(rnd, 16, 30);
        pine(f2c, x, gy + 3, h, pineCol);
        for (let i = 3; i < h; i += 4) { const half = Math.max(1, Math.round((h - i) * .32)); RW(f2c, x - half, gy + 3 - i, half * 2 + 1, 1, SNOW); }
      }
      out.push({ cv: far2, v: .2 });
      const mid = layer(PH), mc = mid.getContext('2d');
      dither(mc, 0, gy + 4, TW, p0 - gy - 4, SNOW, SNOW2, (x, y) => (y - gy - 4) / Math.max(1, p0 - gy - 4) * .9);
      const cabin = ri(rnd, 30, TW - 60);
      const SCAB = artOf('snow', 'cabin'), SMAN = artOf('snow', 'snowman'), SPINE = artOf('snow', 'pine');   // AI 圖：小木屋、雪人、松樹
      if (SCAB) artAt(mc, pickArt(rnd, SCAB), cabin + 15, p0 - 10, tod);
      else { const b = p0 - 12, logC = T('#8a5a3a', tod);                                               // 地標：雪地小木屋（窗戶晚上亮）
        RW(mc, cabin, b - 14, 30, 14, logC); for (let y = b - 13; y < b; y += 2) RW(mc, cabin, y, 30, 1, shade(logC, -.15));
        for (let k = 0; k < 38; k++) { const hh = Math.round(9 - Math.abs(k - 18.5) * .5); RW(mc, cabin - 4 + k, b - 14 - hh, 1, hh + 2, k % 2 ? T('#6a3a2a', tod) : T('#7a4632', tod)); RW(mc, cabin - 4 + k, b - 15 - hh, 1, 2, SNOW); }
        RW(mc, cabin + 21, b - 26, 4, 8, T('#7a7a7a', tod)); RW(mc, cabin + 21, b - 27, 4, 1, SNOW);
        RW(mc, cabin + 4, b - 10, 6, 5, lit ? '#ffd27a' : T('#4a5a6a', tod)); RW(mc, cabin + 6, b - 10, 1, 5, logC); RW(mc, cabin + 16, b - 10, 6, 10, T('#5a3a2a', tod));
        RW(mc, cabin - 2, b, 34, 2, SHADOW);
        if (lit) lights.push({ x: cabin + 7, y: b - 7, v: .55, r: 16, col: '255,210,140' }); }
      const sm = (cabin + ri(rnd, 120, 300)) % TW;
      if (SMAN) artAt(mc, pickArt(rnd, SMAN), sm, p0 - 2, tod);
      else { const x = sm, b = p0 - 3;                          // 雪人：三顆雪球、紅蘿蔔鼻子、樹枝手、圍巾、帽子
        blob(mc, [[x, b - 6, 6]], SNOW, '#ffffff', SHADOW, x - 7, b - 13, x + 7, b);
        blob(mc, [[x, b - 15, 4.5]], SNOW, '#ffffff', SHADOW, x - 6, b - 20, x + 6, b - 10);
        RW(mc, x - 5, b - 12, 11, 2, '#d9483b'); RW(mc, x + 3, b - 12, 2, 4, '#d9483b');
        RW(mc, x - 2, b - 17, 1, 1, '#2a2a2a'); RW(mc, x + 1, b - 17, 1, 1, '#2a2a2a'); RW(mc, x, b - 15, 3, 1, '#f08a2c');
        RW(mc, x - 4, b - 22, 9, 1, '#2a2a2a'); RW(mc, x - 3, b - 26, 7, 4, '#2a2a2a');
        for (let k = 0; k < 6; k++) { RW(mc, x - 6 - k, b - 9 - Math.round(k * .6), 1, 1, '#6b4a33'); RW(mc, x + 6 + k, b - 9 - Math.round(k * .7), 1, 1, '#6b4a33'); }
        RW(mc, x - 8, b + 1, 17, 1, SHADOW); }
      for (const [g0, g1, b0, h0, h1] of [[14, 34, gy + 14, 12, 18], [26, 64, p0 - 6, 16, 26]]) for (const x of spots(rnd, g0, g1)) {   // 兩排松樹（遠的小、近的大）
        if (Math.abs(x - sm) < 16 || (x > cabin - 10 && x < cabin + 40)) continue;
        if (SPINE && b0 === p0 - 6) { if (rnd() < .6) artAt(mc, pickArt(rnd, SPINE), x, p0 - 5, tod); continue; }
        const h = ri(rnd, h0, h1), b = b0 + ri(rnd, 0, 3); pine(mc, x, b, h, pineCol);
        for (let i = 3; i < h; i += 4) { const half = Math.max(1, Math.round((h - i) * .32)); RW(mc, x - half, b - i, half * 2 + 1, 1, SNOW); }
        RW(mc, x - 4, b + 2, 9, 1, SHADOW);
      }
      for (const x of spots(rnd, 40, 90)) { const s = ri(rnd, 3, 6), y = ri(rnd, gy + 20, p0 - 14); blob(mc, [[x, y, s], [x + s, y + 1, s - 1]], SNOW, '#ffffff', SHADOW, x - s - 1, y - s - 1, x + 2 * s, y + s); }   // 雪堆
      for (let x = 0; x < TW; x += 8) { RW(mc, x + 2, p0 - 9, 2, 8, T('#8a6a4a', tod)); RW(mc, x + 2, p0 - 10, 2, 1, SNOW); }   // 柵欄
      R(mc, 0, p0 - 7, TW, 1, T('#8a6a4a', tod)); R(mc, 0, p0 - 4, TW, 1, T('#8a6a4a', tod)); R(mc, 0, p0 - 8, TW, 1, SNOW);
      out.push({ cv: mid, v: .55 });
      const path = layer(PH), pc = path.getContext('2d');          // 踩出來的雪路：淡藍灰、雪橇痕、亂一點的腳印
      dither(pc, 0, p0, TW, p1 - p0, SNOW2, SHADOW, (x, y) => .2 + Math.abs(Math.sin((y - p0) / (p1 - p0) * Math.PI)) * .2 + Math.sin(x * .05) * .08);
      R(pc, 0, p0, TW, 2, SNOW); R(pc, 0, p1 - 2, TW, 2, SNOW);
      for (const dy of [-6, -2]) for (let x = 0; x < TW; x++) R(pc, x, Math.round((p0 + p1) / 2) + dy + Math.round(Math.sin(x / TW * Math.PI * 2 * 3) * 2), 1, 1, shade(SHADOW, -.06));   // 雪橇的兩條痕
      for (let x = 0; x < TW; x += ri(rnd, 7, 11)) { const y = Math.round((p0 + p1) / 2) + 6 + ((x / 9 | 0) % 2 ? 3 : -2) + ri(rnd, -1, 1); RW(pc, x, y, 2, 2, shade(SHADOW, -.08)); RW(pc, x + 2, y - 1, 1, 1, shade(SHADOW, -.08)); RW(pc, x - 1, y - 1, 1, 1, shade(SHADOW, -.08)); }   // 腳印
      for (const x of spots(rnd, 100, 200)) { const y = ri(rnd, p0 + 6, p1 - 8); for (let k = 0; k < 4; k++) RW(pc, x + k * 3, y + (k % 2), 1, 2, shade(SHADOW, -.1)); RW(pc, x + 2, y + 3, 1, 1, shade(SHADOW, -.1)); }   // 小鳥腳印
      out.push({ cv: path, v: 1, path: true });
      const fg = layer(PH), fgc = fg.getContext('2d');
      for (let x = 0; x < TW; x++) { const h = 6 + Math.round(Math.sin(x / TW * Math.PI * 2 * 12) * 2); R(fgc, x, p1, 1, PH - p1, SNOW); R(fgc, x, p1, 1, 1, '#ffffff'); if ((x + h) % 7 === 0) R(fgc, x, p1 + h, 2, 1, SHADOW); }
      for (let i = 0; i < 20; i++) { const x = Math.floor(rnd() * TW), y = p1 + 4 + Math.floor(rnd() * (PH - p1 - 5)); RW(fgc, x, y, 1, 3, T('#7a5a3a', tod)); RW(fgc, x - 1, y, 3, 1, SNOW); }   // 雪裡露出來的小樹枝
      out.push({ cv: fg, v: 1.25 });
      out.push(frontLayer(g, (c, r, b, hmax) => {          // 靠鏡頭：積雪的矮樹叢（偶爾紅色小果子）
        for (const x of spots(r, 30, 70)) {
          const s = ri(r, Math.round(hmax * .25), Math.round(hmax * .4)), lf = T('#3f6b4c', tod);
          blob(c, [[x, b - s, s], [x - s, b - s * .5, s * .8], [x + s, b - s * .6, s * .8]], lf, shade(lf, .1), shade(lf, -.25), x - 2 * s, b - 2 * s - 1, x + 2 * s, b);
          blob(c, [[x, b - s - 2, s * .8], [x - s * .8, b - s * .9, s * .6]], SNOW, '#ffffff', SHADOW, x - 2 * s, b - 2 * s - 2, x + 2 * s, b - s * .6);
          if (r() < .5) for (let k = 0; k < 4; k++) RW(c, x - s + ri(r, 0, 2 * s), b - ri(r, 2, s), 1, 1, '#d9483b');
        }
      }));
      return { layers: out, lights, fx(c, a) {             // 飄雪：晴天少、陰天多、下雨變大雪
        const n = a.w === 'rain' ? 46 : a.w === 'cloud' ? 28 : 14;
        for (let i = 0; i < n; i++) {
          const sp = 10 + (i % 6) * 4, y = ((i * 29 + a.t / 1000 * sp) % (PH + 6)) - 3, x = ((i * 47 + Math.sin(a.t / 900 + i * 1.3) * 5 - a.scroll * .6) % a.PW + a.PW) % a.PW;
          R(c, x, y, i % 4 ? 1 : 2, i % 4 ? 1 : 2, '#ffffff');
        }
        const cx = ((cabin + 23 - a.scroll * .55) % TW + TW) % TW;   // 煙囪冒煙
        for (const bx of [cx, cx - TW]) if (bx > -6 && bx < a.PW + 6) for (let k = 0; k < 4; k++) { const up = (a.t / 1000 * 5 + k * 4) % 16; R(c, bx + Math.sin(a.t / 500 + k) * 1.5, p0 - 40 - up, 2, 2, `rgba(235,235,240,${(.55 - up / 32).toFixed(2)})`); }
      } };
    } },

    country: { label: '鄉間小路', sky: ['birds', 'balloon'], passers: ['farmer', 'dog', 'cyclist', 'person'], balloon: ['#4fb36a', '#f2d35b'], build(g) {   // 鄉間小路：遠山、一格一格的稻田、白鷺鷥、農舍、大榕樹、電線桿、稻草人、中間長草的土路、水窪
      const { PH, gy, p0, p1, tod, night, lit } = g, rnd = rng(88), out = [], lights = [];
      const RICE = tod === 'evening' ? T('#c9b04a', tod) : T('#86b94f', tod), RICE2 = shade(RICE, -.12), WATER = T('#9cc9d6', tod);
      const far = layer(PH), fc = far.getContext('2d'), m1 = mix(T('#6e8fb0', tod), g.skyLow, .4);
      ridge(fc, rnd, gy, 30, mix(T('#8aa0c0', tod), g.skyLow, .55));
      for (let x = 0; x < TW; x++) { const h = 14 + Math.round(Math.sin(x / TW * Math.PI * 2 * 3) * 7 + Math.sin(x / TW * Math.PI * 2 * 8) * 3); R(fc, x, gy - h, 1, h, m1); }
      out.push({ cv: far, v: .05 });
      const fields = layer(PH), dc = fields.getContext('2d');
      for (let y = gy, row = 0; y < p0; row++) {                 // 稻田：越近一格越高，田埂、水面反光；每格寬度不一樣
        const h = Math.min(p0 - y, 3 + row * 2);
        for (let x = 0; x < TW;) {
          let fw = pick(rnd, [24, 24, 36, 48]); if (TW - x < fw + 12) fw = TW - x;
          const k = rnd(), col = k < .3 ? WATER : k < .65 ? RICE : RICE2;
          RW(dc, x, y, fw, h, col);
          if (col !== WATER) for (let i = 1; i < fw; i += 2) RW(dc, x + i, y + 1, 1, Math.max(1, h - 2), shade(col, -.1));
          else { RW(dc, x + 3, y + 1, 6, 1, shade(WATER, .3)); if (h > 4 && rnd() < .5) { const ex = x + ri(rnd, 4, fw - 6); RW(dc, ex, y + h - 4, 2, 2, '#ffffff'); RW(dc, ex + 1, y + h - 6, 1, 2, '#ffffff'); RW(dc, ex + 2, y + h - 6, 1, 1, '#f2b134'); RW(dc, ex, y + h - 2, 1, 2, '#3b3f4a'); } }   // 白鷺鷥
          RW(dc, x, y, 1, h, T('#7a8a4a', tod));
          x += fw;
        }
        R(dc, 0, y, TW, 1, T('#8f9a5a', tod)); y += h;
      }
      const FARM = artOf('country', 'house'), BANY = artOf('country', 'banyan'), SCARE = artOf('country', 'scare');   // AI 圖：農舍、大榕樹、稻草人
      for (const hx0 of spots(rnd, 160, 280)) {             // 農舍（紅屋頂、白牆；窗戶晚上亮）＋旁邊的竹叢
        if (FARM) { artAt(dc, FARM[0], hx0 + 15, gy + 7, tod); continue; }
        const base = gy + 4 + ri(rnd, 0, 4), wall = T(pick(rnd, ['#efe6d2', '#e8d8c0']), tod), roof = T(pick(rnd, ['#b8483a', '#a8584a', '#8a4a3a']), tod), w = ri(rnd, 26, 36);
        RW(dc, hx0, base - 9, w, 9, wall); RW(dc, hx0, base - 9, w, 1, shade(wall, -.15));
        for (let k = 0; k < w + 4; k++) RW(dc, hx0 - 2 + k, base - 13 + Math.round(Math.abs(k - (w + 3) / 2) / 8), 1, 4, k % 2 ? roof : shade(roof, .12));
        RW(dc, hx0 + 4, base - 6, 4, 4, lit ? '#ffd27a' : T('#5a6a7a', tod)); RW(dc, hx0 + Math.round(w / 2) - 2, base - 6, 5, 6, T('#7a5a3a', tod)); RW(dc, hx0 + w - 8, base - 6, 4, 4, lit ? '#ffd27a' : T('#5a6a7a', tod));
        lights.push({ x: hx0 + 6, y: base - 4, v: .25, r: 10, col: '255,210,140' }); lights.push({ x: hx0 + w - 6, y: base - 4, v: .25, r: 10, col: '255,210,140' });
        for (let k = 0; k < 6; k++) { const bx = hx0 + w + 3 + k * 2, bh = ri(rnd, 12, 18); RW(dc, bx, base - bh, 1, bh, T('#6a9a4a', tod)); RW(dc, bx - 1, base - bh, 3, 2, T('#5a8a3a', tod)); }
      }
      out.push({ cv: fields, v: .25 });
      const mid = layer(PH), mc = mid.getContext('2d'), pole = T('#7a6a5a', tod);
      const banyan = ri(rnd, 30, TW - 30);
      if (BANY) artAt(mc, BANY[0], banyan, p0 - 2, tod);
      else { const b = p0 - 3, tk = T('#6a5a4a', tod), lf = T('#3f7a3f', tod);                      // 地標：大榕樹（垂下來的氣根）＋樹下的小土地公廟
        RW(mc, banyan - 3, b - 18, 7, 18, tk); RW(mc, banyan + 2, b - 18, 2, 18, shade(tk, -.2)); RW(mc, banyan - 6, b - 3, 13, 3, tk);
        blob(mc, [[banyan, b - 30, 15], [banyan - 13, b - 24, 11], [banyan + 13, b - 25, 11], [banyan - 4, b - 38, 10], [banyan + 7, b - 36, 9]], lf, shade(lf, .15), shade(lf, -.22), banyan - 26, b - 50, banyan + 26, b - 14);
        for (let k = -18; k <= 18; k += 3) RW(mc, banyan + k, b - 16, 1, ri(rnd, 4, 9), shade(tk, .1));
        const sx = banyan + 14, sr = T('#c8372d', tod); RW(mc, sx, b - 7, 8, 7, T('#efe6d2', tod)); for (let k = 0; k < 12; k++) RW(mc, sx - 2 + k, b - 10 + Math.round(Math.abs(k - 5.5) / 3), 1, 3, sr); RW(mc, sx + 2, b - 5, 4, 5, sr); }
      const poles = spots(rnd, 50, 80).filter(x => Math.abs(x - banyan) > 24);
      for (const x of poles) { RW(mc, x, p0 - 44, 2, 44, pole); RW(mc, x + 1, p0 - 44, 1, 44, shade(pole, -.2)); RW(mc, x - 5, p0 - 41, 12, 1, pole); RW(mc, x - 5, p0 - 42, 1, 1, '#d9dde2'); RW(mc, x + 6, p0 - 42, 1, 1, '#d9dde2'); }   // 電線桿
      poles.forEach((x, i) => {                                   // 電線：每兩根之間垂一點
        const nx = i + 1 < poles.length ? poles[i + 1] : poles[0] + TW, span = nx - x;
        for (let k = 0; k <= span; k++) { const sag = Math.round(Math.sin(k / span * Math.PI) * 4); RW(mc, (x + k) % TW, p0 - 42 + sag, 1, 1, '#3b3f4a'); RW(mc, (x + k) % TW, p0 - 39 + sag, 1, 1, '#3b3f4a'); }
      });
      if (SCARE) artAt(mc, pickArt(rnd, SCARE), (banyan + ri(rnd, 140, 320)) % TW, p0 - 2, tod);
      else { const sx = (banyan + ri(rnd, 140, 320)) % TW, b = p0 - 2, straw = T('#d9b55a', tod);   // 稻草人
        RW(mc, sx, b - 20, 1, 20, '#6b4a33'); RW(mc, sx - 8, b - 15, 17, 1, '#6b4a33');
        blob(mc, [[sx, b - 22, 3]], straw, shade(straw, .2), shade(straw, -.2), sx - 4, b - 26, sx + 4, b - 18);
        RW(mc, sx - 5, b - 26, 11, 1, T('#8a5a2a', tod)); RW(mc, sx - 3, b - 29, 7, 3, T('#8a5a2a', tod));
        RW(mc, sx - 4, b - 16, 9, 7, T('#3f6fae', tod)); RW(mc, sx - 9, b - 16, 4, 2, straw); RW(mc, sx + 6, b - 16, 4, 2, straw); }
      tufts(mc, rnd, 50, p0 - 6, p0 - 1, T('#5d8f4e', tod), T('#8fbf7a', tod));
      out.push({ cv: mid, v: .55 });
      const path = layer(PH), pc = path.getContext('2d'), DIRT = T('#b59a72', tod);   // 土路：兩條輪痕、中間一條草、水窪
      dither(pc, 0, p0, TW, p1 - p0, DIRT, shade(DIRT, -.07), (x, y) => .35 + Math.sin(x / TW * Math.PI * 2 * 11) * .15);
      const mid1 = Math.round((p0 + p1) / 2);
      for (let x = 0; x < TW; x++) { R(pc, x, mid1 - 1, 1, 3, (x * 7) % 5 ? T('#7fa85a', tod) : T('#6a9a4a', tod)); if (x % 3 === 0) R(pc, x, mid1 - 2, 1, 1, T('#8fbf6a', tod)); }
      R(pc, 0, p0 + 4, TW, 1, shade(DIRT, -.15)); R(pc, 0, p1 - 5, TW, 1, shade(DIRT, -.15));
      for (let i = 0; i < 16; i++) { const x = Math.floor(rnd() * TW), y = p0 + 2 + Math.floor(rnd() * (p1 - p0 - 3)); RW(pc, x, y, 3, 2, shade(DIRT, .15)); RW(pc, x, y + 2, 3, 1, shade(DIRT, -.18)); }
      road(pc, rnd, g, { puddles: 2, leaves: 8, base: DIRT });
      R(pc, 0, p0, TW, 1, T('#6a9a4a', tod)); R(pc, 0, p1 - 1, TW, 1, shade(DIRT, -.25));
      out.push({ cv: path, v: 1, path: true });
      const fg = layer(PH), fgc = fg.getContext('2d'), G1 = T('#7fb36a', tod), G2 = T('#6aa057', tod);
      dither(fgc, 0, p1, TW, PH - p1, G1, G2, (x, y) => ((y - p1) / Math.max(1, PH - p1)) * .8);
      tufts(fgc, rnd, 90, p1 + 3, PH - 2, shade(G2, -.18), shade(G1, .1));
      if (!night) flowers(fgc, rnd, 20, p1 + 4, PH - 3, shade(G2, -.2));
      out.push({ cv: fg, v: 1.25 });
      out.push(frontLayer(g, (c, r, b, hmax) => {          // 靠鏡頭：竹籬笆、長長的草
        const fence = ri(r, 0, TW - 90), bam = T('#b8a05a', tod);
        for (let k = 0; k < 80; k += 5) { const h = hmax - 2 - (k % 10 ? 2 : 0); RW(c, fence + k, b - h, 2, h, bam); RW(c, fence + k, b - h, 2, 1, shade(bam, .2)); }
        RW(c, fence, b - hmax + 6, 80, 1, shade(bam, -.2)); RW(c, fence, b - 6, 80, 1, shade(bam, -.2));
        for (const x of spots(r, 24, 52)) if (x < fence - 8 || x > fence + 88) bigGrass(c, x, b, ri(r, Math.round(hmax * .55), hmax), shade(G2, -.15));
      }));
      return { layers: out, lights };
    } },

    flowers: { label: '花田', sky: ['balloon', 'birds'], passers: ['person', 'farmer', 'person'], balloon: ['#d94a8a', '#f4efe6'], build(g) {   // 花田：遠山、一片向日葵、風車（地標）、大小不一的大朵向日葵、木頭步道、紫色薰衣草；蝴蝶飛來飛去
      const { PH, gy, p0, p1, tod, night } = g, rnd = rng(99), out = [];
      const Y = T('#f6c531', tod), Y2 = T('#e3a21f', tod), BROWN = T('#6b4325', tod), LEAF = T('#4f8f3f', tod), LAV = T('#9a7bd1', tod), LAV2 = T('#7e5fb8', tod);
      const far = layer(PH), fc = far.getContext('2d'), hill = mix(T('#86ad73', tod), g.skyLow, .35);
      ridge(fc, rnd, gy - 4, 24, mix(T('#9aa8c0', tod), g.skyLow, .55));
      for (let x = 0; x < TW; x++) { const h = 8 + Math.round(Math.sin(x / TW * Math.PI * 2 * 4) * 4); R(fc, x, gy - h, 1, h, hill); }
      out.push({ cv: far, v: .06 });
      const field = layer(PH), dc = field.getContext('2d');
      R(dc, 0, gy, TW, p0 - gy, T('#5e9a46', tod));
      for (let y = gy + 1; y < p0 - 8; y += 2) for (let x = (y % 4) / 2; x < TW; x += 3) RW(dc, x, y, 1 + (y - gy > 14 ? 1 : 0), 1, (x + y) % 5 ? Y : Y2);   // 遠處一片向日葵（點點，越近越大）
      for (const x of spots(rnd, 50, 110)) { const y0 = ri(rnd, gy + 3, p0 - 16), w = ri(rnd, 18, 46); for (let y = y0; y < y0 + ri(rnd, 3, 6); y++) for (let k = 0; k < w; k += 2) RW(dc, x + k + (y % 2), y, 1 + (y - gy > 14 ? 1 : 0), 1, (k + y) % 3 ? LAV : LAV2); }   // 一段一段紫色的薰衣草田
      const mill = ri(rnd, 30, TW - 30);
      const MILL = artOf('flowers', 'windmill');           // AI 圖：風車
      if (MILL) artAt(dc, MILL[0], mill, gy + 14, tod);
      else { const b = gy + 14, wall = T('#efe6d2', tod), roof = T('#8a4a3a', tod), blade = T('#f4efe6', tod);   // 地標：風車
        for (let k = 0; k < 22; k++) { const w = Math.round(5 + k * .3); RW(dc, mill - w, b - k, w * 2, 1, k % 6 ? wall : shade(wall, -.1)); }
        for (let k = 0; k < 6; k++) RW(dc, mill - 6 + k, b - 22 - k, 13 - k * 2, 1, roof);
        RW(dc, mill - 2, b - 6, 4, 6, T('#6b4a33', tod)); RW(dc, mill - 1, b - 14, 2, 2, T('#5a6a7a', tod));
        for (let k = 2; k < 16; k++) { RW(dc, mill + k, b - 22 - k, 2, 2, blade); RW(dc, mill - k, b - 22 + k, 2, 2, blade); RW(dc, mill - k, b - 22 - k, 2, 2, blade); RW(dc, mill + k, b - 22 + k, 2, 2, blade); }
        RW(dc, mill - 1, b - 23, 3, 3, T('#3b3f4a', tod)); }
      out.push({ cv: field, v: .3 });
      const mid = layer(PH), mc = mid.getContext('2d');
      for (let x = 4; x < TW; x += ri(rnd, 7, 15)) {            // 大朵向日葵：高矮、間距不一樣
        const h = ri(rnd, 14, 26), fx = x, fy = p0 - h, big = rnd() < .3;
        RW(mc, fx, fy, 1, h, LEAF); RW(mc, fx - 3, fy + 7, 3, 2, LEAF); RW(mc, fx + 1, fy + 10, 3, 2, shade(LEAF, -.1));
        for (const [dx, dy] of [[-3, 0], [3, 0], [0, -3], [0, 3], [-2, -2], [2, -2], [-2, 2], [2, 2]]) RW(mc, fx + dx * (big ? 1.3 : 1) - (dx > 0 ? 0 : 1), fy + dy * (big ? 1.3 : 1) - 1, 2, 2, (dx + dy) % 2 ? Y : Y2);
        RW(mc, fx - 1, fy - 1, 3, 3, BROWN); RW(mc, fx - 1, fy - 1, 1, 1, shade(BROWN, .2));
      }
      out.push({ cv: mid, v: .6 });
      const path = layer(PH), pc = path.getContext('2d'), WOOD = T('#c09466', tod);   // 木頭步道（橫的木板）
      R(pc, 0, p0, TW, p1 - p0, shade(WOOD, -.25));
      for (let y = p0 + 1, r = 0; y < p1 - 1; r++) {          // 近大遠小：遠的木板短、薄，靠近你的長、厚（長度整除 480）
        const f = (y - p0) / Math.max(1, p1 - p0), L = f < .3 ? 16 : f < .65 ? 20 : 24, h = Math.min(f < .3 ? 3 : f < .65 ? 4 : 5, p1 - 1 - y);
        if (h < 2) break;
        for (let x = -(r % 2) * (L / 2); x < TW; x += L) {
          const col = rnd() < .3 ? shade(WOOD, -.06) : rnd() < .1 ? shade(WOOD, .06) : WOOD;
          const u = 1 / K;                                   // 縫、亮邊、釘子、木紋：一小格
          RW(pc, x, y, L - u, h - u, col); RW(pc, x, y, L - u, u, shade(col, .12)); RW(pc, x + 2, y + 1, u, u, shade(WOOD, -.35)); RW(pc, x + L - 4, y + 1, u, u, shade(WOOD, -.35));
          if (rnd() < .15) RW(pc, x + ri(rnd, 5, L - 8), y + Math.floor(h / 2), 4, u, shade(col, -.1));   // 木紋
        }
        y += h;
      }
      road(pc, rnd, g, { leaves: 26, leafCols: [Y, Y2, LAV], base: WOOD });   // 掉下來的花瓣
      out.push({ cv: path, v: 1, path: true });
      const fg = layer(PH), fgc = fg.getContext('2d');
      R(fgc, 0, p1, TW, PH - p1, T('#5e8a46', tod));
      for (let x = 0; x < TW; x += 6) for (let k = 0; k < 7; k++) {   // 薰衣草：一叢一叢紫色的穗
        const sx = x + Math.floor(rnd() * 5), sy = p1 + 2 + Math.floor(rnd() * (PH - p1 - 6));
        RW(fgc, sx, sy + 2, 1, 4, T('#6a8a4a', tod)); RW(fgc, sx, sy - 1, 1, 3, k % 2 ? LAV : LAV2); RW(fgc, sx + (k % 2 ? 1 : -1), sy, 1, 1, LAV);
      }
      out.push({ cv: fg, v: 1.25 });
      out.push(frontLayer(g, (c, r, b, hmax) => {          // 靠鏡頭：大束薰衣草、大朵向日葵
        for (const x of spots(r, 18, 44)) {
          if (r() < .7) { for (let k = 0; k < 4; k++) { const h = ri(r, Math.round(hmax * .5), hmax), xx = x + k * 2 - 3 + Math.round(k * .5); RW(c, xx, b - h, 1, h, T('#5a7a3a', tod)); for (let j = 0; j < 5; j++) RW(c, xx - (j % 2), b - h - j, 2, 1, j % 2 ? LAV : LAV2); } }
          else bigFlower(c, x, b, ri(r, Math.round(hmax * .6), hmax - 2), Y, LEAF);
        }
      }));
      return { layers: out, lights: [], fx(c, a) {             // 蝴蝶（晚上換螢火蟲）
        for (let i = 0; i < 4; i++) {
          const x = ((i * 61 + a.t / 1000 * (6 + i * 2) - a.scroll * .7) % a.PW + a.PW) % a.PW, y = gy + 6 + i * 8 + Math.sin(a.t / 500 + i * 2) * 6, flap = Math.floor(a.t / 160 + i) % 2;
          if (night) { if (Math.sin(a.t / 400 + i) > 0) { R(c, x, y, 1, 1, '#e8ff8a'); a.glow.push([x, y, 6]); } continue; }
          const col = ['#ffffff', '#f2a8d0', '#f6d44a', '#9ad0f5'][i];
          R(c, x, y, 1, 2, '#3b3f4a'); R(c, x - (flap ? 2 : 1), y - (flap ? 1 : 0), flap ? 2 : 1, 2, col); R(c, x + 1, y - (flap ? 1 : 0), flap ? 2 : 1, 2, col);
        }
      } };
    } },

    harbor: { label: '港口', geo: { gy: .34 }, sky: ['birds'], passers: ['gull', 'person', 'gull', 'farmer'], build(g) {   // 港口碼頭：遠處的船、防波堤上的紅燈塔、大小顏色不一的漁船、纜繩樁、木箱、漁網、水泥碼頭、黃色邊線、輪胎；海鷗飛過
      const { PH, gy, p0, p1, tod, night, lit } = g, rnd = rng(111), out = [], lights = [];
      const SEA = T('#3f8fb5', tod), SEA2 = T('#6fb0cf', tod);
      const sea = layer(PH), sc = sea.getContext('2d');
      ridge(sc, rnd, gy, 16, mix(T('#7f98a8', tod), g.skyLow, .5));
      dither(sc, 0, gy, TW, p0 - gy, SEA2, SEA, (x, y) => (y - gy) / Math.max(1, p0 - gy));
      for (let i = 0; i < 40; i++) RW(sc, Math.floor(rnd() * TW), gy + 3 + Math.floor(rnd() * (p0 - gy - 6)), 3, 1, shade(SEA2, .25));
      for (const x of spots(rnd, 70, 150)) { const big = rnd() < .4, sh = mix(T(pick(rnd, ['#e9e6df', '#c8372d', '#3b5a8a']), tod), g.skyLow, .3); RW(sc, x, gy - 3, big ? 18 : 10, 3, sh); RW(sc, x + 3, gy - 6, big ? 8 : 4, 3, mix(T('#e9e6df', tod), g.skyLow, .3)); }   // 遠處的船
      const lh = ri(rnd, 30, TW - 60);
      { const y = gy + 8, wall = T('#a8a29a', tod);                                                 // 地標：防波堤＋紅燈塔
        RW(sc, lh - 30, y, 60, 4, wall); RW(sc, lh - 30, y, 60, 1, shade(wall, .2)); for (let k = 0; k < 60; k += 6) RW(sc, lh - 30 + k, y + 1, 4, 3, shade(wall, -.15));
        RW(sc, lh + 20, y - 18, 6, 18, T('#d9483b', tod)); RW(sc, lh + 20, y - 12, 6, 3, '#ffffff'); RW(sc, lh + 19, y - 20, 8, 2, T('#3b3f4a', tod)); RW(sc, lh + 21, y - 23, 4, 3, lit ? '#ffe39a' : '#cfd6dd'); RW(sc, lh + 22, y - 25, 2, 2, T('#3b3f4a', tod));
        lights.push({ x: lh + 23, y: y - 22, v: .08, r: 14, col: '255,200,170' }); }
      out.push({ cv: sea, v: .08 });
      const boats = layer(PH), bc = boats.getContext('2d');
      const BOATS = artOf('harbor', 'boat');               // AI 圖：漁船
      for (const x of spots(rnd, 46, 80)) {                    // 漁船：長短、顏色、旗子不一樣
        if (BOATS) { artAt(bc, pickArt(rnd, BOATS), x + 20, p0 + 2, tod); continue; }
        const L = ri(rnd, 28, 44), by = p0 - ri(rnd, 13, 16), H = T(pick(rnd, ['#d9483b', '#2f6fae', '#2f8a5a', '#e8a33a', '#f4efe6']), tod), cab = T(pick(rnd, ['#f4efe6', '#f2d35b', '#cfe0e8']), tod);
        for (let k = 0; k < L; k++) { const d = Math.round(Math.abs(k - L / 2) / (L / 4)); RW(bc, x + k, by + d, 1, 7 - d * 2, H); }
        RW(bc, x, by, L, 1, shade(H, .2)); RW(bc, x + 2, by + 3, L - 4, 1, '#f4efe6');
        const cw = Math.round(L * .3), cx = x + Math.round(L * .35);
        RW(bc, cx, by - 8, cw, 8, cab); RW(bc, cx + 2, by - 6, 3, 3, lit ? '#ffd27a' : '#5a7a9a'); if (cw > 10) RW(bc, cx + 7, by - 6, 3, 3, lit ? '#ffd27a' : '#5a7a9a'); RW(bc, cx - 1, by - 9, cw + 2, 1, shade(cab, -.25));
        const mx = x + Math.round(L * .72); RW(bc, mx, by - 22, 1, 22, '#5a5a5a'); RW(bc, mx + 1, by - 22, 6, 4, pick(rnd, ['#e8574f', '#f2d35b', '#3f8fd5'])); for (let k = 0; k < 10; k++) RW(bc, mx - k, by - 20 + k * 2, 1, 1, '#9a9a9a');
        lights.push({ x: cx + 4, y: by - 4, v: .4, r: 12, col: '255,210,140' });
        RW(bc, x, by + 7, L, 1, shade(SEA, -.2));
      }
      out.push({ cv: boats, v: .4 });
      const path = layer(PH), pc = path.getContext('2d'), CON = T('#b9b6ae', tod);   // 水泥碼頭：接縫、黃色邊線、纜繩樁、木箱、漁網、繩子
      dither(pc, 0, p0, TW, p1 - p0, CON, shade(CON, -.05), (x, y) => .25 + Math.sin(x * .04) * .15);
      R(pc, 0, p0, TW, 2, '#f2c531'); R(pc, 0, p0 + 2, TW, 1, shade(CON, -.2));
      for (let x = 0; x < TW; x += 30) R(pc, x, p0 + 3, 1 / K, p1 - p0 - 3, shade(CON, -.15));
      for (const x of spots(rnd, 40, 80)) { RW(pc, x - 2, p0 - 4, 5, 6, '#3b3f4a'); RW(pc, x - 3, p0 - 5, 7, 2, '#4a4f5a'); RW(pc, x - 2, p0 - 4, 1, 6, '#5a6070'); }   // 纜繩樁
      for (const x of spots(rnd, 70, 150)) { const w = T('#a8774c', tod), n = ri(rnd, 1, 3); for (let k = 0; k < n; k++) { const bx = x + k * 11; RW(pc, bx, p0 - 8, 10, 9, w); RW(pc, bx, p0 - 8, 10, 1, shade(w, .15)); RW(pc, bx, p0 - 4, 10, 1, shade(w, -.2)); RW(pc, bx + 9, p0 - 8, 1, 9, shade(w, -.25)); } }   // 木箱
      { const nx = ri(rnd, 20, TW - 40), net = T('#3f8a7a', tod); oval(pc, nx, p0 + 8, 12, 4, net); for (let k = -10; k <= 10; k += 3) RW(pc, nx + k, p0 + 6, 1, 4, shade(net, -.25)); for (let k = 0; k < 3; k++) RW(pc, nx - 6 + k * 6, p0 + 5, 2, 2, '#f2b134'); }   // 漁網＋浮球
      for (const x of spots(rnd, 120, 220)) { oval(pc, x, p1 - 9, 5, 2, T('#c9b089', tod)); oval(pc, x, p1 - 9, 3, 1, shade(T('#c9b089', tod), -.2)); }   // 一圈繩子
      road(pc, rnd, g, { cracks: 6, crackCol: shade(CON, -.2), base: CON });
      R(pc, 0, p1 - 2, TW, 2, shade(CON, -.3));
      for (const lx of spots(rnd, 110, 150)) { lamp(pc, lx, p0, lit); lights.push({ x: lx + 3.5, y: p0 - 33, v: 1, r: 60 }); }
      out.push({ cv: path, v: 1, path: true });
      const fg = layer(PH), fgc = fg.getContext('2d');        // 碼頭邊：舊輪胎、下面的海
      R(fgc, 0, p1, TW, 4, shade(CON, -.2));
      dither(fgc, 0, p1 + 4, TW, PH - p1 - 4, SEA, shade(SEA, -.15), (x, y) => .5);
      for (const x of spots(rnd, 24, 40)) { RW(fgc, x, p1, 7, 7, '#2a2a2e'); RW(fgc, x + 2, p1 + 2, 3, 3, shade(SEA, -.1)); RW(fgc, x, p1, 7, 1, '#4a4a50'); }
      for (let i = 0; i < 24; i++) RW(fgc, Math.floor(rnd() * TW), p1 + 8 + Math.floor(rnd() * (PH - p1 - 9)), 3, 1, shade(SEA, .2));
      out.push({ cv: fg, v: 1.25 });
      out.push(frontLayer(g, (c, r, b, hmax) => {          // 靠鏡頭：碼頭邊的鐵鍊欄杆
        const posts = spots(r, 50, 76), post = T('#e8e2d6', tod), ch = T('#5a5a5e', tod);
        for (const x of posts) { RW(c, x - 2, b - hmax, 5, hmax, post); RW(c, x - 2, b - hmax, 5, 1, shade(post, .2)); RW(c, x + 2, b - hmax, 1, hmax, shade(post, -.25)); RW(c, x - 2, b - hmax + 3, 5, 2, T('#d9483b', tod)); }
        posts.forEach((x, i) => { const nx = i + 1 < posts.length ? posts[i + 1] : posts[0] + TW, span = nx - x; for (let k = 3; k < span - 2; k++) RW(c, (x + k) % TW, b - hmax + 6 + Math.round(Math.sin(k / span * Math.PI) * 5), 1, 1, k % 3 ? ch : shade(ch, .25)); });
      }));
      return { layers: out, lights, animAt: 0, anim(c, a) {    // 海鷗飛過天空（晚上不飛）
        if (night) return;
        for (let i = 0; i < 3; i++) {
          const x = ((i * 70 + a.t / 1000 * (10 + i * 3)) % (a.PW + 20)) - 10, y = gy * (.3 + i * .15) + Math.sin(a.t / 700 + i) * 3, up = Math.floor(a.t / 250 + i) % 2;
          R(c, x - 2, y - (up ? 1 : 0), 2, 1, '#ffffff'); R(c, x, y, 1, 1, '#ffffff'); R(c, x + 1, y - (up ? 1 : 0), 2, 1, '#ffffff');
        }
      } };
    } },

    mountain: { label: '山上', geo: { gy: .36 }, sky: ['birds'], passers: ['hiker', 'hiker', 'dogwalk'], build(g) {   // 山上步道：雲海裡露出來的山頭、岩石、高矮不一的松樹、涼亭、三角點（地標）、木頭階梯步道
      const { PH, gy, p0, p1, tod, night } = g, rnd = rng(122), out = [];
      const far = layer(PH), fc = far.getContext('2d'), peak = mix(T('#6f86a6', tod), g.skyLow, .35), CLOUD = T('#f4f6fa', tod);
      ridge(fc, rnd, gy - 2, 40, peak, shade(peak, .3));
      R(fc, 0, gy - 6, TW, 12, CLOUD);                                                           // 雲海：厚厚一層，上面一團一團凸起來
      for (let x = 0; x < TW; x += ri(rnd, 10, 18)) blob(fc, [[x, gy - 7, ri(rnd, 4, 6)], [x + 6, gy - 9, ri(rnd, 5, 7)], [x + 11, gy - 6, 4]], CLOUD, '#ffffff', shade(CLOUD, -.08), x - 6, gy - 17, x + 16, gy - 2);
      out.push({ cv: far, v: .04 });
      const ridgeL = layer(PH), rc = ridgeL.getContext('2d'), ROCK = T('#8a8578', tod), G1 = T('#6f9a58', tod);
      for (let x = 0; x < TW; x++) { const h = 8 + Math.round(Math.sin(x / TW * Math.PI * 2 * 4 + 1) * 4); R(rc, x, gy + 6 - h, 1, p0 - gy - 6 + h, G1); }
      dither(rc, 0, gy + 4, TW, p0 - gy - 4, G1, shade(G1, -.12), (x, y) => (y - gy - 4) / Math.max(1, p0 - gy - 4));
      for (const x of spots(rnd, 24, 60)) { const s = ri(rnd, 3, 7); blob(rc, [[x, p0 - s, s], [x + s * .7, p0 - s * .7, s * .8]], ROCK, shade(ROCK, .2), shade(ROCK, -.25), x - s - 1, p0 - 2 * s - 2, x + 2 * s, p0 - 1); }   // 岩石
      for (const [k, g0, g1, h0, h1] of [[.25, 8, 18, 8, 13], [.55, 12, 30, 12, 20]]) for (const x of spots(rnd, g0, g1)) pine(rc, x, Math.round(gy + (p0 - gy) * k) + ri(rnd, -2, 2), ri(rnd, h0, h1), T(pick(rnd, ['#3f6b4c', '#4a7a52', '#5a8a5a']), tod));   // 遠近兩排小松樹
      const px = ri(rnd, 30, TW - 30);
      const MPINE = artOf('mountain', 'pine'), PAV = artOf('mountain', 'pavilion');   // AI 圖：松樹、涼亭
      if (MPINE) { for (const x of spots(rnd, 40, 90)) if (Math.abs(x - px) > 40) artAt(rc, pickArt(rnd, MPINE), x, p0 - 2, tod); }
      else for (const x of spots(rnd, 16, 40)) if (Math.abs(x - px) > 20) pine(rc, x, p0 - 3 - ri(rnd, 0, 8), ri(rnd, 16, 32), T(pick(rnd, ['#3f6b4c', '#355e42', '#4a7a52']), tod));
      if (PAV) artAt(rc, PAV[0], px, p0 - 2, tod);
      else { const b = p0 - 3, roof = T('#7a3a2a', tod), post = T('#8a5a3a', tod);   // 涼亭：翹起來的屋頂、四根柱子
        for (let k = 0; k < 26; k++) RW(rc, px - 13 + k, b - 22 + Math.round(Math.abs(k - 12.5) / 4), 1, 3, k % 2 ? roof : shade(roof, .15));
        RW(rc, px - 15, b - 18, 2, 1, roof); RW(rc, px + 13, b - 18, 2, 1, roof); RW(rc, px - 1, b - 26, 2, 4, roof);
        for (const ox of [-10, -4, 3, 9]) RW(rc, px + ox, b - 18, 2, 18, post);
        RW(rc, px - 11, b - 8, 22, 2, shade(post, -.15)); }
      { const sx = (px + ri(rnd, 120, 300)) % TW, b = p0 - 2, st = T('#d9d4c8', tod);           // 地標：山頂的三角點石柱＋小旗子
        RW(rc, sx - 2, b - 8, 5, 8, st); RW(rc, sx - 2, b - 8, 5, 1, shade(st, .2)); RW(rc, sx - 1, b - 6, 3, 1, T('#c8372d', tod)); RW(rc, sx + 5, b - 18, 1, 18, '#6b4a33'); RW(rc, sx + 6, b - 18, 5, 3, T('#e8574f', tod)); }
      out.push({ cv: ridgeL, v: .4 });
      const path = layer(PH), pc = path.getContext('2d'), STEP = T('#a87e57', tod);   // 木頭階梯：一階一階、側面暗、中間是土
      R(pc, 0, p0, TW, p1 - p0, T('#9b7653', tod));
      for (let x = 0; x < TW; x += 10) { RW(pc, x, p0 + 2, 9, p1 - p0 - 4, STEP); RW(pc, x, p0 + 2, 9, 1, shade(STEP, .15)); RW(pc, x + 8, p0 + 2, 1, p1 - p0 - 4, shade(STEP, -.3)); for (let y = p0 + 5; y < p1 - 3; y += 4) RW(pc, x + 2, y, 4, 1, shade(STEP, -.1)); }
      road(pc, rnd, g, { leaves: 16, base: STEP });
      R(pc, 0, p0, TW, 2, shade(G1, -.2)); R(pc, 0, p1 - 2, TW, 2, shade(STEP, -.35));
      for (let x = 0; x < TW; x += 20) RW(pc, x + 3, p0 - 6, 1, 7, '#6b4a33');   // 繩子欄杆
      for (let x = 0; x < TW; x++) R(pc, x, p0 - 5 + Math.round(Math.sin(((x - 3 + TW) % 20) / 20 * Math.PI) * 1.5), 1, 1, '#c8b28a');
      out.push({ cv: path, v: 1, path: true });
      const fg = layer(PH), fgc = fg.getContext('2d');
      dither(fgc, 0, p1, TW, PH - p1, G1, shade(G1, -.15), (x, y) => ((y - p1) / Math.max(1, PH - p1)) * .7);
      tufts(fgc, rnd, 80, p1 + 3, PH - 2, shade(G1, -.2), shade(G1, .12));
      if (!night) flowers(fgc, rnd, 14, p1 + 4, PH - 3, shade(G1, -.2));
      out.push({ cv: fg, v: 1.25 });
      out.push(frontLayer(g, (c, r, b, hmax) => {          // 靠鏡頭：大石頭、高山的草和小花
        for (const x of spots(r, 26, 60)) {
          const k = r();
          if (k < .4) bigRock(c, x, b, ri(r, 5, Math.round(hmax * .45)), shade(ROCK, -.08));
          else if (k < .8) bigGrass(c, x, b, ri(r, Math.round(hmax * .5), hmax), shade(G1, -.2));
          else if (!night) bigFlower(c, x, b, ri(r, Math.round(hmax * .5), hmax - 2), pick(r, ['#ffffff', '#f2d35b', '#b59cf0']), shade(G1, -.25));
        }
      }));
      return { layers: out, lights: [] };
    } },

    nightmarket: { label: '夜市', geo: { gy: .38 }, passers: ['person', 'person', 'dogwalk', 'person', 'person'], build(g) {   // 夜市：遠處的摩天輪（地標）、寬窄顏色不一的攤位（招牌、遮棚、食物、冒煙）、一串串燈泡、柏油路、停著的機車、塑膠椅
      const { PH, gy, p0, p1, tod, night, lit } = g, rnd = rng(133), out = [], lights = [];
      const far = layer(PH), fc = far.getContext('2d'), bld = mix(T('#6a6a80', tod), g.skyLow, .2);
      const wheel = ri(rnd, 40, TW - 40);
      { const cy = gy - 26, r = 22, frame = mix(T('#c9c2d6', tod), g.skyLow, .15);                // 地標：摩天輪（晚上一圈燈）
        for (let a = 0; a < 64; a++) { const t = a / 64 * Math.PI * 2; RW(fc, wheel + Math.round(Math.cos(t) * r), cy + Math.round(Math.sin(t) * r), 1, 1, lit && a % 2 ? '#ffd77a' : frame); }
        for (let a = 0; a < 8; a++) { const t = a / 8 * Math.PI * 2; for (let k = 2; k < r; k += 2) RW(fc, wheel + Math.round(Math.cos(t) * k), cy + Math.round(Math.sin(t) * k), 1, 1, frame); RW(fc, wheel + Math.round(Math.cos(t) * r) - 1, cy + Math.round(Math.sin(t) * r) + 1, 3, 3, ['#e8574f', '#f2b134', '#3f8fd5', '#4fb36a'][a % 4]); }
        for (const d of [-1, 1]) for (let k = 0; k < r + 26; k++) RW(fc, wheel + Math.round(d * k * .35), cy + k, 1, 1, frame);
        if (lit) lights.push({ x: wheel, y: cy, v: .1, r: 30, col: '255,200,150' }); }
      towns(fc, rnd, g, { cols: ['#8a7a8a', '#6a7a8a', '#8a8070', '#5a6a7a', '#9a8a7a', '#7a6a80'], haze: .3, hMin: 4, hMax: 24, wMin: 10, wMax: 20, gap: .2, bottom: gy + 40,
        avoid: (x, w) => Math.abs(x + w / 2 - wheel) < 28 });   // 後面的樓：有高有低、露出天空（2026-10-27「灰色方塊」）
      for (const x of spots(rnd, 50, 110)) {                  // 直的霓虹招牌
        if (Math.abs(x - wheel) < 30) continue;
        const nc = pick(rnd, ['#ff5a7a', '#5ad0ff', '#ffd25a', '#7aff9a']), sy = gy - ri(rnd, 2, 14), sh = ri(rnd, 14, 22);
        RW(fc, x, sy, 3, sh, lit ? nc : mix(nc, bld, .45)); for (let k = sy + 2; k < sy + sh - 2; k += 4) RW(fc, x + 1, k, 1, 2, lit ? '#ffffff' : shade(bld, .3));
        if (lit) lights.push({ x: x + 1, y: sy + 10, v: .1, r: 14, col: '255,150,200' });
      }
      out.push({ cv: far, v: .1 });
      const mid = layer(PH), mc = mid.getContext('2d'), stalls = [];
      const signs = ['#e8574f', '#f2b134', '#3f8fd5', '#d94a8a', '#4fb36a', '#f28fb0'];
      const STALLS = artOf('nightmarket', 'stall');        // AI 圖：攤位（一攤一攤排一排）
      if (STALLS) for (const b of artRow(mc, rnd, STALLS, p0 + 1 / K, tod)) { lights.push({ x: b.x, y: p0 - b.h + 6, v: .5, r: 20, col: '255,200,150' }); if (rnd() < .6) stalls.push(b.x); }
      else for (let x = 0; x < TW;) {                              // 攤位：寬窄、招牌、遮棚花樣、食物都不一樣
        let w = pick(rnd, [24, 30, 30, 36, 42]); if (TW - x < w + 24) w = TW - x;
        const sc = pick(rnd, signs), top = p0 - ri(rnd, 32, 40), roofC = T(pick(rnd, ['#c8372d', '#2f5d8a', '#e8a33a', '#4f8a5a']), tod), stripe = ri(rnd, 3, 5);
        RW(mc, x + 1, top, w - 2, 7, lit ? shade(sc, .1) : T(sc, tod)); RW(mc, x + 1, top, w - 2, 1, '#ffffff');   // 發亮的招牌＋「字」
        for (let k = 0; k < Math.floor((w - 6) / 6); k++) RW(mc, x + 4 + k * 6, top + 2, 4, 3, '#ffffff');
        for (let k = 0; k < w - 2; k++) RW(mc, x + 1 + k, top + 7, 1, 4, Math.floor(k / stripe) % 2 ? roofC : '#f4efe6');   // 條紋遮棚
        for (let k = 0; k < w - 2; k += 4) RW(mc, x + 2 + k, top + 11, 2, 1, roofC);
        RW(mc, x + 2, top + 12, w - 4, p0 - top - 20, lit ? T('#6a4a3a', tod) : T('#7a6a5a', tod));            // 攤位裡面
        RW(mc, x + 1, p0 - 9, w - 2, 8, T('#d9c3a3', tod)); RW(mc, x + 1, p0 - 9, w - 2, 1, shade(T('#d9c3a3', tod), .2));   // 檯子
        for (let k = 0; k < Math.floor((w - 4) / 5); k++) { const food = pick(rnd, ['#e8574f', '#f2b134', '#a8552c', '#f4efe6', '#6aa057', '#d94a8a']); RW(mc, x + 3 + k * 5, p0 - 12, 4, 3, food); RW(mc, x + 3 + k * 5, p0 - 12, 4, 1, shade(food, .25)); }
        RW(mc, x + 1, top, 1, p0 - top, '#5a5a5a'); RW(mc, x + w - 2, top, 1, p0 - top, '#5a5a5a');
        lights.push({ x: x + w / 2, y: top + 3, v: .5, r: 20, col: '255,200,150' });
        if (rnd() < .6) stalls.push(x + Math.round(w / 2));
        x += w;
      }
      for (let x = 0; x < TW; x += 6) {                         // 一串燈泡（彎彎的）
        const y = p0 - 44 + Math.round(Math.sin(((x % 30) / 30) * Math.PI) * 3), col = ['#ffd77a', '#ff9a7a', '#9ad0ff', '#b9ff9a'][(x / 6) % 4];
        RW(mc, x + 2, y + 1, 2, 2, lit ? col : '#d9d9d0');
      }
      for (let x = 0; x < TW; x++) R(mc, x, p0 - 44 + Math.round(Math.sin(((x % 30) / 30) * Math.PI) * 3), 1, 1, '#3b3f4a');
      out.push({ cv: mid, v: .5 });
      const path = layer(PH), pc = path.getContext('2d'), ASP = T('#6f6c72', tod);
      dither(pc, 0, p0, TW, p1 - p0, ASP, shade(ASP, -.06), (x, y) => .25 + Math.sin(x * .05) * .12);
      R(pc, 0, p0, TW, 2, shade(ASP, -.25));
      if (lit) for (let x = 0; x < TW; x += 30) for (let k = 0; k < 6; k++) RW(pc, x + 8 + k * 2, p0 + 3 + (k % 2), 1, 1, 'rgba(255,210,150,.35)');   // 地上的燈光倒影
      road(pc, rnd, g, { cracks: 8, crackCol: shade(ASP, -.2), base: ASP });
      R(pc, 0, p1 - 2, TW, 2, shade(ASP, -.3));
      out.push({ cv: path, v: 1, path: true });
      const fg = layer(PH), fgc = fg.getContext('2d'), CURB = T('#a39a90', tod);
      R(fgc, 0, p1, TW, PH - p1, shade(CURB, -.2)); R(fgc, 0, p1, TW, 3, CURB); R(fgc, 0, p1, TW, 1, shade(CURB, .15));
      out.push({ cv: fg, v: 1.25 });
      out.push(frontLayer(g, (c, r, b, hmax) => {          // 靠鏡頭：停著的機車（顏色不一樣）、紅藍塑膠椅
        for (const x of spots(r, 40, 80)) {
          if (r() < .55) {
            const y = b - 1, body = T(pick(r, ['#d9483b', '#3f8fd5', '#f4efe6', '#f2b134', '#2a2a2e']), tod);
            RW(c, x, y - 5, 6, 6, '#2a2a2e'); RW(c, x + 20, y - 5, 6, 6, '#2a2a2e'); RW(c, x + 2, y - 3, 2, 2, '#8a8a90'); RW(c, x + 22, y - 3, 2, 2, '#8a8a90');
            RW(c, x + 4, y - 11, 18, 7, body); RW(c, x + 4, y - 11, 18, 1, shade(body, .25)); RW(c, x + 7, y - 14, 11, 3, '#3b3b40'); RW(c, x + 20, y - 17, 3, 10, body); RW(c, x + 19, y - 18, 6, 1, '#3b3b40');
          } else {
            for (let k = 0; k < ri(r, 1, 3); k++) { const sx = x + k * 9, col = T(pick(r, ['#d9483b', '#3f8fd5']), tod); RW(c, sx, b - 8, 7, 2, col); RW(c, sx, b - 8, 7, 1, shade(col, .25)); RW(c, sx, b - 6, 1, 6, col); RW(c, sx + 6, b - 6, 1, 6, col); RW(c, sx + 1, b - 3, 5, 1, shade(col, -.2)); }
          }
        }
      }));
      return { layers: out, lights, fx(c, a) {                // 攤位冒煙
        stalls.forEach((sx0, i) => {
          const baseX = ((sx0 - a.scroll * .5) % TW + TW) % TW, up = (a.t / 1000 * 6 + i * 5) % 14;
          for (const bx of [baseX, baseX - TW, baseX + TW]) if (bx > -4 && bx < a.PW + 4) R(c, bx + Math.sin(a.t / 400 + i) * 1.5, p0 - 14 - up, 2, 1, `rgba(255,255,255,${(.5 - up / 30).toFixed(2)})`);
        });
      } };
    } },

    campus: { label: '校園', sky: ['kite', 'birds'], passers: ['student', 'student', 'cyclist', 'dogwalk', 'student'], build(g) {   // 校園操場：教室大樓（鐘塔、一排窗）、升旗台（地標）、圍欄、大小不一的樹、籃球架、紅色跑道＋白線、綠色球場
      const { PH, gy, p0, p1, tod, night, lit } = g, rnd = rng(144), out = [], lights = [];
      const far = layer(PH), fc = far.getContext('2d'), WALL = T('#e9dcc4', tod), ROOF = T('#b8483a', tod);
      ridge(fc, rnd, gy - 22, 18, mix(T('#8fa3b8', tod), g.skyLow, .55));
      const SCHOOL = artOf('campus', 'school'), CTREES = artOf('park', 'tree');   // AI 圖：教室大樓、樹（跟公園同一套）
      if (SCHOOL) artRow(fc, rnd, SCHOOL, gy + 9, tod);
      else {
      R(fc, 0, gy - 22, TW, 30, WALL); R(fc, 0, gy - 24, TW, 2, ROOF); R(fc, 0, gy - 22, TW, 1, shade(WALL, -.2));
      for (let fl = 0; fl < 3; fl++) for (let x = 3; x < TW; x += 8) { RW(fc, x, gy - 19 + fl * 7, 5, 4, lit && rnd() < .5 ? '#ffd27a' : T('#7c9ab8', tod)); RW(fc, x, gy - 15 + fl * 7, 5, 1, shade(WALL, -.15)); }
      for (const cx of [ri(rnd, 40, 200), ri(rnd, 280, 440)]) { RW(fc, cx - 6, gy - 40, 12, 18, WALL); RW(fc, cx - 7, gy - 42, 14, 2, ROOF); RW(fc, cx - 3, gy - 46, 6, 4, ROOF);   // 鐘塔
        blob(fc, [[cx, gy - 34, 3.5]], '#ffffff', '#ffffff', '#c9c9c0', cx - 4, gy - 38, cx + 4, gy - 30); RW(fc, cx, gy - 36, 1, 3, '#3b3f4a'); RW(fc, cx, gy - 34, 2, 1, '#3b3f4a'); }
      }
      out.push({ cv: far, v: .1 });
      const mid = layer(PH), mc = mid.getContext('2d'), G1 = T('#6fa85a', tod);
      R(mc, 0, gy + 8, TW, p0 - gy - 8, G1);
      dither(mc, 0, gy + 8, TW, p0 - gy - 8, G1, shade(G1, -.08), (x, y) => (y - gy - 8) / Math.max(1, p0 - gy - 8) * .6);
      for (let x = 0; x < TW; x += 3) RW(mc, x, gy + 2, 1, 8, '#8a9098');                           // 鐵絲網圍欄
      R(mc, 0, gy + 2, TW, 1, '#6a7078'); R(mc, 0, gy + 6, TW, 1, '#9aa0a8');
      for (const x of spots(rnd, 16, 40)) tree(mc, x, gy + 10, ri(rnd, 8, 12), T(pick(rnd, ['#4f9450', '#5a9a4a', '#3f7a45']), tod), night);
      const flag = ri(rnd, 30, TW - 30);
      { const b = p0 - 6;                                                                          // 地標：升旗台＋旗桿
        RW(mc, flag - 10, b - 4, 20, 4, T('#c9c2b4', tod)); RW(mc, flag - 10, b - 4, 20, 1, shade(T('#c9c2b4', tod), .2)); RW(mc, flag, b - 46, 1, 42, '#d9d9d0'); RW(mc, flag - 1, b - 47, 3, 1, '#f2d35b');
        RW(mc, flag + 1, b - 45, 10, 7, T('#2f7a4f', tod)); RW(mc, flag + 4, b - 43, 4, 3, '#ffffff'); RW(mc, flag + 5, b - 44, 2, 5, '#ffffff'); RW(mc, flag + 5, b - 42, 2, 1, T('#f2c531', tod)); }   // 校旗
      if (CTREES) { for (const x of spots(rnd, 60, 130)) if (Math.abs(x - flag) > 40) artAt(mc, pickArt(rnd, CTREES), x, p0 - 3, tod); }
      else for (const x of spots(rnd, 50, 110)) if (Math.abs(x - flag) > 26) tree(mc, x, p0 - 4, ri(rnd, 14, 22), T(pick(rnd, ['#4f9450', '#5a9a4a', '#3f7a45', '#6aa84a']), tod), night);
      { const hx0 = (flag + ri(rnd, 140, 300)) % TW, b = p0 - 2;                                    // 籃球架
        RW(mc, hx0, b - 30, 2, 30, '#3b3f4a'); RW(mc, hx0 - 10, b - 32, 12, 1, '#3b3f4a'); RW(mc, hx0 - 18, b - 40, 10, 8, '#f4f4f0'); RW(mc, hx0 - 15, b - 36, 4, 3, '#d9483b');
        RW(mc, hx0 - 17, b - 33, 8, 1, '#e8742c'); for (let k = 0; k < 4; k++) RW(mc, hx0 - 16 + k * 2, b - 32, 1, 3, '#ffffff'); }
      out.push({ cv: mid, v: .5 });
      const path = layer(PH), pc = path.getContext('2d'), TRACK = T('#c4583f', tod);         // 紅色跑道：白色分道線、數字
      dither(pc, 0, p0, TW, p1 - p0, TRACK, shade(TRACK, -.05), (x, y) => .3 + Math.sin(x * .06) * .12);
      for (const y of [p0, Math.round(p0 + (p1 - p0) / 3), Math.round(p0 + (p1 - p0) * 2 / 3), p1 - 1]) R(pc, 0, y, TW, 1, '#f4f0e8');
      for (let x = 40; x < TW; x += 120) { RW(pc, x, p0 + 3, 3, 4, '#f4f0e8'); RW(pc, x + 4, p0 + 3, 3, 4, '#f4f0e8'); RW(pc, x + 1, p0 + 4, 1, 2, TRACK); }
      road(pc, rnd, g, { dapple: 6, leaves: 10, base: TRACK });
      out.push({ cv: path, v: 1, path: true });
      const fg = layer(PH), fgc = fg.getContext('2d'), F1 = T('#6fb05a', tod), F2 = T('#5e9a4a', tod);   // 球場的草：一條深一條淺
      for (let x = 0; x < TW; x++) R(fgc, x, p1, 1, PH - p1, Math.floor(x / 20) % 2 ? F1 : F2);
      R(fgc, 0, p1 + 2, TW, 1, '#f4f0e8');
      tufts(fgc, rnd, 50, p1 + 4, PH - 2, shade(F2, -.15), shade(F1, .1));
      out.push({ cv: fg, v: 1.25 });
      out.push(frontLayer(g, (c, r, b, hmax) => {          // 靠鏡頭：修剪過的矮樹籬、三角錐、足球
        const ball = ri(r, 20, TW - 20);
        { const by = b - 4; blob(c, [[ball, by, 4]], '#ffffff', '#ffffff', '#c9c9c0', ball - 5, by - 5, ball + 5, by + 4); RW(c, ball - 1, by - 1, 3, 2, '#2a2a2e'); RW(c, ball - 4, by, 1, 1, '#2a2a2e'); RW(c, ball + 3, by - 2, 1, 1, '#2a2a2e'); }
        for (const x of spots(r, 34, 80)) {
          if (Math.abs(x - ball) < 12) continue;
          if (r() < .7) { const w = ri(r, 10, 18), h = ri(r, Math.round(hmax * .35), Math.round(hmax * .55)), hc = shade(T('#3f7a45', tod), -.1); RW(c, x - w, b - h, w * 2, h, hc); RW(c, x - w, b - h, w * 2, 2, shade(hc, .15)); for (let k = 0; k < w; k++) RW(c, x - w + k * 2, b - h + 3 + (k % 3), 1, 1, shade(hc, .2)); }
          else { const o = T('#f08a2c', tod), h = ri(r, 8, 11); for (let k = 0; k < h; k++) RW(c, x - Math.round(k * .35), b - h + k, Math.round(k * .7) + 1, 1, k % 4 === 2 ? '#ffffff' : o); RW(c, x - 5, b - 1, 11, 1, shade(o, -.2)); }
        }
      }));
      return { layers: out, lights };
    } },
  };
  const ORDER = ['park', 'beach', 'forest', 'river', 'street', 'sakura', 'snow', 'country', 'flowers', 'harbor', 'mountain', 'nightmarket', 'campus'];   // 13 個（2026-10-20 使用者再挑 8 個、老街重畫）

  // Z＝背景放大幾倍（2026-10-27 使用者選「背景放大一倍」＝2；毛孩、鴿子不放大）：PW、PH 是畫面大小，場景畫在 PW／Z × PH／Z 上
  // 2026-10-28 使用者「背景先不要路人，還有很像熱氣球的東西」：人（路人、遛狗、騎車、登山、學生、農夫）、熱氣球、風箏（像小熱氣球）先不出來；鴿子、海鷗、小狗、鳥群、飛機照舊。
  //   程式和設定都留著，之後要回來把這兩個清單清空就好
  const WALKERS_OFF = new Set(['person', 'dogwalk', 'cyclist', 'hiker', 'student', 'farmer']), SKY_OFF = new Set(['balloon', 'kite']);
  function build(name, PW0, PH0, tod, w, Z = 1, fine = false) {   // fine：背景格子跟毛孩一樣細（K＝Z）
    const PW = Math.ceil(PW0 / Z), PH = Math.ceil(PH0 / Z);
    K = fine ? Z : 1;
    const sc = SCENES[name] || SCENES.park, night = tod === 'night', lit = night || tod === 'evening';
    TW = Math.max(480, Math.ceil(PW / 12) * 12);
    const G = { gy: .3, p0: .6, p1: .86, ...(sc.geo || {}) };   // 2026-10-27：地平線從 .42 往上移（每個場景不一樣），步道 .6～.86（毛孩腳在 .8）
    const gy = Math.round(PH * G.gy), p0 = Math.round(PH * G.p0), p1 = Math.round(PH * G.p1);
    const seed = ORDER.indexOf(name) * 131 + 7;
    const g = { PW, PH, gy, p0, p1, tod, w, night, lit, seed, Z, skyLow: skyOf(tod, w)[2] };
    let r = sc.build(g);
    const KC = KIT[name];
    if (KC && KC.need.every(k => artOf(name, k))) {          // 素材庫都讀好了：畫面整個換成素材（程式畫的只留會動的：海鷗、花瓣、蝴蝶、螢火蟲、水面閃光）
      const kr = kitScene(g, name, KC);
      r = { ...kr, anim: r.anim, animAt: r.animAt, fx: kr.fx || r.fx };
    }
    const PL = r.layers.find(L => L.path);
    if (PL) {                                                // 步道靠後面那段暗一點、最後面一條影子（2026-10-27「路面像一面牆」）
      const c = PL.cv.getContext('2d'), gr = c.createLinearGradient(0, p0, 0, p0 + (p1 - p0) * .5);
      gr.addColorStop(0, 'rgba(24,28,64,.2)'); gr.addColorStop(1, 'rgba(24,28,64,0)');
      c.save(); c.globalCompositeOperation = 'source-atop'; c.fillStyle = gr; c.fillRect(0, p0, TW, p1 - p0); c.restore();
    }
    if (w !== 'sun') for (const L of r.layers) {             // 陰天、下雨：地上也灰一點
      const c = L.cv.getContext('2d'); c.save(); c.globalCompositeOperation = 'source-atop';
      c.fillStyle = w === 'rain' ? 'rgba(70,82,104,.28)' : 'rgba(110,118,130,.14)'; c.fillRect(0, 0, TW, PH); c.restore();
    }
    const skyArt = { sun: artOf(name, 'sun'), moon: artOf(name, 'moon') };   // 素材庫的太陽、月亮、雲（有就用）
    const sky = paintSky(PW, gy, tod, w, skyArt), clouds = cloudSprites(tod, w, artOf(name, 'cloud')), sK = K; K = 1;   // 天空、雲也用細格子畫完才把 K 放回 1
    return { name, label: sc.label, TW, PW, PH, Z, K: sK, gy, p0, p1, tod, w, sky, clouds, layers: r.layers, lights: r.lights || [],
      anim: r.anim || null, animAt: r.animAt ?? 1, fx: r.fx || null, snowy: !!sc.snowy, pathAt: r.layers.findIndex(L => L.path),
      skyThings: (sc.sky || []).filter(k => !SKY_OFF.has(k)), balloon: sc.balloon, passers: passersOf((sc.passers || []).filter(k => !WALKERS_OFF.has(k)), g) };
  }
  const STARS = Array.from({ length: 22 }, (_, i) => [(i * 0.618034) % 1, ((i * 0.381966 * 7) % 1) * .62, i % 5]);
  // 每一格：天空 → 星星 → 雲 → 天空裡會動的 → 一層一層（照 scroll 往左移、左右接；路面那層上面畫路人）。scroll＝走了多遠（步道的格數）、petX＝毛孩站的位置（鴿子看到牠走近會飛走）
  function draw(c, s, scroll, t, petX = s.PW * .4) {
    const k0 = K; K = s.K; c.save(); c.setTransform(K, 0, 0, K, 0, 0);   // 細格子：背景的座標 × K
    c.drawImage(s.sky, 0, 0, s.PW, s.sky.height / K);
    if (s.tod === 'night' && s.w === 'sun') for (const [fx, fy, k] of STARS) {
      const x = Math.round(fx * s.PW), y = Math.round(fy * s.gy), tw = (Math.sin(t / 700 + k * 1.7 + fx * 9) + 1) / 2;
      if (k === 0 && tw > .4) { R(c, x - 1, y, 3, 1, '#fff6c8'); R(c, x, y - 1, 1, 3, '#fff6c8'); } else R(c, x, y, 1, 1, tw > .5 ? '#fff6c8' : '#b8b7d8');
    }
    for (const cl of s.clouds) { const cw = cl.cv.width / K, span = s.PW + cw, x = ((cl.x * span + t / 1000 * cl.v + scroll * .03) % span) - cw; c.drawImage(cl.cv, snap(x), Math.round(cl.y * s.gy), cw, cl.cv.height / K); }
    drawSkyThings(c, s, t);
    const a = { PW: s.PW, t, scroll, glow: [], w: s.w };
    s.layers.forEach((L, i) => {
      const off = snap(((scroll * L.v) % s.TW + s.TW) % s.TW), lw = L.cv.width / K, lh = L.cv.height / K;   // 細格子時捲動也一小格一小格，比較順
      c.drawImage(L.cv, -off, 0, lw, lh); if (s.TW - off < s.PW) c.drawImage(L.cv, s.TW - off, 0, lw, lh);
      if (i === s.animAt && s.anim) s.anim(c, a);           // 會動的（浪、螢火蟲）畫在那一層上面、更近的層下面
      if (i === s.pathAt) drawPassers(c, s, scroll, t);    // 路人：走在步道上（比毛孩遠）；鴿子、海鷗在 paint() 另外畫
    });
    if (s.fx) s.fx(c, a);                                    // 最前面的（飄花瓣、飄雪、蝴蝶、攤位的煙）
    c.restore(); K = k0;
    return a.glow;
  }
  function birds(c, s, scroll, t, petX) {               // 鴿子、海鷗：畫在放大後的畫面上（跟毛孩一樣的格子）；毛孩走近（或停在旁邊）就飛走，繞一圈回來又停在路上
    const Z = s.Z;
    for (const k of s.passers) {
      if (k.kind !== 'pigeon' && k.kind !== 'gull') continue;
      const x = passX(k, scroll, t) * Z, y = k.y * Z;
      if (k.flyT && x > petX + 90) k.flyT = 0;
      if (!k.flyT && x < petX + 46 && x > petX - 40) k.flyT = t;
      if (k.flyT) { const a = (t - k.flyT) / 1000; if (a < 4) bird(c, x + a * 40, y - 4 - a * 30 - a * a * 10, k, t, true); }
      else if (x > -10 && x < s.PW * Z + 10) bird(c, x, y, k, t, false);
    }
  }
  // 一格出門畫面（pocket.js、總表工具用）：背景先畫在小一號的畫布上、放大 Z 倍貼上來，鳥再用細格子畫上去；回傳螢火蟲的光（背景的格子）
  function paint(c, s, scroll, t, petX) {
    if (!s.buf) { s.buf = document.createElement('canvas'); s.buf.width = s.PW * s.K; s.buf.height = s.PH * s.K; }
    const glow = draw(s.buf.getContext('2d'), s, scroll, t, petX / s.Z);
    c.save(); c.imageSmoothingEnabled = false; c.drawImage(s.buf, 0, 0, s.PW * s.Z, s.PH * s.Z); c.restore();   // 細格子（K＝Z）時 1:1
    birds(c, s, scroll, t, petX);
    return glow;
  }
  function lightsOnScreen(s, scroll) {                       // 晚上的燈：照捲動算現在在畫面哪裡
    const out = [];
    for (const L of s.lights) {
      const x = ((L.x - scroll * L.v) % s.TW + s.TW) % s.TW;
      for (const xx of [x - s.TW, x, x + s.TW]) if (xx > -L.r && xx < s.PW + L.r) out.push({ ...L, sx: xx });
    }
    return out;
  }
  // 傍晚、晚上：整張蓋一層暗色（multiply），再加路燈、燈籠、螢火蟲的光（以前在 pocket.js；總表工具 tools/outdoor_review.js 也用）。
  // 2026-10-27「晚上太暗」：以前整張一樣暗（天空、地面分不開）→ 天空少暗一點、地面暗、步道像被月光照到亮一點
  function light(c, s, scroll, glow) {
    if (s.tod !== 'night' && s.tod !== 'evening') return;
    const night = s.tod === 'night', PW = s.PW, PH = s.PH;
    c.save(); c.scale(s.Z, s.Z); c.globalCompositeOperation = 'multiply';   // 背景的格子 → 放大後的畫面
    if (night) {
      const gr = c.createLinearGradient(0, 0, 0, PH), f = y => Math.min(1, Math.max(0, y / PH));
      gr.addColorStop(0, '#e2e4f4'); gr.addColorStop(f(s.gy - 6), '#e0e2f4'); gr.addColorStop(f(s.gy + 10), '#b4b6dc');
      gr.addColorStop(f(s.p0 - 2), '#aeb0d8'); gr.addColorStop(f(s.p0 + 4), '#cccee8'); gr.addColorStop(f(s.p1), '#c4c6e4'); gr.addColorStop(f(s.p1 + 4), '#a4a6d2'); gr.addColorStop(1, '#9c9ecc');
      c.fillStyle = gr;
    } else c.fillStyle = '#e2c6b5';
    c.fillRect(0, 0, PW, PH);
    if (night) {                                           // 月光：地上最暗的地方也帶一點藍，不會糊成一片（從地平線慢慢加上去，沒有接縫）
      const gr = c.createLinearGradient(0, s.gy - 4, 0, s.gy + 16); gr.addColorStop(0, 'rgba(60,72,124,0)'); gr.addColorStop(1, 'rgba(60,72,124,.22)');
      c.globalCompositeOperation = 'screen'; c.fillStyle = gr; c.fillRect(0, s.gy - 4, PW, PH);
    }
    c.globalCompositeOperation = 'lighter';
    for (const L of lightsOnScreen(s, scroll)) {
      const gr = c.createRadialGradient(L.sx, L.y, 2, L.sx, L.y + (L.warm || L.col ? 0 : 32), L.r), col = L.col || (L.warm ? '255,150,110' : '255,214,140');
      gr.addColorStop(0, `rgba(${col},${night ? .5 : .2})`); gr.addColorStop(1, `rgba(${col},0)`);
      c.fillStyle = gr; c.fillRect(L.sx - L.r, L.y - L.r, L.r * 2, L.r * 2 + 40);
    }
    for (const [x, y, r] of glow) { const gr = c.createRadialGradient(x, y, 0, x, y, r); gr.addColorStop(0, 'rgba(220,255,140,.45)'); gr.addColorStop(1, 'rgba(220,255,140,0)'); c.fillStyle = gr; c.fillRect(x - r, y - r, r * 2, r * 2); }
    c.restore();
  }
  window.DCOutdoor = { SCENES, ORDER, build, draw, paint, light, lightsOnScreen, label: k => (SCENES[k] || SCENES.park).label,
    get artVer() { return artVer; }, artLoad };   // artVer：AI 建築圖讀好幾張了（換了就重畫場景）
})();
