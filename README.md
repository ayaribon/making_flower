# making_flower

## 概要

making_flower は、画像素材を組み合わせてレイアウトを作るための Rails アプリです。ユーザーはログインして画像をアップロードし、背景・部品・テキストを組み合わせてテンプレートを編集し、独自のデザインを保存できます。管理者は素材やテンプレートの公開状態、並び順、ログインIDを管理します。

本アプリの中心は編集画面であり、素材管理・テンプレート保存・ユーザー管理・管理画面の4層が連携して動作します。データの保存には Active Storage を使い、開発環境ではローカルの `storage/` または S3 相当のバックエンドを使う構成です。

---

## 1. 目的と利用者

### 一般ユーザー
- ログインして編集画面を開く
- 自分の画像をアップロードして部品・背景として利用する
- 既存の共通テンプレートから雛形を選ぶ
- 自分専用のテンプレートを保存・更新・削除する
- 仕上がった構成をキャンバス上に配置し、画像として出力する

### 管理者
- ユーザーを作成し、ログインIDを発行・再発行する
- 素材の公開/非公開、並び順、キー、タグを管理する
- 共通テンプレートを作成・公開・複製・削除する
- 既存テンプレートがどの素材を参照しているかを確認する

---

## 2. 技術スタック

- Ruby 3.2.4
- Rails 7.1.5
- MySQL 8
- Active Storage
- importmap-rails / Turbo / Stimulus
- ImageProcessing (Vips)
- MediaPipe Interactive Segmenter / MagicTouch をブラウザ側で利用
- AWS S3 SDK (`aws-sdk-s3`)

主要ファイル:
- `config/routes.rb` - ルーティング定義
- `app/controllers/editors_controller.rb` - エディタ画面の初期データ生成
- `app/models/material.rb` - 共有素材定義
- `app/models/design_template.rb` - 共通テンプレート定義
- `app/models/user_template.rb` - 個人テンプレート定義
- `app/models/user_image.rb` - ユーザーアップロード画像定義
- `app/javascript/ai_cutout.js` - AI 画像切り抜きロジック

---

## 3. 認証とアクセス制御

### ログイン方式
- ログインは `name + login code` の形式で行う
- `User#issue_login_code!` で、`name-XXXX` のような一時的なログインIDを発行する
- 実際の保存は `login_digest` でハッシュ化され、元の ID は保持しない
- `SessionsController` で IP ベースの失敗回数を `Rails.cache` で管理し、10回連続失敗で15分間ロックする

### アクセス制御
- `ApplicationController` の `before_action :require_login` により、ログイン必須画面を保護
- 管理者機能は `Admin::BaseController` により admin 権限チェックを行う
- 一般ユーザーが自分以外の画像やテンプレートを参照しない設計になっている

---

## 4. 主要なドメインモデル

### User
- `name` は英数字2〜20文字で、ログインIDの頭に入る識別子
- `login_digest` にハッシュ化済みのログインコードを保持
- `user_images` と `user_templates` を持つ
- `admin` フラグで管理者判定を行う

### Material
- 共通素材（部品・背景）を管理するモデル
- `kind` は `part` または `background`
- `key` はテンプレートで参照する一意な識別子
- `tags` はカンマ区切りで持ち、管理画面では検索・フィルタに使用
- `visible` により編集画面への表示可否を制御
- `image`, `image_portrait`, `image_square`, `thumb` を Active Storage で保持
- 共有テンプレートで参照されている素材は `key` を変更できない

### UserImage
- ユーザーが自分でアップロードした画像
- `kind` は `part` / `background`
- `user_id` を必須とし、本人の画像のみアクセス可能
- `thumb` の PNG プレビューを持つ

### DesignTemplate
- 管理者が作る公開向けのテンプレート
- `body` は JSON 文字列として保持
- `ratio` は `16:9`, `9:16`, `1:1` のいずれか
- `material_keys` でテンプレートが使う素材キーを抽出し、キー変更時の検証に利用
- `visible` により公開/非公開を切り替え可能
- `thumbnail` を `data:image/...` 形式からアタッチ可能

