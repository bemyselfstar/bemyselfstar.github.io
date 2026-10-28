// DeskCat 手機網頁：連伺服器（Supabase）。P66 M4：從假資料改成讀伺服器（2026-10-16）。
// 登入＝信箱驗證碼（跟電腦版同一個帳號；之後再加 Google）。這裡只放公開鑰匙（跟 src/online_config.py 同一組），
// 管理鑰匙、資料庫密碼絕對不能放進網頁。權限靠伺服器的函式（server/011～013）。
// 網頁、手機用的函式都不檢查「現在的裝置」→ 手機登入不會把電腦踢下線（跨線需求 2026-10-14）。
//   讀：dc_pets_mine、dc_actions_mine、dc_friend_sprites；寫：dc_action_add、dc_pet_move
//   信箱（server/016，2026-10-16 晚上）：dc_mail_mine（一次讀完）、dc_mail_claim（打開禮物）、dc_mail_gift（送禮）、dc_mail_like（按 🐾）
//   紀念品（server/017，2026-10-17）：dc_souvenirs_mine、dc_souvenirs_add（〔放回家〕）、dc_souvenirs_merge（手機裡以前存的合併上去）
//   毛孩圖：Storage pet-sprites/<帳號>/<sprite>.png／.json（檔名帶指紋：外觀變了檔名就變 → 下載過的存在瀏覽器，不再下載）
//   口袋 AI 旅行照（2026-10-17，伺服器那一半遊戲線做；規格在 docs/跨線需求.md 2026-10-17「手機要叫的函式」）：
//     Edge Function trip-photo（產圖 15～45 秒；遊戲線 server/functions/trip-photo）、dc_trip_photos_mine（server/018：相簿＋今天還能不能拍）、Storage trip-photos/<file>（圖）
//   手機的家 家具跟著帳號（server/020，P78，2026-10-19）：dc_home_mine（電腦買過的家具＋手機的擺法、伴手禮）、dc_home_layout_set（存擺法、伴手禮）
//   P74 只有手機也能玩（2026-10-20，手機那半先用假伺服器做；伺服器那半＝docs/跨線需求.md 2026-10-20 📱 第 1 條，🎮 做）：
//     開新帳號＝信箱驗證碼 create_user: true（先用 false 試，沒有帳號才問要不要開）；暱稱＝profiles 表（001，自己的那一列可以改 nickname）；
//     刪帳號 dc_account_delete（🎮 新的：現在的 delete_my_account 要電腦裝置，手機叫不了）；
//     手機建立毛孩 dc_pet_create(p_cfg, p_sprite)（🎮 019）＋毛孩圖自己傳 Storage pet-sprites/<帳號>/<cid>-<指紋>.png／.json（權限 013 已經可以）
(window.DC_BUILD = window.DC_BUILD || {})['server.js'] = 78;   // 版本戳記（mobile/tools/bump.py 一起加 1；不一樣＝手機有舊檔）
(() => {
  'use strict';
  const SERVERS = {
    dev: { name: 'deskcat-dev（開發）', url: 'https://kzoobeloeqbfmdcndler.supabase.co', key: 'sb_publishable_Wg2X80iEVJTaJonOTtHq0w_epFtB7IK',
      push: 'BFQ6kJVIepUK1I9uHQ-Pr6LK1gu7tsZsQH3oT4ldE2qaReU0rGyI_WNyh8WAUg6QxM9yRJWXFdIpCP1UG_6RbX0' },   // 🎮 024 dev 伺服器自己產生的（dc_push_public_key()，2026-10-21）
    release: { name: 'deskcat（正式）', url: 'https://pjbiyvakvtgnjgbatsri.supabase.co', key: 'sb_publishable_-aEcZNFZ5muOoGR8BNZoHw_3zt7rpAt',
      push: 'BC_RgV9mIjj0vsWXbDYCTj7sfWugg4AGgH4oVw96v4aRCgljz5RfD59wvp6pWPsPRr61ejP5aNA-xGxqQ0LrkgY' },   // 🎮 024 正式版伺服器自己產生的（dc_push_public_key()，2026-10-23 讀回一致）
  };
  const params = new URLSearchParams(location.search);
  // 在家裡 Wi-Fi、本機開（開發中）＝dev；正式網址＝正式。網址加 ?server=dev／release 可以指定，**這台瀏覽器會記住**
  // （2026-10-22：正式網址用 dev 試推播時，點通知打開的網址 ./?tab=… 沒帶 ?server=，不記住就跑去正式伺服器；?server=release 改回來）
  const local = location.protocol === 'file:' || /^(localhost|127\.|192\.168\.|10\.|172\.(1[6-9]|2\d|3[01])\.)/.test(location.hostname);
  const SERVER_KEY = 'deskcat_server_v1';
  let picked = params.get('server');
  try {
    if (SERVERS[picked]) localStorage.setItem(SERVER_KEY, picked);
    else picked = localStorage.getItem(SERVER_KEY);
  } catch (_) { /* 存不了：只看網址 */ }
  const which = SERVERS[picked] ? picked : (local ? 'dev' : 'release');
  const S = SERVERS[which];

  // 瀏覽器記的（裝置規格.md 第 4 節）：登入資料（照伺服器分開）、選了「先看範例」
  const SESSION_KEY = 'deskcat_session_v1', MODE_KEY = 'deskcat_mode_v1';
  const load = (k, d) => { try { return JSON.parse(localStorage.getItem(k) || 'null') ?? d; } catch (_) { return d; } };
  const store = (k, v) => { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, JSON.stringify(v)); } catch (_) { /* 存不了：這次開著還是能用 */ } };
  let sessions = load(SESSION_KEY, {});
  if (typeof sessions !== 'object' || Array.isArray(sessions)) sessions = {};
  let session = sessions[which] || null;
  const saveSession = s => { session = s; sessions[which] = s || undefined; store(SESSION_KEY, sessions); };

  // 模式：fake＝假資料（範例、開發預覽）、live＝登入了讀伺服器、login＝還沒登入
  // 正式網址一律要登入，沒有範例（2026-10-17 使用者：「不要塞假資料 這邊一律要求登入 因為目前還沒有串接 在網頁 手機製作寵物」）：
  //   ?fake=1、之前選過〔先看範例〕都不算，記著的也清掉（加到主畫面的那一份也是）。範例只留給本機／家裡 Wi-Fi 的開發預覽
  const canFake = local;
  if (!canFake && load(MODE_KEY, '') === 'fake') store(MODE_KEY, null);
  let mode = canFake && params.get('fake') === '1' ? 'fake' : session ? 'live' : canFake && load(MODE_KEY, '') === 'fake' ? 'fake' : 'login';
  if (params.get('fake') === '0' && mode === 'fake') mode = session ? 'live' : 'login';

  class ServerError extends Error {
    constructor(msg, code, status) { super(msg); this.code = code; this.status = status; }
  }
  // 伺服器的英文錯誤 → 白話（提示 18 字以內，製作規則第 2 節）
  function friendly(status, body, path) {
    const t = String((body && (body.msg || body.message || body.error_description || body.error || body.code)) || '').toLowerCase();
    const login = path.startsWith('/auth/v1/otp') || path.startsWith('/auth/v1/verify');
    if (login && /signup|not allowed|user not found/.test(t)) return new ServerError('這個信箱還沒有帳號', 'no_account', status);
    if (login && /expired|invalid|otp/.test(t) && status < 500) return new ServerError('驗證碼不對或過期了', 'bad_code', status);
    if (path.startsWith('/auth/v1/token?grant_type=pkce') && status < 500) return new ServerError('Google 登入沒有完成，再試一次', 'bad_code', status);
    if (path.startsWith('/auth/v1/token') && status < 500) return new ServerError('登入過期了，請再登入', 'auth', status);
    if (status === 429 || /rate limit|security purposes/.test(t)) return new ServerError('寄太多次了，等一下再試', 'rate', status);
    if (/email/.test(t) && status === 400) return new ServerError('信箱格式不對', 'bad_email', status);
    if (status === 401 || /jwt|not logged in/.test(t)) return new ServerError('登入過期了，請再登入', 'auth', status);
    return new ServerError('伺服器有狀況，等一下再試', 'server', status);
  }

  async function http(method, path, body, token, accept = 'json') {
    const h = { apikey: S.key };
    if (body !== undefined) h['Content-Type'] = 'application/json';
    if (token) h.Authorization = 'Bearer ' + token;
    let r;
    try {
      r = await fetch(S.url + path, { method, headers: h, body: body === undefined ? undefined : JSON.stringify(body), cache: 'no-store' });
    } catch (_) {
      throw new ServerError('連不上伺服器，檢查網路', 'offline', 0);
    }
    if (!r.ok) {
      let j = null; try { j = await r.json(); } catch (_) { /* 不是 JSON */ }
      const err = friendly(r.status, j, path); err.body = j;   // 旅行照的函式不是 200 時也帶 {status, reason}（tripMake 拿來用）
      throw err;
    }
    if (accept === 'blob') return r.blob();
    const txt = await r.text();
    return txt ? JSON.parse(txt) : null;
  }

  // ---------- 登入（信箱驗證碼） ----------
  const asSession = d => ({
    access_token: d.access_token, refresh_token: d.refresh_token,
    expires_at: d.expires_at || Math.floor(Date.now() / 1000) + (d.expires_in || 3600),
    uid: d.user && d.user.id, email: d.user && d.user.email,
  });
  // create＝false：只登入已經有的帳號（打錯字不會多開一個空帳號）；沒有帳號（no_account）畫面問過「要開新帳號嗎」才用 true（P74 M1）
  const sendCode = (email, create = false) => http('POST', '/auth/v1/otp', { email: email.trim(), create_user: !!create });
  async function verify(email, code) {
    const d = await http('POST', '/auth/v1/verify', { type: 'email', email: email.trim(), token: code.trim() });
    if (!d || !d.access_token) throw new ServerError('登入失敗，再試一次', 'server', 0);
    saveSession(asSession(d)); store(MODE_KEY, null); mode = 'live';
    return session;
  }
  // 換新的登入鑰匙（每小時一次）。P83（2026-10-27）：以前換的時候伺服器忙、太多次也當成被登出 → 隔幾天打開常要重新登入
  //   （正式伺服器查過：那幾段登入其實都還有效＝手機自己忘掉的）。現在只有伺服器明確說「這段登入不能用了」（400／401／403）才登出；
  //   斷線、伺服器忙 5 秒內再試（Supabase 舊鑰匙約 10 秒內再用會拿到同一把新的，超過就整段作廢）；還是不行就保留登入、下次要用時再換。
  const dead = e => e.code === 'auth' && [400, 401, 403].includes(e.status);
  const wait = ms => new Promise(r => setTimeout(r, ms));
  async function refreshTry(rt) {
    for (const pause of [0, 1500, 3500]) {
      if (pause) await wait(pause);
      try { return await http('POST', '/auth/v1/token?grant_type=refresh_token', { refresh_token: rt }); } catch (e) {
        if (pause === 3500 || !(e.code === 'offline' || e.status >= 500)) throw e;
      }
    }
  }
  let refreshing = null;
  function refresh() {
    if (!refreshing) {
      const was = session;
      refreshing = refreshTry(was.refresh_token)
        .then(d => {
          if (!d || !d.access_token) throw new ServerError('伺服器有狀況，等一下再試', 'server', 0);
          if (session !== was) return;                // 換的時候按了登出、或登入了別的帳號：不要蓋回去
          saveSession({ ...asSession(d), uid: (d.user && d.user.id) || was.uid, email: (d.user && d.user.email) || was.email });
        })
        .catch(e => {
          if (dead(e)) { if (session === was) expired('gone'); throw e; }
          throw e.code === 'auth' ? new ServerError('伺服器有狀況，等一下再試', 'server', e.status) : e;   // 429 這類：不是登入壞了
        })
        .finally(() => { refreshing = null; });
    }
    return refreshing;
  }
  async function token() {
    if (!session) throw new ServerError('還沒登入', 'auth', 401);
    if (session.expires_at - 60 < Date.now() / 1000) await refresh();
    return session.access_token;
  }
  // 從背景回來、鑰匙 5 分鐘內要過期：先安靜換好（P83），不要等畫面讀資料時才換
  if (typeof document !== 'undefined') document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && session && session.expires_at - 300 < Date.now() / 1000) refresh().catch(() => { /* 下次要用時再換 */ });
  });
  // 登出紀錄（P83 M1）：照伺服器記最近 5 次 {at, why}；why＝gone（伺服器說這段登入不能用了）／user（自己按登出）／deleted（刪帳號）。
  // 登入畫面顯示最近一次被伺服器登出的時間；沒有紀錄、連信箱都要重打＝iPhone 把這個網頁的資料清掉了
  const OUT_KEY = 'deskcat_logout_log_v1';
  function noteOut(why) {
    let all = load(OUT_KEY, {});
    if (!all || typeof all !== 'object' || Array.isArray(all)) all = {};
    const list = Array.isArray(all[which]) ? all[which] : [];
    all[which] = [{ at: Date.now(), why }, ...list].slice(0, 5); store(OUT_KEY, all);
  }
  const listeners = new Set();
  function expired(why) {                 // 登入不能用了（被登出、換密碼…）：清掉，畫面回到登入
    noteOut(why || 'gone');
    saveSession(null); mode = 'login';
    listeners.forEach(f => { try { f('expired'); } catch (_) { /* 一個壞了不影響別的 */ } });
  }
  async function authed(method, path, body, accept) {
    try {
      return await http(method, path, body, await token(), accept);
    } catch (e) {
      if (e.code !== 'auth' || !session) throw e;
      await refresh();                    // 過期：續一次再試
      return http(method, path, body, await token(), accept);
    }
  }
  const rpc = (fn, args = {}) => authed('POST', '/rest/v1/rpc/' + fn, args);
  async function logout() {
    const t = session && session.access_token;
    if (session) noteOut('user');
    saveSession(null); mode = 'login';
    if (t) try { await http('POST', '/auth/v1/logout?scope=local', {}, t); } catch (_) { /* 伺服器那邊失敗也沒關係：這台已經忘了 */ }
  }
  function chooseFake(on) { store(MODE_KEY, on && canFake ? 'fake' : null); }

  // ---------- 帳號資料（P74 M1）：暱稱（好友看得到）、刪帳號 ----------
  async function profile() {               // {nickname, friend_code}；新帳號 nickname＝''
    const rows = await authed('GET', `/rest/v1/profiles?select=nickname,friend_code&id=eq.${session.uid}`);
    return (rows && rows[0]) || null;
  }
  const setNickname = nick => authed('PATCH', `/rest/v1/profiles?id=eq.${session.uid}`, { nickname: String(nick).trim().slice(0, 20) });
  async function accountDelete() {         // 伺服器上這個帳號的東西全部刪掉（電腦版也是同一個帳號）→ 這台登出
    await rpc('dc_account_delete');
    noteOut('deleted');
    saveSession(null); mode = 'login';
  }
  // 毛孩圖自己傳上去（手機建立的毛孩：零件包組好的圖表，格式跟電腦 src/pet_sprites.py 一樣）。file＝<cid>-<指紋>
  async function spriteUpload(file, png, meta) {
    const t = await token(), base = `${S.url}/storage/v1/object/pet-sprites/${session.uid}/${file}`;
    const put = async (ext, body, type) => {
      let r;
      try { r = await fetch(base + ext, { method: 'POST', headers: { apikey: S.key, Authorization: 'Bearer ' + t, 'Content-Type': type, 'x-upsert': 'true' }, body }); }
      catch (_) { throw new ServerError('連不上伺服器，檢查網路', 'offline', 0); }
      if (!r.ok) throw new ServerError('毛孩圖傳不上去，等一下再試', 'server', r.status);
    };
    await put('.png', png, 'image/png');
    await put('.json', JSON.stringify(meta), 'application/json');
  }

  // ---------- Google 登入（2026-10-16；跟電腦版 online.google_login 同一套：PKCE 一次性鑰匙對） ----------
  // 按〔用 Google 登入〕→ 整頁跳到 Supabase → Google 選帳號 → 跳回這一頁（網址帶 ?code=）→ 用 code＋鑰匙換登入資料。
  // 跳回來的網址要先登記在 Supabase「Authentication → URL Configuration → Redirect URLs」，沒登記會跳到別的地方（mobile/README.md）。
  // 家裡 Wi-Fi 是 http：瀏覽器不給 crypto.subtle（算不了 SHA-256）→ 用 plain（Supabase 支援）；https 正式網址用 s256。
  // Google 登入沒辦法擋「還沒有帳號的人」（會開一個新帳號）：新帳號沒有毛孩，畫面會說「打開電腦版」。
  const PKCE_KEY = 'deskcat_pkce_v1';
  const b64url = bytes => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const backUrl = () => location.origin + location.pathname + (SERVERS[params.get('server')] ? '?server=' + which : '');
  async function googleStart() {
    const verifier = b64url(crypto.getRandomValues(new Uint8Array(48)));
    let challenge = verifier, method = 'plain';
    if (window.crypto && crypto.subtle) {
      try { challenge = b64url(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier)))); method = 's256'; } catch (_) { /* 用 plain */ }
    }
    store(PKCE_KEY, { which, verifier, at: Date.now() });
    const q = new URLSearchParams({ provider: 'google', redirect_to: backUrl(), code_challenge: challenge, code_challenge_method: method, prompt: 'select_account' });
    location.href = S.url + '/auth/v1/authorize?' + q;
  }
  // 從 Google 跳回來：網址上有 code（或 error）＋這台記著鑰匙 → 換登入資料。googleDone＝那個 Promise（沒有就是 null）
  let googleDone = null;
  {
    const hash = new URLSearchParams(location.hash.slice(1)), pk = load(PKCE_KEY, null);
    const code = params.get('code'), err = params.get('error_description') || params.get('error') || hash.get('error_description') || hash.get('error');
    if ((code || err) && pk && pk.which === which) {
      store(PKCE_KEY, null);
      history.replaceState(null, '', backUrl());            // 網址上的 code 拿掉（重新整理才不會再用一次）
      if (err || Date.now() - pk.at > 10 * 60000) {
        googleDone = Promise.reject(new ServerError(/provider is not enabled|unsupported provider/i.test(err || '') ? 'Google 登入還沒打開' : err ? 'Google 登入沒有完成' : '等太久了，再按一次', 'google', 0));
      } else {
        googleDone = http('POST', '/auth/v1/token?grant_type=pkce', { auth_code: code, code_verifier: pk.verifier }).then(d => {
          if (!d || !d.access_token) throw new ServerError('Google 登入沒有完成', 'google', 0);
          saveSession(asSession(d)); store(MODE_KEY, null); mode = 'live';
          return session;
        });
      }
      googleDone.catch(() => { /* 畫面那邊（showLogin）會顯示原因 */ });
      mode = 'login';
    }
  }

  // ---------- 毛孩圖（存在瀏覽器的 IndexedDB：http 的家裡 Wi-Fi 也能用；Cache API 要 https） ----------
  const DB_NAME = 'deskcat_sprites_v1';
  let dbp = null;
  function db() {
    if (!dbp) dbp = new Promise(res => {
      try {
        const rq = indexedDB.open(DB_NAME, 1);
        rq.onupgradeneeded = () => rq.result.createObjectStore('files');
        rq.onsuccess = () => res(rq.result);
        rq.onerror = rq.onblocked = () => res(null);
      } catch (_) { res(null); }            // 不能用（私密瀏覽…）：每次重新下載
    });
    return dbp;
  }
  async function dbDo(kind, ...a) {
    const d = await db();
    if (!d) return null;
    return new Promise(res => {
      try {
        const tx = d.transaction('files', kind === 'get' || kind === 'getAllKeys' ? 'readonly' : 'readwrite');
        const rq = tx.objectStore('files')[kind](...a);
        rq.onsuccess = () => res(rq.result ?? null); rq.onerror = () => res(null);
      } catch (_) { res(null); }
    });
  }
  // 旅行照的圖（trip.js）：照 path 存在同一個 IndexedDB（鍵用「trip:」開頭，pruneSprites 不會刪到）。同一個 path 內容不會變
  const tripMemo = {};
  function tripImage(path) {
    const id = `trip:${which}/${path}`;
    if (!tripMemo[id]) tripMemo[id] = (async () => {
      const got = await dbDo('get', id);
      if (got instanceof Blob) return got;
      const png = await authed('GET', '/storage/v1/object/authenticated/trip-photos/' + path, undefined, 'blob');
      await dbDo('put', png, id);
      return png;
    })().catch(e => { delete tripMemo[id]; throw e; });
    return tripMemo[id];
  }
  // 產圖：等最久 ms 毫秒（太久＝timeout，畫面用同一個 key 再送；伺服器那邊同一個 key 不會再產、不會再扣）
  // spot＝街景代號（🎮 022，2026-10-21）：''／沒給＝不送（伺服器隨機抽一個街景）；野餐伺服器一律用公園
  function tripMake(cid, city, scene, key, ms = 90000, spot = '') {
    let timer = 0;
    const late = new Promise((_, rej) => { timer = setTimeout(() => rej(new ServerError('等太久了，再試一次', 'timeout', 0)), ms); });
    const go = authed('POST', '/functions/v1/trip-photo', spot ? { cid, city, scene, spot, key } : { cid, city, scene, key })
      .catch(e => { if (e.code !== 'auth' && e.body && e.body.status) return e.body; throw e; });   // 不是 200 但有說原因：照原因處理
    return Promise.race([go, late]).finally(() => clearTimeout(timer));
  }
  // 送我一則（🎮 雲端函式 push-send，P74 M4）：{ok: true, sent, gone, failed}／{ok: false, reason: none|too_soon|no_key|server}
  async function pushTest() {
    try { return await authed('POST', '/functions/v1/push-send', { test: true }); }
    catch (e) { if (e.code !== 'auth' && e.body && e.body.reason) return e.body; throw e; }   // 不是 200 但有說原因：照原因處理
  }

  const memo = {};                         // 這次開著已經準備好的：檔名 → Promise<圖的說明＋網址>
  // 一張圖表＝{species, breed, coat, w, h, anims: {動作: [第幾列, 幾格]}, ticks, file（給 <img> 用的網址）}；跟 fake/sprites.js 的一隻一樣
  function sprite(owner, file) {
    if (!file) return Promise.resolve(null);
    const id = `${which}/${owner}/${file}`;
    if (!memo[id]) memo[id] = (async () => {
      let got = await dbDo('get', id);
      if (!got || !(got.png instanceof Blob) || !got.meta) {
        const base = `/storage/v1/object/authenticated/pet-sprites/${owner}/${file}`;
        const [png, meta] = await Promise.all([authed('GET', base + '.png', undefined, 'blob'), authed('GET', base + '.json')]);
        got = { png, meta, at: Date.now() };
        await dbDo('put', got, id);
      }
      return { ...got.meta, file: URL.createObjectURL(got.png) };
    })().catch(e => { delete memo[id]; throw e; });
    return memo[id];
  }
  async function pruneSprites(keep) {      // 外觀換了：舊檔名用不到了，從瀏覽器刪掉（只刪這台伺服器的）
    const keys = await dbDo('getAllKeys');
    if (!keys) return;
    const want = new Set(keep.map(([o, f]) => `${which}/${o}/${f}`));
    for (const k of keys) if (String(k).startsWith(which + '/') && !want.has(k)) await dbDo('delete', k);
  }

  window.DCServer = {
    which, name: S.name, url: S.url, key: S.key, isLocal: local, canFake,   // canFake：可以看範例（只有開發預覽）
    // P74（開新帳號、刪帳號、在手機建立毛孩）：伺服器那半（🎮 019、dc_account_delete）還沒上之前，只在開發預覽打開；
    // 正式網址先維持舊的樣子（不會有按了壞掉的按鈕）。🎮 做好、零件放好 mobile/parts/ 後改成 true
    // 2026-10-22：零件放好了、dev 有 019 → 連 dev 時也打開（正式網址 ?server=dev 可以在 iPhone 試）
    // 2026-10-23：v4.17.0 正式伺服器也打開（使用者選「B 發 v4.17.0 正式版」；正式版 019、023、024、025 都上了）
    p74: true,
    // 網頁推播的公開鑰匙（VAPID 公鑰，可以放網頁；🎮 產生後填進 SERVERS 的 push，dev／正式各一把）。空的＝伺服器還沒準備好通知（notify.js）
    pushKey: S.push || '',
    get mode() { return mode; },
    get user() { return session ? { uid: session.uid, email: session.email } : null; },
    sendCode, verify, logout, chooseFake, rpc, sprite, pruneSprites, ServerError, googleStart,
    profile, setNickname, accountDelete, spriteUpload,                // P74 M1、M2
    // P74 M2（🎮 019）：{ok, cid}／{ok: false, reason}。p_poses＝小工具的小圖 {姿勢: PNG base64}（電腦 dc_pet_poses_set 同格式；sit 也當 avatar）
    // 通知（P74 M4，🎮 dc_push_subscribe／dc_push_unsubscribe）：p_sub＝PushSubscription.toJSON() {endpoint, keys: {p256dh, auth}}；同一個 endpoint＝更新要哪幾種
    pushSubscribe: (sub, kinds) => rpc('dc_push_subscribe', { p_sub: sub, p_kinds: kinds, p_device: /iP(hone|ad)/.test(navigator.userAgent) ? 'iphone' : /Android/.test(navigator.userAgent) ? 'android' : 'web' }),
    pushUnsubscribe: endpoint => rpc('dc_push_unsubscribe', { p_endpoint: endpoint }),
    pushTest,
    petCreate: (cfg, sprite, poses) => rpc('dc_pet_create', { p_cfg: cfg, p_sprite: sprite, p_poses: poses || {} }),
    // 換已經有的毛孩的外觀（🎮 019）：{ok, look_at}／{ok: false, reason: invalid／no_sprite／no_look（電腦舊版、伺服器沒有牠的外觀）／gone}
    petLookSet: (cid, look, sprite, poses) => rpc('dc_pet_look_set', { p_cid: cid, p_look: look, p_sprite: sprite, p_poses: poses || {} }),
    // 衣櫃（🎮 029，P74 M5）：{items: [代號…], at: 秒或 null}＝電腦上傳的 ∪ 友情點數買的；look 帶 wear 時衣櫃沒有的 → {ok: false, reason: 'not_owned', items}
    wardrobeMine: () => rpc('dc_wardrobe_mine'),
    get googleDone() { return googleDone; },          // 從 Google 跳回來、正在換登入資料（沒有＝null）
    onExpired: f => listeners.add(f),
    get lastLogout() { const l = load(OUT_KEY, {})[which]; return Array.isArray(l) && l[0] || null; },   // 最近一次登出 {at, why}（P83）
    // 讀、寫（server/011～013；回傳格式見 docs/專案/P66_手機網頁版.md 第 8 節）
    petsMine: () => rpc('dc_pets_mine'),
    actionsMine: () => rpc('dc_actions_mine'),
    actionAdd: (cid, kind) => rpc('dc_action_add', { p_cid: cid, p_kind: kind, p_by: matchMedia('(pointer: coarse)').matches ? 'phone' : 'web' }),
    petMove: (cid, place) => rpc('dc_pet_move', { p_cid: cid, p_place: place, p_by: matchMedia('(pointer: coarse)').matches ? 'phone' : 'web' }),
    friendSprites: () => rpc('dc_friend_sprites'),          // 016 起多回 nickname、name、look、species
    // 信箱（server/016；回傳格式見 P66 卡第 8 節「016 信箱手機版」）
    mailMine: () => rpc('dc_mail_mine'),                     // {points, friends, gifts_sent_today, mail, trips, feed, likes}
    mailClaim: id => rpc('dc_mail_claim', { p_id: id }),     // {points, already}
    mailGift: to => rpc('dc_mail_gift', { p_to: to }),       // 'sent'／'already'／'not_friend'／'self'
    mailLike: id => rpc('dc_mail_like', { p_id: id }),       // 'liked'／'unliked'／'gone'／'not_friend'
    // 紀念品跟著帳號（server/017，2026-10-17；用法見 docs/跨線需求.md 10-17「紀念品要跟著帳號走」）
    souvMine: () => rpc('dc_souvenirs_mine'),                // {種類: 次數}
    souvAdd: (kinds, key) => rpc('dc_souvenirs_add', { p_kinds: kinds, p_key: key }),   // {ok, again, souvenirs}；同一個 key 重送不會加兩次
    souvMerge: counts => rpc('dc_souvenirs_merge', { p_counts: counts }),              // {ok, souvenirs}；每種取大的、不相加
    // 口袋 AI 旅行照（2026-10-17；trip.js）
    tripMake,                                                // {ok, status: done／making／no, id, file, reused, reason, wait_min?, next_at?}（trip.js normMake）
    tripMine: () => rpc('dc_trip_photos_mine'),              // {photos: [{id, cid, name, city, scene, spot, tod, status, file, reused, created_at}], today_left, next_at, min_out_min}
    tripImage,                                               // path → Blob（下載過的存在瀏覽器）
    // 手機的家（server/020，P78；格式見 docs/跨線需求.md 2026-10-19 🎮 P78）。伺服器還沒有 020＝404（app.js 照舊只存瀏覽器）
    homeMine: () => rpc('dc_home_mine'),                     // {owned: {catbed: 1…}（只列有的）, owned_at, layout: [{k, x, y}] 或 null（沒存過）, extras: [{kind, x, y}], layout_at}
    homeLayoutSet: (layout, extras) => rpc('dc_home_layout_set', { p_layout: layout, p_extras: extras }),   // {ok, layout_at}／{ok: false, reason: 'invalid'}
  };
})();
