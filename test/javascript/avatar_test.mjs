// 👤 アバター（キャラメイク）と 🏘️ はじまりのまち の テスト
// 動かし方：node --test test/javascript/*.mjs
import { test } from "node:test"
import assert from "node:assert/strict"
import { registerHooks } from "node:module"
import { pathToFileURL } from "node:url"
import path from "node:path"

const JS_DIR = path.resolve(import.meta.dirname, "../../app/javascript")
registerHooks({
  resolve(specifier, context, next) {
    if (/^(dettyan|avatar|town)_[a-z_]+$/.test(specifier)) return { url: pathToFileURL(path.join(JS_DIR, `${specifier}.js`)).href, shortCircuit: true }
    return next(specifier, context)
  }
})
const av = await import("avatar_sprite")
const town = await import("town_world")
const { findGear } = await import("dettyan_gear")

function fakeCanvas() {
  const calls = []
  let fill = "#000"
  return {
    calls, globalAlpha: 1,
    get fillStyle() { return fill },
    set fillStyle(v) { fill = v },
    fillRect(x, y, w, h) { calls.push({ x, y, w, h, color: fill }) },
    save() {}, restore() {}, beginPath() {}, rect() {}, clip() {}, drawImage() {}
  }
}

function assertClean(g, label) {
  assert.ok(g.calls.length > 0, `${label}：なにも描いていない`)
  for (const c of g.calls) {
    assert.ok(typeof c.color === "string" && c.color !== "#ff00ff" && !c.color.includes("undefined"), `${label}：色がない（${c.color}）`)
    for (const k of ["x", "y", "w", "h"]) assert.ok(Number.isFinite(c[k]), `${label}：${k}`)
  }
}

test("アバター：へんな データ でも 使える形に そろえる", () => {
  assert.deepEqual(av.normalizeAvatar(null), av.DEFAULT_AVATAR)
  assert.deepEqual(av.normalizeAvatar("x"), av.DEFAULT_AVATAR)
  const a = av.normalizeAvatar({ skin: 99, hair: "mohawk", hairColor: 2, eyes: "big", acc: "<script>", topColor: -1, extra: 1 })
  assert.equal(a.skin, av.DEFAULT_AVATAR.skin)
  assert.equal(a.hair, av.DEFAULT_AVATAR.hair)
  assert.equal(a.hairColor, 2)
  assert.equal(a.eyes, "big")
  assert.equal(a.acc, "none")
  assert.equal(a.topColor, av.DEFAULT_AVATAR.topColor)
  assert.equal(a.extra, undefined)
  // 数は 文字（"3"）で きても 数として 読める
  assert.equal(av.normalizeAvatar({ skin: "3" }).skin, 3)
})

test("アバター：おまかせ は いつも 使える形", () => {
  let n = 0
  const rand = () => ((n = (n * 9301 + 49297) % 233280) / 233280)
  for (let i = 0; i < 50; i++) {
    const a = av.randomAvatar(rand)
    assert.deepEqual(av.normalizeAvatar(a), a)
  }
})

test("アバター：どの かみがた・め・ふく・こもの でも 色ぬけ なしで 描ける（歩く・まばたき も）", () => {
  for (const hair of av.HAIRS) for (const eyes of av.EYES) for (const top of av.TOPS) {
    for (const bottom of av.BOTTOMS) {
      const g = fakeCanvas()
      av.drawAvatar(g, 0, 0, { hair: hair.id, eyes: eyes.id, top: top.id, bottom: bottom.id, skin: 4, hairColor: 8 }, { frame: 1 })
      av.drawAvatar(g, 0, 0, { hair: hair.id, eyes: eyes.id }, { blink: true })
      assertClean(g, `${hair.id}/${eyes.id}/${top.id}/${bottom.id}`)
    }
  }
  for (const acc of av.ACCESSORIES) {
    if (acc !== "none") assert.ok(findGear(acc)?.art, `こもの ${acc} の絵が dettyan_gear.js に ある`)
    const g = fakeCanvas()
    av.drawAvatar(g, 0, 0, { acc })
    assertClean(g, acc)
  }
})

test("まち：建物の 入口・歩けるところ", () => {
  for (const b of town.BUILDINGS) {
    const d = town.doorOf(b.id)
    assert.ok(d.x > 0 && d.x < town.TOWN_W && d.y > town.GROUND && d.y < town.TOWN_H, b.id)
  }
  assert.equal(town.doorOf("nope"), null)
  // ふんすい の中は 外へ、はみ出しは 中へ
  const p = town.clampWalk(town.FOUNTAIN.x, town.FOUNTAIN.y)
  const d = Math.hypot((p.x - town.FOUNTAIN.x) / town.FOUNTAIN.rx, (p.y - town.FOUNTAIN.y) / town.FOUNTAIN.ry)
  assert.ok(d >= 1, `ふんすい の 外 ${d}`)
  const q = town.clampWalk(-50, 999)
  assert.ok(q.x >= town.WALK.left && q.y <= town.WALK.bottom)
})

test("まち：建物は 世界の中で かさならない。スマホで 見せる はば は 世界より せまい", () => {
  const xs = town.BUILDINGS.map((b) => b.x).sort((a, b) => a - b)
  for (let i = 1; i < xs.length; i++) assert.ok(xs[i] - xs[i - 1] >= town.BUILDING_W + 4, "建物の あいだ")
  assert.ok(xs[0] >= 0 && xs.at(-1) + town.BUILDING_W <= town.TOWN_W)
  assert.ok(town.VIEW_NARROW < town.TOWN_W)
})

