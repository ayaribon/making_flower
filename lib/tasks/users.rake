namespace :users do
  MEMBERS = %w[Dettyan Naname Nachi Kuon Okuba Tetto].freeze

  desc "最初のユーザー（Admin と6人）を作って、ログインIDを表示する（すでにいる人は飛ばす）"
  task setup: :environment do
    rows = []

    (["Admin"] + MEMBERS).each do |name|
      if User.exists?(name: name)
        rows << [name, "（作成済み。IDを作り直すなら users:reissue[#{name}]）"]
        next
      end

      user = User.new(name: name, admin: name == "Admin", login_digest: "pending-#{SecureRandom.hex(8)}")
      user.save!
      rows << [name, user.issue_login_code!]
    end

    puts "=== ログインID（この画面でしか表示されません。控えてください） ==="
    rows.each { |name, code| puts "#{name.ljust(8)} #{code}" }
  end

  desc "ログインIDを作り直す（例：bin/rails 'users:reissue[Kuon]'）。古いIDは使えなくなる"
  task :reissue, [:name] => :environment do |_t, args|
    user = User.find_by!(name: args[:name])
    puts "#{user.name}: #{user.issue_login_code!}"
  end
end
