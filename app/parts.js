// DeskCat 手機網頁：毛孩「零件包」換色＋組圖（P75 第 1 期交給 📱；2026-10-20 手機線）。
// 電腦的畫圖程式當母版，美術線匯出「著色本」（每個像素記『哪個顏色的第幾階』）；這裡照玩家的顏色填色，
// 結果跟電腦版逐像素一樣。格式：docs/美術/零件包格式.md；照翻 tools/parts_color.py（換色）＋ tools/parts_phone_ref.py（組圖），
// 那兩支是美術線的、改了這裡要跟著改。對答案：python 不用，node mobile/tools/parts_check.js（320 份 check.json 全部 0 誤差）。
// Qt 每個顏色存 16 位元、用 32 位元小數算 → 每一步都 Math.fround（f32）；兩個 f32 加減乘除先用 double 算再 fround＝跟 float32 一樣。
// 用法（網頁）：const pet = await DCParts.load('parts/薩摩耶_adult/')；DCParts.compose(pet, look, stripes) → ImageData 大小的 RGBA。
(window.DC_BUILD = window.DC_BUILD || {})['parts.js'] = 55;   // 版本戳記（mobile/tools/bump.py 一起加 1；不一樣＝手機有舊檔）
(() => {
  'use strict';
  const f32 = Math.fround, U = 65535;

  function qround(d) {                    // Qt 6 的 qRound＝真正的四捨五入（先在 float32，再精確四捨五入）
    d = f32(d);
    return d >= 0 ? Math.floor(d + 0.5) : -Math.floor(-d + 0.5);
  }
  function fuzzyEq(a, b) {
    a = f32(a); b = f32(b);
    return f32(Math.abs(f32(a - b)) * f32(100000)) <= Math.min(Math.abs(a), Math.abs(b));
  }
  const div257 = x => (x + 128 - ((x + 128) >> 8)) >> 8;   // 16 位元 → 8 位元（Qt 的 qt_div_257）
  const pyMod1 = x => { const m = x % 1; return m < 0 ? m + 1 : m; };   // Python 的 x % 1（負數也回 0～1）
  const pyInt = x => Math.trunc(x) + 0;  // Python 的 int()：往 0 捨去（+0 去掉 -0）

  // ---------- 跟 QColor 一樣：spec＝'rgb'／'hsl'／'hsv'，數值 0～65535（色相 0～35999，沒有色相＝65535） ----------
  class C {
    constructor(spec, a, b, c) { this.spec = spec; this.v = [a, b, c]; }
    static hex(h) {
      h = h.replace(/^#/, '');
      return new C('rgb', parseInt(h.slice(0, 2), 16) * 0x101, parseInt(h.slice(2, 4), 16) * 0x101, parseInt(h.slice(4, 6), 16) * 0x101);
    }
    static from8(r, g, b) { return new C('rgb', r * 0x101, g * 0x101, b * 0x101); }
    toRgb() {
      if (this.rgbC) return this.rgbC;
      return (this.rgbC = this.spec === 'rgb' ? this : this.spec === 'hsl' ? this._hslToRgb() : this._hsvToRgb());
    }
    _hslToRgb() {
      const [hue, sat, li] = this.v;
      if (sat === 0 || hue === U) return new C('rgb', li, li, li);
      if (li === 0) return new C('rgb', 0, 0, 0);
      const h = hue === 36000 ? 0 : f32(f32(hue) / f32(36000));
      const s = f32(f32(sat) / f32(U)), l = f32(f32(li) / f32(U));
      const t2 = l < f32(0.5) ? f32(l * f32(f32(1) + s)) : f32(f32(l + s) - f32(l * s));
      const t1 = f32(f32(f32(2) * l) - t2);
      const third = f32(f32(1) / f32(3));
      const out = [];
      for (let t of [f32(h + third), h, f32(h - third)]) {
        if (t < 0) t = f32(t + 1);
        else if (t > 1) t = f32(t - 1);
        const six = f32(t * f32(6));
        let x;
        if (six < 1) x = f32(t1 + f32(f32(t2 - t1) * six));
        else if (f32(t * f32(2)) < 1) x = t2;
        else if (f32(t * f32(3)) < 2) x = f32(t1 + f32(f32(f32(t2 - t1) * f32(f32(f32(2) / f32(3)) - t)) * f32(6)));
        else x = t1;
        const v = qround(f32(x * f32(U)));
        out.push(v === 1 ? 0 : v);
      }
      return new C('rgb', out[0], out[1], out[2]);
    }
    _hsvToRgb() {
      const [hue, sat, val] = this.v;
      if (sat === 0 || hue === U) return new C('rgb', val, val, val);
      const h = hue === 36000 ? 0 : f32(f32(hue) / f32(6000));
      const s = f32(f32(sat) / f32(U)), v = f32(f32(val) / f32(U));
      const i = Math.trunc(h), fr = f32(h - f32(i)), p = f32(v * f32(f32(1) - s));
      let r, g, b;
      if (i & 1) {
        const q = f32(v * f32(f32(1) - f32(s * fr)));
        [r, g, b] = { 1: [q, v, p], 3: [p, q, v], 5: [v, p, q] }[i];
      } else {
        const t = f32(v * f32(f32(1) - f32(s * f32(f32(1) - fr))));
        [r, g, b] = { 0: [v, t, p], 2: [p, v, t], 4: [t, p, v] }[i];
      }
      return new C('rgb', qround(f32(r * f32(U))), qround(f32(g * f32(U))), qround(f32(b * f32(U))));
    }
    // RGB → HSL／HSV：照 Qt 6.11 qcolor.cpp（16 位元整數的最大、最小值）
    static _hue16(r, g, b, mx, chroma) {
      let hue;
      if (mx === r) { hue = f32(0 + f32(f32(g - b) / chroma)); if (hue < 0) hue = f32(hue + f32(6)); }
      else if (mx === g) hue = f32(f32(2) + f32(f32(b - r) / chroma));
      else hue = f32(f32(4) + f32(f32(r - g) / chroma));
      return qround(f32(hue * f32(6000)));
    }
    toHsl() {
      if (this.spec === 'hsl') return this;
      const [r, g, b] = this.toRgb().v, mn = Math.min(r, g, b), mx = Math.max(r, g, b);
      if (mn === mx) return new C('hsl', U, 0, mx);
      const chroma = f32(mx - mn), lightness = f32(f32(0.5) * f32(mx + mn));
      const sat = f32(f32(f32(0.5) * chroma) / Math.min(lightness, f32(f32(U) - lightness)));
      return new C('hsl', C._hue16(r, g, b, mx, chroma), qround(f32(sat * f32(U))), qround(lightness));
    }
    toHsv() {
      if (this.spec === 'hsv') return this;
      const [r, g, b] = this.toRgb().v, mn = Math.min(r, g, b), mx = Math.max(r, g, b);
      if (mn === mx) return new C('hsv', U, 0, mx);
      const chroma = f32(mx - mn);
      return new C('hsv', C._hue16(r, g, b, mx, chroma), qround(f32(f32(chroma / f32(mx)) * f32(U))), mx);
    }
    convert(spec) {                       // 跟 parts_color.C.convert 一樣：一律先回 RGB 再轉
      const rgb = this.toRgb();
      return spec === 'rgb' ? rgb : spec === 'hsl' ? rgb.toHsl() : rgb.toHsv();
    }
    lighter(factor) {
      if (factor < 100) return this.darker(Math.floor(10000 / factor));
      const hsv = this.spec === 'rgb' || this.spec === 'hsv' ? this.toHsv() : this.toRgb().toHsv();
      let [hue, s, v] = hsv.v;
      v = Math.floor(factor * v / 100);
      if (v > U) { s = Math.max(0, s - (v - U)); v = U; }
      return new C('hsv', hue, s, v).convert(this.spec);
    }
    darker(factor) {
      if (factor < 100) return this.lighter(Math.floor(10000 / factor));
      const hsv = this.spec === 'rgb' || this.spec === 'hsv' ? this.toHsv() : this.toRgb().toHsv();
      const [hue, s, v] = hsv.v;
      return new C('hsv', hue, s, Math.floor(v * 100 / factor)).convert(this.spec);
    }
    rgb8() { return this.toRgb().v.map(div257); }
    hslF() {
      const [hue, s, l] = this.toHsl().v;
      return [hue === U ? -1 : f32(f32(hue) / f32(36000)), f32(f32(s) / f32(U)), f32(f32(l) / f32(U))];
    }
    name() { return '#' + this.rgb8().map(x => x.toString(16).padStart(2, '0')).join(''); }
  }

  function fromHslF(h, s, l) {
    h = f32(h); s = f32(s); l = f32(l);
    const hue = fuzzyEq(h, -1) ? U : qround(f32(h * f32(36000)));
    return new C('hsl', hue, qround(f32(s * f32(U))), qround(f32(l * f32(U))));
  }

  // ---------- 遊戲畫圖程式（cat_art_px）的換色：parts_color 下半段照翻 ----------
  function hsl(c, dh, ds, dl) {           // cat_art_px._hsl（這裡用 double 算，跟 Python 一樣）
    let [h, s, l] = c.hslF();
    if (h < 0) h = 0;
    return fromHslF(pyMod1(h + dh), Math.max(0, Math.min(1, s * ds)), Math.max(0, Math.min(1, l + dl)));
  }
  const rampCache = new Map();
  function ramp(hex) {                    // 一個顏色 → 4 階（最暗、陰影、本色、亮）
    const k = hex.toLowerCase();
    if (rampCache.has(k)) return rampCache.get(k);
    const c = C.hex(hex), li = c.hslF()[2];
    let out;
    if (li < 0.25) out = [c.darker(125), c, hsl(c, 0, 1, 0.05), hsl(c, 0, 1, 0.12)];
    else if (li > 0.85) {
      const hue = c.hslF()[0];
      out = [hsl(c, hue >= 0 ? 0.58 - hue : 0.6, 0.6, -0.22), hsl(c, 0, 1, -0.10), c, c.lighter(103)];
    } else out = [hsl(c, -0.018, 1.0, -0.19), hsl(c, -0.008, 1.0, -0.08), c, hsl(c, 0.006, 0.95, 0.06)];
    rampCache.set(k, out);
    return out;
  }
  function creamRamp(bellyHex) {          // 白毛（肚子很白 > 0.9 另一套）
    const b = C.hex(bellyHex);
    if (b.hslF()[2] > 0.9) return [hsl(b, 0, 1, -0.18), hsl(b, 0, 1, -0.08), b, C.hex('#ffffff')];
    return ramp(bellyHex);
  }
  function lum(c) { const [r, g, b] = c.rgb8(); return 0.299 * r + 0.587 * g + 0.114 * b; }
  function outline(furHex) { const fur = C.hex(furHex); return lum(fur) < 70 ? C.hex('#0d0d10') : fur.darker(290); }
  function mixHex(a, b, t) {              // 8 位元、無條件捨去
    a = a.replace(/^#/, ''); b = b.replace(/^#/, '');
    let s = '#';
    for (let i = 0; i < 6; i += 2) {
      const p = parseInt(a.slice(i, i + 2), 16), q = parseInt(b.slice(i, i + 2), 16);
      s += pyInt(p + (q - p) * t).toString(16).padStart(2, '0');
    }
    return s;
  }
  function mixRgb(c, gray, t) {           // 熟齡灰白：int(c*(1-t) + gray*t)
    const p = c.rgb8(), q = gray.rgb8();
    return C.from8(pyInt(p[0] * (1 - t) + q[0] * t), pyInt(p[1] * (1 - t) + q[1] * t), pyInt(p[2] * (1 - t) + q[2] * t));
  }
  function qkey(c) {                      // QColor == 比的東西：記法一樣、三個 16 位元數值一樣（HSV／HSL 色相取 % 36000）
    const v0 = c.spec === 'hsv' || c.spec === 'hsl' ? c.v[0] % 36000 : c.v[0];
    return c.spec + ':' + v0 + ':' + c.v[1] + ':' + c.v[2];
  }
  function vote(cs) {                     // 補小洞：出現最多的贏、一樣多選前面的
    const ks = cs.map(qkey);
    let best = 0, bestN = -1;
    ks.forEach((k, i) => { const n = ks.filter(x => x === k).length; if (n > bestN) { best = i; bestN = n; } });
    return cs[best];
  }
  function seniorFade(c) {
    const [h, s, l] = c.hslF();
    return fromHslF(Math.max(0, h), s * 0.8, Math.min(1, l + 0.02));
  }
  function isPink(hex) {                  // AI 圖裡的粉紅、紅（舌頭、肚皮…）不跟著毛色換
    const [h, s, l] = C.hex(hex).hslF(), deg = h >= 0 ? h * 360 : -1;
    if (s < 0.25 || l > 0.93 || deg < 0) return false;
    if (l < 0.35) return deg >= 320;
    return deg >= 320 || deg <= 10;
  }
  const SENIOR_GRAY = '#dcdcd8';

  // ---------- 一隻毛孩（look 的顏色）→ 每個代號的顏色（parts_color.Palette） ----------
  class Palette {
    constructor(look, ref, keep, darkFaceLine) {
      this.look = look;
      this.ref = ref || null;
      this.keep = new Set((keep || []).map(k => k.toLowerCase()));
      this.darkFaceLine = darkFaceLine || '#9a9aa2';
      this.cache = new Map();
      const furHex = look.fur ?? '#f0a04e', bellyHex = look.belly ?? '#fff6ea';
      this.fur = ramp(furHex);
      this.cream = creamRamp(bellyHex);
      this.ink = outline(furHex);
      this.dark = C.hex(furHex).hslF()[2] < 0.25;     // 黑色毛：不畫條紋、線換亮的
      const preset = look.preset ?? null;
      this.aiDefault = this.ref !== null && (preset === null || preset === (look.breed ?? null));
      this.aiPairs = null;
    }
    base(lab) {
      const k = lab[0], lk = this.look;
      switch (k) {
        case 'R': return ramp(lk[lab[1]])[lab[2]];
        case 'C': return this.cream[lab[1]];
        case 'M': {
          const fur = lk.fur ?? '#f0a04e', belly = lk.belly ?? '#fff6ea';
          const hx = { S: () => mixHex(fur, belly, 0.5), D: () => mixHex(fur, '#000000', 0.35), K: () => mixHex(fur, '#141414', 0.78) }[lab[1]]();
          return ramp(hx)[lab[2]];
        }
        case 'ink': return this.ink;
        case 'inkl': return this.ink.lighter(170);
        case 'line': return this.dark ? this.ink.lighter(170) : this.ink;
        case 'dline': return this.dark ? this.fur[3] : this.ink;
        case 'eye': {
          let c = C.hex(lk.eye ?? '#8fbf3a');
          if (lab.length > 1) c = lab[1] === 'd' ? c.darker(lab[2]) : c.lighter(lab[2]);
          return c;
        }
        case 'paw': { const c2 = this.cream[2]; return lum(c2) > lum(this.fur[2]) - 10 ? c2 : c2.lighter(115); }
        case 'fix': return C.hex(lab[1]);
        case 'maj': return C.hex('#ff00ff');           // 補小洞的格子：先放洋紅，組圖最後照鄰居投票蓋掉
        case 'half': {
          const p = this.get(lab[1]).rgb8(), q = this.get(lab[2]).rgb8();
          return C.from8((p[0] + q[0]) >> 1, (p[1] + q[1]) >> 1, (p[2] + q[2]) >> 1);
        }
        case 'A': return this.ai(lab[1]);
        case 'Aline': {
          const line = this.ai(lab[1]), cover = this.ai(lab[2]);
          return lum(cover) < 90 && lum(line) < 110 ? C.hex(this.darkFaceLine) : line;
        }
        case 'Aeye': return this.aiDefault ? C.hex(lab[1]) : C.hex(lk.eye ?? '#3a2412');
        case 'SEN': return seniorFade(this.get(lab[1]));
        case 'SENG': return mixRgb(seniorFade(this.get(lab[1])), C.hex(SENIOR_GRAY), 0.68);
        case 'SAI': {
          const t = lab[1], src = this.get(lab[2]);
          if (this.keep.has(src.name())) return src;
          let c2 = seniorFade(src);
          const [h, s] = src.hslF();
          const pink = s > 0.3 && (h >= 330 / 360 || (0 <= h && h <= 10 / 360));
          if (t && lum(src) >= 60 && !pink) c2 = mixRgb(c2, C.hex(SENIOR_GRAY), t);
          return c2;
        }
      }
      throw new Error('零件包：不認得的代號 ' + JSON.stringify(lab));
    }
    get(lab) {
      const key = JSON.stringify(lab);
      let c = this.cache.get(key);
      if (!c) { c = this.base(lab); this.cache.set(key, c); }
      return c;
    }
    rgb(lab) { return this.get(lab).rgb8(); }
    pairs() {                             // AI 換色（cat_art_px._ai_pal）
      if (this.aiPairs) return this.aiPairs;
      const rf = ramp(this.ref.fur), rc = creamRamp(this.ref.belly), rk = outline(this.ref.fur);
      const fur = this.fur, cream = this.cream.slice(), ink = this.ink;
      const cool = c => { const v = c.rgb8(); return v[2] > v[0] + 20; };
      const skipC0 = cool(cream[0]) && !cool(cream[1]);
      for (const n of [0, 1]) {
        if (lum(rc[n]) > lum(rf[2]) && lum(cream[n]) < lum(fur[2])) {
          const t = (lum(rc[n]) - lum(rf[2])) / Math.max(1.0, lum(rc[2]) - lum(rf[2]));
          cream[n] = C.hex(mixHex(fur[2].name(), cream[2].name(), t));
        }
      }
      const a0 = rf[0].rgb8(), k0 = rk.rgb8();
      const useF0 = !cool(rf[0]) && !cool(fur[0]) && Math.max(...a0.map((p, i) => Math.abs(p - k0[i]))) <= 8;
      const pairs = [];
      rf.forEach((q, n) => { if (n || useF0) pairs.push([q, fur[n]]); });
      rc.forEach((q, n) => { if (n || !skipC0) pairs.push([q, cream[n]]); });
      pairs.push([rk, ink]);
      return (this.aiPairs = pairs);
    }
    ai(hexv) {
      if (this.aiDefault || this.keep.has(hexv.toLowerCase()) || isPink(hexv)) return C.hex(hexv);
      const a = C.hex(hexv), ar = a.rgb8();
      let best = null, bestD = Infinity;
      for (const pq of this.pairs()) {   // 最接近的一階（一樣近選前面的）
        const s = pq[0].rgb8(), d = (s[0] - ar[0]) ** 2 + (s[1] - ar[1]) ** 2 + (s[2] - ar[2]) ** 2;
        if (d < bestD) { best = pq; bestD = d; }
      }
      const d = (lum(a) - lum(best[0])) * 0.6, dv = best[1].rgb8();
      return C.from8(...dv.map(ch => Math.max(0, Math.min(255, pyInt(ch + d)))));
    }
  }

  // ---------- 組圖（parts_phone_ref） ----------
  // pet＝{ meta: book.json, ids: { '0': Uint32Array, '1': … }（每個像素的代號＝R + G×256）, width, height }
  function stripeOn(look, stripes) { return !!stripes && C.hex(look.fur ?? '#f0a04e').hslF()[2] >= 0.25; }
  function pickBook(meta, look, stripes) { return meta.stripes_matter && stripeOn(look, stripes) ? '1' : '0'; }
  function palette(meta, look) {
    const ai = meta.ai || {};
    return new Palette(look, ai.ref, ai.keep, ai.dark_face_line);
  }
  function legendRgb(meta, look) { const pal = palette(meta, look); return meta.legend.map(L => pal.rgb(L)); }
  const at = (arr, i) => arr[i < 0 ? arr.length + i : i];   // Python 的負數索引

  function compose(pet, look, stripes) {  // → RGBA（Uint8ClampedArray，width×height×4），透明＝全 0
    const meta = pet.meta, pal = palette(meta, look), bk = pickBook(meta, look, stripes), ids = pet.ids[bk];
    const n = meta.legend.length, cols = new Uint32Array(n + 1);   // 代號 → 顏色（小端：R、G、B、A）
    meta.legend.forEach((L, i) => { const [r, g, b] = pal.rgb(L); cols[i + 1] = (r | (g << 8) | (b << 16) | (255 << 24)) >>> 0; });
    const out = new Uint8ClampedArray(pet.width * pet.height * 4), o32 = new Uint32Array(out.buffer);
    for (let i = 0; i < ids.length; i++) o32[i] = cols[ids[i]];
    const fills = (meta.fills || {})[bk] || {};
    for (const fk of Object.keys(fills)) {
      const [a, idx] = fk.split(':'), r = meta.anims[a][0], [w, h] = meta.frame_size[fk];
      const x0 = (+idx) * meta.w + Math.floor((meta.w - w) / 2), y0 = r * meta.h + (meta.h - h);
      for (const [x, y, lids] of fills[fk]) {
        const [cr, cg, cb] = vote(lids.map(l => pal.get(at(meta.legend, l - 1)))).rgb8();
        const p = ((y0 + y) * pet.width + x0 + x) * 4;
        out[p] = cr; out[p + 1] = cg; out[p + 2] = cb; out[p + 3] = 255;
      }
    }
    return out;
  }

  // 著色本 PNG 的 RGBA → 代號（B、A 不用）
  function idsFromRgba(rgba) {
    const n = rgba.length >> 2, ids = new Uint32Array(n);
    for (let i = 0; i < n; i++) ids[i] = rgba[i * 4] + rgba[i * 4 + 1] * 256;
    return ids;
  }

  // ---------- 網頁：讀一份著色本（book.json＋PNG） ----------
  async function readPng(url) {           // PNG 沒有色彩描述 → 不換色；保險起見叫瀏覽器不要換
    const blob = await (await fetch(url)).blob();
    let src;
    try { src = await createImageBitmap(blob, { colorSpaceConversion: 'none', premultiplyAlpha: 'none' }); }
    catch (_) {                           // 舊的 Safari 沒有 createImageBitmap 選項：用 <img>
      src = await new Promise((ok, bad) => { const im = new Image(); im.onload = () => ok(im); im.onerror = bad; im.src = URL.createObjectURL(blob); });
    }
    const w = src.width, h = src.height, cv = document.createElement('canvas');
    cv.width = w; cv.height = h;
    const cx = cv.getContext('2d', { willReadFrequently: true });
    cx.drawImage(src, 0, 0);
    return { w, h, rgba: cx.getImageData(0, 0, w, h).data };
  }
  async function load(dir) {              // dir＝著色本資料夾的網址（結尾有 /）
    const meta = await (await fetch(dir + 'book.json')).json();
    const pet = { meta, ids: {}, width: 0, height: 0, dir };
    for (const [k, f] of Object.entries(meta.books)) {
      const png = await readPng(dir + f);
      pet.ids[k] = idsFromRgba(png.rgba); pet.width = png.w; pet.height = png.h;
    }
    return pet;
  }
  function toCanvas(pet, rgba) {          // 組好的圖表 → canvas（一個動作一列，meta 的 w、h、anims）
    const cv = document.createElement('canvas');
    cv.width = pet.width; cv.height = pet.height;
    cv.getContext('2d').putImageData(new ImageData(rgba, pet.width, pet.height), 0, 0);
    return cv;
  }
  function frameRect(meta, anim, i) {     // 某一格在圖表裡的位置（底部置中，格子 w×h）
    const [r, n] = meta.anims[anim];
    return { x: (i % n) * meta.w, y: r * meta.h, w: meta.w, h: meta.h };
  }

  // ---------- 建立毛孩的小規則（零件包格式.md 4-1、choices.json 的 cfg_rule；年齡怎麼對到著色本等 P74 建立毛孩一起做） ----------
  const fixWhite = hex => (/^#?ffffff$/i.test(hex) ? '#fefefe' : hex);   // 毛色存成 #ffffff 時改存 #fefefe

  const api = { C, fromHslF, ramp, creamRamp, outline, mixHex, mixRgb, lum, qkey, vote, seniorFade, isPink, Palette,
    stripeOn, pickBook, palette, legendRgb, compose, idsFromRgba, load, toCanvas, frameRect, fixWhite };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;   // node mobile/tools/parts_check.js 用
  else window.DCParts = api;
})();
