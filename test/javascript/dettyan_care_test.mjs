// 🤚 Dettyan のおせわ・ショップ・放置の計算のテスト（ブラウザなしで動く部分だけ）
// 動かし方：node --test test/javascript/
import { test } from "node:test"
import assert from "node:assert/strict"
import { registerHooks } from "node:module"
import { pathToFileURL } from "node:url"
import path from "node:path"

// importmap の名前（"dettyan_foods" など）を app/javascript/ のファイルにつなぐ
const JS_DIR = path.resolve(import.meta.dirname, "../../app/javascript")
registerHooks({
  resolve(specifier, context, next) {
    if (/^dettyan_[a-z_]+$/.test(specifier)) return { url: pathToFileURL(path.join(JS_DIR, `${specifier}.js`)).href, shortCircuit: true }
    return next(specifier, context)
  }
})
const care = await import("dettyan_care")
const { FOODS, findFood, foodGokigen } = await import("dettyan_foods")
const { defaultState, migrate } = await import("dettyan_save")

const HOUR = 3600 * 1000
const T0 = Date.UTC(2026, 10, 17, 3, 0, 0) // 日本の 11/17 12:00
const always = () => 0      // コインが必ず落ちる
const never = () => 0.999   // コインが落ちない

test("日付は日本の時間で区切る", () => {
  assert.equal(care.dayKey(Date.UTC(2026, 10, 17, 14, 59)), "2026-11-17")
  assert.equal(care.dayKey(Date.UTC(2026, 10, 17, 15, 0)), "2026-11-18")
})

test("古いセーブにも新しい項目が入る", () => {
  const s = migrate({ version: 1, money: 5, stats: { genki: 10, gokigen: 50 }, items: { junsai: 1 } })
  assert.deepEqual(s.daily, { day: null, careCoins: 0, rewardDay: null })
  assert.deepEqual(s.care, { lastAt: {} })
  assert.equal(s.money, 5)
  assert.equal(s.items.junsai, 1)
})

test("放置で げんき が回復し、ごきげん は少し下がる。二重に数えない", () => {
  const s = defaultState()
  s.stats = { genki: 40, gokigen: 70 }
  s.lastSeenAt = T0
  care.applyIdle(s, T0 + 5 * HOUR)
  assert.equal(s.stats.genki, 40 + 5 * care.GENKI_PER_HOUR)
  assert.equal(s.stats.gokigen, 70 - 5 * care.GOKIGEN_DOWN_PER_HOUR)
  assert.equal(s.lastSeenAt, T0 + 5 * HOUR)
  care.applyIdle(s, T0 + 5 * HOUR)
  assert.equal(s.stats.genki, 60)
})

test("放置しても ごきげん は下がりすぎず、げんき は 100 まで", () => {
  const s = defaultState()
  s.stats = { genki: 90, gokigen: 40 }
  s.lastSeenAt = T0
  care.applyIdle(s, T0 + 30 * 24 * HOUR)
  assert.equal(s.stats.genki, 100)
  assert.equal(s.stats.gokigen, care.GOKIGEN_FLOOR)
})

test("時計が戻っても（端末の時計がずれても）ステータスは変わらない", () => {
  const s = defaultState()
  s.lastSeenAt = T0
  care.applyIdle(s, T0 - 10 * HOUR)
  assert.equal(s.stats.genki, 80)
})

test("毎日のごほうびは1日1回", () => {
  const s = defaultState()
  assert.equal(care.claimDailyReward(s, T0), care.DAILY_REWARD)
  assert.equal(care.claimDailyReward(s, T0 + HOUR), 0)
  assert.equal(care.claimDailyReward(s, T0 + 24 * HOUR), care.DAILY_REWARD)
  assert.equal(s.money, care.DAILY_REWARD * 2)
})

