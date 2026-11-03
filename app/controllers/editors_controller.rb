class EditorsController < ApplicationController
  def show
    @width = 1280
    @height = 720

    # 部品・背景の一覧は、管理画面で入れた素材（表示ONのもの）から出す
    materials = Material.visible.ordered.with_attached_image.select { |m| m.image.attached? }
    @part_materials = materials.select { |m| m.kind == "part" }
    @background_materials = materials.select { |m| m.kind == "background" }
  end
end
