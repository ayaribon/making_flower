# 自分の画像の一覧・保存・表示・削除。
# どの操作も「ログインしている本人の画像」だけを相手にする（他人の画像は見つからない扱い）。
class UserImagesController < ApplicationController
  def index
    images = current_user.user_images.with_attached_thumb.order(created_at: :desc)
    images = images.where(kind: params[:kind]) if UserImage::KINDS.include?(params[:kind])
    render json: images.map { |i| { id: i.id, kind: i.kind, name: i.name, thumb: i.thumb.attached? } }
  end

  def create
    upload = params.require(:file)
    image = UserImage.create_for!(current_user, kind: params.require(:kind), upload: upload, thumb: params[:thumb])
    render json: { id: image.id, kind: image.kind, name: image.name }, status: :created
  rescue ActiveRecord::RecordInvalid => e
    render json: { error: e.record.errors.full_messages.join("、") }, status: :unprocessable_entity
  end

  # 画像そのものを返す。キャンバスで使うので、同じドメインから返す（S3のURLは見せない）
  def show
    image = current_user.user_images.find(params[:id])
    expires_in 1.hour, public: false
    send_data image.file.download,
              type: image.file.content_type,
              disposition: "inline",
              filename: image.file.filename.to_s
  end

  # 一覧用の小さい画像。ないときは 404（ブラウザが元の画像を出して、サムネを作って送ってくる）
  def thumb
    image = current_user.user_images.find(params[:id])
    return head :not_found unless image.thumb.attached?
    expires_in 1.day, public: false
    send_data image.thumb.download, type: "image/png", disposition: "inline", filename: "thumb.png"
  end

  # もうアップロードしてある画像に、あとからサムネをつける
  def update_thumb
    image = current_user.user_images.find(params[:id])
    image.attach_thumb(params.require(:thumb))
    image.save!
    head :no_content
  rescue ActiveRecord::RecordInvalid => e
    render json: { error: e.record.errors.full_messages.join("、") }, status: :unprocessable_entity
  end

  def destroy
    current_user.user_images.find(params[:id]).destroy!
    head :no_content
  end
end
