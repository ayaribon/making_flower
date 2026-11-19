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

  test "まち：まだ キャラが ないと「つくろう」、キャラを つくった人だけ 出る（自分・キャラの ない人 は 出ない）" do
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
    assert_not by_name.key?("nochar"), "キャラが まだ の人は 出ない（つくったら 出る）"
    assert_not by_name.key?("avtown")
    assert_not by_name.key?("Dettyan"), "キャラの ない Dettyan 本人は 町の Dettyan が かわり"
    assert others.all? { |o| o["avatar"].present? }
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
    sprites = JSON.parse(css_select("[data-controller=town]").first["data-town-sprites-value"])
    assert_kind_of Hash, sprites
    assert(sprites.empty? || sprites.keys.sort == GameAsset::SPROUT.keys.sort, "素材が そろっているときだけ ぜんぶ わたす")
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

  test "🏷️ 表示名：キャラメイク から かえられる。まち・あいさつ に 出る。空で 呼び名に もどる" do
    user = login_as("avnick")
    other = User.create!(name: "avfriend", login_digest: "pending-avfriend", avatar: { "hair" => "bob" }, display_name: "スタッフ赤")
    patch avatar_path, params: { avatar: { hair: "bob" }, display_name: "  スタッフ\n青\u202e#{"ー" * 20}" }, as: :json
    assert_response :success
    user.reload
    assert_equal 12, user.display_name.length
    assert user.display_name.start_with?("スタッフ 青")
    assert_equal user.display_name, response.parsed_body["display_label"]
    assert_equal "avnick", user.name, "ログインの 呼び名は かわらない"

    get root_path
    assert_select ".hm-hello", text: /#{Regexp.escape(user.display_name)} さん/
    town = css_select("[data-controller=town]").first
    assert_equal user.display_name, town["data-town-name-value"]
    assert_equal "avnick", town["data-town-account-value"], "あんない の しるしは 呼び名の まま"
    assert_includes JSON.parse(town["data-town-others-value"]).map { |o| o["name"] }, "スタッフ赤"
    assert_equal "スタッフ赤", other.display_label

    get avatar_path
    assert_select "input[data-avatar-maker-target=displayName][value=?]", user.display_name

    patch avatar_path, params: { avatar: { hair: "bob" }, display_name: "   " }, as: :json
    assert_nil user.reload.display_name
    assert_equal "avnick", user.display_label

    patch avatar_path, params: { avatar: { msg: "やあ" } }, as: :json
    assert_nil user.reload.display_name, "display_name を 送らなければ かわらない"
  end

  test "🏠 トップ：はじめは 画面いっぱいの まち。📋 かんたんメニュー に 切りかえると おぼえて、もどせる" do
    login_as("avmode")
    get root_path
    assert_select ".hm--town [data-controller=town][data-town-full-value=true]"
    assert_select "form[action='#{home_mode_path(mode: "simple")}']"

    patch home_mode_path(mode: "simple")
    assert_redirected_to root_path
    get root_path
    assert_response :success
    assert_select "[data-controller=town]", 0
    assert_select "nav.hm-menu:not([hidden])"
    assert_select "[data-town-place]", 4
    assert_select "form[action='#{home_mode_path(mode: "town")}']"
    get root_path
    assert_select "[data-controller=town]", 0, "つぎに 開いても かんたんメニュー の まま"

    patch home_mode_path(mode: "town")
    get root_path
    assert_select "[data-controller=town]"
    patch home_mode_path(mode: "<script>")
    get root_path
    assert_select "[data-controller=town]", 1, "へんな 値は まち"
  end

  test "🙏 クレジット：ログインしなくても 見られる・トップから リンク" do
    get credits_path
    assert_response :success
    assert_select ".cr-credit", text: "Assets - From : Sprout Lands - By : Cup Nooble"
    login_as("avcredit")
    get root_path
    assert_select "a[href='#{credits_path}']"
  end

  test "💇 髪型（hs）：アンダーバー つきの id も 保存できる" do
    user = login_as("avhs")
    patch avatar_path, params: { avatar: { hs: "pattsun_long", hair: "bob" } }, as: :json
    assert_response :success
    assert_equal "pattsun_long", user.reload.avatar["hs"]
    patch avatar_path, params: { avatar: { hs: "_bad", acc: "Crown" } }, as: :json
    assert_equal "pattsun_long", user.reload.avatar["hs"], "へんな 値は すてる（前の まま）"
  end
end
