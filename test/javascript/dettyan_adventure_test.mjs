// 🗺️ ぼうけん（行き先・行って帰る）・そうび の計算のテスト。バトルの中身は dettyan_battle_test.mjs
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
const bt = await import("dettyan_battle")
const { GEAR, SLOTS, findGear, toggleGear, gearBonus, equipped, shopGear, buyGear } = await import("dettyan_gear")
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
  assert.deepEqual(s.gear, { owned: {}, head: null, outfit: null, weapon: null, back: null, feet: null })
  assert.equal(s.dettyan.level, 2)
})

// オートで おわりまで たたかって、もらうものを セーブに入れる（画面と同じ流れ）
function goAuto(s, id, seed) {
  const r = adv.startAdventure(s, id, seed)
  if (!r.ok) return r
  adv.grantEvents(s, bt.runAuto(r.battle))
  return { ...r, ...adv.finishAdventure(s, r.battle) }
}

test("行くと げんき が減り、たおした分の コインと経験値がもらえる", () => {
  const s = fresh()
  const r = goAuto(s, "park", 1)
  assert.ok(r.ok)
  assert.equal(s.stats.genki, 100 - adv.findPlace("park").genki)
  assert.equal(s.money, r.battle.coins)
  assert.ok(r.battle.beaten > 0)
  if (r.levelUps === 0) assert.equal(s.dettyan.exp, r.battle.exp)
  assert.equal(s.adventure.count, 1)
})

test("同じ種で 同じ行動なら 同じバトル", () => {
  const a = bt.createBattle(fresh(), adv.findPlace("forest"), 42)
  const b = bt.createBattle(fresh(), adv.findPlace("forest"), 42)
  assert.deepEqual(bt.runAuto(a), bt.runAuto(b))
  assert.deepEqual(a, b)
})

test("げんき が足りないと行けない", () => {
  const s = fresh()
  s.stats.genki = 10
  assert.equal(adv.startAdventure(s, "park", 1).reason, "genki")
  assert.equal(s.stats.genki, 10)
})

test("レベルが足りない行き先には行けない", () => {
  const s = fresh()
  assert.equal(adv.canGo(s, "forest").reason, "level")
  s.dettyan.level = 3
  assert.ok(adv.canGo(s, "forest").ok)
  assert.equal(adv.canGo(s, "mountain").reason, "level")
})

test("レベルが上がると、ポイントが もらえて、げんき の上限が増える", () => {
  const s = fresh()
  const p1 = adv.dettyanStats(s)
  s.dettyan.exp = adv.expToNext(1) - 1
  const r = goAuto(s, "park", 3)
  assert.ok(r.levelUps >= 1)
  assert.ok(s.dettyan.level >= 2)
  assert.equal(s.dettyan.points, (s.dettyan.level - 1) * bt.POINTS_PER_LEVEL)
  const p2 = adv.dettyanStats(s)
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
    const r = goAuto(s, "park", seed)
    if (r.gear) got++
    got += r.battle.found.gear.length // 宝箱から 出た そうび
  }
  // 公園で落ちるのは5つ（あたま・からだ・て・せなか・あし）。どれも1回ずつしか落ちない（宝箱も おなじ）
  const park = adv.findPlace("park").gear
  assert.equal(got, park.length)
  for (const id of park) assert.ok(s.gear.owned[id], id)
})

test("そうびすると強くなり、もう一度えらぶと はずせる", () => {
  const s = fresh()
  assert.equal(toggleGear(s, "harisen").ok, false) // 持っていない
  s.gear.owned.harisen = true
  const base = adv.dettyanStats(s).atk
  assert.ok(toggleGear(s, "harisen").on)
  assert.equal(s.gear.weapon, "harisen")
  assert.ok(adv.dettyanStats(s).atk > base)
  assert.equal(toggleGear(s, "harisen").on, false)
  assert.equal(s.gear.weapon, null)
})

