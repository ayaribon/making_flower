// 🪄 歌詞の自動合わせ（方式A：声の区切り × 歌詞の長さ）
// 歌声だけの録音があるので、「声が出ている所」と「息つぎのすき間」がはっきり分かる。
//   1. 歌声を「ひとかたまり」（声が続いている所）に分ける
//   2. 歌詞の各行の長さ（だいたいの音の数＝モーラ）を数える
//   3. 行の順番は変えずに、「行の長さ ÷ 歌う速さ ≒ かたまりの長さ」になるように、
//      かたまりを行に割り当てる（くっつける・飛ばすもあり）。一番ムリのない割り当てを動的計画法で探す
// ブラウザの中だけで計算する（サーバーには送らない・N1）

// ---------- 歌詞の長さ ----------

const SMALL_KANA = /[ぁぃぅぇぉゃゅょゎァィゥェォャュョヮ]/
const KANA = /[ぁ-ゖァ-ヺ]/
const KANJI = /[㐀-鿿豈-﫿]/

// 1行の「だいたいの音の数」（モーラ）。かな＝1、小さいかな（ゃ など）＝0、っ・ー＝1、漢字＝1.6、英語＝母音のかたまりの数
export function lineWeight(text) {
  let w = 0
  const latin = text.match(/[A-Za-z']+/g) || []
  latin.forEach((word) => { w += Math.max(1, (word.toLowerCase().match(/[aeiouy]+/g) || []).length) })
  for (const ch of text.replace(/[A-Za-z']+/g, "")) {
    if (SMALL_KANA.test(ch)) continue
    if (KANA.test(ch) || ch === "ー" || ch === "〜") w += 1
    else if (KANJI.test(ch)) w += 1.6
    else if (/[0-9０-９]/.test(ch)) w += 1.5
  }
  return Math.max(1, w)
}

// ---------- 声のかたまりを見つける ----------

const FRAME = 0.02

// 歌声（Float32Array）→ 声が出ているかたまり [{ start, end }]（秒・声の時間）
export function findVoiceSegments(data, sr, { minGap = 0.1, minLen = 0.1 } = {}) {
  const size = Math.max(1, Math.round(sr * FRAME))
  const n = Math.floor(data.length / size)
  const db = new Float32Array(n)
  for (let f = 0; f < n; f++) {
    let s = 0
    for (let i = f * size; i < (f + 1) * size; i++) s += data[i] * data[i]
    db[f] = 10 * Math.log10(s / size + 1e-12)
  }
  const sorted = Array.from(db).sort((a, b) => a - b)
  const q = (p) => sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))]
  const floor = q(0.15)
  const loud = q(0.95)
  if (!(loud - floor > 6)) return { segments: [], db, frame: size / sr } // 声と雑音の差がほとんどない
  const th = floor + 0.25 * (loud - floor)
  const fs = size / sr
  let segs = []
  let start = -1
  for (let f = 0; f <= n; f++) {
    const on = f < n && db[f] > th
    if (on && start < 0) start = f
    if (!on && start >= 0) { segs.push({ start: start * fs, end: f * fs }); start = -1 }
  }
  // 子音などの短いすき間はつなぐ → 短すぎるもの（クリック音など）は捨てる
  segs = segs.reduce((acc, s) => {
    const last = acc[acc.length - 1]
    if (last && s.start - last.end < minGap) last.end = s.end
    else acc.push({ ...s })
    return acc
  }, []).filter((s) => s.end - s.start >= minLen)
  return { segments: segs, db, frame: fs }
}

// かたまりが行より少ないとき：一番長いかたまりを、途中の一番静かな所で2つに分ける
function splitLongest(segs, db, fs) {
  let bi = -1
  let bl = 0
  segs.forEach((s, i) => { if (s.end - s.start > bl) { bl = s.end - s.start; bi = i } })
  if (bi < 0 || bl < 0.6) return false
  const s = segs[bi]
  const a = Math.floor((s.start + bl * 0.2) / fs)
  const b = Math.ceil((s.start + bl * 0.8) / fs)
  let at = a
  for (let f = a; f <= b && f < db.length; f++) if (db[f] < db[at]) at = f
  const cut = at * fs
  segs.splice(bi, 1, { start: s.start, end: cut, split: true }, { start: cut, end: s.end, split: true })
  return true
}

// 長いかたまり（2行を一息で歌った所など）を、途中の「少し静かになった所」で細かく分けておく。
// 分けた所（soft）は、行の区切りにも、同じ行の続きにもなれる
function softSplit(segs, db, fs) {
  const out = []
  segs.forEach((s) => {
    if (s.end - s.start < 1.2) { out.push(s); return }
    const a = Math.ceil(s.start / fs)
    const b = Math.floor(s.end / fs)
    const vals = Array.from(db.subarray(a, b)).sort((x, y) => x - y)
    const median = vals[Math.floor(vals.length / 2)]
    const cuts = []
    for (let f = a + 2; f < b - 2; f++) {
      const dip = db[f] <= db[f - 1] && db[f] <= db[f + 1] && db[f] < median - 6
      const far = (f - a) * fs > 0.4 && (b - f) * fs > 0.4 && (!cuts.length || (f - cuts[cuts.length - 1]) * fs > 0.3)
      if (dip && far) cuts.push(f)
    }
    let start = s.start
    cuts.forEach((f) => { out.push({ start, end: f * fs, soft: true }); start = f * fs })
    out.push({ start, end: s.end, softStart: cuts.length > 0 })
  })
  // 次のかたまりの始まりが「分けた所」かどうか
  for (let i = 1; i < out.length; i++) out[i].softStart = out[i - 1].soft === true
  return out
}

// ---------- 歌い出しより前の声を捨てる（イントロに歌詞が入らないように） ----------
// イントロの所にも、息・マイクのさわる音・ヘッドホンからもれたオケなどの「小さい声のかたまり」ができる。
// それが1行目に割り当てられて、歌詞がイントロに出てしまうことがあったので、歌い出しを見つけてそれより前を捨てる。
//   歌い出し＝「しっかりした声」（大きさが歌声の中くらい以上・0.3秒以上・音程がある）の最初のかたまり。
//   そのすぐ前（1秒以内）につながっている小さいかたまり（弱起・小さい歌い出し）は残す。
//   notBefore（声の時間）があれば、それより前は捨てる（④でイントロを付けたとき＝イントロの終わり）
export function trimBeforeSinging(segs, db, fs, { pitched = null, notBefore = null } = {}) {
  if (!segs.length) return segs
  const sorted = Array.from(db).sort((a, b) => a - b)
  const q = (p) => sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))]
  const floor = q(0.15)
  const loud = q(0.95)
  const strongTh = floor + 0.55 * (loud - floor)
  const meanDb = (s) => {
    const a = Math.max(0, Math.floor(s.start / fs))
    const b = Math.min(db.length, Math.max(a + 1, Math.ceil(s.end / fs)))
    let sum = 0
    for (let f = a; f < b; f++) sum += db[f]
    return sum / (b - a)
  }
  let list = segs
  if (Number.isFinite(notBefore) && notBefore > 0) {
    const cut = notBefore - 0.6 // 少し前から歌い出す（弱起）ことがあるので、0.6秒だけゆとり
    const kept = list.filter((s) => s.end > cut)
    if (kept.length) list = kept.map((s) => (s.start < cut ? { ...s, start: cut } : s))
  }
  const strong = (s) => s.end - s.start >= 0.3 && meanDb(s) >= strongTh && (!pitched || pitched(s.start, s.end) >= 0.35)
  const first = list.findIndex(strong)
  if (first <= 0) return list
  // 歌い出しのすぐ前につながっている「声らしい」所は残す（弱起・小さい歌い出し）。
  // 音程が分かるときは音程があること、分からないときは近くて（0.5秒以内）そこそこ大きいこと
  const pickup = (prev, next) => {
    const gap = next.start - prev.end
    if (pitched) return gap < 1.0 && pitched(prev.start, prev.end) >= 0.3
    return gap < 0.5 && meanDb(prev) >= floor + 0.4 * (loud - floor)
  }
  let from = first
  while (from > 0 && pickup(list[from - 1], list[from])) from--
  return list.slice(from)
}

