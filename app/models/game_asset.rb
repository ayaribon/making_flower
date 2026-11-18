require "concurrent/map"

# 🌱 買った 素材（Sprout Lands - premium pack。作者 Cup Nooble）を 町に 出す。docs/town/requirements.md の 4.5
# 素材パックは 配るのが 禁止なので、公開リポジトリには 入れない。DB も 使わない（N2）
#   本番：S3（ActiveStorage と 同じ バケット。Heroku の S3_BUCKET）の game_assets/ の 下（sprout_lands/・sprout_sorry/）
#   手元：private_assets/ の 下（.gitignore 済み）。なければ、AWS の 鍵（.env）が あれば 開発でも S3 から 読む
#   どちらも 素材パックの 中の 形のまま 置く（Animals・Characters・Objects・Tilesets・read_me.txt が ある フォルダの 中身）
# 画面には ログインした人にだけ 出す（GameAssetsController）。そろっていなければ 町は 前の コードで 描く 絵
class GameAsset
  S3_PREFIX = "game_assets/"
  # キー → 素材パックの 中の 場所。キーは app/javascript/town_sprout.js の SPROUT_FILES と そろえる
  SPROUT = {
    "grass" => "sprout_lands/Tilesets/ground tiles/New tiles/Grass_Tile_Layers.png",
    "soil" => "sprout_lands/Tilesets/ground tiles/New tiles/Soil_Ground_Tiles.png",
    "trees" => "sprout_lands/Objects/Trees, stumps and bushes.png",
    "flowers" => "sprout_lands/Objects/Mushrooms, Flowers, Stones.png",
    "fences" => "sprout_lands/Tilesets/Building parts/Fences.png",
    "well" => "sprout_lands/Objects/Water well.png",
    "signs" => "sprout_lands/Objects/signs.png",
    "chicken" => "sprout_lands/Animals/Chicken/chicken default.png",
    "chara" => "sprout_lands/Characters/Premium Charakter Spritesheet.png", # 🐱 Teemo 型の アバター（なくても 町は 出る）
    # 🧑 人の テンプレート（Sprout Sorry pack。非商用 ライセンス。この アプリは 非商用 と ayaribon が 判断。2026-11-18）
    "human" => "sprout_sorry/Tests/free_character_spritesheet_by-cupnooble.png"
  }.merge(
    # 💇 髪の パーツ（docs/town/hair_parts_spec.md。人の テンプレートに 重ねる）
    %w[short_bob blunt_bob long_straight twin_tails ponytail braids wolf_cut].flat_map do |stem|
      %w[back front].map { |side| ["hair_#{stem}_#{side}", "sprout_hair/#{stem}_#{side}.png"] }
    end.to_h
  ).freeze
  HAIR_KEYS = SPROUT.keys.grep(/\Ahair_/).freeze
  # なくても 町を 出せる もの（なければ アバターは 前の 絵）
  OPTIONAL = (%w[chara human] + HAIR_KEYS).freeze
  # そろっているか を 確かめなおす 間かく（S3 に 上げてから 町に 出るまで、長くて この 時間）
  CHECK_EVERY = 10.minutes

  class_attribute :local_root, default: Rails.root.join("private_assets")

  @bytes = Concurrent::Map.new
  @lock = Mutex.new

  class << self
    # その キーの 画像（PNG の 中身）。なければ nil。読めたものは おぼえておく（ぜんぶで 30KB くらい）
    def read(key)
      path = SPROUT[key.to_s]
      return nil unless path

      @bytes[key.to_s] ||= read_local(path) || read_s3(path)
    end

    # 町に いる もの（OPTIONAL いがい）が ぜんぶ そろっているか（CHECK_EVERY ごとに 確かめなおす）
    def available?
      present_keys.superset?((SPROUT.keys - OPTIONAL).to_set)
    end

    # ある キー（CHECK_EVERY ごとに 確かめなおす）
    def present_keys
      @lock.synchronize do
        if @checked_at.nil? || Time.current - @checked_at > CHECK_EVERY
          @present = SPROUT.select { |_key, path| exist_local?(path) || exist_s3?(path) }.keys.to_set
          @checked_at = Time.current
        end
        @present
      end
    end

    # テスト用：おぼえている ものを わすれる
    def reset!
      @bytes = Concurrent::Map.new
      @s3 = nil
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

    # S3：本番は ActiveStorage の S3 そのもの。開発でも AWS の 鍵と S3_BUCKET が あれば、storage.yml の amazon で 読む
    def s3
      service = ActiveStorage::Blob.service
      return service if service.respond_to?(:bucket)
      return nil if ENV["S3_BUCKET"].blank? || ENV["AWS_ACCESS_KEY_ID"].blank?

      @s3 ||= ActiveStorage::Blob.services.fetch(:amazon)
    rescue StandardError => e
      Rails.logger.warn("[GameAsset] S3: #{e.class}")
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
