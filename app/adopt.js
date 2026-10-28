// DeskCat 手機網頁：在手機建立毛孩（P74 M2；2026-10-20 手機線）。只有手機、沒有電腦版的人也能養（Apple 4.2.3）。
// 新帳號登入、家裡一隻都沒有 → 這個畫面：（暱稱）→ 貓／狗 → 品種 → 花色 → 顏色（可以自己調）→ 名字 →〔就是牠了〕。
// 預覽、毛孩圖都用零件包組（parts.js；零件放 parts/，美術線匯出工具產生；開發時 serve.py 把 parts/ 指到 _studio/零件包/out/）。
// 「手機可以選哪些」＝parts/choices.json；cfg 照它的 cfg_rule 組（跟電腦 new_cat_cfg／apply_preset 一樣）：
//   {species, breed, coat, preset, pattern_seed?} ＋ 花色的 fields 整份抄 ＋ name、cid、born（3 個月大）、came_at。
//   自己調過顏色 → preset＝''；玩家選的 #ffffff 存成 #fefefe（零件包格式.md 4-1）。
// 存：毛孩圖（整張圖表＋meta，格式跟 src/pet_sprites.py 一樣）傳 Storage → dc_pet_create（🎮 019，跨線需求 2026-10-20 📱 第 1 條）。
// 新帳號第一次進來（還沒有毛孩）時自動打開；「全家」頁沒有毛孩時也有〔建立毛孩〕。
// 換顏色（P74 M2 剩下的，2026-10-22）：毛孩面板〔換顏色〕→ 同一個畫面、從牠現在的 cfg 開始；不能換貓狗、品種（伺服器規定），
//   著色本照牠現在的年齡 → 毛孩圖、小圖傳上去 → dc_pet_look_set（🎮 019）。電腦打開會照「最後改的為準」換成手機選的。
// 換衣服（P74 M5，2026-10-26）：毛孩面板〔換衣服〕→ 同一個畫面換成「衣櫃」：一個部位一排，只列衣櫃有的（🎮 dc_wardrobe_mine）、
//   這隻能穿的（專屬看品種或花色，跟電腦 items.can_wear 一樣）、零件包有這個品種年齡的；狗拿南瓜提籃不戴頭臉脖子（DC_RULES.wear.clash）。
// 長大換著色本（2026-10-23）：手機建立、電腦還沒接的毛孩長大了（ageKeyOf 變了）→ 背景照同一份外觀重畫、傳上去（checkGrow）。
(window.DC_BUILD = window.DC_BUILD || {})['adopt.js'] = 74;   // 版本戳記（mobile/tools/bump.py 一起加 1；不一樣＝手機有舊檔）
(() => {
  'use strict';
  const SV = window.DCServer, P = window.DCParts, $ = id => document.getElementById(id);
  const PARTS = 'parts/';
  const AGE = window.DC_RULES.age, NEW = window.DC_RULES.new_stats, WEAR = window.DC_RULES.wear;   // shared_rules（電腦 life.py、伺服器 019 同一份）
  const NEW_MONTHS = AGE.new_months;             // 新領養幾個月大
  const MONTH_SEC = AGE.month_sec;               // 遊戲裡 1 個月＝真實幾秒
  const KID_MONTHS = AGE.stages[0][1];           // 幼年到幾個月
  const SENIOR_MONTHS = AGE.stages[AGE.stages.length - 1][1];   // 幾個月起是熟齡（最後一個階段的結束）
  const COLORS = [['fur', '毛色'], ['stripe', '條紋'], ['belly', '肚子'], ['eye', '眼睛']];
  const LOOK_KEYS = ['fur', 'stripe', 'belly', 'eye', 'patch1', 'patch2', 'point', 'point_soft'];

  let choices = null, st = null, timer = 0;
  const books = new Map();                       // 著色本名字 → Promise<pet>（一次只下載用到的那隻）

  function ageBook(months) {                     // 年齡 → 著色本（choices.json age_rule＝cat_art.age_look；幼年 6 個月內）
    const g = Math.round(Math.trunc((0.78 + 0.22 * Math.min(1, months / KID_MONTHS)) / 0.04) * 0.04 * 100);
    return 'kit' + g;
  }
  const allCoats = () => {
    const out = [];
    for (const [sp, s] of Object.entries(choices.species)) for (const b of s.breeds) for (const c of b.coats) out.push({ sp, breed: b.breed, c });
    return out;
  };
  const breedsOf = sp => choices.species[sp].breeds;
  const coatsOf = (sp, breed) => (breedsOf(sp).find(b => b.breed === breed) || breedsOf(sp)[0]).coats;
  function bookName() {                          // 穿整套服裝＝換那套服裝的著色本（<範本>[_s斑]_<年齡>@<服裝>，零件包格式.md 第 8 節）
    const c = st.coat, seed = c.spotted ? `_s${st.seed}` : '', cos = st.wear && st.wear.body;
    return `${c.book}${seed}_${ageNow()}` + (cos ? `@${cos}` : '');
  }
  const ageNow = () => st.ageKey || ageBook(NEW_MONTHS);
  // 換顏色：照牠現在的年齡選著色本（cat_art.age_look）。手機建立的 cfg 有生日；電腦的只有年齡階段（幼年就用 3 個月大的，電腦打開會換成自己畫的圖）
  function ageKeyOf(p) {
    const born = p.cfg && typeof p.cfg.born === 'number' ? p.cfg.born : null;
    if (born != null) { const m = (Date.now() / 1000 - born) / MONTH_SEC; return m < KID_MONTHS ? ageBook(m) : m >= SENIOR_MONTHS ? 'senior' : 'adult'; }
    return /^幼/.test(p.age || '') ? ageBook(NEW_MONTHS) : p.age === '熟齡' ? 'senior' : 'adult';
  }
  function stateFrom(p) {                        // 換顏色：從牠現在的外觀開始；手機沒有這個品種／花色＝null
    const cfg = p.cfg, sp = cfg.species === 'dog' ? 'dog' : 'cat';
    const breed = choices.species[sp] && breedsOf(sp).some(b => b.breed === cfg.breed) ? cfg.breed : null;
    const coat = breed && coatsOf(sp, breed).find(c => c.coat === cfg.coat);
    if (!coat) return null;
    const colors = {}; for (const [k] of COLORS) if (cfg[k] || coat.fields[k]) colors[k] = cfg[k] || coat.fields[k];
    return { mode: 'look', target: p, sp, breed, coat, colors, custom: cfg.preset === '', stripes: typeof cfg.stripes === 'boolean' ? cfg.stripes : null,
             seed: choices.seeds.includes(cfg.pattern_seed) ? cfg.pattern_seed : choices.seeds[0], ageKey: ageKeyOf(p), pet: null,
             wear: cfg.wear && typeof cfg.wear === 'object' ? { ...cfg.wear } : {} };   // 身上的衣服：換顏色、長大換圖都保留
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
  const packs = new Map();                       // 飾品（parts/dress/<飾品>@<品種>@<年齡>）：只載身上那幾件
  function getPack(iid, group, age) {
    const k = `${iid}@${group}@${age}`;
    if (!packs.has(k)) packs.set(k, P.loadDress(PARTS + 'dress/', iid, group, age).catch(e => { packs.delete(k); throw e; }));
    return packs.get(k);
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
    const wearMode = st.mode === 'wear';
    $('adSpecies').hidden = $('adBreed').hidden = st.mode === 'look' || wearMode;   // 換顏色、換衣服不能換貓狗、品種
    $('adCoat').parentElement.hidden = document.querySelector('#adopt .ad-colors').hidden = wearMode;
    $('adWear').hidden = !wearMode;
    if (wearMode) renderWear();
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
      await draw();
      if (bookName() !== want) return;
      renderForm();
      say(st.note || ''); st.note = '';
    } catch (e) {
      console.warn('零件包讀不到', want, e);
      say('毛孩的圖讀不到，檢查網路再試', true);
    } finally { $('adStage').classList.remove('loading'); }
  }
  const SEQ = ['walk', 'sit_wag', 'idle'];
  // 照現在的顏色組整張圖表 → st.sheet（canvas）、st.rgba、st.sm（這張圖表的 meta：穿飾品時格子變大）、st.sw（寬）
  // 穿了脖子／頭／臉／手上的飾品：切成每一格 → P.dress 疊上去 → 重排（格子＝最大那格，底部置中；上傳的 meta w、h 用這個）
  async function paint() {
    const pet = st.pet, lk = look(), stp = stripes(), wear = st.wear || {};
    let rgba = P.compose(pet, lk, stp), meta = pet.meta, w = pet.width, h = pet.height;
    const slots = P.DRESS_ORDER.filter(s => wear[s]);
    if (slots.length) {
      const age = ageNow(), got = {};
      for (const s of slots) got[s] = await getPack(wear[s], st.breed, age);
      const frames = P.dress(pet, P.framesOf(meta, rgba, w), lk, stp, got, wear.body || null);
      const sh = P.sheetOf(meta, frames), size = {};
      for (const [k, f] of Object.entries(frames)) size[k] = [f.w, f.h];
      meta = { ...meta, w: sh.cw, h: sh.ch, frame_size: size };
      rgba = sh.data; w = sh.w; h = sh.h;
    }
    const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
    cv.getContext('2d').putImageData(new ImageData(rgba, w, h), 0, 0);
    st.sheet = cv; st.rgba = rgba; st.sm = meta; st.sw = w;
    return rgba;
  }
  async function draw() {                        // 組整張圖表 → 預覽輪流播「走路」「坐著搖尾巴」
    const rgba = await paint(), m = st.sm, W = st.sw;
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
    const m = st.sm, seq = SEQ.filter(a => m.anims[a]), b = st.box;
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
    const m = st.sm, W = st.sw, out = {};
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
  function buildLook() {                         // cfg_rule：花色的 fields 整份抄，再改玩家調的顏色（換顏色只送這些）
    const c = st.coat, f = JSON.parse(JSON.stringify(c.fields));
    const lk = { species: st.sp, breed: st.breed, coat: c.coat, ...f };
    lk.preset = st.custom ? '' : c.coat;
    if (st.custom) { Object.assign(lk, st.colors); lk.stripes = stripes(); }
    if (c.spotted) lk.pattern_seed = st.seed;
    if (st.wear && Object.keys(st.wear).length) lk.wear = { ...st.wear };   // 🎮 029 起伺服器收 wear（之前會被丟掉）
    return lk;
  }
  function buildCfg(name) {
    const now = Date.now() / 1000, cfg = { name, ...buildLook() };
    Object.assign(cfg, { cid: cidNew(), born: now - NEW_MONTHS * MONTH_SEC, came_at: now, zest: NEW.zest, mood: NEW.mood, hunger: NEW.hunger });
    return cfg;
  }
  async function upload(cid) {                   // 整張圖表＋meta 傳 Storage、做小圖 → {file, poses}
    const sig = hash12(JSON.stringify([st.bookName, look(), stripes(), choices.v, st.wear || {}]));
    const file = `${cid}-${sig}`, m = st.sm;
    const png = await new Promise(r => st.sheet.toBlob(r, 'image/png'));
    const meta = { v: 1, species: st.sp, breed: st.breed, coat: st.coat.coat, book: st.bookName, w: m.w, h: m.h, anims: m.anims, ticks: m.ticks || {} };   // book：長大換圖看這個
    await SV.spriteUpload(file, png, meta);
    return { file, poses: await makePoses(st.rgba) };   // 小工具、好友頭像的小圖（電腦版 dc_pet_poses_set 那份；sit＝avatar）
  }
  async function save() {
    if (st.mode === 'look' || st.mode === 'wear') return saveLook();
    const name = $('adName').value.trim(), nick = $('adNick').value.trim();
    if (!st.pet) return;
    if (!$('adNickRow').hidden && !nick) { say('先取一個你的暱稱', true); $('adNick').focus(); return; }
    if (!name) { say('幫牠取個名字', true); $('adName').focus(); return; }
    const btn = $('adGo'); btn.disabled = true; say('準備牠的家…');
    try {
      if (!$('adNickRow').hidden) await SV.setNickname(nick);
      const cfg = buildCfg(name.slice(0, 12));
      const { file, poses } = await upload(cfg.cid);
      const r = await SV.petCreate(cfg, file, poses);
      if (!r || r.ok === false) throw new SV.ServerError(r && r.reason === 'too_many' ? '毛孩已經滿了' : '建立不了，等一下再試', 'server', 0);
      close();
      window.DC.toast(`${cfg.name}來到你家了`);
      if (window.DC.pullNow) window.DC.pullNow();
    } catch (e) {
      say(e.status === 404 ? '伺服器還沒準備好建立毛孩' : e.message || '建立不了，等一下再試', true);
    } finally { btn.disabled = false; }
  }

  const LOOK_FAIL = { no_look: '電腦版更新後才能在這裡換', gone: '找不到牠了', no_sprite: '圖沒傳好，再試一次', invalid: '這個顏色存不了',
                      not_owned: '衣櫃裡沒有這件' };

  // ---------- 換衣服（衣櫃） ----------
  let dressIdx = null, owned = [];
  function canWear(iid) {                        // 跟電腦 items.can_wear 一樣：專屬看品種或花色（preset）
    const it = WEAR.items[iid];
    return !!it && (!it.breeds.length || it.breeds.includes(st.breed) || it.breeds.includes(buildLook().preset));
  }
  function hasArt(iid, slot) {                   // 零件包有沒有這件（這個品種、年齡；整套服裝看這個花色有沒有那本）
    if (slot === 'body') { const c = st.coat, seed = c.spotted ? `_s${st.seed}` : ''; return dressIdx.costume_books.some(b => b.book === `${c.book}${seed}_${ageNow()}@${iid}`); }
    return dressIdx.packs.some(p => p.iid === iid && p.group === st.breed && p.age === ageNow());
  }
  function wearPick(slot, iid) {                 // shared_rules.wear_pick 照翻：換上 iid（null＝脫）→ 照 clash 自動脫掉衝突的
    const w = {}; for (const [k, v] of Object.entries(st.wear || {})) if (v) w[k] = v;
    if (iid) w[slot] = iid; else delete w[slot];
    const off = [];
    for (const r of WEAR.clash) {
      if (r.species !== st.sp || w[r.slot] !== r.item) continue;
      const busy = r.empty.filter(s => w[s]);
      if (!busy.length) continue;
      const drop = slot === r.slot ? busy : [r.slot];
      for (const s of drop) { delete w[s]; off.push(s); }
    }
    return [w, off];
  }
  function renderWear() {
    const box = $('adWear'); box.innerHTML = '';
    for (const [slot, label] of WEAR.slots) {
      const list = owned.filter(iid => WEAR.items[iid] && WEAR.items[iid].slot === slot && canWear(iid) && hasArt(iid, slot));
      if (!list.length && !(st.wear || {})[slot]) continue;
      const row = document.createElement('div'); row.className = 'ad-wrow';
      const lab = document.createElement('span'); lab.className = 'ad-wlab'; lab.textContent = label;
      const sc = document.createElement('div'); sc.className = 'ad-scroll'; sc.setAttribute('role', 'group'); sc.setAttribute('aria-label', label);
      row.append(lab, sc); box.append(row);
      seg(sc, [['', '不穿'], ...list.map(iid => [iid, WEAR.items[iid].name])], (st.wear || {})[slot] || '', v => {
        const [w, off] = wearPick(slot, v || null);
        st.wear = w;
        st.note = off.length ? `${off.map(s => WEAR.slots.find(x => x[0] === s)[1]).join('、')}先脫掉了` : '';   // 畫好再說（refresh 會清掉提示）
        refresh();
      });
    }
    if (!box.childElementCount) { const n = document.createElement('p'); n.className = 'note'; n.textContent = '衣櫃還是空的：在電腦版買衣服，或用友情點數換專屬飾品'; box.append(n); }
  }
  async function saveLook() {
    const p = st.target, btn = $('adGo');
    if (!st.pet) return;
    btn.disabled = true; say('幫牠換顏色…');
    try {
      const { file, poses } = await upload(p.id);
      const r = await SV.petLookSet(p.id, buildLook(), file, poses);
      if (!r || r.ok === false) throw new SV.ServerError(LOOK_FAIL[r && r.reason] || '換不了，等一下再試', 'server', 0);
      close();
      window.DC.toast(st.mode === 'wear' ? `${p.name}換好衣服了` : `${p.name}換好顏色了`);
      if (window.DC.pullNow) window.DC.pullNow();
    } catch (e) {
      say(e.status === 404 ? '伺服器還沒準備好換顏色' : e.message || '換不了，等一下再試', true);
    } finally { btn.disabled = false; }
  }

  // ---------- 打開、關掉 ----------
  async function open(target, mode) {            // target＝要換顏色／換衣服（mode＝'wear'）的毛孩（HOME.pets 的一隻，有 cfg）；沒有＝領養新的
    while (growing) await new Promise(r => setTimeout(r, 200));   // 背景正在幫別隻換長大的圖（共用 st）：等它做完
    const box = $('adopt'), recolor = !!(target && target.cfg), dressing = recolor && mode === 'wear';
    box.hidden = false; document.body.classList.add('login-open');
    box.querySelector('.ad-head h2').textContent = dressing ? `幫${target.name}換衣服` : recolor ? `幫${target.name}換顏色` : '領養你的毛孩';
    box.querySelector('.ad-names').hidden = recolor;
    $('adGo').textContent = recolor ? '換好了' : '就是牠了';
    say('讀取中…');
    try {
      if (!choices) choices = await (await fetch(PARTS + 'choices.json', { cache: 'no-store' })).json();
    } catch (e) { say('讀不到可以選的品種，檢查網路再試', true); return; }
    $('adClose').hidden = !recolor && !(window.DC && window.DC.HOME.pets.length);   // 第一隻一定要建（不然什麼都不能玩）；之後可以關
    if (recolor) {
      st = stateFrom(target);
      if (!st) { $('adClose').hidden = false; say('這個花色手機還不能換', true); return; }
      if (dressing) {
        try {
          if (!dressIdx) dressIdx = await (await fetch(PARTS + 'dress/index.json', { cache: 'no-store' })).json();
          owned = ((await SV.wardrobeMine()) || {}).items || [];
        } catch (e) { say(e.status === 404 ? '伺服器還沒準備好換衣服' : '讀不到衣櫃，檢查網路再試', true); return; }
        st.mode = 'wear';
      }
      refresh();
      return;
    }
    if (st && st.mode) st = null;                // 換過顏色、衣服：領養從頭開始
    let nick = 'x';
    try { const pf = await SV.profile(); nick = (pf && pf.nickname) || ''; } catch (_) { /* 讀不到就不問暱稱 */ }
    $('adNickRow').hidden = !!nick;
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

  // ---------- 長大換著色本（手機建立、電腦還沒接的毛孩；電腦接走後由電腦自己畫、自己傳） ----------
  // 傳上去的毛孩圖 meta.book 記著那時候的著色本（例：橘虎斑_kit88）；年齡那段跟 ageKeyOf(p) 不一樣 → 照同一份外觀重畫 → dc_pet_look_set。
  // 舊的圖（2026-10-23 以前）沒有 book：重畫一次補上。這次開著同一隻同一個年齡只試一次（失敗下次打開再說）。
  const ageOfBook = b => String(b || '').split('@')[0].split('_').pop();   // 穿整套服裝的書名後面有 @服裝
  const growDone = new Set();
  let growing = false;
  async function checkGrow(list, infoOf) {      // list＝HOME.pets；infoOf(p)＝牠現在那張圖的說明（還沒下載好＝null）
    if (growing || !SV.p74 || !$('adopt').hidden) return;
    const todo = list.filter(p => p.origin === 'phone' && !p.adopted && p.cfg && typeof p.cfg.born === 'number');
    if (!todo.length) return;
    growing = true;
    try {
      if (!choices) choices = await (await fetch(PARTS + 'choices.json', { cache: 'no-store' })).json();
      for (const p of todo) {
        const info = infoOf(p), want = ageKeyOf(p), key = `${p.id}:${want}`;
        if (!info || ageOfBook(info.book) === want || growDone.has(key)) continue;
        growDone.add(key);
        const keep = st;
        try {
          st = stateFrom(p);
          if (!st) continue;
          st.bookName = bookName(); st.pet = await getBook(st.bookName);
          await paint();
          const { file, poses } = await upload(p.id);
          const r = await SV.petLookSet(p.id, buildLook(), file, poses);
          if (r && r.ok !== false) { if (window.DC.pullNow) window.DC.pullNow(); }
          else console.warn('長大換圖沒成功', p.name, r);
        } catch (e) { console.warn('長大換圖沒成功', p.name, e); }
        finally { st = keep; }
      }
    } catch (e) { console.warn('長大換圖：讀不到可以選的品種', e); }
    finally { growing = false; }
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
  window.DCAdopt = { open, close, ageBook, ageKeyOf, checkGrow, buildCfg: name => buildCfg(name), buildLook: () => buildLook(), get state() { return st; } };
})();
