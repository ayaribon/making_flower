# ✂️ 切り抜き動画をたのむ（ひとり1回1依頼）。送ると Discord に知らせて、作業中のページへ
# 作業中のあいだは、新しく頼めない（キャンセルするか、管理者が「できた」「お断り」にすると、また頼める）
class ClipRequestsController < ApplicationController
  include ClipUploads

  # 1人が1時間に送れる数（まちがえて何回も押したとき・いたずら対策）
  LIMIT_PER_HOUR = 5

  def new
    return redirect_to(current_clip_requests_path) if current_user.working_clip_request
    @clip_request = current_user.clip_requests.new
    @configured = DiscordNotifier.configured?
    # できあがった・お断りになったお知らせ（2週間以内）
    @last_closed = current_user.clip_requests.where(status: %w[done declined]).where("closed_at > ?", 14.days.ago).order(closed_at: :desc).first
  end

  def create
    return redirect_to(current_clip_requests_path) if current_user.working_clip_request
    @clip_request = current_user.clip_requests.new(clip_request_params)
    @configured = DiscordNotifier.configured?
    images, image_error = clip_images_from(params.dig(:clip_request, :images))
    @clip_request.errors.add(:base, image_error) if image_error
    return render(:new, status: :unprocessable_entity) if image_error || !@clip_request.valid?

    if sent_count >= LIMIT_PER_HOUR
      flash.now[:alert] = "1時間に送れるのは#{LIMIT_PER_HOUR}件までです。少し待ってから送ってね"
      return render(:new, status: :too_many_requests)
    end

    # 先に Discord に送って、届いたら残す（届かなかったら、作業中にしない）
    DiscordNotifier.new.post_clip_request(@clip_request, user: current_user, images: images)
    @clip_request.save!
    Rails.cache.write(limit_key, sent_count + 1, expires_in: 1.hour)
    redirect_to current_clip_requests_path
  rescue DiscordNotifier::Error => e
    flash.now[:alert] = e.message
    render :new, status: :service_unavailable
  end

  # 💻 いま作業中だよ（ドット絵の子が作業中）
  def current
    @clip_request = current_user.working_clip_request
    redirect_to new_clip_request_path unless @clip_request
  end

  # 🚫 キャンセルする（Discord にも知らせる）
  def cancel
    req = current_user.clip_requests.find(params[:id])
    return redirect_to(new_clip_request_path, status: :see_other) unless req.working?
    req.close!("canceled")
    begin
      DiscordNotifier.new.post_clip_status(req, user: current_user)
    rescue DiscordNotifier::Error => e
      Rails.logger.warn("[discord] キャンセルを知らせられませんでした: #{e.message}")
    end
    redirect_to new_clip_request_path, notice: "依頼をキャンセルしました。また気軽にたのんでね", status: :see_other
  end

  private

  def clip_request_params
    params.require(:clip_request).permit(:video_url, :scenes, :orientation, :length, :subtitles, :title_idea, :mood, :deadline, :note, :material_links, :permission)
  end

  def limit_key
    "clip_requests:#{current_user.id}"
  end

  def sent_count
    Rails.cache.read(limit_key).to_i
  end
end
