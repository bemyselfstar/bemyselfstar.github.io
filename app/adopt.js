// DeskCat 手機網頁：在手機建立毛孩（P74 M2；2026-10-20 手機線）。只有手機、沒有電腦版的人也能養（Apple 4.2.3）。
// 新帳號登入、家裡一隻都沒有 → 這個畫面：（暱稱）→ 貓／狗 → 品種 → 花色 → 顏色（可以自己調）→ 名字 →〔就是牠了〕。
// 預覽、毛孩圖都用零件包組（parts.js；零件放 parts/，美術線匯出工具產生；開發時 serve.py 把 parts/ 指到 _studio/零件包/out/）。
// 「手機可以選哪些」＝parts/choices.json；cfg 照它的 cfg_rule 組（跟電腦 new_cat_cfg／apply_preset 一樣）：
//   {species, breed, coat, preset, pattern_seed?} ＋ 花色的 fields 整份抄 ＋ name、cid、born（3 個月大）、came_at。
//   自己調過顏色 → preset＝''；玩家選的 #ffffff 存成 #fefefe（零件包格式.md 4-1）。
// 存：毛孩圖（整張圖表＋meta，格式跟 src/pet_sprites.py 一樣）傳 Storage → dc_pet_create（🎮 019，跨線需求 2026-10-20 📱 第 1 條）。
// 新帳號第一次進來（還沒有毛孩）時自動打開；「全家」頁沒有毛孩時也有〔建立毛孩〕。
(window.DC_BUILD = window.DC_BUILD || {})['adopt.js'] = 54;   // 版本戳記（mobile/tools/bump.py 一起加 1；不一樣＝手機有舊檔）
(() => {
  'use strict';
  const SV = window.DCServer, P = window.DCParts, $ = id => document.getElementById(id);
  const PARTS = 'parts/';
  const NEW_MONTHS = 3;                          // 新領養＝3 個月大（電腦 new_cat_cfg 一樣）
  const MONTH_SEC = 86400;                       // 遊戲裡 1 個月＝真實 1 天（src/life.py month_secs，params days_per_month＝1）
  const COLORS = [['fur', '毛色'], ['stripe', '條紋'], ['belly', '肚子'], ['eye', '眼睛']];
  const LOOK_KEYS = ['fur', 'stripe', 'belly', 'eye', 'patch1', 'patch2', 'point', 'point_soft'];

  let choices = null, st = null, timer = 0;
  const books = new Map();                       // 著色本名字 → Promise<pet>（一次只下載用到的那隻）

  function ageBook(months) {                     // 年齡 → 著色本（choices.json age_rule＝cat_art.age_look；幼年 6 個月內）
    const g = Math.round(Math.trunc((0.78 + 0.22 * Math.min(1, months / 6)) / 0.04) * 0.04 * 100);
    return 'kit' + g;
  }
  const allCoats = () => {
    const out = [];
    for (const [sp, s] of Object.entries(choices.species)) for (const b of s.breeds) for (const c of b.coats) out.push({ sp, breed: b.breed, c });
    return out;
  };
  const breedsOf = sp => choices.species[sp].breeds;
  const coatsOf = (sp, breed) => (breedsOf(sp).find(b => b.breed === breed) || breedsOf(sp)[0]).coats;
  function bookName() {
    const c = st.coat, seed = c.spotted ? `_s${st.seed}` : '';
    return `${c.book}${seed}_${ageBook(NEW_MONTHS)}`;
  }
  function look() {                              // 零件包組圖用的顏色（parts_phone_ref 的 look）
    const f = st.coat.fields, lk = {};
    for (const k of LOOK_KEYS) if (f[k]) lk[k] = f[k];
    Object.assign(lk, st.colors);
    lk.preset = st.custom ? '' : st.coat.coat === st.breed ? st.breed : st.coat.coat;
    lk.breed = st.breed;
    return lk;
  }
  const stripes = () => st.custom && st.stripes != null ? st.stripes : st.coat.fields.stripes !== false;

  function getBook(name) {
    if (!books.has(name)) books.set(name, P.load(`${PARTS}${encodeURIComponent(name)}/`).catch(e => { books.delete(name); throw e; }));
    return books.get(name);
  }

  // ---------- 畫面 ----------
  function say(t, bad) { $('adMsg').textContent = t || ''; $('adMsg').classList.toggle('bad', !!bad); }
  function seg(box, items, cur, pick) {          // 一排按鈕（選中的變色）
    box.innerHTML = '';
    for (const [val, label, sw] of items) {
      const b = document.createElement('button'); b.type = 'button'; b.className = 'chip' + (val === cur ? ' on' : '');
      b.setAttribute('aria-pressed', val === cur ? 'true' : 'false');
      if (sw) { const s = document.createElement('span'); s.className = 'sw'; s.style.background = sw; b.append(s); }
      b.append(label);
      b.onclick = () => pick(val);
      box.append(b);
    }
    const on = box.querySelector('.on');     // 選中的那個捲到看得到（品種、花色一排放不下時）
    if (on && box.scrollWidth > box.clientWidth) box.scrollLeft = Math.max(0, on.offsetLeft - box.offsetLeft - (box.clientWidth - on.offsetWidth) / 2);
  }
  function renderForm() {
    seg($('adSpecies'), Object.entries(choices.species).map(([k, s]) => [k, s.label]), st.sp, v => { if (v !== st.sp) setBreed(v, breedsOf(v)[0].breed); });
    seg($('adBreed'), breedsOf(st.sp).map(b => [b.breed, b.breed]), st.breed, v => setBreed(st.sp, v));
    seg($('adCoat'), coatsOf(st.sp, st.breed).map(c => [c.coat, c.label, c.fields.fur]), st.coat.coat, v => setCoat(coatsOf(st.sp, st.breed).find(c => c.coat === v)));
    $('adSeed').hidden = !st.coat.spotted;
    for (const [k] of COLORS) $('adC_' + k).value = (st.colors[k] || '#000000').slice(0, 7);
    $('adStripeRow').hidden = !st.pet || !st.pet.meta.stripes_matter;
    $('adStripeColor').hidden = !st.pet || !st.pet.meta.stripes_matter;
    $('adStripes').checked = stripes();
    $('adReset').hidden = !st.custom;
  }
  function setBreed(sp, breed) { st.sp = sp; st.breed = breed; setCoat(coatsOf(sp, breed)[0]); }
  function setCoat(c) {
    st.coat = c; st.custom = false; st.stripes = null;
    st.colors = {}; for (const [k] of COLORS) if (c.fields[k]) st.colors[k] = c.fields[k];
    if (c.spotted && !choices.seeds.includes(st.seed)) st.seed = choices.seeds[0];
    refresh();
  }
  async function refresh() {
    renderForm();
    const want = bookName();
    $('adStage').classList.add('loading');
    try {
      const pet = await getBook(want);
      if (bookName() !== want) return;         // 等的時候又換了
      st.pet = pet; st.bookName = want;
      draw();
      renderForm();
      say('');
    } catch (e) {
      console.warn('零件包讀不到', want, e);
      say('毛孩的圖讀不到，檢查網路再試', true);
    } finally { $('adStage').classList.remove('loading'); }
  }
  const SEQ = ['walk', 'sit_wag', 'idle'];
  function draw() {                              // 照現在的顏色組整張圖表 → 預覽輪流播「走路」「坐著搖尾巴」
    const rgba = P.compose(st.pet, look(), stripes()), m = st.pet.meta, W = st.pet.width;
    st.sheet = P.toCanvas(st.pet, rgba); st.rgba = rgba;
    let x0 = m.w, y0 = m.h, x1 = -1, y1 = -1;     // 預覽只放毛孩那一塊（幼犬的格子很大、毛孩很小）：這幾個動作所有格子的範圍
    for (const a of SEQ.filter(k => m.anims[k])) for (let i = 0; i < m.anims[a][1]; i++) {
      const r = P.frameRect(m, a, i);
      for (let y = 0; y < r.h; y++) for (let x = 0; x < r.w; x++) if (rgba[((r.y + y) * W + r.x + x) * 4 + 3]) {
        if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
      }
    }
    st.box = x1 < 0 ? { x: 0, y: 0, w: m.w, h: m.h } : { x: x0, y: y0, w: x1 - x0 + 1, h: m.h - y0 };   // 底部對齊地板
    st.frame = 0;
    clearTimeout(timer); tick();
  }
  function tick() {
    if (!st || !st.pet || $('adopt').hidden) return;
    const m = st.pet.meta, seq = SEQ.filter(a => m.anims[a]), b = st.box;
    const anim = seq[Math.floor(st.frame / 16) % seq.length], n = m.anims[anim][1];
    const r = P.frameRect(m, anim, st.frame % n), cv = $('adPreview');
    const z = Math.max(1, Math.min(5, Math.floor(130 / b.h), Math.floor(300 / b.w)));
    cv.width = b.w; cv.height = b.h; cv.style.width = b.w * z + 'px'; cv.style.height = b.h * z + 'px';
    const c = cv.getContext('2d'); c.imageSmoothingEnabled = false; c.clearRect(0, 0, b.w, b.h);
    c.drawImage(st.sheet, r.x + b.x, r.y + b.y, b.w, b.h, 0, 0, b.w, b.h);
    st.frame++;
    timer = setTimeout(tick, 180 * ((m.ticks || {})[anim] || 1));
  }

  // ---------- 小圖（小工具、好友頭像用；跟電腦 src/pet_sprites.py avatar／poses 同一個做法） ----------
  // 一個姿勢一張：那個動作的第一格（理毛、洗臉用中間那格）→ 裁掉透明空白留 1 格（不超出那格的邊）→ 放大 6 倍（最近點）→ PNG，太大（> 24 KB）的不要
  const POSES = { cat: ['sit', 'sleep', 'loaf', 'walk', 'groom', 'washface'], dog: ['sit', 'sleep', 'loaf', 'walk', 'wag', 'pant'] };
  const MID_FRAME = ['groom', 'washface'], AVATAR_K = 6, AVATAR_MAX = 24 * 1024;
  async function makePoses(rgba) {
    const m = st.pet.meta, W = st.pet.width, out = {};
    for (const a of POSES[st.sp] || POSES.cat) {
      if (!m.anims[a]) continue;
      const [row, n] = m.anims[a], i = MID_FRAME.includes(a) ? Math.floor(n / 2) : 0;
      const [fw, fh] = (m.frame_size || {})[`${a}:${i}`] || [m.w, m.h];
      const fx = i * m.w + Math.floor((m.w - fw) / 2), fy = row * m.h + (m.h - fh);   // 那一格在圖表裡（底部置中）
      let x0 = fw, y0 = fh, x1 = -1, y1 = -1;
      for (let y = 0; y < fh; y++) for (let x = 0; x < fw; x++) if (rgba[((fy + y) * W + fx + x) * 4 + 3]) {
        if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
      }
      if (x1 < 0) { x0 = 0; y0 = 0; x1 = fw - 1; y1 = fh - 1; }
      else { x0 = Math.max(0, x0 - 1); y0 = Math.max(0, y0 - 1); x1 = Math.min(fw - 1, x1 + 1); y1 = Math.min(fh - 1, y1 + 1); }
      const w = x1 - x0 + 1, h = y1 - y0 + 1, cv = document.createElement('canvas');
      cv.width = w * AVATAR_K; cv.height = h * AVATAR_K;
      const c = cv.getContext('2d'); c.imageSmoothingEnabled = false;
      c.drawImage(st.sheet, fx + x0, fy + y0, w, h, 0, 0, w * AVATAR_K, h * AVATAR_K);
      const b64 = cv.toDataURL('image/png').split(',')[1];
      if (b64.length * 3 / 4 <= AVATAR_MAX) out[a] = b64;
    }
    return out;
  }

  // ---------- 存 ----------
  function hash12(s) {                           // 外觀指紋（檔名用）：FNV-1a 兩次 → 12 碼（家裡 Wi-Fi 是 http，不能用 crypto.subtle）
    let a = 0x811c9dc5, b = 0x01000193 ^ 0x5bd1e995;
    for (let i = 0; i < s.length; i++) {
      const c = s.charCodeAt(i);
      a = Math.imul(a ^ c, 0x01000193) >>> 0; b = Math.imul(b ^ c, 0x01000193 + 2) >>> 0;
    }
    return (a.toString(16).padStart(8, '0') + b.toString(16).padStart(8, '0')).slice(0, 12);
  }
  const cidNew = () => Array.from({ length: 12 }, () => '0123456789abcdef'[Math.floor(Math.random() * 16)]).join('');
  function buildCfg(name) {                      // cfg_rule：花色的 fields 整份抄，再改玩家調的顏色
    const c = st.coat, f = JSON.parse(JSON.stringify(c.fields)), now = Date.now() / 1000;
    const cfg = { name, species: st.sp, breed: st.breed, coat: c.coat, ...f };
    cfg.preset = st.custom ? '' : c.coat;
    if (st.custom) { Object.assign(cfg, st.colors); cfg.stripes = stripes(); }
    if (c.spotted) cfg.pattern_seed = st.seed;
    Object.assign(cfg, { cid: cidNew(), born: now - NEW_MONTHS * MONTH_SEC, came_at: now, zest: 70, mood: 60, hunger: 80 });
    return cfg;
  }
  async function save() {
    const name = $('adName').value.trim(), nick = $('adNick').value.trim();
    if (!st.pet) return;
    if (!$('adNickRow').hidden && !nick) { say('先取一個你的暱稱', true); $('adNick').focus(); return; }
    if (!name) { say('幫牠取個名字', true); $('adName').focus(); return; }
    const btn = $('adGo'); btn.disabled = true; say('準備牠的家…');
    try {
      if (!$('adNickRow').hidden) await SV.setNickname(nick);
      const cfg = buildCfg(name.slice(0, 12));
      const sig = hash12(JSON.stringify([st.bookName, look(), stripes(), choices.v]));
      const file = `${cfg.cid}-${sig}`, m = st.pet.meta;
      const png = await new Promise(r => st.sheet.toBlob(r, 'image/png'));
      const meta = { v: 1, species: st.sp, breed: st.breed, coat: cfg.coat, w: m.w, h: m.h, anims: m.anims, ticks: m.ticks || {} };
      await SV.spriteUpload(file, png, meta);
      const poses = await makePoses(st.rgba);          // 小工具、好友頭像的小圖（電腦版 dc_pet_poses_set 那份；sit＝avatar）
      const r = await SV.petCreate(cfg, file, poses);
      if (!r || r.ok === false) throw new SV.ServerError(r && r.reason === 'too_many' ? '毛孩已經滿了' : '建立不了，等一下再試', 'server', 0);
      close();
      window.DC.toast(`${cfg.name}來到你家了`);
      if (window.DC.pullNow) window.DC.pullNow();
    } catch (e) {
      say(e.status === 404 ? '伺服器還沒準備好建立毛孩' : e.message || '建立不了，等一下再試', true);
    } finally { btn.disabled = false; }
  }

  // ---------- 打開、關掉 ----------
  async function open() {
    const box = $('adopt');
    box.hidden = false; document.body.classList.add('login-open');
    say('讀取中…');
    try {
      if (!choices) choices = await (await fetch(PARTS + 'choices.json', { cache: 'no-store' })).json();
    } catch (e) { say('讀不到可以選的品種，檢查網路再試', true); return; }
    let nick = 'x';
    try { const pf = await SV.profile(); nick = (pf && pf.nickname) || ''; } catch (_) { /* 讀不到就不問暱稱 */ }
    $('adNickRow').hidden = !!nick;
    $('adClose').hidden = !(window.DC && window.DC.HOME.pets.length);   // 第一隻一定要建（不然什麼都不能玩）；之後可以關
    if (!st) {
      const first = allCoats()[0];
      st = { sp: first.sp, breed: first.breed, coat: first.c, colors: {}, custom: false, stripes: null,
             seed: choices.seeds[Math.floor(Math.random() * choices.seeds.length)], pet: null };
      setCoat(first.c);
    } else refresh();
    $('adName').value = '';
  }
  function close() {
    $('adopt').hidden = true; clearTimeout(timer); say('');
    if ($('login').hidden) document.body.classList.remove('login-open');
  }
  function colorChanged() {
    for (const [k] of COLORS) st.colors[k] = P.fixWhite($('adC_' + k).value);
    st.custom = true; st.stripes = $('adStripes').checked;
    $('adReset').hidden = false;
    if (st.pet) draw();
  }

  $('adGo').onclick = save;
  $('adClose').onclick = close;
  for (const [k] of COLORS) $('adC_' + k).addEventListener('input', colorChanged);
  $('adStripes').addEventListener('change', colorChanged);
  $('adReset').onclick = () => setCoat(st.coat);
  $('adSeed').onclick = () => {                  // 三花、玳瑁：換一種斑（電腦版 pattern_seed，8 種）
    const s = choices.seeds;
    st.seed = s[(s.indexOf(st.seed) + 1) % s.length];
    refresh();
  };
  window.DCAdopt = { open, close, ageBook, buildCfg: name => buildCfg(name), get state() { return st; } };
})();
