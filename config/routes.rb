Rails.application.routes.draw do
  root "editors#show"

  get    "login",  to: "sessions#new"
  post   "login",  to: "sessions#create"
  delete "logout", to: "sessions#destroy"

  resources :user_images, only: [:index, :create, :show, :destroy]

  namespace :admin do
    resources :users, only: [:index, :new, :create, :destroy] do
      post :reissue, on: :member
    end
    resources :materials, except: [:show] do
      patch :toggle, on: :member
    end
  end

  resources :templates, only: [:index, :show] do
    get :edit, on: :member
  end
  get "editor", to: "editors#show"
  get "up" => "rails/health#show", as: :rails_health_check
end
