# 👤 キャラメイク（はじまりのまち の アバター）。docs/town/requirements.md
#   GET   /avatar   キャラメイクの画面
#   PATCH /avatar   保存（JSON：{ avatar: { hair: "bob", ... } }）。知らない項目・へんな値は すてる
#                   送った 項目だけ かわる（まちの 💬 ひとこと は { avatar: { msg: "..." } } だけ 送る。msg: "" で けす）
# ログイン必須は ApplicationController の require_login がかかる
class AvatarsController < ApplicationController
  def edit
  end

  def update
    raw = params.require(:avatar).permit(*User::AVATAR_KEYS).to_h
    avatar = User.clean_avatar((current_user.avatar || {}).merge(raw))
    return render json: { error: "キャラの形が ちがいます" }, status: :unprocessable_entity unless avatar

    current_user.update!(avatar: avatar)
    render json: { ok: true, avatar: avatar }
  end
end
