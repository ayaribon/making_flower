# 📎 切り抜きに使っていい素材・画像を送る（フォーム → Discord）。リンクか画像（画像はそのまま添付して、保存しない）
class ClipMaterialsController < ApplicationController
  include ClipUploads

  LIMIT_PER_HOUR = 5

  def new
    @clip_material = ClipMaterial.new
    @configured = DiscordNotifier.configured?
  end

  def create
    @clip_material = ClipMaterial.new(params.require(:clip_material).permit(:links, :description, :permission))
    @configured = DiscordNotifier.configured?
    images, image_error = clip_images_from(params.dig(:clip_material, :images))
    @clip_material.valid?
    @clip_material.errors.add(:base, image_error) if image_error
    if !image_error && images.empty? && @clip_material.links.blank?
      @clip_material.errors.add(:base, "リンクか画像のどちらかを入れてね")
    end
    return render(:new, status: :unprocessable_entity) if @clip_material.errors.any?

    key = "clip_materials:#{current_user.id}"
    if Rails.cache.read(key).to_i >= LIMIT_PER_HOUR
      flash.now[:alert] = "1時間に送れるのは#{LIMIT_PER_HOUR}回までです。少し待ってから送ってね"
      return render(:new, status: :too_many_requests)
    end

    DiscordNotifier.new.post_material_share(@clip_material, user: current_user, images: images)
    Rails.cache.write(key, Rails.cache.read(key).to_i + 1, expires_in: 1.hour)
    redirect_to thanks_clip_materials_path
  rescue DiscordNotifier::Error => e
    flash.now[:alert] = e.message
    render :new, status: :service_unavailable
  end

  # 送ったあと（ドット絵の子が作業中）
  def thanks
  end
end
