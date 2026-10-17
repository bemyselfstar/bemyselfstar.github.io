// ===== DeskCat iPhone 小工具（Scriptable）=====
// 設定不用改這份腳本（2026-10-16 起）：第一次在 Scriptable 裡按這個腳本，會請你貼上電腦版 DeskCat
//   「帳號＆設定 -> 帳號・存檔 -> iPhone 小工具」〔複製設定〕的那一段，存在這支手機的 Keychain（加密）。
//   之後更新腳本整份覆蓋就好；換了新的碼：在 Scriptable 按這個腳本 -> 換設定。
// 下面這行留空就好（舊的做法：把設定貼在這行也可以，跑一次就會存進 Keychain）。
const DESKCAT = { url: '', key: '', code: '' };
// 設定＝只能讀的碼＋公開鑰匙，不是你的登入資料；不要分享給別人（拿到的人看得到你的毛孩近況）。碼可以在電腦版〔作廢〕。
//
// 小工具的「參數」（長按小工具 -> 編輯小工具 -> Parameter）可以打毛孩的名字：小、中、鎖定畫面就顯示那一隻。沒打＝在桌面或在家的第一隻。
// 安裝步驟：mobile/widget/README.md。P66 M3.5（2026-10-16 手機線）；讀法 server/014、015 的 dc_widget_read。
// 畫面（2026-10-16 使用者：「不需要顯示笑臉…不必要的資訊」）：只放 毛孩的圖＋名字＋在一起第幾天＋牠想跟你說的一句話；睡著加 zzz 圖示。
//   心情、飽足、位置文字、更新時間、好友來玩／新信那一行都不顯示（使用者 2026-10-16「這個不用」）；在哪裡、在做什麼由牠說的話帶出來。
// 015（2026-10-16 晚上）起伺服器每隻多給：cid（編號）、doing（在做什麼的代號）、personality（個性）、came_at（來家裡的日子），
//   圖由伺服器照「在做什麼」挑一張（pose：sit／sleep／loaf／walk…，醒著的每 15 分鐘輪流換）-> 每次更新換一個樣子。
// 點小工具＝打開手機網頁並摸摸那一隻（網址後面加 ?cid=編號&pet=名字&act=pet，mobile/app.js 收到就摸）。

// 點了打開的手機網頁（正式網址，2026-10-17 起；以前是家裡 Wi-Fi 的電腦 IP）。網頁照網址連正式伺服器
const APP_URL = 'https://bemyselfstar.github.io/app/';
// 設定是開發版 DeskCat 複製的（讀開發伺服器）：打開的網頁也加 server=dev，摸到的才是同一隻（mobile/server.js）
const DEV_REF = 'kzoobeloeqbfmdcndler';
const CACHE = 'deskcat_widget_cache.json';
const KC = 'deskcat_widget_setting_v1';   // Keychain 裡設定的名字（整個 Scriptable 共用，換腳本還在）
const OFF_MIN = 10;            // 電腦超過幾分鐘沒跟伺服器說話＝電腦沒開（電腦每 1～5 分鐘說一次）

const C = {
  bg: Color.dynamic(new Color('#fffaf2'), new Color('#2a2420')),
  ink: Color.dynamic(new Color('#3b2f28'), new Color('#f1e6d8')),
  muted: Color.dynamic(new Color('#8a7a6c'), new Color('#b3a493')),
  chip: Color.dynamic(new Color('#f0e3d0'), new Color('#3a312a')),
};
// 表情符號一律寫成 \u{…}（只有英數字）：用 LINE 之類傳到手機時，表情會被換成 :cat: 這種字（2026-10-16 iPhone 實測）
const ZZZ = '\u{1F4A4}', CAT = '\u{1F431}', DOG = '\u{1F436}';

