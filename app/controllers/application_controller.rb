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

  # 管理画面用（L3で使う）
  def require_admin
    redirect_to root_path, alert: "管理者だけが開ける画面です" unless current_user&.admin?
  end
end
