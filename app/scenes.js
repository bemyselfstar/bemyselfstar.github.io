// DeskCat 手機網頁：把「那一刻」畫成一張像素小圖（信箱的明信片、旅行日記、動態照片牆共用）。
// 2026-10-14 使用者：動態、明信片、旅行日記「不能作成流水帳」→ 每一封＝一張畫＋一件最精彩的事。
// 伺服器只存「哪一種事＋數字、名字」，畫面在這裡照種類擺出來：毛孩用遊戲影格（某個動作的第一格），背景、小道具用程式畫。
(window.DC_BUILD = window.DC_BUILD || {})['scenes.js'] = 63;   // 版本戳記（mobile/tools/bump.py 一起加 1；不一樣＝手機有舊檔）
(() => {
  'use strict';
  const SPR = window.FAKE_SPRITES;
  const imgs = {};
  function img(file) {
    if (!imgs[file]) { imgs[file] = new Image(); imgs[file].src = file; }
    return imgs[file];
  }
  const info = s => SPR.pets[s] || SPR.pets['橘虎斑'];
  const isDog = s => info(s).species === 'dog';
  const anim = (s, want) => { const d = info(s); for (const a of [].concat(want)) if (d.anims[a]) return a; return 'sit'; };
  function ready(sprites) {
    return Promise.all([...sprites.map(s => img(info(s).file)), ...FURN_NAMES.map(furnImg)].map(im =>
      im.complete && im.naturalWidth ? null : new Promise(r => { im.addEventListener('load', r, { once: true }); im.addEventListener('error', r, { once: true }); })));
  }

  // ---------- 畫圖小工具（畫在傳進來的 c 上） ----------
  const OL = '#3a2a1e';
  const R = (c, x, y, w, h, col) => { c.fillStyle = col; c.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h)); };
  function E(c, cx, cy, rx, ry, col) {
    c.fillStyle = col;
    for (let dy = -ry; dy <= ry; dy++) {
      const hw = Math.round(rx * Math.sqrt(Math.max(0, 1 - (dy * dy) / (ry * ry))));
      c.fillRect(Math.round(cx - hw), Math.round(cy + dy), hw * 2, 1);
    }
  }
  function pet(c, s, a, x, y, flip, dy = 0) {     // x＝中心、y＝腳踩的地方
    const d = info(s), im = img(d.file), [row] = d.anims[anim(s, a)];
    const px = Math.round(x - d.w / 2), py = Math.round(y - d.h + dy);
    if (!dy) E(c, x, y - 1, Math.round(d.w * .22), 2, 'rgba(40,20,10,.22)');
    c.save();
    if (flip) { c.translate(px + d.w, py); c.scale(-1, 1); c.drawImage(im, 0, row * d.h, d.w, d.h, 0, 0, d.w, d.h); }
    else c.drawImage(im, 0, row * d.h, d.w, d.h, px, py, d.w, d.h);
    c.restore();
  }
  function heart(c, x, y, col = '#ff6b8a') {
    x = Math.round(x); y = Math.round(y); c.fillStyle = col;
    c.fillRect(x - 3, y, 2, 2); c.fillRect(x + 1, y, 2, 2); c.fillRect(x - 3, y + 1, 6, 2); c.fillRect(x - 2, y + 3, 4, 1); c.fillRect(x - 1, y + 4, 2, 1);
  }
  function star(c, x, y, col = '#ffd84a') { R(c, x, y - 2, 1, 5, col); R(c, x - 2, y, 5, 1, col); }
  function zzz(c, x, y) {
    c.fillStyle = '#f4f1e8';
    [[0, 0, 4], [5, -5, 3], [9, -9, 2]].forEach(([dx, dy, s]) => {
      c.fillRect(x + dx, y + dy, s, 1); c.fillRect(x + dx, y + dy + s - 1, s, 1);
      for (let i = 0; i < s; i++) c.fillRect(x + dx + s - 1 - i, y + dy + i, 1, 1);
    });
  }
  function bang(c, x, y, col = '#e8504a') { R(c, x, y, 2, 6, col); R(c, x, y + 8, 2, 2, col); }

  // ---------- 小道具 ----------
  const PROPS = {
    ball(c, x, y) { E(c, x, y - 3, 3, 3, OL); E(c, x, y - 3, 2, 2, '#e8504a'); R(c, x - 1, y - 4, 1, 1, '#fff'); },
    bowl(c, x, y) { E(c, x, y - 3, 7, 3, OL); E(c, x, y - 3, 6, 2, '#5b8fd1'); E(c, x, y - 4, 4, 1, '#a8734d'); },
    wand(c, x, y) { for (let i = 0; i < 18; i++) R(c, x + i, y - i * .8, 1, 1, '#7a4f33'); R(c, x + 17, y - 18, 1, 8, '#ddd'); R(c, x + 15, y - 11, 5, 4, '#e86b8a'); },
    rope(c, x, y) { for (let i = -10; i <= 10; i++) R(c, x + i, y - 9 + (i % 2 ? 1 : 0), 1, 2, i % 3 ? '#e8504a' : '#f4f1e8'); },
    bag(c, x, y) { R(c, x - 5, y - 8, 10, 8, OL); R(c, x - 4, y - 7, 8, 6, '#6a9fd4'); R(c, x - 2, y - 10, 4, 2, OL); R(c, x - 1, y - 5, 2, 2, '#f2d27a'); },
    yarn(c, x, y) { E(c, x, y - 4, 4, 4, OL); E(c, x, y - 4, 3, 3, '#e86b8a'); R(c, x - 2, y - 5, 4, 1, '#f4a3b8'); R(c, x - 1, y - 3, 3, 1, '#f4a3b8'); R(c, x + 4, y - 1, 5, 1, '#e86b8a'); },
    fish(c, x, y) { E(c, x, y - 3, 5, 3, OL); E(c, x, y - 3, 4, 2, '#78b7d8'); R(c, x + 5, y - 6, 2, 6, OL); R(c, x + 5, y - 5, 1, 4, '#78b7d8'); R(c, x - 3, y - 4, 1, 1, OL); },
    gift(c, x, y) { R(c, x - 5, y - 9, 10, 9, OL); R(c, x - 4, y - 8, 8, 7, '#e8504a'); R(c, x - 1, y - 8, 2, 7, '#f2d27a'); R(c, x - 4, y - 6, 8, 1, '#f2d27a'); R(c, x - 3, y - 11, 6, 2, '#f2d27a'); },
  };
  const SOUVENIR = { yarn: '毛線球', fish: '魚玩偶', ball: '小球' };

  // ---------- 口袋撿到的紀念品（2026-10-14 使用者選「口袋帶回紀念品」）----------
  // 撿到什麼看天氣、時間：集齊要在不同天氣、時間帶牠出門。draw(c, x, y)：x＝中心、y＝放在地上的那一列，大約 9×9。
  // 口袋步道上、家裡的紀念品架、圖鑑都用這一份。
  const ITEMS = {
    pebble: { name: '漂亮石頭', when: '隨時都有', ok: () => true,
      draw(c, x, y) { E(c, x, y - 3, 4, 3, OL); E(c, x, y - 3, 3, 2, '#9fb3c8'); R(c, x - 2, y - 5, 2, 1, '#e3edf6'); } },
    flower: { name: '小花', when: '晴天的白天', ok: (w, t) => w === 'sun' && (t === 'morning' || t === 'day'),
      draw(c, x, y) { R(c, x, y - 5, 1, 5, '#4f9c5a'); R(c, x + 1, y - 3, 2, 1, '#4f9c5a');
        [[-2, -8], [1, -8], [-2, -5], [1, -5]].forEach(([dx, dy]) => R(c, x + dx, y + dy, 2, 2, '#f28fb0')); R(c, x - 1, y - 7, 2, 2, '#f4d35e'); } },
    feather: { name: '羽毛', when: '早上或白天', ok: (w, t) => t === 'morning' || t === 'day',
      draw(c, x, y) { for (let i = 0; i < 8; i++) { R(c, x - 3 + i, y - 1 - i, 1, 1, '#8a7a6c'); R(c, x - 3 + i, y - 3 - i, 1, 2, '#f4f1e8'); R(c, x - 2 + i, y - 1 - i, 1, 2, '#dfe6ee'); } } },
    pinecone: { name: '松果', when: '陰天', ok: w => w === 'cloud',
      draw(c, x, y) { E(c, x, y - 4, 3, 4, OL); E(c, x, y - 4, 2, 3, '#8f5f40'); for (let i = 0; i < 3; i++) R(c, x - 2, y - 6 + i * 2, 4, 1, '#c9955e'); R(c, x, y - 9, 1, 2, '#4f6a45'); } },
    leaf: { name: '楓葉', when: '傍晚', ok: (w, t) => t === 'evening',
      draw(c, x, y) { R(c, x, y - 2, 1, 2, '#7a3a20'); R(c, x - 3, y - 6, 7, 3, '#d9534f'); R(c, x - 1, y - 8, 3, 2, '#d9534f'); R(c, x - 4, y - 5, 1, 1, '#d9534f'); R(c, x + 4, y - 5, 1, 1, '#d9534f'); R(c, x, y - 7, 1, 4, '#f0a05a'); } },
    snail: { name: '蝸牛殼', when: '下雨天', ok: w => w === 'rain',
      draw(c, x, y) { E(c, x, y - 4, 4, 4, OL); E(c, x, y - 4, 3, 3, '#e8b86b'); R(c, x - 1, y - 5, 2, 2, '#b07a3a'); R(c, x, y - 4, 1, 1, '#e8b86b'); } },
    glow: { name: '發光石', when: '晚上', ok: (w, t) => t === 'night',
      draw(c, x, y) { E(c, x, y - 3, 4, 3, OL); E(c, x, y - 3, 3, 2, '#9be7d8'); R(c, x - 1, y - 5, 2, 1, '#e8fffa'); R(c, x - 5, y - 8, 1, 1, '#c8fff3'); R(c, x + 5, y - 7, 1, 1, '#c8fff3'); } },
  };
  const ITEM_ORDER = ['pebble', 'flower', 'feather', 'pinecone', 'leaf', 'snail', 'glow'];
  function pickItem(weather, tod) {             // 這個天氣、時間撿得到的；石頭最常見，其他的比較常出現
    const can = ITEM_ORDER.filter(k => k !== 'pebble' && ITEMS[k].ok(weather, tod));
    return can.length && Math.random() < .75 ? can[Math.floor(Math.random() * can.length)] : 'pebble';
  }

  // ---------- 背景 ----------
  // 好友家的家具（2026-10-16）：跟自己家一樣用正式家具圖（art/furniture/，docs/美術/家具美術規格.md），1 格＝1 像素、跟毛孩同比例。
  // 每一家照名字固定一種擺法；家具靠牆、在毛孩後面，超出畫面的就切掉（不縮小，比例才對）。win＝窗戶在哪（寬度的幾成）
  const FURN_NAMES = ['sofa', 'plant', 'shelf', 'cattree', 'armchair'];
  const furnImg = n => img(`art/furniture/${n}.png`);
  const LAYOUTS = [
    { win: .10, items: [['sofa', .80]] },                     // 沙發家
    { win: .34, items: [['plant', .07], ['shelf', .88]] },    // 書櫃家
    { win: .44, items: [['cattree', .13], ['armchair', .90]] },   // 貓跳台家
  ];
  const HOME_LAYOUT = { win: .30, items: [['plant', .07], ['sofa', .80]] };   // 自己家（照片牆裡自己的動態）：跟家裡一樣有盆栽、沙發（立燈太高，畫面裡只剩一根桿子，不用）
  const hashOf = name => { let h = 7; for (const ch of String(name || '')) h = (h * 131 + ch.charCodeAt(0)) >>> 0; return h; };
  function putFurn(c, n, x, y) {
    const im = furnImg(n);
    if (im.naturalWidth) c.drawImage(im, Math.round(x - im.naturalWidth / 2), Math.round(y - im.naturalHeight));
  }
  const TONES = [['#efdcc4', '#c48a58', '#b98050'], ['#d9e6d0', '#b98a5e', '#a97a4e'], ['#e7d6ec', '#c79a6a', '#b78a5a'], ['#f2e2b8', '#a8734d', '#986340']];
  const toneOf = name => { let h = 0; for (const ch of String(name || '')) h = (h * 31 + ch.charCodeAt(0)) >>> 0; return TONES[h % TONES.length]; };
  function room(c, w, h, house) {          // 好友家（照名字換牆、地板的顏色）
    const [wall, f1, f2] = toneOf(house), wy = Math.round(h * .5);
    R(c, 0, 0, w, wy, wall);
    for (let x = 3; x < w; x += 10) R(c, x, 4, 1, wy - 10, 'rgba(150,100,70,.10)');
    R(c, 0, wy - 4, w, 4, '#8f5f40');
    for (let y = wy, i = 0; y < h; y += 5, i++) { R(c, 0, y, w, 5, i % 2 ? f2 : f1); for (let x = (i * 17) % 30; x < w; x += 30) R(c, x, y, 1, 5, 'rgba(0,0,0,.12)'); }
    const lay = house === '__home__' ? HOME_LAYOUT : LAYOUTS[hashOf(house) % LAYOUTS.length];
    const ww = 26, wx = Math.round(w * lay.win);
    R(c, wx - 2, 6, ww + 4, 20, '#7a4f33'); R(c, wx, 8, ww, 16, '#93cbee'); R(c, wx + ww / 2 - 1, 8, 1, 16, '#7a4f33');
    for (const [n, fx] of lay.items) putFurn(c, n, w * fx, wy + 8);   // 靠牆：腳踩在牆腳前一點
  }
  function outdoor(c, w, h) {              // 出發：家門口的路
    const gy = Math.round(h * .62);
    R(c, 0, 0, w, gy, '#a9d6ef'); R(c, 0, Math.round(gy * .55), w, gy - Math.round(gy * .55), '#c7e5f3');
    E(c, w * .78, 14, 8, 3, '#fff'); E(c, w * .3, 22, 10, 3, '#fff');
    R(c, 0, gy - 12, w, 12, '#7fbf73'); R(c, 0, gy, w, h - gy, '#d8c8a8');
    for (let x = 0; x < w; x += 14) R(c, x, gy + 6, 8, 2, '#c4b292');
    const hx = Math.round(w * .08);                       // 自己家的門
    R(c, hx - 1, gy - 46, 34, 46, OL); R(c, hx, gy - 45, 32, 45, '#f2e1ca'); R(c, hx + 8, gy - 30, 14, 30, '#b9825a'); R(c, hx + 18, gy - 16, 2, 2, '#f2d27a');
    for (let i = 0; i < 6; i++) R(c, hx - 4 + i, gy - 52 - i * 1.5, 40 - i * 2, 2, i % 2 ? '#c9564f' : '#b8433b');
  }
  function home(c, w, h) { room(c, w, h, '__home__'); }

  // ---------- 種類 → 怎麼擺 ----------
  // 好友家發生的事（明信片、旅行日記第 2 頁）：只挑一件最精彩的（照這個順序）
  const VISIT_ORDER = ['pile', 'tug', 'nuzzle', 'play', 'groom', 'sniff', 'pet', 'fed'];
  function visitHighlight(d) { return VISIT_ORDER.find(k => (parseInt(d[k], 10) || 0) > 0) || 'quiet'; }
  function visitCast(key, me, hosts, w, h) {
    const y = h - 10, cx = w / 2, h0 = hosts[0] || me, h1 = hosts[1];
    const cast = [], props = [], fx = [];
    const add = (s, a, x, flip, dy) => cast.push({ s, a, x, flip, dy });
    switch (key) {
      case 'pile':
        if (h1) add(h1, isDog(h1) ? 'sleep' : 'pile_sleep', cx + 22, true);
        add(h0, isDog(h0) ? 'sleep' : 'pile_sleep', cx - 18, false);
        add(me, isDog(me) ? 'sleep' : 'pile_sleep', cx + 2, false, -5);
        fx.push({ k: 'zzz', x: cx + 14, y: y - 34 }); break;
      case 'tug':
        add(me, isDog(me) ? 'play_bow' : 'crouch', cx - 24, false); add(h0, isDog(h0) ? 'play_bow' : 'crouch', cx + 24, true);
        props.push({ k: 'rope', x: cx, y, top: true }); break;
      case 'nuzzle':
        add(me, 'nuzzle', cx - 11, false); add(h0, 'nuzzle', cx + 11, true);
        fx.push({ k: 'heart', x: cx, y: y - 36 }, { k: 'heart', x: cx + 7, y: y - 44 }); break;
      case 'play':
        add(h0, 'run', cx + 22, false); add(me, 'run', cx - 20, false);
        fx.push({ k: 'star', x: cx + 2, y: y - 30 }); break;
      case 'groom':
        add(h0, isDog(h0) ? 'loaf' : 'loaf', cx + 12, true); add(me, isDog(me) ? 'nuzzle' : 'groom_other', cx - 14, false);
        fx.push({ k: 'heart', x: cx, y: y - 34 }); break;
      case 'sniff': {
        const dog = hosts.find(isDog) || h0;
        add(me, 'sit', cx + 16, true); add(dog, isDog(dog) ? 'sniff' : 'nuzzle', cx - 20, false);
        fx.push({ k: 'bang', x: cx + 14, y: y - 44 }); break;
      }
      case 'pet':
        add(me, 'belly', cx, false); fx.push({ k: 'heart', x: cx - 6, y: y - 30 }, { k: 'heart', x: cx + 6, y: y - 38 }); break;
      case 'fed':
        add(me, 'eat', cx - 6, false); props.push({ k: 'bowl', x: cx + 16, y }); break;
      default:
        add(me, 'loaf', cx + 10, true); if (h0 !== me) add(h0, 'sit', cx - 26, false);
    }
    return { cast, props, fx };
  }
  // 動態（照片牆）：每種趣事怎麼擺
  function momentCast(kind, sp, w, h) {
    const y = h - 10, cx = w / 2, cast = [], props = [], fx = [];
    const add = (s, a, x, flip, dy) => cast.push({ s, a, x, flip, dy });
    const [a, b, c2] = sp;
    switch (kind) {
      case 'pile_crash':
        add(b || a, isDog(b || a) ? 'sulk' : 'tail_flick', cx + 24, true); add(a, 'fall', cx - 8, false, -6);
        if (c2) add(c2, isDog(c2) ? 'sulk' : 'hiss', cx - 30, false);
        fx.push({ k: 'star', x: cx - 6, y: y - 40 }, { k: 'star', x: cx + 4, y: y - 46 }); break;
      case 'tug':
        add(a, isDog(a) ? 'play_bow' : 'crouch', cx - 22, false); add(b || a, isDog(b || a) ? 'sulk' : 'crouch', cx + 24, true);
        props.push({ k: 'rope', x: cx, y, top: true }); fx.push({ k: 'star', x: cx - 30, y: y - 40 }); break;
      case 'dogride':
        add(b || a, 'walk', cx, false); add(a, 'loaf', cx + 2, false, -Math.round(info(b || a).h * .42)); break;
      case 'catch':
        add(a, 'jump', cx - 8, false, -8); props.push({ k: 'wand', x: cx + 4, y: y - 14 }); break;
      case 'new_cat':
        add(a, isDog(a) ? 'sit_wag' : 'sit', cx, false);
        for (let i = 0; i < 9; i++) fx.push({ k: 'conf', x: 10 + (i * 37) % (w - 20), y: 6 + (i * 23) % 30, c: ['#e8504a', '#f2d27a', '#78b7d8', '#6bbf73'][i % 4] });
        break;
      case 'hunt_crash':
        add(a, 'jump', cx - 12, false, -10); add(b || a, 'jump', cx + 12, true, -10);
        fx.push({ k: 'star', x: cx, y: y - 44 }, { k: 'star', x: cx - 6, y: y - 50 }, { k: 'star', x: cx + 7, y: y - 48 }); break;
      case 'ambush':
        add(b || a, 'sit', cx + 20, true); add(a, 'crouch', cx - 22, false); fx.push({ k: 'bang', x: cx + 18, y: y - 44 }); break;
      case 'follow':
        add(b || a, 'walk', cx + 18, false); add(a, 'walk', cx - 16, false); break;
      case 'trip_back':
        add(a, 'walk', cx, true); props.push({ k: 'gift', x: cx + 22, y }); break;
      case 'gacha':
        add(a, 'sit', cx, false); for (let i = 0; i < 4; i++) fx.push({ k: 'star', x: cx - 20 + i * 13, y: y - 40 - (i % 2) * 8 }); break;
      default: add(a, 'sit', cx, false);
    }
    return { cast, props, fx };
  }

  // ---------- 畫出來 ----------
  // spec：{ bg: 'room'|'outdoor'|'home', house, cast, props, fx, hearts（按 🐾 之後：主角頭上冒愛心） }
  function paint(cv, spec) {
    const w = cv.width, h = cv.height, c = cv.getContext('2d');
    c.imageSmoothingEnabled = false; c.clearRect(0, 0, w, h);
    ({ room: () => room(c, w, h, spec.house), outdoor: () => outdoor(c, w, h), home: () => home(c, w, h) })[spec.bg || 'room']();
    const y = h - 10;
    const things = [...(spec.props || []).map(p => ({ z: p.top ? 99 : 0, f: () => PROPS[p.k](c, p.x, p.y) })),   // top：畫在毛孩上面（背在背上的包包）
                    ...(spec.cast || []).map((p, i) => ({ z: 1 + i, f: () => pet(c, p.s, p.a, p.x, y, p.flip, p.dy || 0) }))];
    things.sort((a, b) => a.z - b.z).forEach(t => t.f());
    for (const f of spec.fx || []) {
      if (f.k === 'heart') heart(c, f.x, f.y); else if (f.k === 'star') star(c, f.x, f.y); else if (f.k === 'zzz') zzz(c, f.x, f.y);
      else if (f.k === 'bang') bang(c, f.x, f.y); else if (f.k === 'conf') R(c, f.x, f.y, 2, 2, f.c);
    }
    if (spec.hearts && spec.cast && spec.cast.length) {     // 按了 🐾：照片裡的主角冒愛心
      const p = spec.cast[spec.cast.length - 1], top = y - info(p.s).h * .8 + (p.dy || 0);
      heart(c, p.x - 6, top - 2); heart(c, p.x + 5, top - 9); heart(c, p.x - 1, top - 16, '#ff8fa6');
    }
  }
  function draw(cv, spec) {
    const sprites = (spec.cast || []).map(p => p.s);
    paint(cv, spec);                                         // 圖還沒載入時先畫背景
    ready(sprites).then(() => paint(cv, spec));
  }

  window.DCScene = { draw, visitHighlight, visitCast, momentCast, PROPS, SOUVENIR, ITEMS, ITEM_ORDER, pickItem, isDog, size: s => info(s), tone: name => toneOf(name)[0] };
})();
