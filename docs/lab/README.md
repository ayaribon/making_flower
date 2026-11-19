# 🧪 lab（メンバーの 練習・試作の 場所）

`/lab` は、チームメンバーが 練習・試作を する 場所です。**本体の アプリ（KotoBouquet）とは べつ もの** で、ayaribon は 保守しません。
本体の 品質ルール（仕様書・課題の 表 など）の 対象外です。そのかわり、**lab の 変更を 本体の ファイルに 入れない** ように して ください。

## 1. 区画（1人 1区画）
- どの 層も `lab/名前/` の 下に 作る。URL は `/lab/名前/...`
- `/lab` を 開くと 区画の 一覧が 出る（フォルダを 見て 自動で 出る。リンクを 足さなくて いい）
- ログインが いる（本体と 同じ。ログインして いないと `/login` へ）

### 区画を 作る・けす
```bash
docker compose exec web bin/rails g lab_space 名前        # 作る（/lab/名前 に「ようこそ」ページ）
docker compose exec web bin/rails destroy lab_space 名前  # けす
```
- 名前は **英小文字と 数字だけ**（さいしょは 英小文字）。`home`・`base`・`lab` は 使えない。もう ある 区画なら 止まる
- 作った あと、サーバーの 起動しなおしは いらない

### 区画の フォルダ（ここだけ さわって いい）
| 場所 | 中身 |
|---|---|
| `app/controllers/lab/名前/` | `Lab::名前::〇〇Controller`（`Lab::名前::BaseController` を 継承） |
| `app/models/lab/名前/`（と `app/models/lab/名前.rb`） | `Lab::名前::〇〇`。テーブルは 自動で `lab_名前_〇〇` |
| `app/views/lab/名前/` | 画面 |
| `app/views/layouts/lab/名前/` | 自分用の 枠（ほしい 人だけ。`BaseController` で `layout "lab/名前/〇〇"`） |
| `app/javascript/lab/名前/` | JS（`import "lab/名前/〇〇"`） |
| `app/javascript/controllers/lab/名前/` | Stimulus（`data-controller="lab--名前--〇〇"`） |
| `app/assets/stylesheets/lab/名前/` | CSS（クラスは **`.lab-名前-`** から） |
| `config/routes/lab/名前.rb` | ルート（`namespace :名前 do ... end` の 中身。`config/routes/lab.rb` が 自動で 読む） |
| `test/lab/名前/` | テスト（`bin/rails test test/lab/名前`） |
| `docs/lab/名前/` | メモ・仕様 |
| `db/migrate/*_lab_*.rb` | lab の テーブルの マイグレーション（下の テーブルの きまり） |

### しくみ（共通の ファイル。区画を ふやしても かえない）
- ルート：`config/routes.rb` の `draw(:lab)` → `config/routes/lab.rb`（`/lab` の 入口）→ `config/routes/lab/*.rb` を ぜんぶ 読む
- コントローラー：`Lab::BaseController`（`ApplicationController` を 継承・`layout "lab"`）、`Lab::HomeController`（`/lab` の 一覧）
- 枠：`app/views/layouts/lab.html.erb`。本体の `application.css` は 読まない
- CSS：`app/assets/stylesheets/lab/lab.css` が `lab/` の 下を ぜんぶ まとめる（lab の 枠 だけが 読む）。本体の `application.css` は `require_directory .`（`lab/` を 入れない）
- JS：`config/importmap.rb` の `pin_all_from "app/javascript/lab", under: "lab"`。Stimulus は 本体と 同じ しくみで 自動で 読まれる
- 区画を 作る：`lib/generators/lab_space/`

## 2. ブランチと PR
```
main ──（ayaribon が ときどき 合わせる）──> develop ──> lab/名前-内容
                                              <── PR ──┘
```
- **`develop` から** `lab/名前-内容`（例：`lab/dettyan-memo`）を 切って、**`develop` に PR**
- `main` には 直接 出さない。区画の 中だけ なら レビュー なしで マージして いい（`.github/CODEOWNERS`）
- 共通の ファイル（上の「しくみ」）や 本体を かえたい ときは、Issue で ayaribon に 相談

## 3. テーブルの きまり
- テーブルは **`lab_名前_〇〇`**（モデルを `Lab::名前::〇〇` に すると 自動で そう なる）
- マイグレーションの ファイル名にも `_lab_` を 入れる（例：`bin/rails g migration CreateLabDettyanMemos`）
- 本体の テーブルに 列を 足したり、本体の テーブルを かえたり しない
- `db/schema.rb` は みんなで 1つ なので、lab の テーブルを 足すと ここも かわる（schema.rb は ayaribon の レビューが いる）

## 4. やっちゃ ダメな こと
- 本体の ファイル（`app/` の lab いがい・`config/`・`db/` の 本体の もの・`Gemfile`）を かえる
- ほかの 人の 区画を かえる
- クラス名を `.lab-名前-` いがいで はじめる（本体や ほかの 区画と ぶつかる）
- 本体の テーブルを 読み書きする（ログインの `current_user` を 使う のは いい）
- `.env`・鍵・`private_assets/`（買った 素材）を コミットする
- gem を 足す（`Gemfile` は 本体。ほしい ときは Issue で 相談）
