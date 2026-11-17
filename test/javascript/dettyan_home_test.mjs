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

test("前から遊んでいる人（version 2）は、マイホーム と ぜんぶの家具を 持っていて、第1章は たっせい ずみ", () => {
  const s = migrate({ version: 2, money: 50, dettyan: { level: 4, exp: 1, points: 0 } })
  assert.equal(s.home.type, "house")
  for (const f of home.FURNITURE) assert.ok(home.hasFurniture(s, f.id), f.id)
  assert.ok(home.canWork(s))
  assert.equal(s.story.prologue, false) // はじまりの おはなし は 1回 見る
  assert.deepEqual(story.checkStory(s), []) // たっせい の おはなし は 出ない
  assert.equal(story.currentGoal(s), null) // 第1章は クリア あつかい
  // 2回読んでも かわらない・テントに もどらない
  assert.equal(migrate(s).home.type, "house")
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
