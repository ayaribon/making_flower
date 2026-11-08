FROM ruby:3.2.4

# ホスト側に合わせるUID/GID
ARG APP_UID=1000
ARG APP_GID=1000

# 必要なパッケージ
RUN apt-get update -qq && apt-get install -y \
  nodejs \
  yarn \
  default-mysql-client \
  libvips42 \
  && rm -rf /var/lib/apt/lists/*

# アプリ実行用ユーザーを作成
RUN groupadd --gid ${APP_GID} app \
    && useradd --uid ${APP_UID} --gid app --create-home --shell /bin/bash app

WORKDIR /app

# Gemをインストール
COPY Gemfile Gemfile.lock ./
RUN bundle install

# アプリケーションをコピー
COPY . .

# 実行時に必要なディレクトリ
RUN mkdir -p tmp/pids log storage \
    && chown -R app:app /app

EXPOSE 3000

# Railsは非rootユーザーで実行
USER app

CMD ["rails", "server", "-b", "0.0.0.0"]
