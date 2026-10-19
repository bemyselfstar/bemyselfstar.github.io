// DeskCat 手機網頁「🎒 口袋」的 AI 旅行照（P66 新設計第 11 節第 12 項；2026-10-17 手機線）。
// 帶毛孩出門滿 1 小時 → 選城市＋做什麼 → 伺服器用 AI 畫一張「自己的毛孩在那裡」的照片（每帳號每天幾張由伺服器定：trip_conf.per_user_day，畫面只用回來的 today_left）。
// 手機只送城市、情境代號（提示字、金鑰、每天上限都在伺服器）；函式規格在 docs/跨線需求.md 2026-10-17「手機要叫的函式」：
//   產圖 SV.tripMake（Edge Function trip-photo）、相簿 SV.tripMine（dc_trip_photos_mine）、圖 SV.tripImage（Storage trip-photos）。
// 全部玩家當天的額度用完（daily_total）：手機自己做風景照＝畫一張城市剪影＋毛孩坐著的那一格（不算今天的張數；伺服器沒有圖庫）。AI 畫失敗（ai_failed）＝同一個 key 再試。
// 伺服器還沒有這些函式（讀相簿回 404）：口袋不顯示〔旅行照〕按鈕（不會有按了壞掉的按鈕）。
(window.DC_BUILD = window.DC_BUILD || {})['trip.js'] = 36;   // 版本戳記（mobile/tools/bump.py 一起加 1；不一樣＝手機有舊檔）
(() => {
  'use strict';
  const D = window.DC, SV = window.DCServer, $ = id => document.getElementById(id);
  // 代號跟 tools/pet_prompt.py 的 CITIES／SCENES 同一組（伺服器照代號組提示字）
  const CITIES = [['taipei', '台北'], ['tokyo', '東京'], ['kyoto', '京都'], ['paris', '巴黎'], ['seaside', '海邊小鎮']];
  const SCENES = [['walk', '散步'], ['cafe', '咖啡廳'], ['market', '逛市集'], ['picnic', '野餐'], ['rain', '雨中散步']];
  const cityName = k => (CITIES.find(c => c[0] === k) || [k, k])[1];
  const sceneName = k => (SCENES.find(c => c[0] === k) || [k, k])[1];
  const NEED_MIN = 60, PENDING_KEY = 'deskcat_trip_pending_v1';
  const WAIT_MS = 90000;                    // 一次最多等 90 秒（AI 通常 15～45 秒），太久就用同一個代號再問

  // ---------- 畫一張「那個地方」（像素風，128×96 再放大）：圖庫還沒有圖時的背景、等待畫面、城市小圖都用這個 ----------
  const PW = 128, PH = 96;
  const SKIES = { day: ['#7fb8e8', '#a9d2f0', '#d6ecf7'], night: ['#141a3a', '#1f2a55', '#36406e'], rain: ['#7d8893', '#949ea7', '#aab3ba'] };
  const timeOf = scene => scene === 'market' ? 'night' : scene === 'rain' ? 'rain' : 'day';
  function drawPlace(c, city, scene) {      // c＝128×96 的畫布 context
    const tm = timeOf(scene), sky = SKIES[tm], night = tm === 'night', rain = tm === 'rain';
    const R = (x, y, w, h, col) => { c.fillStyle = col; c.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h)); };
    const GY = 64;                          // 地平線
    sky.forEach((col, i) => R(0, i * 22, PW, 22, col));
    if (night) for (let i = 0; i < 22; i++) R((i * 37) % PW, (i * 11) % 40, 1, 1, '#fff6c8');
    else if (!rain) { R(100, 10, 8, 8, '#ffe58a'); R(99, 12, 10, 4, '#ffe58a'); }
    if (rain) [[20, 14], [70, 8], [104, 18]].forEach(([x, y]) => { R(x, y, 22, 6, '#c5ccd2'); R(x + 4, y - 3, 12, 4, '#c5ccd2'); });
    const far = night ? '#2a3058' : rain ? '#6c7781' : '#8aa0b8', near = night ? '#20253f' : rain ? '#5b656e' : '#6f8399';
    const sea = city === 'seaside';
    if (!sea) for (let x = 0, i = 0; x < PW; i++) { const w = 9 + (i * 7) % 8, h = 10 + (i * 13) % 14; R(x, GY - h, w - 1, h, far); x += w; }
    // 地標（遠處）
    const L = night ? '#3a4170' : rain ? '#56606a' : '#5d6f86', red = night ? '#7a3a4a' : '#c8473d';
    if (city === 'taipei') { R(83, GY - 14, 12, 14, L); for (let k = 0; k < 7; k++) { R(84, GY - 19 - k * 5, 10, 5, L); R(83, GY - 19 - k * 5, 12, 1, L); } R(86, GY - 52, 6, 4, L); R(88, GY - 60, 2, 8, L); }
    else if (city === 'tokyo') { for (let k = 0; k < 10; k++) { const w = 12 - k; R(86 + k / 2, GY - 12 - k * 4, w, 4, k % 3 === 0 ? '#e8e8e8' : red); } R(91, GY - 56, 2, 8, red); }
    else if (city === 'kyoto') { for (let k = 0; k < 5; k++) { R(80 + k, GY - 12 - k * 8, 18 - k * 2, 2, L); R(83 + k, GY - 10 - k * 8, 12 - k * 2, 6, L); } R(88, GY - 56, 2, 8, L);
      R(18, GY - 18, 22, 3, red); R(16, GY - 21, 26, 3, red); R(21, GY - 15, 2, 15, red); R(35, GY - 15, 2, 15, red); }
    else if (city === 'paris') { for (let k = 0; k < 44; k++) { const w = Math.max(1, Math.round(16 - k * .34)); R(88 - w / 2, GY - k, w, 1, L); } R(83, GY - 12, 10, 4, sky[2]); R(86, GY - 46, 2, 6, L); }
    else { R(0, GY - 14, PW, 14, night ? '#1d3a5c' : rain ? '#5f7a90' : '#3f86c4'); R(0, GY - 14, PW, 1, 'rgba(255,255,255,.35)');
      for (let k = 0; k < 3; k++) { const x = 6 + k * 18; R(x, GY - 10, 14, 10, '#f4f0e6'); R(x - 1, GY - 12, 16, 2, '#3f6fb0'); R(x + 3, GY - 7, 3, 3, '#3f6fb0'); R(x + 8, GY - 7, 3, 3, '#3f6fb0'); } R(92, GY - 34, 7, 28, '#f2f2f2'); R(92, GY - 26, 7, 4, red); R(92, GY - 16, 7, 4, red); R(91, GY - 38, 9, 4, '#3b3f4a');
      R(93, GY - 37, 5, 2, night ? '#ffe39a' : '#fff6c8'); R(62, GY - 6, 14, 3, '#7a5a40'); R(68, GY - 12, 1, 6, '#7a5a40'); R(69, GY - 11, 5, 5, '#f4f0e6'); }
    if (!sea) for (let x = 0, i = 0; x < PW; i++) { const w = 14 + (i * 5) % 10, h = 6 + (i * 7) % 10; if (x > 70 && x < 104) { x += w; continue; } R(x, GY - h, w - 1, h, near);
      if (night) for (let yy = GY - h + 2; yy < GY - 1; yy += 3) for (let xx = x + 2; xx < x + w - 2; xx += 3) if ((xx + yy + i) % 2) R(xx, yy, 1, 1, '#ffd77a'); x += w; }
    // 地面（照情境）
    const ground = { walk: '#d8cdb9', cafe: '#cdbba2', market: '#4c4b5e', picnic: '#7fb36a', rain: '#5d6670' }[scene] || '#d8cdb9';
    R(0, GY, PW, PH - GY, ground);
    if (scene === 'picnic') { for (let i = 0; i < 40; i++) R((i * 37) % PW, GY + 3 + (i * 11) % 28, 2, 1, '#6aa057');
      for (let y = 0; y < 3; y++) for (let x = 0; x < 6; x++) R(14 + x * 8, 78 + y * 5, 8, 5, (x + y) % 2 ? '#f4f0e6' : '#d9534f'); }
    else { for (let y = GY + 6; y < PH; y += 7) R(0, y, PW, 1, 'rgba(0,0,0,.08)'); }
    if (scene === 'cafe') { R(84, 70, 22, 3, '#6b4a33'); R(94, 73, 2, 14, '#6b4a33'); R(88, 86, 14, 2, '#6b4a33'); R(90, 66, 4, 4, '#f4f0e6'); R(98, 67, 3, 3, '#a8744a');
      R(108, 72, 2, 15, '#6b4a33'); R(104, 79, 8, 2, '#6b4a33'); R(104, 81, 2, 6, '#6b4a33'); }   // 小圓桌、杯子、椅子
    if (scene === 'market') { for (let k = 0; k < 3; k++) { const x = 8 + k * 40; R(x, 58, 30, 3, k % 2 ? '#d9534f' : '#e8a33d'); R(x, 61, 2, 20, '#6b4a33'); R(x + 28, 61, 2, 20, '#6b4a33'); R(x, 72, 30, 6, '#8a6a4a');
      for (let j = 0; j < 4; j++) R(x + 3 + j * 7, 69, 4, 3, ['#ffd77a', '#f28fb0', '#9ad17a', '#fff6c8'][j]); }
      for (let x = 4; x < PW; x += 12) { R(x, 50, 4, 5, '#ff8a5a'); R(x + 1, 51, 2, 3, '#ffd77a'); } }
    if (rain) { R(20, 82, 24, 2, 'rgba(170,200,235,.6)'); R(80, 74, 18, 2, 'rgba(170,200,235,.5)'); for (let i = 0; i < 40; i++) R((i * 29) % PW, (i * 17) % PH, 1, 3, 'rgba(220,232,255,.7)'); }
    if (night) { R(110, 40, 2, 24, '#3b3f4a'); R(108, 37, 6, 4, '#ffe39a'); }
  }
  // 那一列動作實際畫到的最下面一列（腳踩地；有的圖下面留了空白）
  const bots = new Map();
  function feet(d, im, row) {
    const k = d.file + '|' + row;
    if (!bots.has(k)) {
      const t = document.createElement('canvas'); t.width = d.w; t.height = d.h;
      const tc = t.getContext('2d'); tc.drawImage(im, 0, row * d.h, d.w, d.h, 0, 0, d.w, d.h);
      const px = tc.getImageData(0, 0, d.w, d.h).data;
      let b = d.h - 1;
      for (let y = d.h - 1; y >= 0; y--) { let any = false; for (let x = 0; x < d.w; x++) if (px[(y * d.w + x) * 4 + 3]) { any = true; break; } if (any) { b = y; break; } }
      bots.set(k, b);
    }
    return bots.get(k);
  }
  // 毛孩那一格（坐著）畫在地上（128×96 的座標；圖要先載入好）
  function drawPetOn(c, p, scene) {
    const d = D.petInfo(p), im = D.img(d.file);
    if (!(im.complete && im.naturalWidth)) return;
    const a = D.animOf(d, scene === 'picnic' ? ['loaf', 'sit'] : ['sit', 'idle']), [row] = d.anims[a];
    const x = Math.round(PW * .36 - d.w / 2), y = PH - 7 - feet(d, im, row);
    c.imageSmoothingEnabled = false;
    c.drawImage(im, 0, row * d.h, d.w, d.h, x, y, d.w, d.h);
  }
  const loadImg = src => new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = src; });
  async function petReady(p) {             // 毛孩圖載入好了沒（伺服器的圖是下載下來的）
    const im = D.img(D.petInfo(p).file);
    if (im.complete && im.naturalWidth) return;
    await new Promise(r => { im.addEventListener('load', r, { once: true }); im.addEventListener('error', r, { once: true }); setTimeout(r, 4000); });
  }
  const findPet = cid => D.HOME.pets.find(p => p.id === cid);

  // 一張照片 → 畫布（AI 圖照原樣；圖庫的疊上毛孩）。照 id 記著，相簿、看照片共用
  const made = new Map();
  function photoCanvas(ph) {
    const k = ph.id + '|' + (ph.path || '');
    if (!made.has(k)) made.set(k, (async () => {
      let base = null;
      if (ph.path) base = await loadImg(URL.createObjectURL(await SV.tripImage(ph.path)));
      const out = document.createElement('canvas');
      if (!ph.fallback) { out.width = base.naturalWidth; out.height = base.naturalHeight; out.getContext('2d').drawImage(base, 0, 0); return out; }
      const sm = document.createElement('canvas'); sm.width = PW; sm.height = PH;
      const c = sm.getContext('2d'); c.imageSmoothingEnabled = false;
      if (base) c.drawImage(base, 0, 0, PW, PH); else drawPlace(c, ph.city, ph.scene);
      const p = findPet(ph.cid);
      if (p) { await petReady(p); drawPetOn(c, p, ph.scene); }
      out.width = PW * 4; out.height = PH * 4;
      const oc = out.getContext('2d'); oc.imageSmoothingEnabled = false; oc.drawImage(sm, 0, 0, out.width, out.height);
      return out;
    })().catch(e => { made.delete(k); throw e; }));
    return made.get(k);
  }
  // 存成照片：照片放大 2 倍（像素不糊）＋下面一條字（誰・哪裡・日期）
  async function photoFile(ph) {
    const cv = await photoCanvas(ph), k = cv.width < 900 ? 2 : 1, W = cv.width * k, H = cv.height * k, bar = Math.round(W / 16);
    const out = document.createElement('canvas'); out.width = W; out.height = H + bar;
    const c = out.getContext('2d'); c.imageSmoothingEnabled = false;
    c.fillStyle = '#fffaf2'; c.fillRect(0, 0, W, H + bar); c.drawImage(cv, 0, 0, W, H);
    c.fillStyle = '#3b2f28'; c.font = `${Math.round(bar * .42)}px sans-serif`; c.textBaseline = 'middle';
    c.textAlign = 'left'; c.fillText(`🐾 ${ph.name || ''}・${cityName(ph.city)}・${sceneName(ph.scene)}`, bar * .4, H + bar / 2);
    c.textAlign = 'right'; c.fillStyle = '#8a7a6a'; c.fillText(`${(ph.created_at || '').slice(0, 10).replace(/-/g, '/')}  DeskCat`, W - bar * .4, H + bar / 2);
    const blob = await new Promise(r => out.toBlob(r, 'image/jpeg', .92));
    return new File([blob], `DeskCat_旅行照_${ph.name || ''}_${cityName(ph.city)}.jpg`, { type: 'image/jpeg' });
  }

  // ---------- 伺服器回的格式 → 這邊用的（遊戲線 2026-10-17 定案：server/018、server/functions/trip-photo） ----------
  // 相簿 {photos: [{id, cid, name, city, scene, tod, status, file, reused, created_at}], today_left, next_at, min_out_min}
  // 產圖一律帶 status：done＝成功（file）、making＝還在畫（5 秒後同一個 key 再問）、no＝不行（reason）。
  //   daily_total（全部玩家的額度用完、AI 沒開）→ 手機自己做風景照，不算今天的張數；ai_failed → 用同一個 key 再試一次。
  // 伺服器沒有圖庫：風景照＝手機自己畫的城市剪影＋毛孩（只留在這次開著，不上傳）
  const localPhotos = [];
  function normPhoto(ph) {
    const p = findPet(ph.cid);
    return { ...ph, name: ph.name || (p && p.name) || '毛孩', path: ph.path !== undefined ? ph.path : (ph.file || null), fallback: !!ph.fallback };
  }
  function normMine(r) {
    r = r || {};
    return {
      left: r.today_left != null ? r.today_left : r.left != null ? r.left : 1,
      nextAt: r.next_at || null, need: r.min_out_min != null ? r.min_out_min : r.need_min || NEED_MIN,
      photos: (r.photos || []).filter(ph => !ph.status || ph.status === 'done').map(normPhoto),
    };
  }
  // → {ok: true, photo, why?}／{busy: true}／{retry: '原因'}（同一個 key 再送）／{ok: false, reason, wait_min?, next_at?}
  function normMake(res, job) {
    res = res || {};
    const base = { id: res.id, cid: job.cid, name: job.name, city: job.city, scene: job.scene, created_at: new Date().toISOString() };
    if (res.status === 'done' && res.file) return { ok: true, photo: normPhoto({ ...base, file: res.file, reused: !!res.reused }) };
    if (res.status === 'making' || res.reason === 'busy') return { busy: true };
    if (res.reason === 'daily_total')
      return { ok: true, why: 'quota', photo: normPhoto({ ...base, id: 'local-' + job.key, path: null, fallback: true }) };
    if (res.reason === 'ai_failed') return { retry: 'AI 這次沒畫好，再試一次' };
    if (res.reason === 'server') return { retry: '伺服器有狀況，再試一次' };
    if (res.ok && res.photo) return { ...res, photo: normPhoto(res.photo) };   // 舊規格（假伺服器以前的樣子）
    return { ok: false, reason: { daily_user: 'daily_used', invalid: 'bad_choice' }[res.reason] || res.reason || 'server', wait_min: res.wait_min, next_at: res.next_at };
  }

  // ---------- 狀態 ----------
  const st = { ok: null, left: 1, nextAt: null, need: NEED_MIN, photos: [], at: 0, city: null, scene: null, run: null, view: null, err: '' };
  const acct = () => SV.user ? SV.which + '/' + SV.user.uid : '';
  const usable = () => D.LIVE && SV.mode === 'live';
  const loadPending = () => { try { const v = JSON.parse(localStorage.getItem(PENDING_KEY) || 'null'); return v && v.acct === acct() && Date.now() - v.at < 6 * 3600e3 ? v : null; } catch (_) { return null; } };
  const savePending = v => { try { if (v) localStorage.setItem(PENDING_KEY, JSON.stringify(v)); else localStorage.removeItem(PENDING_KEY); } catch (_) { /* 存不了：這次開著還是能用 */ } };
  const newKey = () => Array.from(crypto.getRandomValues(new Uint8Array(18)), b => 'abcdefghijklmnopqrstuvwxyz0123456789'[b % 36]).join('');

  async function refresh(force = false) {   // 讀相簿＋今天還能不能拍（60 秒內讀過就不再讀）。回傳伺服器有沒有這個功能
    if (!usable()) { st.ok = false; return false; }
    if (!force && st.ok != null && Date.now() - st.at < 60000) return st.ok;
    try {
      const r = normMine(await SV.tripMine());
      st.ok = true; st.at = Date.now();
      st.left = r.left; st.nextAt = r.nextAt; st.need = r.need;
      const ids = new Set(r.photos.map(x => x.id));
      st.photos = [...localPhotos.filter(x => !ids.has(x.id)), ...r.photos];
    } catch (e) {
      if (e.status === 404) { st.ok = false; st.at = Date.now(); }   // 伺服器還沒有這個功能
      else if (st.ok == null) st.ok = null;                          // 沒網路：下次再讀
    }
    return st.ok;
  }
  const minsOut = p => p && p.placeAt ? Math.floor((Date.now() - p.placeAt) / 60000) : 0;
  const nextText = iso => { if (!iso) return '明天'; const t = new Date(iso), n = new Date();
    const day = t.toDateString() === n.toDateString() ? '今天' : '明天';
    return `${day} ${String(t.getHours()).padStart(2, '0')}:${String(t.getMinutes()).padStart(2, '0')} 起`; };
  const needText = () => st.need % 60 === 0 && st.need ? `${st.need / 60} 小時` : `${st.need} 分鐘`;   // 伺服器的 min_out_min（dev 測試可能改成 0）
  const REASON = {
    not_pocket: () => '牠現在不在口袋裡', bad_choice: () => '這個地方還不能去', no_pet: () => '伺服器找不到牠', login: () => '登入過期了，請再登入',
    too_soon: r => `出門滿 ${needText()}才能拍（還要 ${r.wait_min || '幾'} 分）`, daily_used: r => `今天的張數用完了，${nextText(r.next_at)}再來`,
  };

  // ---------- 畫面 ----------
  const sec = $('trip'), pocketPet = () => window.DCPocket && window.DCPocket.pet;
  function showPart(which) { for (const id of ['tripPick', 'tripWait', 'tripView']) $(id).hidden = id !== which; }
  function open(view) {
    if (!usable()) { D.toast('範例不能拍旅行照，要登入'); return; }
    sec.hidden = false;
    if (view) { showView(view); return; }
    if (st.run) { showWait(); return; }
    const pend = loadPending();
    if (pend) { start(pend); return; }
    showPick();
    refresh(true).then(() => { if (!$('tripPick').hidden) renderPick(); });
  }
  function close() {
    sec.hidden = true; walkOn = false;
    const pet = pocketPet();
    if (st.view && pet && st.view.cid === pet.p.id && st.view.fresh) { D.say(pet, D.line(pet, 'tripphoto_done')); D.addHearts(pet, 2); }
    if (st.view) st.view.fresh = false;
    if (window.DCPocket) window.DCPocket.render();
    badge();
  }
  function showPick() { showPart('tripPick'); renderPick(); }
  function renderPick() {
    const pet = pocketPet(), p = pet && pet.p;
    const av = $('tripAvatar'); if (p) D.drawAvatar(av, p);
    $('tripAsk').textContent = p ? `帶${p.name}去哪裡拍一張？` : '先帶一隻毛孩出門';
    for (const [box, list, key] of [[$('tripCities'), CITIES, 'city'], [$('tripScenes'), SCENES, 'scene']]) {
      if (!box.childElementCount) list.forEach(([k, name]) => {
        const b = document.createElement('button'); b.type = 'button'; b.dataset.k = k;
        b.className = key === 'city' ? 'trip-city' : 'btn trip-scene';
        if (key === 'city') {                // 城市小圖（同一套剪影）
          const cv = document.createElement('canvas'); cv.width = PW; cv.height = PH; drawPlace(cv.getContext('2d'), k, 'walk');
          const s = document.createElement('span'); s.textContent = name; b.append(cv, s);
        } else b.textContent = name;
        b.onclick = () => { st[key] = k; st.err = ''; renderPick(); };
        box.appendChild(b);
      });
      box.querySelectorAll('button').forEach(b => { const on = b.dataset.k === st[key]; b.classList.toggle('on', on); b.setAttribute('aria-pressed', on); });
    }
    const m = minsOut(p), go = $('tripGo');
    let rule, label = '拍旅行照', can = false;
    if (!p) rule = '口袋裡沒有毛孩';
    else if (st.ok === false) rule = '旅行照還沒開放，敬請期待';
    else if (st.err) rule = st.err;
    else if (st.left < 1) { rule = `今天的張數用完了・${nextText(st.nextAt)}再來`; label = '明天再來'; }
    else if (m < st.need) { rule = `出門 ${m} 分・滿 ${needText()}才能拍`; label = `還要 ${st.need - m} 分鐘`; }
    else if (!st.city || !st.scene) { rule = `今天還能拍 ${st.left} 張・AI 會照${p.name}的樣子畫`; label = !st.city ? '先選城市' : '先選做什麼'; }
    else { rule = `今天還能拍 ${st.left} 張・AI 會照${p.name}的樣子畫`; can = true; label = `去${cityName(st.city)}拍照`; }
    $('tripRule').textContent = rule;
    D.setLabel(go, 'trip', label); go.disabled = !can;
    renderAlbum($('tripAlbum'));
  }
  // 相簿：拍過的旅行照（口袋頁、旅行照頁都有一份）
  function renderAlbum(box) {
    if (!box) return;
    if (!usable() || st.ok !== true) { box.hidden = true; return; }
    box.hidden = false; box.innerHTML = '';
    const h = document.createElement('h3'); D.setLabel(h, 'trip', `旅行相簿 ${st.photos.length} 張`);
    box.append(h);
    if (!st.photos.length) { const n = document.createElement('p'); n.className = 'note'; n.textContent = `還沒有旅行照：帶毛孩出門滿 ${needText()}就能拍`; box.append(n); return; }
    const grid = document.createElement('div'); grid.className = 'trip-grid';
    for (const ph of st.photos) {
      const b = document.createElement('button'); b.type = 'button'; b.className = 'trip-thumb';
      const im = document.createElement('img'); im.alt = `${ph.name}在${cityName(ph.city)}`;
      const s = document.createElement('span'); s.textContent = `${ph.name}・${cityName(ph.city)}`;
      b.append(im, s); b.onclick = () => { if (sec.hidden) open(ph); else showView(ph); };
      photoCanvas(ph).then(cv => { im.src = cv.toDataURL('image/png'); }).catch(() => { s.textContent += '（圖下載不了）'; });
      grid.append(b);
    }
    box.append(grid);
  }

  // ---------- 產圖：同一個代號（key）可以一直重送，伺服器回同一張 ----------
  let walkOn = false, waitTimer = 0;
  function showWait() {
    showPart('tripWait');
    const r = st.run;
    $('tripWaitText').textContent = `${r.name}去${cityName(r.city)}${sceneName(r.scene)}了…`;
    $('tripWaitErr').hidden = !r.err; $('tripWaitErr').textContent = r.err || '';
    $('tripRetry').hidden = !r.err;
    tickWait();
    if (!walkOn) { walkOn = true; requestAnimationFrame(walk); }
  }
  function tickWait() {
    clearTimeout(waitTimer);
    const r = st.run;
    if (!r || $('tripWait').hidden) return;
    $('tripWaitSec').textContent = r.err ? '照片還沒拿到（不會多扣今天的張數）' : `AI 畫照片中・${Math.round((Date.now() - r.t0) / 1000)} 秒（通常 15～40 秒）`;
    waitTimer = setTimeout(tickWait, 1000);
  }
  function walk(t) {                       // 等待畫面：牠在那個城市走來走去
    if (!walkOn || sec.hidden || $('tripWait').hidden || !st.run) { walkOn = false; return; }
    const cv = $('tripWalk'), c = cv.getContext('2d'), r = st.run, p = findPet(r.cid);
    cv.width = PW; cv.height = PH; c.imageSmoothingEnabled = false;
    drawPlace(c, r.city, r.scene);
    if (p) {
      const d = D.petInfo(p), im = D.img(d.file);
      if (im.complete && im.naturalWidth) {
        const [row, n] = d.anims[D.animOf(d, ['walk', 'idle'])], f = Math.floor(t / 160) % n;
        const span = PW + d.w, x = (t / 40) % span - d.w, y = PH - 7 - feet(d, im, row);
        c.drawImage(im, f * d.w, row * d.h, d.w, d.h, Math.round(x), y, d.w, d.h);   // 往右走（圖本來就朝右）
      }
    }
    requestAnimationFrame(walk);
  }
  function start(job) {                    // job＝{acct, key, cid, name, city, scene, at}
    savePending(job);
    st.run = { ...job, t0: Date.now(), err: '' };
    if (!sec.hidden) showWait();
    badge();
    send();
  }
  async function send() {
    const r = st.run;
    if (!r || r.sending) return;
    r.sending = true; r.err = ''; r.t0 = Date.now();
    if (!sec.hidden && !$('tripWait').hidden) showWait();
    let res = null;
    const fail = msg => {                    // 還沒拿到：留著代號，〔再試一次〕／網路回來用同一個 key 再問
      r.err = msg;
      if (!sec.hidden && !$('tripWait').hidden) showWait();
      else D.toast('旅行照還沒拿到', ['再試一次', () => { open(); send(); }]);
    };
    try { res = normMake(await SV.tripMake(r.cid, r.city, r.scene, r.key, WAIT_MS), r); }
    catch (e) {
      r.sending = false;
      if (st.run !== r) return;
      fail(e.code === 'timeout' ? '等太久了，再試一次' : e.code === 'auth' ? '登入過期了，請再登入' : (e.message || '連不上伺服器'));
      return;
    }
    r.sending = false;
    if (st.run !== r) return;
    if (res.busy) { setTimeout(send, 5000); return; }   // 同一個代號還在畫：等一下再問
    if (res.retry) { fail(res.retry); return; }
    st.run = null; savePending(null); walkOn = false; badge();
    if (!res || res.ok === false) {
      const f = res && REASON[res.reason];
      st.err = f ? f(res) : '沒辦法拍，等一下再試';
      if (res && res.reason === 'daily_used') { st.left = 0; st.nextAt = res.next_at || st.nextAt; st.err = ''; }
      await refresh(true);
      if (!sec.hidden) showPick(); else D.toast(st.err || '今天的張數用完了');
      return;
    }
    const ph = { ...res.photo, why: res.why, fresh: true };
    if (String(ph.id).startsWith('local-')) localPhotos.unshift(ph);
    if (!ph.fallback) st.left = Math.max(0, st.left - 1);   // 今天用掉 1 張（下面再跟伺服器對一次）
    st.photos = [ph, ...st.photos.filter(x => x.id !== ph.id)];
    st.at = Date.now();
    refresh(true).then(() => { if (!sec.hidden && !$('tripPick').hidden) renderPick(); badge(); });
    if (!sec.hidden) showView(ph);
    else D.toast(`${ph.name}的旅行照洗好了`, ['看照片', () => open(ph)]);
    if (window.DCPocket) window.DCPocket.render();
  }

  // ---------- 看照片、存到照片 ----------
  let tipTimer = 0;
  function tip(msg) { $('tripTip').textContent = msg; $('tripTip').hidden = false; clearTimeout(tipTimer); tipTimer = setTimeout(() => { $('tripTip').hidden = true; }, 6000); }
  async function showView(ph) {
    st.view = ph; showPart('tripView');
    $('tripTip').hidden = true;
    $('tripCap').textContent = `${ph.name}・${cityName(ph.city)}・${sceneName(ph.scene)}`;
    const note = ph.fallback ? (ph.why === 'error' ? 'AI 這次沒畫好，先送你風景照（不算今天的張數）' : 'AI 今天畫累了，先送你風景照（不算今天的張數）') : '';
    $('tripNote').textContent = note; $('tripNote').hidden = !note;
    const im = $('tripImg'); im.removeAttribute('src');
    try { const cv = await photoCanvas(ph); if (st.view === ph) im.src = cv.toDataURL('image/png'); }
    catch (_) { if (st.view === ph) { $('tripNote').textContent = '照片下載不了，檢查網路'; $('tripNote').hidden = false; } }
    const f = await photoFile(ph).catch(() => null);
    $('tripShare').hidden = !(f && navigator.canShare && navigator.canShare({ files: [f] }));
  }
  // 存到照片：跟合照一樣叫分享選單（不帶文字，「儲存影像」才在最前面）；沒有分享選單就長按照片（製作規則第 3 節）
  $('tripSave').onclick = async () => {
    if (!st.view) return;
    const f = await photoFile(st.view).catch(() => null);
    if (!f) { tip('照片還沒準備好'); return; }
    if (!(navigator.canShare && navigator.canShare({ files: [f] }))) { tip('長按照片 →「加入照片」'); return; }
    tip('選「儲存影像」存進照片');
    try { await navigator.share({ files: [f] }); } catch (e) { if (e && e.name !== 'AbortError') tip('長按照片 →「加入照片」'); }
  };
  $('tripShare').onclick = async () => {
    if (!st.view) return;
    const f = await photoFile(st.view).catch(() => null);
    if (f) try { await navigator.share({ files: [f], title: `${st.view.name}的旅行照` }); } catch (_) { /* 取消 */ }
  };
  $('tripDone').onclick = close;
  $('tripClose').onclick = close;
  $('tripLeave').onclick = () => { close(); D.toast('畫好會放進旅行相簿'); };
  $('tripRetry').onclick = () => send();
  $('tripGo').onclick = () => {
    const pet = pocketPet();
    if (!pet || !st.city || !st.scene) return;
    D.say(pet, D.line(pet, 'tripphoto_go', { other: cityName(st.city) }));
    start({ acct: acct(), key: newKey(), cid: pet.p.id, name: pet.p.name, city: st.city, scene: st.scene, at: Date.now() });
  };
  addEventListener('online', () => { if (st.run && st.run.err) send(); });   // 網路回來了：用同一個代號再問

  // 口袋頁用：〔旅行照〕按鈕（伺服器有這個功能才出現；可以拍了冒一個點）、口袋頁的相簿
  async function pocketShown() {
    const btn = $('pocketTrip');
    if (!usable()) { btn.hidden = true; renderAlbum($('pocketAlbum')); return; }
    if (!st.run) { const pend = loadPending(); if (pend) start(pend); }   // 上次畫到一半關掉了：接著問
    await refresh();
    btn.hidden = st.ok !== true;
    badge();
    renderAlbum($('pocketAlbum'));
  }
  function badge() {
    const pet = pocketPet(), btn = $('pocketTrip');
    btn.classList.toggle('ready', !!(pet && st.ok === true && st.left > 0 && !st.run && minsOut(pet.p) >= st.need));
    btn.classList.toggle('busy', !!st.run);
  }
  setInterval(() => { if (!$('view-pocket').hidden) badge(); }, 15000);

  window.DCTrip = { open, close, pocketShown, badge, renderAlbum, drawPlace, drawPetOn, petReady, norm: { normMake, normMine }, CITIES, SCENES, PW, PH, get st() { return st; } };
})();
