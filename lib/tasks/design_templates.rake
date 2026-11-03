namespace :design_templates do
  # public/design_templates/templates.json のテンプレを、管理画面の「📋 テンプレ」に入れる。
  # 元の id（slug）で見分けるので、何回打っても増えない。
  # すでに入っているテンプレは、管理画面で直した分を消さないように、上書きしない。
  desc "templates.json のテンプレを、データベース（DesignTemplate）に入れる"
  task import: :environment do
    path = DesignTemplate::SEED_PATH
    unless File.exist?(path)
      puts "見つからない：#{path}（もう全部入っているなら、このままでOK）"
      next
    end

    data = JSON.parse(File.read(path))
    list = data.is_a?(Hash) ? Array(data["templates"]) : Array(data)
    meta = %w[id label icon ratio width height]

    list.each_with_index do |t, index|
      slug = t["id"].to_s
      if DesignTemplate.exists?(slug: slug)
        puts "飛ばした（登録済み）：#{t['label']}"
        next
      end

      template = DesignTemplate.new(
        slug: slug,
        name: t["label"].to_s.first(40),
        icon: t["icon"].presence || "📋",
        ratio: t["ratio"],
        position: index * 10,
        visible: true
      )
      template.data = t.except(*meta)
      if template.save
        puts "登録した：#{template.icon} #{template.name}（#{template.ratio}）"
      else
        puts "⚠️ 登録できなかった：#{t['label']}（#{template.errors.full_messages.join('／')}）"
      end
    end

    missing = Material.template_usage.keys - Material.where.not(key: nil).pluck(:key)
    if missing.any?
      puts "⚠️ テンプレで使っているのに見つからない素材：#{missing.join(', ')}（先に rails materials:import_builtin を打ってね）"
    else
      puts "✅ テンプレで使う素材は全部そろってます"
    end
  end
end
