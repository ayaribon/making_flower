// 🏠 すまい（テント → マイホーム）・家具・📖 おはなし の テスト
// 動かし方：node --test test/javascript/*.mjs
import { test } from "node:test"
import assert from "node:assert/strict"
import { registerHooks } from "node:module"
import { pathToFileURL } from "node:url"
import path from "node:path"

const JS_DIR = path.resolve(import.meta.dirname, "../../app/javascript")
registerHooks({
  resolve(specifier, context, next) {
    if (/^dettyan_[a-z_]+$/.test(specifier)) return { url: pathToFileURL(path.join(JS_DIR, `${specifier}.js`)).href, shortCircuit: true }
    return next(specifier, context)
  }
})
const home = await import("dettyan_home")
const story = await import("dettyan_story")
const { defaultState, migrate, SAVE_VERSION } = await import("dettyan_save")

test("はじめての人は テントで 野宿・家具なし・はじまりの おはなし を まだ見ていない", () => {
  const s = defaultState()
  assert.equal(s.version, SAVE_VERSION)
  assert.equal(s.home.type, "tent")
  assert.deepEqual(s.home.furniture, {})
  assert.equal(home.hasHouse(s), false)
  assert.equal(s.story.prologue, false)
  assert.equal(story.currentGoal(s).id, "adventure")
})

test("前から遊んでいる人（version 2）も テントで 野宿から。レベル・お金・そうび は そのまま", () => {
  const s = migrate({ version: 2, money: 50, dettyan: { level: 4, exp: 1, points: 2 }, gear: { owned: { cap: true }, head: "cap" } })
  assert.equal(s.version, SAVE_VERSION)
  assert.equal(s.home.type, "tent")
  assert.deepEqual(s.home.furniture, {})
  assert.equal(s.story.prologue, false)
  assert.deepEqual(s.story.seen, {})
  assert.equal(s.money, 500) // version 6 で お金は 10倍（ねうち は そのまま）
  assert.equal(s.dettyan.level, 4)
  assert.equal(s.gear.head, "cap")
  assert.equal(story.currentGoal(s).id, "adventure")
})

test("前の version 3 で マイホーム と ぜんぶの家具を わたしていた セーブは、テントから やりなおす", () => {
  const given = {
    version: 3, money: 60, dettyan: { level: 8, exp: 3, points: 21 },
    home: { type: "house", furniture: Object.fromEntries(home.FURNITURE.map((f) => [f.id, true])) },
    story: { prologue: true, seen: { adventure: true, house: true, pc: true } }
  }
  const s = migrate(given)
  assert.equal(s.home.type, "tent")
  assert.deepEqual(s.home.furniture, {})
  assert.equal(s.story.prologue, false) // はじまりの おはなし（テント）を もう一度
  assert.equal(s.money, 600)
  assert.equal(s.dettyan.level, 8)
  assert.equal(s.dettyan.points, 21)
})

test("version 3 で 自分で マイホーム を買った人・テントの人は そのまま", () => {
  const bought = migrate({ version: 3, home: { type: "house", furniture: { desk: true } }, story: { prologue: true, seen: { adventure: true, house: true } } })
  assert.equal(bought.home.type, "house")
  assert.deepEqual(bought.home.furniture, { desk: true })
  assert.equal(bought.story.prologue, true)
  const tent = migrate({ version: 3, home: { type: "tent", furniture: {} }, story: { prologue: true, seen: { adventure: true } } })
  assert.equal(tent.home.type, "tent")
  assert.equal(tent.story.prologue, true)
})

test("マイホーム：お金が たりないと 買えない。買うと テントから ひっこす。2回は 買えない", () => {
  const s = defaultState()
  s.money = home.HOUSE.price - 1
  assert.equal(home.buyHouse(s).reason, "money")
  s.money = home.HOUSE.price + 10
  assert.ok(home.buyHouse(s).ok)
  assert.equal(s.money, 10)
  assert.ok(home.hasHouse(s))
  assert.equal(home.buyHouse(s).reason, "owned")
})

