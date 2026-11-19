module ApplicationHelper
  # 🧑 素体＋レイヤー（町の アバター・Dettyan）の 画像の URL（S3 に ある ものだけ）。{ キー => URL }
  def avatar_layer_urls
    present = GameAsset.present_keys
    GameAsset::AVATAR_LAYER_KEYS.select { |key| present.include?(key) }.index_with { |key| sprout_asset_path(key) }
  end

  # 🧑‍💼 育成ゲームの けしきの 素材（Sprout Lands）の URL（S3 に ある ものだけ）
  def dettyan_sprite_urls
    present = GameAsset.present_keys
    GameAsset::DETTYAN_KEYS.select { |key| present.include?(key) }.index_with { |key| sprout_asset_path(key) }
  end
end