### UserTemplate
- ユーザーごとに保存される個人テンプレート
- 共通テンプレートと同じ JSON 構造を持つ
- `user_id` で本人だけが編集・削除できる
- 最大 50 件まで作成可能

### Template
- 汎用のテンプレート画像添付モデル
- `preview_image` と `image` を持つが、現状の主要フローでは `DesignTemplate` / `UserTemplate` を中心に使う

---

## 5. 編集画面の仕様

### 画面サイズとレイアウト
- `EditorsController#show` ではキャンバスサイズを `1280x720` で初期化
- 実際にはテンプレートごとの `ratio` に応じて 16:9 / 9:16 / 1:1 を切り替える設計

### 素材選択の仕組み
- 画面表示時に `Material.visible.ordered` で表示可能な素材を取得
- `material_map_for` で `key => { src, srcs, ... }` のマップを生成する
- テンプレートの JSON には `material` キーとして素材キーを保持し、素材が差し替えられてもテンプレートが壊れにくい設計

### テンプレート JSON 形式
テンプレートの body は次のような構造を想定している:

```json
{
  "background": { "material": "pastel" },
  "items": [
    { "type": "part", "material": "sparkle", "x": 0.12, "y": 0.2, "w": 0.3, "h": 0.25 },
    { "type": "text", "text": "Hello", "x": 0.1, "y": 0.6, "fontSize": 52 }
  ],
  "filters": [{ "key": "soft", "strength": 0.5 }],
  "frame": "monitor"
}
```

- `background` は背景色・グラデーション・素材キーを指定可能
- `items` は `text`, `part`, `placeholder` の3種
- `type: "part"` の場合は `material` を必須とし、素材キーが欠けると自動的に除外される

---

## 6. 画像アップロードと AI 切り抜き

### 通常アップロード
- `UserImagesController` により、ユーザーごとの画像を保存
- `kind` は `part` または `background`
- サムネイルは `thumb` に保存する
- 画像は本人だけが `show` / `thumb` / `destroy` できる

### AI 切り抜き
- `app/javascript/ai_cutout.js` に MediaPipe の `InteractiveSegmenter` を使う処理があり、ブラウザ側で画像の前景/背景を切り分ける
- 画像とポイント情報を受け取り、透明度付き PNG の data URL を返す
- 処理対象の画像は長辺 512px 以下に圧縮して保存サイズを抑える
- その結果は `UserImage` などの部品として再利用可能

---

## 7. 管理画面の責務

### 素材管理
- `Admin::MaterialsController`
- 追加・編集・削除・表示/非表示切り替え
- タグ検索、種類絞り込み、並び順変更、比率別画像の削除/更新
- 画像がテンプレートから使われていればキー変更禁止、テンプレートで使われている場合は削除禁止

