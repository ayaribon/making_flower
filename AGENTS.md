# AGENTS.md — みんなで作るときのルール

このリポジトリは、人（ayaribon）と5人の AI（Kiro・Claude・Copilot・Codex・Quick）で一緒に作っています。
AI はどれも、作業を始める前にこのファイルを読んでください。ツールごとの設定ファイル（`CLAUDE.md` など）は、このファイルを指しているだけです。

## 1. このアプリ
- **making_flower（KotoBouquet）**：画像素材を組み合わせてデザインを作る Rails アプリ。詳しくは `README.md`。
- 今の開発の中心は **🎤 歌ってみた機能**（画面 `/singing`）。録音 → ミックス → MV 作成までをブラウザの中で完結させる。

## 2. 仕様書（ここが正）
| ファイル | 中身 | 更新する人 |
|---|---|---|
| `docs/singing/requirements.md` | 歌ってみた機能の要件定義（機能要件 F〜、守ること N1〜N5、未決 Q〜、実装状況） | 要件が決まったら Kiro / Claude。最後に ayaribon が確認 |
| `docs/singing/open-issues.md` | まだ解決していない課題（K1〜）と、やりたいこと | 作業した AI が、PR の中で状態を更新する |
| `README.md` | アプリ全体（編集画面・管理画面・データ構造） | 変更が入ったとき |

- 課題の状態の印：🔴 動かない／🟡 場合によってずれる・使いにくい／⚪ 確かめていない／✅ コード上は実装済み（実機確認は残っている）
- **「コードを書いた」と「実機で確かめた」は別物。** AI が付けてよいのは ✅ まで。実機で確かめて表から消すのは ayaribon。

## 3. 担当
| 誰 | 担当すること | 担当しないこと |
|---|---|---|
| **ayaribon（人）** | やることを決める・未決（Q〜）を決める・実機で確かめる・マージ | — |
| **Kiro** | 「やりたいこと」を要件・設計・作業リストに分ける（`.kiro/specs/`） | 大きな実装 |
| **Claude** | 設計、大きな実装、いくつものファイルにまたがる変更、仕様書の更新 | — |
| **Copilot** | Issue 1つで完結する小さな修正（文言、見た目、小さな不具合） | 設計の判断が要るもの |
| **Codex** | すべての PR のレビュー、テストの追加、Claude と並行して進められる実装 | 自分の PR を自分でレビュー |
| **Quick** | コードの外の調べもの（ブラウザの対応状況、参考事例）、実機確認のチェックリスト作り | コードの変更 |

## 4. 作業の流れ
1. **Issue を立てる。** 1つの Issue に担当は1人。担当ラベル（`kiro` `claude` `copilot` `codex` `quick`）と課題番号（例：`K31`）を付ける。
2. **ブランチを切る。** 名前は `担当/内容`（例：`claude/k31-section-drag`、`copilot/k22-button-size`）。AI ルームはこの名前で誰の作業かを見分ける。
3. **PR を出す。** 本文に `Closes #Issue番号`、対応した課題番号、**実機で確かめてほしいこと**を書く。
4. **レビュー。** Codex がレビューする（Codex が書いた PR は Claude がレビュー）。指摘は PR を書いた本人が直す。
5. **ayaribon が実機で確かめてマージ**する。そのあと `open-issues.md` の該当行を消し、`requirements.md` の「8. 実装状況」に移す。

同じファイルを2人が同時に直さないこと。特に `singing_mixer_controller.js`（約3800行）は、Issue に「どの部分を触るか」を書いてから始める。

## 5. 守ること（要件定義 N1〜N5 と、コードの決まりごと）
- **N1：オケ・歌声・動画はブラウザの中だけで扱う。サーバーに送らない。**（保存も IndexedDB / localStorage まで）
- **N2：DB（テーブル）を増やさない。** 必要になったら、まず Issue で相談する。
- **N3：PC（Chrome / Edge）とスマホ（iPhone Safari）の両方で使えること。** Safari で使えない API を使うときは代わりの方法を用意する。
- **N4：既存の編集画面（`editor_controller.js` `canvas_editor_controller.js` など）に影響を出さない。**
- **N5：オケの権利についての注意を画面から消さない。**
- MV の絵は `mv_renderer.js` の `renderFrame(t)` の中で**時間 t だけで決まる**作りにする（⚡速い書き出しでも同じ絵になるように）。乱数を使うなら種を固定する。
- 試聴・WAV・動画（OfflineAudioContext）で**同じ音**になること。
- 画面の文言は、短くてやさしい日本語で。
- `.env` や鍵をコミットしない。

## 6. 歌ってみた機能の主なファイル
| ファイル | 役割 |
|---|---|
| `app/views/singings/show.html.erb` | 画面 |
| `app/javascript/controllers/singing_mixer_controller.js` | 画面全体の動き（録音・ミックス・MV・保存） |
| `app/javascript/mix_chain.js` | 声の音作り（EQ・コンプ・リバーブ、初期値 `DEFAULT_MIX`） |
| `app/javascript/vocal_tools.js` | ずれ直し・ノイズ消しなど声の処理 |
| `app/javascript/lyric_align.js` | 歌詞のタイミング |
| `app/javascript/mv_renderer.js` / `mv_export.js` | MV の描画と書き出し |
| `app/assets/stylesheets/singing.css` | 見た目 |

## 7. 動かし方
```bash
docker compose up -d db
bundle install
bin/rails db:create db:schema:load
bin/rails server        # http://localhost:3000/singing
```
テストは `bin/rails test`。歌ってみた機能はブラウザの音声 API が中心なので自動テストが少ない。PR には「手で確かめた手順」を書く。

## 8. 終わったと言える条件
- 関係する課題（K〜）の状態を `open-issues.md` で更新した
- 守ること（5章）を破っていない
- PR に「実機で確かめてほしいこと」が書いてある
- 既存の編集画面が今までどおり開ける
