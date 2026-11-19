// 🧑‍💼 Dettyan を 町の アバターと 同じ 絵（素体＋レイヤー。16×32・8方向）で 描く。docs/dettyan/requirements.md
// 画像（S3 の game_assets/sprout_avatar/）が そろえば dettyan_gear.js の drawDressed が この 絵に かわる。なければ 前の 絵
// そうびの 枠：あたま→hat・からだ→costume・て→hand_main・せなか→back・あし→shoes（id は dettyan_gear.js の GEAR と 同じ）
import { drawHuman, avatarLayersOf, DETTYAN_LOOK } from "avatar_human"
import { setHumanDraw } from "dettyan_gear"

let loading = null

// urls：{ キー: URL }（ApplicationHelper#avatar_layer_urls）。そろえば true
export function enableDettyanHuman(urls) {
  if (!urls || !Object.keys(urls).length) return Promise.resolve(false)
  loading ||= Promise.all(Object.entries(urls).map(([key, url]) => new Promise((resolve) => {
    const img = new Image()
    img.onload = () => resolve([key, img])
    img.onerror = () => resolve(null)
    img.src = url
  }))).then((pairs) => {
    const layers = avatarLayersOf(Object.fromEntries(pairs.filter(Boolean)))
    if (!layers?.body) return false
    setHumanDraw((g, left, top, set, opts) => drawDettyanHuman(g, layers, left, top, set, opts))
    return true
  })
  return loading
}

// equipped(state) の 形 → 枠ごとの id
export function equipOf(set = {}, { singing = false } = {}) {
  const equip = {
    costume: set.outfit?.id || "dettyan",
    hat: set.head?.id || "none",
    hand_main: set.weapon?.id || "none",
    back: set.back?.id || "none",
    shoes: set.feet?.id || "default"
  }
  // 歌う ときは マイクを もつ（金のマイク を もっていれば それ）
  if (singing) equip.hand_main = set.weapon?.id === "goldmic" ? "goldmic" : "mic"
  return equip
}

// left, top は 前の 絵（20×24）の 左上。足もとを そろえる
//   opts：view（"back" で うしろ）・dir（8方向）・frame（1 で 歩きの コマ）・hideHand（歌う とき）
function drawDettyanHuman(g, layers, left, top, set, opts = {}) {
  const equip = equipOf(set, { singing: !!opts.hideHand })
  if (opts.noHand) equip.hand_main = "none" // バトルで 道具を ふる ときは 手の ものを 出さない
  const dir = opts.view === "back" ? "up" : opts.dir || "down"
  drawHuman(g, null, left + 10, top + 24, null, { dir, walking: opts.frame === 1, t: 0, look: { ...DETTYAN_LOOK, equip }, layers })
}
