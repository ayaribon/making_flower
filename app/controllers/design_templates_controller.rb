# 編集画面のテンプレ一覧（JSON）。みんなには公開中のものだけ、管理者には全部出す
class DesignTemplatesController < ApplicationController
  def index
    scope = DesignTemplate.ordered.with_attached_thumbnail
    scope = scope.visible unless current_user.admin?
    render json: {
      version: 2,
      templates: scope.map { |t| t.to_editor_hash(thumbnail_url: design_template_thumb_url(t)) }
    }
  end
end
