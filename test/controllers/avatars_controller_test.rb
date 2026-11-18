require "test_helper"

# 👤 キャラメイク と 🏘️ はじまりのまち（トップページ）
class AvatarsControllerTest < ActionDispatch::IntegrationTest
  def login_as(name)
    user = User.new(name: name)
    post login_path, params: { login_code: user.issue_login_code! }
    User.find_by(name: name)
  end

  test "ログインしていないと開けない" do
    get avatar_path
    assert_redirected_to login_path
  end

  test "キャラメイクの画面が開ける" do
    login_as("avmaker")
    get avatar_path
    assert_response :success
    assert_select "[data-controller=avatar-maker]"
    assert_select "[data-avatar-maker-avatar-value='{}']"
  end

  test "保存すると、知らない項目・へんな値は すてて のこす" do
    user = login_as("avsaver")
    patch avatar_path, params: { avatar: { hair: "twin", skin: 2, hairColor: "4", eyes: "big", acc: "<b>", evil: "x", topColor: 999 } }, as: :json
    assert_response :success
    assert_equal({ "hair" => "twin", "skin" => 2, "hairColor" => 4, "eyes" => "big" }, user.reload.avatar)
  end

  test "なにも のこらない キャラは 保存しない" do
    user = login_as("avempty")
    patch avatar_path, params: { avatar: { evil: "x" } }, as: :json
    assert_response :unprocessable_entity
    assert_nil user.reload.avatar
  end

  test "まち：まだ キャラが ないと「つくろう」、ほかの人の キャラが 出る（自分と キャラなしの人は 出ない）" do
    User.create!(name: "neighbor", login_digest: "pending-neighbor", avatar: { "hair" => "bob" })
    User.create!(name: "nochar", login_digest: "pending-nochar")
    login_as("avtown")
    get root_path
    assert_response :success
    assert_select "[data-controller=town]"
    assert_select "[data-town-target=intro]"
    assert_select ".hm-town__building", 4
    assert_select "[data-town-place]", 4
    others = JSON.parse(css_select("[data-controller=town]").first["data-town-others-value"])
    names = others.map { |o| o["name"] }
    assert_includes names, "neighbor"
    assert_not_includes names, "nochar"
    assert_not_includes names, "avtown"
    assert_select "a.hm-avatar-link", text: /つくる/
  end
end
