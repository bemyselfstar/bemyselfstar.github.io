// 信箱的假資料（範例模式；P66 新設計：家＝收明信片、每日禮物、好友動態）。登入了改讀伺服器（server/016，2026-10-16 接好）：
//   dc_mail_mine() 一次讀完（friends、gifts_sent_today、mail、trips、feed、likes），mail.js 的 fromServer 換成這裡的格式；
//   打開禮物＝dc_mail_claim、送禮物＝dc_mail_gift、按 🐾＝dc_mail_like、好友家的毛孩長相＝dc_friend_sprites。開發用 ?mock=1（tools/mock_server.js）
// ago＝幾分鐘前（打開網頁時算）。伺服器只存「哪一種事＋數字、名字」，句子由 mail.js 照固定句型組（跟電腦版 social.py 一樣）。
(window.DC_BUILD = window.DC_BUILD || {})['fake/fake_mail.js'] = 31;   // 版本戳記（mobile/tools/bump.py 一起加 1；不一樣＝手機有舊檔）
window.FAKE_MAIL = {
  friends: [
    { id: 'f1', nickname: '小美', pet: '三花' },
    { id: 'f2', nickname: '阿明', pet: '哈士奇' },
    { id: 'f3', nickname: '阿花', pet: '阿拉斯加雪橇犬' },
  ],
  giftsSentToday: ['f3'],
  // 好友家毛孩的長相（畫「那一刻」用）。之後：好友公開的毛孩卡（friend_cards）＋ M3 上傳的毛孩圖要讓好友也讀得到（跨線需求）
  petsOf: { 麻糬: '白貓', 湯圓: '布偶貓', 阿哈: '哈士奇', 奶茶: '三花', 大熊: '阿拉斯加雪橇犬', 小虎: '橘虎斑' },
  mail: [
    { id: 1, from: '小美', kind: 'gift', cans: 7, claimed: false, ago: 5 },
    { id: 2, from: '小美', kind: 'postcard', ago: 40, read: false,
      data: { name: '小橘', min: 32, pile: 1, pet: 4, fed: 1, host_cats: ['麻糬', '湯圓'] } },
    { id: 3, from: '阿明', kind: 'gift', cans: 4, claimed: false, ago: 95 },
    { id: 4, from: '阿明', kind: 'trip', ago: 60 * 20, read: true,
      data: { name: '布丁', hours: 8, play: 3, sniff: 1, pet: 6, fed: 2, cans: 12, host_cats: ['阿哈'], souvenir: 'yarn' } },
    { id: 5, from: '阿花', kind: 'gift', cans: 5, claimed: true, ago: 60 * 26 },
    { id: 6, from: '阿明', kind: 'postcard', ago: 60 * 50, read: true,
      data: { name: '豆助', min: 15, tug: 2, nuzzle: 3, host_cats: ['阿哈'] } },
  ],
  feed: [
    { id: 11, who: '小美', pet: '三花', kind: 'pile_crash', params: { cat: '湯圓' }, ago: 60, likes: 1, liked: false },
    { id: 16, who: '小美', pet: '三花', kind: 'catch', params: { cat: '麻糬', n: 5 }, ago: 70, likes: 0, liked: false },   // 同一天比較普通的：照片牆只留最精彩的
    { id: 12, who: '阿明', pet: '哈士奇', kind: 'tug', params: { win: '阿哈', lose: '豆助' }, ago: 120, likes: 0, liked: false },
    { id: 13, mine: true, pet: '橘虎斑', kind: 'catch', params: { cat: '小橘', n: 12 }, ago: 180, likes: 2, likedBy: ['小美', '阿明'], fresh: true },
    { id: 14, who: '阿花', pet: '阿拉斯加雪橇犬', kind: 'dogride', params: { cat: '奶茶', dog: '大熊' }, ago: 60 * 9, likes: 3, liked: true },
    { id: 15, mine: true, pet: '柴犬', kind: 'new_cat', params: { cat: '豆助' }, ago: 60 * 30, likes: 1, likedBy: ['阿花'] },
  ],
};
