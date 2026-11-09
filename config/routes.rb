Rails.application.routes.draw do
  # 🏠 ログイン後のトップ＝メインメニュー（🎤歌ってみた／🎨サムネ・背景）。編集画面は /editor
  root "homes#show"
  get "home", to: "homes#show"

  get    "login",  to: "sessions#new"
  post   "login",  to: "sessions#create"
  delete "logout", to: "sessions#destroy"

  resources :user_images, only: [:index, :create, :show, :destroy] do
    member do
      get :thumb
      put :thumb, action: :update_thumb
    end
  end

  namespace :admin do
    resources :users, only: [:index, :new, :create, :destroy] do
      post :reissue, on: :member
    end
    resources :materials, except: [:show] do
      patch :toggle, on: :member
    end
    resources :design_templates, only: [:index, :create, :edit, :update, :destroy] do
      patch :toggle, on: :member
      post :duplicate, on: :member
    end
  end

  # 編集画面のテンプレ一覧（JSON）
  resources :design_templates, only: [:index], defaults: { format: :json }
  # マイテンプレート（本人のものだけ）
  resources :user_templates, only: [:index, :create, :update, :destroy], defaults: { format: :json }

  resources :templates, only: [:index, :show] do
    get :edit, on: :member
  end
  get "editor", to: "editors#show"
  # 🎤 歌ってみた（オケ＋歌声を混ぜて動画にする）
  get "singing", to: "singings#show"
  # 💾 歌ってみたのプロジェクト・画像編集の下書き（アカウントに保存・本人のものだけ・K39）
  resources :singing_projects, only: [:index, :show, :update, :destroy], defaults: { format: :json } do
    member do
      post :files, action: :upload_file
      post :prune
    end
  end
  resource :editor_draft, only: [:show, :update, :destroy], defaults: { format: :json }
  # 💾 ミックス設定のテンプレート（アカウントに保存・本人のものだけ・K42）
  resources :mix_templates, only: [:index, :create, :update, :destroy], defaults: { format: :json }
  get "up" => "rails/health#show", as: :rails_health_check
end