### 素材の取り込み（Openverse）
- `Admin::MaterialImportsController` ＋ `app/services/openverse_client.rb`（画面：管理 → 🎨 素材 → 🔎 Openverse から取り込む）
- [Openverse API](https://api.openverse.org/v1/)（キーなし）で探し、選んだ画像をサーバーで取ってきて `Material` として保存する
- 出すのは再配布・改変・商用OK のライセンスだけ：CC0・パブリックドメイン（サムネOK）／CC BY（作者の表記が要るので**必ず非表示で入る**）。SA・NC・ND・SVG は出さない
- 引用元・ライセンス・クレジット文は `source_name` / `source_url` / `license_note` に自動で入る。`license_note` の `openverse:<ID>` で取り込み済みを見分ける（テーブルは増やさない・N2）
- 取り込むときは画面から送られた値を信じず、API で取り直す。内側のネットワークのアドレスには取りに行かない

### テンプレート管理
- `Admin::DesignTemplatesController`
- 一覧、公開/非公開切り替え、複製、削除
- 編集はブラウザのエディタ側から JSON で保存される
- 管理画面では名前・アイコン・公開状態・順序を整える

### ユーザー管理
- `Admin::UsersController`
- 新規ユーザー作成時に初回ログインコードを表示
- 既存ユーザーのログインコード再発行
- 管理者は複数人にできるが、自分自身の削除と最後の管理者削除は防止

---

## 7.5 はじまりのまち（トップページ）とアバター

ログイン後のトップ（`/`）は、自分のアバターで歩く町「はじまりのまち」。建物（スタジオ・アトリエ・Dettyan の事務所・編集室）に入ると、歌ってみた・サムネ・Dettyan・切り抜き依頼へ移動する。前のカードのメニューも「かんたんメニュー」として残している。

- キャラメイクは `/avatar`。保存先は `users.avatar`（JSON の text 列）。💬 ひとこと（20文字）も 同じ JSON の `msg`
- 🏷️ 表示名（`users.display_name`、12文字まで）はキャラメイクで自分で変えられる。空ならログインの呼び名を出す
- 町には 事務所の みんな（20人まで）が 出る。はじめて 開いた人には「SiVA へ ようこそ！」からの あんない（見たかどうかは localStorage）
- 町の 絵の 一部に Sprout Lands の 素材を 使う（画像が あるときだけ。`app/javascript/town_sprout.js`）
- 詳しくは `docs/town/requirements.md`

**クレジット**：Assets - From: Sprout Lands - By: Cup Nooble（https://cupnooble.itch.io/sprout-lands-asset-pack）。素材パックそのものは このリポジトリでは 配らない（ライセンス：商用 OK・改変 OK・素材パックの 再配布と 転売は 禁止・NFT と AI の 学習への 利用は 禁止・クレジット必須）

---

## 8. ルーティングの要点

```ruby
root "editors#show"

get    "login",  to: "sessions#new"
post   "login",  to: "sessions#create"
delete "logout", to: "sessions#destroy"

resources :user_images, only: [:index, :create, :show, :destroy] do
  member do
    get :thumb
    put :thumb, action: :update_thumb
  end
end

namespace :admin do
  resources :users, only: [:index, :new, :create, :destroy] do
    post :reissue, on: :member
  end
  resources :materials, except: [:show] do
    patch :toggle, on: :member
  end
  resources :design_templates, only: [:index, :create, :edit, :update, :destroy] do
    patch :toggle, on: :member
    post :duplicate, on: :member
  end
end

resources :design_templates, only: [:index], defaults: { format: :json }
resources :user_templates, only: [:index, :create, :update, :destroy], defaults: { format: :json }

resources :templates, only: [:index, :show] do
  get :edit, on: :member
end

get "editor", to: "editors#show"
```

---

## 9. データ保存とストレージ

### Active Storage
- 画像とサムネイルは Active Storage で扱う
- `file`, `image`, `thumbnail`, `thumb`, `image_portrait`, `image_square` などの attachment を持つ
- 保存先は本番では S3、開発では `storage/` 直下のローカル保存を想定している

### 重要な制約
- 画像は `PNG`, `JPEG`, `WebP`, `GIF`, `SVG` を対象にする
- 素材は 10MB まで、サムネイルや user upload の thumb はより小さく制限される
- `Material#key` は英小文字・数字・ハイフンのみ
- `DesignTemplate` と `UserTemplate` は JSON body を持ち、データのバリデーションが行われる

---

## 10. 開発環境の起動

Rails（web）も MySQL（db）も **Docker の中で うごく**。手元に Ruby や MySQL を 入れなくて よい。
メンバー（Windows ＋ WSL2 ＋ Docker Desktop）は、この 手順 だけで ログインまで できる。

### 0. 用意する もの
- Windows：**WSL2（Ubuntu）** と **Docker Desktop**（設定 → Resources → WSL integration で Ubuntu を オン）
- ここから 先は ぜんぶ **WSL（Ubuntu）の ターミナル** で 打つ

### 1. clone する（WSL の ホームの 中に 置く）
```bash
cd ~
git clone https://github.com/ayaribon/making_flower.git
cd making_flower
```
- `/mnt/c/...`（Windows の フォルダ）に 置くと、とても おそく なり、ファイルの 変更も つたわりにくい。かならず `~` の 下に 置く

### 2. `.env` を 作る
```bash
cp .env.example .env
id -u; id -g   # 2つとも 1000 なら そのまま。ちがう ときは .env の APP_UID・APP_GID に 書く
```
- AWS・Discord の 項目は **メンバーは 空の まま で よい**（下の「鍵・素材が ない とき」）
- `.env` は コミット しない（`.gitignore` 済み）

### 3. ビルドして 起動する
```bash
docker compose build          # 1回目は 数分 かかる（Gemfile が かわった ときも もう一度）
docker compose up -d          # db と web が うごきだす
docker compose exec web bin/rails db:prepare   # DB を 作って テーブルを 入れる（はじめては seed も ここで 流れる）
docker compose exec web bin/rails db:seed      # 開発用の ユーザー・素材・テンプレ を 入れる（もう あれば 飛ばす）
```
- **ログインID**（`devuser`＝一般、`devadmin`＝管理者）は、seed が はじめて ユーザーを 作った ときに さいごに 出る。DB を 新しく 作った ときは `db:prepare` の 出力に 出る。この 画面に しか 出ないので ひかえる
- 何回 流しても 同じ（もう ある ものは 飛ばす）。ID を わすれたら `docker compose exec web bin/rails 'users:reissue[devuser]'`
- テンプレの 一部は Openverse の 素材（`ov-` から はじまる）を 使う。「見つからない素材」と 出たら、ネットに つないだ 状態で `docker compose exec web bin/rails materials:import_openverse_picks`（ない ままでも 起動・ログインは できる）
- db が 立ち上がる 前に `db:prepare` を 打つと つながらない ことが ある。そのときは 10秒 ほど まって もう一度

### 4. ログインする
- ブラウザで http://localhost:3000/login を 開いて、ひかえた ログインID を 入れる
- 管理画面は `devadmin` で ログインして http://localhost:3000/admin/users

### よく つかう コマンド
| したい こと | コマンド |
|---|---|
| とめる | `docker compose stop` |
| また 起動 | `docker compose up -d` |
| ログを 見る | `docker compose logs -f web` |
| テスト | `docker compose exec web bin/rails test` |
| JS の テスト | `node --test test/javascript/*.mjs`（WSL に Node 22 が ある とき） |
| マイグレーション（pull の あと） | `docker compose exec web bin/rails db:migrate` |
| DB を まっさらに | `docker compose down -v` → 3 から やりなおし（**データは 消える**） |

### 鍵・素材が ない とき（メンバーの ふつう）
メンバーには AWS の 鍵・Discord の ウェブフック・買った 素材（`private_assets/`）は わたさない。それでも 起動・ログイン できる。

| 画面 | 鍵・素材 なし の とき |
|---|---|
| `/`（まち） | 町の 絵は 出ない。「まちの 絵の 素材が ないよ」→「📋 かんたんメニュー へ」で カードの メニューに 切りかわる（この ブラウザに おぼえる） |
| `/avatar`（キャラメイク）・`/dettyan` | 絵の 素材が ないので「よみこめなかった」と 出る |
| `/editor`（編集画面） | うごく。✨ AI 切り抜き だけ 「AIの準備に失敗しました」（下の mediapipe） |
| `/singing`（歌ってみた） | うごく（音・動画は ブラウザの 中だけ） |
| `/clip_requests/new`（切り抜き依頼） | 開ける。送り先（Discord）が ない ので「いまは送れません」と 出て、送る ボタンは おせない |
| `/admin/*`（管理画面） | うごく |

- **AI 切り抜き（`public/mediapipe/`）**：ライブラリと モデル（約44MB）は リポジトリに 入って いない（`.gitignore`）。ない ときは ✨ を おすと「AIの準備に失敗しました」と 出る だけで、ほかの 編集は できる
- **画像の 保存先**：開発では `storage/`（手元の ディスク）。S3 は 使わない
- 素材を 見たい ときは ayaribon に 相談（配布 禁止の 素材なので、`private_assets/` は リポジトリにも チャットにも 置かない）

### ポートが ぶつかる とき
- web は `3000`、MySQL は **`3307`**（PC に MySQL が 入っていても ぶつからない ように 3306 から ずらした）
- アプリ（web）は Docker の 中で `db:3306` に つなぐ ので、`3307` は PC から DB を のぞく とき（DB の ツール など）だけ 使う
- `3000` が ふさがって いる ときは、使って いる もの（ほかの Rails など）を とめる

### 🚀 ゲームの 素材画像を S3 から じかに 出す（GAME_ASSETS_DIRECT）
町・キャラメイク・Dettyan の 画像（S3 の `game_assets/`。買った 素材なので バケットは ひみつの まま）は、ふだんは サーバーが S3 から とって わたす。
`GAME_ASSETS_DIRECT=1` に すると、サーバーは **期限つきの URL**（12時間。6時間ごとに 同じ URL なので ブラウザの キャッシュが きく）だけ 作って、ブラウザが S3 から じかに・同時に とる（はやい）。

1. S3 の バケット → アクセス許可 → CORS に、アプリの ドメインからの GET を 許す（下の 例）
2. `heroku config:set GAME_ASSETS_DIRECT=1`（もどす ときは `heroku config:unset GAME_ASSETS_DIRECT`）

```json
[
  { "AllowedOrigins": ["https://（アプリの ドメイン）"], "AllowedMethods": ["GET", "HEAD"], "AllowedHeaders": ["*"], "MaxAgeSeconds": 86400 }
]
```
- CORS が いるのは、絵の 色を ぬりかえる ために canvas で 画像の 中身を 読む から（`allowCors`）
- S3 に ある か の しらべは 一覧 1回（`s3:ListBucket` が あれば。なければ 1まいずつ しらべる）

### デプロイ（Procfile）

`Procfile` の `web` は、サーバーを起動する前に `rails db:migrate` を流す。新しいマイグレーションがあっても、デプロイするだけで本番の DB に反映される（手でマイグレーションしなくてよい）。

```
web: bundle exec rails db:migrate && bundle exec puma -C config/puma.rb
```

- 流すマイグレーションがないときは、すぐに終わって puma が起動する
- マイグレーションが失敗したときは puma が起動しない（ログにエラーが出るので、直してからもう一度デプロイする）
- `Procfile` を読まないデプロイ（`Dockerfile` の `CMD` で起動するなど）では使われない

---

## 11. 実装上の注意点

- エディタ画面はテンプレートの `body` を JSON として扱うため、JSON のキー構造が破損すると保存時に失敗する
- 素材の `key` はテンプレート内参照に直結するため、既に使われている素材のキーを変更しない
- `DesignTemplate#normalize_body` で `materialId` から `material` キーへ変換するので、編集画面からは ID ベースでデータを扱う設計になっている
- `UserTemplate` は各ユーザーごとに独立し、他人のテンプレートは取得・更新・削除できない
- 管理者以外には共有テンプレートの全件一覧は返さない設計になっている

---

## 12. まとめ

このアプリは「素材管理」「テンプレート管理」「ユーザー管理」「画像編集」を一つの Rails アプリにまとめた、画像ベースのデザイン編集システムです。特に `Material` と `DesignTemplate` のキー連携、`UserTemplate` の個人保存、`AI cutout` の導入、管理者権限による運用が、開発対象の中核になります。

新規改修を行う場合は、まず `DesignTemplate` の JSON 構造と `Material#key` の関係、次に `UserImagesController` / `UserTemplatesController` の認可ロジックを確認すると全体の意図を掴みやすいです。
