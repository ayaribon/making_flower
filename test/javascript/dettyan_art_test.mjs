// 🎨 Dettyan の絵（部屋・モンスター退治の けしき・そうび）が、色の抜けや変な場所なしに描けるかのテスト
// 本物の canvas は使わず、描いた四角と色を記録するだけ。動かし方：node --test test/javascript/*.mjs
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
const { GEAR, SLOTS, drawDressed, drawHeldMic, drawGearIcon, findGear } = await import("dettyan_gear")
const room = await import("dettyan_room")
const { SCENES } = await import("dettyan_scenes")
const { PLACES, seededRandom } = await import("dettyan_adventure")

// 描いたものを記録する にせの canvas
function fakeCanvas() {
  const calls = []
  let fill = "#000"
  return {
    calls,
    globalAlpha: 1,
    get fillStyle() { return fill },
    set fillStyle(v) { fill = v },
    fillRect(x, y, w, h) {
      calls.push({ x, y, w, h, color: fill })
    },
    save() {}, restore() {}, beginPath() {}, rect() {}, clip() {}, drawImage() {}
  }
}

function assertClean(g, label) {
  assert.ok(g.calls.length > 0, `${label}：なにも描いていない`)
  for (const c of g.calls) {
    assert.ok(typeof c.color === "string" && c.color !== "#ff00ff" && !c.color.includes("undefined"), `${label}：色がない（${c.color}）`)
    for (const k of ["x", "y", "w", "h"]) assert.ok(Number.isFinite(c[k]), `${label}：${k} が ${c[k]}`)
  }
}

test("そうび：どのパーツの どのそうびも、前・うしろ・歌うポーズ・アイコンで描ける", () => {
  for (const gear of GEAR) {
    const set = { [gear.slot]: gear }
    for (const opts of [{}, { frame: 1 }, { view: "back" }, { eyes: "happy", mouth: "open", hideHand: true }]) {
      const g = fakeCanvas()
      drawDressed(g, 10, 10, set, opts)
      assertClean(g, `${gear.id} ${JSON.stringify(opts)}`)
    }
    const g = fakeCanvas()
    drawHeldMic(g, 10, 10, set)
    drawGearIcon(g, gear, 0, 0)
    assertClean(g, `${gear.id} のアイコン`)
  }
})

test("そうび：ぜんぶ そうびしても描ける", () => {
  const set = {}
  for (const slot of SLOTS) set[slot.id] = GEAR.find((g) => g.slot === slot.id)
  set.weapon = findGear("goldmic")
  const g = fakeCanvas()
  drawDressed(g, 0, 0, set)
  assertClean(g, "ぜんぶ")
})

test("部屋：朝・昼・夕方・夜、作業中・歌っている間も描ける", () => {
  const hours = { morning: 6, day: 12, evening: 17, night: 22 }
  for (const [name, h] of Object.entries(hours)) {
    const now = Date.UTC(2026, 10, 17, h - 9, 30)
    assert.equal(room.timeOfDay(now), name)
    for (const mode of [undefined, "work", "sing"]) {
      const g = fakeCanvas()
      room.drawWindowLight(g, now)
      room.drawRoomLive(g, { now, t: 3.2, mode, workT: 1.5 })
      room.drawChair(g)
      room.drawSpeaker(g, mode === "sing", 3.2)
      room.drawNightLight(g, now, mode === "work")
      assertClean(g, `${name} ${mode}`)
    }
  }
})

test("モンスター退治：どの行き先にも けしき があって描ける", () => {
  for (const place of PLACES) {
    const scene = SCENES[place.id]
    assert.ok(scene, `${place.id} の けしき`)
    const g = fakeCanvas()
    scene.base(g, seededRandom(1))
    for (const t of [0, 1.7, 33.3]) scene.live(g, t, seededRandom(2))
    assertClean(g, place.id)
  }
})

test("部屋：Dettyan が すわる・歌う場所は 部屋の中", () => {
  for (const spot of [room.SEAT, room.WORK_SPOT, room.SING_SPOT]) {
    assert.ok(spot.x > 10 && spot.x < room.ROOM_W - 10, `x ${spot.x}`)
    assert.ok(spot.y > 24 && spot.y < room.ROOM_H, `y ${spot.y}`)
  }
  assert.equal(room.SEAT.top, room.SEAT.y - 24)
})
