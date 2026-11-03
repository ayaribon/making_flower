module Admin
  class MaterialsController < BaseController
    before_action :set_material, only: [:edit, :update, :destroy, :toggle]

    def index
      @materials = Material.ordered.with_attached_image
      @usage = Material.template_usage
    end

    def new
      @material = Material.new(kind: params[:kind].presence_in(Material::KINDS.keys) || "part")
    end

    def create
      @material = Material.new(material_params)
      if @material.save
        redirect_to admin_materials_path, notice: "「#{@material.name}」を追加しました"
      else
        render :new, status: :unprocessable_entity
      end
    end

    def edit; end

    def update
      if @material.update(material_params)
        redirect_to admin_materials_path, notice: "「#{@material.name}」を更新しました"
      else
        render :edit, status: :unprocessable_entity
      end
    end

    def toggle
      # テンプレで使っている素材は、隠すと一覧から選べなくなるだけ（テンプレからは使える）
      @material.update!(visible: !@material.visible)
      redirect_to admin_materials_path, notice: "「#{@material.name}」を#{@material.visible ? '表示' : '非表示'}にしました"
    end

    def destroy
      name = @material.name
      if @material.destroy
        redirect_to admin_materials_path, notice: "「#{name}」を削除しました"
      else
        redirect_to admin_materials_path, alert: @material.errors.full_messages.join("／")
      end
    end

    private

    def set_material
      @material = Material.find(params[:id])
    end

    def material_params
      params.require(:material).permit(:name, :key, :kind, :image, :source_name, :source_url, :license_note, :visible, :position)
    end
  end
end