test("表：行き先・スライム・そうび の id がそろっている", () => {
  for (const p of adv.PLACES) {
    for (const m of p.monsters) assert.ok(adv.MONSTERS[m], `${p.id} の ${m}`)
    for (const g of p.gear) assert.ok(findGear(g), `${p.id} の ${g}`)
  }
  const ids = new Set()
  for (const g of GEAR) {
    assert.ok(!ids.has(g.id), `${g.id} が2つある`)
    ids.add(g.id)
    assert.ok(SLOTS.some((slot) => slot.id === g.slot), `${g.id} の slot`)
    if (g.slot === "weapon") for (const row of g.hand) for (const c of row) if (c !== ".") assert.ok(g.colors[c], `${g.id} の ${c}`)
    if (g.slot === "outfit") for (const k of ["J", "j", "W", "P"]) assert.ok(g.colors[k], `${g.id} の ${k}`)
    if (g.slot === "feet") for (const k of ["F", "f"]) assert.ok(g.colors[k], `${g.id} の ${k}`)
    if (g.slot === "head") assert.ok(g.art && g.icon, `${g.id} の絵`)
    if (g.slot === "back") assert.ok(g.behind && g.backView && g.icon, `${g.id} の絵`)
    // 絵の文字に色がある（K は書かなくても ふちの色）
    for (const art of [g.art, g.backArt, g.behind, g.front, g.backView, g.icon && { rows: g.icon }].filter(Boolean)) {
      for (const row of art.rows) for (const c of row) if (c !== "." && c !== "K") assert.ok(g.colors[c], `${g.id} の ${c}`)
    }
  }
  assert.ok(findFood("junsai"))
})

test("そうびは 体のパーツごと（あたま・からだ・て・せなか・あし）に1つずつ", () => {
  assert.deepEqual(SLOTS.map((slot) => slot.id), ["head", "outfit", "weapon", "back", "feet"])
  const s = fresh()
  for (const id of ["cap", "jersey", "stick", "backpack", "sneakers", "crown"]) s.gear.owned[id] = true
  for (const id of ["cap", "jersey", "stick", "backpack", "sneakers"]) assert.ok(toggleGear(s, id).on)
  const set = equipped(s)
  assert.deepEqual(Object.keys(set).sort(), ["back", "feet", "head", "outfit", "weapon"])
  assert.equal(set.head.id, "cap")
  // 同じパーツのものを えらぶと 入れかわる
  assert.ok(toggleGear(s, "crown").on)
  assert.equal(s.gear.head, "crown")
  assert.equal(s.gear.outfit, "jersey")
  // 強さは5つの合計
  const sum = { hp: 0, atk: 0, def: 0, mag: 0, spd: 0 }
  for (const g of ["crown", "jersey", "stick", "backpack", "sneakers"].map(findGear)) for (const k of Object.keys(sum)) sum[k] += g[k] || 0
  assert.deepEqual(gearBonus(s), sum)
})

test("どの行き先でも、その行き先の そうび が パーツごとに1つずつ落ちる", () => {
  for (const p of adv.PLACES) {
    const own = p.gear.slice(0, SLOTS.length).map(findGear)
    assert.deepEqual(own.map((g) => g.slot).sort(), SLOTS.map((slot) => slot.id).sort(), p.id)
  }
})

test("前のセーブ（ぶき・いしょう だけ）も そのまま読める", () => {
  const s = migrate({ version: 1, gear: { owned: { harisen: true, suit: true }, weapon: "harisen", outfit: "suit" } })
  assert.equal(s.gear.weapon, "harisen")
  assert.equal(s.gear.outfit, "suit")
  assert.equal(s.gear.head, null)
  assert.equal(equipped(s).weapon.id, "harisen")
})

test("ショップの いしょう：買うと持ちものになり、2回は買えない。ぼうけん では落ちない", () => {
  const shop = shopGear()
  for (const slot of SLOTS) assert.ok(shop.some((g) => g.slot === slot.id), `${slot.id} の いしょう`)
  for (const p of adv.PLACES) for (const id of p.gear) assert.ok(!findGear(id).price, `${id} は ぼうけん で落ちるので売らない`)
  const s = fresh()
  const g = shop[0]
  assert.equal(buyGear(s, g.id).reason, "money")
  assert.equal(s.gear.owned[g.id], undefined)
  s.money = g.price + 5
  assert.ok(buyGear(s, g.id).ok)
  assert.equal(s.money, 5)
  assert.ok(s.gear.owned[g.id])
  s.money = 9999
  assert.equal(buyGear(s, g.id).reason, "owned")
  assert.equal(s.money, 9999)
  assert.equal(buyGear(s, "stick").reason, "unknown") // ぼうけん のものは売っていない
  // 買ったら そうびできる
  assert.ok(toggleGear(s, g.id).on)
  assert.equal(s.gear[g.slot], g.id)
})
