// 🧪 区画「dettyan」の Stimulus（サンプル）。画面では data-controller="lab--dettyan--hello"
import { Controller } from "@hotwired/stimulus"
import { greeting } from "lab/dettyan/greeting"

export default class extends Controller {
  static targets = ["output"]

  connect() {
    this.outputTarget.textContent = greeting("dettyan")
  }
}
