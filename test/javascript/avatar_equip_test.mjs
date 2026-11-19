// 👕 装備の 枠：avatar_sprite.js の AVATAR_EQUIP と、サーバーの 画像の 一覧（app/models/game_asset.rb）が そろっているか
// Dettyan の そうび（dettyan_gear.js の GEAR）が ぜんぶ 新しい 絵に ある か
// 動かし方：node --test test/javascript/*.mjs
import { test } from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"

const ROOT = path.resolve(import.meta.dirname, "../..")
const read = (p) => fs.readFileSync(path.join(ROOT, p), "utf8")
const sprite = read("app/javascript/avatar_sprite.js")
const files = [...sprite.slice(sprite.indexOf("export const AVATAR_EQUIP")).matchAll(/file: "([a-z_]+)\.png"/g)].map((m) => m[1])
const rb = read("app/models/game_asset.rb")
const stems = new Set(rb.slice(rb.indexOf("👕 装備の 枠")).match(/%w\[([^\]]+)\]/)[1].split(/\s+/).filter(Boolean))
const slotOf = { head: "hat", outfit: "costume", weapon: "hand_main", back: "back", feet: "shoes" }

test("AVATAR_EQUIP の 画像は ぜんぶ サーバーの 一覧に ある（逆も）", () => {
  assert.ok(files.length > 40)
  for (const f of files) assert.ok(stems.has(f), `game_asset.rb に ${f} が ない`)
  for (const s of stems) if (s !== "body_base") assert.ok(files.includes(s), `AVATAR_EQUIP に ${s} が ない`)
})

test("Dettyan の そうび（GEAR）は ぜんぶ 新しい 絵が ある（id は そのまま）", () => {
  const gear = read("app/javascript/dettyan_gear.js")
  const list = [...gear.matchAll(/\{ id: "([a-z]+)", name: "[^"]+", slot: "([a-z]+)"/g)].map((m) => [m[1], m[2]])
  assert.equal(list.length, 38)
  for (const [id, slot] of list) assert.ok(files.includes(`${slotOf[slot]}_${id}`), `${slot} ${id} → ${slotOf[slot]}_${id}.png が ない`)
})