test("なでると ごきげん が上がり、ときどきコインが落ちる", () => {
  const s = defaultState()
  s.stats.gokigen = 50
  const r = care.doCare(s, "pet", T0, always)
  assert.equal(r.gokigen, care.CARE.pet.gokigen)
  assert.ok(r.coins >= 1)
  assert.equal(s.money, r.coins)
  const r2 = care.doCare(s, "talk", T0, never)
  assert.equal(r2.coins, 0)
})

test("続けてなでても、ほとんど効かずコインも落ちない", () => {
  const s = defaultState()
  s.stats.gokigen = 50
  care.doCare(s, "pet", T0, always)
  const r = care.doCare(s, "pet", T0 + 1000, always)
  assert.equal(r.gokigen, 1)
  assert.equal(r.coins, 0)
})

test("おせわのコインは1日の上限まで。次の日にもどる", () => {
  const s = defaultState()
  let total = 0
  for (let i = 0; i < 100; i++) total += care.doCare(s, i % 2 ? "pet" : "talk", T0 + i * care.CARE_COOLDOWN_MS, always).coins
  assert.equal(total, care.DAILY_CARE_COIN_LIMIT)
  const next = care.doCare(s, "pet", T0 + 24 * HOUR, always)
  assert.ok(next.coins > 0)
})

test("そうじ：ほこりの数だけコイン。きれいなら何もない", () => {
  const s = defaultState()
  s.room.cleanedAt = T0
  assert.equal(care.dirtCount(s, T0 + HOUR), 0)
  assert.equal(care.doCare(s, "clean", T0 + HOUR, always).coins, 0)
  s.room.cleanedAt = T0
  const now = T0 + 7 * HOUR
  assert.equal(care.dirtCount(s, now), 2)
  const r = care.doCare(s, "clean", now, never)
  assert.equal(r.coins, 2)
  assert.equal(care.dirtCount(s, now), 0)
  assert.equal(care.dirtCount(s, now + 100 * HOUR), care.MAX_DIRT)
})

test("じゅんさいを買って、あげる", () => {
  const s = defaultState()
  const junsai = findFood("junsai")
  assert.equal(care.buyFood(s, "junsai").reason, "money")
  s.money = junsai.price
  assert.ok(care.buyFood(s, "junsai").ok)
  assert.equal(s.money, 0)
  assert.equal(s.items.junsai, 1)
  s.stats = { genki: 10, gokigen: 10 }
  const r = care.feedFood(s, "junsai")
  assert.ok(r.ok)
  assert.equal(r.genki, junsai.genki)
  assert.equal(r.gokigen, foodGokigen(junsai))
  assert.equal(s.items.junsai, undefined)
  assert.equal(care.feedFood(s, "junsai").reason, "none")
})

test("おなかいっぱいなら食べない（なくならない）", () => {
  const s = defaultState()
  s.items.junsai = 1
  s.stats = { genki: 100, gokigen: 100 }
  assert.equal(care.feedFood(s, "junsai").reason, "full")
  assert.equal(s.items.junsai, 1)
})

test("じゅんさいは好物で、ほかのごはんより大きくよろこぶ", () => {
  const junsai = findFood("junsai")
  assert.ok(junsai.favorite)
  for (const f of FOODS.filter((f) => !f.favorite)) assert.ok(foodGokigen(junsai) > foodGokigen(f))
})

test("ごはんの表：id がかぶらず、絵は 12×12 で色がそろっている", () => {
  const ids = new Set()
  for (const f of FOODS) {
    assert.ok(!ids.has(f.id), `${f.id} がかぶっている`)
    ids.add(f.id)
    for (const key of ["name", "price", "genki", "gokigen", "line"]) assert.ok(f[key] !== undefined, `${f.id} に ${key} がない`)
    assert.equal(f.sprite.length, 12, `${f.id} の絵の高さ`)
    for (const row of f.sprite) {
      assert.equal(row.length, 12, `${f.id} の絵のはば`)
      for (const c of row) if (c !== ".") assert.ok(f.colors[c], `${f.id} の色 ${c} がない`)
    }
  }
})
