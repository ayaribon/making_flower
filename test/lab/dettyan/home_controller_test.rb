require "test_helper"

# 🧪 区画「dettyan」の テスト（サンプル）。bin/rails test test/lab/dettyan
class Lab::Dettyan::HomeControllerTest < ActionDispatch::IntegrationTest
  test "ログインして いないと /login へ" do
    get "/lab/dettyan"
    assert_redirected_to login_path
  end

  test "ログイン すると ようこそ ページ" do
    user = User.new(name: "labdettyantester")
    post login_path, params: { login_code: user.issue_login_code! }
    get "/lab/dettyan"
    assert_response :success
    assert_select "[data-controller='lab--dettyan--hello']"
  end
end
