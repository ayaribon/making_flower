# マイテンプレート。どれも「ログインしている本人のもの」だけを相手にする（ほかの人のものは見つからない扱い）
class UserTemplatesController < ApplicationController
  def index
    list = current_user.user_templates.with_attached_thumbnail.order(updated_at: :desc)
    render json: { templates: list.map { |t| t.to_editor_hash(thumbnail_url: thumb_url(t)) } }
  end

  def create
    t = current_user.user_templates.new(template_params)
    t.attach_thumbnail_data_url(params.dig(:user_template, :thumbnail))
    t.save!
    render json: { id: t.id }, status: :created
  rescue ActiveRecord::RecordInvalid => e
    render json: { error: e.record.errors.full_messages.join("、") }, status: :unprocessable_entity
  end

  def update
    t = current_user.user_templates.find(params[:id])
    t.assign_attributes(template_params)
    t.attach_thumbnail_data_url(params.dig(:user_template, :thumbnail))
    t.save!
    head :no_content
  rescue ActiveRecord::RecordInvalid => e
    render json: { error: e.record.errors.full_messages.join("、") }, status: :unprocessable_entity
  end

  def destroy
    current_user.user_templates.find(params[:id]).destroy!
    head :no_content
  end

  private

  def template_params
    params.require(:user_template).permit(:name, :ratio, :body)
  end

  def thumb_url(t)
    t.thumbnail.attached? ? rails_storage_proxy_path(t.thumbnail) : nil
  end
end
