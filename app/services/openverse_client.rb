require "net/http"
require "json"
require "resolv"
require "ipaddr"
require "stringio"

# Openverse（CC ライセンスの画像をまとめて探せる API・https://openverse.org）から
# 素材の候補を探して、管理画面の「素材」に取り込むためのもの。
#
# - API キーなしで使う（回数の制限はゆるめにかかる）
# - 取り込めるのは「再配布OK・改変OK・商用OK」のライセンスだけ（CC0／パブリックドメイン／CC BY）
#   CC BY-SA・NC・ND は、サムネや MV に使うと条件を守れないことがあるので出さない
class OpenverseClient
  API_BASE = "https://api.openverse.org/v1".freeze
  # 個人の情報は入れない（アプリ名だけ）
  USER_AGENT = "KotoBouquet-admin-import/1.0".freeze
  TIMEOUT = 10
  MAX_REDIRECTS = 3
  PAGE_SIZE = 20
  # API キーなしだと、深いページまでは見られない
  MAX_PAGES = 12

  # 取り込んでよいライセンス
  #   thumb: サムネ（編集画面）に使えるか。書き出した PNG に作者名を毎回入れられないので、表記が要るものは使わない
  LICENSES = {
    "cc0" => { label: "CC0", thumb: true },
    "pdm" => { label: "パブリックドメイン", thumb: true },
    "by"  => { label: "CC BY", thumb: false }
  }.freeze

  # 検索画面の「ライセンス」の選びかた
  LICENSE_GROUPS = {
    "free"   => { label: "CC0・パブリックドメイン（サムネにも使える）", licenses: %w[cc0 pdm] },
    "credit" => { label: "CC BY（作者の表記が要る・MV向け）", licenses: %w[by] }
  }.freeze

  CATEGORIES = {
    "illustration"      => "イラスト",
    "digitized_artwork" => "絵画・版画",
    "photograph"        => "写真",
    ""                  => "すべて"
  }.freeze

  # SVG は中にスクリプトを入れられるので、外から取り込むときは使わない
  IMPORT_CONTENT_TYPES = (Material::CONTENT_TYPES - ["image/svg+xml"]).freeze
  EXTENSIONS = { "image/png" => "png", "image/jpeg" => "jpg", "image/webp" => "webp", "image/gif" => "gif" }.freeze

  ID_FORMAT = /\A[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\z/

  class Error < StandardError; end

  # 素材（Material）のライセンスのメモに入れる目印。取り込み済みかどうかを見分けるのに使う
  def self.marker(id)
    "openverse:#{id}"
  end

  # 取り込み済みの Openverse の ID（{ "ID" => Material } の形）
  def self.imported_materials(ids)
    ids = Array(ids).grep(ID_FORMAT)
    return {} if ids.empty?
    conditions = ids.map { "license_note LIKE ?" }.join(" OR ")
    values = ids.map { |id| "%#{Material.sanitize_sql_like(marker(id))}%" }
    Material.where(conditions, *values).each_with_object({}) do |m, map|
      ids.each { |id| map[id] = m if m.license_note.to_s.include?(marker(id)) }
    end
  end

  # 探す。返すのは { results: [...], page:, pages:, total: }
  def search(q:, group: "free", category: "illustration", page: 1)
    licenses = LICENSE_GROUPS.fetch(group, LICENSE_GROUPS["free"])[:licenses]
    # SVG は取り込めないので、はじめから出さない
    params = { q: q.to_s.strip, license: licenses.join(","), extension: "jpg,png,gif,webp",
               page_size: PAGE_SIZE, page: page.to_i.clamp(1, MAX_PAGES) }
    params[:category] = category if category.present? && CATEGORIES.key?(category)
    json = get_json("#{API_BASE}/images/?#{URI.encode_www_form(params)}")

    total = json["result_count"].to_i
    {
      results: Array(json["results"]).map { |r| normalize(r) }.select { |r| allowed?(r) },
      page: params[:page],
      pages: [[json["page_count"].to_i, 1].max, MAX_PAGES].min,
      total: total
    }
  end

  # 1件の詳しい情報。取り込むときは画面から送られた値を信じず、ここで取り直す
  def fetch(id)
    raise Error, "素材のIDが正しくありません" unless id.to_s.match?(ID_FORMAT)
    item = normalize(get_json("#{API_BASE}/images/#{id}/"))
    raise Error, "このライセンス（#{item[:license_label]}）の素材は取り込めません" unless allowed?(item)
    item
  end

  # 画像を取ってくる。返すのは [StringIO, content_type, ファイル名]
  def download(url, max_bytes: Material::MAX_SIZE)
    body = request(url, accept: "image/*", max_bytes: max_bytes)
    io = StringIO.new(body)
    type = Marcel::MimeType.for(io)
    io.rewind
    raise Error, "この画像の形式（#{type}）は取り込めません。PNG・JPEG・WebP・GIF だけです" unless IMPORT_CONTENT_TYPES.include?(type)
    [io, type, "openverse.#{EXTENSIONS[type]}"]
  end

  # 素材（Material）に入れる値
  def self.material_attributes(item)
    {
      name: item[:title].presence&.truncate(40) || "Openverse の素材",
      source_name: source_name(item).truncate(255),
      # 列は255文字まで。長いURLは切ると壊れるので入れない（ライセンスのメモには全部残る）
      source_url: (item[:foreign_landing_url] if item[:foreign_landing_url].match?(%r{\Ahttps?://}) && item[:foreign_landing_url].length <= 255),
      license_note: license_note(item)
    }
  end

  # 「作者（出どころ）」の形。作者がわからないときは出どころだけ
  def self.source_name(item)
    creator = item[:creator].presence
    provider = item[:provider].presence
    return provider || "Openverse" unless creator
    provider ? "#{creator}（#{provider}）" : creator
  end

  def self.license_note(item)
    usage =
      if item[:thumb_ok]
        "使いかた：サムネ・MV どちらもOK（作者の表記はいらない）"
      else
        "使いかた：作者の表記が必要。サムネには使わない／MV ではエンドクレジットに下の「クレジット」を出す"
      end
    [
      "ライセンス：#{item[:license_label]}#{"（#{item[:license_url]}）" if item[:license_url].present?}",
      usage,
      ("クレジット：#{item[:attribution]}" if item[:attribution].present?),
      ("作者：#{item[:creator]}#{"（#{item[:creator_url]}）" if item[:creator_url].present?}" if item[:creator].present?),
      "出どころ：#{item[:provider]} #{item[:foreign_landing_url]}".strip,
      "取り込み：#{marker(item[:id])}（#{Date.current.iso8601}）"
    ].compact.join("\n")
  end

  # 内側のネットワーク（サーバー自身や社内の機械）には取りに行かない
  def self.public_address?(ip)
    addr = IPAddr.new(ip.to_s)
    addr = addr.native if addr.ipv4_mapped?
    return false if addr.loopback? || addr.private? || addr.link_local?
    return false if BLOCKED_RANGES.any? { |range| range.family == addr.family && range.include?(addr) }
    true
  rescue IPAddr::InvalidAddressError
    false
  end

  BLOCKED_RANGES = %w[0.0.0.0/8 100.64.0.0/10 192.0.0.0/24 198.18.0.0/15 224.0.0.0/3 ::/128 ::1/128 64:ff9b::/96 ff00::/8].map { |r| IPAddr.new(r) }.freeze

  private

  def allowed?(item)
    LICENSES.key?(item[:license])
  end

  def normalize(r)
    license = r["license"].to_s.downcase
    info = LICENSES[license]
    {
      id: r["id"].to_s,
      title: r["title"].to_s.strip,
      creator: r["creator"].to_s.strip,
      creator_url: r["creator_url"].to_s,
      url: r["url"].to_s,
      thumbnail: r["thumbnail"].to_s,
      foreign_landing_url: r["foreign_landing_url"].to_s,
      license: license,
      license_version: r["license_version"].to_s,
      license_label: [info ? info[:label] : license.upcase, r["license_version"].presence].compact.join(" "),
      license_url: r["license_url"].to_s,
      thumb_ok: info ? info[:thumb] : false,
      provider: (r["provider"].presence || r["source"]).to_s,
      attribution: r["attribution"].to_s.strip,
      filetype: r["filetype"].to_s,
      width: r["width"],
      height: r["height"]
    }
  end

  def get_json(url)
    JSON.parse(request(url, accept: "application/json", max_bytes: 2.megabytes))
  rescue JSON::ParserError
    raise Error, "Openverse から変な返事が来ました。少し待ってからやり直してください"
  end

  def request(url, accept:, max_bytes:, redirects_left: MAX_REDIRECTS)
    uri = URI.parse(url)
    raise Error, "http か https の画像だけ取り込めます" unless %w[http https].include?(uri.scheme) && uri.host.present?

    ip = resolve_public_ip(uri.host)
    http = Net::HTTP.new(uri.host, uri.port)
    http.ipaddr = ip          # 調べたアドレスにそのままつなぐ（途中で行き先を変えられないように）
    http.use_ssl = uri.scheme == "https"
    http.open_timeout = TIMEOUT
    http.read_timeout = TIMEOUT

    req = Net::HTTP::Get.new(uri.request_uri, "User-Agent" => USER_AGENT, "Accept" => accept)
    http.request(req) do |res|
      case res
      when Net::HTTPRedirection
        raise Error, "転送が多すぎます" if redirects_left <= 0
        next_url = URI.join(url, res["location"].to_s).to_s
        return request(next_url, accept: accept, max_bytes: max_bytes, redirects_left: redirects_left - 1)
      when Net::HTTPTooManyRequests
        raise Error, "Openverse を使いすぎました。しばらく待ってからやり直してください"
      when Net::HTTPNotFound
        raise Error, "見つかりませんでした（消された素材かもしれません）"
      when Net::HTTPSuccess
        if res["content-length"].to_i > max_bytes
          raise Error, "画像が大きすぎます（#{max_bytes / 1.megabyte}MBまで）"
        end
        body = +""
        res.read_body do |chunk|
          body << chunk
          raise Error, "画像が大きすぎます（#{max_bytes / 1.megabyte}MBまで）" if body.bytesize > max_bytes
        end
        return body
      else
        raise Error, "取りに行けませんでした（#{res.code}）"
      end
    end
  rescue Timeout::Error, SocketError, SystemCallError, OpenSSL::SSL::SSLError, Net::HTTPBadResponse => e
    raise Error, "つながりませんでした（#{e.class.name.demodulize}）。少し待ってからやり直してください"
  end

  def resolve_public_ip(host)
    ips = Resolv.getaddresses(host)
    raise Error, "#{host} が見つかりませんでした" if ips.empty?
    ip = ips.find { |a| self.class.public_address?(a) }
    raise Error, "内側のネットワークの画像は取り込めません" if ip.nil? || ips.any? { |a| !self.class.public_address?(a) }
    ip
  end
end
