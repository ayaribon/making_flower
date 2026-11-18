# 🌱 買った 素材の 画像を 出す（ログインした人だけ。ApplicationController の require_login）
#   GET /game_assets/sprout/:key   例：/game_assets/sprout/grass
# 中身は GameAsset（本番は S3、手元は private_assets/）。知らない キー・ない ファイルは 404
class GameAssetsController < ApplicationController
  def show
    key = params[:key].to_s
    return head :not_found unless GameAsset::SPROUT.key?(key)

    data = GameAsset.read(key)
    return head :not_found unless data

    expires_in 1.day, public: false
    response.headers["X-Content-Type-Options"] = "nosniff"
    send_data data, type: "image/png", disposition: "inline" if stale?(etag: Digest::MD5.hexdigest(data), public: false)
  end
end
