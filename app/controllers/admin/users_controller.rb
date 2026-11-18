class Admin::UsersController < Admin::BaseController
  before_action :set_user, only: [:reissue, :destroy]

  def index
    @users = User.order(admin: :desc, name: :asc)
  end

  def new
    @user = User.new
  end

  # ユーザーを作って、ログインIDをこの画面に1回だけ表示する
  # （IDはリダイレクトやフラッシュに載せない＝ブラウザに残さない）
  def create
    @user = User.new(name: params.dig(:user, :name).to_s.strip, admin: false,
                     login_digest: "pending-#{SecureRandom.hex(8)}")
    if @user.save
      @login_code = @user.issue_login_code!
      @message = "#{@user.name} さんを作りました"
      render_issued
    else
      render :new, status: :unprocessable_entity
    end
  end

  # ログインIDを作り直す（古いIDは使えなくなる）
  def reissue
    @login_code = @user.issue_login_code!
    @message = "#{@user.name} さんのログインIDを作り直しました。前のIDはもう使えません"
    render_issued
  end

  def destroy
    if @user == current_user
      redirect_to admin_users_path, alert: "自分自身は削除できません"
    elsif @user.admin? && User.where(admin: true).count <= 1
      redirect_to admin_users_path, alert: "管理者が1人もいなくなるので削除できません"
    else
      @user.destroy!
      redirect_to admin_users_path, notice: "#{@user.name} さんを削除しました"
    end
  end

  private

  def set_user
    @user = User.find(params[:id])
  end

  # ログインIDの画面を出す
  # 画面の切りかえ（Turbo）は、フォームの返事が「移動」でないと 画面を すててしまう。
  # なので Turbo には「この部分を 入れかえて」という返事（turbo_stream）で返す。Turbo がないときは ふつうの画面
  # （IDは リダイレクトや フラッシュには 載せない＝ブラウザに残さない、は そのまま）
  def render_issued
    respond_to do |format|
      format.turbo_stream { render turbo_stream: turbo_stream.update("admin-main", template: "admin/users/issued", formats: [:html]) }
      format.html { render :issued }
    end
  end
end
