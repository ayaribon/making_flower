# 🎤 歌ってみた画面
# オケと歌声はブラウザの中だけで扱う（サーバーには送らない）
# ログイン必須は ApplicationController の require_login がかかる
class SingingsController < ApplicationController
  def show
    # MV の背景に使う、KotoBouquet の背景素材（表示ONのもの）。画像は同じドメインから返す（キャンバスで使うため）
    @mv_backgrounds = Material.visible.ordered.where(kind: "background")
                              .with_attached_image.with_attached_thumb
                              .select { |m| m.image.attached? }
                              .map do |m|
      {
        id: m.id,
        name: m.name,
        src: helpers.rails_storage_proxy_path(m.image),
        thumb: helpers.rails_storage_proxy_path(m.thumb.attached? ? m.thumb : m.image),
        source: m.source_name.presence,
        srcs: material_srcs(m) # 向きごとの画像（縦・正方形用がない素材は、ふつうの画像）
      }
    end
  end
end
