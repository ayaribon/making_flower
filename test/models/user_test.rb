require "test_helper"

class UserTest < ActiveSupport::TestCase
  # 🧑‍💼 Dettyan 本人のアカウントかどうか（育成ゲームで「俺やん」と言う）
  test "呼び名が dettyan なら本人（大文字・小文字は関係ない）" do
    assert User.new(name: "dettyan").dettyan_owner?
    assert User.new(name: "Dettyan").dettyan_owner?
    assert_not User.new(name: "dettyan2").dettyan_owner?
    assert_not User.new(name: "ayaribon").dettyan_owner?
  end

  test "DETTYAN_OWNER_NAMES で本人の呼び名を変えられる" do
    before = ENV["DETTYAN_OWNER_NAMES"]
    ENV["DETTYAN_OWNER_NAMES"] = "detchan, Boss"
    assert User.new(name: "detchan").dettyan_owner?
    assert User.new(name: "boss").dettyan_owner?
    assert_not User.new(name: "dettyan").dettyan_owner?
  ensure
    ENV["DETTYAN_OWNER_NAMES"] = before
  end
end