// ---------- 割り当て ----------

// 1行の「長さ」：始まり〜終わりと、声が出ていた時間のあいだ（すき間を半分だけ数える）
const measure = (start, end, voiced) => (end - start + voiced) / 2

// 行の長さ weights[] を、かたまり segs[] に割り当てる。戻り値：行ごとの { start, end, cost } か null（飛ばした行はない）
function assign(weights, segs, rate) {
  const N = weights.length
  const M = segs.length
  const MAX_SPAN = 40
  const INF = 1e18
  // cost[i][j]：i 行目までを、j 個目のかたまりまでで終わらせたときの一番小さいムリ
  const cost = Array.from({ length: N + 1 }, () => new Float64Array(M + 1).fill(INF))
  const back = Array.from({ length: N + 1 }, () => new Int32Array(M + 1).fill(-1))
  const kind = Array.from({ length: N + 1 }, () => new Int8Array(M + 1))
  cost[0][0] = 0
  const skipCost = (k) => 0.6 + 1.5 * (segs[k].end - segs[k].start) // 歌詞にない声（手拍子・アドリブ）を飛ばすムリ
  // 1行目より前（イントロ）の声は、歌詞でないことが多いので、飛ばしやすくする
  const leadSkipCost = (k) => 0.15 + 0.4 * (segs[k].end - segs[k].start)
  const spanCost = (i, a, b) => {
    // かたまり a..b-1 を i 行目にする
    const start = segs[a].start
    const end = segs[b - 1].end
    let voiced = 0
    let gapPenalty = 0
    for (let k = a; k < b; k++) {
      voiced += segs[k].end - segs[k].start
      if (k > a) {
        const gap = segs[k].start - segs[k - 1].end
        if (gap > 0.35) gapPenalty += (gap - 0.35) * 1.2 // 行の途中に長い息つぎがあるのは不自然
        if (gap > 1.8) gapPenalty += 8 // 間奏（長い無音）をまたいで1行にはしない（K35 案2）
      }
    }
    const expect = weights[i] * rate
    const r = Math.log(measure(start, end, voiced) / expect)
    // 本当の息つぎで区切るほうが自然。分けた所で行を始めるときは少しだけムリを足す
    const softPenalty = segs[a].softStart ? 0.35 : 0
    return r * r * 2 + gapPenalty + softPenalty
  }
  for (let i = 0; i <= N; i++) {
    for (let j = 0; j <= M; j++) {
      const c = cost[i][j]
      if (c >= INF) continue
      // かたまり j を飛ばす
      const sk = j < M ? (i === 0 ? leadSkipCost(j) : skipCost(j)) : 0
      if (j < M && c + sk < cost[i][j + 1]) {
        cost[i][j + 1] = c + sk
        back[i][j + 1] = j
        kind[i][j + 1] = 0
      }
      // 次の行に、かたまり j..b-1 を割り当てる
      if (i < N) {
        for (let b = j + 1; b <= Math.min(M, j + MAX_SPAN); b++) {
          const v = c + spanCost(i, j, b)
          if (v < cost[i + 1][b]) {
            cost[i + 1][b] = v
            back[i + 1][b] = j
            kind[i + 1][b] = 1
          }
        }
      }
    }
  }
  if (cost[N][M] >= INF) return null
  const out = new Array(N)
  const skipped = [] // 歌詞に割り当てなかったかたまり（その前後の行は、まちがえやすい）
  let i = N
  let j = M
  while (i > 0 || j > 0) {
    const pj = back[i][j]
    if (pj < 0) return null
    if (kind[i][j] === 1) {
      let voiced = 0
      for (let k = pj; k < j; k++) voiced += segs[k].end - segs[k].start
      out[i - 1] = { start: segs[pj].start, end: segs[j - 1].end, cost: spanCost(i - 1, pj, j), dur: measure(segs[pj].start, segs[j - 1].end, voiced) }
      i--
    } else {
      skipped.push({ seg: pj, line: i }) // i 行目のあと（i 行目までが終わったところ）で飛ばした
    }
    j = pj
  }
  return { lines: out, total: cost[N][M], skipped }
}

