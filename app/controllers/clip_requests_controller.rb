# ✂️ 切り抜き動画をたのむ（フォーム → Discord に投稿）。保存はしない（N2）
class ClipRequestsController < ApplicationController
  # 1人が1時間に送れる数（まちがえて何回も押したとき・いたずら対策）
  LIMIT_PER_HOUR = 5

  def new
    @clip_request = ClipRequest.new
    @configured = DiscordNotifier.configured?
  end

  def create
    @clip_request = ClipRequest.new(clip_request_params)
    @configured = DiscordNotifier.configured?
    return render(:new, status: :unprocessable_entity) unless @clip_request.valid?

    if sent_count >= LIMIT_PER_HOUR
      flash.now[:alert] = "1時間に送れるのは#{LIMIT_PER_HOUR}件までです。少し待ってから送ってね"
      return render(:new, status: :too_many_requests)
    end

    DiscordNotifier.new.post_clip_request(@clip_request, user: current_user)
    Rails.cache.write(limit_key, sent_count + 1, expires_in: 1.hour)
    redirect_to new_clip_request_path, notice: "✂️ 依頼を送りました！ 管理者が Discord で受け取ります。返事を待っててね"
  rescue DiscordNotifier::Error => e
    flash.now[:alert] = e.message
    render :new, status: :service_unavailable
  end

  private

  def clip_request_params
    params.require(:clip_request).permit(:video_url, :scenes, :orientation, :length, :subtitles, :title_idea, :mood, :deadline, :note, :permission)
  end

  def limit_key
    "clip_requests:#{current_user.id}"
  end

  def sent_count
    Rails.cache.read(limit_key).to_i
  end
end