// ---------- 牠想跟你說的話：照個性挑（跟手機網頁、電腦一樣的挑法：src/lines.py pick） ----------
// ===== 台詞（自動產生，不要手改：python -X utf8 mobile/tools/export_lines.py；來源 mobile/tools/lines_mobile.py 的 widget_*（之後 src/lines.py）） =====
// 照 src/lines.py 的規則：6 種個性（default＝普通）、一句 11 字以內、狗另外寫、狗不說 CAT_ONLY 的字；{other}＝好友暱稱
const SAY = {"cat":{"sleep":{"default":["（呼…呼…）","夢到罐罐了…","（翻個身）"],"黏人":["…夢到你了…","（抱著尾巴睡）"],"高冷":["……別吵。","（耳朵動一下）"],"貪吃":["…還要一碗…","（嘴巴在嚼）"],"好動":["（腳在跑步）","…抓到了…"],"膽小":["（縮成一團）","…是你嗎…"]},"hungry":{"default":["肚子好餓喔…","罐罐呢？","想吃飯了…"],"黏人":["餵我嘛～","陪我吃飯嘛"],"高冷":["……飯呢。","碗空了。"],"貪吃":["餓扁了！！","飯！飯！飯！","我要吃三碗"],"好動":["餓到跑不動","吃飽再玩！"],"膽小":["（小聲）餓了","可以吃飯嗎…"]},"desk":{"default":["我在旁邊陪你","你在忙什麼？","工作加油喔"],"黏人":["一直陪著你～","看我一下嘛"],"高冷":["……專心工作。","（瞄螢幕）"],"貪吃":["桌上有點心嗎","忙完餵我喔"],"好動":["陪我玩一下！","游標好好抓！"],"膽小":["這裡很安全…","（躲在視窗後）"]},"desk_off":{"default":["等你開電腦…","電腦什麼時候開？"],"黏人":["好想你喔…","快開電腦嘛"],"高冷":["……在等你。","（假裝沒在等）"],"貪吃":["開電腦餵我","肚子餓了…"],"好動":["好無聊喔！","快來陪我玩！"],"膽小":["黑黑的…","你會來嗎…"]},"home":{"default":["在家等你回來","早點回家喔","家裡好安靜"],"黏人":["快回家抱我","在門口等你"],"高冷":["……家裡很好。","（曬太陽中）"],"貪吃":["回家帶罐罐","冰箱打不開…"],"好動":["在家跑酷中！","沙發是我的！"],"膽小":["家裡最安心","（窩在窩裡）"]},"pocket":{"default":["外面好好玩","要去哪裡？","跟你出門真好"],"黏人":["跟你出門～","不要放開我"],"高冷":["……風景還行。","別走太遠。"],"貪吃":["去買點心嗎？","外面有好吃的"],"好動":["要去探險！","那邊那邊！"],"膽小":["外面好大…","要抱緊我喔"]},"friend":{"default":["在{other}家玩～","玩得很開心！"],"黏人":["想你了～","{other}家很好"],"高冷":["……還不錯。","{other}家還行"],"貪吃":["{other}家飯好吃","吃了好多！"],"好動":["玩瘋了！","在{other}家跑！"],"膽小":["有點緊張…","快接我回家…"]},"happy":{"default":["最喜歡你了","今天好開心"],"黏人":["最最喜歡你！","一直在一起～"],"高冷":["……還不錯啦。","（尾巴翹高高）"],"貪吃":["吃飽好幸福","今天好滿足"],"好動":["今天好開心！","再來玩！"],"膽小":["跟你在一起好","（安心的呼嚕）"]},"lonely":{"default":["有點寂寞…","想你了…"],"黏人":["好想你喔…","摸摸我嘛…"],"高冷":["……才沒有想你","（背對著你）"],"貪吃":["沒人餵我…","好寂寞好餓"],"好動":["好無聊…","陪我玩嘛…"],"膽小":["你在哪裡…","（躲起來）"]}},"dog":{"sleep":{"default":["（呼…呼…）","夢到在追球…","zzz…"],"黏人":["…夢到你了…","（靠著枕頭睡）"],"高冷":["……別吵。","（耳朵動一下）"],"貪吃":["…還要一根…","（夢到肉乾）"],"好動":["（腳在跑步）","…汪…球…"],"膽小":["（縮成一團）","…是你嗎…"]},"hungry":{"default":["肚子咕嚕叫…","肉乾呢？","想吃飯了！"],"黏人":["餵我嘛～","陪我吃飯嘛"],"高冷":["……飯呢。","碗空了。"],"貪吃":["餓扁了！！","飯！飯！飯！","肉乾肉乾！"],"好動":["餓到跑不動","吃飽再玩！"],"膽小":["（小聲）餓了","可以吃飯嗎…"]},"desk":{"default":["我陪你上班！","加油加油！","休息一下嘛"],"黏人":["一直陪著你！","看我一下嘛"],"高冷":["……專心工作。","（趴著看你）"],"貪吃":["桌上有肉乾嗎","忙完餵我喔"],"好動":["陪我玩球！","休息一下嘛！"],"膽小":["這裡很安全…","（躲在視窗後）"]},"desk_off":{"default":["等你開電腦！","今天要上班嗎？"],"黏人":["好想你喔…","快開電腦嘛"],"高冷":["……在等你。","（趴著等）"],"貪吃":["開電腦餵我","肚子餓了…"],"好動":["好無聊喔！","快來陪我玩！"],"膽小":["黑黑的…","你會來嗎…"]},"home":{"default":["在家等你！","什麼時候回家？","在門口等你"],"黏人":["快回家抱我！","在門口等你～"],"高冷":["……顧家中。","（趴在門口）"],"貪吃":["回家帶肉乾","碗在等你喔"],"好動":["帶我去散步！","球在等你！"],"膽小":["家裡最安心","（窩在窩裡）"]},"pocket":{"default":["散步散步！","還要去哪裡？","外面好好玩！"],"黏人":["跟你出門！","不要放開我"],"高冷":["……走吧。","別走太遠。"],"貪吃":["去買點心嗎？","有肉乾嗎？"],"好動":["汪！衝啊！","那邊那邊！"],"膽小":["外面好大…","要牽好我喔"]},"friend":{"default":["在{other}家玩！","玩得很開心！"],"黏人":["想你了～","{other}家很好"],"高冷":["……還不錯。","{other}家還行"],"貪吃":["{other}家肉好吃","吃了好多！"],"好動":["玩瘋了！汪！","在{other}家跑！"],"膽小":["有點緊張…","快接我回家…"]},"happy":{"default":["最喜歡你了！","今天好開心！"],"黏人":["最最喜歡你！","一直在一起！"],"高冷":["……還不錯啦。","（尾巴搖搖）"],"貪吃":["吃飽好幸福","今天好滿足"],"好動":["今天好開心！","（尾巴狂搖）"],"膽小":["跟你在一起好","（安心的嘆氣）"]},"lonely":{"default":["好想你喔…","摸摸我嘛…"],"黏人":["好想你喔…","快回來嘛…"],"高冷":["……才沒有想你","（背對著你）"],"貪吃":["沒人餵我…","好寂寞好餓"],"好動":["好無聊…","陪我玩嘛…"],"膽小":["你在哪裡…","（嗚嗚叫）"]}}};
const CAT_ONLY = ["喵", "呼嚕", "嚕嚕", "毛球", "貓砂", "死魚眼", "理毛", "舔毛", "咪嗚", "磨爪", "夜貓子"];
// ===== 台詞到這裡 =====
const SLEEPY = ['sleep', 'inbox_sleep', 'pile_sleep'];   // 睡著的代號（src/pet_sync.py SLEEPY）
const deskOff = d => !d.desk_at || Date.now() - Date.parse(d.desk_at) > OFF_MIN * 60000;
// 睡著：看代號 doing（015）；舊的伺服器只有文字，才看有沒有「睡」「打盹」
const asleep = p => p.doing ? SLEEPY.includes(p.doing) || p.pose === 'sleep' : /睡|打盹/.test(p.doing_text || '');
function line(p, k) {                      // 個性有自己的 75% 用自己的；狗沒寫到的用貓的、濾掉貓才說的字
  const dog = p.species === 'dog', per = p.personality || '普通';
  const d = (dog && SAY.dog[k]) || SAY.cat[k] || {};
  const own = d[per] || [];
  let pool = own.length && Math.random() < .75 ? own : (d.default || own);
  if (dog && d !== SAY.dog[k]) pool = pool.filter(t => !CAT_ONLY.some(w => t.includes(w)));
  if (!pool.length) return dog ? '汪！' : '…';
  return pool[Math.floor(Math.random() * pool.length)].replace(/\{other\}/g, (p.friend || '好友').slice(0, 4));
}
const said = new Map();                    // 同一次畫面裡同一隻說同一句（大尺寸、鎖定畫面不會一隻說兩種話）
function says(p, d) {
  const id = p.cid || p.name;
  if (said.has(id)) return said.get(id);
  let k;
  if (asleep(p)) k = 'sleep';
  else if (p.food != null && p.food < 30) k = 'hungry';
  else if (p.mood >= 80 && Math.random() < .35) k = 'happy';
  else if (p.mood != null && p.mood < 30 && Math.random() < .5) k = 'lonely';
  else k = p.place === 'desk' ? (deskOff(d) ? 'desk_off' : 'desk') : SAY.cat[p.place] ? p.place : 'home';
  const s = line(p, k);
  said.set(id, s);
  return s;
}
// 在一起第幾天：來家裡那天＝第 1 天（照手機的日期算）；伺服器還沒給（舊版電腦）＝null，不顯示
function days(p) {
  const t = p.came_at ? new Date(p.came_at) : null;
  if (!t || isNaN(t)) return null;
  const day = x => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  return Math.max(1, Math.round((day(new Date()) - day(t)) / 864e5) + 1);
}
const together = (p, short) => { const n = days(p); return n ? (short ? '第 ' : '在一起第 ') + n + ' 天' : ''; };

