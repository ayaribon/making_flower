require "test_helper"
require "tmpdir"
require "minitest/mock"

# 🌱 買った 素材の 画像（GameAsset。テストでは 手元の フォルダに 小さな PNG を 置く）
class GameAssetsControllerTest < ActionDispatch::IntegrationTest
  PNG = "\x89PNG\r\n\x1a\n".b + "fake".b

  setup do
    @dir = Pathname.new(Dir.mktmpdir("sprout"))
    @old_root = GameAsset.local_root
    GameAsset.local_root = @dir
    GameAsset.reset!
  end

  teardown do
    GameAsset.local_root = @old_root
    GameAsset.reset!
    FileUtils.rm_rf(@dir)
  end

  def put(key, data = PNG)
    file = @dir.join(GameAsset::SPROUT.fetch(key))
    FileUtils.mkdir_p(file.dirname)
    File.binwrite(file, data)
  end

  def login_as(name)
    user = User.new(name: name)
    post login_path, params: { login_code: user.issue_login_code! }
  end

  test "ログインしていないと 見られない" do
    put("grass")
    get sprout_asset_path("grass")
    assert_redirected_to login_path
  end

  test "ある 画像は PNG で 出す（この人だけ キャッシュ）" do
    put("grass")
    login_as("assetok")
    get sprout_asset_path("grass")
    assert_response :success
    assert_equal "image/png", response.media_type
    assert_equal PNG, response.body.b
    assert_includes response.headers["Cache-Control"], "private"
    assert_equal "nosniff", response.headers["X-Content-Type-Options"]
  end

  test "知らない キー・ない 画像は 404" do
    login_as("assetng")
    get sprout_asset_path("evil")
    assert_response :not_found
    get sprout_asset_path("soil")
    assert_response :not_found
  end

  # 本番の S3 の かわり（ActiveStorage の S3 と 同じ 呼び方：bucket・exist?・download）
  class FakeS3
    def initialize(files) = @files = files
    def bucket = :fake
    def exist?(key) = @files.key?(key)
    def download(key) = @files.fetch(key)
  end

  test "本番：S3 の game_assets/sprout_lands/ の 下から 読む（手元に なくても）" do
    files = GameAsset::SPROUT.values.to_h { |path| ["game_assets/#{path}", PNG] }
    ActiveStorage::Blob.stub(:service, FakeS3.new(files)) do
      assert GameAsset.available?
      assert_equal PNG, GameAsset.read("well")
      login_as("assets3")
      get sprout_asset_path("chicken")
      assert_response :success
      assert_equal PNG, response.body.b
    end
    GameAsset.reset!
    ActiveStorage::Blob.stub(:service, FakeS3.new(files.except(files.keys.first))) do
      assert_not GameAsset.available?, "1まい でも 足りなければ 出さない"
    end
  end

  test "開発：AWS の 鍵と S3_BUCKET が あれば、ActiveStorage が 手元でも S3 から 読む" do
    files = GameAsset::SPROUT.values.to_h { |path| ["game_assets/#{path}", PNG] }
    saved = ENV.to_h.slice("S3_BUCKET", "AWS_ACCESS_KEY_ID")
    registry = Object.new
    registry.define_singleton_method(:fetch) { |name| name == :amazon ? FakeS3.new(files) : raise(KeyError) }
    begin
      ENV["S3_BUCKET"] = "test-bucket"
      ENV["AWS_ACCESS_KEY_ID"] = "test-key"
      ActiveStorage::Blob.stub(:services, registry) do
        assert GameAsset.available?
        assert_equal PNG, GameAsset.read("trees")
      end
      GameAsset.reset!
      ENV.delete("S3_BUCKET")
      assert_not GameAsset.available?, "鍵が なければ S3 は 見ない"
    ensure
      %w[S3_BUCKET AWS_ACCESS_KEY_ID].each { |k| saved.key?(k) ? ENV[k] = saved[k] : ENV.delete(k) }
    end
  end

  test "町：ぜんぶ そろったときだけ 画像の URL を わたす" do
    login_as("assettown")
    GameAsset::SPROUT.keys.first(3).each { |key| put(key) }
    get root_path
    assert_equal({}, JSON.parse(css_select("[data-controller=town]").first["data-town-sprites-value"]))

    GameAsset::SPROUT.each_key { |key| put(key) }
    GameAsset.reset!
    get root_path
    sprites = JSON.parse(css_select("[data-controller=town]").first["data-town-sprites-value"])
    assert_equal GameAsset::SPROUT.keys.sort, sprites.keys.sort
    assert_equal sprout_asset_path("grass", v: GameAsset.version), sprites["grass"]
  end

  test "画像を さしかえたら：確かめなおした あとは 新しい 中身・URL の しるし v も かわる（ブラウザに 古い 画像が のこらない）" do
    put("grass", "old")
    GameAsset.reset!
    assert_equal "old", GameAsset.read("grass")
    v1 = GameAsset.version
    put("grass", "new")
    travel GameAsset::CHECK_EVERY + 1.second do
      GameAsset.present_keys
      assert_equal "new", GameAsset.read("grass")
      assert_not_equal v1, GameAsset.version
    end
  end
end
