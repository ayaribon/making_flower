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

  test "まち：まだ キャラが ないと「つくろう」、事務所の みんな が 出る（自分と、キャラの ない Dettyan 本人は 出ない）" do
    User.create!(name: "neighbor", login_digest: "pending-neighbor", avatar: { "hair" => "bob", "msg" => "うたうよ" })
    User.create!(name: "nochar", login_digest: "pending-nochar")
    User.create!(name: "Dettyan", login_digest: "pending-dettyan")
    login_as("avtown")
    get root_path
    assert_response :success
    assert_select "[data-controller=town]"
    assert_select "[data-town-target=intro]"
    assert_select "[data-town-target=guide]"
    assert_select ".hm-town__building", 4
    assert_select "[data-town-place]", 4
    others = JSON.parse(css_select("[data-controller=town]").first["data-town-others-value"])
    by_name = others.index_by { |o| o["name"] }
    assert_equal "うたうよ", by_name.dig("neighbor", "avatar", "msg")
    assert by_name.key?("nochar"), "キャラが まだ の人も 出る（見た目は 名前から きまる）"
    assert_nil by_name["nochar"]["avatar"]
    assert_equal "neighbor", others.first["name"], "キャラを つくった人が さき"
    assert_not by_name.key?("avtown")
    assert_not by_name.key?("Dettyan"), "Dettyan 本人は 町の Dettyan が かわり"
    assert_select "a.hm-avatar-link", text: /つくる/
    assert_select "form.hm-say", 0, "キャラが ない人には ひとこと の 入力は 出さない"
  end

  test "まち：建物に 何が できるか の 説明が ある" do
    login_as("avguide")
    get root_path
    { "sing" => "歌ってみた", "art" => "サムネ", "dettyan" => "Dettyan", "clip" => "切り抜き" }.each do |id, word|
      assert_select ".hm-town__building[data-town-place-param=#{id}] .hm-town__tag small", text: /#{word}/
      assert_select ".hm-town__building[data-town-place-param=#{id}][aria-label*=?]", word
    end
    assert_select "button[data-action='town#startGuide']"
  end

  test "💬 ひとこと：見えない文字は すきまに・20文字まで。送った 項目だけ かわる（見た目は そのまま）" do
    user = login_as("avmsg")
    user.update!(avatar: { "hair" => "twin", "skin" => 2 })
    patch avatar_path, params: { avatar: { msg: "  きょうも\n歌うぞ\u202e#{"！" * 30}" } }, as: :json
    assert_response :success
    saved = user.reload.avatar
    assert_equal "twin", saved["hair"]
    assert_equal 2, saved["skin"]
    assert_equal 20, saved["msg"].length
    assert saved["msg"].start_with?("きょうも 歌うぞ ！")
    assert_equal saved["msg"], response.parsed_body.dig("avatar", "msg")

    get root_path
    assert_select "form.hm-say input[data-town-target=sayInput][value=?]", saved["msg"]

    patch avatar_path, params: { avatar: { msg: "" } }, as: :json
    assert_response :success
    assert_equal({ "hair" => "twin", "skin" => 2 }, user.reload.avatar, "から で けす")
  end
end
