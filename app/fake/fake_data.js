// 假資料（P66 新設計 M4 用假資料先做樣子）：等遊戲線做好 M1～M3，改讀伺服器上的「每隻毛孩在哪裡＋現在在做什麼」。
// where：home＝🏠 家、desk＝🖥 桌面、pocket＝📱 口袋、friend＝🐾 好友家；personality＝個性（台詞照個性挑，lines.js）；came_at＝來家裡的日子（面板「在一起第 N 天」，跟伺服器 015 一樣）
(window.DC_BUILD = window.DC_BUILD || {})['fake/fake_data.js'] = 36;   // 版本戳記（mobile/tools/bump.py 一起加 1；不一樣＝手機有舊檔）
window.FAKE_HOME = {
  owner: '主人',
  pets: [
    { id: 'p1', came_at: '2025-12-24T10:00:00+08:00', personality: '黏人', name: '小橘', sprite: '橘虎斑', where: 'home', mood: 3, food: 3 },
    { id: 'p2', came_at: '2026-02-14T10:00:00+08:00', personality: '高冷', name: '煤球', sprite: '黑貓', where: 'desk', mood: 2, food: 2, doing: '趴在視窗上睡覺' },
    { id: 'p3', came_at: '2026-03-01T10:00:00+08:00', personality: '普通', name: '西裝', sprite: '賓士貓', where: 'home', mood: 2, food: 2 },
    { id: 'p4', came_at: '2026-04-12T10:00:00+08:00', personality: '貪吃', name: '花花', sprite: '三花', where: 'home', mood: 3, food: 3 },
    { id: 'p5', came_at: '2026-05-20T10:00:00+08:00', personality: '好動', name: '豆助', sprite: '柴犬', where: 'home', mood: 3, food: 2 },
    { id: 'p6', came_at: '2026-06-06T10:00:00+08:00', personality: '黏人', name: '雪球', sprite: '薩摩耶', where: 'friend', friend: '阿明', back: '明天 10:00', mood: 3, food: 3 },
    { id: 'p7', came_at: '2026-07-07T10:00:00+08:00', personality: '高冷', name: '牧牧', sprite: '邊境牧羊犬', where: 'desk', mood: 2, food: 3, doing: '陪你打字' },
    { id: 'p8', came_at: '2026-08-15T10:00:00+08:00', personality: '膽小', name: '咪咪', sprite: '白貓', where: 'pocket', mood: 2, food: 2, doing: '看外面' },
    { id: 'p9', came_at: '2026-10-09T10:00:00+08:00', personality: '貪吃', name: '布丁', sprite: '布偶貓', where: 'home', mood: 2, food: 3 },
  ],
  // 家裡的家具（正式美術：app.js 的 FURN、圖在 art/furniture/）。
  // x＝中心、y＝前緣（腳踩的那條線，越大越前面）。靠牆的 y 寫牆腳。
  furniture: [
    { kind: 'shelf', x: 54, y: 162 },
    { kind: 'cattree', x: 140, y: 166 },
    { kind: 'lamp', x: 372, y: 160 },
    { kind: 'sofa', x: 260, y: 232 },
    { kind: 'armchair', x: 150, y: 268 },
    { kind: 'armchair', x: 370, y: 268, flip: true },
    { kind: 'table', x: 260, y: 290 },
    { kind: 'doghouse', x: 484, y: 268 },
    { kind: 'plant', x: 26, y: 330 },
    { kind: 'plant', x: 538, y: 474 },
    { kind: 'catbed', x: 110, y: 408 },
    { kind: 'bowls', x: 452, y: 400 },
    { kind: 'box', x: 340, y: 430 },
    { kind: 'ball', x: 238, y: 380 },
  ],
  // 地毯：under＝跟著哪一件家具走（佈置搬家具時一起移，app.js rugAt）
  rugs: [
    { x: 150, y: 236, w: 220, h: 84, c1: '#c9564f', c2: '#e07d6a', under: 'table' },
    { x: 74, y: 384, w: 72, h: 40, c1: '#d0703f', c2: '#e99a5e', round: true, under: 'catbed' },
  ],
};