test("まち：朝・昼・夕方・夜 で 描ける", () => {
  const g = fakeCanvas()
  town.drawTownBase(g)
  for (const h of [6, 12, 17, 22]) {
    const now = Date.UTC(2026, 10, 18, h - 9, 30)
    town.drawTownSky(g, now, 3.3)
    town.drawTownLive(g, 3.3)
    town.drawTownNight(g, now)
  }
  assertClean(g, "まち")
})

test("💬 ひとこと：見えない文字・改行は すきまに、20文字まで、から は のこさない", () => {
  assert.equal(av.MSG_MAX, 20)
  assert.equal(av.cleanMsg("  やっほー\n\tみんな  "), "やっほー みんな")
  assert.equal(av.cleanMsg("a‮b​c"), "a b c")
  assert.equal(av.cleanMsg("あ".repeat(30)), "あ".repeat(20))
  assert.equal(Array.from(av.cleanMsg("🎤".repeat(25))).length, 20, "絵文字も 1文字")
  assert.equal(av.cleanMsg(123), "")
  assert.equal(av.cleanMsg("   "), "")
  assert.equal(av.normalizeAvatar({ hair: "bob", msg: " うたうよ！ " }).msg, "うたうよ！")
  assert.ok(!("msg" in av.normalizeAvatar({ hair: "bob", msg: "  " })), "から の ひとこと は のこさない")
  assert.ok(!("msg" in av.DEFAULT_AVATAR))
})

test("まだ キャラが ない人：名前で 見た目が きまる（毎回 同じ・描ける）", () => {
  const a = av.avatarFromName("neighbor")
  assert.deepEqual(av.avatarFromName("neighbor"), a)
  assert.deepEqual(av.normalizeAvatar(a), a, "使える値だけ")
  const looks = new Set(["a1", "b2", "c3", "d4", "e5", "f6", "g7", "h8"].map((n) => JSON.stringify(av.avatarFromName(n))))
  assert.ok(looks.size >= 6, "名前が ちがえば だいたい ちがう 見た目")
  const g = fakeCanvas()
  av.drawAvatar(g, 0, 0, a)
  assertClean(g, "avatarFromName")
})

test("🌱 Sprout Lands 版の 町：画像が なければ 読まない・あれば 描ける（建物・夜の まど・街灯）", async () => {
  const sprout = await import("town_sprout")
  await assert.rejects(sprout.loadSprout({}), "URL が ないときは コードで描く 町に もどる")
  await assert.rejects(sprout.loadSprout({ grass: "x.png" }), "1つでも 足りなければ もどる")
  const fakeImg = {}
  const sheets = Object.fromEntries(Object.keys(sprout.SPROUT_FILES).map((k) => [k, fakeImg]))
  const g = fakeCanvas()
  let images = 0
  g.drawImage = (img) => { assert.equal(img, fakeImg); images++ }
  g.imageSmoothingEnabled = true
  sprout.drawSproutBase(g, sheets)
  assert.ok(images > 50, "地面・木・花 を 画像で 描く")
  assertClean(g, "Sprout の 建物・街灯")
  assert.equal(g.imageSmoothingEnabled, false, "ドットが ぼやけない")
  g.translate = () => {}; g.scale = () => {}
  sprout.drawSproutLive(g, 3.2, sheets)
  const wins = sprout.sproutWindows()
  assert.equal(wins.length, town.BUILDINGS.length * 2)
  for (const [x, y, w, h] of wins) assert.ok(x >= 0 && x + w <= town.TOWN_W && y > 0 && y + h < town.GROUND)
  // 街灯は 井戸（ふんすいの 場所）と かさならない
  for (const lx of sprout.SPROUT_LAMPS) assert.ok(Math.abs(lx - town.FOUNTAIN.x) > town.FOUNTAIN.rx + 4)
})

test("👤 新しい 絵柄（見本）：どの くみあわせ でも 描ける・16×20 に おさまる（こもの は 上に はみ出して よい）", async () => {
  const ch = await import("avatar_chibi")
  assert.equal(ch.CHIBI_SKINS.length, av.SKINS.length, "色の 数は 前と 同じ（保存した 番号が 使える）")
  assert.equal(ch.CHIBI_HAIRS.length, av.HAIR_COLORS.length)
  assert.equal(ch.CHIBI_CLOTHS.length, av.CLOTH_COLORS.length)
  for (const hair of av.HAIRS) {
    for (const eyes of av.EYES) {
      for (const acc of av.ACCESSORIES) {
        for (const [top, bottom] of [["jacket", "pants"], ["tee", "skirt"], ["hoodie", "pants"]]) {
          for (const [draw, w, h] of [[ch.drawChibi, ch.CHIBI_W, ch.CHIBI_H], [ch.drawSlim, ch.SLIM_W, ch.SLIM_H]]) {
            const g = fakeCanvas()
            draw(g, 10, 10, { hair: hair.id, eyes: eyes.id, acc, top, bottom }, { frame: acc === "cap" ? 1 : 0 })
            assertClean(g, `${draw.name} ${hair.id}/${eyes.id}/${acc}`)
            for (const c of g.calls) {
              assert.ok(c.x >= 10 - 1 && c.x <= 10 + w, `よこに はみ出す ${draw.name} ${hair.id}/${acc}`)
              assert.ok(c.y >= 10 - 7 && c.y <= 10 + h, `たてに はみ出す ${draw.name} ${hair.id}/${acc}`)
            }
          }
        }
      }
    }
  }
})