test("家具：家が ないと 買えない・パソコン は つくえ が さき・2回は 買えない", () => {
  const s = defaultState()
  s.money = 9999
  assert.equal(home.buyFurniture(s, "desk").reason, "house")
  home.buyHouse(s)
  const pc = home.buyFurniture(s, "pc")
  assert.equal(pc.reason, "needs")
  assert.equal(pc.need.id, "desk")
  assert.ok(home.buyFurniture(s, "desk").ok)
  assert.equal(home.buyFurniture(s, "desk").reason, "owned")
  assert.equal(home.canWork(s), false)
  assert.ok(home.buyFurniture(s, "chair").ok)
  assert.ok(home.buyFurniture(s, "pc").ok)
  assert.ok(home.canWork(s))
  assert.equal(home.buyFurniture(s, "nope").reason, "unknown")
  s.money = 0
  assert.equal(home.buyFurniture(s, "rug").reason, "money")
})

test("家具の表：id が かぶらず、needs は ある家具", () => {
  const ids = new Set()
  for (const f of home.FURNITURE) {
    assert.ok(!ids.has(f.id), f.id)
    ids.add(f.id)
    assert.ok(f.price > 0 && f.name && f.icon, f.id)
    for (const n of f.needs || []) assert.ok(home.findFurniture(n), `${f.id} の ${n}`)
  }
})

test("おはなし：目標を たっせい すると 1回だけ おはなし が出る。先に 家を買っても 出る", () => {
  const s = defaultState()
  s.money = 9999
  assert.deepEqual(story.checkStory(s), [])
  home.buyHouse(s) // ぼうけん より先に
  assert.deepEqual(story.checkStory(s), ["house"])
  assert.deepEqual(story.checkStory(s), [])
  assert.equal(story.currentGoal(s).id, "adventure")
  s.adventure.count = 1
  assert.equal(story.currentGoal(s).id, "pc")
  assert.equal(story.GOALS.find((g) => g.id === "pc").progress(s), "0/3")
  for (const id of ["desk", "chair", "pc"]) home.buyFurniture(s, id)
  assert.deepEqual(story.checkStory(s), ["pc"])
  assert.equal(story.currentGoal(s), null) // 第1章 クリア
})

test("おはなし：Lv5 に なると ジョブチェンジ の おはなし が 1回 出る（目標としては 出さない）", () => {
  const s = defaultState()
  s.dettyan.level = 4
  assert.deepEqual(story.checkStory(s), [])
  s.dettyan.level = 5
  assert.deepEqual(story.checkStory(s), ["job"])
  assert.deepEqual(story.checkStory(s), [])
  assert.equal(story.currentGoal(s).id, "adventure")
})

test("おはなし の ページ：ことば と けしき が ある", () => {
  const BGS = ["stream", "flash", "town", "camp", "room"]
  for (const g of story.GOALS) if (g.scene) assert.ok(story.SCENES[g.scene], g.scene)
  for (const [id, pages] of Object.entries(story.SCENES)) {
    assert.ok(pages.length > 0, id)
    for (const p of pages) {
      assert.ok(p.text, id)
      assert.ok(BGS.includes(p.bg), `${id} の ${p.bg}`)
    }
  }
})

test("マイホームは 💰3000。前の セーブ（version 5）の お金は 10倍（ねうち は そのまま）", () => {
  assert.equal(home.HOUSE.price, 3000)
  const s = migrate({ version: 5, money: 92, daily: { day: "2026-11-18", careCoins: 7, rewardDay: null } })
  assert.equal(s.money, 920)
  assert.equal(s.daily.careCoins, 70)
  assert.equal(migrate(s).money, 920) // 2回読んでも ふえない
  assert.equal(s.settings.battleSpeed, 1)
})

// 🛋️ Sprout の 家具・🎃🎄 きせつ げんてい（2026-11-19）
const jst = (ymd) => new Date(`${ymd}T12:00:00+09:00`).getTime()
const houseState = () => { const s = defaultState(); s.money = 99999; home.buyHouse(s); return s }

