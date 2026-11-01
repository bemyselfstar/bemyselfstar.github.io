// 手機商店（P88 M4b，2026-10-31 使用者「做商店畫面」）。家的工具列〔商店〕打開。
// 賣什麼（使用者 10-31 問答框）：食物（罐頭、吐司、煎蛋、糰子、高級點心、貓薄荷）、家具 5 種（已經有的不賣）、扭蛋、睡帽、節日飾品。
// 2026-11-01（v4.18 手機跟電腦一起上）：家具多 14 種（每種最多幾個照 max＝shared_rules.CARE_LIMIT）；〔食物〕多貓糧狗糧＝直接倒進自動餵食器。
// 名稱、價格、說明、稀有度、小圖都從 src/ 匯出（lines.js 的 DC_FOOD、DC_SHOP；export_lines.py），手機不另外寫數字。
// 罐罐、買得到買不到、扭蛋抽到什麼以伺服器為準（server.js shopMine／shopBuy；🎮 共用錢包還沒做 → SV.shop＝false 不顯示入口）。
// 版面：上面罐罐、分頁；中間商品格子（只有這裡捲）；下面固定一塊說明＋購買（點一下商品＝選，再按〔買〕才買＝不用另外跳確認）。
(window.DC_BUILD = window.DC_BUILD || {})['shop.js'] = 99;   // 版本戳記（mobile/tools/bump.py 一起加 1；不一樣＝手機有舊檔）
(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const SV = window.DCServer, D = window.DC_SHOP, F = window.DC_FOOD;
  if (!SV || !D || !F || !$('shop')) return;
  const TABS = [['food', '食物'], ['furn', '家具'], ['wear', '衣服・飾品']];
  const INSTANT = new Set(['snack', 'egg', 'dango', 'catnip']);   // 買了馬上用（電腦 shop_buy 也是）
  const st = { tab: 'food', sel: null, mine: null, busy: false, result: null, note: '' };   // note＝買好了的那句（商店蓋住家的提示列，買的結果寫在這裡）

  // ---------- 小圖：格子（電腦 shop_art／items 的 front）畫成小畫布；全身服裝用 art/shop/*.png；家具用手機家裡的圖 ----------
  const CACHE = {};
  function gridURL(g, pal) {
    const c = document.createElement('canvas');
    c.width = Math.max(1, ...g.map(r => r.length)); c.height = Math.max(1, g.length);
    const cc = c.getContext('2d');
    g.forEach((r, y) => [...r].forEach((ch, x) => { const col = pal[ch]; if (col) { cc.fillStyle = col; cc.fillRect(x, y, 1, 1); } }));
    return c.toDataURL();
  }
  function iconURL(it) {
    if (CACHE[it.key]) return CACHE[it.key];
    let u = '';
    if (it.kind === 'furn' || it.kind === 'kibble') u = `art/furniture/${D.furnIcon[it.key] || it.key}.png`;
    else if (it.kind === 'food') u = gridURL(F.icons[it.key] || [], F.pal);
    else { const ic = D.icons[it.key] || {}; u = ic.png || (ic.g ? gridURL(ic.g, ic.pal) : ''); }
    return (CACHE[it.key] = u);
  }
  const iconOfItem = iid => iconURL(wearItem('ev_' + iid) || wearItem(iid) || { key: iid, kind: 'wear' });

  // ---------- 商品清單（照分頁） ----------
  const evNow = () => {                       // 現在是哪個節日（跟電腦 events.current 一樣的日期；價格以伺服器為準）
    const d = new Date(), md = (d.getMonth() + 1) * 100 + d.getDate();
    for (const [k, v] of Object.entries(D.events)) if (v.start[0] * 100 + v.start[1] <= md && md <= v.end[0] * 100 + v.end[1]) return k;
    return null;
  };
  const wearItem = key => { const w = D.wear.find(x => x.key === key); return w ? { ...w, kind: 'wear' } : null; };
  function priceOf(it) {
    if (it.price != null) return it.price;
    return Math.round(D.evPrice[it.rarity] * (evNow() === it.event ? 1 : D.evOff));   // 電腦 ev_item_price
  }
  function list() {
    const food = window.DC.food(), ev = evNow();
    if (st.tab === 'food') return [
      ...F.items.map(x => ({ ...x, kind: 'food', have: x.key === 'wet' && food ? food.wet : null,
                             unit: x.key === 'wet' ? `一次 ${F.wetPerBuy} 個` : INSTANT.has(x.key) ? '買了馬上用' : '' })),
      ...F.treats.map(t => ({ ...t, kind: 'food', have: food ? food.treats[t.flavor] || 0 : null,
                              desc: `高級點心，一份給一隻毛孩吃（點毛孩 →〔點心〕）。每種個性有一種最愛的口味。` })),
      ...(F.kibble || []).map(k => ({ ...k, kind: 'kibble', unit: '倒進餵食器' })),
    ];
    if (st.tab === 'furn') return D.furn.map(x => {
      const n = st.mine ? +st.mine.owned[x.key] || 0 : 0;
      return { ...x, kind: 'furn', owned: n >= (x.max || 1), have: x.max > 1 && n ? n : null, unit: x.max > 1 ? `最多 ${x.max} 個` : '' };
    });
    const items = st.mine ? st.mine.items : [];
    const wear = D.wear.map(w => ({ ...w, kind: 'wear', owned: !!(w.iid && items.includes(w.iid)), sale: !!(w.event && w.event === ev) }));
    return wear.sort((a, b) => (!a.iid ? -1 : 0) - (!b.iid ? -1 : 0) || (b.sale - a.sale));   // 扭蛋在前；活動中的節日飾品排前面
  }

  // ---------- 畫面 ----------
  function render() {
    const m = st.mine;
    $('shopCans').textContent = m ? `🥫 ${m.cans}` : '🥫 …';
    $('shopTabs').replaceChildren(...TABS.map(([k, label]) => {
      const b = document.createElement('button'); b.type = 'button'; b.textContent = label;
      b.className = k === st.tab ? 'on' : ''; b.onclick = () => { st.tab = k; st.sel = null; st.result = null; st.note = ''; render(); $('shopGrid').scrollTop = 0; };
      return b;
    }));
    const grid = $('shopGrid'); grid.replaceChildren();
    for (const it of list()) {
      const b = document.createElement('button'); b.type = 'button';
      b.className = 'shop-item' + (st.sel === it.key ? ' sel' : '') + (it.owned ? ' owned' : '');
      if (it.rarity != null) b.style.setProperty('--rar', D.rarityColor[it.rarity]);
      const im = document.createElement('img'); im.src = iconURL(it); im.alt = '';
      const name = document.createElement('span'); name.className = 'n'; name.textContent = it.name;
      const pr = document.createElement('span'); pr.className = 'p';
      pr.textContent = it.owned ? '已經有了' : `🥫 ${priceOf(it)}`;
      if (!it.owned && m && m.cans < priceOf(it)) pr.classList.add('short');
      b.append(im, name, pr);
      if (it.have != null && it.have > 0) { const h = document.createElement('span'); h.className = 'have'; h.textContent = it.kind === 'furn' ? `有 ${it.have}／${it.max}` : `有 ${it.have}`; b.append(h); }
      if (it.sale) { const t = document.createElement('span'); t.className = 'tag'; t.textContent = '活動價'; b.append(t); }
      b.onclick = () => { st.sel = it.key; st.result = null; st.note = ''; render(); };
      grid.append(b);
    }
    renderDetail();
  }
  function renderDetail() {
    const box = $('shopDetail'), m = st.mine;
    if (st.result) return renderResult(box);
    const it = list().find(x => x.key === st.sel);
    if (!it) { box.replaceChildren(Object.assign(document.createElement('p'), { className: 'shop-tip', textContent: st.note.startsWith('✘') ? st.note : '點商品看說明，再按〔買〕。' })); return; }
    const im = document.createElement('img'); im.src = iconURL(it); im.alt = '';
    const t = document.createElement('div'); t.className = 'shop-info';
    const h = document.createElement('b');
    h.textContent = it.name + (it.rarity != null ? `（${D.rarity[it.rarity]}）` : '') + (it.unit ? `　${it.unit}` : '');
    const d = document.createElement('p'); d.textContent = it.desc || '';
    if (st.note) {
      const n = document.createElement('p'), bad = st.note.startsWith('✘');
      n.className = 'shop-note' + (bad ? ' bad' : ''); n.textContent = bad ? st.note : '✔ ' + st.note; t.append(h, n);
    } else t.append(h, d);
    const price = priceOf(it), go = document.createElement('button'); go.type = 'button'; go.className = 'btn main';
    const noFeeder = it.kind === 'kibble' && m && !(+m.owned.feeder > 0);   // 貓糧狗糧要先有自動餵食器（伺服器也會擋：no_feeder）
    if (it.owned) { go.textContent = it.max > 1 ? `已經有 ${it.max} 個` : '已經有了'; go.disabled = true; }
    else if (noFeeder) { go.textContent = '先買自動餵食器'; go.onclick = () => toFeeder(); }
    else if (m && m.cans < price) { go.textContent = `罐罐不夠（差 ${price - m.cans}）`; go.disabled = true; }
    else { go.textContent = `${st.note && !st.note.startsWith('✘') ? '再買一個' : '買'} 🥫${price}`; go.disabled = st.busy || !m; go.onclick = () => buy(it); }
    box.replaceChildren(im, t, go);
  }
  function renderResult(box) {                // 扭蛋抽到什麼（說明區換成結果＋〔再抽一次〕）
    const r = st.result, it = r.item, WI = window.DC_RULES.wear.items;
    const im = document.createElement('img'); im.alt = ''; im.className = 'big';
    const t = document.createElement('div'); t.className = 'shop-info';
    const h = document.createElement('b'), d = document.createElement('p');
    if (it) {
      im.src = iconOfItem(it);
      const w = WI[it] || {}, rar = w.rarity != null ? w.rarity : 1;
      h.textContent = `抽到：${w.name || it}（${D.rarity[rar]}）`; h.style.color = D.rarityColor[rar];
      d.textContent = r.new ? `新的！${r.forced ? '（保證拿到沒有的）' : ''}點毛孩 →〔換衣服〕幫牠穿上。` : `已經有了，換回 🥫${r.refund || 0}。`;
    } else { im.src = iconURL(wearItem(r.key)); h.textContent = '扭好了'; d.textContent = r.text || ''; }
    t.append(h, d);
    const again = document.createElement('button'); again.type = 'button'; again.className = 'btn main';
    const w0 = wearItem(r.key), price = priceOf(w0);
    if (st.mine.cans < price) { again.textContent = `罐罐不夠（差 ${price - st.mine.cans}）`; again.disabled = true; }
    else { again.textContent = `再抽一次 🥫${price}`; again.disabled = st.busy; again.onclick = () => buy(w0); }
    box.replaceChildren(im, t, again);
  }

  // ---------- 買 ----------
  const WHY = { cans: '罐罐不夠', owned: '已經有了', invalid: '這個現在買不了', no_feeder: '先買自動餵食器，才有地方倒',
                full: '餵食器滿了，等牠們吃一些再倒', not_broken: '已經修好了' };
  function toFeeder() { st.tab = 'furn'; st.sel = 'feeder'; st.result = null; st.note = ''; render(); }   // 〔先買自動餵食器〕：跳到家具的餵食器
  async function buy(it) {
    if (st.busy) return;
    st.busy = true; renderDetail();
    let r = null;
    try { r = await SV.shopBuy(it.key); } catch (e) { st.note = '✘ ' + (e.message || '連不上伺服器'); }
    st.busy = false;
    if (!r) { renderDetail(); return; }
    if (r.ok === false) { await load(); st.note = '✘ ' + (WHY[r.reason] || '沒辦法買'); renderDetail(); return; }
    if (typeof r.cans === 'number') st.mine.cans = r.cans;
    if (it.kind === 'furn') {
      if (r.owned) st.mine.owned = r.owned; else st.mine.owned[it.key] = (+st.mine.owned[it.key] || 0) + 1;
      window.DC.homeSync && window.DC.homeSync();   // 家裡馬上擺出來（伺服器 020 的 owned；2026-11-01 起是數量）
      st.note = `買了${it.name}！已經擺在家裡`;
    } else if (it.kind === 'kibble') {          // 直接倒進餵食器（伺服器 038 回 {poured, feeder: {cat, dog}}）
      const f = r.feeder || {};
      st.note = `倒進餵食器了（${it.for === 'dog' ? '狗糧' : '貓糧'}現在 ${f[it.for] != null ? f[it.for] : r.poured} 份）`;
    } else if (it.key === 'wet' || it.flavor) {
      window.DC.setFood(r);
      const n = it.key === 'wet' ? r.wet : (r.treats || {})[it.flavor];
      st.note = (it.key === 'wet' ? `買了罐頭 ×${F.wetPerBuy}` : `買了${it.name}`) + (n != null ? `（現在有 ${n}）` : '') + `：點毛孩 →〔${it.key === 'wet' ? '餵飯' : '點心'}〕`;
    } else if (INSTANT.has(it.key)) {         // 買了馬上用：回到家看大家吃（貓薄荷：大家嗨起來）
      close(); window.DC.switchTab('home');
      setTimeout(() => {
        const n = window.DC.feast(it.key);
        window.DC.toast(!n ? `${it.name}放著了，毛孩回家就吃` : it.key === 'catnip' ? '貓薄荷撒下去了！' : `${it.name}發下去了，大家都好開心！`);
      }, 350);
    } else if (it.key === 'gacha' || it.key === 'ev_gacha') {
      if (r.item && r.new) st.mine.items = [...st.mine.items, r.item];
      st.result = { ...r, key: it.key };
    } else {
      if (r.item || it.iid) st.mine.items = [...st.mine.items, r.item || it.iid];
      st.note = `買了${it.name}！點毛孩 →〔換衣服〕幫牠穿上`;
    }
    render();
  }

  // ---------- 打開、關掉 ----------
  async function load() {
    try {
      const r = await SV.shopMine();
      st.mine = { cans: +r.cans || 0, owned: r.owned || {}, items: Array.isArray(r.items) ? r.items : [] };
    } catch (e) { st.note = '✘ ' + (e.message || '連不上伺服器'); }
    render();
  }
  function open(tab) {
    if (tab) st.tab = tab;
    st.sel = null; st.result = null; st.note = '';
    $('shop').hidden = false; document.body.classList.add('login-open');
    render(); load();
    if (window.DC.loadFood) window.DC.loadFood().then(render);   // 罐頭、點心剩幾個
  }
  function close() { $('shop').hidden = true; document.body.classList.remove('login-open'); }
  $('shopClose').onclick = close;
  window.DCShop = { open, close, get state() { return st; } };
  { const q = new URLSearchParams(location.search).get('shop');   // 網址 ?shop=food／furn／wear：一打開就是商店那一頁（預覽工作室📱 手機畫面用）
    if (TABS.some(t => t[0] === q)) setTimeout(() => open(q), 800); }
})();
