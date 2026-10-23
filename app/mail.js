// DeskCat 手機網頁「📬 信箱」（家的一部分，網頁、手機都有）：P66 新設計「家＝收明信片、每日禮物」＋好友動態。
// 內容照電腦版（src/social.py、social_pages.py 的 MailPage）：明信片、旅行日記、好友送的禮物盒、每天送每位好友一個禮物、🐾 好友動態。
// 2026-10-14 使用者：「不能作成流水帳的感覺」→ 每一封＝一張畫（scenes.js）＋一件最精彩的事：
//   明信片＝那一刻的畫＋一句話（2026-10-15 使用者：只講最主要的一件事，不翻面、不分頁）；收到的明信片釘在家裡牆上的軟木板；
//   旅行日記＝跟明信片一樣一張畫＋一句話（在好友家最精彩的那一刻），伴手禮可以放進家裡；
//   動態＝照片牆，每人每天只留最精彩的一則；按 🐾＝你的毛孩跑去按，照片裡的那隻冒愛心；你的動態被按，家裡那隻也會冒愛心。
// 資料：登入了讀伺服器（server/016：dc_mail_mine 一次讀完；打開禮物 dc_mail_claim、送禮 dc_mail_gift、按 🐾 dc_mail_like；
//   好友家的毛孩長相 dc_friend_sprites）；範例模式用假資料 fake/fake_mail.js。伺服器的格式在 fromServer 換成假資料的樣子，畫面只有一套。
//   「讀過沒」伺服器不記 → 存在這台手機（deskcat_mail_read_v1）。
// 伺服器只存「哪一種事＋數字」，句子在這裡照固定句型組（動態跟 social.py 的 MOMENT_TEXT 一樣，改的話兩邊一起改）。
// 版面：電腦橫版＝信件、動態兩欄並排；手機直拿＝上面兩個分頁切換（body.vertical）。
(window.DC_BUILD = window.DC_BUILD || {})['mail.js'] = 59;   // 版本戳記（mobile/tools/bump.py 一起加 1；不一樣＝手機有舊檔）
(() => {
  'use strict';
  const D = window.DC, S = window.DCScene, SV = window.DCServer, $ = id => document.getElementById(id);
  const LIVE = D.LIVE, SPR = window.FAKE_SPRITES, opened = Date.now();
  const EMPTY = () => ({ friends: [], giftsSentToday: [], petsOf: {}, mail: [], feed: [], points: 0 });
  let M = LIVE ? EMPTY() : window.FAKE_MAIL;
  let state = LIVE ? 'loading' : 'ok', errMsg = '', loadedAt = 0, loading = null, lastSig = '';
  let seg = 'letters';

  // ---------- 句型（social.py 的 MOMENT_TEXT、visit_lines） ----------
  const MOMENT_TEXT = {
    gacha: '{cat}家抽到了{rarity}飾品「{item}」！',
    hunt_crash: '{a}和{b}撲同一個獵物，在空中撞成一團 💫',
    pile_crash: '疊羅漢崩塌了！{cat}踩空，大家都在生悶氣',
    tug: '{win}搶球拔河贏了{lose} 💪',
    trip_back: '{cat}從{host}家玩回來了，帶了伴手禮 🧳',
    ambush: '{a}躲在視窗後面，偷襲了{b}！',
    dogride: '{cat}跳到{dog}背上搭便車 🐕',
    follow: '{kit}今天一直跟在{mom}後面 🐾',
    new_cat: '家裡來了新成員：{cat} 🎉',
    catch: '{cat}今天撲到逗貓棒 {n} 次',
  };
  // 照片牆：同一個人同一天只留最精彩的（越前面越精彩）；照片裡要畫哪幾隻（參數名）
  const MOMENT_ORDER = ['hunt_crash', 'pile_crash', 'dogride', 'ambush', 'tug', 'trip_back', 'gacha', 'new_cat', 'follow', 'catch'];
  const MOMENT_CAST = { pile_crash: ['cat'], tug: ['win', 'lose'], dogride: ['cat', 'dog'], catch: ['cat'], new_cat: ['cat'],
                        hunt_crash: ['a', 'b'], ambush: ['a', 'b'], follow: ['kit', 'mom'], trip_back: ['cat'], gacha: ['cat'] };
  const clean = v => String(v == null ? '' : v).slice(0, 12).replace(/[<>&]/g, '');
  const num = (d, k) => Math.max(0, Math.min(999, parseInt((d || {})[k], 10) || 0));
  // 旅行回來沒拿到伴手禮（電腦 v4.16.0 起多帶 gift：1＝有、0＝沒有；social.py TRIP_BACK_NONE）。沒有 gift 的舊動態照舊
  const TRIP_BACK_NONE = '{cat}從{host}家玩回來了 🧳';
  function momentText(kind, params) {
    const g = (params || {}).gift;
    const t = kind === 'trip_back' && g != null && g !== '' && Number(g) === 0 ? TRIP_BACK_NONE : MOMENT_TEXT[kind];
    if (!t) return '';
    let bad = false;
    const s = t.replace(/\{(\w+)\}/g, (_, k) => {
      const v = (params || {})[k];
      if (v == null) { bad = true; return ''; }
      return typeof v === 'number' ? String(Math.trunc(v)) : clean(v);
    });
    return bad ? '' : s;
  }
  const withWho = (d, host) => { const c = (d.host_cats || []).slice(0, 3).map(clean).filter(Boolean); return c.length ? c.join('、') : `${host}家的毛孩`; };
  function highlightText(key, d, host) {     // 正面那一句：只說最精彩的那件事
    const n = clean(d.name) || '牠', w = withWho(d, host);
    return {
      pile: `${n}跟${w}擠在一起睡著了`, tug: `${n}跟${w}搶球拔河 ${num(d, 'tug')} 回合`,
      nuzzle: `${n}跟${w}蹭來蹭去 💕`, play: `${n}跟${w}追來追去，玩瘋了`, groom: `${n}跟${w}互相理毛`,
      sniff: `${n}被${host}家的狗狗聞了又聞`, pet: `${host}摸了${n} ${num(d, 'pet')} 次，舒服到翻肚`,
      fed: `${n}在${host}家吃了 ${num(d, 'fed')} 碗飯`,
    }[key] || `${n}在${host}家安安靜靜看風景`;
  }
  const mins = min => min + (Date.now() - opened) / 60000;
  function ago(min) {
    const m = Math.round(mins(min));
    if (m < 2) return '剛剛';
    if (m < 60) return `${m} 分鐘前`;
    if (m < 60 * 24) return `${Math.round(m / 60)} 小時前`;
    return `${Math.round(m / 1440)} 天前`;
  }
  const dateOf = min => { const t = new Date(Date.now() - mins(min) * 60000); return `${t.getMonth() + 1}/${t.getDate()}`; };

  // ---------- 小工具 ----------
  const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
  function avatar(sprite, cls = 'mail-av') { // 毛孩頭像（用遊戲影格）
    const c = el('canvas', cls);
    if (sprite && window.FAKE_SPRITES.pets[sprite]) D.drawAvatar(c, { sprite });
    return c;
  }
  function scene(w, h, spec, cls) {          // 那一刻的畫（scenes.js）
    const c = el('canvas', cls); c.width = w; c.height = h; S.draw(c, spec); return c;
  }
  // 名字 → 長相：自己家的看 HOME，好友家的看好友給看的毛孩（伺服器 dc_friend_sprites；假資料 petsOf）。
  // owner：'me'＝自己家、好友的 id＝那一家（不同好友的毛孩可能同名）、沒給＝先找自己家再找好友（假資料）
  function spriteOf(name, fb = '橘虎斑', owner) {
    const pets = M.petsOf || {};
    if (owner !== undefined && owner !== 'me') return lookOf(pets[owner + '|' + name] || pets[name] || fb);
    const p = D.HOME.pets.find(q => q.name === name);
    return p && p.sprite ? p.sprite : lookOf(owner === 'me' ? fb : pets[name] || fb);
  }
  // 好友毛孩的長相 {sprite, look, species}（伺服器）→ 現在能畫的那張；假資料直接是名字
  const lookOf = v => typeof v === 'string' ? v : !v ? '' : v.sprite && SPR.pets[v.sprite] ? v.sprite
    : SPR.pets[v.look] ? v.look : v.species === 'dog' ? '柴犬' : '白貓';
  const hostSprites = (d, owner) => (d.host_cats || []).slice(0, 2).map(n => spriteOf(n, '白貓', owner));
  const unopened = () => M.mail.filter(m => m.kind === 'gift' && !m.claimed);
  const unread = () => M.mail.filter(m => m.kind !== 'gift' && !m.read);
  const freshLikes = () => M.feed.filter(f => f.mine && f.fresh);
  const store = (k, fb) => { try { return JSON.parse(localStorage.getItem(k) || 'null') || fb; } catch (_) { return fb; } };
  const PLACED_KEY = 'deskcat_souvenir_placed_v1';   // 已經放進家裡的伴手禮（哪幾封日記）
  const placed = new Set(store(PLACED_KEY, []));

  function badge() {                         // 分頁列 📬 的數字：還沒打開的禮物＋沒看過的信＋新的 🐾
    const n = unopened().length + unread().length + freshLikes().length;
    const tab = document.querySelector('.tabs [data-tab="mail"]');
    let b = tab.querySelector('.badge');
    if (!n) { if (b) b.remove(); tab.removeAttribute('aria-label'); return; }
    if (!b) { b = el('i', 'badge'); tab.appendChild(b); }
    b.textContent = n > 9 ? '9+' : n;
    tab.setAttribute('aria-label', `信箱，${n} 件新的`);
  }

  // ---------- 禮物盒 ----------
  function giftCard(m) {
    const li = el('li', 'letter gift');
    const box = el('div', 'gift-box'); box.append(D.icon('gift'));
    const mid = el('div', 'letter-mid');
    mid.append(el('div', 'letter-title', `${clean(m.from)}送你一個禮物盒`), el('div', 'letter-sub', ago(m.ago)));
    const b = el('button', 'btn main', '打開');
    b.onclick = async () => {
      b.disabled = true; li.classList.add('opening');
      let pts = m.cans, already = false;
      if (LIVE) {                            // 伺服器決定點數、每份只能領一次（dc_mail_claim；電腦、手機兩邊都按也只領一次）
        try {
          const r = await SV.mailClaim(m.sid) || {};
          pts = Math.max(0, parseInt(r.points, 10) || 0); already = !!r.already;
        } catch (e) {
          b.disabled = false; li.classList.remove('opening'); D.toast(e.message || '連不上伺服器'); return;
        }
      }
      setTimeout(() => {
        m.claimed = true; m.read = true; m.cans = pts;
        if (!already) M.points = (M.points || 0) + pts;
        li.classList.remove('opening'); li.classList.add('opened');
        box.textContent = '✨';
        mid.firstChild.textContent = `${clean(m.from)}送的禮物`;
        b.replaceWith(el('div', 'gift-got', pts ? `友情點數 +${pts}` : '收到心意了'));
        D.toast(already ? '這份之前打開過了' : pts ? `收到友情點數 +${pts}` : '今天的點數領完了');
        badge(); segCounts();
      }, matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 650);
    };
    li.append(box, mid, b);
    return li;
  }
  function giftDone(m) {                     // 打開過的禮物：一行就好
    const li = el('li', 'letter gift-done');
    const gb = el('div', 'gift-box small'); gb.append(D.icon('gift')); li.append(gb);
    const mid = el('div', 'letter-mid');
    mid.append(el('div', 'letter-title', `${clean(m.from)}送的禮物`), el('div', 'letter-sub', `${m.cans ? `友情點數 +${m.cans}` : '收到心意了'}・${ago(m.ago)}`));
    li.append(mid);
    return li;
  }

  // ---------- 💌 明信片、🧳 旅行日記：一張畫＋一句話（2026-10-15 使用者：只講最主要的一件事，不翻面、不分頁） ----------
  function letterCard(m, o) {
    const li = el('li', 'pc ' + o.kind + (m.read ? '' : ' new'));
    li.dataset.id = m.id;
    const face = el('div', 'pc-face');
    const pic = el('div', 'pc-pic');
    pic.append(scene(160, 96, o.spec, 'pc-canvas'));
    const stamp = el('div', 'pc-stamp'); stamp.append(avatar(o.me, 'pc-stamp-av'));
    pic.append(stamp, el('div', 'pc-mark', `${o.who}家\n${o.date}`));
    const cap = el('div', 'pc-cap');
    if (!m.read) cap.append(el('span', 'new-dot', '新'));
    cap.append(document.createTextNode(o.caption));
    face.append(pic, cap);
    if (o.extra) face.append(o.extra);
    const foot = el('div', 'pc-foot'), tools = el('div', 'pc-tools');
    const saveBtn = el('button', 'btn'); D.setLabel(saveBtn, 'share', '存成照片');
    saveBtn.onclick = () => openSave(postcardImage(pic.querySelector('canvas'), o.me, o.caption, o.who, o.date, o.saveFoot), o.saveTitle);
    tools.append(saveBtn);
    const ft = el('span', 'letter-sub'); D.setLabel(ft, o.kind === 'trip' ? 'trip' : 'letter', o.foot);
    foot.append(ft, tools);
    face.append(foot);
    li.append(face);
    return li;
  }
  function postcardCard(m) {
    const d = m.data || {}, who = clean(m.from) || '好友', key = S.visitHighlight(d), me = spriteOf(d.name);
    return letterCard(m, {
      kind: 'postcard', me, who, date: dateOf(m.ago), caption: highlightText(key, d, who),
      spec: { bg: 'room', house: who, ...S.visitCast(key, me, hostSprites(d, m.fromId), 160, 96) },
      foot: `${who}家寄來・${ago(m.ago)}`, saveFoot: `💌 ${who}家寄來`, saveTitle: `${clean(d.name) || '毛孩'}的明信片`,
    });
  }

  // ---------- 明信片存成照片（跟合照一樣：先看合成好的圖，再分享／存到手機；照片不上傳） ----------
  // 畫面放大 4 倍（像素不糊）＋白邊、郵票、郵戳、那一句話、DeskCat 字樣。用 toDataURL（同步），按下去馬上就能叫出分享。
  function postcardImage(sceneCv, me, caption, who, date, foot) {
    const K = 4, sw = sceneCv.width * K, sh = sceneCv.height * K, pad = 28, W = sw + pad * 2, H = sh + pad + 150;
    const out = document.createElement('canvas'); out.width = W; out.height = H;
    const c = out.getContext('2d');
    c.fillStyle = '#fbf6ec'; c.fillRect(0, 0, W, H);
    c.fillStyle = '#fff'; c.fillRect(pad - 8, pad - 8, sw + 16, sh + 16);
    c.imageSmoothingEnabled = false; c.drawImage(sceneCv, pad, pad, sw, sh);
    const st = document.createElement('canvas'); st.width = 0;
    D.drawAvatar(st, { sprite: me });                                                      // 郵票：去玩的那隻（圖已經載入，馬上畫好）
    const bx = pad + sw - 104, by = pad + 14;
    c.fillStyle = '#f3dcbd'; c.fillRect(bx, by, 88, 102);
    c.setLineDash([6, 4]); c.strokeStyle = '#c49a6c'; c.lineWidth = 3; c.strokeRect(bx, by, 88, 102); c.setLineDash([]);
    if (st.width > 0) c.drawImage(st, 0, 0, st.width, st.height, bx + 8, by + 14, 72, 72);
    c.save(); c.translate(bx - 70, by + 46); c.rotate(-.2);                                  // 郵戳
    c.strokeStyle = 'rgba(90,60,40,.6)'; c.lineWidth = 3; c.beginPath(); c.arc(0, 0, 40, 0, Math.PI * 2); c.stroke();
    c.fillStyle = 'rgba(90,60,40,.75)'; c.textAlign = 'center'; c.font = '20px sans-serif';
    c.fillText(`${who}家`, 0, -4); c.fillText(date, 0, 22); c.restore();
    const font = '"PingFang TC", "Noto Sans TC", "Microsoft JhengHei", sans-serif';
    c.textAlign = 'left'; c.fillStyle = '#3b2f28'; c.font = `bold 34px ${font}`;
    c.fillText(caption, pad, pad + sh + 66, sw);
    c.fillStyle = '#8a7a6c'; c.font = `24px ${font}`;
    c.fillText(`${foot}　${new Date().getFullYear()}/${date}`, pad, pad + sh + 116, sw - 170);
    c.textAlign = 'right'; c.fillStyle = '#c0612a'; c.font = `bold 26px ${font}`;
    c.fillText('🐾 DeskCat', pad + sw, pad + sh + 116);
    return out.toDataURL('image/png');
  }
  // 日記、照片牆共用：中文一個字一個字量，超過寬度就換行
  const FONT = '"PingFang TC", "Noto Sans TC", "Microsoft JhengHei", sans-serif';
  function wrap(c, text, maxW) {
    const lines = []; let cur = '';
    for (const ch of [...String(text)]) {                 // 標點不放在行首
      if (cur && !'」』）。，、！？…'.includes(ch) && c.measureText(cur + ch).width > maxW) { lines.push(cur); cur = ch.trim() ? ch : ''; } else cur += ch;
    }
    if (cur) lines.push(cur);
    return lines;
  }
  function brand(c, x, y, left) {                       // 最下面一行：左邊日期、右邊 DeskCat
    c.textAlign = 'left'; c.fillStyle = '#8a7a6c'; c.font = `22px ${FONT}`; c.fillText(left, x.l, y);
    c.textAlign = 'right'; c.fillStyle = '#c0612a'; c.font = `bold 24px ${FONT}`; c.fillText('🐾 DeskCat', x.r, y);
  }
  // 🐾 照片牆存成照片：拍立得的樣子（白框＋下面一句話）
  function snapImage(cv, place, caption, likes, date) {
    const K = 5, sw = cv.width * K, sh = cv.height * K, pad = 32, W = sw + pad * 2, LH = 42;
    const m = document.createElement('canvas').getContext('2d'); m.font = `bold 30px ${FONT}`;
    const lines = wrap(m, caption, sw);
    const H = pad + sh + 30 + lines.length * LH + 96;
    const out = document.createElement('canvas'); out.width = W; out.height = H;
    const c = out.getContext('2d');
    c.fillStyle = '#fff'; c.fillRect(0, 0, W, H);
    c.imageSmoothingEnabled = false; c.drawImage(cv, pad, pad, sw, sh);
    c.textAlign = 'left'; c.fillStyle = '#3b2f28'; c.font = `bold 30px ${FONT}`;
    lines.forEach((t, j) => c.fillText(t, pad, pad + sh + 30 + 30 + j * LH));
    const y = pad + sh + 30 + lines.length * LH + 30;
    c.fillStyle = '#8a7a6c'; c.font = `24px ${FONT}`; c.fillText(`${place}・🐾 ${likes}`, pad, y, sw);
    brand(c, { l: pad, r: pad + sw }, y + 40, `${new Date().getFullYear()}/${date}`);
    return out.toDataURL('image/png');
  }
  const blobOf = url => { const b = atob(url.split(',')[1]), u = new Uint8Array(b.length); for (let i = 0; i < b.length; i++) u[i] = b.charCodeAt(i); return new Blob([u], { type: 'image/png' }); };
  let saving = null;
  function openSave(url, title) {
    const file = new File([blobOf(url)], `DeskCat_${title}_${new Date().toISOString().slice(0, 10)}.png`, { type: 'image/png' });
    saving = { url, file, title };
    const canShare = !!(navigator.canShare && navigator.canShare({ files: [file] }));
    // 手機：按下去就直接存，不先跳預覽畫面（2026-10-15 使用者：「點下載就直接跳出儲存照片了 不需要再轉跳畫面」）
    // https 叫分享選單：選「儲存影像」＝存進「照片」App（不帶文字，「儲存影像」才會在最前面）。
    // 不能用下載：iPhone 會存進「檔案」App，照片裡找不到（2026-10-17 使用者：「想要打開存到 iPhone 的相片中」）
    // 沒有分享選單（家裡 Wi-Fi 的 http）、分享失敗 → 打開圖，請他長按 →「加入照片」
    if (D.isPhone) {
      if (canShare) {
        D.toast('選「儲存影像」存進照片');
        navigator.share({ files: [file] }).catch(e => { if (e && e.name !== 'AbortError') preview(url, title, false, true); });
      } else preview(url, title, false, true);
      return;
    }
    preview(url, title, canShare, false);       // 電腦：先看合成好的圖再存
  }
  function preview(url, title, canShare, phone) {
    $('pcSaveImg').src = url; $('pcSaveImg').alt = title;
    $('pcSave').setAttribute('aria-label', `${title}存成照片`);
    $('pcShare').hidden = !canShare;
    $('pcDown').hidden = phone;
    $('pcSaveTip').textContent = phone ? '長按圖片 →「加入照片」' : '按〔存到電腦〕下載這張圖';
    if (!phone) D.setLabel($('pcDown'), 'save', '存到電腦');
    $('pcSave').hidden = false;
    (canShare ? $('pcShare') : phone ? $('pcDone') : $('pcDown')).focus();
  }
  $('pcShare').onclick = async () => {
    if (!saving) return;
    try { await navigator.share({ files: [saving.file], title: saving.title }); } catch (_) { /* 取消了 */ }
  };
  function download() {
    if (!saving) return;
    const a = document.createElement('a'); a.href = URL.createObjectURL(saving.file); a.download = saving.file.name; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  }
  $('pcDown').onclick = download;
  $('pcDone').onclick = () => { $('pcSave').hidden = true; saving = null; };
  addEventListener('keydown', e => { if (e.key === 'Escape' && !$('pcSave').hidden) $('pcDone').click(); });

  // 🧳 旅行日記：畫在好友家最精彩的那一刻；伴手禮可以放進家裡
  function tripCard(m) {
    const d = m.data || {}, who = clean(m.from) || '好友', name = clean(d.name) || '牠', hours = Math.max(1, num(d, 'hours'));
    const me = spriteOf(d.name), key = S.visitHighlight(d), sv = S.SOUVENIR[d.souvenir] ? d.souvenir : null;
    let extra = null;
    if (num(d, 'cans') || sv) {
      extra = el('div', 'trip-row');
      if (sv) extra.append(el('span', 'trip-sv', `伴手禮：${S.SOUVENIR[sv]}`));
      if (num(d, 'cans')) extra.append(el('span', 'gift-got', `友情點數 +${num(d, 'cans')}`));
      if (sv) extra.append(souvenirBtn(m, sv));
    }
    return letterCard(m, {
      kind: 'trip', me, who, date: dateOf(m.ago), caption: highlightText(key, d, who), extra,
      spec: { bg: 'room', house: who, ...S.visitCast(key, me, hostSprites(d, m.fromId), 160, 96) },
      foot: `${name}住${who}家 ${hours} 小時・${ago(m.ago)}`, saveFoot: `🧳 ${name}在${who}家住 ${hours} 小時`, saveTitle: `${name}的旅行日記`,
    });
  }
  function souvenirBtn(m, sv) {
    if (placed.has(m.id)) {
      const b = el('button', 'btn'); D.setLabel(b, 'home', '去家裡看');
      b.onclick = () => { D.switchTab('home'); const f = (D.furnitureOf || (() => null))(sv); if (f) D.lookAt(f.x, f.y - 20); };
      return b;
    }
    const b = el('button', 'btn main', `放進家裡`);
    b.onclick = () => {
      const f = D.addFurniture(sv);
      if (!f) return;
      placed.add(m.id);
      try { localStorage.setItem(PLACED_KEY, JSON.stringify([...placed])); } catch (_) { /* 存不了就算了 */ }
      b.replaceWith(souvenirBtn(m, sv));
      D.toast(`${S.SOUVENIR[sv]}放進家裡了`);
    };
    return b;
  }

  function sendRow() {                       // 每天可以送每位好友一個禮物盒（send_gift；同一人每天一次）
    const wrap = el('section', 'send-gift');
    const gh = el('h3'); D.setLabel(gh, 'gift', '今天送禮物給好友'); wrap.append(gh);
    if (!M.friends.length) {                 // 手機不能加好友（要在桌面上演）
      wrap.append(el('p', 'note', '還沒有好友：在電腦版 DeskCat 右鍵「⚙ 帳號＆設定 → 👥 好友」輸入朋友的好友碼，就能互送禮物、收明信片'));
      return wrap;
    }
    const row = el('div', 'send-row');
    for (const f of M.friends) {
      const sent = M.giftsSentToday.includes(f.id);
      const b = el('button', 'friend-chip' + (sent ? ' sent' : ''));
      b.append(avatar(lookOf(f.pet)), el('span', 'fn', clean(f.nickname)), el('span', 'fs', sent ? '✓ 送過了' : '送一個'));
      b.disabled = sent;
      b.setAttribute('aria-label', sent ? `${f.nickname}：今天送過了` : `送${f.nickname}一個禮物盒`);
      b.onclick = async () => {
        let r = 'sent';
        if (LIVE) {                          // dc_mail_gift：每個好友每天一次（伺服器擋）
          b.disabled = true;
          try { r = await SV.mailGift(f.id); } catch (e) { b.disabled = false; D.toast(e.message || '連不上伺服器'); return; }
          if (r !== 'sent' && r !== 'already') { D.toast('你們現在不是好友'); load(true); return; }
        }
        if (!M.giftsSentToday.includes(f.id)) M.giftsSentToday.push(f.id);
        D.toast(r === 'already' ? `今天送過${clean(f.nickname).slice(0, 6)}了` : `送${clean(f.nickname).slice(0, 6)}一個禮物盒 🎁`);
        renderLetters();
      };
      row.append(b);
    }
    wrap.append(row, el('p', 'note', '明天可以再送。對方打開 DeskCat 時，盒子會掉下來'));
    return wrap;
  }
  function waiting(box) {                    // 伺服器還沒讀到：正在讀／讀不到（附〔再試一次〕）
    if (state === 'loading') { box.append(el('p', 'note', '正在讀信箱…')); return true; }
    if (state !== 'error') return false;
    box.append(el('p', 'note', `讀不到信箱：${errMsg || '連不上伺服器'}`));
    const b = el('button', 'btn main', '再試一次');
    b.onclick = () => { state = 'loading'; show(); load(true); };
    box.append(b);
    return true;
  }
  function renderLetters() {
    const box = $('mailLetters'); box.innerHTML = '';
    if (waiting(box)) return;
    box.append(sendRow());
    const gifts = unopened();
    if (gifts.length) {
      box.append(el('h3', null, `還沒打開（${gifts.length}）`));
      const ul = el('ul', 'letters'); gifts.forEach(m => ul.append(giftCard(m))); box.append(ul);
    }
    const rest = M.mail.filter(m => !(m.kind === 'gift' && !m.claimed));
    box.append(el('h3', null, `明信片、旅行日記（${rest.filter(m => m.kind !== 'gift').length}）`));
    if (!rest.length) box.append(el('p', 'note', '還沒有信。毛孩去好友家玩回來、好友送你禮物，都會留在這裡'));
    const ul = el('ul', 'letters');
    rest.forEach(m => ul.append(m.kind === 'gift' ? giftDone(m) : m.kind === 'trip' ? tripCard(m) : postcardCard(m)));
    box.append(ul);
  }

  // ---------- 🐾 好友動態：照片牆 ----------
  function bestOfDay(list) {                 // 同一家同一天只留最精彩的一則
    const best = new Map();
    for (const f of list) {
      const k = (f.mine ? '我' : f.who) + '|' + Math.floor(mins(f.ago) / 1440);
      const rank = i => { const r = MOMENT_ORDER.indexOf(i.kind); return r < 0 ? 99 : r; };
      if (!best.has(k) || rank(f) < rank(best.get(k))) best.set(k, f);
    }
    return list.filter(f => [...best.values()].includes(f));
  }
  const sender = () => (D.HOME.pets.find(p => p.where === 'home') || D.HOME.pets[0] || { name: '毛孩' }).name;
  function photoCard(f) {
    const li = el('li', 'snap' + (f.mine ? ' mine' : '') + (f.fresh ? ' new' : ''));
    const keys = MOMENT_CAST[f.kind] || ['cat'];
    const sprites = keys.map(k => spriteOf((f.params || {})[k], f.pet, f.mine ? 'me' : f.owner));
    if (f.kind === 'pile_crash') { const pp = lookOf(f.pet); sprites.push(pp === sprites[0] ? '白貓' : pp); }
    const spec = { bg: f.mine ? 'home' : 'room', house: f.mine ? '__home__' : f.who, ...S.momentCast(f.kind, sprites, 120, 90) };
    const cv = scene(120, 90, { ...spec, hearts: f.liked }, 'snap-canvas');
    const meta = el('div', 'snap-meta');
    const head = el('div', 'letter-title');
    head.append(el('span', null, f.mine ? '你家' : `${clean(f.who)}家`));
    if (f.fresh) head.append(el('span', 'new-dot', '新'));
    const sub = el('div', 'letter-sub', ago(f.ago));
    const subText = () => {
      if (f.mine) return ago(f.ago) + (f.likedBy && f.likedBy.length ? `・${f.likedBy.map(clean).join('、')}來按 🐾` : '');
      return ago(f.ago) + (f.liked ? `・${sender()}去按了 🐾` : '');
    };
    sub.textContent = subText();
    let paw;
    if (f.mine) {                            // 自己的動態不能按，只看幾個人按
      paw = el('div', 'paw mine-paw'); D.setLabel(paw, 'paw', String(f.likes));
      paw.setAttribute('aria-label', `${f.likes} 個好友按了貓掌`);
    } else {                                 // 好友的：按一下 🐾＝你的毛孩跑去按（照片裡那隻冒愛心）；再按一次收回（like_moment）
      paw = el('button', 'paw' + (f.liked ? ' on' : '')); D.setLabel(paw, 'paw', String(f.likes));
      const aria = () => { paw.setAttribute('aria-pressed', f.liked ? 'true' : 'false'); paw.setAttribute('aria-label', f.liked ? '收回貓掌' : '按貓掌'); };
      aria();
      let busy = false;
      const set = on => {
        if (on === f.liked) return;
        f.liked = on; f.likes = Math.max(0, f.likes + (on ? 1 : -1));
        D.setLabel(paw, 'paw', String(f.likes)); paw.classList.toggle('on', f.liked); aria();
        S.draw(cv, { ...spec, hearts: f.liked });
        sub.textContent = subText();
        if (f.liked) { paw.classList.remove('pop'); void paw.offsetWidth; paw.classList.add('pop'); }
      };
      paw.onclick = async () => {
        if (busy) return;
        const want = !f.liked;
        set(want);                           // 先變（手機按下去要馬上有反應），伺服器說不行再變回來
        if (!LIVE) return;
        busy = true;
        try {
          const r = await SV.mailLike(f.id);   // dc_mail_like：'liked'／'unliked'（再按一次收回）
          if (r === 'liked' || r === 'unliked') set(r === 'liked');
          else { set(!want); D.toast(r === 'gone' ? '這則動態不見了' : '你們現在不是好友'); }
        } catch (e) { set(!want); D.toast(e.message || '連不上伺服器'); }
        busy = false;
      };
    }
    const save = el('button', 'btn snap-save'); save.append(D.icon('share'));      // 存成照片（存的是現在的樣子：按過 🐾 的有愛心）
    save.setAttribute('aria-label', '存成照片'); save.title = '存成照片';
    save.onclick = () => {
      const place = f.mine ? '你家' : `${clean(f.who)}家`;
      openSave(snapImage(cv, place, momentText(f.kind, f.params), f.likes, dateOf(f.ago)), `${place}的照片`);
    };
    const row = el('div', 'snap-row');
    row.append(save, paw);
    meta.append(head, el('div', 'snap-cap', momentText(f.kind, f.params)), sub, row);
    li.append(cv, meta);
    return li;
  }
  function renderFeed() {
    const box = $('mailFeed'); box.innerHTML = '';
    const fh = el('h3'); D.setLabel(fh, 'paw', '好友動態'); box.append(fh);
    if (state !== 'ok') { if (state === 'loading') box.append(el('p', 'note', '正在讀動態…')); return; }
    const list = bestOfDay(M.feed);
    if (!list.length) { box.append(el('p', 'note', '還沒有動態。毛孩的趣事會自動分享給好友')); return; }
    const ul = el('ul', 'snaps'); list.forEach(f => ul.append(photoCard(f))); box.append(ul);
    box.append(el('p', 'note', '每家每天只留最精彩的一則。只有好友看得到，14 天後消失'));
  }

  // ---------- 手機直拿：上面兩個分頁 ----------
  function segCounts() {
    const a = unopened().length + unread().length, b = freshLikes().length;
    D.setLabel($('segLetters'), 'mail', a ? `信件 ${a}` : '信件');
    D.setLabel($('segFeed'), 'paw', b ? `動態 ${b}` : '動態');
  }
  function setSeg(s) {
    seg = s;
    for (const [id, v] of [['segLetters', 'letters'], ['segFeed', 'feed']]) {
      $(id).classList.toggle('on', v === s); $(id).setAttribute('aria-selected', v === s ? 'true' : 'false');
    }
    $('view-mail').dataset.seg = s;
  }
  $('segLetters').onclick = () => setSeg('letters');
  $('segFeed').onclick = () => { setSeg('feed'); seen(); segCounts(); };

  function seen() {                          // 看過了：「新」的小字這次還留著，分頁列的數字先拿掉（禮物要打開才算）
    if (state !== 'ok') return;
    const vertical = document.body.classList.contains('vertical');
    M.mail.forEach(m => { if (m.kind !== 'gift' && (!vertical || seg === 'letters')) m.read = true; });
    if (!vertical || seg === 'feed') { M.feed.forEach(f => { f.fresh = false; }); if (LIVE) seenLikes(); }
    if (LIVE) saveRead();
    badge();
  }
  function show() {
    renderLetters(); renderFeed(); segCounts(); setSeg(seg);
    seen();
    if (LIVE && Date.now() - loadedAt > 20000) load();   // 打開信箱：超過 20 秒沒讀就再讀一次
  }
  // 家裡的軟木板：最新 3 張明信片（郵票裡的毛孩）；點軟木板 → 信箱的那張明信片
  function board() {
    D.setBoard(M.mail.filter(m => m.kind === 'postcard').slice(0, 3).map(m => ({ tone: S.tone(m.from), av: avatar(spriteOf((m.data || {}).name)) })));
  }
  function openBoard() {
    seg = 'letters';
    D.switchTab('mail');
    requestAnimationFrame(() => {
      const card = document.querySelector('#mailLetters .pc.postcard');
      if (!card) return;
      card.scrollIntoView({ block: 'center', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
      card.classList.remove('flash'); void card.offsetWidth; card.classList.add('flash');
      D.toast('軟木板上的明信片在這裡', ['返回', () => D.switchTab('home')]);   // 2026-10-20 使用者點軟木板後找不到返回：附〔返回〕（使用者：「直接寫返回就好了」）
    });
  }
  // 你的動態被好友按了 🐾：家裡那隻冒愛心、說是誰按的（打開網頁、在家的時候）
  function likesArrive() {
    if ($('view-home').hidden) return;
    for (const f of freshLikes()) {
      const name = (f.params || {}).cat, pet = D.pets.find(p => p.p.name === name);
      if (!pet || !f.likedBy || !f.likedBy.length) continue;
      D.addHearts(pet, 3); D.say(pet, D.line(pet, 'photo_liked', { other: clean(f.likedBy[0]).slice(0, 4) }), 3000);
    }
  }

  // ---------- 伺服器（server/016；P66 卡第 8 節「016 信箱手機版」的欄位對照） ----------
  const READ_KEY = 'deskcat_mail_read_v1';     // 這台手機看過哪幾封、看到哪一個 🐾（伺服器不記）：{'dev/帳號': {read: [id], likes: 時間}}
  const acct = () => `${SV.which}/${(SV.user && SV.user.uid) || ''}`;
  const readAll = () => { const v = store(READ_KEY, {}); return v && typeof v === 'object' && !Array.isArray(v) ? v : {}; };
  function readMine() {
    const v = readAll()[acct()] || {};
    return { read: new Set(Array.isArray(v.read) ? v.read : []), likes: Number(v.likes) || Date.now() - 864e5 };   // 第一次：一天內的 🐾 算新的
  }
  let mine = { read: new Set(), likes: 0 };
  function saveRead() {
    for (const m of M.mail) if (m.read || m.claimed) mine.read.add(m.id);
    const all = readAll();
    all[acct()] = { read: [...mine.read].slice(-300), likes: mine.likes };   // 最近 300 封就夠（信箱只留 30 天）
    try { localStorage.setItem(READ_KEY, JSON.stringify(all)); } catch (_) { /* 存不了：下次打開又是「新」的 */ }
  }
  function seenLikes() { mine.likes = Date.now(); }
  const agoOf = iso => { const t = Date.parse(iso || ''); return isNaN(t) ? 0 : (opened - t) / 60000; };   // mins() 再加上打開後過了多久
  const SOUV = Object.keys(S.SOUVENIR);
  // 好友家的毛孩：先用伺服器的 look（＝範例裡同花色的圖，馬上能畫）；有傳過圖的下載好就換（跟自己家的一樣存在 IndexedDB）。
  // 記的是 {sprite, look, species}，畫的時候才挑（lookOf）：下載好只要重畫，不用重新整理資料
  const asked = new Set();
  function want(f) {
    if (!f.sprite || !f.owner_id || SPR.pets[f.sprite] || asked.has(f.sprite)) return;
    asked.add(f.sprite);
    SV.sprite(f.owner_id, f.sprite).then(info => { if (info) { SPR.pets[f.sprite] = info; redraw(); } })
      .catch(e => console.warn('好友毛孩圖下載不了', f.sprite, e));
  }
  function fromServer(r, fsList) {
    mine = readMine();
    const out = EMPTY(), first = {};
    out.points = parseInt(r.points, 10) || 0;
    for (const f of Array.isArray(fsList) ? fsList : []) {   // [{owner_id, nickname, cid, name, look, species, sprite}]
      if (!f || !f.owner_id) continue;
      const rec = { sprite: f.sprite || '', look: f.look || '', species: f.species };
      want(f);
      out.petsOf[f.owner_id + '|' + f.name] = rec;
      if (!(f.name in out.petsOf)) out.petsOf[f.name] = rec;
      (first[f.owner_id] = first[f.owner_id] || []).push({ name: f.name, rec });
    }
    const myFirst = (D.HOME.pets.find(p => p.sprite) || {}).sprite || '橘虎斑';
    const petOf = id => (first[id] && first[id][0].rec) || '三花';
    out.friends = (r.friends || []).map(f => ({ id: f.id, nickname: f.nickname || '好友', pet: petOf(f.id) }));
    out.giftsSentToday = (r.gifts_sent_today || []).map(String);
    const mail = (r.mail || []).filter(m => m && (m.kind === 'gift' || m.kind === 'postcard')).map(m => {
      const id = 'm' + m.id;
      return { id, sid: m.id, from: m.from || '好友', fromId: m.from_id, kind: m.kind, cans: parseInt(m.cans, 10) || 0,
               claimed: !!m.claimed, ago: agoOf(m.created_at), read: mine.read.has(id), data: m.payload || {} };
    });
    // 旅行日記＝我的毛孩去好友家住一晚、回來了的（還在外面的不算；伴手禮種類伺服器沒有 → 照編號固定挑一種，每台手機一樣）
    const trips = (r.trips || []).filter(t => t && t.status === 'done').map(t => {
      const id = 't' + t.id, end = t.finished_at || t.end_at, me = D.HOME.pets.find(p => p.id === t.cid);
      const hours = Math.max(1, Math.round((Date.parse(end) - Date.parse(t.start_at)) / 3600e3) || 1);
      const cans = parseInt(t.souvenir_cans, 10) || 0;
      return { id, sid: t.id, from: t.host || '好友', fromId: t.host_id, kind: 'trip', ago: agoOf(end), read: mine.read.has(id),
               data: { ...(t.report || {}), name: me ? me.name : '', hours, cans,
                       host_cats: (first[t.host_id] || []).slice(0, 3).map(x => x.name),
                       souvenir: cans ? SOUV[Math.abs(parseInt(t.id, 10) || 0) % SOUV.length] : null } };
    });
    out.mail = mail.concat(trips).sort((a, b) => a.ago - b.ago);   // 新的在前
    const fresh = new Set((r.likes || []).filter(l => Date.parse(l.created_at) > mine.likes).map(l => l.moment_id));
    out.feed = (r.feed || []).map(f => ({
      id: f.id, who: f.who || '好友', owner: f.mine ? 'me' : f.user_id, pet: f.mine ? myFirst : petOf(f.user_id),
      kind: f.kind, params: f.params || {}, ago: agoOf(f.created_at), likes: parseInt(f.likes, 10) || 0,
      liked: !!f.liked, mine: !!f.mine, likedBy: f.liked_by || [], fresh: !!f.mine && fresh.has(f.id),
    }));
    return out;
  }
  function redraw() {                        // 資料換了：信箱開著就重畫，軟木板、分頁列的數字也更新
    if (!$('view-mail').hidden) { renderLetters(); renderFeed(); segCounts(); }
    board(); badge();
  }
  let lastFs = null, firstLoad = true;
  function load(force) {
    if (!LIVE || SV.mode !== 'live' || document.hidden) return Promise.resolve();
    if (loading) return loading;
    if (!force && Date.now() - loadedAt < 20000) return Promise.resolve();
    loading = (async () => {
      try {
        const [r, fs] = await Promise.all([SV.mailMine(), SV.friendSprites().catch(() => null)]);
        if (fs) lastFs = fs;
        const sig = JSON.stringify([r, lastFs && lastFs.map(f => [f.owner_id, f.name, f.sprite]), D.HOME.pets.map(p => p.id + p.name)]);
        if (sig !== lastSig || state !== 'ok') {      // 沒變就不重畫（重畫會打斷正在看的）
          M = fromServer(r || {}, lastFs); lastSig = sig; state = 'ok';
          redraw(); if (!$('view-mail').hidden) seen();
        }
        loadedAt = Date.now(); $('mailNote').hidden = true;
        if (firstLoad) { firstLoad = false; setTimeout(likesArrive, 1500); }
      } catch (e) {
        errMsg = e.message || '連不上伺服器';
        if (state !== 'ok') { state = 'error'; redraw(); }
        else { $('mailNote').textContent = `讀不到新的信：${errMsg}`; $('mailNote').hidden = false; }   // 有舊的：照樣看，上面說一聲
      } finally { loading = null; }
    })();
    return loading;
  }

  window.DCMail = { show, badge, openBoard, load };
  board(); badge();
  if (LIVE) {
    setTimeout(load, 1500);                  // 毛孩先讀（旅行日記要知道是哪一隻）、信箱晚一點
    setInterval(() => load(), 90000);        // 開著的時候 1 分半讀一次（分頁列的數字、軟木板）；電腦是 15 分鐘
    document.addEventListener('visibilitychange', () => { if (!document.hidden) load(); });
  } else setTimeout(likesArrive, 2500);
})();
