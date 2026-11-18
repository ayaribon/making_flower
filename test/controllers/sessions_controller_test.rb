require "test_helper"

# 🔑 ログイン：合いことば（CSRF トークン）が 古いときは、英語の エラー画面ではなく ログイン画面に もどす
class SessionsControllerTest < ActionDispatch::IntegrationTest
  setup do
    @forgery = ActionController::Base.allow_forgery_protection
    ActionController::Base.allow_forgery_protection = true
  end

  teardown do
    ActionController::Base.allow_forgery_protection = @forgery
  end

  test "ログイン画面は ブラウザに 取っておかせない" do
    get login_path
    assert_response :success
    assert_includes response.headers["Cache-Control"], "no-store"
  end

  test "合いことばが 古いと、ログインせずに ログイン画面へ もどして 知らせる" do
    user = User.new(name: "stalelogin")
    code = user.issue_login_code!
    post login_path, params: { login_code: code, authenticity_token: "old-token" }
    assert_redirected_to login_path
    follow_redirect!
    assert_select ".auth-alert", text: /もう一度/
    get root_path
    assert_redirected_to login_path # ログインは されていない
  end

  test "合いことばが あっていれば ログインできる" do
    user = User.new(name: "freshlogin")
    code = user.issue_login_code!
    get login_path
    token = css_select("input[name=authenticity_token]").first["value"]
    post login_path, params: { login_code: code, authenticity_token: token }
    assert_redirected_to root_path
  end
end