// ---------- 設定：存在 Keychain（2026-10-16 使用者：「以後更新整份覆蓋就好」） ----------
// 電腦〔複製設定〕複製到的是兩行：說明＋ const DESKCAT = {"url": "…", "key": "…", "code": "…"};
// 整段貼進來就好：只拿大括號那一段（JSON），不用 eval（貼錯的東西不會被當程式跑）
function parseSetting(t) {
  if (!t) return null;
  const a = String(t).indexOf('{'), b = String(t).lastIndexOf('}');
  if (a < 0 || b < a) return null;
  let o = null;
  try { o = JSON.parse(String(t).slice(a, b + 1)); } catch (_) {
    o = {};                                  // 舊的寫法（單引號）：一個一個找
    for (const k of ['url', 'key', 'code']) {
      const m = new RegExp(k + "\\s*:\\s*['\"]([^'\"]+)['\"]").exec(String(t));
      if (m) o[k] = m[1];
    }
  }
  return cleanSetting(o);
}
function cleanSetting(o) {                   // 三樣都要有、看起來對（網址 https、碼 24 個 0～9a～f）
  if (!o || typeof o !== 'object') return null;
  const url = String(o.url || '').trim(), key = String(o.key || '').trim(), code = String(o.code || '').trim().toLowerCase();
  if (url.indexOf('https://') !== 0 || !key || !/^[0-9a-f]{24}\b/.test(code) || code.length !== 24) return null;
  return { url, key, code };
}
function loadSetting() {
  const line = cleanSetting(DESKCAT);        // 舊的做法：貼在腳本裡 -> 順便存進 Keychain，下次換腳本也還在
  if (line) { saveSetting(line); return line; }
  try { return Keychain.contains(KC) ? parseSetting(Keychain.get(KC)) : null; } catch (_) { return null; }
}
function saveSetting(st) { try { Keychain.set(KC, JSON.stringify(st)); } catch (_) { /* 存不了：這次還是能用 */ } }
async function notice(title, message) { const b = new Alert(); b.title = title; b.message = message || ''; b.addAction('好'); await b.present(); }
async function askSetting(first) {           // 在 Scriptable 裡跑：請使用者貼上〔複製設定〕那一段
  let clip = '';
  try { clip = Pasteboard.paste() || ''; } catch (_) { clip = ''; }
  const a = new Alert();
  a.title = first ? '第一次使用：貼上小工具設定' : '換設定';
  a.message = '電腦版 DeskCat：帳號＆設定 -> 帳號・存檔 -> iPhone 小工具〔複製設定〕，把複製到的整段貼在下面。存在這支手機，之後更新腳本不用再貼';
  a.addTextField('const DESKCAT = …', parseSetting(clip) ? clip : '');   // 剪貼簿裡剛好是設定：先幫你填好
  a.addAction('存起來');
  a.addCancelAction('取消');
  if (await a.presentAlert() < 0) return null;
  const st = parseSetting(a.textFieldValue(0));
  if (!st) { await notice('看不懂這段', '請到電腦版重新按〔複製設定〕，整段貼上（要有 url、key、code）'); return null; }
  saveSetting(st);
  try { FileManager.local().remove(FileManager.local().joinPath(FileManager.local().documentsDirectory(), CACHE)); } catch (_) { /* 沒有舊的 */ }
  await notice('存好了', '小工具會在下次更新時換上；也可以先選一個大小預覽');
  return st;
}

