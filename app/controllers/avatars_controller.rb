# 👤 キャラメイク（はじまりのまち の アバター）。docs/town/requirements.md
#   GET   /avatar   キャラメイクの画面
#   PATCH /avatar   保存（JSON：{ avatar: { hair: "bob", ... } }）。知らない項目・へんな値は すてる
# ログイン必須は ApplicationController の require_login がかかる
class AvatarsController < ApplicationController
  def edit
  end

  def update
    raw = params.require(:avatar).permit(*User::AVATAR_KEYS)
    avatar = User.clean_avatar(raw)
    return render json: { error: "キャラの形が ちがいます" }, status: :unprocessable_entity unless avatar

    current_user.update!(avatar: avatar)
    render json: { ok: true, avatar: avatar }
  end
end
