# 👾 Dettyan 育成ゲーム：モンスター 5体の 描きなおし 依頼

育成ゲームの ぼうけん に 出る モンスターを、Sprout Lands（Cup Nooble）の 絵柄に そろえている。
スライム・コウモリ・ハチ・おばけ・クモ・カエル・ネズミ は Sprout Sorry pack（Early Access）の 絵を 使った。
のこりの 5体 は 素材に ないので、**同じ 絵柄で 描いて ほしい**。

## 描いて ほしい もの
| id | 名前 | 出る ところ | とぶ？ | 大わざ | いまの 絵 |
|---|---|---|---|---|---|
| `crow` | いたずらカラス | 公園 | とぶ | — | `current/crow.png` |
| `mushroom` | おばけキノコ | 森 | — | — | `current/mushroom.png` |
| `golem` | いわゴーレム | どうくつ | — | いわおとし | `current/golem.png` |
| `yeti` | ゆきおとこ | 山 | — | ふぶき | `current/yeti.png` |
| `wyvern` | ちびドラゴン | 山 | とぶ | ほのおの いき | `current/wyvern.png` |

- いまの 絵（12×12 ドット を 8ばいで 書きだした もの）は、形・色・キャラの 雰囲気の 参考。写さなくて よい
- 強さ・色の 値は `monsters.json`
- いま ゲームに 出ている 絵の 見本：`reference/now_in_game.png`（上の だん が Sprout の 絵、カラス・キノコ・ゴーレム・ゆきおとこ・ちびドラゴン が 前の 絵）

## 絵の きまり
- **Sprout Sorry pack の モンスター と 同じ つくり** に する（見本：`Early Access/Dungeon Pack/enemies/small_green_slime_animations.png`・`small_bat_animations.png`、`Early Access/halloween/mobs/chost_spritesheet.png` など。素材は ayaribon の 手元・素材リポジトリ に ある）
- 1コマ **16×16 ドット**（大きめの ゴーレム・ゆきおとこ・ちびドラゴン は **32×32** でも よい）。ゲームでは 2ばい で 出す
- **横 1だん に ふわふわ／ぴょこぴょこ する コマを 4〜8まい**（ゲームは 1秒に 8コマ で くりかえす）。PNG 1まい（`mon_<id>.png`）
- **左むき**（左に Dettyan が いる）
- 足もと（とぶ ものは からだの 下）が コマの 下の ほう に くるように。背景は 透明
- 色は Sprout の 色調（ふちは 黒では なく こい 色。例：こい 赤むらさき `#754c60`、こい みどり、こい あい色）。半とうめい・ぼかし なし
- できれば 2だん目 に「やられた」コマ（2〜4まい）。なくても よい（ゲームは うすく 消える）

## わたし かた
- `mon_crow.png` `mon_mushroom.png` `mon_golem.png` `mon_yeti.png` `mon_wyvern.png` と、見た目 確認用の まとめ画像 1まい を zip で
- アプリへの 組みこみ（`app/javascript/dettyan_sprout.js` の `MONSTER_ART` と `app/models/game_asset.rb`）と S3 への 置き場所（`game_assets/sprout_monsters/`）は Claude が やる

## ライセンス
- 元の 素材は Sprout Lands / Cup Nooble（Sorry pack は 非商用のみ・再配布 不可）。描いた 絵も 公開リポジトリには 入れない（S3 に 置く）
- AI 学習・NFT には 使わない
