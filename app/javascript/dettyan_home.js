// 🏠 すまい（テント → マイホーム）と 家具（docs/dettyan/requirements.md の 5.6）
// - さいしょは 家がなくて テントで 野宿。お金を ためて マイホーム を買うと、いまの へや に すめる
// - 家具は 1つずつ買って、へや に おかれる（おく場所は きまっている。絵は dettyan_room.js と dettyan_furniture_art.js）
// - ここは「セーブの state をどう変えるか」だけを書く。保存は呼んだ側が store.update(...) の中で行う
// 家具を増やすときは FURNITURE に1つ足して、dettyan_room.js に その絵を足す（id はセーブに入るので、あとから変えない）

export const HOUSE = { id: "house", name: "マイホーム", icon: "🏠", price: 3000, desc: "はじまりのまち の ちいさな いえ。家具を おけるようになる" }

//   needs：さきに 持っていないと 買えない家具
export const FURNITURE = [
  { id: "poster", name: "SiVA の ポスター", icon: "🖼️", price: 300, desc: "かべに はる" },
  { id: "curtain", name: "カーテン", icon: "🪟", price: 400, desc: "まどに カーテン" },
  { id: "clock", name: "かべかけ どけい", icon: "🕰️", price: 500, desc: "いまの 時間を さす" },
  { id: "plant", name: "かんようしょくぶつ", icon: "🪴", price: 600, desc: "大きな はち と まどべの サボテン" },
  { id: "rug", name: "ステージの ラグ", icon: "⭐", price: 800, desc: "この上で 歌う" },
  { id: "shelf", name: "本だな", icon: "📚", price: 1000, desc: "本 と トロフィー と 金のレコード" },
  { id: "desk", name: "つくえ", icon: "🪵", price: 1200, desc: "上に パソコン・ライト・マグ を おける" },
  { id: "chair", name: "いす", icon: "🪑", price: 600, desc: "つくえ で すわれる" },
  { id: "mug", name: "マグカップ", icon: "☕", price: 150, needs: ["desk"], desc: "ゆげ が でる" },
  { id: "lamp", name: "デスクライト", icon: "💡", price: 400, needs: ["desk"], desc: "夜に つく" },
  { id: "speaker", name: "スピーカー", icon: "🔊", price: 1200, desc: "歌うと ふるえる" },
  { id: "rec", name: "REC ランプ", icon: "🔴", price: 700, desc: "歌うと つく" },
  { id: "pc", name: "パソコン", icon: "💻", price: 4000, needs: ["desk"], desc: "つくえ と いす で、へんしゅう や 配信が できる" },
  // 🌱 Sprout の 家具（2026-11-19 に ayaribon。絵は dettyan_furniture_art.js、素材は art の キー が そろって いる ときだけ 売る）
  //   opts：買った あとで えらべる 色・がら（s.home.opts）。sprout：しまう／だす が できる（s.home.hidden）
  { id: "bed", name: "ベッド", icon: "🛏️", price: 2000, sprout: true, art: ["furn_wood"], opts: ["wood", "cover"], desc: "ふかふか。木の 色 と ふとん を えらべる" },
  { id: "dresser", name: "たんす", icon: "🗄️", price: 1500, sprout: true, art: ["furn_wood"], opts: ["wood"], desc: "まどの 下に おく" },
  { id: "table", name: "テーブル と いす", icon: "🍽️", price: 1800, sprout: true, art: ["furn_wood"], opts: ["wood"], desc: "ふたりぶんの いす つき" },
  { id: "sofa", name: "ソファ", icon: "🛋️", price: 2500, sprout: true, art: ["furn_wood"], opts: ["wood"], desc: "へやの すみに おく" },
  { id: "chest", name: "たからばこ", icon: "🧰", price: 1200, sprout: true, art: ["chest_oak"], opts: ["chestWood"], desc: "なにが 入って いるかは ないしょ" },
  { id: "flower", name: "はなの はちうえ", icon: "🌼", price: 300, sprout: true, art: ["furniture"], opts: ["flower"], desc: "まどべに かざる" },
  { id: "picture", name: "かべの え", icon: "🖼️", price: 500, sprout: true, art: ["furniture"], opts: ["picture"], desc: "かべに かける" },
  { id: "mat", name: "しきもの", icon: "🟩", price: 600, sprout: true, art: ["furniture"], opts: ["mat"], desc: "テーブルの 下に しく" },
  // 🎃🎄 きせつ げんてい：その きかん だけ 買える。買った ものは ずっと もっていられる（しまう／だす も できる）
  { id: "pumpkin", name: "かぼちゃ ランタン", icon: "🎃", price: 800, sprout: true, season: "halloween", art: ["deco_pumpkin"], desc: "ハロウィンの かざり。ゆらゆら ひかる" },
  { id: "xmas_tree", name: "クリスマスツリー", icon: "🎄", price: 2500, sprout: true, season: "xmas", art: ["deco_tree"], desc: "キラキラ ひかる" },
  { id: "present", name: "プレゼントの はこ", icon: "🎁", price: 500, sprout: true, season: "xmas", art: ["deco_winter"], opts: ["present"], desc: "ツリーの そばに おく" },
  { id: "snowman", name: "ゆきだるま", icon: "⛄", price: 1000, sprout: true, season: "winter", art: ["deco_winter"], desc: "へやの 中でも とけない" }
]

