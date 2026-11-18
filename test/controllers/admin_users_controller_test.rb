require "test_helper"

# 👥 管理画面のユーザー：作ったとき・作り直したときに ログインID が 画面に 出る
# 画面の切りかえ（Turbo）からの ときは turbo_stream で ID の画面に 入れかえる（ふつうの HTML だと Turbo が 画面を すてる）
class AdminUsersControllerTest < ActionDispatch::IntegrationTest
  setup do
    admin = User.new(name: "boss", admin: true)
    post login_path, params: { login_code: admin.issue_login_code! }
  end

  TURBO = { "Accept" => "text/vnd.turbo-stream.html, text/html, application/xhtml+xml" }.freeze

  test "Turbo から ユーザーを 作ると、turbo_stream で ログインID が 出る" do
    post admin_users_path, params: { user: { name: "Newbie" } }, headers: TURBO
    assert_response :success
    assert_equal "text/vnd.turbo-stream.html", response.media_type
    assert_includes response.body, %(target="admin-main")
    code = response.body[/newbie-[a-z0-9]+/]
    assert code, "ID が 出ていない"
    assert_equal "Newbie", User.find_by_login_code(code)&.name
  end

  test "Turbo から IDを作り直すと、新しい ID が 出て、それで ログインできる" do
    user = User.new(name: "Again")
    old = user.issue_login_code!
    post reissue_admin_user_path(user), headers: TURBO
    assert_equal "text/vnd.turbo-stream.html", response.media_type
    code = response.body[/again-[a-z0-9]+/]
    assert code
    assert_not_equal old, code
    assert_equal user, User.find_by_login_code(code)
    assert_nil User.find_by_login_code(old)
  end

  test "Turbo なし（ふつうの フォーム）でも ID の 画面が 出る" do
    post admin_users_path, params: { user: { name: "Plain" } }
    assert_response :success
    assert_select ".is-issued code", text: /\Aplain-/
  end

  test "名前が だめなら、作らずに 入力画面に もどる" do
    post admin_users_path, params: { user: { name: "だめ" } }, headers: TURBO
    assert_response :unprocessable_entity
    assert_nil User.find_by(name: "だめ")
  end
end