// 歌詞の行 texts[] と歌声 → 行ごとの { startSec, endSec, cost, sure }（声の時間）
// 歌う速さ（1モーラ何秒か）は分からないので、全体から見積もって、割り当てたあとにもう一度見積もり直す
// opts.pitched(start, end)：その間で音程が取れたフレームの割合（0〜1・あれば歌い出しを見つけやすい）
// opts.notBefore：これより前（声の時間・秒）には歌詞を置かない（④の「イントロ」の終わりなど）
export function alignLyrics(texts, data, sr, opts = {}) {
  const weights = texts.map(lineWeight)
  const found = findVoiceSegments(data, sr)
  const segs = softSplit(trimBeforeSinging(found.segments, found.db, found.frame, opts), found.db, found.frame)
  if (!segs.length || !texts.length) return { lines: null, reason: "声が見つかりませんでした" }
  let guard = 0
  while (segs.length < texts.length && guard++ < texts.length * 2) {
    if (!splitLongest(segs, found.db, found.frame)) break
  }
  if (segs.length < texts.length) return { lines: null, reason: "歌詞の行が、声のかたまりより多すぎます" }

  const totalW = weights.reduce((a, b) => a + b, 0)
  const voiced = segs.reduce((a, s) => a + (s.end - s.start), 0)
  let rate = voiced / totalW
  let result = null
  for (let iter = 0; iter < 3; iter++) {
    const r = assign(weights, segs, rate)
    if (!r) break
    result = r
    // 割り当てた結果から、歌う速さを見積もり直す
    let sum = 0
    r.lines.forEach((l) => { sum += l.dur })
    const next = sum / totalW
    if (Math.abs(next - rate) / rate < 0.02) break
    rate = next
  }
  if (!result) return { lines: null, reason: "うまく割り当てられませんでした" }
  // 自信がない行：ムリが大きい／分けた所から始まる／近くに「歌詞にない声」がある（アドリブとまちがえやすい）
  const unsure = new Set()
  result.lines.forEach((l, k) => { if (l.cost > 0.3) unsure.add(k) })
  result.skipped.forEach(({ line }) => {
    // 最初の行より前（カウントインの手拍子など）・最後の行のあとは気にしない
    if (line > 0 && line < texts.length) { unsure.add(line - 1); unsure.add(line) }
  })
  return {
    lines: result.lines.map((l, k) => ({ startSec: l.start, endSec: l.end, cost: l.cost, sure: !unsure.has(k) })),
    rate,
    segments: segs.length
  }
}

