import "../../script/test-preload"
import { GlobalRegistrator } from "@happy-dom/global-registrator"
import { mock } from "bun:test"
import { installTestNetworkGuard } from "../../script/test-network"
import { parseTString } from "./scripts/parse-values"

GlobalRegistrator.register()
installTestNetworkGuard()

// Vite imports an image as its URL. Bun does as well until a test file has loaded CSS, after which
// it evaluates the image as a module (an SVG with no default export, a WebP as broken source), so
// resolve it to its path here.
Bun.plugin({
  name: "image-as-url",
  setup(build) {
    build.onLoad({ filter: /\.(svg|webp|png|jpe?g|gif|avif)$/ }, (args) => ({
      contents: `export default ${JSON.stringify(args.path)}`,
      loader: "js",
    }))
  },
})

// Packaged skill icons are enumerated with `import.meta.glob`, which only exists
// inside a Vite build — evaluating that module under the test runtime throws and
// takes every importer down with it. Tests that assert on icon URLs replace this
// mock with one of their own.
mock.module("@/components/skills/skill-icon-assets", () => ({
  resolveSkillIconURL: () => undefined,
}))

const originalGetContext = HTMLCanvasElement.prototype.getContext

type TTestCanvas2dContext = {
  beginPath: () => void
  canvas: HTMLCanvasElement
  clearRect: () => void
  closePath: () => void
  drawImage: () => void
  fill: () => void
  fillRect: () => void
  fillText: () => void
  lineTo: () => void
  measureText: (text: string) => { width: number }
  moveTo: () => void
  restore: () => void
  save: () => void
  stroke: () => void
  strokeRect: () => void
  strokeText: () => void
}

function createTestCanvas2dContext(canvas: HTMLCanvasElement): TTestCanvas2dContext {
  return {
    beginPath: () => {},
    canvas,
    clearRect: () => {},
    closePath: () => {},
    drawImage: () => {},
    fill: () => {},
    fillRect: () => {},
    fillText: () => {},
    lineTo: () => {},
    measureText: (text: string) => ({ width: text.length * 8 }),
    moveTo: () => {},
    restore: () => {},
    save: () => {},
    stroke: () => {},
    strokeRect: () => {},
    strokeText: () => {},
  }
}

HTMLCanvasElement.prototype.getContext = new Proxy(originalGetContext, {
  apply(target, thisArg, argArray) {
    const contextType = argArray[0]
    const options = argArray[1]
    if (parseTString(contextType) === "2d" && thisArg instanceof HTMLCanvasElement) {
      return createTestCanvas2dContext(thisArg)
    }
    return target.call(thisArg, contextType, options)
  },
})
