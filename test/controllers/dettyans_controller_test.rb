require "test_helper"

# 🧑‍💼 Dettyan の画面：おせわのメニューとショップ・もちもののボタンがある
class DettyansControllerTest < ActionDispatch::IntegrationTest
  test "ログインしていないと開けない" do
    get dettyan_path
    assert_redirected_to login_path
  end

  test "おせわのメニューとショップがある" do
    user = User.new(name: "dettyanpage")
    post login_path, params: { login_code: user.issue_login_code! }
    get dettyan_path
    assert_response :success
    assert_select "[data-dettyan-game-target=menu] button", 4
    assert_select "[data-action='dettyan-game#openShop']"
    assert_select "[data-action='dettyan-game#openBag']"
    assert_select "[data-action='dettyan-game#openQuest']"
    assert_select "[data-dettyan-game-target=sheet]"
  end
end
