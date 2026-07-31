import { GlobalRegistrator } from "@happy-dom/global-registrator"
import { mock } from "bun:test"

GlobalRegistrator.register()

// Packaged skill icons are enumerated with `import.meta.glob`, which only exists
// inside a Vite build — evaluating that module under the test runtime throws and
// takes every importer down with it. Tests that assert on icon URLs replace this
// mock with one of their own.
mock.module("@/components/skills/skill-icon-assets", () => ({
  resolveSkillIconURL: () => undefined,
}))

const originalGetContext = HTMLCanvasElement.prototype.getContext

// @ts-expect-error 2d mock is intentionally partial for test runtime
HTMLCanvasElement.prototype.getContext = function (contextType: string, options?: unknown) {
  if (contextType === "2d") {
    return {
      canvas: this,
      fillRect: () => {},
      strokeRect: () => {},
      clearRect: () => {},
      fillText: () => {},
      strokeText: () => {},
      measureText: (text: string) => ({ width: text.length * 8 }),
      drawImage: () => {},
      save: () => {},
      restore: () => {},
      beginPath: () => {},
      closePath: () => {},
      moveTo: () => {},
      lineTo: () => {},
      fill: () => {},
      stroke: () => {},
    } as unknown as CanvasRenderingContext2D
  }
  return originalGetContext.call(this, contextType as "2d", options)
}
