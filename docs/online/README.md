# 🌐 オンライン化の 準備（設計メモ・手順）

将来、町や Dettyan 育成ゲームを **ほかの人と オンラインで 遊ぶ** 可能性が ある（2026-11-20 に ayaribon）。
いま すぐ オンラインに する わけでは ない。**あとで 作りなおし に ならない ための 準備** を、アプリ と インフラ に 分けて 順番に まとめる。

- ここは 設計メモ（決まった こと・決まって いない こと・手順）。決まったら 書きかえる
- アプリ側（A〜）は Claude、インフラ側（I〜）は ayaribon（インフラエンジニア）が 主に 担当する
- 2つの あいだの 約束（環境変数・ヘルスチェック・トークン など）は「4. アプリと インフラの 約束」に 書く

---

## 1. オンラインの 段階（どこまで やるかで 必要な ものが かわる）

| 段階 | 遊びかた の 例 | 必要な もの | いま |
|---|---|---|---|
| ① ゆるい つながり | ほかの 人の キャラ・ひとこと が 町に いる、ランキング、プレゼント | 今と 同じ 保存と 読みこみ（数秒〜数分 おくれて よい） | ✅ できている（町の ほかの 人） |
| ② いっしょに いる | 同じ 町を 何人かで 歩く、チャット、スタンプ | WebSocket（Rails の Action Cable ＋ Redis） | ⚪ まだ |
| ③ いっしょに 遊ぶ | 2〜4人で ぼうけん・バトル、交換 | ②＋ 勝ち負け・アイテムを サーバーで 決める | ⚪ まだ |
| ④ 大人数で リアルタイム | 何百人が 同時に 動く、対戦 | ゲーム用の サーバー（まずは Node.js。足りなければ Go など）を べつに 立てる | ⚪ まだ |

- **②・③ までは Rails のまま 作れる。** ④で はじめて ゲーム用の サーバーを べつに 立てる
- ゲーム用の サーバーは **まず Node.js（JavaScript）** に する。ブラウザの ルール（`dettyan_battle.js` など）を そのまま 使い回せて、同じ 計算を 2つの 言語で 書かなくて すむ

## 2. いまの 構成（2026-11-20）

| もの | いま | メモ |
|---|---|---|
| アプリ | Heroku（Rails 7.1・puma）。`Procfile` で 起動時に `db:migrate` | ヘルスチェック：`GET /up`（`rails/health#show`） |
| DB | MySQL（`MYSQL_HOST`・`MYSQL_USERNAME`・`MYSQL_PASSWORD`） | テーブルは ふやさない（N2） |
| 画像（Active Storage） | S3（`AWS_ACCESS_KEY_ID`・`AWS_SECRET_ACCESS_KEY`・`AWS_REGION`・`S3_BUCKET`） | |
| ゲームの 素材 | S3 の `game_assets/`。`GAME_ASSETS_DIRECT=1` で 期限つき URL を ブラウザに わたす | 買った 素材。公開しない |
| Action Cable | `config/cable.yml` の production は `redis`（`REDIS_URL`）。**まだ 使って いない**・`redis` gem も まだ 入れて いない | ②で 使う |
| そのほか の 環境変数 | `DISCORD_CLIP_WEBHOOK_URL`・`DETTYAN_OWNER_NAMES`・`MEDIAPIPE_BASE_URL`・`RAILS_MASTER_KEY`（または `SECRET_KEY_BASE`） | |
| Dettyan の セーブ | ブラウザで 計算 → `PUT /dettyan_save` に JSON で 保存（サーバーは 形だけ 確かめる） | ③で ここを サーバーで 確かめる 形に する |

## 3. 準備の 手順

### アプリ側（Claude）
| # | やる こと | なぜ | 大きさ |
|---|---|---|---|
| A1 | **ゲームの ルールを 画面と 切りはなす**。バトル・おせわ・ぼうけん は もう ほぼ 別（`dettyan_battle.js`・`dettyan_care.js`・`dettyan_adventure.js`。Node の テストから 呼べる）。残りは 町（歩ける 場所・あたり判定 → `town_world.js`）と 家具まわり に まざって いる 計算を 外へ | サーバー（Node.js）で 同じ 計算を そのまま 動かす ため | 小 |
| A2 | **状態の 形（スキーマ）を 決めて 文書に する**：キャラの 位置・向き・見た目・ひとこと、マップの 区画、Dettyan の 状態。広い マップの データ形式（区画の 大きさ・ファイルの 持ちかた）も ここで | ほかの 人に 送る データ と 保存する データ を そろえる | 中（設計） |
| A3 | **ゲーム用 サーバーへの ログインの 合言葉（トークン）を 出す 口**：Rails が 短い 時間だけ 有効な 署名つき トークン を 出す（下の 4.3） | べつの サーバーが「本人か」を DB を 見ずに 確かめられる | 小 |
| A4 | **大事な 結果を サーバーで 確かめる 下地**：まず `PUT /dettyan_save` で「ありえない ふえかた」（お金・経験値・持ち物）を はじく | ③（いっしょに 遊ぶ・交換）で ずる を ふせぐ | 中 |
| A5 | **②の ためしに 作る もの**：Action Cable で「同じ 町に いる 人の 位置と ひとこと」を 送る（ステージングで だけ） | 小さく ためして、人数と 負荷の 感じを つかむ | 中（I3 の あと） |

