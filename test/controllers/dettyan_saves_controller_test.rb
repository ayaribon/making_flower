require "test_helper"

# 🧑‍💼 Dettyan のセーブ：本人のものだけ読み書きでき、上書きしてもデプロイしても消えない（DB に残る）
class DettyanSavesControllerTest < ActionDispatch::IntegrationTest
  setup do
    @user = User.new(name: "dettyantest")
    @code = @user.issue_login_code!
  end

  def log_in(code = @code)
    post login_path, params: { login_code: code }
  end

  test "ログインしていないと読めない" do
    get dettyan_save_path
    assert_redirected_to login_path
  end

  test "はじめはセーブがなく、サーバーの時計を返す" do
    log_in
    get dettyan_save_path
    assert_response :success
    body = response.parsed_body
    assert_nil body["save"]
    assert_kind_of Integer, body["serverNow"]
  end

  test "保存して読み直せる・上書きできる" do
    log_in
    put dettyan_save_path, params: { data: { version: 1, money: 10 }.to_json }
    assert_response :success
    put dettyan_save_path, params: { data: { version: 1, money: 25 }.to_json }
    assert_response :success
    assert_equal 1, DettyanSave.where(user: @user).count

    get dettyan_save_path
    assert_equal 25, response.parsed_body["save"]["money"]
  end

  test "ほかの人のセーブは見えない" do
    log_in
    put dettyan_save_path, params: { data: { version: 1, money: 99 }.to_json }

    other = User.new(name: "othertest")
    other_code = other.issue_login_code!
    delete logout_path
    log_in(other_code)
    get dettyan_save_path
    assert_nil response.parsed_body["save"]
  end

  test "version のないセーブ・読めないセーブ・大きすぎるセーブは断る" do
    log_in
    put dettyan_save_path, params: { data: { money: 1 }.to_json }
    assert_response :unprocessable_entity
    put dettyan_save_path, params: { data: "{こわれた" }
    assert_response :unprocessable_entity
    put dettyan_save_path, params: { data: { version: 1, pad: "x" * DettyanSave::MAX_BYTES }.to_json }
    assert_response :payload_too_large
    assert_nil @user.reload.dettyan_save
  end
end