// ---------- 手で直した行を目印にして、残りだけ合わせ直す（K35 案1） ----------
// anchors[i]：固定した行の { startSec, endSec|null }（声の時間）。null の行だけ合わせ直す。
// 固定した行と固定した行のあいだの声だけを使って、あいだの行を割り当てる → 1か所のずれが後ろに広がらない
export function alignLyricsAnchored(texts, data, sr, anchors, opts = {}) {
  if (!anchors || !anchors.some(Boolean)) return alignLyrics(texts, data, sr, opts)
  const weights = texts.map(lineWeight)
  const found = findVoiceSegments(data, sr)
  // 1行目を固定していないときだけ、歌い出しより前を捨てる
  const all = softSplit(anchors[0] ? found.segments : trimBeforeSinging(found.segments, found.db, found.frame, opts), found.db, found.frame)
  if (!all.length) return { lines: null, reason: "声が見つかりませんでした" }

  // 固定した行の終わりが分からないとき（👆タップで合わせた行）：始まりから、息つぎ（0.35秒）までの声を1行とみなす
  const guessEnd = (start, limit) => {
    let end = start + 0.3
    let prev = null
    for (const s of all) {
      if (s.end <= start - 0.05) continue
      if (s.start >= limit) break
      if (prev && s.start - prev.end > 0.35) break
      end = Math.min(limit, s.end)
      prev = s
    }
    return end
  }
  const fixed = anchors.map((a, i) => {
    if (!a) return null
    const next = anchors.slice(i + 1).find(Boolean)
    const limit = next ? next.startSec : Infinity
    return { startSec: a.startSec, endSec: a.endSec ?? guessEnd(a.startSec, limit) }
  })

  // 歌う速さ：全体の声の長さ ÷ 歌詞の長さ（あとで区間ごとに見積もり直す）
  const totalW = weights.reduce((a, b) => a + b, 0)
  const voiced = all.reduce((a, s) => a + (s.end - s.start), 0)
  const rate0 = voiced / totalW

  const out = new Array(texts.length).fill(null)
  let i = 0
  let failed = 0
  while (i < texts.length) {
    if (fixed[i]) {
      out[i] = { startSec: fixed[i].startSec, endSec: fixed[i].endSec, cost: 0, sure: true, locked: true }
      i++
      continue
    }
    let j = i
    while (j < texts.length && !fixed[j]) j++
    const lo = i > 0 && fixed[i - 1] ? fixed[i - 1].endSec : -Infinity
    const hi = j < texts.length ? fixed[j].startSec : Infinity
    const segs = all
      .filter((s) => s.end > lo + 0.02 && s.start < hi - 0.02)
      .map((s) => ({ ...s, start: Math.max(s.start, lo), end: Math.min(s.end, hi) }))
      .filter((s) => s.end - s.start >= 0.05)
    const n = j - i
    let guard = 0
    while (segs.length < n && guard++ < n * 2) {
      if (!splitLongest(segs, found.db, found.frame)) break
    }
    let r = null
    if (segs.length >= n) {
      const w = weights.slice(i, j)
      const sw = w.reduce((a, b) => a + b, 0)
      const sv = segs.reduce((a, s) => a + (s.end - s.start), 0)
      // 区間の中の声の長さから速さを決める（全体の速さとかけ離れないように平均する）
      let rate = sv > 0 ? (sv / sw + rate0) / 2 : rate0
      for (let iter = 0; iter < 3; iter++) {
        const t = assign(w, segs, rate)
        if (!t) break
        r = t
        let sum = 0
        t.lines.forEach((l) => { sum += l.dur })
        const next = sum / sw
        if (Math.abs(next - rate) / rate < 0.02) break
        rate = next
      }
    }
    if (!r) {
      failed += n // 合わせられなかった行は、時間を変えない
    } else {
      r.lines.forEach((l, k) => { out[i + k] = { startSec: l.start, endSec: l.end, cost: l.cost, sure: l.cost <= 0.3 } })
    }
    i = j
  }
  return { lines: out, failed, anchored: fixed.filter(Boolean).length }
}
