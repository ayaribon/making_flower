// ⚔️ モンスター退治・レベル・ぶき いしょう の計算のテスト
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
const adv = await import("dettyan_adventure")
const { GEAR, findGear, toggleGear, gearBonus } = await import("dettyan_gear")
const { maxGenki, applyIdle, feedFood, MAX_STAT, GENKI_PER_LEVEL } = await import("dettyan_care")
const { defaultState, migrate } = await import("dettyan_save")
const { findFood } = await import("dettyan_foods")

function fresh() {
  const s = defaultState()
  s.stats = { genki: 100, gokigen: 70 }
  return s
}

test("古いセーブにも モンスター退治・そうび の項目が入る", () => {
  const s = migrate({ version: 1, money: 5, dettyan: { level: 2, exp: 3 } })
  assert.deepEqual(s.adventure, { count: 0, wins: 0 })
  assert.deepEqual(s.gear, { owned: {}, weapon: null, outfit: null })
  assert.equal(s.dettyan.level, 2)
})

test("行くと げんき が減り、コインと経験値がもらえる（その場で帰ってくる）", () => {
  const s = fresh()
  const r = adv.goAdventure(s, "park", 1)
  assert.ok(r.ok)
  assert.equal(s.stats.genki, 100 - adv.findPlace("park").genki)
  assert.equal(s.money, r.battle.coins)
  assert.ok(r.battle.exp > 0)
  assert.equal(s.adventure.count, 1)
})

test("同じ種なら同じバトル（再生が毎回同じになる）", () => {
  const a = adv.simulate(fresh(), adv.findPlace("forest"), 42)
  const b = adv.simulate(fresh(), adv.findPlace("forest"), 42)
  assert.deepEqual(a, b)
})

test("げんき が足りないと行けない", () => {
  const s = fresh()
  s.stats.genki = 10
  assert.equal(adv.goAdventure(s, "park", 1).reason, "genki")
  assert.equal(s.stats.genki, 10)
})

test("レベルが足りない行き先には行けない", () => {
  const s = fresh()
  assert.equal(adv.canGo(s, "forest").reason, "level")
  s.dettyan.level = 3
  assert.ok(adv.canGo(s, "forest").ok)
  assert.equal(adv.canGo(s, "mountain").reason, "level")
})

test("公園の みどりスライム には、レベル1でもだいたい勝てる", () => {
  let wins = 0
  for (let seed = 1; seed <= 200; seed++) if (adv.simulate(fresh(), adv.findPlace("park"), seed).win) wins++
  assert.ok(wins >= 180, `勝ったのは ${wins}/200`)
})

test("レベルが上がると、強さと げんき の上限が増える", () => {
  const s = fresh()
  const p1 = adv.dettyanPower(s)
  s.dettyan.exp = adv.expToNext(1) - 1
  adv.goAdventure(s, "park", 3)
  assert.ok(s.dettyan.level >= 2)
  const p2 = adv.dettyanPower(s)
  assert.ok(p2.hp > p1.hp && p2.atk > p1.atk)
  assert.equal(maxGenki(s), MAX_STAT + (s.dettyan.level - 1) * GENKI_PER_LEVEL)
})

test("げんき の上限が増えると、放置とごはんで上限まで回復できる", () => {
  const s = fresh()
  s.dettyan.level = 5
  s.stats.genki = 100
  s.lastSeenAt = 1000
  applyIdle(s, 30 * 3600 * 1000)
  assert.equal(s.stats.genki, maxGenki(s))
  s.stats.genki = maxGenki(s) - 5
  s.items.junsai = 1
  assert.ok(feedFood(s, "junsai").ok)
  assert.equal(s.stats.genki, maxGenki(s))
})

test("たたかうと、ときどき ぶき・いしょう が落ちる。持っているものは落ちない", () => {
  const s = fresh()
  s.dettyan.level = 1
  let got = 0
  for (let seed = 1; seed <= 400; seed++) {
    s.stats.genki = 100
    const r = adv.goAdventure(s, "park", seed)
    if (r.battle.gear) got++
  }
  // 公園で落ちるのは2つ。どちらも1回ずつしか落ちない
  assert.equal(got, 2)
  assert.ok(s.gear.owned.stick && s.gear.owned.jersey)
})

test("そうびすると強くなり、もう一度えらぶと はずせる", () => {
  const s = fresh()
  assert.equal(toggleGear(s, "harisen").ok, false) // 持っていない
  s.gear.owned.harisen = true
  const base = adv.dettyanPower(s).atk
  assert.ok(toggleGear(s, "harisen").on)
  assert.equal(s.gear.weapon, "harisen")
  assert.ok(adv.dettyanPower(s).atk > base)
  assert.equal(toggleGear(s, "harisen").on, false)
  assert.equal(s.gear.weapon, null)
})

test("表：行き先・スライム・そうび の id がそろっている", () => {
  for (const p of adv.PLACES) {
    for (const m of p.monsters) assert.ok(adv.MONSTERS[m], `${p.id} の ${m}`)
    for (const g of p.gear) assert.ok(findGear(g), `${p.id} の ${g}`)
  }
  for (const g of GEAR) {
    assert.ok(["weapon", "outfit"].includes(g.slot))
    if (g.slot === "weapon") for (const row of g.hand) for (const c of row) if (c !== ".") assert.ok(g.colors[c], `${g.id} の ${c}`)
    if (g.slot === "outfit") for (const k of ["J", "j", "W", "P"]) assert.ok(g.colors[k], `${g.id} の ${k}`)
  }
  assert.ok(findFood("junsai"))
})
