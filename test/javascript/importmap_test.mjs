// 📦 ブラウザで読むファイルが、config/importmap.rb に ぜんぶ のっているか のテスト
// （のっていないと、ブラウザで その画面の JavaScript が動かない。node のテストでは気づけないので ここで確かめる）
// 動かし方：node --test test/javascript/*.mjs
import { test } from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"

const ROOT = path.resolve(import.meta.dirname, "../..")
const importmap = fs.readFileSync(path.join(ROOT, "config/importmap.rb"), "utf8")
const pins = new Set([...importmap.matchAll(/^pin\s+"([^"]+)"/gm)].map((m) => m[1]))

function jsFiles(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((d) => {
    const p = path.join(dir, d.name)
    if (d.isDirectory()) return jsFiles(p)
    return d.name.endsWith(".js") ? [p] : []
  })
}

test("import している名前は、ぜんぶ importmap に pin されている", () => {
  const missing = []
  for (const file of jsFiles(path.join(ROOT, "app/javascript"))) {
    const src = fs.readFileSync(file, "utf8")
    for (const m of src.matchAll(/(?:^|\n)\s*(?:import|export)\s[^;]*?\sfrom\s+"([^"]+)"/g)) {
      const name = m[1]
      if (name.startsWith(".") || name.startsWith("/") || name.startsWith("controllers/")) continue
      if (!pins.has(name)) missing.push(`${path.relative(ROOT, file)} → "${name}"`)
    }
  }
  assert.deepEqual(missing, [], `config/importmap.rb に pin がない：\n${missing.join("\n")}`)
})

test("pin した dettyan_ の ファイルは ちゃんと ある", () => {
  for (const name of pins) {
    if (!name.startsWith("dettyan_")) continue
    assert.ok(fs.existsSync(path.join(ROOT, "app/javascript", `${name}.js`)), name)
  }
})
