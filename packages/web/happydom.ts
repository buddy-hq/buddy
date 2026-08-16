import { GlobalRegistrator } from "@happy-dom/global-registrator"
import { mock } from "bun:test"
import { parseTString } from "./scripts/parse-values"

GlobalRegistrator.register()

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
    const contextType = parseTString(argArray[0])
    if (contextType === "2d" && thisArg instanceof HTMLCanvasElement) {
      return createTestCanvas2dContext(thisArg)
    }
    if (contextType === undefined) {
      return null
    }
    return target.call(thisArg, contextType, argArray[1])
  },
})
