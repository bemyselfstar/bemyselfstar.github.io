/* DeskCat 官網：共用版面＋用「遊戲實際影格」模擬演出（不是錄影）
   影格來源：assets/sprites.js（工具/匯出遊戲影格.py 從 DeskCat 程式複本匯出） */
(function () {
  'use strict';
  const SP = window.DESKCAT_SPRITES;
  const SITE = {
    version: 'v4.15.23',
    download: 'https://github.com/bemyselfstar/DeskCat-release/releases/latest',
    mail: 'bemyselfstar.studio@gmail.com',
  };
  window.DESKCAT_SITE = SITE;
  const NAV = [
    ['index.html', '首頁'], ['guide.html', '新手指南'], ['modes.html', '陪伴模式'],
    ['pets.html', '貓狗圖鑑'], ['play.html', '玩法介紹'], ['friends.html', '好友與常見問題'],
  ];
  const reduceMotion = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---------------- 版面：頁首、頁尾、深淺色 ---------------- */
  function layout() {
    const here = (location.pathname.split('/').pop() || 'index.html');
    const head = document.createElement('header');
    head.className = 'site-head';
    head.innerHTML = `<div class="wrap">
      <a class="logo" href="index.html" aria-label="DeskCat 首頁"><img src="assets/favicon.png" alt=""><span>DeskCat</span></a>
      <button class="nav-toggle" aria-expanded="false" aria-controls="site-nav">選單</button>
      <nav class="nav" id="site-nav">${NAV.map(([h, t]) =>
        `<a href="${h}"${h === here ? ' aria-current="page"' : ''}>${t}</a>`).join('')}</nav>
      <button class="theme-btn" title="切換深色／淺色" aria-label="切換深色／淺色">◐</button>
    </div>`;
    document.body.prepend(head);
    const nav = head.querySelector('.nav'), tg = head.querySelector('.nav-toggle');
    tg.addEventListener('click', () => { const o = nav.classList.toggle('open'); tg.setAttribute('aria-expanded', o); });
    let saved = null;
    try { saved = localStorage.getItem('deskcat-theme'); } catch (e) { /* 私密視窗 */ }
    if (saved) document.documentElement.dataset.theme = saved;
    head.querySelector('.theme-btn').addEventListener('click', () => {
      const dark = document.documentElement.dataset.theme
        ? document.documentElement.dataset.theme === 'dark'
        : matchMedia('(prefers-color-scheme: dark)').matches;
      const next = dark ? 'light' : 'dark';
      document.documentElement.dataset.theme = next;
      try { localStorage.setItem('deskcat-theme', next); } catch (e) { /* 忽略 */ }
    });
    const foot = document.createElement('footer');
    foot.className = 'site-foot';
    foot.innerHTML = `<div class="wrap">
      <div>DeskCat 桌面貓咪・Windows 免安裝・網站內容依 ${SITE.version} 玩家版說明整理<br>演出畫面以遊戲實際影格重現，非錄影；聯絡：${SITE.mail}</div>
      <nav class="foot-links" aria-label="頁尾連結"><a href="friends.html#privacy">隱私說明</a><a href="friends.html#faq">常見問題</a><a data-download href="${SITE.download}">下載</a></nav></div>`;
    document.body.append(foot);
    document.querySelectorAll('[data-download]').forEach(a => { a.href = SITE.download; a.target = '_blank'; a.rel = 'noopener'; });
  }

  /* ---------------- 影格 ---------------- */
  const sheets = {};
  function sheet(key) {
    if (!sheets[key]) { const im = new Image(); im.src = SP.pets[key].file; sheets[key] = im; }
    return sheets[key];
  }
  const propImgs = {};
  function propSrc(name) { return SP.props[name] && SP.props[name].file; }
  function animOf(d, anim) {
    if (d.anims[anim]) return anim;
    for (const a of ['sit', 'idle', 'walk']) if (d.anims[a]) return a;
    return Object.keys(d.anims)[0];
  }

  /* ---------------- 演出場景 ---------------- */
  const RESET = { reset: true };
  const scenes = [];

  class Pet {
    constructor(sc, key, o = {}) {
      this.sc = sc; this.key = key; this.d = SP.pets[key];
      this.s = o.scale || sc.scale; this.x = o.x || 0; this.y = o.y || 0;
      this.flip = !!o.flip; this.anim = animOf(this.d, o.anim || 'sit'); this.fps = o.fps || 6;
      this.t0 = sc.t; this.hold = null; this.hidden = false;
      const cv = this.cv = document.createElement('canvas');
      cv.className = 'pet'; cv.width = this.d.w; cv.height = this.d.h;
      cv.style.width = this.d.w * this.s + 'px'; cv.style.height = this.d.h * this.s + 'px';
      if (o.z) cv.style.zIndex = o.z;
      sc.el.appendChild(cv);
      this.ctx = cv.getContext('2d'); this.img = sheet(key);
      this.tag = null;
    }
    set(anim, fps) {
      anim = animOf(this.d, anim);
      if (anim !== this.anim) { this.anim = anim; this.t0 = this.sc.t; }
      if (fps) this.fps = fps;
      return this;
    }
    frames() { return this.d.anims[this.anim][1]; }
    draw() {
      const { w, h } = this.d, [row, n] = this.d.anims[this.anim];
      const f = this.hold != null ? this.hold % n : Math.floor((this.sc.t - this.t0) / 1000 * this.fps) % n;
      const c = this.ctx;
      c.clearRect(0, 0, w, h);
      if (this.img.complete && this.img.naturalWidth) {
        c.save();
        if (this.flip) { c.translate(w, 0); c.scale(-1, 1); }
        c.drawImage(this.img, f * w, row * h, w, h, 0, 0, w, h);
        c.restore();
      }
      this.cv.style.display = this.hidden ? 'none' : '';
      this.cv.style.transform = `translate(${Math.round(this.x - w * this.s / 2)}px, ${Math.round(this.y - h * this.s)}px)`;
      if (this.tag) {
        this.tag.style.left = this.x + 'px'; this.tag.style.top = this.headY() - 4 + 'px';
        this.tag.style.display = this.hidden ? 'none' : '';
      }
    }
    headY() { return this.y - this.d.h * this.s * 0.72; }
    hit(px, py) {
      const hw = this.d.w * this.s * 0.3;
      return px > this.x - hw && px < this.x + hw && py > this.y - this.d.h * this.s * 0.8 && py < this.y + 4;
    }
    nametag(text) {
      this.tag = document.createElement('div'); this.tag.className = 'nametag'; this.tag.textContent = text;
      this.sc.el.appendChild(this.tag);
    }
  }

  class Scene {
    constructor(el, script) {
      this.el = el; this.script = script; this.t = 0; this.visible = false;
      this.paused = reduceMotion; this.gen = 0; this.waits = []; this.ticks = [];
      this.pets = []; this.extra = []; this.offs = [];
      const io = new IntersectionObserver(es => es.forEach(e => { this.visible = e.isIntersecting; }), { threshold: 0.05 });
      io.observe(el);
      scenes.push(this);
      this.start();
    }
    get W() { return this.el.clientWidth; }
    get H() { return this.el.clientHeight; }
    get floor() { return this.H - 32; }
    get scale() { return this.W < 560 ? 2 : 3; }
    start() {
      this.gen++;
      this.waits.forEach(w => w.rej(RESET));
      this.waits = []; this.ticks = []; this.pets = [];
      this.offs.forEach(f => f()); this.offs = [];
      this.extra.forEach(n => n.remove()); this.extra = [];
      this.el.querySelectorAll('canvas.pet, .bubble, .nametag').forEach(n => n.remove());
      this.t = 0;
      const g = this.gen;
      Promise.resolve().then(() => this.script(this)).catch(e => { if (e !== RESET && g === this.gen) console.error(e); });
    }
    tick(dt) {
      if (!this.visible || this.paused) return;
      this.t += dt;
      this.ticks.forEach(f => f(dt));
      const now = this.t, keep = [];
      this.waits.forEach(w => (w.until <= now ? w.res() : keep.push(w)));
      this.waits = keep;
      this.pets.forEach(p => p.draw());
    }
    wait(ms) { return new Promise((res, rej) => this.waits.push({ until: this.t + ms, res, rej })); }
    frame() { return this.wait(0); }
    onTick(f) { this.ticks.push(f); }
    on(target, type, fn, opt) { target.addEventListener(type, fn, opt); this.offs.push(() => target.removeEventListener(type, fn, opt)); }
    pet(key, o) { const p = new Pet(this, key, o); this.pets.push(p); p.draw(); return p; }
    node(html, cls) {
      const d = document.createElement('div'); if (cls) d.className = cls; d.innerHTML = html || '';
      this.el.appendChild(d); this.extra.push(d); return d;
    }
    win(x, y, w, h, title, o = {}) {
      const d = this.node(`<div class="bar"><b>${title || ''}</b>${o.close ? '<i class="x" title="關掉視窗" style="cursor:pointer;pointer-events:auto"></i>' : '<i></i>'}</div><div class="lines"><span style="width:80%"></span><span style="width:60%"></span><span style="width:70%"></span></div>`, 'win' + (o.drag ? ' drag' : ''));
      Object.assign(d.style, { left: x + 'px', top: y + 'px', width: w + 'px', height: h + 'px' });
      d.box = { x, y, w, h };
      return d;
    }
    prop(name, x, y, s) {
      const pr = SP.props[name]; s = s || this.scale;
      const im = document.createElement('img');
      im.src = pr.file; im.alt = ''; im.className = 'prop';
      im.width = pr.w * s; im.height = pr.h * s;
      this.el.appendChild(im); this.extra.push(im);
      im.place = (nx, ny) => { im.px = nx; im.py = ny; im.style.left = Math.round(nx - pr.w * s / 2) + 'px'; im.style.top = Math.round(ny - pr.h * s) + 'px'; };
      im.place(x, y); im.pw = pr.w * s; im.ph = pr.h * s;
      return im;
    }
    say(pet, text, ms = 1800) {
      const b = document.createElement('div'); b.className = 'bubble'; b.textContent = text;
      this.el.appendChild(b);
      const pos = () => { b.style.left = pet.x + 'px'; b.style.top = pet.headY() - 8 + 'px'; };
      pos();
      const g = this.gen, f = () => pos();
      this.ticks.push(f);
      this.wait(ms).then(() => { b.remove(); this.ticks = this.ticks.filter(x => x !== f); }, () => b.remove());
      return b;
    }
    hint(text) { const n = this.node('', 'hint'); n.textContent = text; return n; }
    hud() { return this.node('', 'hud'); }

    /* 動作 */
    async walkTo(p, x, speed = 45, anim = 'walk', fps = 9) {
      p.flip = x < p.x; p.set(anim, fps);
      while (Math.abs(x - p.x) > 1) {
        await this.frame();
        const step = speed * p.s * this.lastDt / 1000;
        p.x += Math.sign(x - p.x) * Math.min(step, Math.abs(x - p.x));
      }
      p.x = x;
    }
    async jumpTo(p, x, y, ms = 650, peak = 50) {
      p.flip = x < p.x;
      p.set('crouch'); await this.wait(220);
      const x0 = p.x, y0 = p.y, t0 = this.t;
      const top = Math.min(y0, y) - peak * p.s / 3;
      while (this.t - t0 < ms) {
        await this.frame();
        const k = Math.min(1, (this.t - t0) / ms);
        p.x = x0 + (x - x0) * k;
        // 二次曲線經過最高點
        const a = (1 - k) * (1 - k) * y0 + 2 * (1 - k) * k * (2 * top - (y0 + y) / 2) + k * k * y;
        p.y = a;
        p.set(k < 0.5 ? 'jump' : 'fall');
      }
      p.x = x; p.y = y; p.set('crouch'); await this.wait(140);
    }
    async fallTo(p, y) {
      let v = 0; p.set('fall');
      while (p.y < y) { await this.frame(); v += 2600 * this.lastDt / 1000; p.y = Math.min(y, p.y + v * this.lastDt / 1000); }
      p.set('crouch'); await this.wait(160);
    }
    async play(p, anim, ms, fps) { p.set(anim, fps); await this.wait(ms); }
  }

  let last = performance.now();

  const rnd = (a, b) => a + Math.random() * (b - a);
  const pick = a => a[Math.floor(Math.random() * a.length)];

  /* ---------------- 各演出腳本 ---------------- */
  const SCENES = {};

  // 首頁：一般的桌面
  SCENES.hero = async sc => {
    const W = sc.W, H = sc.H;
    const A = sc.win(W * 0.05, H * 0.42, W * 0.42, H * 0.5, '工作.txt');
    const B = sc.win(W * 0.53, H * 0.2, W * 0.42, H * 0.55, '瀏覽器');
    sc.node('', 'taskbar');
    const cat = sc.pet('橘虎斑', { x: A.box.x + 40, y: A.box.y + 2, anim: 'walk' });
    const sleeper = sc.pet('黑貓', { x: B.box.x + B.box.w * 0.7, y: B.box.y + 2, anim: 'sleep', fps: 1.2 });
    const dog = sc.pet('柴犬', { x: W * 0.3, y: sc.floor, anim: 'sit_wag', fps: 8 });
    const dogLoop = async () => {
      for (;;) {
        await sc.walkTo(dog, rnd(W * 0.15, W * 0.85), 40);
        await sc.play(dog, pick(['sit_wag', 'pant', 'sit']), rnd(1800, 3200), 6);
        if (Math.random() < 0.3) { sc.say(dog, '汪！', 1200); await sc.play(dog, 'bark', 1200, 5); }
      }
    };
    const sleepLoop = async () => {
      for (;;) { await sc.play(sleeper, 'sleep', rnd(4000, 7000), 1.2); await sc.play(sleeper, 'tail_flick', 1200, 3); }
    };
    const catLoop = async () => {
      for (;;) {
        await sc.walkTo(cat, A.box.x + A.box.w - 30, 40);
        await sc.play(cat, 'sit_blink', 300); await sc.play(cat, 'sit', 1200);
        await sc.jumpTo(cat, B.box.x + 50, B.box.y + 2, 700, 70);
        await sc.walkTo(cat, B.box.x + B.box.w * 0.4, 40);
        await sc.play(cat, 'groom', 2600, 3);
        await sc.play(cat, 'yawn', 1400, 2);
        await sc.walkTo(cat, B.box.x + 30, 40);
        await sc.jumpTo(cat, B.box.x - 30, sc.floor, 650, 30);
        await sc.walkTo(cat, Math.max(40, dog.x - 90), 45);
        cat.flip = false; cat.set('sit');
        sc.say(cat, '喵～', 1400); await sc.wait(1600);
        await sc.walkTo(cat, A.box.x + A.box.w * 0.5, 45);
        await sc.jumpTo(cat, A.box.x + A.box.w * 0.35, A.box.y + 2, 700, 60);
        await sc.play(cat, 'sit', 900);
        await sc.walkTo(cat, A.box.x + 30, 40);
      }
    };
    await Promise.all([dogLoop(), sleepLoop(), catLoop()]);
  };

  // 窗台模式：拖曳視窗，貓跟著走；關掉視窗，貓掉下來
  SCENES.sill = async sc => {
    const W = sc.W, H = sc.H;
    sc.win(W * 0.62, H * 0.3, W * 0.33, H * 0.5, '音樂');
    const win = sc.win(W * 0.08, H * 0.38, Math.min(340, W * 0.5), H * 0.45, '拖我看看', { drag: true, close: true });
    sc.node('', 'taskbar');
    sc.hint('拖曳左邊的視窗，貓會跟著走；按視窗右上角的小方塊把它關掉');
    const cat = sc.pet('橘虎斑', { x: win.box.x + 60, y: win.box.y + 2, anim: 'walk' });
    let rel = 60, onWin = true, open = true, drag = null;
    const follow = () => { if (onWin) { cat.x = win.box.x + rel; cat.y = win.box.y + 2; } };
    sc.onTick(follow);
    win.addEventListener('pointerdown', e => {
      if (e.target.classList.contains('x')) return;
      drag = { dx: e.clientX - win.box.x, dy: e.clientY - win.box.y }; win.setPointerCapture(e.pointerId);
    });
    win.addEventListener('pointermove', e => {
      if (!drag) return;
      win.box.x = Math.max(-20, Math.min(W - win.box.w + 20, e.clientX - drag.dx));
      win.box.y = Math.max(40, Math.min(H - win.box.h - 10, e.clientY - drag.dy));
      win.style.left = win.box.x + 'px'; win.style.top = win.box.y + 'px';
    });
    win.addEventListener('pointerup', () => { drag = null; });
    const reopen = sc.node('<button class="btn sm">重新打開視窗</button>', '');
    Object.assign(reopen.style, { position: 'absolute', right: '10px', bottom: '40px', zIndex: 6, display: 'none' });
    win.querySelector('.x').addEventListener('click', () => { if (open) closeWin(); });
    let closing = null;
    function closeWin() { open = false; win.style.display = 'none'; reopen.style.display = ''; closing = true; }
    reopen.querySelector('button').addEventListener('click', () => {
      win.style.display = ''; reopen.style.display = 'none'; open = true;
    });
    for (;;) {
      if (closing) {
        closing = false; onWin = false;
        sc.say(cat, '！', 900);
        await sc.fallTo(cat, sc.floor);
        await sc.play(cat, 'shake', 900, 4);
        while (!open) { await sc.play(cat, pick(['sit', 'groom', 'tail_flick']), 1500, 3); }
        // 視窗回來了：走到視窗下面跳上去
        await sc.walkTo(cat, Math.max(30, Math.min(W - 30, win.box.x + win.box.w / 2)), 50);
        await sc.jumpTo(cat, win.box.x + win.box.w / 2, win.box.y + 2, 700, 40);
        rel = win.box.w / 2; onWin = true;
        continue;
      }
      // 在視窗上走來走去
      const target = rnd(30, win.box.w - 30);
      cat.flip = target < rel; cat.set('walk', 9);
      while (Math.abs(target - rel) > 1 && !closing) {
        await sc.frame();
        rel += Math.sign(target - rel) * Math.min(40 * cat.s * sc.lastDt / 1000, Math.abs(target - rel));
      }
      if (closing) continue;
      const r = Math.random();
      const act = r < 0.45 ? ['sit', 2200] : r < 0.7 ? ['groom', 2600] : r < 0.85 ? ['loaf', 3000] : ['sleep', 4000];
      cat.set(act[0], act[0] === 'sleep' ? 1.2 : 3);
      const t0 = sc.t;
      while (sc.t - t0 < act[1] && !closing) await sc.frame();
    }
  };

  // 追滑鼠
  SCENES.chase = async sc => {
    const W = sc.W;
    sc.node('', 'taskbar');
    sc.hint('把滑鼠移進來（手機：點一下）');
    const cat = sc.pet('橘虎斑', { x: W * 0.3, y: sc.floor, anim: 'sit' });
    let target = W * 0.5, lastMove = -99999, inside = false;
    const set = e => { const r = sc.el.getBoundingClientRect(); target = Math.max(30, Math.min(W - 30, e.clientX - r.left)); lastMove = sc.t; inside = true; };
    sc.on(sc.el, 'pointermove', set);
    sc.on(sc.el, 'pointerdown', set);
    sc.on(sc.el, 'pointerleave', () => { inside = false; });
    let auto = 0;
    for (;;) {
      await sc.frame();
      if (!inside && sc.t - lastMove > 4000) {          // 沒人動滑鼠：示範
        auto -= sc.lastDt;
        if (auto <= 0) { target = rnd(40, W - 40); auto = rnd(2500, 4500); }
      }
      const dx = target - cat.x, ad = Math.abs(dx), idle = sc.t - lastMove;
      if (ad > 110) { cat.flip = dx < 0; cat.set('run', 12); cat.x += Math.sign(dx) * Math.min(ad, 150 * cat.s * sc.lastDt / 1000 / 2); }
      else if (ad > 22) { cat.flip = dx < 0; cat.set('walk', 9); cat.x += Math.sign(dx) * Math.min(ad, 45 * cat.s * sc.lastDt / 1000); }
      else if (inside && idle > 6000) cat.set('sleep', 1.2);
      else cat.set(inside && idle > 3000 ? 'loaf' : 'sit', 2);
    }
  };

  // 拍桌：打字、用滑鼠
  SCENES.bongo = async sc => {
    const W = sc.W;
    sc.hint('在鍵盤上打字，或在這裡移動、點滑鼠');
    const hud = sc.hud();
    const cat = sc.pet('橘虎斑', { x: W / 2, y: sc.H - 20, anim: 'tap_idle', scale: sc.scale + 1 });
    let keys = 0, clicks = 0, side = 0, until = 0, lastUser = -99999, mouseUntil = 0, clickUntil = 0, said = false, mx = 0;
    const show = () => { hud.textContent = `鍵 ${keys}｜點 ${clicks}`; };
    show();
    const tap = user => {
      keys++; side ^= 1; until = sc.t + 110; mouseUntil = 0; if (user) lastUser = sc.t; show();
      if (!said) { said = true; sc.say(cat, new Date().getHours() < 11 ? '早安！' : '開工囉', 1800); }
    };
    const onKey = e => {
      if (!sc.visible || e.repeat || /INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName)) return;
      tap(true);
    };
    sc.on(window, 'keydown', onKey);
    sc.on(sc.el, 'pointermove', e => { if (Math.abs(e.clientX - mx) > 2) { mouseUntil = sc.t + 500; lastUser = sc.t; } mx = e.clientX; });
    sc.on(sc.el, 'pointerdown', () => { clicks++; clickUntil = sc.t + 140; mouseUntil = sc.t + 600; lastUser = sc.t; show(); });
    const btn = sc.node('<button class="btn sm">⌨ 點這裡打字</button>');
    Object.assign(btn.style, { position: 'absolute', left: '10px', bottom: '10px', zIndex: 6 });
    btn.addEventListener('pointerdown', e => { e.stopPropagation(); tap(true); });
    let burst = 0;
    for (;;) {
      await sc.frame();
      if (sc.t - lastUser > 5000) {                      // 沒人打字時示範
        burst -= sc.lastDt;
        if (burst <= 0) burst = Math.random() < 0.15 ? rnd(900, 1800) : rnd(90, 180), (burst < 300 && tap(false));
      }
      if (sc.t < clickUntil) cat.set('mouse_click');
      else if (sc.t < mouseUntil) { cat.set('mouse_move', 6); }
      else if (sc.t < until) { cat.set(side ? 'tap_left' : 'tap_right'); }
      else cat.set('tap_idle');
    }
  };

  // CPU 跑步
  SCENES.cpu = async sc => {
    const W = sc.W;
    const ground = sc.node('', '');
    Object.assign(ground.style, { position: 'absolute', left: 0, right: 0, bottom: 0, height: '32px', background: 'repeating-linear-gradient(90deg, var(--taskbar) 0 24px, #6b5440 24px 30px)', borderTop: '3px solid #3b2a1c' });
    const hud = sc.hud();
    const box = sc.el.closest('.scene');
    const slider = box && box.querySelector('input[type=range]');
    const autoBox = box && box.querySelector('input[type=checkbox]');
    const cat = sc.pet('橘虎斑', { x: W / 2, y: sc.floor, anim: 'run' });
    let cpu = slider ? +slider.value : 40, off = 0, wander = 0;
    if (slider) slider.addEventListener('input', () => { cpu = +slider.value; if (autoBox) autoBox.checked = false; });
    for (;;) {
      await sc.frame();
      if (autoBox && autoBox.checked) {
        wander -= sc.lastDt;
        if (wander <= 0) { wander = rnd(1500, 3000); cpu = Math.round(Math.max(2, Math.min(98, cpu + rnd(-35, 35)))); if (slider) slider.value = cpu; }
      }
      hud.textContent = `CPU ${cpu}%`;
      let speed;
      if (cpu < 8) { cat.set('sit', 2); speed = 0; }
      else if (cpu < 25) { cat.set('walk', 5 + cpu / 4); speed = 20 + cpu; }
      else { cat.set('run', 6 + cpu / 8); speed = 40 + cpu * 3; }
      off -= speed * sc.lastDt / 1000;
      ground.style.backgroundPosition = Math.round(off) + 'px 0';
    }
  };

  // 點一點、拎起來
  SCENES.touch = async sc => {
    const W = sc.W;
    sc.node('', 'taskbar');
    sc.hint('點貓 1 下、2 下、3 下，或按住把牠拎起來');
    const cat = sc.pet('橘虎斑', { x: W / 2, y: sc.floor, anim: 'sit' });
    let busy = false, clicks = 0, timer = null, down = null, held = false, recent = [], px = 0, vx = 0, throwV = 0;
    sc.onTick(dt => { if (cat.anim === 'fall' && throwV) cat.x = Math.max(30, Math.min(W - 30, cat.x + throwV * dt / 1000)); });
    const rel = e => { const r = sc.el.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
    sc.on(sc.el, 'pointerdown', e => {
      const [x, y] = rel(e);
      if (!cat.hit(x, y) || busy) return;
      down = { x, y }; sc.el.setPointerCapture(e.pointerId);
    });
    sc.on(sc.el, 'pointermove', e => {
      if (!down) return;
      const [x, y] = rel(e);
      if (!held && Math.hypot(x - down.x, y - down.y) > 8) { held = true; busy = true; cat.set('held', 4); }
      if (held) { vx = x - px; px = x; cat.x = x; cat.y = Math.min(sc.floor, y + cat.d.h * cat.s * 0.85); }
    });
    sc.on(sc.el, 'pointerup', async () => {
      if (!down) return;
      down = null;
      if (held) {
        held = false;
        try {
          throwV = Math.max(-25, Math.min(25, vx)) * 8;
          await sc.fallTo(cat, sc.floor); throwV = 0;
          await sc.play(cat, 'shake', 700, 4); cat.set('sit');
        } catch (e) { return; }
        busy = false; return;
      }
      const now = sc.t; recent = recent.filter(t => now - t < 6000); recent.push(now);
      clicks++; clearTimeout(timer);
      timer = setTimeout(() => act(clicks, recent.length), 380);
    });
    async function act(n, many) {
      clicks = 0; busy = true;
      try {
        if (many >= 8) { sc.say(cat, '哈——！', 1600); await sc.play(cat, 'hiss', 1600, 4); }
        else if (many >= 5) { await sc.play(cat, 'tail_flick', 1500, 4); }
        else if (n === 1) { sc.say(cat, '！', 1000); await sc.play(cat, 'idle', 1500); }
        else if (n === 2) { sc.say(cat, '♥ 嚕', 1600); await sc.play(cat, 'sit_blink', 1600); }
        else {
          await sc.play(cat, 'crouch', 400);
          const tx = Math.max(40, Math.min(W - 40, cat.x + (Math.random() < 0.5 ? -80 : 80)));
          await sc.jumpTo(cat, tx, sc.floor, 500, 50);
        }
        cat.set('sit');
      } catch (e) { return; }
      busy = false;
    }
    for (;;) {
      await sc.frame();
      if (!busy && cat.anim === 'sit' && Math.random() < 0.002) { cat.set('sit_blink'); await sc.wait(250); if (cat.anim === 'sit_blink') cat.set('sit'); }
    }
  };

  // 丟球給狗
  SCENES.fetch = async sc => {
    const W = sc.W;
    sc.node('', 'taskbar');
    const hintN = sc.hint('按住球拖一下、放開就丟出去');
    const dog = sc.pet('柴犬', { x: W * 0.25, y: sc.floor, anim: 'sit_wag', fps: 8 });
    const bs = sc.scale + 1;
    const ball = sc.prop('ball', W * 0.75, sc.floor - 60, bs);
    ball.draggable = false; ball.style.pointerEvents = 'auto'; ball.style.touchAction = 'none'; ball.style.cursor = 'grab'; ball.style.zIndex = 4;
    let state = 'ready', bx = W * 0.75, by = sc.floor - 60, vx = 0, vy = 0, drag = null, hist = [], lastUser = 0;
    const r = sc.el.getBoundingClientRect.bind(sc.el);
    ball.addEventListener('pointerdown', e => {
      if (state !== 'ready') return;
      e.preventDefault(); drag = true; state = 'drag'; hist = []; lastUser = sc.t; ball.setPointerCapture(e.pointerId);
    });
    ball.addEventListener('pointermove', e => {
      if (!drag) return;
      const b = r(); bx = Math.max(10, Math.min(W - 10, e.clientX - b.left)); by = Math.max(10, Math.min(sc.floor, e.clientY - b.top + ball.ph / 2));
      hist.push([sc.t, bx, by]); if (hist.length > 6) hist.shift();
    });
    ball.addEventListener('pointerup', () => {
      if (!drag) return;
      drag = false;
      const a = hist[0], z = hist[hist.length - 1];
      if (a && z && z[0] > a[0]) { vx = (z[1] - a[1]) / (z[0] - a[0]) * 1000; vy = (z[2] - a[2]) / (z[0] - a[0]) * 1000; }
      else { vx = (dog.x < bx ? -1 : 1) * 300; vy = -500; }
      vx = Math.max(-1600, Math.min(1600, vx)); vy = Math.max(-1600, Math.min(900, vy));
      origin = bx; state = 'fly';
    });
    let origin = W * 0.75;
    sc.onTick(dt => {
      const s = dt / 1000;
      if (state === 'fly') {
        vy += 1500 * s; bx += vx * s; by += vy * s;
        if (bx < 10 || bx > W - 10) { vx = -vx * 0.6; bx = Math.max(10, Math.min(W - 10, bx)); }
        if (by >= sc.floor) { by = sc.floor; vy = -vy * 0.45; vx *= 0.75; if (Math.abs(vy) < 90) { vy = 0; if (Math.abs(vx) < 30) state = 'rest'; } }
      }
      if (state === 'drag' || state === 'fly' || state === 'rest' || state === 'ready') ball.style.display = '';
      ball.place(bx, by);
    });
    const auto = () => { origin = bx; vx = (Math.random() < 0.5 ? -1 : 1) * rnd(300, 700); vy = rnd(-900, -600); state = 'fly'; };
    for (;;) {
      await sc.frame();
      if (state === 'ready' && sc.t - lastUser > 8000) { lastUser = sc.t; hintN.textContent = '示範中：你也可以自己拖曳球'; auto(); }
      if (state === 'rest') {
        state = 'fetch';
        sc.say(dog, pick(['我去撿！', '汪！球！']), 1200);
        await sc.walkTo(dog, bx + (dog.x < bx ? -18 : 18), 110, 'run', 12);
        ball.style.visibility = 'hidden';
        const back = Math.max(40, Math.min(W - 40, origin));
        await sc.walkTo(dog, back, 50, 'walk_ball', 9);
        await sc.play(dog, 'sit_ball', 700);
        ball.style.visibility = ''; bx = dog.x + (dog.flip ? -30 : 30); by = sc.floor; ball.place(bx, by);
        state = 'ready'; origin = bx;
        sc.say(dog, '再丟一次！', 1800);
        dog.set('sit_wag', 8);
      }
    }
  };

  // 紙箱
  SCENES.box = async sc => {
    const W = sc.W;
    sc.node('', 'taskbar');
    const bx = W * 0.62;
    const box = sc.prop('box', bx, sc.floor + 2);
    const cat = sc.pet('三花', { x: W * 0.12, y: sc.floor, anim: 'walk' });
    for (;;) {
      cat.x = -40; box.style.display = '';
      await sc.walkTo(cat, bx - 70, 45);
      await sc.play(cat, 'sit', 900);
      sc.say(cat, '箱子！', 1200);
      await sc.walkTo(cat, bx, 45);
      box.style.display = 'none'; cat.flip = false;
      await sc.play(cat, 'inbox', 3500, 2);
      await sc.play(cat, 'inbox_sleep', 4500, 1.2);
      await sc.play(cat, 'inbox', 1500, 2);
      box.style.display = '';
      await sc.jumpTo(cat, bx + 90, sc.floor, 500, 30);
      await sc.play(cat, 'groom', 2000, 3);
      await sc.walkTo(cat, W + 60, 45);
      await sc.wait(800);
    }
  };

  // 小劇場：疊羅漢崩塌
  SCENES.pile = async sc => {
    const W = sc.W, H = sc.H;
    const win = sc.win(W * 0.12, H * 0.45, W * 0.76, H * 0.4, '');
    sc.node('', 'taskbar');
    const y = win.box.y + 2, cx = W * 0.5;
    for (;;) {
      const under = sc.pet('灰虎斑', { x: cx, y, anim: 'sleep', fps: 1.2 });
      const top = sc.pet('橘虎斑', { x: win.box.x + 20, y, anim: 'walk' });
      await sc.wait(1200);
      await sc.walkTo(top, cx - 80, 40);
      await sc.play(top, 'sit', 600);
      sc.say(top, '我也要！', 1300);
      await sc.wait(900);
      await sc.jumpTo(top, cx + 4, y - under.d.h * under.s * 0.22, 520, 30);
      top.set('pile_sleep', 1.2);
      await sc.wait(500);
      sc.say(under, '好重…', 1600);
      await sc.wait(3200);
      // 崩塌
      top.set('fall'); const t0 = sc.t;
      while (sc.t - t0 < 380) { await sc.frame(); top.x += 0.12 * sc.lastDt; top.y += 0.06 * sc.lastDt; }
      top.y = y; top.set('crouch'); under.set('sit');
      sc.say(under, '誰啦！', 1500); await sc.wait(300); sc.say(top, '好重！', 1300);
      await sc.play(top, 'shake', 900, 4);
      await sc.play(under, 'tail_flick', 1500, 3);
      top.flip = false; await sc.walkTo(top, win.box.x + win.box.w - 20, 45);
      await sc.wait(1500);
      sc.start(); return;
    }
  };

  // 小劇場：柴犬拒絕邀玩
  SCENES.refuse = async sc => {
    const W = sc.W;
    sc.node('', 'taskbar');
    for (;;) {
      const shiba = sc.pet('柴犬', { x: W * 0.7, y: sc.floor, anim: 'sit', flip: true });
      const collie = sc.pet('邊境牧羊犬', { x: -60, y: sc.floor, anim: 'walk' });
      await sc.walkTo(collie, shiba.x - (shiba.d.w * 0.3 + collie.d.w * 0.36) * shiba.s, 55);
      collie.set('play_bow', 3); sc.say(collie, '陪我玩！', 1500);
      await sc.wait(1600);
      shiba.flip = false; shiba.set('sulk', 1.5);
      sc.say(shiba, '絕對拒否', 1800);
      await sc.wait(2200);
      await sc.play(collie, 'sit', 1200);
      await sc.play(collie, 'play_stomp', 1200, 10);
      sc.say(shiba, '……', 1200);
      await sc.wait(1500);
      await sc.walkTo(collie, -80, 55);
      await sc.wait(600);
      sc.start(); return;
    }
  };

  // 小劇場：哈士奇接飛盤失手
  SCENES.husky = async sc => {
    const W = sc.W;
    sc.node('', 'taskbar');
    for (;;) {
      const dog = sc.pet('哈士奇', { x: W * 0.2, y: sc.floor, anim: 'sit_wag', fps: 8 });
      const disc = sc.prop('disc', -30, sc.floor - 150, sc.scale + 1);
      await sc.wait(900);
      sc.say(dog, '汪！', 900);
      // 飛盤從左邊飛過
      const t0 = sc.t, dur = 2200;
      const fly = dt => { const k = (sc.t - t0) / dur; disc.place(-30 + (W + 60) * k, sc.floor - 150 - Math.sin(k * Math.PI) * 30); };
      sc.onTick(fly);
      await sc.walkTo(dog, W * 0.55, 120, 'run', 12);
      await sc.jumpTo(dog, W * 0.68, sc.floor, 600, 160);
      await sc.wait(Math.max(0, dur - (sc.t - t0)));
      disc.style.display = 'none';
      dog.flip = true; await sc.play(dog, 'sit', 700);
      sc.say(dog, '嗷嗚～♪', 2200);
      await sc.play(dog, 'howl', 2400, 2);
      await sc.play(dog, 'sulk', 1600, 1.5);
      sc.start(); return;
    }
  };

  // 小劇場：邊牧趕走散的貓
  SCENES.herd = async sc => {
    const W = sc.W;
    sc.node('', 'taskbar');
    for (;;) {
      const friend = sc.pet('黑貓', { x: W * 0.1, y: sc.floor, anim: 'loaf', fps: 1.5 });
      const dog = sc.pet('邊境牧羊犬', { x: W * 0.24, y: sc.floor, anim: 'sit' });
      const cat = sc.pet('白貓', { x: W * 0.32, y: sc.floor, anim: 'walk' });
      const gap = (dog.d.w * 0.34 + cat.d.w * 0.3) * dog.s;
      await sc.walkTo(cat, W * 0.55, 40);
      await sc.play(cat, 'groom', 1500, 3);
      sc.say(dog, '！', 800);
      await sc.wait(900);
      await sc.walkTo(dog, Math.min(W - 30, cat.x + gap), 90, 'run', 12);
      dog.flip = true; dog.set('sit'); cat.flip = false;
      sc.say(cat, '好啦好啦…', 1500);
      await sc.wait(600);
      const dest = W * 0.24;
      const back = sc.walkTo(cat, dest, 38);
      await Promise.all([back, sc.walkTo(dog, dest + gap, 38, 'stalk_walk', 7)]);
      cat.flip = false; cat.set('sit'); await sc.play(dog, 'sit_wag', 2200, 8);
      await sc.wait(800);
      sc.start(); return;
    }
  };

  // 小劇場：柴犬被拎起來
  SCENES.lift = async sc => {
    const W = sc.W;
    sc.node('', 'taskbar');
    const hand = sc.node('✋', ''); Object.assign(hand.style, { position: 'absolute', fontSize: '28px', zIndex: 6, transform: 'translate(-50%,-70%)' });
    for (;;) {
      const dog = sc.pet('柴犬', { x: W * 0.5, y: sc.floor, anim: 'sit' });
      hand.style.display = 'none';
      await sc.wait(1200);
      hand.style.display = '';
      const t0 = sc.t; dog.set('held', 4);
      sc.say(dog, '放我下來——！', 2200);
      while (sc.t - t0 < 2600) {
        await sc.frame();
        const k = (sc.t - t0) / 2600;
        dog.x = W * 0.5 + Math.sin(k * 12) * 18; dog.y = sc.floor - 70 * Math.min(1, k * 4);
        hand.style.left = dog.x + 'px'; hand.style.top = dog.y - dog.d.h * dog.s * 0.88 + 'px';
      }
      hand.style.display = 'none';
      await sc.fallTo(dog, sc.floor);
      await sc.play(dog, 'shake', 1000, 4);
      sc.say(dog, '呼…重來。', 1600);
      await sc.play(dog, 'sit', 2200);
      sc.start(); return;
    }
  };

  // 好友的客人貓
  SCENES.guest = async sc => {
    const W = sc.W, H = sc.H;
    const win = sc.win(W * 0.06, H * 0.42, W * 0.88, H * 0.42, '');
    sc.node('', 'taskbar');
    const y = win.box.y + 2;
    for (;;) {
      const mine = sc.pet('橘虎斑', { x: W * 0.3, y, anim: 'sit' });
      const guest = sc.pet('賓士貓', { x: W + 40, y, anim: 'walk', flip: true });
      guest.nametag('🏠 小美家的麻糬');
      guest.x = win.box.x + win.box.w - 20;
      await sc.walkTo(guest, mine.x + mine.d.w * mine.s * 0.5, 40);
      await sc.play(guest, 'sit', 800);
      mine.flip = false;
      sc.say(mine, '喔～', 1000);
      guest.set('nuzzle', 2); mine.set('nuzzle', 2); mine.flip = false; guest.flip = true;
      await sc.wait(2800);
      guest.set('sit'); mine.set('sit');
      await sc.play(guest, 'groom', 2200, 3);
      await sc.play(guest, 'loaf', 2600, 1.5);
      await sc.walkTo(guest, win.box.x + win.box.w - 20, 40);
      await sc.wait(500);
      sc.start(); return;
    }
  };

  // 404：黑貓在工作列上睡覺，偶爾甩尾巴
  SCENES.lost = async sc => {
    sc.node('', 'taskbar');
    const cat = sc.pet('黑貓', { x: sc.W / 2, y: sc.floor, anim: 'sleep', fps: 1.2 });
    for (;;) { await sc.play(cat, 'sleep', rnd(4000, 7000), 1.2); await sc.play(cat, 'tail_flick', 1200, 3); }
  };

  /* ---------------- 小動畫（圖鑑卡片、功能磚） ---------------- */
  class Mini {
    constructor(cv, key, seq, scale) {
      this.cv = cv; this.ctx = cv.getContext('2d'); this.seq = seq; this.i = 0; this.t = 0; this.vis = false; this.scale = scale || 3;
      this.setKey(key);
      new IntersectionObserver(es => es.forEach(e => { this.vis = e.isIntersecting; })).observe(cv);
      minis.push(this);
    }
    setKey(key) {
      this.key = key; this.d = SP.pets[key]; this.img = sheet(key);
      this.cv.width = this.d.w; this.cv.height = this.d.h;
      this.cv.style.width = this.d.w * this.scale + 'px'; this.cv.style.height = this.d.h * this.scale + 'px';
      this.t = 0; this.i = 0;
      this.img.addEventListener('load', () => this.draw());
      this.draw();
    }
    tick(dt) { if (!this.vis || reduceMotion) return; this.t += dt; const [, ms] = this.seq[this.i]; if (this.t > ms) { this.t = 0; this.i = (this.i + 1) % this.seq.length; } this.draw(); }
    draw() {
      const [anim0, , fps] = this.seq[this.i], anim = animOf(this.d, anim0);
      const [row, n] = this.d.anims[anim], f = Math.floor(this.t / 1000 * (fps || 6)) % n;
      const { w, h } = this.d;
      this.ctx.clearRect(0, 0, w, h);
      if (this.img.complete && this.img.naturalWidth) this.ctx.drawImage(this.img, f * w, row * h, w, h, 0, 0, w, h);
    }
  }
  const minis = [];
  const MINI_SEQ = [['idle', 1800], ['sit', 1600], ['walk', 2600, 9], ['sleep', 2600, 1.2]];
  window.DeskCatMini = (cv, key, seq, scale) => new Mini(cv, key, seq || MINI_SEQ, scale);

  /* ---------------- 啟動 ---------------- */
  function reveal() {
    if (reduceMotion || !('IntersectionObserver' in window)) return;
    document.documentElement.classList.add('js-reveal');
    const io = new IntersectionObserver(es => es.forEach(e => {
      if (!e.isIntersecting) return;
      const el = e.target; el.classList.add('in'); io.unobserve(el);
      el.addEventListener('transitionend', () => { el.classList.remove('reveal', 'in'); el.style.transitionDelay = ''; }, { once: true });
    }), { rootMargin: '0px 0px -8% 0px' });
    document.querySelectorAll('main section .px-box, main section .scene').forEach(el => {
      el.classList.add('reveal');
      const sib = [...el.parentElement.children].indexOf(el);       // 同一排依序出現
      el.style.transitionDelay = Math.min(sib, 5) * 60 + 'ms';
      io.observe(el);
    });
  }

  function boot() {
    layout();
    reveal();
    document.querySelectorAll('[data-scene]').forEach(el => {
      const fn = SCENES[el.dataset.scene];
      if (!fn) return;
      const sc = new Scene(el, fn);
      const card = el.closest('.scene');
      if (!card) return;
      const rp = card.querySelector('[data-replay]'), ps = card.querySelector('[data-pause]');
      if (rp) rp.addEventListener('click', () => { sc.paused = false; if (ps) ps.textContent = '❚❚'; sc.start(); });
      if (ps) {
        ps.textContent = sc.paused ? '▶' : '❚❚';
        ps.addEventListener('click', () => { sc.paused = !sc.paused; ps.textContent = sc.paused ? '▶' : '❚❚'; });
      }
    });
    document.querySelectorAll('canvas[data-mini]').forEach(cv => {
      const seq = cv.dataset.seq ? JSON.parse(cv.dataset.seq) : null;
      new Mini(cv, cv.dataset.mini, seq || MINI_SEQ, +(cv.dataset.scale || 3));
    });
    document.querySelectorAll('img[data-prop]').forEach(im => {
      const p = SP.props[im.dataset.prop]; if (!p) return;
      const s = +(im.dataset.scale || 3); im.src = p.file; im.width = p.w * s; im.height = p.h * s; im.alt = im.alt || '';
    });
    requestAnimationFrame(t => { last = t; requestAnimationFrame(function step(n) { const dt = Math.min(50, n - last); last = n; scenes.forEach(s => { s.lastDt = dt; s.tick(dt); }); minis.forEach(m => m.tick(dt)); requestAnimationFrame(step); }); });
    let rz;
    window.addEventListener('resize', () => { clearTimeout(rz); rz = setTimeout(() => scenes.forEach(s => s.start()), 300); });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