### インフラ側（ayaribon）
| # | やる こと | なぜ |
|---|---|---|
| I1 | **いまの Heroku 構成を コードで 書けるように 整理**（Terraform など）：環境変数・S3（バケット・CORS・`game_assets/`）・DB | AWS に うつす ときの 設計図 に なる |
| I2 | **AWS に うつす ときの 形を 決める**（下の 案） | ②を 入れる ときに 一度で うつせる ように |
| I3 | **ステージング環境を 作る** | オンライン機能は 本番の まえに 何人かで ためす 場所が いる |
| I4 | **Redis を 用意する**（ステージング → 本番） | ②（Action Cable）に いる |
| I5 | **見はり**：ログ・エラー・同時接続数・WebSocket の 数 | リアルタイムに なると 落ちた ことに すぐ 気づく 必要が ある |

### AWS に うつす ときの 構成案（I2 の たたき台）
| もの | 案 | メモ |
|---|---|---|
| Rails | ECS Fargate（2台〜）＋ ALB | ALB は WebSocket を そのまま 通す。アイドル タイムアウトを 長めに |
| DB | RDS（MySQL） | |
| Redis | ElastiCache（Redis／Valkey） | Action Cable の 配信用 |
| 画像・素材 | S3 ＋ CloudFront | `game_assets/` は 公開しない まま（OAC・署名つき URL／Cookie） |
| ゲーム用 サーバー（④） | ECS の べつ サービス（Node.js）または EC2 | Rails とは べつに 台数を ふやせる |
| 鍵 | Secrets Manager / SSM Parameter Store | |

- 移る 時期の 目安：**② を 入れる とき**（Redis・ALB・複数台 が いる ので、そこで 一度に）
- それまでは Heroku の まま で よい（1. の ①は いまの まま 動く）

## 4. アプリと インフラの 約束（変える ときは ここを 先に 直す）

### 4.1 起動と ヘルスチェック
- Web：`bundle exec puma -C config/puma.rb`（ポートは `PORT`）。起動の まえに `bin/rails db:migrate`（いまは `Procfile`。ECS では 起動まえの タスク に）
- ヘルスチェック：`GET /up` → 200（ログイン いらない）

### 4.2 環境変数（いま ある もの ＋ これから ふえる もの）
| 名前 | いま | 中身 |
|---|---|---|
| `MYSQL_HOST`・`MYSQL_USERNAME`・`MYSQL_PASSWORD` | ある | DB |
| `AWS_ACCESS_KEY_ID`・`AWS_SECRET_ACCESS_KEY`・`AWS_REGION`・`S3_BUCKET` | ある | S3（ECS では タスクロール に して 鍵を やめる 案） |
| `GAME_ASSETS_DIRECT` | ある | `1` で 素材を 期限つき URL で わたす |
| `RAILS_MASTER_KEY`／`SECRET_KEY_BASE` | ある | |
| `DISCORD_CLIP_WEBHOOK_URL`・`DETTYAN_OWNER_NAMES`・`MEDIAPIPE_BASE_URL` | ある | |
| `REDIS_URL` | **②で ふえる** | Action Cable |
| `GAME_TOKEN_SECRET` | **A3 で ふえる** | ゲーム用 トークンの 署名の 鍵（Rails と ゲーム用 サーバー で 同じ もの） |
| `GAME_SERVER_URL` | **④で ふえる** | ブラウザが つなぐ ゲーム用 サーバーの URL（`wss://…`） |

### 4.3 ゲーム用 トークン（A3。たたき台）
- Rails の `POST /game_token`（ログイン いる）が 返す。中身は JWT（HS256、`GAME_TOKEN_SECRET` で 署名）
- 中身：`sub`＝ユーザーの id、`name`＝表示名、`exp`＝5分後、`aud`＝`"kotobouquet-game"`
- ブラウザは つなぐ たびに 取りなおす。ゲーム用 サーバーは 署名と `exp`・`aud` だけ 確かめる（DB は 見ない）

## 5. まだ 決めて いない こと（ayaribon が 決める）
| # | 決める こと | メモ |
|---|---|---|
| Q1 | オンラインで まず 何を したいか（いっしょに 歩く・チャット・いっしょに ぼうけん・交換・対戦） | ②③④の どこまで やるか が きまる |
| Q2 | 同時に 遊ぶ 人数の めやす（10人？ 100人？） | 台数・料金・④が いるか |
| Q3 | AWS に うつす 時期（② の とき で よいか） | |
| Q4 | IaC の 道具（Terraform・CDK など） | |
| Q5 | ステージングの 置き場所と、だれが 使うか（メンバーも？） | |
| Q6 | チャットを 入れる なら、見はり・通報・NG ワード を どうするか | 子どもが 使う 可能性 |

## 6. 進めかた
1. この メモを ayaribon が 読んで、Q1・Q2 を 決める
2. A1〜A4 を Issue に 分けて、Claude が 順に 作る（それぞれ PR）
3. I1〜I3 を ayaribon が 進める（A5 は I3 の あと）
4. ② を 作る ときに、AWS に うつすか を 決める（Q3）
