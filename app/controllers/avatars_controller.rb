# 👤 キャラメイク（はじまりのまち の アバター）。docs/town/requirements.md
#   GET   /avatar   キャラメイクの画面
#   PATCH /avatar   保存（JSON：{ avatar: { hair: "bob", ... } }）。知らない項目・へんな値は すてる
#                   送った 項目だけ かわる（まちの 💬 ひとこと は { avatar: { msg: "..." } } だけ 送る。msg: "" で けす）
#                   🏷️ 表示名は display_name（キャラメイク から。"" で 呼び名に もどす）
# ログイン必須は ApplicationController の require_login がかかる
class AvatarsController < ApplicationController
  def edit
    # 🧑 人の テンプレート（町と 同じ 絵で 見本を 出す）。S3 に なければ 2頭身の 絵
    present = GameAsset.present_keys
    @human_url = present.include?("human") ? sprout_asset_path("human") : nil
    # 💇 髪の パーツ（あるものだけ）
    @hair_urls = GameAsset::HAIR_KEYS.select { |key| present.include?(key) }.index_with { |key| sprout_asset_path(key) }
    # 💇 素体＋髪レイヤー（あるものだけ）
    @layer_urls = GameAsset::AVATAR_LAYER_KEYS.select { |key| present.include?(key) }.index_with { |key| sprout_asset_path(key) }
  end

  def update
    raw = params.require(:avatar).permit(*User::AVATAR_KEYS).to_h
    # へんな 値は すてる（前の 値は のこす）。msg は 送られたら そのまま（"" で けす）
    merged = (current_user.avatar || {}).merge(User.clean_avatar(raw.except("msg")) || {})
    merged["msg"] = raw["msg"] if raw.key?("msg")
    avatar = User.clean_avatar(merged)
    return render json: { error: "キャラの形が ちがいます" }, status: :unprocessable_entity unless avatar

    current_user.avatar = avatar
    current_user.display_name = params[:display_name] if params.key?(:display_name)
    current_user.save!
    render json: { ok: true, avatar: avatar, display_name: current_user.display_name, display_label: current_user.display_label }
  end
end
