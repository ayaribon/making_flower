require "concurrent/map"

# 🌱 買った 素材（Sprout Lands - premium pack。作者 Cup Nooble）を 町に 出す。docs/town/requirements.md の 4.5
# 素材パックは 配るのが 禁止なので、公開リポジトリには 入れない。DB も 使わない（N2）
#   本番：S3（ActiveStorage と 同じ バケット。Heroku の S3_BUCKET）の game_assets/sprout_lands/ の 下
#   手元：private_assets/sprout_lands/ の 下（.gitignore 済み）
#   どちらも 素材パックの 中の 形のまま 置く（Animals・Characters・Objects・Tilesets・read_me.txt が ある フォルダの 中身）
# 画面には ログインした人にだけ 出す（GameAssetsController）。そろっていなければ 町は 前の コードで 描く 絵
class GameAsset
  S3_PREFIX = "game_assets/sprout_lands/"
  # キー → 素材パックの 中の 場所。キーは app/javascript/town_sprout.js の SPROUT_FILES と そろえる
  SPROUT = {
    "grass" => "Tilesets/ground tiles/New tiles/Grass_Tile_Layers.png",
    "soil" => "Tilesets/ground tiles/New tiles/Soil_Ground_Tiles.png",
    "trees" => "Objects/Trees, stumps and bushes.png",
    "flowers" => "Objects/Mushrooms, Flowers, Stones.png",
    "fences" => "Tilesets/Building parts/Fences.png",
    "well" => "Objects/Water well.png",
    "signs" => "Objects/signs.png",
    "chicken" => "Animals/Chicken/chicken default.png"
  }.freeze
  # そろっているか を 確かめなおす 間かく（S3 に 上げてから 町に 出るまで、長くて この 時間）
  CHECK_EVERY = 10.minutes

  class_attribute :local_root, default: Rails.root.join("private_assets/sprout_lands")

  @bytes = Concurrent::Map.new
  @lock = Mutex.new

  class << self
    # その キーの 画像（PNG の 中身）。なければ nil。読めたものは おぼえておく（ぜんぶで 30KB くらい）
    def read(key)
      path = SPROUT[key.to_s]
      return nil unless path

      @bytes[key.to_s] ||= read_local(path) || read_s3(path)
    end

    # 8まい ぜんぶ そろっているか（CHECK_EVERY ごとに 確かめなおす）
    def available?
      @lock.synchronize do
        if @checked_at.nil? || Time.current - @checked_at > CHECK_EVERY
          @available = SPROUT.values.all? { |path| exist_local?(path) || exist_s3?(path) }
          @checked_at = Time.current
        end
        @available
      end
    end

    # テスト用：おぼえている ものを わすれる
    def reset!
      @bytes = Concurrent::Map.new
      @lock.synchronize { @checked_at = nil }
    end

    private

    def local_file(path)
      local_root.join(path)
    end

    def exist_local?(path)
      local_file(path).file?
    end

    def read_local(path)
      file = local_file(path)
      file.file? ? file.binread : nil
    end

    # 本番だけ（ActiveStorage が S3 の とき）
    def s3
      service = ActiveStorage::Blob.service
      service.respond_to?(:bucket) ? service : nil
    rescue StandardError
      nil
    end

    def exist_s3?(path)
      s3&.exist?(S3_PREFIX + path) || false
    rescue StandardError => e
      Rails.logger.warn("[GameAsset] S3 exist? #{path}: #{e.class}")
      false
    end

    def read_s3(path)
      s3&.download(S3_PREFIX + path)
    rescue StandardError => e
      Rails.logger.warn("[GameAsset] S3 download #{path}: #{e.class}")
      nil
    end
  end
end
