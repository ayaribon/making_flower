# 🏠 メインメニュー（ログイン後のトップ）
# 「🎤 歌ってみたを作る」→ /singing、「🎨 サムネ・背景を作る」→ /editor への入口
# ログイン必須は ApplicationController の require_login がかかる
# 🏘️ はじまりのまち：自分の アバター で 歩いて、建物（スタジオ・アトリエ・事務所・編集室）に 入る。カードの メニューも のこす
class HomesController < ApplicationController
  TOWN_OTHERS = 8 # 町に 出す ほかの人の かず（さいきん キャラを つくった・かえた 人から）

  def show
    @town_others = User.where.not(id: current_user.id).where.not(avatar: nil)
                       .order(updated_at: :desc).limit(TOWN_OTHERS)
                       .map { |u| { name: u.name, avatar: u.avatar } }
  end
end
