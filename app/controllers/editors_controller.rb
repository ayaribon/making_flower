class EditorsController < ApplicationController
  def show
    @width = 1280
    @height = 720

    # 部品・背景の一覧は、管理画面で入れた素材（表示ONのもの）から出す
    materials = Material.visible.ordered
                        .with_attached_image.with_attached_image_portrait.with_attached_image_square.with_attached_thumb
                        .select { |m| m.image.attached? }
    @part_materials = materials.select { |m| m.kind == "part" }
    @background_materials = materials.select { |m| m.kind == "background" }

    # テンプレが「キー」で素材を探すための表（非表示の素材もテンプレからは使える）
    @material_map = material_map_for(
      Material.where.not(key: nil).with_attached_image.with_attached_image_portrait.with_attached_image_square
    )

    # 管理画面の「🎨 編集画面で開く」から来たとき（管理者だけ）
    if current_user.admin? && params[:template_id].present?
      template = DesignTemplate.find_by(id: params[:template_id])
      @edit_template = template && template.to_editor_hash(thumbnail_url: design_template_thumb_url(template))
    end
  end
end
