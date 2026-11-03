class ApplicationController < ActionController::Base
  # どの画面もログインが必要（ログイン画面だけは SessionsController で外す）
  before_action :require_login

  helper_method :current_user, :logged_in?

  private

  def current_user
    return @current_user if defined?(@current_user)
    @current_user = session[:user_id] && User.find_by(id: session[:user_id])
  end

  def logged_in?
    current_user.present?
  end

  def require_login
    return if logged_in?
    redirect_to login_path
  end

  # 素材を「キー => 画像の場所など」の表にする（編集画面とテンプレ保存で使う）
  # srcs は比率ごとの画像（背景で使う）。ない比率は、ふつうの画像
  def material_map_for(materials)
    materials.each_with_object({}) do |m, map|
      next unless m.key.present? && m.image.attached?
      map[m.key] = material_entry(m)
    end
  end

  def material_entry(m)
    {
      id: m.id,
      key: m.key,
      src: rails_storage_proxy_path(m.image),
      srcs: material_srcs(m),
      sourceName: m.source_name.to_s,
      sourceUrl: m.source_url.to_s
    }
  end

  def material_srcs(m)
    DesignTemplate::RATIOS.keys.index_with { |ratio| rails_storage_proxy_path(m.image_for(ratio)) }
  end
  helper_method :material_srcs

  def design_template_thumb_url(template)
    template.thumbnail.attached? ? rails_storage_proxy_path(template.thumbnail) : nil
  end

  # 管理画面用（L3で使う）
  def require_admin
    redirect_to root_path, alert: "管理者だけが開ける画面です" unless current_user&.admin?
  end
end
