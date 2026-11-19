class SessionsController < ApplicationController
  skip_before_action :require_login, only: [:new, :create]
  # メンテナンス中でも、ログイン・ログアウトは できる（入れるのは 管理者だけ）
  skip_before_action :maintenance_gate, only: [:new, :create, :destroy]
  layout "auth"

  # 同じ場所（IPアドレス）から、この回数まちがえたら、しばらく試せなくする
  MAX_ATTEMPTS = 10
  LOCK_TIME = 15.minutes

  # 合いことば（CSRF トークン）が 古いとき（ログイン画面を 開いたまま 時間がたった・べつのタブで ログインした など）
  # 英語の エラー画面（422）ではなく、ログイン画面に もどして もう一度 入れてもらう（ログインは させない）
  rescue_from ActionController::InvalidAuthenticityToken, with: :stale_form

  def new
    # ログイン画面は ブラウザに 取っておかせない（古い合いことばの 画面が 「もどる」や タブの復元で 出ないように）
    response.headers["Cache-Control"] = "no-store"
    redirect_to root_path if logged_in?
  end

  def create
    if locked?
      flash.now[:alert] = "まちがいが続いたので、#{LOCK_TIME.in_minutes.to_i}分ほど待ってからもう一度ためしてください"
      return render :new, status: :too_many_requests
    end

    user = User.find_by_login_code(params[:login_code])

    if user
      reset_session   # 前のログインの情報を消してから入る（なりすまし対策）
      session[:user_id] = user.id
      session[:login_id] = SecureRandom.hex(8) # ログインするたびに変わる番号（ドット絵の子を「消した」のは、このログインの間だけ）
      Rails.cache.delete(attempt_key)
      redirect_to root_path
    else
      count_failure
      flash.now[:alert] = "ログインIDがちがいます"
      render :new, status: :unprocessable_entity
    end
  end

  def destroy
    reset_session
    redirect_to login_path, notice: "ログアウトしました"
  end

  private

  def stale_form
    reset_session
    if action_name == "destroy"
      redirect_to login_path, notice: "ログアウトしました"
    else
      redirect_to login_path, alert: "時間が たったので、もう一度 IDを 入れてね"
    end
  end

  def attempt_key
    "login_attempts:#{request.remote_ip}"
  end

  def locked?
    Rails.cache.read(attempt_key).to_i >= MAX_ATTEMPTS
  end

  def count_failure
    Rails.cache.write(attempt_key, Rails.cache.read(attempt_key).to_i + 1, expires_in: LOCK_TIME)
  end
end
