class SessionsController < ApplicationController
  skip_before_action :require_login, only: [:new, :create]
  layout "auth"

  # 同じ場所（IPアドレス）から、この回数まちがえたら、しばらく試せなくする
  MAX_ATTEMPTS = 10
  LOCK_TIME = 15.minutes

  def new
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
