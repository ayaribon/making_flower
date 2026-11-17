// 🏠 すまい（テント → マイホーム）と 家具（docs/dettyan/requirements.md の 5.6）
// - さいしょは 家がなくて テントで 野宿。お金を ためて マイホーム を買うと、いまの へや に すめる
// - 家具は 1つずつ買って、へや に おかれる（おく場所は きまっている。絵は dettyan_room.js）
// - ここは「セーブの state をどう変えるか」だけを書く。保存は呼んだ側が store.update(...) の中で行う
// 家具を増やすときは FURNITURE に1つ足して、dettyan_room.js に その絵を足す（id はセーブに入るので、あとから変えない）

export const HOUSE = { id: "house", name: "マイホーム", icon: "🏠", price: 300, desc: "はじまりのまち の ちいさな いえ。家具を おけるようになる" }

//   needs：さきに 持っていないと 買えない家具
export const FURNITURE = [
  { id: "poster", name: "SiVA の ポスター", icon: "🖼️", price: 30, desc: "かべに はる" },
  { id: "curtain", name: "カーテン", icon: "🪟", price: 40, desc: "まどに カーテン" },
  { id: "clock", name: "かべかけ どけい", icon: "🕰️", price: 50, desc: "いまの 時間を さす" },
  { id: "plant", name: "かんようしょくぶつ", icon: "🪴", price: 60, desc: "大きな はち と まどべの サボテン" },
  { id: "rug", name: "ステージの ラグ", icon: "⭐", price: 80, desc: "この上で 歌う" },
  { id: "shelf", name: "本だな", icon: "📚", price: 100, desc: "本 と トロフィー と 金のレコード" },
  { id: "desk", name: "つくえ", icon: "🪵", price: 120, desc: "上に パソコン・ライト・マグ を おける" },
  { id: "chair", name: "いす", icon: "🪑", price: 60, desc: "つくえ で すわれる" },
  { id: "mug", name: "マグカップ", icon: "☕", price: 15, needs: ["desk"], desc: "ゆげ が でる" },
  { id: "lamp", name: "デスクライト", icon: "💡", price: 40, needs: ["desk"], desc: "夜に つく" },
  { id: "speaker", name: "スピーカー", icon: "🔊", price: 120, desc: "歌うと ふるえる" },
  { id: "rec", name: "REC ランプ", icon: "🔴", price: 70, desc: "歌うと つく" },
  { id: "pc", name: "パソコン", icon: "💻", price: 400, needs: ["desk"], desc: "つくえ と いす で、へんしゅう や 配信が できる" }
]

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

// 家具を買う（買うと すぐ へや に おかれる）。{ ok, item, reason：「house」|「owned」|「needs」|「money」|「unknown」, need }
export function buyFurniture(s, id) {
  const item = findFurniture(id)
  if (!item) return { ok: false, reason: "unknown" }
  if (!hasHouse(s)) return { ok: false, reason: "house", item }
  if (hasFurniture(s, id)) return { ok: false, reason: "owned", item }
  const need = (item.needs || []).find((n) => !hasFurniture(s, n))
  if (need) return { ok: false, reason: "needs", item, need: findFurniture(need) }
  if (s.money < item.price) return { ok: false, reason: "money", item }
  s.money -= item.price
  s.home.furniture[id] = true
  return { ok: true, item }
}