// 🎨 えらべる 色・がら（いちばん 前が 買った ときの もの）
export const FURNITURE_OPTS = {
  wood: { name: "木の 色", choices: ["さくら", "しらかば", "オーク", "くるみ"], start: 1 },
  chestWood: { name: "木の 色", choices: ["さくら", "しらかば", "オーク", "まつ"], start: 2 },
  cover: { name: "ふとん", choices: ["みどり", "みずいろ", "ピンク", "みどりの がら", "みずいろの がら", "ピンクの がら"], start: 0 },
  flower: { name: "はな", choices: ["ひまわり", "ふたば", "あおい はな"], start: 0 },
  picture: { name: "え", choices: ["そら", "のはら", "よる"], start: 0 },
  mat: { name: "色", choices: ["みどり", "ピンク", "みずいろ"], start: 0 },
  present: { name: "はこ", choices: ["あか", "みどり", "あかと きん", "みどりと きん", "ピンク"], start: 0 }
}

// 🗓️ きせつ（日本の 日づけ。月・日 の はんい。from が to より あと なら 年を またぐ）
//   ふつうの ゲームと 同じく、毎年 同じ きかんに また 買える。きかんを かえる ときは ここだけ 直す
export const SEASONS = {
  halloween: { name: "ハロウィン", from: [10, 1], to: [10, 31] },
  xmas: { name: "クリスマス", from: [12, 1], to: [12, 25] },
  winter: { name: "ふゆ", from: [12, 1], to: [2, 28] }
}

// nowMs（サーバーの 時計）の 日本の 月・日
function jstMonthDay(nowMs) {
  const d = new Date(nowMs + 9 * 3600 * 1000)
  return [d.getUTCMonth() + 1, d.getUTCDate()]
}

export function inSeason(seasonId, nowMs) {
  const se = SEASONS[seasonId]
  if (!se) return true
  const [m, d] = jstMonthDay(nowMs)
  const v = m * 100 + d
  const from = se.from[0] * 100 + se.from[1]
  const to = se.to[0] * 100 + se.to[1]
  return from <= to ? v >= from && v <= to : v >= from || v <= to
}

// 「10/31 まで」
export function seasonEnd(seasonId) {
  const se = SEASONS[seasonId]
  return se ? `${se.to[0]}/${se.to[1]}` : ""
}

// ショップに 出すか：絵の 素材が そろっていて、きせつ げんてい なら きかん中（もう 持っていれば いつでも）
export function shopVisible(s, item, nowMs, hasArt = () => true) {
  if (!(item.art || []).every(hasArt)) return false
  if (item.season && !hasFurniture(s, item.id) && !inSeason(item.season, nowMs)) return false
  return true
}

// えらんでいる 色・がら（番号）
export function furnitureOpt(s, id, key) {
  const v = s.home?.opts?.[id]?.[key]
  const def = FURNITURE_OPTS[key]
  return Number.isInteger(v) && def && v >= 0 && v < def.choices.length ? v : (def?.start ?? 0)
}

export function setFurnitureOpt(s, id, key, value) {
  const item = findFurniture(id)
  const def = FURNITURE_OPTS[key]
  if (!item || !def || !(item.opts || []).includes(key) || !hasFurniture(s, id)) return false
  if (!Number.isInteger(value) || value < 0 || value >= def.choices.length) return false
  s.home.opts = { ...(s.home.opts || {}) }
  s.home.opts[id] = { ...(s.home.opts[id] || {}), [key]: value }
  return true
}

// しまう／だす（Sprout の 家具 だけ。つくえ・パソコン などは PC 作業に いるので しまえない）
export function isShown(s, id) {
  return hasFurniture(s, id) && !s.home.hidden?.[id]
}

export function toggleShown(s, id) {
  const item = findFurniture(id)
  if (!item?.sprout || !hasFurniture(s, id)) return false
  s.home.hidden = { ...(s.home.hidden || {}) }
  if (s.home.hidden[id]) delete s.home.hidden[id]
  else s.home.hidden[id] = true
  return true
}

// へや に 出して いる 家具（{ id: true }）
export function shownFurniture(s) {
  if (!hasHouse(s)) return {}
  return Object.fromEntries(Object.keys(s.home.furniture || {}).filter((id) => isShown(s, id)).map((id) => [id, true]))
}

export function findFurniture(id) {
  return FURNITURE.find((f) => f.id === id) || null
}

export function hasHouse(s) {
  return s.home?.type === "house"
}

export function hasFurniture(s, id) {
  return hasHouse(s) && !!s.home.furniture?.[id]
}

// PC で作業できるか（つくえ・いす・パソコン）
export function canWork(s) {
  return ["desk", "chair", "pc"].every((id) => hasFurniture(s, id))
}

// マイホームを買う。{ ok, reason：「owned」|「money」 }
export function buyHouse(s) {
  if (hasHouse(s)) return { ok: false, reason: "owned" }
  if (s.money < HOUSE.price) return { ok: false, reason: "money" }
  s.money -= HOUSE.price
  s.home = { ...(s.home || {}), type: "house", furniture: s.home?.furniture || {} }
  return { ok: true }
}

// 家具を買う（買うと すぐ へや に おかれる）。{ ok, item, reason：「house」|「owned」|「season」|「needs」|「money」|「unknown」, need }
//   nowMs：きせつ げんてい の 家具を 買う とき の 時計（サーバーの 時計）
export function buyFurniture(s, id, nowMs = Date.now()) {
  const item = findFurniture(id)
  if (!item) return { ok: false, reason: "unknown" }
  if (!hasHouse(s)) return { ok: false, reason: "house", item }
  if (hasFurniture(s, id)) return { ok: false, reason: "owned", item }
  if (item.season && !inSeason(item.season, nowMs)) return { ok: false, reason: "season", item }
  const need = (item.needs || []).find((n) => !hasFurniture(s, n))
  if (need) return { ok: false, reason: "needs", item, need: findFurniture(need) }
  if (s.money < item.price) return { ok: false, reason: "money", item }
  s.money -= item.price
  s.home.furniture[id] = true
  return { ok: true, item }
}
