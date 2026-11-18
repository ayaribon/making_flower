# 🏠 メインメニュー（ログイン後のトップ）
# 「🎤 歌ってみたを作る」→ /singing、「🎨 サムネ・背景を作る」→ /editor への入口
# ログイン必須は ApplicationController の require_login がかかる
# 🏘️ はじまりのまち：自分の アバター で 歩いて、建物（スタジオ・アトリエ・事務所・編集室）に 入る。カードの メニューも のこす
class HomesController < ApplicationController
  # 町に 出す ほかの人の かず。事務所の みんな が 出るように：キャラを つくった人 → まだの人 の じゅん
  # まだ キャラが ない人は、名前から きまる おまかせの 見た目で 出る（avatar_sprite.js の avatarFromName）
  # Dettyan 本人は、キャラを つくるまでは 町の Dettyan（ドット絵）が かわり
  TOWN_OTHERS = 20

  # 🌱 Sprout Lands（Cup Nooble）の 素材。ファイルが ぜんぶ そろっているときだけ 町に URL を わたす（なければ コードで描く 町）
  # キー と ファイル名 は app/javascript/town_sprout.js の SPROUT_FILES と そろえる
  SPROUT_DIR = Rails.root.join("app/assets/images/sprout_lands")
  SPROUT_FILES = {
    "grass" => "grass_layers.png", "soil" => "soil.png", "trees" => "trees.png", "flowers" => "flowers.png",
    "fences" => "fences.png", "well" => "well.png", "signs" => "signs.png", "chicken" => "chicken.png"
  }.freeze

  def show
    @town_sprites = sprout_sprites
    @town_others = User.where.not(id: current_user.id)
                       .order(Arel.sql("avatar IS NULL"), updated_at: :desc).limit(TOWN_OTHERS)
                       .reject { |u| u.avatar.nil? && u.dettyan_owner? }
                       .map { |u| { name: u.name, avatar: u.avatar } }
  end

  private

  def sprout_sprites
    return {} unless SPROUT_FILES.values.all? { |file| SPROUT_DIR.join(file).file? }

    SPROUT_FILES.transform_values { |file| helpers.asset_path("sprout_lands/#{file}") }
  end
end