test("きせつ：ハロウィンは 10月、クリスマスは 12/1〜12/25、ふゆ は 年を またぐ", () => {
  assert.equal(home.inSeason("halloween", jst("2026-10-01")), true)
  assert.equal(home.inSeason("halloween", jst("2026-11-01")), false)
  assert.equal(home.inSeason("xmas", jst("2026-12-25")), true)
  assert.equal(home.inSeason("xmas", jst("2026-12-26")), false)
  assert.equal(home.inSeason("winter", jst("2027-01-15")), true)
  assert.equal(home.inSeason("winter", jst("2026-03-01")), false)
  // 日本の 日づけ で きまる（UTC では まだ 11/30 でも、日本は 12/1）
  assert.equal(home.inSeason("xmas", new Date("2026-11-30T16:00:00Z").getTime()), true)
})

test("きせつ げんてい は きかん中 だけ 買える。買った ものは きかんの あとも もっている", () => {
  const s = houseState()
  assert.equal(home.buyFurniture(s, "pumpkin", jst("2026-11-19")).reason, "season")
  const pumpkin = home.findFurniture("pumpkin")
  assert.equal(home.shopVisible(s, pumpkin, jst("2026-11-19")), false)
  assert.equal(home.buyFurniture(s, "pumpkin", jst("2026-10-20")).ok, true)
  assert.equal(home.shopVisible(s, pumpkin, jst("2026-11-19")), true)
  assert.equal(home.isShown(s, "pumpkin"), true)
})

test("素材が ない 家具は ショップに 出さない", () => {
  const s = houseState()
  const bed = home.findFurniture("bed")
  assert.equal(home.shopVisible(s, bed, jst("2026-11-19"), (k) => k !== "furn_wood"), false)
  assert.equal(home.shopVisible(s, bed, jst("2026-11-19"), () => true), true)
})

test("色・がら は 買った あとで えらべる。はんいの 外 や 持っていない 家具は かえない", () => {
  const s = houseState()
  assert.equal(home.furnitureOpt(s, "bed", "wood"), home.FURNITURE_OPTS.wood.start)
  assert.equal(home.setFurnitureOpt(s, "bed", "wood", 3), false) // まだ 持っていない
  home.buyFurniture(s, "bed")
  assert.equal(home.setFurnitureOpt(s, "bed", "wood", 3), true)
  assert.equal(home.setFurnitureOpt(s, "bed", "cover", 5), true)
  assert.equal(home.setFurnitureOpt(s, "bed", "wood", 9), false)
  assert.equal(home.setFurnitureOpt(s, "bed", "mat", 1), false) // ベッド に ない えらびかた
  assert.equal(home.furnitureOpt(s, "bed", "wood"), 3)
  assert.equal(home.furnitureOpt(s, "bed", "cover"), 5)
})

test("しまう／だす は Sprout の 家具 だけ（つくえ・パソコン は しまえない）", () => {
  const s = houseState()
  home.buyFurniture(s, "sofa")
  home.buyFurniture(s, "desk")
  assert.equal(home.toggleShown(s, "sofa"), true)
  assert.equal(home.isShown(s, "sofa"), false)
  assert.deepEqual(home.shownFurniture(s), { desk: true })
  assert.equal(home.toggleShown(s, "sofa"), true)
  assert.equal(home.isShown(s, "sofa"), true)
  assert.equal(home.toggleShown(s, "desk"), false)
})

test("いれかえる：ゆかの 家具 どうし だけ。2回 いれかえると もとどおり", () => {
  const s = houseState()
  for (const id of ["bed", "sofa", "picture"]) home.buyFurniture(s, id)
  assert.equal(home.placeOf(s, "bed"), "bed")
  assert.equal(home.swapPlaces(s, "bed", "sofa"), true)
  assert.equal(home.placeOf(s, "bed"), "sofa")
  assert.equal(home.placeOf(s, "sofa"), "bed")
  assert.equal(home.swapPlaces(s, "bed", "picture"), false) // かべの え は いれかえ ない
  assert.equal(home.swapPlaces(s, "bed", "chest"), false)   // もっていない
  assert.equal(home.swapPlaces(s, "sofa", "bed"), true)
  assert.equal(home.placeOf(s, "bed"), "bed")
  assert.equal(home.placeOf(s, "sofa"), "sofa")
})
