// DeskCat 手機網頁：連伺服器（Supabase）。P66 M4：從假資料改成讀伺服器（2026-10-16）。
// 登入＝信箱驗證碼（跟電腦版同一個帳號；之後再加 Google）。這裡只放公開鑰匙（跟 src/online_config.py 同一組），
// 管理鑰匙、資料庫密碼絕對不能放進網頁。權限靠伺服器的函式（server/011～013）。
// 網頁、手機用的函式都不檢查「現在的裝置」→ 手機登入不會把電腦踢下線（跨線需求 2026-10-14）。
//   讀：dc_pets_mine、dc_actions_mine、dc_friend_sprites；寫：dc_action_add、dc_pet_move
//   信箱（server/016，2026-10-16 晚上）：dc_mail_mine（一次讀完）、dc_mail_claim（打開禮物）、dc_mail_gift（送禮）、dc_mail_like（按 🐾）
//   毛孩圖：Storage pet-sprites/<帳號>/<sprite>.png／.json（檔名帶指紋：外觀變了檔名就變 → 下載過的存在瀏覽器，不再下載）
(window.DC_BUILD = window.DC_BUILD || {})['server.js'] = 30;   // 版本戳記（mobile/tools/bump.py 一起加 1；不一樣＝手機有舊檔）
(() => {
  'use strict';
  const SERVERS = {
    dev: { name: 'deskcat-dev（開發）', url: 'https://kzoobeloeqbfmdcndler.supabase.co', key: 'sb_publishable_Wg2X80iEVJTaJonOTtHq0w_epFtB7IK' },
    release: { name: 'deskcat（正式）', url: 'https://pjbiyvakvtgnjgbatsri.supabase.co', key: 'sb_publishable_-aEcZNFZ5muOoGR8BNZoHw_3zt7rpAt' },
  };
  const params = new URLSearchParams(location.search);
  // 在家裡 Wi-Fi、本機開（開發中）＝dev；正式網址＝正式。網址加 ?server=dev／release 可以指定
  const local = location.protocol === 'file:' || /^(localhost|127\.|192\.168\.|10\.|172\.(1[6-9]|2\d|3[01])\.)/.test(location.hostname);
  const which = SERVERS[params.get('server')] ? params.get('server') : (local ? 'dev' : 'release');
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
      throw friendly(r.status, j, path);
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
  // create_user: false＝手機不會多開一個空帳號（帳號一律在電腦版建立）
  const sendCode = email => http('POST', '/auth/v1/otp', { email: email.trim(), create_user: false });
  async function verify(email, code) {
    const d = await http('POST', '/auth/v1/verify', { type: 'email', email: email.trim(), token: code.trim() });
    if (!d || !d.access_token) throw new ServerError('登入失敗，再試一次', 'server', 0);
    saveSession(asSession(d)); store(MODE_KEY, null); mode = 'live';
    return session;
  }
  let refreshing = null;
  function refresh() {
    if (!refreshing) {
      refreshing = http('POST', '/auth/v1/token?grant_type=refresh_token', { refresh_token: session.refresh_token })
        .then(d => { saveSession({ ...asSession(d), uid: (d.user && d.user.id) || session.uid, email: (d.user && d.user.email) || session.email }); })
        .catch(e => { if (e.code !== 'offline') expired(); throw e; })
        .finally(() => { refreshing = null; });
    }
    return refreshing;
  }
  async function token() {
    if (!session) throw new ServerError('還沒登入', 'auth', 401);
    if (session.expires_at - 60 < Date.now() / 1000) await refresh();
    return session.access_token;
  }
  const listeners = new Set();
  function expired() {                    // 登入不能用了（被登出、換密碼…）：清掉，畫面回到登入
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
    saveSession(null); mode = 'login';
    if (t) try { await http('POST', '/auth/v1/logout?scope=local', {}, t); } catch (_) { /* 伺服器那邊失敗也沒關係：這台已經忘了 */ }
  }
  function chooseFake(on) { store(MODE_KEY, on && canFake ? 'fake' : null); }

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
    get mode() { return mode; },
    get user() { return session ? { uid: session.uid, email: session.email } : null; },
    sendCode, verify, logout, chooseFake, rpc, sprite, pruneSprites, ServerError, googleStart,
    get googleDone() { return googleDone; },          // 從 Google 跳回來、正在換登入資料（沒有＝null）
    onExpired: f => listeners.add(f),
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
  };
})();