// ---------- 讀伺服器（失敗就用上次存的） ----------
async function read() {
  const fm = FileManager.local(), path = fm.joinPath(fm.documentsDirectory(), CACHE);
  const cached = () => { try { return fm.fileExists(path) ? JSON.parse(fm.readString(path)) : null; } catch (_) { return null; } };
  const st = loadSetting();
  if (!st) return { err: 'setup' };
  try {
    const base = st.url.endsWith('/') ? st.url.slice(0, -1) : st.url;
    const req = new Request(base + '/rest/v1/rpc/dc_widget_read');
    req.method = 'POST';
    req.headers = { apikey: st.key, 'Content-Type': 'application/json' };   // 沒登入：只帶公開鑰匙（跟電腦版〔試讀〕一樣）
    req.body = JSON.stringify({ p_code: st.code });
    req.timeoutInterval = 15;
    const r = await req.loadJSON();
    const d = Array.isArray(r) ? r[0] : r;
    if (d && d.ok) { d.at = Date.now(); fm.writeString(path, JSON.stringify(d)); return d; }
    if (d && d.reason === 'bad_code') return { err: 'bad_code' };
    throw new Error((d && (d.message || d.reason)) || '讀不到');
  } catch (e) {
    const old = cached();
    return old ? { ...old, stale: true } : { err: 'offline' };
  }
}

