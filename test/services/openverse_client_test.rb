require "test_helper"

class OpenverseClientTest < ActiveSupport::TestCase
  ITEM = {
    id: "8ca3e30d-b3a0-4909-877a-e1d28f58d0d8",
    title: "Rose",
    creator: "RoRo",
    creator_url: "https://commons.wikimedia.org/wiki/User:RoRo",
    foreign_landing_url: "https://commons.wikimedia.org/w/index.php?curid=27200232",
    license: "cc0",
    license_label: "CC0 1.0",
    license_url: "https://creativecommons.org/publicdomain/zero/1.0/",
    thumb_ok: true,
    provider: "wikimedia",
    attribution: "\"Rose\" by RoRo is marked with CC0 1.0."
  }.freeze

  test "内側のネットワークのアドレスは取りに行かない" do
    %w[127.0.0.1 10.0.0.5 172.16.0.1 192.168.1.1 169.254.169.254 0.0.0.0 100.64.0.1 ::1 fc00::1 fe80::1 ::ffff:127.0.0.1].each do |ip|
      assert_not OpenverseClient.public_address?(ip), "#{ip} は内側のはず"
    end
    %w[8.8.8.8 151.101.1.140 2606:4700::1111].each do |ip|
      assert OpenverseClient.public_address?(ip), "#{ip} は外側のはず"
    end
    assert_not OpenverseClient.public_address?("not-an-ip")
  end

  test "素材に入れる値に引用元とライセンスが入る" do
    attrs = OpenverseClient.material_attributes(ITEM)
    assert_equal "Rose", attrs[:name]
    assert_equal "RoRo（wikimedia）", attrs[:source_name]
    assert_equal ITEM[:foreign_landing_url], attrs[:source_url]
    assert_includes attrs[:license_note], "ライセンス：CC0 1.0"
    assert_includes attrs[:license_note], "サムネ・MV どちらもOK"
    assert_includes attrs[:license_note], OpenverseClient.marker(ITEM[:id])
  end

  test "CC BY は作者の表記が必要と書く" do
    attrs = OpenverseClient.material_attributes(ITEM.merge(license: "by", license_label: "CC BY 4.0", thumb_ok: false))
    assert_includes attrs[:license_note], "作者の表記が必要"
    assert_includes attrs[:license_note], "クレジット：\"Rose\" by RoRo"
  end

  test "長すぎるURLや http でないURLは引用元URLに入れない" do
    assert_nil OpenverseClient.material_attributes(ITEM.merge(foreign_landing_url: "https://example.com/#{'a' * 300}"))[:source_url]
    assert_nil OpenverseClient.material_attributes(ITEM.merge(foreign_landing_url: "javascript:alert(1)"))[:source_url]
  end

  test "作者がわからないときは出どころだけ" do
    assert_equal "wikimedia", OpenverseClient.source_name(ITEM.merge(creator: ""))
    assert_equal "Openverse", OpenverseClient.source_name(ITEM.merge(creator: "", provider: ""))
  end

  test "SA・NC・ND のライセンスは取り込めない" do
    client = OpenverseClient.new
    %w[by-sa by-nc by-nd by-nc-sa].each do |license|
      assert_not client.send(:allowed?, { license: license }), "#{license} は取り込めないはず"
    end
    %w[cc0 pdm by].each { |license| assert client.send(:allowed?, { license: license }) }
  end

  test "ID の形がおかしいときは API に聞かない" do
    assert_raises(OpenverseClient::Error) { OpenverseClient.new.fetch("../../etc/passwd") }
  end
end
