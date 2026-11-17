// 📖 おはなし（docs/dettyan/requirements.md の 1.5）
// いつものように配信していたら、異世界『はじまりのまち』に とばされていた…
// - 目標（GOALS）を 順番に たっせい すると、おはなし（SCENES）が すすむ
// - 画面には いまの目標を 小さく出す。おはなし は ステージの上に ページで出す（タップで つぎへ）
// - ここは「セーブの state をどう変えるか」と ことば だけ。絵は dettyan_camp.js・dettyan_room.js
// つづき（第2章〜）を足すときは、GOALS に 目標を足して、SCENES に おはなし を足す（id はセーブに入るので、あとから変えない）

import { HOUSE, hasHouse, hasFurniture, canWork } from "dettyan_home"
import { JOB_CHANGE_LEVEL } from "dettyan_battle"

export const CHAPTER_TITLE = "第1章 はじまりのまち"

// done：たっせい したか、progress：目標の よこに出す すすみぐあい、scene：たっせい したときの おはなし
// hidden：目標として 上には出さない（たっせい したら おはなし だけ出る）
export const GOALS = [
  { id: "adventure", text: "🗺️ ぼうけん に 出て、スライムを たおそう", done: (s) => (s.adventure?.count || 0) > 0 },
  { id: "house", text: `🏠 お金を ためて マイホーム を 買おう`, progress: (s) => `💰${s.money}/${HOUSE.price}`,
    done: (s) => hasHouse(s), scene: "house" },
  { id: "pc", text: "💻 つくえ・いす・パソコン を そろえよう", progress: (s) => `${["desk", "chair", "pc"].filter((id) => hasFurniture(s, id)).length}/3`,
    done: (s) => canWork(s), scene: "pc" },
  { id: "job", hidden: true, text: `Lv${JOB_CHANGE_LEVEL} に なる`, done: (s) => (s.dettyan?.level || 1) >= JOB_CHANGE_LEVEL, scene: "job" }
]

export const CLEAR_TEXT = "📖 第1章 クリア！ つづきは じゅんび中…"

// いまの目標（まだ たっせい していない さいしょの目標。前から遊んでいる人の「たっせい ずみ」も とばす）
export function currentGoal(s) {
  return GOALS.find((g) => !g.hidden && !g.done(s) && !s.story?.seen?.[g.id]) || null
}

// 目標を たっせい していたら しるしを付けて、見せる おはなし の id を返す（GOALS の順。先に ちがう目標を たっせい しても、その おはなし は出る）
export function checkStory(s) {
  const out = []
  for (const g of GOALS) {
    if (!g.done(s)) continue
    if (!s.story.seen[g.id]) {
      s.story.seen[g.id] = true
      if (g.scene) out.push(g.scene)
    }
  }
  return out
}

// おはなし の ページ。bg：けしき（"stream"＝もとの世界の へや・"flash"・"town"・"camp"・"room"＝いまの へや）
//   who：しゃべっている人（なければ ナレーション）、pose："back"（うしろすがた）| "front" | "none"（いない）
export const SCENES = {
  prologue: [
    { bg: "stream", pose: "back", text: "いつものように 配信していた、ある夜のこと。" },
    { bg: "stream", pose: "back", who: "Dettyan", text: "「みんな ありがとう〜！ じゃあ つぎの 曲 いきます！」" },
    { bg: "flash", pose: "none", text: "そのとき、画面が まぶしく ひかりだして……" },
    { bg: "town", pose: "front", text: "……きがつくと、見たこともない まち に たっていた。" },
    { bg: "town", pose: "front", who: "Dettyan", text: "「え、ここ どこ？」　かんばんには『はじまりのまち』と かいてある。" },
    { bg: "camp", pose: "front", text: "家も お金も ない。しかたなく、まちはずれに テントを はった。" },
    { bg: "camp", pose: "front", text: "スライムを たおして お金を ためて、マイホーム を 手に入れよう！" }
  ],
  job: [
    { bg: "town", pose: "front", text: "はじまりのまち の しんでん から、ふしぎな 声が きこえた…" },
    { bg: "town", pose: "front", who: "しんでん の 声", text: "「よくぞ ここまで そだった。あたらしい ちから を さずけよう」" },
    { bg: "town", pose: "front", text: "ジョブチェンジ が できるようになった！ 📊 つよさ で、せんし・まほうつかい・うたうたい から えらべるよ。" }
  ],
  house: [
    { bg: "room", pose: "front", text: "ついに マイホーム を 手に入れた！" },
    { bg: "room", pose: "front", who: "Dettyan", text: "「なんにも ないけど… ここから はじめよう」" },
    { bg: "room", pose: "front", text: "家具は 🛒 ショップ の「🏠 いえ・かぐ」で 買えるよ。" }
  ],
  pc: [
    { bg: "room", pose: "back", text: "パソコン が ついた！ これで へんしゅう も 配信も できる。" },
    { bg: "room", pose: "front", who: "Dettyan", text: "「…でも ここ 異世界やん。だれが 見てくれるんやろ？」" },
    { bg: "room", pose: "front", text: "📖 第1章 おしまい。つづきは じゅんび中……" }
  ]
}
