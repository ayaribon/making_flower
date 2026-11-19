require "test_helper"

# 🔧 メンテナンス中（ENV["MAINTENANCE"]）：管理者だけ 入れて、ほかの人には メンテナンスの 画面を 出す
class MaintenanceTest < ActionDispatch::IntegrationTest
  setup { ENV["MAINTENANCE"] = "1" }
  teardown { ENV.delete("MAINTENANCE") }

  def login(name, admin: false)
    user = User.new(name: name, admin: admin)
    post login_path, params: { login_code: user.issue_login_code! }
    user
  end

  test "ログインしていない人：ログイン画面は 開けて、メンテナンス中と 出る。ほかの 画面は メンテナンスの 画面" do
    get login_path
    assert_response :success
    assert_select ".auth-alert", text: /メンテナンス中/
    get root_path
    assert_response :service_unavailable
    assert_select ".auth-lead", text: /メンテナンス中/
  end

  test "ふつうの人：ログインしても メンテナンスの 画面（JSON は 503）" do
    login("normal")
    get root_path
    assert_response :service_unavailable
    assert_select ".auth-lead", text: /メンテナンス中/
    get dettyan_save_path, as: :json
    assert_response :service_unavailable
    delete logout_path
    assert_redirected_to login_path
  end

  test "管理者：ふつうに 使えて、上に メンテナンス中の しるしが 出る" do
    login("boss", admin: true)
    get root_path
    assert_response :success
    assert_select ".maintenance-banner"
    get admin_users_path
    assert_response :success
    assert_select ".maintenance-banner"
  end

  test "メンテナンスを やめると、だれでも 使える・しるしも 出ない" do
    ENV.delete("MAINTENANCE")
    login("normal2")
    get root_path
    assert_response :success
    assert_select ".maintenance-banner", false
  end
end
