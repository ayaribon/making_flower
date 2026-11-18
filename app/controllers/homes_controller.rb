# 🏠 メインメニュー（ログイン後のトップ）
# 「🎤 歌ってみたを作る」→ /singing、「🎨 サムネ・背景を作る」→ /editor への入口
# ログイン必須は ApplicationController の require_login がかかる
# 🏘️ はじまりのまち：自分の アバター で 歩いて、建物（スタジオ・アトリエ・事務所・編集室）に 入る。カードの メニューも のこす
class HomesController < ApplicationController
  # 町に 出す ほかの人の かず。キャラを つくった人だけ（つくったら 出る）。さいきん つくった・かえた じゅん
  # Dettyan 本人は、キャラを つくるまでは 町の Dettyan（ドット絵）が かわり
  TOWN_OTHERS = 20

  def show
    @town_sprites = sprout_sprites
    @town_others = User.where.not(id: current_user.id).where.not(avatar: nil)
                       .order(updated_at: :desc).limit(TOWN_OTHERS)
                       .map { |u| { name: u.name, avatar: u.avatar } }
  end

  private

  # 🌱 Sprout Lands の 素材（GameAsset）。ぜんぶ そろっているときだけ 町に URL を わたす（なければ コードで描く 町）
  def sprout_sprites
    return {} unless GameAsset.available?

    GameAsset::SPROUT.keys.index_with { |key| sprout_asset_path(key) }
  end
end
