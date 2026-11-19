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

  test "🏘️ ひろばに 出す／出さない を きりかえると、まちの ひろば から きえる・もどる" do
    guest = User.create!(name: "guest1", login_digest: "pending-guest1", avatar: { "hs" => "manbun" })
    get admin_users_path
    assert_select "form[action=?] button", plaza_admin_user_path(guest), text: /ひろばに 出さない/
    patch plaza_admin_user_path(guest)
    assert_redirected_to admin_users_path
    assert_not guest.reload.show_in_plaza
    get root_path
    others = JSON.parse(css_select("[data-controller=town]").first["data-town-others-value"])
    assert_not others.any? { |o| o["name"] == "guest1" }, "出さない に した人は ひろばに 出ない"
    patch plaza_admin_user_path(guest)
    assert guest.reload.show_in_plaza
    get root_path
    others = JSON.parse(css_select("[data-controller=town]").first["data-town-others-value"])
    assert others.any? { |o| o["name"] == "guest1" }
  end

end
