module Admin
  # 🔎 Openverse から素材を探して取り込む
  # 取り込んだものは、ふつうの素材（Material）になる。引用元・ライセンスは自動で入る
  class MaterialImportsController < BaseController
    def index
      @q = params[:q].to_s.strip.first(100)
      @group = params[:group].presence_in(OpenverseClient::LICENSE_GROUPS.keys) || "free"
      @category = params.key?(:category) ? params[:category].to_s.presence_in(OpenverseClient::CATEGORIES.keys) || "illustration" : "illustration"
      return if @q.blank?

      @search = client.search(q: @q, group: @group, category: @category, page: params[:page])
      @imported = OpenverseClient.imported_materials(@search[:results].map { |r| r[:id] })
    rescue OpenverseClient::Error => e
      @search = nil
      flash.now[:alert] = e.message
    end

    def create
      item = client.fetch(params[:openverse_id])

      if (existing = OpenverseClient.imported_materials([item[:id]])[item[:id]])
        return redirect_to edit_admin_material_path(existing), notice: "「#{existing.name}」はもう取り込んであります"
      end

      io, type, filename = client.download(item[:url])
      material = Material.new(OpenverseClient.material_attributes(item))
      material.name = params[:name].to_s.strip.first(40) if params[:name].present?
      material.kind = params[:kind].presence_in(Material::KINDS.keys) || "part"
      # 作者の表記が要るもの（CC BY）は、サムネの編集画面に出ないように必ず非表示で入れる
      material.visible = item[:thumb_ok] && params[:visible] == "1"
      material.image.attach(io: io, filename: filename, content_type: type)

      if material.save
        redirect_to edit_admin_material_path(material),
                    notice: "「#{material.name}」を取り込みました（#{material.visible ? '表示中' : '非表示'}）。タグや比率ごとの画像はここで入れてください"
      else
        redirect_back fallback_location: admin_material_imports_path, alert: material.errors.full_messages.join("／")
      end
    rescue OpenverseClient::Error => e
      redirect_back fallback_location: admin_material_imports_path, alert: e.message
    end

    private

    def client
      @client ||= OpenverseClient.new
    end
  end
end