// ---------- 小工具的零件 ----------
function pickPet(d) {
  const want = (args.widgetParameter || '').trim();
  return d.pets.find(p => want && (p.name === want || p.cid === want))
    || d.pets.find(p => p.place === 'desk') || d.pets.find(p => p.place === 'home') || d.pets[0];
}
// 點了打開網頁、摸這一隻：用編號找（名字可能重複、會改）；名字留著給還沒更新的網頁用
// 整份腳本不能有錢字號（2026-10-16 iPhone 實測）：腳本傳到手機時，同一行兩個錢字號中間會被當成數學公式改掉
//   （空白、大括號被吃掉 -> 畫面出現 p.name・{t}、或整個 SyntaxError）。字串一律用 + 接起來，不用反引號字串裡夾變數。
function appUrl(q) {
  if (!APP_URL) return null;
  const st = loadSetting();
  const all = (st && st.url.indexOf(DEV_REF) >= 0 ? ['server=dev'] : []).concat(q ? [q] : []);
  return APP_URL + (all.length ? '?' + all.join('&') : '');
}
function petUrl(p) {
  const cid = p.cid ? 'cid=' + encodeURIComponent(p.cid) + '&' : '';
  return appUrl(cid + 'pet=' + encodeURIComponent(p.name) + '&act=pet');
}
const link = (el, p) => { const u = petUrl(p); if (u) el.url = u; };
function petImage(p) {
  if (!p || !p.img) return null;
  // 015 起伺服器的 base64 不換行了；舊的（014）每 76 字換一行，Scriptable 解不了 -> 還是先拿掉空白換行（2026-10-16 iPhone 實測）
  try { const d = Data.fromBase64String(String(p.img).replace(/\s+/g, '')); return d ? Image.fromData(d) : null; } catch (_) { return null; }
}
function text(stack, s, size, color = C.ink, bold = false, lines = 1) {
  const t = stack.addText(s);
  t.font = bold ? Font.boldSystemFont(size) : Font.systemFont(size);
  if (color) t.textColor = color;
  t.lineLimit = lines; t.minimumScaleFactor = .7;
  return t;
}
// 圖照實際比例縮（015 起是裁好空白的：坐著約 1:1、睡覺躺平約 2:1），高 h、寬最多 maxW
function pic(stack, p, h, maxW = h * 1.9) {
  const im = petImage(p);
  if (!im) return text(stack, p && p.species === 'dog' ? DOG : CAT, h * .7);
  const r = im.size.width / im.size.height;
  let ih = h, iw = h * r;
  if (iw > maxW) { iw = maxW; ih = maxW / r; }
  const el = stack.addImage(im);
  el.imageSize = new Size(Math.round(iw), Math.round(ih));
  return el;
}
function picZ(stack, p, h, maxW) {           // 圖＋睡著時右上角 zzz 圖示
  const s = stack.addStack(); s.layoutHorizontally(); s.topAlignContent();
  pic(s, p, h, maxW);
  if (asleep(p)) text(s, ZZZ, Math.round(h * .28));
  return s;
}
function stale(w, d) { if (d.stale) text(w, '讀不到，這是之前的', 9, C.muted); }
const quote = s => '「' + s + '」';
const nameLine = (p, short) => { const t = together(p, short); return t ? p.name + '・' + t : p.name; };

