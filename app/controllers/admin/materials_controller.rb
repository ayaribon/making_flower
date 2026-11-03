module Admin
  class MaterialsController < BaseController
    before_action :set_material, only: [:edit, :update, :destroy, :toggle]

    def index
      @per = 20
      @q = params[:q].to_s.strip
      @kind = params[:kind].presence_in(Material::KINDS.keys)
      @tag = params[:tag].to_s.strip.presence
      @state = params[:state].presence_in(%w[visible hidden])
      @sort = params[:sort].presence_in(SORTS.keys) || "position"

      scope = Material.all
      scope = scope.where(kind: @kind) if @kind
      scope = scope.where(visible: @state == "visible") if @state
      if @q.present?
        like = "%#{Material.sanitize_sql_like(@q)}%"
        scope = scope.where("name LIKE :q OR `key` LIKE :q OR source_name LIKE :q", q: like)
      end
      # タグはカンマ区切りで入っているので、前後にカンマを付けて完全一致で探す
      scope = scope.where("CONCAT(',', tags, ',') LIKE ?", "%,#{Material.sanitize_sql_like(@tag)},%") if @tag

      @total = scope.count
      @pages = [(@total.to_f / @per).ceil, 1].max
      @page = params[:page].to_i.clamp(1, @pages)
      @materials = scope.order(SORTS[@sort]).limit(@per).offset((@page - 1) * @per)
                         .with_attached_image.with_attached_image_portrait.with_attached_image_square
      @usage = Material.template_usage
    end

    SORTS = {
      "position" => { position: :asc, id: :asc },
      "newest"   => { created_at: :desc, id: :desc },
      "oldest"   => { created_at: :asc, id: :asc },
      "name"     => { name: :asc, id: :asc }
    }.freeze

    helper_method :filter_params

    # ページ送りで、今の絞り込みを引き継ぐ
    def filter_params(extra = {})
      { q: @q.presence, kind: @kind, tag: @tag, state: @state, sort: (@sort if @sort != "position") }
        .merge(extra).compact
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
      params.require(:material).permit(:name, :key, :kind, :image, :image_portrait, :image_square,
                                       :remove_image_portrait, :remove_image_square, :source_name, :source_url, :license_note, :visible, :position, tag_list: [])
    end
  end
end
