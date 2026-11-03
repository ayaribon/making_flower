module Admin
  # テンプレの管理。作る・中身を直すのは編集画面で（ここには JSON で届く）、
  # 名前・アイコン・並び順・公開の切り替え・複製・削除は管理画面で
  class DesignTemplatesController < BaseController
    before_action :set_template, only: [:edit, :update, :destroy, :toggle, :duplicate]

    def index
      @ratio = params[:ratio].presence_in(DesignTemplate::RATIOS.keys)
      scope = DesignTemplate.ordered.with_attached_thumbnail
      scope = scope.where(ratio: @ratio) if @ratio
      @templates = scope
      @counts = DesignTemplate.group(:ratio).count
    end

    # 編集画面の「📋 テンプレとして保存」（新しく作る）
    def create
      @template = DesignTemplate.new(template_params.except(:thumbnail))
      @template.position = (DesignTemplate.maximum(:position) || 0) + 10 if template_params[:position].blank?
      @template.data = normalize_body(@template.data) if @template.body.present?
      save_from_editor(:created)
    end

    def edit; end

    # 編集画面からの「上書き保存」（JSON）と、管理画面のフォーム（HTML）の両方
    def update
      @template.assign_attributes(template_params.except(:thumbnail))
      @template.data = normalize_body(@template.data) if template_params.key?(:body)

      respond_to do |format|
        format.json { save_from_editor(:ok) }
        format.html do
          if @template.save
            redirect_to admin_design_templates_path, notice: "「#{@template.name}」を更新しました"
          else
            render :edit, status: :unprocessable_entity
          end
        end
      end
    end

    def toggle
      @template.update!(visible: !@template.visible)
      redirect_back fallback_location: admin_design_templates_path,
                    notice: "「#{@template.name}」を#{@template.visible ? '公開' : '非公開'}にしました"
    end

    def duplicate
      copy = @template.dup
      copy.slug = nil
      copy.name = "#{@template.name}（コピー）".first(40)
      copy.position = @template.position + 1
      copy.thumbnail.attach(@template.thumbnail.blob) if @template.thumbnail.attached?
      copy.save!
      redirect_to admin_design_templates_path, notice: "「#{copy.name}」を作りました"
    end

    def destroy
      name = @template.name
      @template.destroy!
      redirect_to admin_design_templates_path, notice: "「#{name}」を削除しました"
    end

    private

    def set_template
      @template = DesignTemplate.find(params[:id])
    end

    def template_params
      params.require(:design_template).permit(:name, :icon, :ratio, :body, :thumbnail, :visible, :position)
    end

    def save_from_editor(status)
      thumb = template_params[:thumbnail]
      DesignTemplate.transaction do
        @template.save!
        @template.attach_thumbnail_data_url(thumb) if thumb.present?
      end
      used = Material.where(key: @template.material_keys).with_attached_image.with_attached_image_portrait.with_attached_image_square
      render json: {
        template: @template.to_editor_hash(thumbnail_url: design_template_thumb_url(@template)),
        materials: material_map_for(used)
      }, status: status
    rescue ActiveRecord::RecordInvalid
      render json: { error: @template.errors.full_messages.join("／") }, status: :unprocessable_entity
    end

    # 編集画面から届いた中身を整える。
    # キーのない素材（materialId だけ）には、ここでキーを付けてから、キーで覚える
    def normalize_body(data)
      data = data.deep_dup
      convert = lambda do |hash|
        id = hash.delete("materialId")
        return if hash["material"].present? || id.blank?
        material = Material.find_by(id: id)
        hash["material"] = material && ensure_key(material)
      end

      convert.call(data["background"]) if data["background"].is_a?(Hash)
      data["background"]&.delete("material") if data["background"].is_a?(Hash) && data["background"]["material"].blank?
      items = Array(data["items"]).select { |i| i.is_a?(Hash) }
      items.each { |item| convert.call(item) if item["type"] == "part" }
      # 素材が見つからない部品は捨てる
      data["items"] = items.reject { |item| item["type"] == "part" && item["material"].blank? }
      data
    end

    def ensure_key(material)
      return material.key if material.key.present?
      key = "m#{material.id}"
      key = "m#{material.id}-#{SecureRandom.alphanumeric(4).downcase}" while Material.exists?(key: key)
      material.update_columns(key: key, updated_at: Time.current)
      key
    end
  end
end