// ---------- 主畫面：小、中、大 ----------
function small(w, d) {
  const p = pickPet(d);
  link(w, p);
  const top = w.addStack(); top.addSpacer(); picZ(top, p, 64, 104); top.addSpacer();
  w.addSpacer(6);
  const q = w.addStack(); q.addSpacer(); text(q, quote(says(p, d)), 13, C.ink, true, 2).centerAlignText(); q.addSpacer();
  const n = w.addStack(); n.addSpacer(); text(n, nameLine(p), 11, C.muted); n.addSpacer();
  stale(w, d);
}
function medium(w, d) {
  const p = pickPet(d);
  link(w, p);
  const row = w.addStack(); row.centerAlignContent();
  picZ(row, p, 84, 120); row.addSpacer(10);
  const col = row.addStack(); col.layoutVertically();
  text(col, nameLine(p), 12, C.muted);
  col.addSpacer(2);
  text(col, quote(says(p, d)), 18, C.ink, true, 2);
  row.addSpacer();
  stale(w, d);
}
// 大尺寸小工具的寬度（點）：照手機螢幕寬度（Apple 的小工具尺寸表）；兩格中間 6、左右各留 12
function largeWidth() {
  const sw = Device.screenSize().width;
  return sw >= 428 ? 364 : sw >= 390 ? 338 : sw >= 375 ? 329 : 321;
}
function large(w, d) {
  const cellW = Math.floor((largeWidth() - 24 - 6) / 2);
  text(w, (d.name ? d.name + '的' : '') + '一家子', 15, C.ink, true);
  w.addSpacer(6);
  const pets = d.pets.slice(0, 8);
  for (let i = 0; i < pets.length; i += 2) {
    const row = w.addStack(); row.centerAlignContent();
    for (const p of pets.slice(i, i + 2)) {
      const cell = row.addStack(); cell.centerAlignContent(); cell.size = new Size(cellW, 56);
      cell.backgroundColor = C.chip; cell.cornerRadius = 10; cell.setPadding(4, 6, 4, 6);
      link(cell, p);                          // 點哪一格就摸哪一隻
      picZ(cell, p, 40, 60); cell.addSpacer(6);
      const col = cell.addStack(); col.layoutVertically();
      const nr = col.addStack(); nr.bottomAlignContent();
      text(nr, p.name, 12, C.ink, true);
      const t = together(p, true);
      if (t) { nr.addSpacer(4); text(nr, t, 9, C.muted); }
      text(col, says(p, d), 10, C.muted);
      cell.addSpacer();
      row.addSpacer(6);
    }
    w.addSpacer(6);
  }
  if (d.pets.length > 8) text(w, '還有 ' + (d.pets.length - 8) + ' 隻', 10, C.muted);
  w.addSpacer();
  stale(w, d);
}

// ---------- 鎖定畫面（iOS 16 起）：一行字、小圓圈、長方形 ----------
// 鎖定畫面的小工具 iOS 會自己上色（單色、半透明），不設背景顏色、字的顏色用系統的
function lockInline(w, d) {                  // 時間上面那一行：只有字（加不了圖）
  const p = pickPet(d);
  link(w, p);
  text(w, (asleep(p) ? ZZZ + ' ' : '') + p.name + '：' + says(p, d), 12, null);
}
function lockCircle(w, d) {                  // 小圓圈：只有圖（睡著加 zzz 圖示）
  const p = pickPet(d);
  link(w, p);
  const s = w.addStack(); s.addSpacer(); picZ(s, p, 34, 44); s.addSpacer();
}
function lockRect(w, d) {                    // 長方形：圖＋名字（在一起第幾天）＋一句話
  const p = pickPet(d);
  link(w, p);
  const row = w.addStack(); row.centerAlignContent();
  picZ(row, p, 40, 56); row.addSpacer(6);
  const col = row.addStack(); col.layoutVertically();
  text(col, nameLine(p, true), 11, null, true);
  text(col, says(p, d), 13, null, false, 2);
  row.addSpacer();
}

