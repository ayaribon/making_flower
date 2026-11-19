# Pin npm packages by running ./bin/importmap
# 🚀 preload: false：その 画面で 使う ときだけ 読む（ぜんぶ 先に 読むと 1.4MB に なって 重い。2026-11-19）。先に 読むのは 土台の 4つ だけ

pin "application"
pin "@hotwired/turbo-rails", to: "turbo.min.js"
pin "@hotwired/stimulus", to: "stimulus.min.js"
pin "@hotwired/stimulus-loading", to: "stimulus-loading.js"
pin_all_from "app/javascript/controllers", under: "controllers", preload: false
pin "fabric", preload: false # @7.4.0
pin "text_styles", preload: false
pin "image_store", preload: false
pin "color_key_filter", preload: false
pin "ai_cutout", preload: false
pin "vocal_tools", preload: false
pin "mix_chain", preload: false
pin "mv_renderer", preload: false
pin "mp4-muxer", preload: false # @5.2.1（vendor/javascript に置いた）
pin "mv_export", preload: false
pin "mv_templates", preload: false # 🪄 MV のテンプレート（かんたん作成）
pin "lyric_align", preload: false
pin "project_store", preload: false # 💾 プロジェクト保存（K24・IndexedDB）
pin "project_server", preload: false # 💾 プロジェクトをアカウントに保存（K39・サーバー）
pin "harmony", preload: false # 🎶 ハモリ・ケロケロ風（K29）
pin "pixel_buddy", preload: false # 🧑‍🎨 ドット絵の子（歌う子・ほめてくれる子の絵）
pin "pixel_singer", preload: false # 🎤 試聴中に歌うドット絵の子
pin "dettyan_sprite", preload: false # 🧑‍💼 Dettyan のドット絵
pin "dettyan_save", preload: false # 💾 Dettyan のセーブ（サーバー＋控え）
pin "dettyan_sound", preload: false # 🎵 Dettyan の BGM・SE
pin "dettyan_foods", preload: false # 🍽️ Dettyan のごはん（ショップの商品の表）
pin "dettyan_care", preload: false # 🤚 おせわ・ショップ・放置の計算
pin "dettyan_adventure", preload: false # ⚔️ モンスター退治（行き先・スライム・バトルの計算）
pin "dettyan_gear", preload: false # 🗡️ そうび（あたま・からだ・て・せなか・あし）
pin "dettyan_human", preload: false # 🧑‍💼 Dettyan を 町の アバターと 同じ 絵で（素体＋レイヤー）
pin "dettyan_sprout", preload: false # 🌱 育成ゲームの けしき（Sprout Lands の 絵柄。画面いっぱい）
pin "dettyan_room", preload: false # 🏢 Dettyan の事務所の部屋の絵
pin "dettyan_scenes", preload: false # 🌳 モンスター退治の けしき
pin "dettyan_battle", preload: false # ⚔️ バトル（手動・オート）・ステータス・職業・スキル
pin "dettyan_home", preload: false # 🏠 テント → マイホーム・家具
pin "dettyan_camp", preload: false # ⛺ テントと おはなしの けしき
pin "dettyan_story", preload: false # 📖 おはなし（目標と ページ）
pin "avatar_sprite", preload: false # 👤 みんなの アバター（キャラメイクの 部品と 絵）
pin "town_world", preload: false # 🏘️ はじまりのまち（トップページの 町）の 絵
pin "avatar_chibi", preload: false # 👤 アバターの 絵（16×20 の 2頭身。Sprout Lands の 町に なじむ）
pin "avatar_teemo", preload: false # 🐱 Teemo 型の アバター（Sprout Lands の キャラ画像を もとに）
pin "avatar_human", preload: false # 🧑 人の アバター（Cup Nooble の 人の テンプレート。8方向）
pin "town_sprout", preload: false # 🌱 はじまりのまち を Sprout Lands の 素材で 描く 版
