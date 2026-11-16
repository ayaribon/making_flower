# ✂️ 切り抜きの依頼の一覧（管理者）。「✅ できた」「🙏 お断り」で作業中を終わらせる（たのんだ人は、また頼めるようになる）
class Admin::ClipRequestsController < Admin::BaseController
  def index
    @working = ClipRequest.working.includes(:user).order(:created_at)
    @closed = ClipRequest.where.not(status: "working").includes(:user).order(closed_at: :desc).limit(30)
  end

  def update
    req = ClipRequest.find(params[:id])
    unless req.working?
      return redirect_to(admin_clip_requests_path, alert: "この依頼はもう終わっています", status: :see_other)
    end
    status = params[:status].presence_in(%w[done declined])
    return redirect_to(admin_clip_requests_path, alert: "えらび方がちがいます", status: :see_other) unless status

    req.result_url = params[:result_url].to_s.strip.presence
    unless req.valid?
      return redirect_to(admin_clip_requests_path, alert: req.errors.full_messages.join("／"), status: :see_other)
    end
    req.close!(status, result_url: req.result_url)
    begin
      DiscordNotifier.new.post_clip_status(req, user: req.user)
    rescue DiscordNotifier::Error => e
      Rails.logger.warn("[discord] 知らせられませんでした: #{e.message}")
    end
    redirect_to admin_clip_requests_path, notice: "#{req.user.name} さんの依頼を「#{req.status_label}」にしました", status: :see_other
  end
end