function problem(w, err, lock) {            // 讀不到：不要整塊空白，說清楚怎麼辦
  const msg = {
    setup: '還沒設定：打開 Scriptable，按這個腳本，貼上電腦版〔複製設定〕那一段',
    bad_code: '小工具碼不能用了：電腦版〔產生碼〕再〔複製設定〕，到 Scriptable 按這個腳本 -> 換設定',
    offline: '讀不到：檢查網路，等一下會再試',
    nopet: '電腦版還沒傳毛孩上來：打開電腦版 DeskCat（新版）',
  }[err] || '讀不到，等一下會再試';
  if (lock) { text(w, CAT + ' ' + (err === 'offline' ? '讀不到' : '要設定'), 12, null); return; }
  text(w, CAT + ' DeskCat', 14, C.ink, true);
  w.addSpacer(6);
  text(w, msg, 12, C.muted, false, 4);
}

const LOCK = { accessoryInline: lockInline, accessoryCircular: lockCircle, accessoryRectangular: lockRect };
async function build(size) {
  const d = await read();
  const w = new ListWidget();
  const lock = !!LOCK[size];
  if (!lock) { w.backgroundColor = C.bg; w.setPadding(12, 12, 12, 12); }
  w.refreshAfterDate = new Date(Date.now() + 15 * 60000);   // 真正多久更新由 iOS 決定（大約 15～60 分鐘）；伺服器 15 分鐘換一次姿勢
  const home = appUrl('');
  if (home) w.url = home;
  if (d.err) problem(w, d.err, lock);
  else if (!d.pets || !d.pets.length) problem(w, 'nopet', lock);
  else if (lock) LOCK[size](w, d);
  else if (size === 'small') small(w, d);
  else if (size === 'large' || size === 'extraLarge') large(w, d);
  else medium(w, d);
  return w;
}

if (config.runsInWidget) {
  Script.setWidget(await build(config.widgetFamily));
} else {                                   // 在 Scriptable 裡按這個腳本：沒設定先貼設定；再選一個大小預覽、換設定、清掉設定
  if (!loadSetting()) await askSetting(true);
  const a = new Alert();
  a.title = 'DeskCat 小工具預覽';
  a.message = loadSetting() ? '' : '還沒設定：選「換設定」貼上電腦版〔複製設定〕那一段';
  const sizes = [['小', 'small', 'presentSmall'], ['中', 'medium', 'presentMedium'], ['大', 'large', 'presentLarge'],
                 ['鎖定畫面：長方形', 'accessoryRectangular', 'presentAccessoryRectangular'],
                 ['鎖定畫面：小圓圈', 'accessoryCircular', 'presentAccessoryCircular'],
                 ['鎖定畫面：一行字', 'accessoryInline', 'presentAccessoryInline']];
  sizes.forEach(s => a.addAction(s[0]));
  a.addAction('換設定（貼新的碼）');
  a.addDestructiveAction('清掉設定');
  a.addCancelAction('取消');
  const i = await a.presentSheet();
  if (i === sizes.length) await askSetting(false);
  else if (i === sizes.length + 1) {
    try { if (Keychain.contains(KC)) Keychain.remove(KC); } catch (_) { /* 本來就沒有 */ }
    await notice('清掉了', '小工具會顯示「還沒設定」；要再用就按這個腳本貼上設定' + (cleanSetting(DESKCAT) ? '（腳本裡 const DESKCAT 那一行還有一份，要一起清空）' : ''));
  } else if (i >= 0) {
    const [, size, fn] = sizes[i], w = await build(size);
    if (typeof w[fn] === 'function') await w[fn]();
    else { const b = new Alert(); b.title = '這個版本的 Scriptable 不能預覽鎖定畫面'; b.message = '直接加到鎖定畫面看'; b.addAction('好'); await b.present(); }
  }
}
Script.complete();
