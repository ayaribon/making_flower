# 使用するベースイメージ
FROM ruby:3.0.2

# 必要なパッケージのインストール
RUN apt-get update -qq && apt-get install -y \
  nodejs \
  yarn \
  default-mysql-client \
  && rm -rf /var/lib/apt/lists/*

# 作業ディレクトリの設定
WORKDIR /app

# Gemfileのコピーとbundle install
COPY Gemfile Gemfile.lock ./
RUN bundle install

# アプリのソースコードをコピー
COPY . .

# ポートの公開
EXPOSE 3000

# デフォルトのコマンド
CMD ["rails", "server", "-b", "0.0.0.0"]
