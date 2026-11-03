class EditorsController < ApplicationController
  def show
    @width = 1280
    @height = 720

    # 部品・背景の一覧は、管理画面で入れた素材（表示ONのもの）から出す
    materials = Material.visible.ordered.with_attached_image.select { |m| m.image.attached? }
    @part_materials = materials.select { |m| m.kind == "part" }
    @background_materials = materials.select { |m| m.kind == "background" }

    # テンプレが「キー」で素材を探すための表（非表示の素材もテンプレからは使える）
    @material_map = Material.where.not(key: nil).with_attached_image.each_with_object({}) do |m, map|
      next unless m.image.attached?
      map[m.key] = {
        src: rails_storage_proxy_path(m.image),
        sourceName: m.source_name.to_s,
        sourceUrl: m.source_url.to_s
      }
    end
  end
end
