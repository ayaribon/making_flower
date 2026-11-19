// Import and register all your controllers from the importmap via controllers/**/*_controller
import { application } from "controllers/application"
// 🚀 画面に data-controller が 出てきた ときに その controller だけ 読む（ぜんぶ 先に 読むと 重い。2026-11-19）
import { lazyLoadControllersFrom } from "@hotwired/stimulus-loading"
lazyLoadControllersFrom("controllers", application)
