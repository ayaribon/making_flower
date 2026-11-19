require "test_helper"

# 🧪 /lab の 入口（共通）：ログインが いる・区画の 一覧が 自動で 出る・lab の CSS が 本体に まざらない（docs/lab/README.md）
class LabHomeControllerTest < ActionDispatch::IntegrationTest
  test "ログインして いないと /login へ" do
    get "/lab"
    assert_redirected_to login_path
  end

  test "区画の 一覧は app/controllers/lab/ の 下の フォルダから 自動で 出る。枠は lab（本体の CSS は 読まない）" do
    user = User.new(name: "labviewer")
    post login_path, params: { login_code: user.issue_login_code! }
    get "/lab"
    assert_response :success
    assert_equal Lab::HomeController.spaces.sort, css_select("a.lab-space").map(&:text).sort
    assert_includes Lab::HomeController.spaces, "dettyan"
    assert_select "link[rel=stylesheet][href*='lab/lab']"
    assert_select "link[rel=stylesheet][href*='application']", 0
  end

  test "本体の application.css に lab の CSS が 入らない。lab/lab.css には 入る" do
    app_css = Rails.application.assets["application.css"].to_s
    lab_css = Rails.application.assets["lab/lab.css"].to_s
    assert_no_match(/\.lab-/, app_css)
    assert_match(/\.lab-dettyan-/, lab_css)
  end
end
