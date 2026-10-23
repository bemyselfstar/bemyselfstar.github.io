// DeskCat 手機網頁：口袋的戶外場景（2026-10-20 手機線；使用者「感覺可以多種樣式，另外可以讓寵物有出門散步的感覺」）。
// 13 個場景：城市公園、海邊、森林步道、河堤、老街、櫻花步道、雪地、鄉間小路、花田、港口、山上、夜市、校園（後 8 個＋老街重畫：同一天使用者再挑）；每次出門隨機一個（使用者選「每次出門隨機」），這一趟都在那裡（pocket.js 照毛孩＋出門時間挑）。
// 散步（使用者選「牠走、背景往後捲」）：每個場景是幾層會捲的圖（遠的慢、近的快），毛孩站在畫面左邊走路，背景往後移。
// 每一層照「場景＋時段＋天氣＋大小」畫一次存起來（畫布寬 TW，左右接得起來），每一格只貼上去；會動的（雲、星星、浪、螢火蟲）每格畫。
// 全部 Claude 用程式畫（使用者「Claude 用程式畫」），不讀圖片檔。給 pocket.js 用：DCOutdoor.build(場景, PW, PH, 時段, 天氣) → 場景物件。
(window.DC_BUILD = window.DC_BUILD || {})['outdoor.js'] = 59;   // 版本戳記（mobile/tools/bump.py 一起加 1；不一樣＝手機有舊檔）
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
  const R = (c, x, y, w, h, col) => { c.fillStyle = col; c.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h)); };
  let TW = 240;                                         // 一層的寬（左右接得起來）；是 4、12 的倍數（網點、磚才接得上）
  const RW = (c, x, y, w, h, col) => { R(c, x, y, w, h, col); if (x < 0) R(c, x + TW, y, w, h, col); if (x + w > TW) R(c, x - TW, y, w, h, col); };
  function blob(c, circles, base, light, dark, x0, y0, x1, y1) {   // 幾個圓疊成一團（雲、樹冠、樹叢）：左上亮、下面暗；左右接得起來
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const inC = (dx, dy) => circles.some(([cx, cy, r]) => (x - cx - dx) ** 2 + (y - cy - dy) ** 2 <= r * r);
      if (!inC(0, 0)) continue;
      RW(c, x, y, 1, 1, !inC(0, 2) ? dark : !inC(-1.5, -1.5) ? light : base);
    }
  }
  const layer = h => { const cv = document.createElement('canvas'); cv.width = TW; cv.height = h; return cv; };
  // 時段的顏色：白天的顏色 → 早上偏亮、傍晚偏橘、晚上偏藍暗（晚上 pocket.js 還會整片再壓暗一次）
  const T = (day, tod) => tod === 'day' ? day : tod === 'morning' ? mix(day, '#fff4e2', .1) : tod === 'evening' ? mix(day, '#b86a52', .3) : mix(day, '#1c2240', .45);
  function dither(c, x0, y0, w, h, a, b, fn) {          // 一塊從 a 漸到 b（fn(x, y)→0～1），網點過渡
    for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) R(c, x, y, 1, 1, fn(x, y) > bay(x, y) ? b : a);
  }

  // ---------- 天空（每個場景共用；地平線顏色可以換） ----------
  const SKY_CLOUD = { morning: ['#c9d3d8', '#d9e0e2', '#e6e2d6'], day: ['#aebcc6', '#c2ccd3', '#d4dadd'], evening: ['#6e6680', '#a8848a', '#c79f88'], night: ['#1b1f33', '#232843', '#2b3150'] };
  const SKY_RAIN = { morning: ['#8e9aa6', '#a3adb6', '#b6bec4'], day: ['#7d8a96', '#909ca6', '#a3adb6'], evening: ['#4c4660', '#6b5c70', '#82707c'], night: ['#12152a', '#191d36', '#202542'] };
  const skyOf = (tod, w) => (w === 'sun' ? D.SKY[tod] : w === 'cloud' ? SKY_CLOUD[tod] : SKY_RAIN[tod]);
  function paintSky(PW, gy, tod, w) {
    const cv = document.createElement('canvas'); cv.width = PW; cv.height = Math.max(1, gy);
    const c = cv.getContext('2d'), s = skyOf(tod, w), night = tod === 'night';
    const stops = [s[0], s[1], s[2], mix(s[2], tod === 'evening' ? '#ffcf9a' : night ? '#3a3f66' : '#ffffff', .25)];
    for (let y = 0; y < gy; y++) {
      const f = (y / Math.max(1, gy - 1)) * (stops.length - 1), i = Math.min(stops.length - 2, Math.floor(f)), t = f - i;
      const lo = mix(stops[i], stops[i + 1], Math.floor(t * 4) / 4), hi = mix(stops[i], stops[i + 1], Math.min(1, Math.floor(t * 4 + 1) / 4)), k = t * 4 - Math.floor(t * 4);
      for (let x = 0; x < PW; x++) R(c, x, y, 1, 1, k > bay(x, y) ? hi : lo);
    }
    if (w === 'sun' && !night) {
      const sx = Math.round(PW * .78), sy = Math.round(gy * .24), sc = tod === 'evening' ? '#ffb36b' : '#ffe58a';
      for (let y = -11; y <= 11; y++) for (let x = -11; x <= 11; x++) {
        const d = Math.hypot(x, y);
        if (d <= 6) R(c, sx + x, sy + y, 1, 1, d <= 4 ? shade(sc, .35) : sc);
        else if (d <= 10 && (10 - d) / 4 > bay(x + 12, y + 12) * 1.6) R(c, sx + x, sy + y, 1, 1, mix(sc, s[1], .55));
      }
    }
    if (night && w !== 'rain') {
      const mx = Math.round(PW * .78), my = Math.round(gy * .22);
      for (let y = -8; y <= 8; y++) for (let x = -8; x <= 8; x++) {
        const d = Math.hypot(x, y);
        if (d <= 4.5) R(c, mx + x, my + y, 1, 1, '#f6f0c4');
        else if (d <= 7.5 && bay(x + 8, y + 8) < .3) R(c, mx + x, my + y, 1, 1, '#3a4070');
      }
      R(c, mx - 2, my - 1, 2, 1, '#ddd6a8'); R(c, mx + 1, my + 2, 1, 1, '#ddd6a8'); R(c, mx + 2, my - 3, 1, 1, '#ddd6a8');
    }
    return cv;
  }
  function cloudSprites(tod, w) {
    const n = w === 'sun' ? (tod === 'night' ? 0 : 2) : w === 'cloud' ? 4 : 5, out = [], rnd = rng(17 + n);
    const base = w === 'rain' ? { morning: '#9aa4ad', day: '#8b97a2', evening: '#665c70', night: '#262a44' }[tod]
      : w === 'cloud' ? { morning: '#eef1f3', day: '#e8edf0', evening: '#c9a9a8', night: '#363c5c' }[tod]
      : { morning: '#ffffff', day: '#ffffff', evening: '#ffd9c2', night: '#363c5c' }[tod];
    const saveTW = TW;
    for (let i = 0; i < n; i++) {
      const cw = 22 + Math.floor(rnd() * 14), chh = 9 + Math.floor(rnd() * 4), cv = document.createElement('canvas');
      cv.width = cw; cv.height = chh; TW = 100000;          // 雲不用左右接
      const c = cv.getContext('2d'), r = chh / 2;
      blob(c, [[cw * .3, chh - r, r * .9], [cw * .55, chh - r - 1, r * 1.05], [cw * .78, chh - r + 1, r * .8], [cw * .5, chh - 2, r * .7]],
        base, shade(base, .5), shade(base, w === 'rain' ? -.18 : -.1), 0, 0, cw - 1, chh - 1);
      TW = saveTW;
      out.push({ cv, x: rnd(), y: .08 + rnd() * .5, v: .4 + rnd() * .6 });
    }
    return out;
  }

  // ---------- 共用的小東西 ----------
  function tree(c, x, base, h, tc, night, trunk) {     // 圓圓的樹：樹冠三個亮度、樹幹亮暗兩面、地上影子
    RW(c, x - 6, base + 1, 13, 1, 'rgba(0,0,0,.14)'); RW(c, x - 4, base + 2, 9, 1, 'rgba(0,0,0,.1)');
    RW(c, x - 1, base - 6, 3, 8, trunk || (night ? '#2a2018' : '#6b4a33')); RW(c, x + 1, base - 6, 1, 8, shade(trunk || (night ? '#2a2018' : '#6b4a33'), -.25));
    const cy = base - 6 - h / 2;
    blob(c, [[x, cy, h / 2 + 2], [x - 4, cy + 2, h / 2], [x + 4, cy + 1, h / 2], [x - 1, cy - 3, h / 2 - 1]], tc, shade(tc, night ? .1 : .18), shade(tc, -.22),
      x - 10, Math.floor(cy - h), x + 10, base - 4);
  }
  function pine(c, x, base, h, col) {                   // 尖尖的松樹（剪影，三層）
    for (let i = 0; i < h; i++) {
      const y = base - i, tier = i % Math.max(4, Math.round(h / 3)), half = Math.max(1, Math.round((h - i) * .32 - tier * .35));
      RW(c, x - half, y, half * 2 + 1, 1, col);
      if (i % 2 === 0) RW(c, x - half, y, 1, 1, shade(col, .1));
    }
    RW(c, x, base + 1, 1, 2, shade(col, -.2));
  }
  function tufts(c, rnd, n, y0, y1, col, col2) {        // 草叢小點
    for (let i = 0; i < n; i++) { const x = Math.floor(rnd() * TW), y = y0 + Math.floor(rnd() * Math.max(1, y1 - y0)); RW(c, x, y, 1, 2, col); RW(c, x - 1, y + 1, 1, 1, col); RW(c, x + 1, y, 1, 1, col2); }
  }
  function flowers(c, rnd, n, y0, y1, stem) {
    for (let i = 0; i < n; i++) {
      const x = Math.floor(rnd() * TW), y = y0 + Math.floor(rnd() * Math.max(1, y1 - y0)), p = ['#f4d35e', '#f28fb0', '#ffffff', '#b59cf0'][i % 4];
      RW(c, x, y + 1, 1, 2, stem); RW(c, x - 1, y, 1, 1, p); RW(c, x + 1, y, 1, 1, p); RW(c, x, y - 1, 1, 1, p); RW(c, x, y, 1, 1, '#f6b93b');
    }
  }
  function lamp(c, lx, p0, lit) {                       // 路燈：底座、亮的一側、燈臂、燈罩
    const pole = '#3b3f4a', poleL = '#5a6070';
    RW(c, lx - 1, p0 - 30, 2, 31, pole); RW(c, lx - 1, p0 - 30, 1, 31, poleL);
    RW(c, lx - 2, p0 - 2, 4, 3, pole); RW(c, lx - 3, p0, 6, 2, shade(pole, -.15));
    RW(c, lx - 1, p0 - 32, 4, 2, pole); RW(c, lx + 2, p0 - 33, 2, 2, pole);
    RW(c, lx - 3, p0 - 36, 7, 1, shade(pole, .1)); RW(c, lx - 2, p0 - 35, 5, 1, pole);
    RW(c, lx - 2, p0 - 34, 5, 3, lit ? '#ffe39a' : '#cfd6dd'); RW(c, lx - 1, p0 - 34, 2, 2, lit ? '#fff6d0' : '#e8edf2');
  }
  function bricks(c, rnd, p0, p1, pc, bw, bh) {         // 磚：上緣亮、下緣暗、顏色一點點不同、偶爾裂痕
    R(c, 0, p0, TW, p1 - p0, pc);
    for (let r = 0, y = p0 + 2; y < p1 - 2; r++, y += bh) for (let x = -((r % 2) * (bw / 2)); x < TW; x += bw) {
      const col = rnd() < .35 ? shade(pc, -.04) : rnd() < .2 ? shade(pc, .04) : pc;
      RW(c, x, y, bw - 1, bh - 1, col); RW(c, x, y, bw - 1, 1, shade(col, .1)); RW(c, x, y + bh - 2, bw - 1, 1, shade(col, -.1)); RW(c, x + bw - 1, y, 1, bh, shade(pc, -.18));
      if (rnd() < .12) RW(c, x + 3 + Math.floor(rnd() * (bw - 6)), y + 2, 1, 1, shade(col, -.15));
    }
    R(c, 0, p0, TW, 2, shade(pc, .12)); R(c, 0, p0 + 2, TW, 1, shade(pc, -.2)); R(c, 0, p1 - 2, TW, 1, shade(pc, -.2)); R(c, 0, p1 - 1, TW, 1, shade(pc, -.3));
  }

  // ---------- 場景：每個回傳 {layers: [{cv, v（捲動速度，步道＝1）}], lights: [{x, y, v, r, warm?, col?}], anim(c, a)（畫在第 animAt 層上）, fx(c, a)（最前面）}；snowy＝下雨改下雪 ----------
  // g＝{PW, PH, gy（地平線）, p0、p1（步道上下）, tod, w（天氣）, night, lit}
  const SCENES = {
    park: { label: '公園', build(g) {                    // 城市公園（原本那個）
      const { PH, gy, p0, p1, tod, night, lit } = g, rnd = rng(11), out = [];
      const GRASS = { morning: '#8fbf7a', day: '#7fb36a', evening: '#7e8c66', night: '#2f4a3c' }[tod], GRASS2 = { morning: '#7aad66', day: '#6aa057', evening: '#6c7a56', night: '#273f33' }[tod];
      const TREE = { morning: '#4f9450', day: '#46894a', evening: '#4f6a45', night: '#1f3a2c' }[tod], PATH = { morning: '#ddd3c2', day: '#d8cdb9', evening: '#b9a48f', night: '#4c4b5e' }[tod];
      const far = layer(PH), fc = far.getContext('2d'), farCol = mix({ morning: '#a9b6c6', day: '#9aaabd', evening: '#8a7f98', night: '#2a2e4a' }[tod], g.skyLow, .3);
      for (let x = 0; x < TW;) { const bw = 6 + Math.floor(rnd() * 7), bh = 16 + Math.floor(rnd() * 16); RW(fc, x, gy - bh, bw, bh, farCol); if (rnd() < .3) RW(fc, x + Math.floor(bw / 2), gy - bh - 3, 1, 3, farCol); x += bw + (rnd() < .3 ? 1 : 0); }
      out.push({ cv: far, v: .08 });
      const near = layer(PH), nc = near.getContext('2d'), nearBase = mix({ morning: '#7f8fa3', day: '#73859b', evening: '#5d5670', night: '#1f2238' }[tod], g.skyLow, .08);
      for (let x = 0; x < TW;) {
        const bw = 8 + Math.floor(rnd() * 8), bh = 9 + Math.floor(rnd() * 13), col = nearBase, top = gy - bh;
        RW(nc, x, top, bw, bh, col); RW(nc, x, top, 1, bh, shade(col, lit ? .08 : .12)); RW(nc, x, top, bw, 1, shade(col, -.15));
        const roof = rnd();
        if (roof < .3) { RW(nc, x + 2, top - 3, 4, 3, shade(col, -.1)); RW(nc, x + 2, top - 4, 4, 1, shade(col, .1)); }
        else if (roof < .55) RW(nc, x + 1, top - 2, bw - 2, 2, col); else if (roof < .7) RW(nc, x + bw - 3, top - 5, 1, 5, shade(col, -.2));
        for (let yy = top + 3; yy < gy - 2; yy += 3) for (let xx = x + 2; xx < x + bw - 1; xx += 3) {
          const on = rnd();
          if (lit) { if (on < .55) RW(nc, xx, yy, 1, 1, on < .12 ? '#ffb46b' : '#ffd77a'); else if (on < .75) RW(nc, xx, yy, 1, 1, shade(col, -.25)); }
          else if (on < .8) RW(nc, xx, yy, 1, 1, mix(col, '#c9d8e6', .35));
        }
        x += bw;
      }
      out.push({ cv: near, v: .18 });
      const mid = layer(PH), mc = mid.getContext('2d');
      dither(mc, 0, gy, TW, p0 - gy, GRASS, GRASS2, (x, y) => (y - gy) / Math.max(1, p0 - gy) * .8);
      for (let x = 0; x < TW; x++) { const h = 2 + Math.round(Math.sin(x / TW * Math.PI * 2 * 9) * 1.2 + Math.sin(x / TW * Math.PI * 2 * 4) * 1.5); R(mc, x, gy - 1, 1, h + 1, shade(TREE, -.12)); if (x % 5 === 0) R(mc, x, gy - 1, 1, 1, shade(TREE, .12)); }
      for (let x = 8, i = 0; x < TW; x += 24, i++) tree(mc, x, gy + 9 + (i % 2) * 3, 9 + (i * 5) % 5, TREE, night);
      tufts(mc, rnd, 70, gy + 13, p0 - 2, shade(GRASS2, -.18), shade(GRASS, .1));
      out.push({ cv: mid, v: .5 });
      const path = layer(PH), pc = path.getContext('2d'), lights = [];
      bricks(pc, rnd, p0, p1, PATH, 12, 6);
      for (const lx of [30, 150]) { lamp(pc, lx, p0, lit); lights.push({ x: lx, y: p0 - 33, v: 1, r: 60 }); }
      out.push({ cv: path, v: 1 });
      const fg = layer(PH), fgc = fg.getContext('2d');
      dither(fgc, 0, p1, TW, PH - p1, GRASS2, GRASS, (x, y) => (y - p1) / Math.max(1, PH - p1) * .6);
      tufts(fgc, rnd, 60, p1 + 3, PH - 2, shade(GRASS2, -.18), shade(GRASS, .1));
      if (!night) flowers(fgc, rnd, 14, p1 + 4, PH - 3, shade(GRASS2, -.2));
      for (let i = 0; i < 7; i++) { const x = Math.floor(rnd() * TW), y = p1 + 2 + Math.floor(rnd() * 6); RW(fgc, x, y, 2, 1, '#a8a29a'); RW(fgc, x, y, 1, 1, '#cfc9bf'); }
      out.push({ cv: fg, v: 1.25 });
      return { layers: out, lights };
    } },

    beach: { label: '海邊', build(g) {                    // 海邊：遠處小島和燈塔、海浪、沙灘、木棧道、貝殼
      const { PH, gy, p0, p1, tod, night, lit } = g, rnd = rng(22), out = [];
      const SEA = T('#4fa3c7', tod), SEA2 = T('#7cc4dd', tod), SAND = T('#e9d6a6', tod), SAND2 = T('#d9c18a', tod), WOOD = T('#a8774c', tod);
      const far = layer(PH), fc = far.getContext('2d'), isle = mix(T('#6f8f7a', tod), g.skyLow, .35);
      for (const [x, w, h] of [[20, 34, 7], [120, 22, 5], [175, 40, 9]]) for (let i = 0; i < w; i++) { const hh = Math.round(h * Math.sin(Math.PI * i / w) ** .7); RW(fc, x + i, gy - hh, 1, hh, isle); }
      RW(fc, 198, gy - 17, 3, 9, '#efe9df'); RW(fc, 198, gy - 14, 3, 2, '#d9534f'); RW(fc, 197, gy - 18, 5, 1, '#3b3f4a'); RW(fc, 198, gy - 19, 3, 1, lit ? '#ffe39a' : '#cfd6dd');   // 燈塔
      out.push({ cv: far, v: .05 });
      const sea = layer(PH), sc = sea.getContext('2d');
      dither(sc, 0, gy, TW, p0 - 8 - gy, SEA2, SEA, (x, y) => Math.min(1, (y - gy) / Math.max(1, p0 - 8 - gy) * 1.2));
      for (let i = 0; i < 26; i++) { const x = Math.floor(rnd() * TW), y = gy + 2 + Math.floor(rnd() * Math.max(1, p0 - 12 - gy)); RW(sc, x, y, 3 + Math.floor(rnd() * 4), 1, shade(SEA2, .25)); }
      for (let x = 0; x < TW; x++) {                       // 浪花打上沙灘：白色的一條，上下彎
        const y = p0 - 8 + Math.round(Math.sin(x / TW * Math.PI * 2 * 6) * 1.5);
        R(sc, x, y, 1, 1, shade(SEA2, .55)); R(sc, x, y + 1, 1, 7 + p0 - 8 - y, SAND);
        if (x % 3 === 0) R(sc, x, y + 1, 1, 1, shade(SAND, -.08));
      }
      out.push({ cv: sea, v: .35 });
      const mid = layer(PH), mc = mid.getContext('2d');
      for (let x = 10; x < TW; x += 60) {                  // 椰子樹：彎的樹幹、葉子往下垂
        const base = p0 - 1, trunk = T('#8a6a48', tod), leaf = T('#3f8f4f', tod);
        for (let i = 0; i < 26; i++) RW(mc, x + Math.round(Math.sin(i / 26 * 1.4) * 5), base - i, 2, 1, i % 3 ? trunk : shade(trunk, -.2));
        const tx = x + 5, ty = base - 26;
        for (const [dx, dy] of [[-1, 0], [1, 0], [-.6, .5], [.6, .5], [0, -1]]) for (let k = 0; k < 9; k++) RW(mc, tx + Math.round(dx * k), ty + Math.round(dy * k + (k * k) / 14), 2, 1, k % 3 ? leaf : shade(leaf, .15));
        RW(mc, tx - 1, ty, 3, 2, T('#6b4a33', tod));
      }
      for (let x = 40; x < TW; x += 120) {                 // 陽傘
        const pc = ['#e8574f', '#f2b134'][x % 2], top = p0 - 22;
        RW(mc, x, top, 1, 22, '#8c8a86');
        for (let i = 0; i < 9; i++) RW(mc, x - 9 + i, top + 4 - Math.round(i * .45), 19 - i * 2, 1, i % 2 ? pc : '#ffffff');
      }
      out.push({ cv: mid, v: .7 });
      const path = layer(PH), pc = path.getContext('2d'), lights = [{ x: 199, y: gy - 19, v: .05, r: 12, col: '255,240,190' }];   // 燈塔的光；木棧道：一片一片直的木板、縫、釘子
      R(pc, 0, p0, TW, p1 - p0, WOOD);
      for (let x = 0; x < TW; x += 6) {
        const col = rnd() < .3 ? shade(WOOD, -.06) : rnd() < .2 ? shade(WOOD, .06) : WOOD;
        R(pc, x, p0 + 2, 5, p1 - p0 - 4, col); R(pc, x + 5, p0 + 2, 1, p1 - p0 - 4, shade(WOOD, -.3)); R(pc, x, p0 + 2, 1, p1 - p0 - 4, shade(col, .1));
        R(pc, x + 2, p0 + 4, 1, 1, shade(WOOD, -.35)); R(pc, x + 2, p1 - 5, 1, 1, shade(WOOD, -.35));
        if (rnd() < .3) R(pc, x + 1, p0 + 8 + Math.floor(rnd() * 8), 3, 1, shade(col, -.1));   // 木紋
      }
      R(pc, 0, p0, TW, 2, shade(WOOD, .15)); R(pc, 0, p1 - 2, TW, 2, shade(WOOD, -.35));
      for (let x = 20; x < TW; x += 40) { RW(pc, x, p0 - 8, 2, 10, shade(WOOD, -.15)); RW(pc, x, p0 - 8, 1, 10, shade(WOOD, .05)); }   // 欄杆柱
      for (let x = 0; x < TW; x++) { const sag = Math.round(Math.sin(((x - 20) % 40) / 40 * Math.PI) * 2); R(pc, x, p0 - 6 + sag, 1, 1, '#c8b28a'); }   // 繩子
      out.push({ cv: path, v: 1 });
      const fg = layer(PH), fgc = fg.getContext('2d');
      dither(fgc, 0, p1, TW, PH - p1, SAND, SAND2, (x, y) => ((y - p1) / Math.max(1, PH - p1)) * .7);
      for (let i = 0; i < 40; i++) { const x = Math.floor(rnd() * TW), y = p1 + 3 + Math.floor(rnd() * (PH - p1 - 4)); RW(fgc, x, y, 1, 1, shade(SAND2, -.12)); }
      for (let i = 0; i < 6; i++) {                        // 貝殼、海星
        const x = Math.floor(rnd() * TW), y = p1 + 4 + Math.floor(rnd() * (PH - p1 - 7));
        if (i % 2) { const s = '#f2a46b'; RW(fgc, x, y - 1, 1, 3, s); RW(fgc, x - 1, y, 3, 1, s); RW(fgc, x - 1, y + 1, 1, 1, s); RW(fgc, x + 1, y + 1, 1, 1, s); }
        else { RW(fgc, x - 1, y, 3, 1, '#f6e7df'); RW(fgc, x, y - 1, 1, 1, '#f6e7df'); RW(fgc, x - 1, y + 1, 3, 1, '#e3c9bd'); }
      }
      for (let i = 0; i < 10; i++) { const x = Math.floor(rnd() * TW), y = p1 + 3 + Math.floor(rnd() * 5); RW(fgc, x, y, 1, 3, T('#7aa36a', tod)); RW(fgc, x + 1, y + 1, 1, 2, T('#8fb57c', tod)); }   // 海邊的草
      out.push({ cv: fg, v: 1.25 });
      return { layers: out, lights, anim(c, a) {          // 海面一閃一閃
        const off = a.scroll * .35;
        for (let i = 0; i < 14; i++) {
          const x = ((i * 37 - off) % a.PW + a.PW) % a.PW, y = gy + 3 + (i * 11) % Math.max(1, p0 - 14 - gy), on = Math.sin(a.t / 400 + i * 1.3) > .5;
          if (on) R(c, x, y, 2, 1, night ? '#c9cff0' : '#ffffff');
        }
      } };
    } },

    forest: { label: '森林', build(g) {                  // 森林步道：遠處霧霧的松樹、大樹幹、香菇、泥土小路、蕨類；晚上有螢火蟲
      const { PH, gy, p0, p1, tod, night } = g, rnd = rng(33), out = [];
      const GR = T('#5d8f4e', tod), GR2 = T('#4b7a40', tod), DIRT = T('#9b7653', tod), DIRT2 = T('#86643f', tod);
      const far = layer(PH), fc = far.getContext('2d'), f1 = mix(T('#5f8a70', tod), g.skyLow, .45);
      for (let x = 0; x < TW; x += 9) pine(fc, x + Math.floor(rnd() * 4), gy + 2, 20 + Math.floor(rnd() * 12), f1);
      out.push({ cv: far, v: .08 });
      const far2 = layer(PH), f2c = far2.getContext('2d'), f2 = mix(T('#3f6b4c', tod), g.skyLow, .15);
      R(f2c, 0, gy, TW, 4, f2);
      for (let x = 0; x < TW; x += 12) pine(f2c, x + Math.floor(rnd() * 5), gy + 4, 26 + Math.floor(rnd() * 14), f2);
      out.push({ cv: far2, v: .2 });
      const mid = layer(PH), mc = mid.getContext('2d');
      dither(mc, 0, gy + 4, TW, p0 - gy - 4, GR, GR2, (x, y) => (y - gy - 4) / Math.max(1, p0 - gy - 4) * .9);
      for (let x = 14; x < TW; x += 40) {                  // 大樹幹（只看得到下半段）：樹皮紋、樹根
        const bark = T('#5b4130', tod), w = 7, top = 0;
        RW(mc, x, top, w, p0 - 1 - top, bark); RW(mc, x, top, 1, p0 - 1, shade(bark, .15)); RW(mc, x + w - 1, top, 1, p0 - 1, shade(bark, -.25));
        for (let y = 4; y < p0 - 2; y += 5) RW(mc, x + 2 + (y % 3), y, 2, 1, shade(bark, -.18));
        RW(mc, x - 2, p0 - 3, 3, 2, bark); RW(mc, x + w - 1, p0 - 3, 3, 2, shade(bark, -.2));
        blob(mc, [[x + 3, 4, 9], [x - 4, 6, 7], [x + 11, 5, 7]], T('#3f7a3f', tod), shade(T('#3f7a3f', tod), .15), shade(T('#3f7a3f', tod), -.25), x - 12, -6, x + 19, 13);   // 上面一點樹冠
      }
      for (let x = 30; x < TW; x += 40) blob(mc, [[x, p0 - 5, 5], [x + 5, p0 - 4, 4], [x - 5, p0 - 3, 3]], T('#4f8a45', tod), shade(T('#4f8a45', tod), .18), shade(T('#4f8a45', tod), -.25), x - 9, p0 - 11, x + 10, p0 - 1);   // 樹叢
      for (let x = 22; x < TW; x += 55) {                  // 紅色香菇
        RW(mc, x, p0 - 4, 2, 3, '#efe6d6'); RW(mc, x - 2, p0 - 6, 6, 2, '#d9483b'); RW(mc, x - 1, p0 - 7, 4, 1, '#d9483b'); RW(mc, x - 1, p0 - 6, 1, 1, '#ffffff'); RW(mc, x + 2, p0 - 7, 1, 1, '#ffffff');
      }
      tufts(mc, rnd, 40, gy + 8, p0 - 2, shade(GR2, -.2), shade(GR, .12));
      out.push({ cv: mid, v: .55 });
      const path = layer(PH), pc = path.getContext('2d');   // 泥土小路：小石頭、落葉、樹根
      dither(pc, 0, p0, TW, p1 - p0, DIRT, DIRT2, (x, y) => .35 + Math.sin(x / TW * Math.PI * 2 * 5 + y * .3) * .2);
      R(pc, 0, p0, TW, 1, shade(GR2, -.25)); R(pc, 0, p1 - 1, TW, 1, shade(DIRT2, -.25));
      for (let i = 0; i < 40; i++) { const x = Math.floor(rnd() * TW), y = p0 + 2 + Math.floor(rnd() * (p1 - p0 - 4)); RW(pc, x, y, 2, 1, shade(DIRT, .18)); RW(pc, x, y + 1, 2, 1, shade(DIRT, -.2)); }
      for (let i = 0; i < 22; i++) { const x = Math.floor(rnd() * TW), y = p0 + 2 + Math.floor(rnd() * (p1 - p0 - 4)), lc = ['#c9732f', '#d9a03f', '#a8552c'][i % 3]; RW(pc, x, y, 2, 1, lc); RW(pc, x + 1, y - 1, 1, 1, lc); }
      for (let x = 60; x < TW; x += 120) for (let k = 0; k < 14; k++) RW(pc, x + k, p0 + 3 + Math.round(Math.sin(k / 3) * 1.5), 1, 2, T('#6a4a32', tod));   // 樹根
      out.push({ cv: path, v: 1 });
      const fg = layer(PH), fgc = fg.getContext('2d');
      dither(fgc, 0, p1, TW, PH - p1, GR2, shade(GR2, -.15), (x, y) => ((y - p1) / Math.max(1, PH - p1)) * .7);
      for (let x = 5; x < TW; x += 26) {                   // 蕨類：一根中間、兩邊一排小葉
        const fern = T('#5e9a4a', tod), bx = x + Math.floor(rnd() * 8), by = PH - 1;
        for (let k = 0; k < 12; k++) { const yy = by - k, xx = bx + Math.round(k * .5); RW(fgc, xx, yy, 1, 1, fern); if (k > 2 && k % 2 === 0) { RW(fgc, xx - 3, yy + 1, 3, 1, shade(fern, .1)); RW(fgc, xx + 1, yy, 3, 1, shade(fern, -.1)); } }
      }
      if (!night) flowers(fgc, rnd, 8, p1 + 4, PH - 3, shade(GR2, -.2));
      out.push({ cv: fg, v: 1.3 });
      return { layers: out, lights: [], animAt: 2, anim(c, a) {      // 晚上、傍晚：螢火蟲（畫在地面那層上面）
        if (!(night || tod === 'evening')) return;
        for (let i = 0; i < 12; i++) {
          const x = ((i * 53 + Math.sin(a.t / 1400 + i) * 8 - a.scroll * .55) % a.PW + a.PW) % a.PW, y = gy + 6 + ((i * 17) % Math.max(1, p0 - gy - 8)) + Math.sin(a.t / 900 + i * 2) * 3;
          if (Math.sin(a.t / 500 + i * 1.7) > .2) { R(c, x, y, 1, 1, '#e8ff8a'); a.glow.push([x, y, 6]); }
        }
      } };
    } },

    river: { label: '河堤', build(g) {                   // 河堤：遠山、河、石橋、蘆葦、自行車道
      const { PH, gy, p0, p1, tod, night, lit } = g, rnd = rng(44), out = [];
      const far = layer(PH), fc = far.getContext('2d');
      const m1 = mix(T('#7d92b8', tod), g.skyLow, .4), m2 = mix(T('#5d7f74', tod), g.skyLow, .15);
      for (let x = 0; x < TW; x++) {
        const h1 = 22 + Math.round(Math.sin(x / TW * Math.PI * 2 * 2) * 8 + Math.sin(x / TW * Math.PI * 2 * 5) * 4);
        R(fc, x, gy - h1, 1, h1, m1); if (h1 > 30) R(fc, x, gy - h1, 1, 2, night ? '#8a90b8' : '#f4f6fa');   // 山頂的雪
        const h2 = 12 + Math.round(Math.sin(x / TW * Math.PI * 2 * 3 + 1) * 5 + Math.sin(x / TW * Math.PI * 2 * 7) * 2);
        R(fc, x, gy - h2, 1, h2, m2); if (bay(x, h2) < .3) R(fc, x, gy - h2, 1, 1, shade(m2, .12));
      }
      out.push({ cv: far, v: .05 });
      const water = layer(PH), wc = water.getContext('2d'), WAT = T('#5a9ec0', tod), WAT2 = T('#3e7fa3', tod), BANK = T('#6f9a5c', tod);
      R(wc, 0, gy, TW, 3, shade(BANK, -.1));                // 對岸
      for (let x = 4; x < TW; x += 14) blob(wc, [[x, gy - 1, 3], [x + 3, gy, 2]], T('#4f8a4a', tod), shade(T('#4f8a4a', tod), .15), shade(T('#4f8a4a', tod), -.2), x - 4, gy - 5, x + 6, gy + 1);
      dither(wc, 0, gy + 3, TW, p0 - 10 - gy, WAT, WAT2, (x, y) => (y - gy - 3) / Math.max(1, p0 - 10 - gy));
      for (let i = 0; i < 20; i++) { const x = Math.floor(rnd() * TW), y = gy + 5 + Math.floor(rnd() * Math.max(1, p0 - 16 - gy)); RW(wc, x, y, 4, 1, shade(WAT, .18)); }
      { const bx = 70, top = gy + 1, span = 54, bc = T('#b5ab9a', tod);   // 石拱橋
        for (let i = 0; i < span; i++) { const arch = Math.round(Math.sin(Math.PI * i / span) * 9); RW(wc, bx + i, top, 1, 3, bc); RW(wc, bx + i, top + 3, 1, Math.max(0, 6 - arch), shade(bc, -.15)); if (i % 6 === 0) RW(wc, bx + i, top - 2, 1, 2, shade(bc, -.2)); }
        RW(wc, bx, top - 2, span, 1, shade(bc, -.2)); }
      out.push({ cv: water, v: .25 });
      const mid = layer(PH), mc = mid.getContext('2d');      // 這邊的河岸：草坡、蘆葦、長椅
      dither(mc, 0, p0 - 10, TW, 10, BANK, shade(BANK, -.12), (x, y) => (y - p0 + 10) / 10);
      R(mc, 0, p0 - 10, TW, 1, shade(BANK, .15));
      for (let x = 0; x < TW; x += 5) { const h = 6 + (x * 7) % 6, rc = T('#9a8a5a', tod); RW(mc, x + 1, p0 - 10 - h, 1, h, rc); if (x % 10 === 0) RW(mc, x + 1, p0 - 12 - h, 1, 3, T('#6b4a33', tod)); }   // 蘆葦（偶爾有穗）
      { const bx = 160, bw = T('#8a5a3a', tod); RW(mc, bx, p0 - 7, 16, 2, bw); RW(mc, bx, p0 - 11, 16, 2, bw); RW(mc, bx + 1, p0 - 5, 1, 4, '#3b3f4a'); RW(mc, bx + 14, p0 - 5, 1, 4, '#3b3f4a'); }   // 長椅
      out.push({ cv: mid, v: .6 });
      const path = layer(PH), pc = path.getContext('2d'), lights = [], ASP = T('#7b7f86', tod);   // 自行車道：柏油、中間虛線、兩邊白線
      dither(pc, 0, p0, TW, p1 - p0, ASP, shade(ASP, -.06), (x, y) => .5);
      R(pc, 0, p0 + 2, TW, 1, '#e6e6e0'); R(pc, 0, p1 - 3, TW, 1, '#e6e6e0');
      for (let x = 0; x < TW; x += 16) R(pc, x, Math.round((p0 + p1) / 2), 8, 1, '#f2d35b');
      R(pc, 0, p0, TW, 2, shade(ASP, .15)); R(pc, 0, p1 - 1, TW, 1, shade(ASP, -.3));
      { const bx = 118, by = Math.round((p0 + p1) / 2) + 5, bk = '#e6e6e0';   // 地上畫的腳踏車
        for (const ox of [0, 8]) { RW(pc, bx + ox, by, 3, 1, bk); RW(pc, bx + ox - 1, by + 1, 1, 2, bk); RW(pc, bx + ox + 3, by + 1, 1, 2, bk); RW(pc, bx + ox, by + 3, 3, 1, bk); }
        RW(pc, bx + 2, by - 1, 7, 1, bk); }
      for (const lx of [60, 180]) { lamp(pc, lx, p0, lit); lights.push({ x: lx, y: p0 - 33, v: 1, r: 60 }); }
      out.push({ cv: path, v: 1 });
      const fg = layer(PH), fgc = fg.getContext('2d'), G1 = T('#7fb36a', tod), G2 = T('#6aa057', tod);
      dither(fgc, 0, p1, TW, PH - p1, G1, G2, (x, y) => ((y - p1) / Math.max(1, PH - p1)) * .8);
      tufts(fgc, rnd, 50, p1 + 3, PH - 2, shade(G2, -.18), shade(G1, .1));
      if (!night) for (let i = 0; i < 10; i++) { const x = Math.floor(rnd() * TW), y = p1 + 4 + Math.floor(rnd() * (PH - p1 - 7)); RW(fgc, x, y + 1, 1, 3, shade(G2, -.2)); RW(fgc, x - 1, y - 1, 3, 2, i % 3 ? '#f6d44a' : '#ffffff'); }   // 蒲公英
      out.push({ cv: fg, v: 1.25 });
      return { layers: out, lights, anim(c, a) {
        const off = a.scroll * .25;
        for (let i = 0; i < 10; i++) { const x = ((i * 41 - off) % a.PW + a.PW) % a.PW, y = gy + 6 + (i * 13) % Math.max(1, p0 - 18 - gy); if (Math.sin(a.t / 450 + i * 1.9) > .55) R(c, x, y, 3, 1, night ? '#c9cff0' : '#e6f4ff'); }
      } };
    } },

    street: { label: '老街', build(g) {                   // 老街（2026-10-20 使用者「老街有點醜」→ 重畫）：紅磚兩層樓、上面有造型的山牆、一樓騎樓拱門、裡面店面亮著、石板路
      const { PH, gy, p0, p1, tod, night, lit } = g, rnd = rng(56), out = [], lights = [];
      const far = layer(PH), fc = far.getContext('2d'), farCol = mix(T('#7a6a64', tod), g.skyLow, .4);
      for (let x = 0; x < TW;) { const w = 14 + Math.floor(rnd() * 10), h = 10 + Math.floor(rnd() * 10); RW(fc, x, gy - 24 - h, w, h + 30, farCol); RW(fc, x + 2, gy - 26 - h, w - 4, 2, farCol); x += w; }
      out.push({ cv: far, v: .1 });
      const mid = layer(PH), mc = mid.getContext('2d');
      const BRICK = T('#b5523b', tod), MORTAR = T('#8a3a2a', tod), CREAM = T('#eadcc0', tod), TEAL = T('#2f5f66', tod);
      const top = gy - 22, arcY = p0 - 22, unit = 40;
      for (let x = 0, i = 0; x < TW; x += unit, i++) {
        // 山牆（上面的造型：三種）
        const ptop = top - 6 - (i % 3) * 2;
        RW(mc, x + 1, ptop, unit - 2, top - ptop + 2, CREAM);
        if (i % 3 === 0) { for (let k = 0; k < 12; k++) RW(mc, x + unit / 2 - 6 + k, ptop - Math.round(4 * Math.sin(Math.PI * k / 11)), 1, 4, CREAM); }   // 圓弧頂
        else if (i % 3 === 1) { RW(mc, x + 12, ptop - 4, 16, 4, CREAM); RW(mc, x + 16, ptop - 7, 8, 3, CREAM); }                                       // 階梯頂
        else { for (let k = 0; k < 16; k++) RW(mc, x + 12 + k, ptop - Math.round(5 - Math.abs(k - 7.5) * .6), 1, 5, CREAM); }                          // 三角頂
        RW(mc, x + 1, top - 1, unit - 2, 1, shade(CREAM, -.25)); RW(mc, x + unit / 2 - 3, ptop - 2, 6, 3, shade(CREAM, -.15));   // 山牆上的牌匾
        // 二樓：紅磚牆＋磚縫、兩個拱形窗
        RW(mc, x, top, unit, arcY - top, BRICK);
        for (let y = top + 2; y < arcY; y += 3) for (let k = ((y / 3) % 2) * 3; k < unit; k += 6) RW(mc, x + k, y, 1, 1, MORTAR);
        for (let y = top + 2; y < arcY; y += 3) RW(mc, x, y, unit, 1, shade(BRICK, -.08));
        for (const wx of [8, 26]) {
          RW(mc, x + wx - 1, top + 4, 8, 11, CREAM);
          RW(mc, x + wx, top + 6, 6, 8, lit ? '#ffd27a' : TEAL); RW(mc, x + wx + 1, top + 5, 4, 1, lit ? '#ffd27a' : TEAL);
          RW(mc, x + wx + 3, top + 6, 1, 8, CREAM); if (!lit) RW(mc, x + wx, top + 6, 1, 3, shade(TEAL, .25));
        }
        RW(mc, x, top, 1, arcY - top, shade(BRICK, .12)); RW(mc, x + unit - 1, top, 1, arcY - top, shade(BRICK, -.2));
        RW(mc, x, arcY - 2, unit, 2, CREAM);                                                    // 騎樓上的橫帶
        // 一樓騎樓：柱子＋拱門，裡面暗、店面亮
        RW(mc, x, arcY, unit, p0 - arcY, shade(BRICK, -.1));
        const inner = lit ? '#f2b45c' : T('#5a4a42', tod);
        for (let k = 3; k < unit - 3; k++) {
          const ah = Math.round(Math.sin(Math.PI * (k - 3) / (unit - 7)) * 4);
          RW(mc, x + k, arcY + 5 - ah, 1, p0 - arcY - 5 + ah, inner);
        }
        RW(mc, x + 3, arcY + 5, unit - 6, 1, 'rgba(0,0,0,.18)');
        RW(mc, x, arcY, 3, p0 - arcY, BRICK); RW(mc, x, arcY, 1, p0 - arcY, shade(BRICK, .15));      // 柱子
        RW(mc, x + unit - 3, arcY, 3, p0 - arcY, BRICK); RW(mc, x + unit - 1, arcY, 1, p0 - arcY, shade(BRICK, -.25));
        const sign = ['#c8372d', '#2f5d8a', '#2f7a4f', '#7a3f8a'][i % 4];
        RW(mc, x + 9, arcY + 3, 22, 5, sign); RW(mc, x + 9, arcY + 3, 22, 1, shade(sign, .25));   // 店招（橫的）＋金色的「字」
        for (let k = 0; k < 4; k++) RW(mc, x + 11 + k * 5, arcY + 5, 3, 2, '#f2d35b');
        for (let k = 0; k < 3; k++) RW(mc, x + 8 + k * 9, p0 - 6, 6, 5, ['#e8574f', '#f2b134', '#7ab06a'][(k + i) % 3]);   // 店門口的貨
        RW(mc, x + 6, p0 - 1, unit - 12, 1, 'rgba(0,0,0,.2)');
        const lx = x + unit;                                                                    // 柱子上掛的紅燈籠
        RW(mc, lx - 1, arcY + 1, 1, 2, '#3b3f4a'); RW(mc, lx - 3, arcY + 3, 5, 5, '#d9483b'); RW(mc, lx - 4, arcY + 4, 7, 3, '#d9483b'); RW(mc, lx - 2, arcY + 4, 1, 3, '#f07a5f'); RW(mc, lx - 2, arcY + 8, 3, 1, '#f2d35b');
        lights.push({ x: lx - 1, y: arcY + 5, v: .5, r: 18, warm: true });
      }
      out.push({ cv: mid, v: .5 });
      const path = layer(PH), pc = path.getContext('2d');
      bricks(pc, rnd, p0, p1, T('#b7aa98', tod), 12, 6);
      R(pc, 0, p0, TW, 3, 'rgba(0,0,0,.15)');                                                     // 騎樓的影子
      out.push({ cv: path, v: 1 });
      const fg = layer(PH), fgc = fg.getContext('2d'), CURB = T('#9a9086', tod);
      R(fgc, 0, p1, TW, PH - p1, shade(CURB, -.12)); R(fgc, 0, p1, TW, 3, CURB); R(fgc, 0, p1, TW, 1, shade(CURB, .15));
      for (let x = 0; x < TW; x += 10) R(fgc, x, p1, 1, 3, shade(CURB, -.25));
      for (let x = 0; x < TW; x += 4) R(fgc, x, p1 + 6, 2, 1, shade(CURB, -.3));                // 水溝蓋
      for (let x = 14; x < TW; x += 48) { const pot = '#b5653f', y = PH - 9; RW(fgc, x, y, 8, 7, pot); RW(fgc, x, y, 8, 1, shade(pot, .2)); RW(fgc, x + 7, y, 1, 7, shade(pot, -.25)); blob(fgc, [[x + 4, y - 3, 4], [x + 1, y - 2, 3], [x + 7, y - 2, 3]], T('#4f9450', tod), shade(T('#4f9450', tod), .2), shade(T('#4f9450', tod), -.25), x - 3, y - 8, x + 11, y); }
      out.push({ cv: fg, v: 1.25 });
      return { layers: out, lights };
    } },

    sakura: { label: '櫻花步道', build(g) {              // 櫻花步道：遠處粉粉的山坡、大櫻花樹、碎石路、滿地花瓣；花瓣一直飄
      const { PH, gy, p0, p1, tod, night } = g, rnd = rng(66), out = [], lights = [];
      const PINK = T('#f4b6c8', tod), PINK2 = T('#e98fab', tod), PINKL = T('#fde0e8', tod), G1 = T('#8fbf7a', tod), G2 = T('#7aad66', tod);
      const far = layer(PH), fc = far.getContext('2d'), hill = mix(T('#9cc08a', tod), g.skyLow, .35);
      for (let x = 0; x < TW; x++) { const h = 10 + Math.round(Math.sin(x / TW * Math.PI * 2 * 2) * 5 + Math.sin(x / TW * Math.PI * 2 * 5) * 2); R(fc, x, gy - h, 1, h, hill); }
      for (let x = 6; x < TW; x += 11) blob(fc, [[x, gy - 10 - (x % 4), 4], [x + 3, gy - 9, 3]], mix(PINK, g.skyLow, .3), mix(PINKL, g.skyLow, .3), mix(PINK2, g.skyLow, .3), x - 5, gy - 18, x + 7, gy - 5);
      out.push({ cv: far, v: .1 });
      const mid = layer(PH), mc = mid.getContext('2d');
      dither(mc, 0, gy, TW, p0 - gy, G1, G2, (x, y) => (y - gy) / Math.max(1, p0 - gy) * .8);
      for (let x = 16, i = 0; x < TW; x += 40, i++) {          // 大櫻花樹：深色樹幹分叉、粉紅樹冠三種亮度
        const base = p0 - 2, trunk = night ? '#2a1e1c' : T('#5b3a32', tod);
        RW(mc, x - 2, base - 22, 4, 23, trunk); RW(mc, x + 1, base - 22, 1, 23, shade(trunk, -.3));
        for (let k = 0; k < 8; k++) { RW(mc, x - 2 - k, base - 22 - Math.round(k * .7), 2, 1, trunk); RW(mc, x + 2 + k, base - 24 - Math.round(k * .6), 2, 1, trunk); }
        blob(mc, [[x, base - 34, 10], [x - 9, base - 29, 8], [x + 9, base - 30, 8], [x - 3, base - 40, 7], [x + 5, base - 39, 6]], PINK, PINKL, PINK2, x - 18, base - 48, x + 18, base - 21);
        for (let k = 0; k < 10; k++) RW(mc, x - 14 + Math.floor(rnd() * 28), base - 44 + Math.floor(rnd() * 20), 1, 1, PINKL);
        RW(mc, x - 10, base + 1, 21, 1, 'rgba(0,0,0,.12)');
        if (i % 2 === 0) { RW(mc, x + 6, base - 20, 1, 3, '#3b3f4a'); RW(mc, x + 4, base - 17, 5, 5, '#f6e7c8'); RW(mc, x + 5, base - 16, 3, 3, '#ffd27a'); lights.push({ x: x + 6, y: base - 15, v: .5, r: 16, col: '255,220,170' }); }   // 夜櫻的燈籠
      }
      for (let i = 0; i < 60; i++) RW(mc, Math.floor(rnd() * TW), gy + 4 + Math.floor(rnd() * Math.max(1, p0 - gy - 6)), 1, 1, i % 3 ? PINK : PINKL);   // 草地上的落花
      out.push({ cv: mid, v: .5 });
      const path = layer(PH), pc = path.getContext('2d'), GRAVEL = T('#d9cdb8', tod);
      dither(pc, 0, p0, TW, p1 - p0, GRAVEL, shade(GRAVEL, -.06), (x, y) => .5);
      R(pc, 0, p0, TW, 1, shade(G2, -.2)); R(pc, 0, p1 - 1, TW, 1, shade(GRAVEL, -.25));
      for (let i = 0; i < 70; i++) { const x = Math.floor(rnd() * TW), y = p0 + 2 + Math.floor(rnd() * (p1 - p0 - 3)); RW(pc, x, y, 1, 1, rnd() < .4 ? shade(GRAVEL, -.18) : rnd() < .5 ? PINK : PINKL); }
      out.push({ cv: path, v: 1 });
      const fg = layer(PH), fgc = fg.getContext('2d');
      dither(fgc, 0, p1, TW, PH - p1, G2, G1, (x, y) => ((y - p1) / Math.max(1, PH - p1)) * .6);
      tufts(fgc, rnd, 50, p1 + 3, PH - 2, shade(G2, -.18), shade(G1, .1));
      for (let i = 0; i < 40; i++) RW(fgc, Math.floor(rnd() * TW), p1 + 2 + Math.floor(rnd() * (PH - p1 - 3)), 1, 1, i % 2 ? PINK : PINKL);
      out.push({ cv: fg, v: 1.25 });
      return { layers: out, lights, fx(c, a) {                // 花瓣一直飄（斜斜往左下）
        for (let i = 0; i < 18; i++) {
          const sp = 8 + (i % 5) * 3, y = ((i * 37 + a.t / 1000 * sp) % (PH + 10)) - 5, x = ((i * 53 - a.t / 1000 * sp * .8 + Math.sin(a.t / 600 + i) * 4 - a.scroll * .8) % a.PW + a.PW) % a.PW;
          R(c, x, y, i % 3 ? 1 : 2, 1, i % 2 ? '#f9c3d3' : '#fde0e8');
        }
      } };
    } },

    snow: { label: '雪地', snowy: true, build(g) {       // 雪地：雪山、積雪的松樹、雪人、柵欄、踩出來的雪路、腳印；一直飄雪（下雨的時候變成大雪）
      const { PH, gy, p0, p1, tod, night } = g, rnd = rng(77), out = [];
      const SNOW = T('#f4f7fb', tod), SNOW2 = T('#dfe7f1', tod), SHADOW = T('#c4d2e3', tod);
      const far = layer(PH), fc = far.getContext('2d'), mt = mix(T('#8c9cb5', tod), g.skyLow, .35);
      for (let x = 0; x < TW; x++) {
        const h = 24 + Math.round(Math.abs(Math.sin(x / TW * Math.PI * 3)) * 14 + Math.sin(x / TW * Math.PI * 2 * 7) * 3);
        R(fc, x, gy - h, 1, h, mt); R(fc, x, gy - h, 1, Math.min(h, 7), mix(SNOW, g.skyLow, .2));
      }
      out.push({ cv: far, v: .05 });
      const far2 = layer(PH), f2c = far2.getContext('2d'), pineCol = T('#3f6b5c', tod);
      R(f2c, 0, gy - 2, TW, 6, SNOW2);
      for (let x = 0; x < TW; x += 10) {                          // 松樹＋樹枝上的雪
        const px = x + Math.floor(rnd() * 4), h = 18 + Math.floor(rnd() * 10);
        pine(f2c, px, gy + 3, h, pineCol);
        for (let i = 3; i < h; i += 4) { const half = Math.max(1, Math.round((h - i) * .32)); RW(f2c, px - half, gy + 3 - i, half * 2 + 1, 1, SNOW); }
      }
      out.push({ cv: far2, v: .2 });
      const mid = layer(PH), mc = mid.getContext('2d');
      dither(mc, 0, gy + 4, TW, p0 - gy - 4, SNOW, SNOW2, (x, y) => (y - gy - 4) / Math.max(1, p0 - gy - 4) * .9);
      for (let x = 50; x < TW; x += 120) {                        // 雪人：三顆雪球、紅蘿蔔鼻子、樹枝手、圍巾、帽子
        const b = p0 - 3;
        blob(mc, [[x, b - 6, 6]], SNOW, '#ffffff', SHADOW, x - 7, b - 13, x + 7, b);
        blob(mc, [[x, b - 15, 4.5]], SNOW, '#ffffff', SHADOW, x - 6, b - 20, x + 6, b - 10);
        RW(mc, x - 5, b - 12, 11, 2, '#d9483b'); RW(mc, x + 3, b - 12, 2, 4, '#d9483b');
        RW(mc, x - 2, b - 17, 1, 1, '#2a2a2a'); RW(mc, x + 1, b - 17, 1, 1, '#2a2a2a'); RW(mc, x, b - 15, 3, 1, '#f08a2c');
        RW(mc, x - 4, b - 22, 9, 1, '#2a2a2a'); RW(mc, x - 3, b - 26, 7, 4, '#2a2a2a');
        for (let k = 0; k < 6; k++) { RW(mc, x - 6 - k, b - 9 - Math.round(k * .6), 1, 1, '#6b4a33'); RW(mc, x + 6 + k, b - 9 - Math.round(k * .7), 1, 1, '#6b4a33'); }
        RW(mc, x - 8, b + 1, 17, 1, SHADOW);
      }
      for (let x = 0; x < TW; x += 8) { RW(mc, x + 2, p0 - 9, 2, 8, T('#8a6a4a', tod)); RW(mc, x + 2, p0 - 10, 2, 1, SNOW); }   // 柵欄
      R(mc, 0, p0 - 7, TW, 1, T('#8a6a4a', tod)); R(mc, 0, p0 - 4, TW, 1, T('#8a6a4a', tod)); R(mc, 0, p0 - 8, TW, 1, SNOW);
      out.push({ cv: mid, v: .55 });
      const path = layer(PH), pc = path.getContext('2d');          // 踩出來的雪路：淡藍灰、兩條車輪痕、腳印
      dither(pc, 0, p0, TW, p1 - p0, SNOW2, SHADOW, (x, y) => .25 + Math.abs(Math.sin((y - p0) / (p1 - p0) * Math.PI)) * .25);
      R(pc, 0, p0, TW, 2, SNOW); R(pc, 0, p1 - 2, TW, 2, SNOW);
      for (let x = 0; x < TW; x += 9) { const y = Math.round((p0 + p1) / 2) + ((x / 9) % 2 ? 3 : -3); RW(pc, x, y, 2, 2, shade(SHADOW, -.08)); RW(pc, x + 2, y - 1, 1, 1, shade(SHADOW, -.08)); RW(pc, x - 1, y - 1, 1, 1, shade(SHADOW, -.08)); }   // 腳印
      out.push({ cv: path, v: 1 });
      const fg = layer(PH), fgc = fg.getContext('2d');
      for (let x = 0; x < TW; x++) { const h = 6 + Math.round(Math.sin(x / TW * Math.PI * 2 * 6) * 2); R(fgc, x, p1, 1, PH - p1, SNOW); R(fgc, x, p1, 1, 1, '#ffffff'); if ((x + h) % 7 === 0) R(fgc, x, p1 + h, 2, 1, SHADOW); }
      for (let i = 0; i < 12; i++) { const x = Math.floor(rnd() * TW), y = p1 + 4 + Math.floor(rnd() * (PH - p1 - 5)); RW(fgc, x, y, 1, 3, T('#7a5a3a', tod)); RW(fgc, x - 1, y, 3, 1, SNOW); }   // 雪裡露出來的小樹枝
      out.push({ cv: fg, v: 1.25 });
      return { layers: out, lights: [], fx(c, a) {             // 飄雪：晴天少、陰天多、下雨變大雪
        const n = a.w === 'rain' ? 46 : a.w === 'cloud' ? 28 : 14;
        for (let i = 0; i < n; i++) {
          const sp = 10 + (i % 6) * 4, y = ((i * 29 + a.t / 1000 * sp) % (PH + 6)) - 3, x = ((i * 47 + Math.sin(a.t / 900 + i * 1.3) * 5 - a.scroll * .6) % a.PW + a.PW) % a.PW;
          R(c, x, y, i % 4 ? 1 : 2, i % 4 ? 1 : 2, '#ffffff');
        }
      } };
    } },

    country: { label: '鄉間小路', build(g) {             // 鄉間小路：遠山、一格一格的稻田、紅屋頂農舍、電線桿、稻草人、中間長草的土路
      const { PH, gy, p0, p1, tod, night, lit } = g, rnd = rng(88), out = [], lights = [];
      const RICE = tod === 'evening' ? T('#c9b04a', tod) : T('#86b94f', tod), RICE2 = shade(RICE, -.12), WATER = T('#9cc9d6', tod);
      const far = layer(PH), fc = far.getContext('2d'), m1 = mix(T('#6e8fb0', tod), g.skyLow, .4);
      for (let x = 0; x < TW; x++) { const h = 14 + Math.round(Math.sin(x / TW * Math.PI * 2 * 1.5) * 7 + Math.sin(x / TW * Math.PI * 2 * 4) * 3); R(fc, x, gy - h, 1, h, m1); }
      out.push({ cv: far, v: .05 });
      const fields = layer(PH), dc = fields.getContext('2d');
      for (let y = gy, row = 0; y < p0; row++) {                 // 稻田：越近一格越高，田埂、水面反光
        const h = 3 + row * 2;
        for (let x = 0; x < TW; x += 24) {
          const col = (row + x / 24) % 3 === 0 ? WATER : (row + x / 24) % 2 ? RICE : RICE2;
          RW(dc, x, y, 24, h, col);
          if (col !== WATER) for (let k = 1; k < 24; k += 2) RW(dc, x + k, y + 1, 1, Math.max(1, h - 2), shade(col, -.1));
          else RW(dc, x + 3, y + 1, 6, 1, shade(WATER, .3));
          RW(dc, x, y, 1, h, T('#7a8a4a', tod));
        }
        R(dc, 0, y, TW, 1, T('#8f9a5a', tod)); y += h;
      }
      { const hx0 = 150, base = gy + 4, wall = T('#efe6d2', tod), roof = T('#b8483a', tod);   // 紅屋頂農舍（三合院的一角）
        RW(dc, hx0, base - 9, 30, 9, wall); RW(dc, hx0, base - 9, 30, 1, shade(wall, -.15));
        for (let k = 0; k < 34; k++) RW(dc, hx0 - 2 + k, base - 13 + Math.round(Math.abs(k - 16.5) / 8), 1, 4, k % 2 ? roof : shade(roof, .12));
        RW(dc, hx0 + 4, base - 6, 4, 4, lit ? '#ffd27a' : T('#5a6a7a', tod)); RW(dc, hx0 + 13, base - 6, 5, 6, T('#7a5a3a', tod)); RW(dc, hx0 + 22, base - 6, 4, 4, lit ? '#ffd27a' : T('#5a6a7a', tod));
        lights.push({ x: hx0 + 6, y: base - 4, v: .25, r: 10, col: '255,210,140' }); lights.push({ x: hx0 + 24, y: base - 4, v: .25, r: 10, col: '255,210,140' }); }
      out.push({ cv: fields, v: .25 });
      const mid = layer(PH), mc = mid.getContext('2d'), pole = T('#7a6a5a', tod);
      for (let x = 20; x < TW; x += 60) { RW(mc, x, p0 - 44, 2, 44, pole); RW(mc, x + 1, p0 - 44, 1, 44, shade(pole, -.2)); RW(mc, x - 5, p0 - 41, 12, 1, pole); RW(mc, x - 5, p0 - 42, 1, 1, '#d9dde2'); RW(mc, x + 6, p0 - 42, 1, 1, '#d9dde2'); }   // 電線桿
      for (let x = 0; x < TW; x++) { const sag = Math.round(Math.sin(((x - 20 + TW) % 60) / 60 * Math.PI) * 4); R(mc, x, p0 - 42 + sag, 1, 1, '#3b3f4a'); R(mc, x, p0 - 39 + sag, 1, 1, '#3b3f4a'); }   // 電線
      { const sx = 95, b = p0 - 2, straw = T('#d9b55a', tod);   // 稻草人
        RW(mc, sx, b - 20, 1, 20, '#6b4a33'); RW(mc, sx - 8, b - 15, 17, 1, '#6b4a33');
        blob(mc, [[sx, b - 22, 3]], straw, shade(straw, .2), shade(straw, -.2), sx - 4, b - 26, sx + 4, b - 18);
        RW(mc, sx - 5, b - 26, 11, 1, T('#8a5a2a', tod)); RW(mc, sx - 3, b - 29, 7, 3, T('#8a5a2a', tod));
        RW(mc, sx - 4, b - 16, 9, 7, T('#3f6fae', tod)); RW(mc, sx - 9, b - 16, 4, 2, straw); RW(mc, sx + 6, b - 16, 4, 2, straw); }
      tufts(mc, rnd, 30, p0 - 6, p0 - 1, T('#5d8f4e', tod), T('#8fbf7a', tod));
      out.push({ cv: mid, v: .55 });
      const path = layer(PH), pc = path.getContext('2d'), DIRT = T('#b59a72', tod);   // 土路：兩條輪痕、中間一條草
      dither(pc, 0, p0, TW, p1 - p0, DIRT, shade(DIRT, -.07), (x, y) => .4 + Math.sin(x / TW * Math.PI * 2 * 8) * .15);
      const mid1 = Math.round((p0 + p1) / 2);
      for (let x = 0; x < TW; x++) { R(pc, x, mid1 - 1, 1, 3, (x * 7) % 5 ? T('#7fa85a', tod) : T('#6a9a4a', tod)); if (x % 3 === 0) R(pc, x, mid1 - 2, 1, 1, T('#8fbf6a', tod)); }
      R(pc, 0, p0 + 4, TW, 1, shade(DIRT, -.15)); R(pc, 0, p1 - 5, TW, 1, shade(DIRT, -.15));
      for (let i = 0; i < 30; i++) { const x = Math.floor(rnd() * TW), y = p0 + 2 + Math.floor(rnd() * (p1 - p0 - 3)); RW(pc, x, y, 2, 1, shade(DIRT, .15)); }
      R(pc, 0, p0, TW, 1, T('#6a9a4a', tod)); R(pc, 0, p1 - 1, TW, 1, shade(DIRT, -.25));
      out.push({ cv: path, v: 1 });
      const fg = layer(PH), fgc = fg.getContext('2d'), G1 = T('#7fb36a', tod), G2 = T('#6aa057', tod);
      dither(fgc, 0, p1, TW, PH - p1, G1, G2, (x, y) => ((y - p1) / Math.max(1, PH - p1)) * .8);
      tufts(fgc, rnd, 60, p1 + 3, PH - 2, shade(G2, -.18), shade(G1, .1));
      if (!night) flowers(fgc, rnd, 12, p1 + 4, PH - 3, shade(G2, -.2));
      out.push({ cv: fg, v: 1.25 });
      return { layers: out, lights };
    } },

    flowers: { label: '花田', build(g) {                 // 花田：遠山、一片向日葵、大朵向日葵、木頭步道、紫色薰衣草；蝴蝶飛來飛去
      const { PH, gy, p0, p1, tod, night } = g, rnd = rng(99), out = [];
      const Y = T('#f6c531', tod), Y2 = T('#e3a21f', tod), BROWN = T('#6b4325', tod), LEAF = T('#4f8f3f', tod), LAV = T('#9a7bd1', tod), LAV2 = T('#7e5fb8', tod);
      const far = layer(PH), fc = far.getContext('2d'), hill = mix(T('#86ad73', tod), g.skyLow, .35);
      for (let x = 0; x < TW; x++) { const h = 8 + Math.round(Math.sin(x / TW * Math.PI * 2 * 2) * 4); R(fc, x, gy - h, 1, h, hill); }
      out.push({ cv: far, v: .06 });
      const field = layer(PH), dc = field.getContext('2d');
      R(dc, 0, gy, TW, p0 - gy, T('#5e9a46', tod));
      for (let y = gy + 1; y < p0 - 8; y += 2) for (let x = (y % 4) / 2; x < TW; x += 3) RW(dc, x, y, 1 + (y - gy > 10 ? 1 : 0), 1, (x + y) % 5 ? Y : Y2);   // 遠處一片向日葵（點點，越近越大）
      out.push({ cv: field, v: .3 });
      const mid = layer(PH), mc = mid.getContext('2d');
      for (let x = 4; x < TW; x += 12) {                         // 大朵向日葵：莖、葉、花瓣、咖啡色花心
        const h = 16 + (x * 7) % 8, fx = x + Math.floor(rnd() * 3), fy = p0 - h;
        RW(mc, fx, fy, 1, h, LEAF); RW(mc, fx - 3, fy + 7, 3, 2, LEAF); RW(mc, fx + 1, fy + 10, 3, 2, shade(LEAF, -.1));
        for (const [dx, dy] of [[-3, 0], [3, 0], [0, -3], [0, 3], [-2, -2], [2, -2], [-2, 2], [2, 2]]) RW(mc, fx + dx - (dx > 0 ? 0 : 1), fy + dy - 1, 2, 2, (dx + dy) % 2 ? Y : Y2);
        RW(mc, fx - 1, fy - 1, 3, 3, BROWN); RW(mc, fx - 1, fy - 1, 1, 1, shade(BROWN, .2));
      }
      out.push({ cv: mid, v: .6 });
      const path = layer(PH), pc = path.getContext('2d'), WOOD = T('#c09466', tod);   // 木頭步道（橫的木板）
      R(pc, 0, p0, TW, p1 - p0, shade(WOOD, -.25));
      for (let y = p0 + 1, r = 0; y < p1 - 1; y += 4, r++) for (let x = -(r % 2) * 10; x < TW; x += 20) {
        const col = rnd() < .3 ? shade(WOOD, -.06) : WOOD;
        RW(pc, x, y, 19, 3, col); RW(pc, x, y, 19, 1, shade(col, .12)); RW(pc, x + 2, y + 1, 1, 1, shade(WOOD, -.35)); RW(pc, x + 16, y + 1, 1, 1, shade(WOOD, -.35));
      }
      out.push({ cv: path, v: 1 });
      const fg = layer(PH), fgc = fg.getContext('2d');
      R(fgc, 0, p1, TW, PH - p1, T('#5e8a46', tod));
      for (let x = 0; x < TW; x += 6) for (let k = 0; k < 7; k++) {   // 薰衣草：一叢一叢紫色的穗
        const sx = x + Math.floor(rnd() * 5), sy = p1 + 2 + Math.floor(rnd() * (PH - p1 - 6));
        RW(fgc, sx, sy + 2, 1, 4, T('#6a8a4a', tod)); RW(fgc, sx, sy - 1, 1, 3, k % 2 ? LAV : LAV2); RW(fgc, sx + (k % 2 ? 1 : -1), sy, 1, 1, LAV);
      }
      out.push({ cv: fg, v: 1.25 });
      return { layers: out, lights: [], fx(c, a) {             // 蝴蝶（晚上換螢火蟲）
        for (let i = 0; i < 4; i++) {
          const x = ((i * 61 + a.t / 1000 * (6 + i * 2) - a.scroll * .7) % a.PW + a.PW) % a.PW, y = gy + 4 + i * 6 + Math.sin(a.t / 500 + i * 2) * 6, flap = Math.floor(a.t / 160 + i) % 2;
          if (night) { if (Math.sin(a.t / 400 + i) > 0) { R(c, x, y, 1, 1, '#e8ff8a'); a.glow.push([x, y, 6]); } continue; }
          const col = ['#ffffff', '#f2a8d0', '#f6d44a', '#9ad0f5'][i];
          R(c, x, y, 1, 2, '#3b3f4a'); R(c, x - (flap ? 2 : 1), y - (flap ? 1 : 0), flap ? 2 : 1, 2, col); R(c, x + 1, y - (flap ? 1 : 0), flap ? 2 : 1, 2, col);
        }
      } };
    } },

    harbor: { label: '港口', build(g) {                   // 港口碼頭：遠處的船、停著的漁船、纜繩樁、木箱、水泥碼頭、黃色邊線、輪胎；海鷗飛過
      const { PH, gy, p0, p1, tod, night, lit } = g, rnd = rng(111), out = [], lights = [];
      const SEA = T('#3f8fb5', tod), SEA2 = T('#6fb0cf', tod);
      const sea = layer(PH), sc = sea.getContext('2d');
      dither(sc, 0, gy, TW, p0 - gy, SEA2, SEA, (x, y) => (y - gy) / Math.max(1, p0 - gy));
      for (let i = 0; i < 24; i++) RW(sc, Math.floor(rnd() * TW), gy + 3 + Math.floor(rnd() * (p0 - gy - 6)), 3, 1, shade(SEA2, .25));
      RW(sc, 60, gy - 3, 12, 3, mix(T('#e9e6df', tod), g.skyLow, .3)); RW(sc, 64, gy - 6, 4, 3, mix(T('#e9e6df', tod), g.skyLow, .3));   // 遠處的船
      RW(sc, 170, gy - 2, 8, 2, mix(T('#c8372d', tod), g.skyLow, .3));
      out.push({ cv: sea, v: .08 });
      const boats = layer(PH), bc = boats.getContext('2d');
      for (const [x, hull, cab] of [[12, '#d9483b', '#f4efe6'], [92, '#2f6fae', '#f4efe6'], [170, '#2f8a5a', '#f2d35b']]) {   // 漁船：船身、船艙、桅桿、旗子
        const by = p0 - 14, H = T(hull, tod);
        for (let k = 0; k < 40; k++) { const d = Math.round(Math.abs(k - 20) / 10); RW(bc, x + k, by + d, 1, 7 - d * 2, H); }
        RW(bc, x, by, 40, 1, shade(H, .2)); RW(bc, x + 2, by + 3, 36, 1, '#f4efe6');
        RW(bc, x + 14, by - 8, 12, 8, T(cab, tod)); RW(bc, x + 16, by - 6, 3, 3, lit ? '#ffd27a' : '#5a7a9a'); RW(bc, x + 21, by - 6, 3, 3, lit ? '#ffd27a' : '#5a7a9a'); RW(bc, x + 13, by - 9, 14, 1, shade(T(cab, tod), -.25));
        RW(bc, x + 28, by - 22, 1, 22, '#5a5a5a'); RW(bc, x + 29, by - 22, 6, 4, '#e8574f'); for (let k = 0; k < 10; k++) RW(bc, x + 28 - k, by - 20 + k * 2, 1, 1, '#9a9a9a');
        lights.push({ x: x + 18, y: by - 4, v: .4, r: 12, col: '255,210,140' });
        RW(bc, x, by + 7, 40, 1, shade(SEA, -.2));
      }
      out.push({ cv: boats, v: .4 });
      const path = layer(PH), pc = path.getContext('2d'), CON = T('#b9b6ae', tod);   // 水泥碼頭：接縫、黃色邊線、纜繩樁、木箱
      dither(pc, 0, p0, TW, p1 - p0, CON, shade(CON, -.05), (x, y) => .45);
      R(pc, 0, p0, TW, 2, '#f2c531'); R(pc, 0, p0 + 2, TW, 1, shade(CON, -.2));
      for (let x = 0; x < TW; x += 30) R(pc, x, p0 + 3, 1, p1 - p0 - 3, shade(CON, -.15));
      for (let x = 18; x < TW; x += 60) { RW(pc, x - 2, p0 - 4, 5, 6, '#3b3f4a'); RW(pc, x - 3, p0 - 5, 7, 2, '#4a4f5a'); RW(pc, x - 2, p0 - 4, 1, 6, '#5a6070'); }   // 纜繩樁
      for (let x = 46; x < TW; x += 120) { const w = T('#a8774c', tod); RW(pc, x, p0 - 8, 10, 9, w); RW(pc, x, p0 - 8, 10, 1, shade(w, .15)); RW(pc, x, p0 - 4, 10, 1, shade(w, -.2)); RW(pc, x + 9, p0 - 8, 1, 9, shade(w, -.25)); }   // 木箱
      R(pc, 0, p1 - 2, TW, 2, shade(CON, -.3));
      for (const lx of [100, 220]) { lamp(pc, lx, p0, lit); lights.push({ x: lx, y: p0 - 33, v: 1, r: 60 }); }
      out.push({ cv: path, v: 1 });
      const fg = layer(PH), fgc = fg.getContext('2d');        // 碼頭邊：舊輪胎、下面的海
      R(fgc, 0, p1, TW, 4, shade(CON, -.2));
      dither(fgc, 0, p1 + 4, TW, PH - p1 - 4, SEA, shade(SEA, -.15), (x, y) => .5);
      for (let x = 10; x < TW; x += 30) { RW(fgc, x, p1, 7, 7, '#2a2a2e'); RW(fgc, x + 2, p1 + 2, 3, 3, shade(SEA, -.1)); RW(fgc, x, p1, 7, 1, '#4a4a50'); }
      for (let i = 0; i < 16; i++) RW(fgc, Math.floor(rnd() * TW), p1 + 8 + Math.floor(rnd() * (PH - p1 - 9)), 3, 1, shade(SEA, .2));
      out.push({ cv: fg, v: 1.25 });
      return { layers: out, lights, animAt: 0, anim(c, a) {    // 海鷗飛過天空（晚上不飛）
        if (night) return;
        for (let i = 0; i < 3; i++) {
          const x = ((i * 70 + a.t / 1000 * (10 + i * 3)) % (a.PW + 20)) - 10, y = gy * (.3 + i * .15) + Math.sin(a.t / 700 + i) * 3, up = Math.floor(a.t / 250 + i) % 2;
          R(c, x - 2, y - (up ? 1 : 0), 2, 1, '#ffffff'); R(c, x, y, 1, 1, '#ffffff'); R(c, x + 1, y - (up ? 1 : 0), 2, 1, '#ffffff');
        }
      } };
    } },

    mountain: { label: '山上', build(g) {                 // 山上步道：雲海裡露出來的山頭、岩石、松樹、涼亭、木頭階梯步道
      const { PH, gy, p0, p1, tod, night } = g, rnd = rng(122), out = [];
      const far = layer(PH), fc = far.getContext('2d'), peak = mix(T('#6f86a6', tod), g.skyLow, .35), CLOUD = T('#f4f6fa', tod);
      for (let x = 0; x < TW; x++) { const h = 12 + Math.round(Math.max(0, Math.sin(x / TW * Math.PI * 2 * 3)) * 20); R(fc, x, gy - h, 1, h, peak); if (h > 26) R(fc, x, gy - h, 1, 2, shade(peak, .25)); }
      R(fc, 0, gy - 6, TW, 12, CLOUD);                                                           // 雲海：厚厚一層，上面一團一團凸起來
      for (let x = 0; x < TW; x += 14) blob(fc, [[x, gy - 7, 5], [x + 6, gy - 9, 6], [x + 11, gy - 6, 4]], CLOUD, '#ffffff', shade(CLOUD, -.08), x - 6, gy - 16, x + 16, gy - 2);
      out.push({ cv: far, v: .04 });
      const ridge = layer(PH), rc = ridge.getContext('2d'), ROCK = T('#8a8578', tod), G1 = T('#6f9a58', tod);
      for (let x = 0; x < TW; x++) { const h = 8 + Math.round(Math.sin(x / TW * Math.PI * 2 * 2 + 1) * 4); R(rc, x, gy + 6 - h, 1, p0 - gy - 6 + h, G1); }
      dither(rc, 0, gy + 4, TW, p0 - gy - 4, G1, shade(G1, -.12), (x, y) => (y - gy - 4) / Math.max(1, p0 - gy - 4));
      for (let x = 10; x < TW; x += 34) blob(rc, [[x, p0 - 6, 5], [x + 4, p0 - 4, 4]], ROCK, shade(ROCK, .2), shade(ROCK, -.25), x - 6, p0 - 12, x + 9, p0 - 1);   // 岩石
      for (let x = 26; x < TW; x += 34) pine(rc, x, p0 - 3, 20 + (x % 7), T('#3f6b4c', tod));
      { const px = 140, b = p0 - 3, roof = T('#7a3a2a', tod), post = T('#8a5a3a', tod);   // 涼亭：翹起來的屋頂、四根柱子
        for (let k = 0; k < 26; k++) RW(rc, px - 13 + k, b - 22 + Math.round(Math.abs(k - 12.5) / 4), 1, 3, k % 2 ? roof : shade(roof, .15));
        RW(rc, px - 15, b - 18, 2, 1, roof); RW(rc, px + 13, b - 18, 2, 1, roof); RW(rc, px - 1, b - 26, 2, 4, roof);
        for (const ox of [-10, -4, 3, 9]) RW(rc, px + ox, b - 18, 2, 18, post);
        RW(rc, px - 11, b - 8, 22, 2, shade(post, -.15)); }
      out.push({ cv: ridge, v: .4 });
      const path = layer(PH), pc = path.getContext('2d'), STEP = T('#a87e57', tod);   // 木頭階梯：一階一階、側面暗、中間是土
      R(pc, 0, p0, TW, p1 - p0, T('#9b7653', tod));
      for (let x = 0; x < TW; x += 10) { RW(pc, x, p0 + 2, 9, p1 - p0 - 4, STEP); RW(pc, x, p0 + 2, 9, 1, shade(STEP, .15)); RW(pc, x + 8, p0 + 2, 1, p1 - p0 - 4, shade(STEP, -.3)); for (let y = p0 + 5; y < p1 - 3; y += 4) RW(pc, x + 2, y, 4, 1, shade(STEP, -.1)); }
      R(pc, 0, p0, TW, 2, shade(G1, -.2)); R(pc, 0, p1 - 2, TW, 2, shade(STEP, -.35));
      for (let x = 0; x < TW; x += 20) RW(pc, x + 3, p0 - 6, 1, 7, '#6b4a33');   // 繩子欄杆
      for (let x = 0; x < TW; x++) R(pc, x, p0 - 5 + Math.round(Math.sin(((x - 3 + TW) % 20) / 20 * Math.PI) * 1.5), 1, 1, '#c8b28a');
      out.push({ cv: path, v: 1 });
      const fg = layer(PH), fgc = fg.getContext('2d');
      dither(fgc, 0, p1, TW, PH - p1, G1, shade(G1, -.15), (x, y) => ((y - p1) / Math.max(1, PH - p1)) * .7);
      for (let x = 8; x < TW; x += 45) blob(fgc, [[x, PH - 4, 6], [x + 5, PH - 3, 4]], ROCK, shade(ROCK, .2), shade(ROCK, -.25), x - 7, PH - 11, x + 10, PH - 1);
      tufts(fgc, rnd, 50, p1 + 3, PH - 2, shade(G1, -.2), shade(G1, .12));
      if (!night) flowers(fgc, rnd, 8, p1 + 4, PH - 3, shade(G1, -.2));
      out.push({ cv: fg, v: 1.25 });
      return { layers: out, lights: [] };
    } },

    nightmarket: { label: '夜市', build(g) {              // 夜市：攤位（招牌、遮棚、檯子上的食物、冒煙）、一串燈泡、柏油路、停著的機車；晚上最熱鬧
      const { PH, gy, p0, p1, tod, night, lit } = g, rnd = rng(133), out = [], lights = [];
      const far = layer(PH), fc = far.getContext('2d'), bld = mix(T('#6a6a80', tod), g.skyLow, .2);
      for (let x = 0; x < TW;) { const w = 10 + Math.floor(rnd() * 10), h = 18 + Math.floor(rnd() * 16); RW(fc, x, gy - h, w, h + 10, bld); for (let yy = gy - h + 3; yy < gy; yy += 4) for (let xx = x + 2; xx < x + w - 2; xx += 3) if (rnd() < .5) RW(fc, xx, yy, 1, 2, lit ? '#ffd77a' : shade(bld, .15)); x += w; }
      out.push({ cv: far, v: .1 });
      const mid = layer(PH), mc = mid.getContext('2d');
      const signs = ['#e8574f', '#f2b134', '#3f8fd5', '#d94a8a', '#4fb36a'];
      for (let x = 0, i = 0; x < TW; x += 30, i++) {           // 攤位
        const sc = signs[i % 5], top = p0 - 34, roofC = T(['#c8372d', '#2f5d8a', '#e8a33a'][i % 3], tod);
        RW(mc, x + 1, top, 28, 7, lit ? shade(sc, .1) : T(sc, tod)); RW(mc, x + 1, top, 28, 1, '#ffffff');   // 發亮的招牌＋「字」
        for (let k = 0; k < 4; k++) RW(mc, x + 5 + k * 6, top + 2, 4, 3, '#ffffff');
        for (let k = 0; k < 28; k++) RW(mc, x + 1 + k, top + 7, 1, 4, Math.floor(k / 4) % 2 ? roofC : '#f4efe6');   // 條紋遮棚
        for (let k = 0; k < 28; k += 4) RW(mc, x + 2 + k, top + 11, 2, 1, roofC);
        RW(mc, x + 2, top + 12, 26, p0 - top - 20, lit ? T('#6a4a3a', tod) : T('#7a6a5a', tod));            // 攤位裡面
        RW(mc, x + 1, p0 - 9, 28, 8, T('#d9c3a3', tod)); RW(mc, x + 1, p0 - 9, 28, 1, shade(T('#d9c3a3', tod), .2));   // 檯子
        for (let k = 0; k < 5; k++) { const fx = x + 3 + k * 5, food = ['#e8574f', '#f2b134', '#a8552c', '#f4efe6', '#6aa057'][(k + i) % 5]; RW(mc, fx, p0 - 12, 4, 3, food); RW(mc, fx, p0 - 12, 4, 1, shade(food, .25)); }
        RW(mc, x + 1, top, 1, p0 - top, '#5a5a5a'); RW(mc, x + 28, top, 1, p0 - top, '#5a5a5a');
        lights.push({ x: x + 15, y: top + 3, v: .5, r: 20, col: '255,200,150' });
      }
      for (let x = 0; x < TW; x += 6) {                         // 一串燈泡（彎彎的）
        const y = p0 - 38 + Math.round(Math.sin(((x % 30) / 30) * Math.PI) * 3), col = ['#ffd77a', '#ff9a7a', '#9ad0ff', '#b9ff9a'][(x / 6) % 4];
        RW(mc, x + 2, y + 1, 2, 2, lit ? col : '#d9d9d0');
      }
      for (let x = 0; x < TW; x++) R(mc, x, p0 - 38 + Math.round(Math.sin(((x % 30) / 30) * Math.PI) * 3), 1, 1, '#3b3f4a');
      out.push({ cv: mid, v: .5 });
      const path = layer(PH), pc = path.getContext('2d'), ASP = T('#6f6c72', tod);
      dither(pc, 0, p0, TW, p1 - p0, ASP, shade(ASP, -.07), (x, y) => .5);
      R(pc, 0, p0, TW, 2, shade(ASP, -.25));
      for (let i = 0; i < 20; i++) RW(pc, Math.floor(rnd() * TW), p0 + 3 + Math.floor(rnd() * (p1 - p0 - 5)), 2, 1, shade(ASP, .12));
      if (lit) for (let x = 0; x < TW; x += 30) for (let k = 0; k < 6; k++) RW(pc, x + 8 + k * 2, p0 + 3 + (k % 2), 1, 1, 'rgba(255,210,150,.35)');   // 地上的燈光倒影
      R(pc, 0, p1 - 2, TW, 2, shade(ASP, -.3));
      out.push({ cv: path, v: 1 });
      const fg = layer(PH), fgc = fg.getContext('2d'), CURB = T('#a39a90', tod);
      R(fgc, 0, p1, TW, PH - p1, shade(CURB, -.2)); R(fgc, 0, p1, TW, 3, CURB); R(fgc, 0, p1, TW, 1, shade(CURB, .15));
      for (let x = 30; x < TW; x += 80) {                        // 停著的機車
        const y = PH - 4, body = T(['#d9483b', '#3f8fd5', '#f4efe6'][(x / 80 | 0) % 3], tod);
        RW(fgc, x, y - 3, 4, 4, '#2a2a2e'); RW(fgc, x + 14, y - 3, 4, 4, '#2a2a2e'); RW(fgc, x + 1, y - 2, 2, 2, '#8a8a90'); RW(fgc, x + 15, y - 2, 2, 2, '#8a8a90');
        RW(fgc, x + 3, y - 8, 13, 5, body); RW(fgc, x + 5, y - 10, 8, 2, '#3b3b40'); RW(fgc, x + 15, y - 12, 2, 7, body); RW(fgc, x + 14, y - 13, 4, 1, '#3b3b40');
      }
      out.push({ cv: fg, v: 1.25 });
      return { layers: out, lights, fx(c, a) {                // 攤位冒煙
        for (let i = 0; i < 8; i++) {
          const baseX = ((i * 30 + 12 - a.scroll * .5) % TW + TW) % TW, up = (a.t / 1000 * 6 + i * 5) % 14;
          for (const bx of [baseX, baseX - TW, baseX + TW]) if (bx > -4 && bx < a.PW + 4) R(c, bx + Math.sin(a.t / 400 + i) * 1.5, p0 - 14 - up, 2, 1, `rgba(255,255,255,${(.5 - up / 30).toFixed(2)})`);
        }
      } };
    } },

    campus: { label: '校園', build(g) {                    // 校園操場：教室大樓（鐘塔、一排窗）、圍欄、樹、籃球架、紅色跑道＋白線、綠色球場
      const { PH, gy, p0, p1, tod, night, lit } = g, rnd = rng(144), out = [], lights = [];
      const far = layer(PH), fc = far.getContext('2d'), WALL = T('#e9dcc4', tod), ROOF = T('#b8483a', tod);
      R(fc, 0, gy - 22, TW, 30, WALL); R(fc, 0, gy - 24, TW, 2, ROOF); R(fc, 0, gy - 22, TW, 1, shade(WALL, -.2));
      for (let fl = 0; fl < 3; fl++) for (let x = 3; x < TW; x += 8) { RW(fc, x, gy - 19 + fl * 7, 5, 4, lit && rnd() < .5 ? '#ffd27a' : T('#7c9ab8', tod)); RW(fc, x, gy - 15 + fl * 7, 5, 1, shade(WALL, -.15)); }
      { const cx = 120; RW(fc, cx - 6, gy - 40, 12, 18, WALL); RW(fc, cx - 7, gy - 42, 14, 2, ROOF); RW(fc, cx - 3, gy - 46, 6, 4, ROOF);   // 鐘塔
        blob(fc, [[cx, gy - 34, 3.5]], '#ffffff', '#ffffff', '#c9c9c0', cx - 4, gy - 38, cx + 4, gy - 30); RW(fc, cx, gy - 36, 1, 3, '#3b3f4a'); RW(fc, cx, gy - 34, 2, 1, '#3b3f4a'); }
      out.push({ cv: far, v: .1 });
      const mid = layer(PH), mc = mid.getContext('2d'), G1 = T('#6fa85a', tod);
      R(mc, 0, gy + 8, TW, p0 - gy - 8, G1);
      for (let x = 0; x < TW; x += 3) RW(mc, x, gy + 2, 1, 8, '#8a9098');                           // 鐵絲網圍欄
      R(mc, 0, gy + 2, TW, 1, '#6a7078'); R(mc, 0, gy + 6, TW, 1, '#9aa0a8');
      for (let x = 20; x < TW; x += 48) tree(mc, x, gy + 10, 10, T('#4f9450', tod), night);
      { const hx0 = 186, b = p0 - 2;                                                                // 籃球架
        RW(mc, hx0, b - 30, 2, 30, '#3b3f4a'); RW(mc, hx0 - 10, b - 32, 12, 1, '#3b3f4a'); RW(mc, hx0 - 18, b - 40, 10, 8, '#f4f4f0'); RW(mc, hx0 - 15, b - 36, 4, 3, '#d9483b');
        RW(mc, hx0 - 17, b - 33, 8, 1, '#e8742c'); for (let k = 0; k < 4; k++) RW(mc, hx0 - 16 + k * 2, b - 32, 1, 3, '#ffffff'); }
      out.push({ cv: mid, v: .5 });
      const path = layer(PH), pc = path.getContext('2d'), TRACK = T('#c4583f', tod);         // 紅色跑道：白色分道線、數字
      dither(pc, 0, p0, TW, p1 - p0, TRACK, shade(TRACK, -.06), (x, y) => .5);
      for (const y of [p0, Math.round(p0 + (p1 - p0) / 3), Math.round(p0 + (p1 - p0) * 2 / 3), p1 - 1]) R(pc, 0, y, TW, 1, '#f4f0e8');
      for (let x = 40; x < TW; x += 120) { RW(pc, x, p0 + 3, 3, 4, '#f4f0e8'); RW(pc, x + 4, p0 + 3, 3, 4, '#f4f0e8'); RW(pc, x + 1, p0 + 4, 1, 2, TRACK); }
      out.push({ cv: path, v: 1 });
      const fg = layer(PH), fgc = fg.getContext('2d'), F1 = T('#6fb05a', tod), F2 = T('#5e9a4a', tod);   // 球場的草：一條深一條淺
      for (let x = 0; x < TW; x++) R(fgc, x, p1, 1, PH - p1, Math.floor(x / 20) % 2 ? F1 : F2);
      R(fgc, 0, p1 + 2, TW, 1, '#f4f0e8');
      tufts(fgc, rnd, 30, p1 + 4, PH - 2, shade(F2, -.15), shade(F1, .1));
      { const bx = 80, by = PH - 7; blob(fgc, [[bx, by, 3]], '#ffffff', '#ffffff', '#c9c9c0', bx - 4, by - 4, bx + 4, by + 4); RW(fgc, bx - 1, by - 1, 2, 2, '#2a2a2e'); }   // 足球
      out.push({ cv: fg, v: 1.25 });
      return { layers: out, lights };
    } },
  };
  const ORDER = ['park', 'beach', 'forest', 'river', 'street', 'sakura', 'snow', 'country', 'flowers', 'harbor', 'mountain', 'nightmarket', 'campus'];   // 13 個（2026-10-20 使用者再挑 8 個、老街重畫）

  function build(name, PW, PH, tod, w) {
    const sc = SCENES[name] || SCENES.park, night = tod === 'night', lit = night || tod === 'evening';
    TW = Math.max(240, Math.ceil(PW / 12) * 12);
    const gy = Math.round(PH * .42), p0 = Math.round(PH * .62), p1 = Math.round(PH * .88);
    const g = { PW, PH, gy, p0, p1, tod, w, night, lit, skyLow: skyOf(tod, w)[2] };
    const r = sc.build(g);
    if (w !== 'sun') for (const L of r.layers) {             // 陰天、下雨：地上也灰一點
      const c = L.cv.getContext('2d'); c.save(); c.globalCompositeOperation = 'source-atop';
      c.fillStyle = w === 'rain' ? 'rgba(70,82,104,.28)' : 'rgba(110,118,130,.14)'; c.fillRect(0, 0, TW, PH); c.restore();
    }
    return { name, label: sc.label, TW, PW, PH, gy, p0, p1, tod, w, sky: paintSky(PW, gy, tod, w), clouds: cloudSprites(tod, w), layers: r.layers, lights: r.lights || [], anim: r.anim || null, animAt: r.animAt ?? 1, fx: r.fx || null, snowy: !!sc.snowy };
  }
  const STARS = Array.from({ length: 22 }, (_, i) => [(i * 0.618034) % 1, ((i * 0.381966 * 7) % 1) * .62, i % 5]);
  // 每一格：天空 → 星星 → 雲 → 一層一層（照 scroll 往左移、左右接）。scroll＝走了多遠（步道的格數）
  function draw(c, s, scroll, t) {
    c.drawImage(s.sky, 0, 0);
    if (s.tod === 'night' && s.w === 'sun') for (const [fx, fy, k] of STARS) {
      const x = Math.round(fx * s.PW), y = Math.round(fy * s.gy), tw = (Math.sin(t / 700 + k * 1.7 + fx * 9) + 1) / 2;
      if (k === 0 && tw > .4) { R(c, x - 1, y, 3, 1, '#fff6c8'); R(c, x, y - 1, 1, 3, '#fff6c8'); } else R(c, x, y, 1, 1, tw > .5 ? '#fff6c8' : '#b8b7d8');
    }
    for (const cl of s.clouds) { const span = s.PW + cl.cv.width, x = ((cl.x * span + t / 1000 * cl.v + scroll * .03) % span) - cl.cv.width; c.drawImage(cl.cv, Math.round(x), Math.round(cl.y * s.gy)); }
    const a = { PW: s.PW, t, scroll, glow: [], w: s.w };
    s.layers.forEach((L, i) => {
      const off = Math.round(((scroll * L.v) % s.TW + s.TW) % s.TW);
      c.drawImage(L.cv, -off, 0); if (s.TW - off < s.PW) c.drawImage(L.cv, s.TW - off, 0);
      if (i === s.animAt && s.anim) s.anim(c, a);           // 會動的（浪、螢火蟲）畫在那一層上面、更近的層下面
    });
    if (s.fx) s.fx(c, a);                                    // 最前面的（飄花瓣、飄雪、蝴蝶、攤位的煙）
    return a.glow;
  }
  function lightsOnScreen(s, scroll) {                       // 晚上的燈：照捲動算現在在畫面哪裡
    const out = [];
    for (const L of s.lights) {
      const x = ((L.x - scroll * L.v) % s.TW + s.TW) % s.TW;
      for (const xx of [x - s.TW, x, x + s.TW]) if (xx > -L.r && xx < s.PW + L.r) out.push({ ...L, sx: xx });
    }
    return out;
  }
  window.DCOutdoor = { SCENES, ORDER, build, draw, lightsOnScreen, label: k => (SCENES[k] || SCENES.park).label };
})();
